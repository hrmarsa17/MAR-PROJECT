import './muat-env.js';

/**
 * DASHBOARD TEKNIS — DUNIA TYRE.
 *
 * Yang paling mudah salah di sini, dan karena itu diuji paling keras:
 *
 *   UMUR PAKAI HARUS MELINTASI ROTASI. "Rancangan pertama menghitung per
 *   unit+posisi, jadi tiap rotasi membuat umurnya kembali dari nol"
 *   (`_DashboardTeknis.js:300-302`). Satu selisih terakhir saja merusak
 *   analisis pembelian ban — ban yang sebenarnya menempuh 30.000 KM akan
 *   terbaca 8.000.
 *
 * Dan satu batas yang mengikat seluruh layar: TIDAK ADA poin maupun rupiah.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { identitasDariToken, buatToken } = await import('../src/lib/auth.js');
const { dataTeknisTyre } = await import('../src/domain/kueriTeknisTyre.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const l2 = (
  await sql<{ id: number; tenant_id: number }[]>`
    SELECT id, tenant_id FROM mechanics WHERE role='superintendent' AND is_active
     ORDER BY id LIMIT 1
  `
)[0]!;
const tok = buatToken();
await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
          VALUES (${l2.tenant_id}, ${l2.id}, ${tok})`;
await sql`UPDATE mechanics SET may_view_technical = true WHERE id = ${l2.id}`;
const aku = await identitasDariToken(tok);
const TENANT = aku.tenantId;

const formRem = (
  await sql<{ id: number }[]>`
    SELECT id FROM job_detail_forms WHERE tenant_id=${TENANT} AND code='tyre_remove_instal'
  `
)[0]!;
const formInsp = (
  await sql<{ id: number }[]>`
    SELECT id FROM job_detail_forms WHERE tenant_id=${TENANT} AND code='tyre_inspeksi'
  `
)[0]!;
const jobRem = (
  await sql<{ id: number }[]>`SELECT id FROM jobs WHERE detail_form_id=${formRem.id} LIMIT 1`
)[0]!;
const jobInsp = (
  await sql<{ id: number }[]>`SELECT id FROM jobs WHERE detail_form_id=${formInsp.id} LIMIT 1`
)[0]!;
const secTyre = (
  await sql<{ id: number }[]>`SELECT id FROM sections WHERE tenant_id=${TENANT} AND code='tyreman'`
)[0]!;

const unit = (
  await sql<{ id: number }[]>`
    INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, odometer)
    VALUES (${TENANT}, ${'UJI-TK-' + Date.now()}, 'CONTOH Unit Teknis', 1.0, 'KM')
    RETURNING id
  `
)[0]!;
const UNIT = Number(unit.id);

const dibuat: number[] = [];

/** WO ban dengan KM tertentu, dicatat pada waktu tertentu. */
async function woBan(km: number, mundurHari: number, form: 'rem' | 'insp') {
  const r = (
    await sql<{ id: number }[]>`
      INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
        status, created_by, work_condition, kilometers, mtbf_redo_status, created_at)
      VALUES (${TENANT}, ${'UJI-TK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)},
              ${secTyre.id}, ${form === 'rem' ? jobRem.id : jobInsp.id}, ${UNIT},
              'approved', ${l2.id}, 'normal', ${km}, 'first_time',
              now() - make_interval(days => ${mundurHari}))
      RETURNING id
    `
  )[0]!;
  dibuat.push(Number(r.id));
  return Number(r.id);
}

async function tulis(
  woId: number, formId: number, pos: number, nilai: Record<string, string>, mundurHari: number,
) {
  for (const [k, v] of Object.entries(nilai)) {
    await sql`
      INSERT INTO work_order_detail_values
        (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
      VALUES (${woId}, ${formId}, ${pos}, ${k}, ${v}, ${l2.id},
              now() - make_interval(days => ${mundurHari}))
    `;
  }
}

console.log('\n─── 1. umur pakai MELINTASI rotasi, tidak kembali dari nol ───');
{
  /* Satu ban "SN-A": dipasang di pos 1 pada KM 10.000, dirotasi ke pos 2 pada
     KM 18.000 (8.000 KM), lalu dibuang pada KM 30.000 (12.000 KM lagi).
     Umur finalnya 20.000 KM — BUKAN 12.000, yang akan muncul kalau rotasinya
     memutus hitungan. */
  const w1 = await woBan(10000, 30, 'rem');
  await tulis(w1, formRem.id, 1, { instal_sn: 'SN-A', instal_merk: 'Bridgestone' }, 30);

  const w2 = await woBan(18000, 20, 'rem');
  await tulis(w2, formRem.id, 1, {
    remove_sn: 'SN-A', remove_merk: 'Bridgestone', remove_remarks: 'Rotasi',
  }, 20);
  await tulis(w2, formRem.id, 2, { instal_sn: 'SN-A', instal_merk: 'Bridgestone' }, 20);

  const w3 = await woBan(30000, 5, 'rem');
  await tulis(w3, formRem.id, 2, {
    remove_sn: 'SN-A', remove_merk: 'Bridgestone', remove_pattern: 'VSDL',
    remove_problem: 'Tread cut', remove_remarks: 'Scrap',
  }, 5);

  const d = await dataTeknisTyre(aku);
  const sn = d.life.selesai.find((s) => s.sn === 'SN-A');
  periksa('umurnya selesai dan tercatat', sn !== undefined,
    JSON.stringify(d.life.selesai.map((s) => s.sn)));
  periksa('umurnya 20.000 KM — dua potongan dijumlahkan, bukan yang terakhir saja',
    sn?.lifeKm === 20000, String(sn?.lifeKm));
  periksa('harinya ikut dijumlahkan (10 + 15)', sn?.hari === 25, String(sn?.hari));
  periksa('problem saat dibuang ikut tercatat', sn?.problem === 'Tread cut', sn?.problem ?? '');
  periksa('posisi saat pelepasan FINAL ikut dibawa (pos 2, bukan pos 1)',
    sn?.pos === 2, String(sn?.pos));

  const d2 = await dataTeknisTyre(aku);
  periksa('grafik rata-rata menurut posisi memakai posisi sungguhan',
    d2.life.rataPosisi.some((p) => p.label === 'Posisi 2'),
    JSON.stringify(d2.life.rataPosisi.map((p) => p.label)));
}

console.log('\n─── 2. rotasi BELUM menutup umur ───');
{
  // SN-B dipasang lalu dirotasi, tapi belum pernah dibuang.
  const w1 = await woBan(5000, 12, 'rem');
  await tulis(w1, formRem.id, 3, { instal_sn: 'SN-B' }, 12);
  const w2 = await woBan(9000, 6, 'rem');
  await tulis(w2, formRem.id, 3, { remove_sn: 'SN-B', remove_remarks: 'Rotasi' }, 6);

  const d = await dataTeknisTyre(aku);
  periksa('SN-B TIDAK muncul sebagai umur selesai',
    !d.life.selesai.some((s) => s.sn === 'SN-B'),
    JSON.stringify(d.life.selesai.map((s) => s.sn)));
}

console.log('\n─── 3. pasangan yang tak lengkap DIABAIKAN, bukan ditaksir ───');
{
  // Dilepas tanpa pernah tercatat dipasang.
  const w = await woBan(12000, 4, 'rem');
  await tulis(w, formRem.id, 7, { remove_sn: 'SN-HANTU', remove_remarks: 'Scrap' }, 4);

  const d = await dataTeknisTyre(aku);
  periksa('SN tanpa catatan pasang tidak melahirkan umur',
    !d.life.selesai.some((s) => s.sn === 'SN-HANTU'));
}

console.log('\n─── 4. kondisi kini: RTD, jejak, dan ambang ───');
{
  const a = await woBan(20000, 10, 'insp');
  await tulis(a, formInsp.id, 1, { pressure: '100', rtd: '25', suhu: '40' }, 10);
  const b = await woBan(28000, 2, 'insp');
  await tulis(b, formInsp.id, 1, { pressure: '98', rtd: '12', suhu: '42' }, 2);

  let d = await dataTeknisTyre(aku);
  const k = d.kondisi.find((x) => x.unitId === UNIT && x.pos === 1);
  periksa('RTD yang tampil dari catatan TERBARU', k?.rtd === 12, String(k?.rtd));
  periksa('jejaknya menyimpan kedua titik, bukan rata-ratanya',
    k?.jejakRtd.join(',') === '25,12', k?.jejakRtd.join(','));
  periksa('tanpa ambang, TIDAK ADA yang ditandai kritis',
    d.rtdKritis === null && d.kondisi.every((x) => !x.kritis));

  await sql`
    INSERT INTO settings (tenant_id, setting_key, setting_value)
    VALUES (${TENANT}, 'tyre_rtd_kritis', '15')
    ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = '15'
  `;
  d = await dataTeknisTyre(aku);
  const k2 = d.kondisi.find((x) => x.unitId === UNIT && x.pos === 1);
  periksa('dengan ambang 15, RTD 12 jadi kritis', k2?.kritis === true);
  periksa('yang RTD-nya belum terukur TIDAK ikut kritis',
    d.kondisi.filter((x) => x.rtd === null).every((x) => !x.kritis));
  periksa('urutan: RTD terendah dulu, yang kosong paling belakang',
    d.kondisi.findIndex((x) => x.rtd === null) === -1
      || d.kondisi.findIndex((x) => x.rtd === null) === d.kondisi.length
        - d.kondisi.filter((x) => x.rtd === null).length);
}

console.log('\n─── 5. umur pakai butuh KEDUA KM, dan nol bukan kosong ───');
{
  const d = await dataTeknisTyre(aku);
  const k = d.kondisi.find((x) => x.unitId === UNIT && x.pos === 1);
  // Pos 1 unit ini: ban SN-A dipasang pada KM 10.000, KM unit kini 30.000.
  periksa('life_km dihitung dari KM pasang ke KM unit sekarang',
    k?.lifeKm !== null && k?.lifeKm !== undefined, String(k?.lifeKm));

  const kosong = d.kondisi.find((x) => x.lifeKm === null);
  periksa('yang belum punya KM pasang bernilai null, bukan 0',
    kosong === undefined || kosong.lifeKm === null);
}

console.log('\n─── 6. problem: kosong diabaikan, diurut menurun ───');
{
  const d = await dataTeknisTyre(aku);
  periksa('problem terhitung', d.problemJenis.some((p) => p.label === 'Tread cut'),
    JSON.stringify(d.problemJenis));
  periksa('baris tanpa problem tidak jadi baris kosong',
    !d.problemJenis.some((p) => p.label.trim() === ''));
  periksa('urut menurun',
    d.problemJenis.every((p, i) => i === 0 || d.problemJenis[i - 1]!.jumlah >= p.jumlah));
}

console.log('\n─── 7. SN dibedakan apa adanya, tanpa normalisasi diam-diam ───');
{
  const w = await woBan(31000, 1, 'rem');
  await tulis(w, formRem.id, 9, { sn: 'sn-a' }, 1);   // huruf kecil, form repair
  const wr = await woBan(31500, 1, 'insp');
  void wr;
  const d = await dataTeknisTyre(aku);
  // Repair dikelompokkan per SN setelah trim TEPI; besar-kecil huruf TETAP beda.
  // Menyeragamkannya diam-diam menggabungkan dua ban berbeda jadi satu riwayat.
  periksa('layar tetap membedakan "sn-a" dari "SN-A"',
    !d.repair.some((r) => r.sn === 'SN-A' && r.jumlah > 1), JSON.stringify(d.repair));
}

console.log('\n─── 8. tidak ada satu pun angka uang di layar ini ───');
{
  const d = await dataTeknisTyre(aku);
  const teks = JSON.stringify(d);
  for (const dilarang of ['idr', 'rupiah', 'points', 'final_points', 'poin']) {
    periksa(`tidak membawa medan "${dilarang}"`, !teks.toLowerCase().includes(dilarang));
  }
}

// Bersihkan jejak uji.
await sql`DELETE FROM settings WHERE tenant_id=${TENANT} AND setting_key='tyre_rtd_kritis'`;
await sql`DELETE FROM work_orders WHERE id = ANY(${dibuat}::bigint[])`;
await sql`DELETE FROM meter_readings WHERE unit_id = ${UNIT}`;
await sql`DELETE FROM units WHERE id = ${UNIT}`;
const hapus = await sql`DELETE FROM api_tokens WHERE token = ${tok} RETURNING id`;
periksa('token uji dibersihkan', hapus.length === 1);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
