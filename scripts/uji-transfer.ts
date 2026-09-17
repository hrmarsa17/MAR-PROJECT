import './muat-env.js';

/**
 * TRANSFER WO — oper pekerjaan ke shift berikutnya.
 *
 * Dua hal di sini adalah jalur uang, dan keduanya diuji langsung:
 *
 *   1. Ditolak ⇒ jam sesi HANGUS. partial_hours tidak boleh bergerak satu menit
 *      pun. Kalau ia ikut bertambah, mekanik dibayar untuk sesi yang keputusannya
 *      justru menolaknya.
 *   2. Dua approver menyetujui BERSAMAAN ⇒ jam hanya ditambahkan SEKALI. Di KMB
 *      V2 ini dijaga LockService; kalau penjagaannya lepas, jam kerja dan rupiah
 *      membengkak dua kali lipat tanpa satu pun galat.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken, identitasDariToken } = await import('../src/lib/auth.js');
const { kartuTransfer } = await import('../src/domain/kueriTransfer.js');
const { woMekanik } = await import('../src/domain/kueriWoMekanik.js');

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
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${m.id} AND is_active AND revoked_at IS NULL`;
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return { ...m, token: t };
}

const l2 = await orang('superintendent');
const l1 = await orang('supervisor');
const mek = await orang('mechanic');
const penerima = await orang('mechanic', [mek.id]);
const TENANT = mek.tenant_id;

async function perintah(t: string, aksi: string, data: unknown, opId = crypto.randomUUID()) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `mar_token=${t}` },
    body: JSON.stringify({ aksi, op_id: opId, data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; kode?: string;
    data?: { hasil: Record<string, unknown> };
  }>;
}

const dibuat: number[] = [];
async function buatWo() {
  const job = (await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
     WHERE s.code = 'workshop' AND j.is_active ORDER BY j.id LIMIT 1
  `)[0];
  const j = await perintah(l2.token, 'buat_wo', {
    sectionCode: 'workshop',
    blok: [{
      ...(job ? { jobId: Number(job.id) } : {
        manual: { description: 'CONTOH transfer', basePoints: 2, targetHours: 3, unitFactor: 1 },
      }),
      workCondition: 'normal', location: 'workshop', teamMechanicIds: [mek.id],
    }],
  });
  if (!j.ok) throw new Error(`gagal membuat WO uji: ${j.pesan}`);
  const id = Number((j.data?.hasil['dibuat'] as { id: number }[])[0]!.id);
  dibuat.push(id);
  return id;
}

const JAM_LALU = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const partialDari = async (id: number) =>
  Number((await sql<{ p: string }[]>`SELECT partial_hours AS p FROM work_orders WHERE id = ${id}`)[0]!.p);

console.log('\n─── 1. mekanik meminta transfer ───');
let woA = 0;
{
  woA = await buatWo();
  const a = await perintah(mek.token, 'minta_transfer',
    { woId: woA, sessionStart: JAM_LALU(3), note: 'CONTOH baut roda kiri belum kencang' });
  periksa('permintaan diterima', a.ok === true, a.pesan);
  periksa('jam sesi dihitung dari jam mulai',
    Number(a.data?.hasil['sessionHours']) === 3, String(a.data?.hasil['sessionHours']));

  const w = (await sql<{ status: string }[]>`
    SELECT status::text AS status FROM work_orders WHERE id = ${woA}
  `)[0]!;
  periksa('status jadi pending_transfer', w.status === 'pending_transfer', w.status);
  periksa('partial_hours BELUM disentuh', await partialDari(woA) === 0);
}

console.log('\n─── 2. permintaan ulang menjawab sukses ───');
{
  const b = await perintah(mek.token, 'minta_transfer',
    { woId: woA, sessionStart: JAM_LALU(3) });
  periksa('kiriman kedua (op_id lain) ok', b.ok === true, b.pesan);
  periksa('ditandai sudah diminta', b.data?.hasil['sudahDiminta'] === true);
  const n = await sql`SELECT 1 FROM work_order_transfers WHERE work_order_id = ${woA}`;
  periksa('tidak melahirkan permintaan kedua', n.length === 1, `${n.length} baris`);
}

console.log('\n─── 3. WO-nya tetap terlihat mekanik, tapi tak bisa dikirim ───');
{
  const daftar = await woMekanik(TENANT, mek.id, 'assigned');
  const kartu = daftar.find((w) => w.id === woA);
  periksa('masih di tab Assigned — tidak hilang dari pandangan', kartu !== undefined);
  periksa('tombol kirim dimatikan', kartu?.bolehKirim === false);

  const k = await perintah(mek.token, 'kirim_kerja',
    { woId: woA, startTime: JAM_LALU(2), endTime: JAM_LALU(0) });
  periksa('kirim kerja ditolak', k.ok === false, 'justru diterima');
  periksa('alasannya menyebut transfer',
    /transfer/i.test(k.pesan ?? ''), k.pesan);
}

console.log('\n─── 4. mekanik tidak boleh memutuskan transfernya sendiri ───');
{
  const a = await perintah(mek.token, 'setujui_transfer',
    { woId: woA, penerima: [penerima.id] });
  periksa('ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya wewenang', /L1 atau L2/i.test(a.pesan ?? ''), a.pesan);
}

console.log('\n─── 5. L1 melihat kartunya berikut dampak jamnya ───');
{
  const aku = await identitasDariToken(l1.token);
  const kartu = await kartuTransfer(aku);
  const k = kartu.find((x) => x.woId === woA);
  periksa('kartunya muncul di tab transfer', k !== undefined,
    `${kartu.length} kartu, tak satu pun WO ini`);
  periksa('menyebut jam sesi', k?.sessionHours === 3, String(k?.sessionHours));
  periksa('menyebut jam tercatat sekarang', k?.partialSekarang === 0, String(k?.partialSekarang));
  periksa('menyebut jam SESUDAH bila disetujui', k?.partialSesudah === 3, String(k?.partialSesudah));
  periksa('membawa catatan mekaniknya',
    k?.catatan?.includes('baut roda kiri') === true, k?.catatan ?? '(kosong)');

  const akuMek = await identitasDariToken(mek.token);
  periksa('MEKANIK tidak bisa melihat daftar ini sama sekali',
    (await kartuTransfer(akuMek)).length === 0);
}

console.log('\n─── 6. DITOLAK ⇒ jam sesi HANGUS ───');
{
  const t = await perintah(l1.token, 'tolak_transfer',
    { woId: woA, alasan: 'CONTOH shift berikutnya kosong, kerjakan sampai selesai' });
  periksa('penolakan diterima', t.ok === true, t.pesan);

  const w = (await sql<{ status: string }[]>`
    SELECT status::text AS status FROM work_orders WHERE id = ${woA}
  `)[0]!;
  periksa('WO kembali dikerjakan mekanik',
    w.status === 'pending_mechanic_work', w.status);
  // Inilah pemeriksaan yang paling menentukan di berkas ini.
  periksa('partial_hours TIDAK bergerak — sesi 3 jam hangus',
    await partialDari(woA) === 0, String(await partialDari(woA)));

  const tim = await sql`SELECT 1 FROM work_order_team WHERE work_order_id = ${woA}`;
  periksa('tidak ada anggota tim yang ditambahkan', tim.length === 1, `${tim.length} anggota`);

  const baris = (await sql<{ decision: string; session_hours: string }[]>`
    SELECT decision::text, session_hours FROM work_order_transfers WHERE work_order_id = ${woA}
  `)[0]!;
  periksa('permintaannya TETAP tersimpan sebagai jejak',
    baris.decision === 'reject' && Number(baris.session_hours) === 3,
    JSON.stringify(baris));

  const kartu = await kartuTransfer(await identitasDariToken(l1.token));
  periksa('hilang dari antrean keputusan', !kartu.some((x) => x.woId === woA));

  /* Jam mekanik hangus karena keputusan ini. Kalau alasannya berhenti di audit
     log, yang sampai ke lapangan cuma "jam saya tidak dihitung" tanpa sebab —
     dan tak seorang pun bisa menjawabnya tanpa membuka basis data. */
  const punyaMek = await woMekanik(TENANT, mek.id, 'assigned');
  const k = punyaMek.find((w) => w.id === woA);
  periksa('ALASAN penolakan sampai ke kartu mekanik',
    k?.transferDitolak?.alasan.includes('shift berikutnya kosong') === true,
    JSON.stringify(k?.transferDitolak));
  periksa('menyebut berapa jam yang hangus',
    k?.transferDitolak?.jamHangus === 3, String(k?.transferDitolak?.jamHangus));
  periksa('menyebut siapa yang memutuskan',
    k?.transferDitolak?.oleh === l1.name, k?.transferDitolak?.oleh ?? '(kosong)');

  // Mekanik boleh mengajukan transfer LAGI setelah ditolak — penolakan bukan
  // larangan permanen, dan shift berikutnya bisa saja terisi kemudian.
  const ulang = await perintah(mek.token, 'minta_transfer',
    { woId: woA, sessionStart: JAM_LALU(1) });
  periksa('boleh mengajukan transfer lagi setelah ditolak', ulang.ok === true, ulang.pesan);
  periksa('permintaan barunya BENAR-BENAR baru, bukan struk lama',
    ulang.data?.hasil['sudahDiminta'] === false);
  await perintah(l1.token, 'tolak_transfer',
    { woId: woA, alasan: 'CONTOH bersihkan lagi untuk uji berikutnya' });
}

console.log('\n─── 7. DISETUJUI ⇒ jam masuk, tim diperluas ───');
let woB = 0;
{
  woB = await buatWo();
  await perintah(mek.token, 'minta_transfer', {
    woId: woB, sessionStart: JAM_LALU(2),
    note: 'CONTOH baut roda kiri belum kencang, tinggal torsi ulang',
  });

  const a = await perintah(l1.token, 'setujui_transfer',
    { woId: woB, penerima: [penerima.id] });
  periksa('persetujuan diterima', a.ok === true, a.pesan);
  periksa('jam tercatat naik 0 → 2', Number(a.data?.hasil['partialHoursSesudah']) === 2,
    String(a.data?.hasil['partialHoursSesudah']));
  periksa('partial_hours di basis data ikut', await partialDari(woB) === 2);

  const tim = await sql<{ mechanic_id: number }[]>`
    SELECT mechanic_id FROM work_order_team WHERE work_order_id = ${woB} ORDER BY mechanic_id
  `;
  periksa('penerima masuk tim', tim.some((t) => Number(t.mechanic_id) === penerima.id));
  periksa('mekanik semula TETAP di tim', tim.some((t) => Number(t.mechanic_id) === mek.id));

  const d = await woMekanik(TENANT, penerima.id, 'assigned');
  const kartuPenerima = d.find((w) => w.id === woB);
  periksa('WO muncul di daftar penerima', kartuPenerima !== undefined);

  /* Inilah seluruh guna medan catatan itu. Kalau pesannya berhenti di meja
     approver dan tidak pernah sampai ke orang yang melanjutkan pekerjaannya,
     fiturnya ada di layar tapi tidak melakukan apa-apa. */
  periksa('PESAN shift sebelumnya sampai ke mekanik penerima',
    kartuPenerima?.catatanTransfer?.teks.includes('baut roda kiri') === true,
    JSON.stringify(kartuPenerima?.catatanTransfer));
  periksa('pesannya menyebut siapa yang menitipkan',
    kartuPenerima?.catatanTransfer?.dari === mek.name,
    kartuPenerima?.catatanTransfer?.dari ?? '(kosong)');

  const belumDisetujui = await woMekanik(TENANT, mek.id, 'assigned');
  periksa('pesan dari transfer yang DITOLAK tidak ikut tampil',
    belumDisetujui.find((w) => w.id === woA)?.catatanTransfer === null,
    JSON.stringify(belumDisetujui.find((w) => w.id === woA)?.catatanTransfer));
}

console.log('\n─── 7b. angka tab = isi daftarnya ───');
{
  const { hitunganTab } = await import('../src/domain/kueriApproval.js');
  const aku = await identitasDariToken(l1.token);
  const [hitung, daftar] = await Promise.all([hitunganTab(aku), kartuTransfer(aku)]);
  // WO berstatus pending_transfer tanpa baris permintaan menggantung pernah
  // terhitung di tab tapi tak punya kartu: "2" di atas daftar kosong.
  periksa('hitungan tab Transfer sama dengan jumlah kartunya',
    hitung.transfer === daftar.length, `tab=${hitung.transfer} kartu=${daftar.length}`);
}

console.log('\n─── 8. dua approver menyetujui BERSAMAAN: jam masuk SEKALI ───');
{
  const woC = await buatWo();
  await perintah(mek.token, 'minta_transfer', { woId: woC, sessionStart: JAM_LALU(4) });

  // Dikirim bersamaan, op_id berbeda, dua approver berbeda. Tanpa klaim atomik
  // keduanya membaca 'pending_transfer' lalu sama-sama menambahkan 4 jam.
  const [a, b] = await Promise.all([
    perintah(l1.token, 'setujui_transfer', { woId: woC, penerima: [penerima.id] }),
    perintah(l2.token, 'setujui_transfer', { woId: woC, penerima: [penerima.id] }),
  ]);
  const sukses = [a, b].filter((x) => x.ok).length;
  periksa('salah satunya berhasil', sukses >= 1, `${sukses} berhasil`);
  periksa('jam ditambahkan SEKALI, bukan dua kali',
    await partialDari(woC) === 4, `partial_hours = ${await partialDari(woC)}`);

  const tim = await sql`SELECT 1 FROM work_order_team WHERE work_order_id = ${woC}`;
  periksa('penerima tidak masuk tim dua kali', tim.length === 2, `${tim.length} anggota`);
}

console.log('\n─── 9. pagar penerima ───');
{
  const woD = await buatWo();
  await perintah(mek.token, 'minta_transfer', { woId: woD, sessionStart: JAM_LALU(1) });

  const a = await perintah(l1.token, 'setujui_transfer', { woId: woD, penerima: [mek.id] });
  periksa('penerima yang SUDAH di tim ditolak', a.ok === false, 'justru diterima');
  periksa('pesannya bisa dibaca orang, bukan galat basis data',
    /sudah menjadi anggota tim/i.test(a.pesan ?? ''), a.pesan);

  const b = await perintah(l1.token, 'setujui_transfer', { woId: woD, penerima: [] });
  periksa('tanpa penerima ditolak', b.ok === false, 'justru diterima');

  periksa('setelah dua penolakan itu, jamnya masih utuh 0',
    await partialDari(woD) === 0, String(await partialDari(woD)));
}

console.log('\n─── 10. pagar permintaan ───');
{
  const woE = await buatWo();
  const a = await perintah(mek.token, 'minta_transfer',
    { woId: woE, sessionStart: new Date(Date.now() + 3_600_000).toISOString() });
  periksa('jam mulai di masa depan ditolak', a.ok === false, 'justru diterima');

  const b = await perintah(mek.token, 'minta_transfer',
    { woId: woE, sessionStart: JAM_LALU(30) });
  periksa('sesi 30 jam ditolak', b.ok === false, 'justru diterima');
  periksa('alasannya menyebut batas wajar', /wajar/i.test(b.pesan ?? ''), b.pesan);

  const c = await perintah(penerima.token, 'minta_transfer',
    { woId: woE, sessionStart: JAM_LALU(1) });
  periksa('orang di luar tim ditolak', c.ok === false, 'justru diterima');
}

console.log('\n─── 11. RANTAI PENUH: transfer → kirim → L1 → L2 → uang ───');
{
  /* Pertanyaan terakhir, dan satu-satunya yang benar-benar menentukan: setelah
     semua ini, apakah KEDUANYA dibayar, dan apakah jam shift pertama ikut
     dihitung? Semua uji di atas memeriksa potongannya; yang ini memeriksa
     bahwa potongan-potongan itu tersambung sampai ke poin. */
  const wo = await buatWo();
  await perintah(mek.token, 'minta_transfer', { woId: wo, sessionStart: JAM_LALU(5) });
  const s = await perintah(l1.token, 'setujui_transfer', { woId: wo, penerima: [penerima.id] });
  periksa('transfer disetujui, 5 jam masuk', Number(s.data?.hasil['partialHoursSesudah']) === 5,
    String(s.data?.hasil['partialHoursSesudah']));

  // Mekanik penerima menyelesaikan sisanya: 2 jam.
  const k = await perintah(penerima.token, 'kirim_kerja',
    { woId: wo, startTime: JAM_LALU(2), endTime: JAM_LALU(0) });
  periksa('penerima bisa mengirim kerjanya', k.ok === true, k.pesan);
  periksa('jam total = 5 (shift 1) + 2 (shift 2)',
    Number(k.data?.hasil['actualHours']) === 7, String(k.data?.hasil['actualHours']));

  const a = await perintah(l1.token, 'approve_l1', { woId: wo });
  periksa('L1 lolos', a.ok === true, a.pesan);
  const b = await perintah(l2.token, 'approve_l2', { woId: wo });
  periksa('L2 lolos', b.ok === true, b.pesan);

  const poin = await sql<{ mechanic_id: number; points: string; idr_value: string }[]>`
    SELECT mechanic_id, points, idr_value FROM mechanic_points WHERE work_order_id = ${wo}
  `;
  periksa('DUA orang dibayar, bukan satu', poin.length === 2, `${poin.length} baris`);
  periksa('mekanik shift pertama dapat poin',
    poin.some((p) => Number(p.mechanic_id) === mek.id && Number(p.points) > 0));
  periksa('penerima transfer dapat poin PENUH yang sama',
    poin.length === 2 && Number(poin[0]!.points) === Number(poin[1]!.points),
    JSON.stringify(poin.map((p) => p.points)));
  periksa('rupiahnya terbit untuk keduanya',
    poin.every((p) => Number(p.idr_value) > 0), JSON.stringify(poin.map((p) => p.idr_value)));

  const snap = (
    await sql<{ actual_hours: string }[]>`
      SELECT actual_hours FROM scoring_snapshots WHERE work_order_id = ${wo}
    `
  )[0];
  periksa('snapshot membekukan jam TOTAL lintas shift, bukan sesi terakhir',
    Number(snap?.actual_hours) === 7, String(snap?.actual_hours));
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
