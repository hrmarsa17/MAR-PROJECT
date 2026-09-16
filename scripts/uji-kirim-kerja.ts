import './muat-env.js';

/**
 * KIRIM KERJA — jam yang dilaporkan mekanik.
 *
 * Yang dijaga di sini, dari ujung ke ujung:
 *   - daftar WO mekanik: dari keanggotaan tim, batal & ditolak tidak muncul
 *   - hitungan tab benar untuk tab yang BELUM dibuka
 *   - ringkas borongan dihitung atas SELURUH grup, bukan atas isi satu tab
 *   - kiriman ulang menjawab SUKSES, bukan "Gagal Kirim" merah
 *   - jam sesi sebelum transfer ikut dijumlahkan
 *   - HM & KM yang sudah terisi TIDAK dikosongkan oleh kiriman kerja
 *   - orang luar tim ditolak
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { woMekanik, hitunganTabMekanik } = await import('../src/domain/kueriWoMekanik.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function orang(peran: string, lewati: number[] = []) {
  const m = (
    await sql<{ id: number; tenant_id: number; name: string }[]>`
      SELECT id, tenant_id, name FROM mechanics
       WHERE role = ${peran} AND is_active AND is_test_account = false
         AND NOT (id = ANY(${lewati}::int[]))
       ORDER BY id LIMIT 1
    `
  )[0]!;
  const t = buatToken();
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return { ...m, token: t };
}

const l2 = await orang('superintendent');
const mek = await orang('mechanic');
const lain = await orang('mechanic', [mek.id]);
const TENANT = mek.tenant_id;

async function perintah(t: string, aksi: string, data: unknown, opId = crypto.randomUUID()) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` },
    body: JSON.stringify({ aksi, op_id: opId, data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; kode?: string;
    data?: { hasil: Record<string, unknown> };
  }>;
}

const dibuat: number[] = [];
async function buatWo(jumlah: number, grup = false) {
  /* Job yang BERBEDA untuk tiap baris. Grup mode 'unit' berarti satu unit
     dengan banyak pekerjaan, jadi job kembar di dalamnya memang ditolak — dua
     baris identik adalah dua WO yang akan dibayar dua kali untuk pekerjaan yang
     sama. Sebelum katalog sungguhan diimpor, kueri ini tidak menemukan job apa
     pun dan seluruh blok jatuh ke jalur manual, sehingga aturan itu tak pernah
     tersentuh — dan ia baru menggigit begitu katalognya terisi. */
  const job = await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
     WHERE s.code = 'workshop' AND j.is_active ORDER BY j.id LIMIT ${jumlah}
  `;
  const blok = Array.from({ length: jumlah }, (_, i) => ({
    ...(job[i] ? { jobId: Number(job[i]!.id) } : {
      manual: {
        description: `CONTOH kirim kerja ${i + 1}`,
        basePoints: 2, targetHours: 3, unitFactor: 1,
      },
    }),
    workCondition: 'normal', location: 'workshop', teamMechanicIds: [mek.id],
  }));
  const j = await perintah(l2.token, 'buat_wo', {
    sectionCode: 'workshop', blok,
    ...(grup ? { grup: { mode: 'unit' as const } } : {}),
  });
  if (!j.ok) throw new Error(`gagal membuat WO uji: ${j.pesan}`);
  const d = (j.data?.hasil['dibuat'] as { id: number }[]).map((x) => Number(x.id));
  dibuat.push(...d);
  return d;
}

const JAM = (mundurJam: number) =>
  new Date(Date.now() - mundurJam * 3_600_000).toISOString();

console.log('\n─── 1. daftar WO datang dari keanggotaan tim ───');
{
  const id = (await buatWo(1))[0]!;
  const daftar = await woMekanik(TENANT, mek.id, 'assigned');
  periksa('WO baru muncul di tab Assigned', daftar.some((w) => w.id === id));

  const punyaLain = await woMekanik(TENANT, lain.id, 'assigned');
  periksa('TIDAK muncul di daftar mekanik lain',
    !punyaLain.some((w) => w.id === id));

  const kartu = daftar.find((w) => w.id === id)!;
  periksa('dirinya sendiri ditandai di susunan tim',
    kartu.tim.some((t) => t.mechanicId === mek.id && t.akuSendiri));
  periksa('boleh dikirim', kartu.bolehKirim === true);
}

console.log('\n─── 2. hitungan tab benar untuk tab yang BELUM dibuka ───');
{
  const sebelum = await hitunganTabMekanik(TENANT, mek.id);
  const id = (await buatWo(1))[0]!;
  const sesudah = await hitunganTabMekanik(TENANT, mek.id);
  periksa('Assigned bertambah satu', sesudah.assigned === sebelum.assigned + 1,
    `${sebelum.assigned} → ${sesudah.assigned}`);

  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(2), endTime: JAM(0) });
  periksa('kiriman diterima', a.ok === true, a.pesan);

  const akhir = await hitunganTabMekanik(TENANT, mek.id);
  periksa('pindah dari Assigned ke Pending',
    akhir.assigned === sesudah.assigned - 1
      && akhir.pending_approval === sesudah.pending_approval + 1,
    JSON.stringify(akhir));
  // Angka tab Pending benar TANPA membuka tab Pending — itu inti pengujian ini.
  const daftarAssigned = await woMekanik(TENANT, mek.id, 'assigned');
  periksa('WO-nya tidak lagi di daftar Assigned',
    !daftarAssigned.some((w) => w.id === id));
}

console.log('\n─── 3. kiriman ULANG menjawab sukses, bukan galat ───');
{
  const id = (await buatWo(1))[0]!;
  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(3), endTime: JAM(1) });
  periksa('kiriman pertama lolos', a.ok === true, a.pesan);

  // op_id BERBEDA — inilah yang membedakannya dari sekadar dedup struk.
  // Mekanik menekan Kirim dua kali karena kartunya belum sempat berubah.
  const b = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(3), endTime: JAM(1) });
  periksa('kiriman KEDUA (op_id lain) juga menjawab ok', b.ok === true, b.pesan);
  periksa('ditandai sudah terkirim', b.data?.hasil['sudahTerkirim'] === true);

  const w = (await sql<{ session_hours: string; status: string }[]>`
    SELECT session_hours, status::text AS status FROM work_orders WHERE id = ${id}
  `)[0]!;
  periksa('jamnya TIDAK ditulis ulang', Number(w.session_hours) === 2,
    `session_hours=${w.session_hours}`);
  periksa('statusnya tetap di meja L1', w.status === 'pending_supervisor', w.status);
}

console.log('\n─── 4. jam sesi sebelum transfer ikut dijumlahkan ───');
{
  const id = (await buatWo(1))[0]!;
  // Seolah WO ini pernah dioper: 1,5 jam sudah tercatat dari shift sebelumnya.
  await sql`UPDATE work_orders SET partial_hours = 1.5 WHERE id = ${id}`;
  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(2), endTime: JAM(0) });
  periksa('kiriman lolos', a.ok === true, a.pesan);
  periksa('sessionHours = sesi terakhir saja',
    Number(a.data?.hasil['sessionHours']) === 2, String(a.data?.hasil['sessionHours']));
  periksa('actualHours = sesi + jam shift sebelumnya',
    Number(a.data?.hasil['actualHours']) === 3.5, String(a.data?.hasil['actualHours']));

  const w = (await sql<{ actual_hours: string }[]>`
    SELECT actual_hours FROM work_orders WHERE id = ${id}
  `)[0]!;
  periksa('kolom actual_hours di basis data ikut 3,5',
    Number(w.actual_hours) === 3.5, w.actual_hours);
}

console.log('\n─── 5. HM & KM yang sudah terisi tidak dikosongkan ───');
{
  const id = (await buatWo(1))[0]!;
  await sql`UPDATE work_orders SET hour_meter = 1250.5, kilometers = 45000
             WHERE id = ${id}`;
  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(1), endTime: JAM(0) });
  periksa('kiriman lolos', a.ok === true, a.pesan);

  const w = (await sql<{ hour_meter: string | null; kilometers: string | null }[]>`
    SELECT hour_meter, kilometers FROM work_orders WHERE id = ${id}
  `)[0]!;
  // Inilah bug yang pernah hidup lama di KMB V2 tanpa satu pun galat: kolomnya
  // ditimpa kosong tiap kali mekanik menekan Kirim tanpa mengisi apa-apa.
  periksa('hour_meter utuh', Number(w.hour_meter) === 1250.5, String(w.hour_meter));
  periksa('kilometers utuh', Number(w.kilometers) === 45000, String(w.kilometers));
}

console.log('\n─── 6. orang di luar tim ditolak ───');
{
  const id = (await buatWo(1))[0]!;
  const a = await perintah(lain.token, 'kirim_kerja',
    { woId: id, startTime: JAM(1), endTime: JAM(0) });
  periksa('ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya wewenang', /tidak terdaftar/i.test(a.pesan ?? ''), a.pesan);
}

console.log('\n─── 7. jam yang tidak masuk akal ditolak ───');
{
  const id = (await buatWo(1))[0]!;
  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: id, startTime: JAM(0), endTime: JAM(2) });   // selesai SEBELUM mulai
  periksa('selesai sebelum mulai ditolak', a.ok === false, 'justru diterima');

  const b = await perintah(mek.token, 'kirim_kerja', {
    woId: id,
    startTime: new Date(Date.now() - 2000 * 3_600_000).toISOString(),
    endTime: new Date().toISOString(),
  });
  periksa('durasi 2000 jam ditolak', b.ok === false, 'justru diterima');
}

console.log('\n─── 8. ringkas borongan dihitung atas SELURUH grup ───');
{
  const ids = await buatWo(3, true);
  // Satu baris dikirim → pindah ke tab Pending. Dua sisanya tinggal di Assigned.
  const a = await perintah(mek.token, 'kirim_kerja',
    { woId: ids[0]!, startTime: JAM(1), endTime: JAM(0) });
  periksa('satu baris borongan terkirim', a.ok === true, a.pesan);

  const assigned = await woMekanik(TENANT, mek.id, 'assigned');
  const sisa = assigned.filter((w) => ids.includes(w.id));
  periksa('dua baris tersisa di Assigned', sisa.length === 2, `${sisa.length} baris`);
  // Inilah yang dulu salah: layar menghitung dari isi tab dan menulis
  // "Selesai 0 dari 2" untuk borongan berisi tiga.
  periksa('grup_total tetap 3, bukan 2',
    sisa.every((w) => w.grupTotal === 3), JSON.stringify(sisa.map((w) => w.grupTotal)));
  periksa('grup_selesai 0 — yang terkirim belum approved, jadi belum "selesai"',
    sisa.every((w) => w.grupSelesai === 0), JSON.stringify(sisa.map((w) => w.grupSelesai)));

  const pending = await woMekanik(TENANT, mek.id, 'pending_approval');
  const sendirian = pending.find((w) => w.id === ids[0]);
  periksa('baris yang sendirian di tab Pending tetap tahu grupnya berisi 3',
    sendirian?.grupTotal === 3, String(sendirian?.grupTotal));
}

console.log('\n─── 9. WO dibatalkan hilang dari daftar mekanik ───');
{
  const id = (await buatWo(1))[0]!;
  const b = await perintah(l2.token, 'batal_wo',
    { woId: id, alasan: 'CONTOH pembatalan uji' });
  periksa('pembatalan lolos', b.ok === true, b.pesan);
  const daftar = await woMekanik(TENANT, mek.id, 'assigned');
  periksa('tidak muncul di tab mana pun', !daftar.some((w) => w.id === id));
}

// Bersihkan jejak uji.
await sql`DELETE FROM work_orders WHERE id = ANY(${dibuat}::bigint[])`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
