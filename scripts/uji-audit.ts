import './muat-env.js';

/**
 * RIWAYAT PERUBAHAN.
 *
 * Uji pertama di berkas ini adalah kejadian yang membuat layarnya dibangun:
 * jam rencana sebuah job diubah, layarnya tergulir, dan yang mengubahnya lupa
 * job mana dan dari berapa ke berapa. Kalau riwayat tidak bisa menjawab itu
 * tanpa disaring apa pun, layarnya tidak ada gunanya.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { riwayatAudit, bacaDetails } = await import('../src/domain/kueriAudit.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function orang(peran: string) {
  const m = (await sql<{ id: number; tenant_id: number; name: string }[]>`
    SELECT id, tenant_id, name FROM mechanics
     WHERE role = ${peran} AND is_active ORDER BY id LIMIT 1`)[0]!;
  const t = buatToken();
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${m.id} AND is_active AND revoked_at IS NULL`;
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return { ...m, token: t };
}

const l2 = await orang('superintendent');
const l1 = await orang('supervisor');
const TENANT = Number(l2.tenant_id);
const adminSemula = (await sql<{ may_admin: boolean }[]>`
  SELECT may_admin FROM mechanics WHERE id = ${l2.id}`)[0]!.may_admin;
await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;

async function perintah(t: string, aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` },
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

const CAP = Date.now().toString().slice(-6);
const jobDibuat: number[] = [];
const unitDibuat: number[] = [];

console.log('\n─── 1. kejadian yang membuat layar ini ada ───');
{
  const a = await perintah(l2.token, 'admin_job', {
    sectionCode: 'tyreman', kode: `UJI-A${CAP}`, nama: 'CONTOH Audit',
    basePoints: 10, planHours: 8, aktif: true,
  });
  const jobId = Number(a.data?.hasil['jobId']);
  jobDibuat.push(jobId);

  // Ubah HANYA jam rencana. Inilah yang harus bisa ditemukan lagi.
  const b = await perintah(l2.token, 'admin_job', {
    jobId, nama: 'CONTOH Audit', basePoints: 10, planHours: 3, aktif: true,
  });
  periksa('jam rencana tersimpan', b.ok === true, b.pesan);

  const r = await riwayatAudit(TENANT, { limit: 5 });
  const baris = r.baris[0]!;
  periksa('perubahan itu ada di baris PALING ATAS, tanpa disaring apa pun',
    baris.aksi === 'admin_job_ubah', baris.aksi);
  periksa('judulnya menyebut job mana', baris.judul.includes(`UJI-A${CAP}`), baris.judul);

  const jam = baris.perubahan.find((p) => p.medan === 'Jam rencana');
  periksa('menyebut medan yang berubah dengan nama yang dibaca orang', !!jam,
    JSON.stringify(baris.perubahan));
  periksa('dari berapa ke berapa: 8 → 3',
    jam?.lama === '8' && jam?.baru === '3', JSON.stringify(jam));
  /* Base point dan nama ikut ditulis perintahnya walau tidak berubah. Kalau
     ikut ditampilkan, satu baris yang dicari terkubur di antara yang tidak. */
  periksa('medan yang TIDAK berubah tidak ditampilkan',
    baris.perubahan.length === 1, JSON.stringify(baris.perubahan));
  periksa('menyebut siapa yang mengubahnya', baris.aktor === l2.name, String(baris.aktor));
}

console.log('\n─── 2. ubah orang & unit kini bisa dijawab "apa yang berubah" ───');
{
  const tarif = (await sql<{ id: number }[]>`
    SELECT id FROM pay_rates WHERE tenant_id=${TENANT} ORDER BY id LIMIT 1`)[0]!;
  const a = await perintah(l2.token, 'admin_orang', {
    kode: `UJI-AU${CAP}`, nama: 'CONTOH Audit Orang', peran: 'mechanic',
    payRateId: Number(tarif.id), section: ['field'], aktif: true, akunUji: true,
    bolehPerforma: false, bolehTeknis: false, bolehReport: false, bolehAdmin: false,
  });
  const orangId = Number(a.data?.hasil['id']);

  const b = await perintah(l2.token, 'admin_orang', {
    id: orangId, kode: `UJI-AU${CAP}`, nama: 'CONTOH Audit Orang',
    peran: 'supervisor', payRateId: Number(tarif.id), section: ['field', 'tyreman'],
    aktif: true, akunUji: true, bolehPerforma: true, bolehTeknis: false,
    bolehReport: false, bolehAdmin: false,
  });
  periksa('orang tersimpan', b.ok === true, b.pesan);

  const r = await riwayatAudit(TENANT, { kategori: 'orang', limit: 5 });
  const baris = r.baris.find((x) => x.aksi === 'admin_orang_ubah')!;
  const medan = baris.perubahan.map((p) => p.medan);
  /* Sampai 16 Sep 2026 baris ini menyimpan SELURUH baris lama dan tidak pernah
     menyimpan nilai barunya — jadi "apa yang berubah" mustahil dijawab. */
  periksa('peran tercatat berubah', medan.includes('Peran'), JSON.stringify(medan));
  periksa('dari mechanic ke supervisor',
    baris.perubahan.find((p) => p.medan === 'Peran')?.lama === 'mechanic'
    && baris.perubahan.find((p) => p.medan === 'Peran')?.baru === 'supervisor');
  periksa('hak performa tercatat berubah',
    medan.some((x) => /performa/i.test(x)), JSON.stringify(medan));
  periksa('section tercatat berubah', medan.includes('Section'), JSON.stringify(medan));
  periksa('section lama BUKAN nilai barunya — dibaca sebelum diganti',
    baris.perubahan.find((p) => p.medan === 'Section')?.lama === 'field',
    JSON.stringify(baris.perubahan.find((p) => p.medan === 'Section')));
  periksa('yang tidak disentuh tidak ikut — nama & tarif tidak muncul',
    !medan.includes('Nama') && !medan.includes('Tarif'), JSON.stringify(medan));
  periksa('email tidak dibuang mentah-mentah ke details',
    !JSON.stringify(baris.konteks).includes('@'), JSON.stringify(baris.konteks));

  await sql`DELETE FROM mechanic_sections WHERE mechanic_id = ${orangId}`;
  await sql`DELETE FROM mechanics WHERE id = ${orangId}`;

  // ── unit ──
  const u = await perintah(l2.token, 'admin_unit', {
    kode: `UJI-AUU${CAP}`, nama: 'CONTOH Audit Unit', section: ['field'],
    global: false, unitFactor: 1, mtbfEligible: false, aktif: true,
  });
  const unitId = Number(u.data?.hasil['unitId']);
  unitDibuat.push(unitId);
  const v = await perintah(l2.token, 'admin_unit', {
    unitId, nama: 'CONTOH Audit Unit', section: ['tyreman'],
    global: true, unitFactor: 1.4, mtbfEligible: false, aktif: true,
  });
  periksa('unit tersimpan', v.ok === true, v.pesan);

  const r2 = await riwayatAudit(TENANT, { kategori: 'katalog', limit: 10 });
  const bu = r2.baris.find((x) => x.aksi === 'admin_unit_ubah')!;
  const mu = bu.perubahan.map((p) => p.medan);
  const fu = bu.perubahan.find((p) => p.medan === 'Faktor unit');
  periksa('faktor unit tercatat 1 → 1.4', fu?.baru === '1.4', JSON.stringify(bu.perubahan));
  /* Nilai lama datang dari Postgres sebagai numeric ("1.000"), nilai baru dari
     JSON sebagai angka. Dibiarkan, perubahannya terbaca "1.000 → 1.4". */
  periksa('kedua sisinya ditulis dengan bentuk angka yang SAMA',
    fu?.lama === '1', String(fu?.lama));
  periksa('lingkup section tercatat berubah', mu.includes('Section'), JSON.stringify(mu));
  periksa('penanda global tercatat berubah', mu.includes('Global'), JSON.stringify(mu));
}

console.log('\n─── 3. saringan ───');
{
  const semua = await riwayatAudit(TENANT, { limit: 200 });
  const katalog = await riwayatAudit(TENANT, { kategori: 'katalog', limit: 200 });
  const wo = await riwayatAudit(TENANT, { kategori: 'wo', limit: 200 });
  periksa('kategori benar-benar menyaring',
    katalog.baris.length < semua.baris.length && katalog.baris.length > 0,
    `${katalog.baris.length} dari ${semua.baris.length}`);
  periksa('kategori katalog tidak membawa baris WO',
    katalog.baris.every((b) => b.kategori === 'katalog'));
  periksa('kategori wo tidak membawa baris katalog',
    wo.baris.every((b) => b.kategori === 'wo'));

  const uang = await riwayatAudit(TENANT, { hanyaUang: true, limit: 200 });
  periksa('saringan "menggeser uang" hanya membawa yang ditandai uang',
    uang.baris.length > 0 && uang.baris.every((b) => b.uang),
    `${uang.baris.length} baris`);
  periksa('dan approve L2 termasuk di dalamnya — di situ poin terbit',
    uang.baris.some((b) => b.aksi === 'approve_l2'));

  const punyaAku = await riwayatAudit(TENANT, { aktorId: Number(l2.id), limit: 200 });
  periksa('saringan per orang bekerja',
    punyaAku.baris.length > 0 && punyaAku.baris.every((b) => b.aktor === l2.name));

  const cari = await riwayatAudit(TENANT, { cari: `UJI-A${CAP}`, limit: 50 });
  periksa('pencarian teks menemukan job kita', cari.baris.length >= 2,
    `${cari.baris.length} baris`);
}

console.log('\n─── 4. halaman berikutnya tidak melewatkan atau mengulang ───');
{
  const h1 = await riwayatAudit(TENANT, { limit: 5 });
  periksa('halaman pertama penuh', h1.baris.length === 5, String(h1.baris.length));
  periksa('mengaku masih ada lagi', h1.adaLagi === true);

  const h2 = await riwayatAudit(TENANT, { limit: 5, sebelum: h1.kursor });
  const id1 = h1.baris.map((b) => b.id);
  const id2 = h2.baris.map((b) => b.id);
  periksa('halaman kedua tidak mengulang satu baris pun',
    id2.every((x) => !id1.includes(x)), `${id1} vs ${id2}`);
  /* Kursornya id, bukan offset. Baris baru yang masuk di antara dua halaman
     tidak menggeser apa pun — kalau offset, satu baris akan terlewat. */
  periksa('urutannya tetap menurun', Math.max(...id2) < Math.min(...id1));
}

console.log('\n─── 5. baris yang entitasnya sudah dihapus tetap terbaca ───');
{
  const j = await perintah(l2.token, 'admin_job', {
    sectionCode: 'tyreman', kode: `UJI-AH${CAP}`, nama: 'CONTOH Akan Dihapus',
    basePoints: 4, planHours: 2, aktif: true,
  });
  const id = Number(j.data?.hasil['jobId']);
  await perintah(l2.token, 'admin_hapus_job', { jobId: id });

  const r = await riwayatAudit(TENANT, { cari: `UJI-AH${CAP}`, limit: 10 });
  const hapus = r.baris.find((b) => b.aksi === 'admin_job_hapus')!;
  /* Job-nya sudah tidak ada, jadi judul tidak bisa diambil dari tabelnya.
     Justru baris yang dihapus inilah yang paling sering dicari orang. */
  periksa('judulnya jatuh ke isi details, bukan jadi kosong',
    hapus.judul.includes(`UJI-AH${CAP}`), hapus.judul);
}

console.log('\n─── 6. pembacaan details: tiga pola, satu aturan ───');
{
  const a = bacaDetails({ plan_hours: { lama: 8, baru: 3 }, kode: 'JOB-1' });
  periksa('pola {medan:{lama,baru}} terbaca', a.perubahan.length === 1
    && a.perubahan[0]!.medan === 'Jam rencana');
  periksa('sisanya jadi konteks', a.konteks.some((k) => k.nilai === 'JOB-1'));

  const b = bacaDetails({ lama: 1, baru: 1.2, jenis: 'work_condition' }, 'Nilai faktor');
  periksa('pola {lama,baru} di akar memakai nama medan dari aksinya',
    b.perubahan[0]?.medan === 'Nilai faktor', JSON.stringify(b.perubahan));

  const c = bacaDetails({ nama: { lama: 'X', baru: 'X' } });
  periksa('yang nilainya SAMA dibuang', c.perubahan.length === 0);

  const d = bacaDetails({ lama: 1400, baru: null }, 'HM');
  periksa('dikosongkan tampil sebagai — bukan "null"',
    d.perubahan[0]?.baru === '—', JSON.stringify(d.perubahan));

  const e = bacaDetails({ wo: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  /* `terapkan_surut` bisa membawa ribuan baris WO di satu entri. Membentangkan
     semuanya membuat satu baris riwayat lebih panjang dari seluruh halaman. */
  periksa('larik panjang diringkas jadi jumlahnya',
    e.konteks[0]?.nilai === '3 baris', JSON.stringify(e.konteks));

  const f = bacaDetails({ section: { lama: ['field'], baru: ['field', 'tyreman'] } });
  periksa('larik di dalam pasangan dibaca isinya',
    f.perubahan[0]?.baru === 'field, tyreman', JSON.stringify(f.perubahan));

  // save_override menyebut medannya sendiri di `kind`, bukan lewat aksinya.
  const g = bacaDetails({ lama: [1], baru: [2], kind: 'team', level: 'superintendent' });
  periksa('override memakai `kind` sebagai nama medan, bukan "Nilai"',
    g.perubahan[0]?.medan === 'Tim', JSON.stringify(g.perubahan));

  /* Entri lama admin_orang_ubah: ada `lama` tanpa `baru`. Kalau didiamkan, layar
     menampilkannya seperti "tidak ada yang berubah" padahal ada. */
  const h = bacaDetails({ kode: 'X', lama: { id: 1, name: 'A', email: 'a@b.c' } });
  periksa('potret lama tanpa nilai baru dikatakan apa adanya, tidak didiamkan',
    h.perubahan.length === 0
    && h.konteks.some((k) => /potret utuh/.test(k.nilai)), JSON.stringify(h));
  periksa('dan isinya tidak dibentangkan — email tidak ikut tergambar',
    !JSON.stringify(h.konteks).includes('@'), JSON.stringify(h.konteks));
}

console.log('\n─── 7. gerbangnya penanda admin ───');
{
  const r = await fetch(`${ALAMAT}/api/data?jenis=audit`,
    { headers: { Cookie: `kmb_token=${l1.token}` } });
  periksa('bukan admin ditolak', r.status === 403, String(r.status));
  const r2 = await fetch(`${ALAMAT}/api/data?jenis=audit&limit=3`,
    { headers: { Cookie: `kmb_token=${l2.token}` } });
  const j2 = await r2.json() as { ok: boolean; data?: { baris: unknown[] } };
  periksa('admin bisa membacanya lewat rute', j2.ok === true);
  periksa('dan rutenya benar-benar membawa barisnya',
    (j2.data?.baris.length ?? 0) > 0);
}

// ── Bersihkan ───────────────────────────────────────────────────────────────
await sql`DELETE FROM units WHERE id = ANY(${unitDibuat}::int[])`;
await sql`DELETE FROM jobs WHERE job_code LIKE ${`UJI-A${CAP}%`}
                              OR job_code LIKE ${`UJI-AH${CAP}%`}`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);

await sql`UPDATE mechanics SET may_admin = ${adminSemula} WHERE id = ${l2.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
