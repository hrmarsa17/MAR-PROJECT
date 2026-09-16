import './muat-env.js';

/**
 * IMPOR KATALOG & KESEHATAN SISTEM.
 *
 * Yang dijaga paling keras: BERKAS SALAH TIDAK BOLEH MASUK DIAM-DIAM.
 * `base_point` adalah uang, dan satu berkas salah kolom bisa mengubah ribuan
 * angka sekaligus — yang menyadarinya adalah orang yang menerima slip gajinya.
 * Karena itu impor selalu dua langkah: pratinjau yang TIDAK menulis apa pun,
 * lalu penerapan yang memvalidasi ulang seluruhnya.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const ExcelJS = (await import('exceljs')).default;
const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { bacaUntukPratinjau, eksporKatalog } = await import('../src/domain/imporKatalog.js');
const { periksaKesehatan } = await import('../src/domain/kesehatan.js');

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
const TENANT = Number(l2.tenant_id);
await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
const tok = buatToken();
await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
          VALUES (${TENANT}, ${l2.id}, ${tok})`;

async function perintah(aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${tok}` },
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

/** Bikin berkas .xlsx di memori. */
async function berkas(kepala: string[], baris: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('uji');
  ws.addRow(kepala);
  for (const b of baris) ws.addRow(b);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const KOLOM = ['job_id', 'unit_model', 'component', 'sub_component',
  'job_description', 'plan_hours', 'base_point', 'job_type', 'is_active'];
const KODE = 'UJI-IMP-' + Date.now().toString().slice(-6);
const kodeDipakai: string[] = [];
/* Nama induk dibuat UNIK per jalan. Jalan sebelumnya sudah membuat
   sub-komponennya, dan uji yang hasilnya berubah karena pernah dijalankan
   bukan uji — ia jebakan yang menyala sekali lalu diam selamanya. */
const SUB = 'uji-piston-' + Date.now().toString().slice(-6);
const SUB2 = 'uji-liner-' + Date.now().toString().slice(-6);

console.log('\n─── 1. kolom templat = kolom spreadsheet Gabriel ───');
{
  const buf = await eksporKatalog(TENANT, 'job', 'field');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const kepala = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1).map(String);
  periksa('kolomnya persis nama yang sudah dipakai di sheet',
    kepala.join(',') === KOLOM.join(','), kepala.join(','));
}

console.log('\n─── 2. berkas salah kolom DITOLAK di pintu ───');
{
  const buf = await berkas(['kode', 'nama', 'poin'], [['X', 'Y', 1]]);
  let pesan = '';
  try { await bacaUntukPratinjau(TENANT, 'job', 'field', buf); }
  catch (e) { pesan = (e as Error).message; }
  periksa('ditolak', pesan !== '', 'justru diterima');
  // Diterima separuh adalah cara paling halus mengubah ribuan angka tanpa
  // ada yang menyadarinya.
  periksa('pesannya menyebut kolom yang hilang', /kolom wajib/i.test(pesan), pesan);
}

console.log('\n─── 3. pratinjau TIDAK menulis apa pun ───');
{
  const sebelum = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM jobs WHERE tenant_id = ${TENANT}`;
  const buf = await berkas(KOLOM, [
    [`${KODE}-1`, 'uji-hauler', 'engine', SUB, 'CONTOH ganti piston', 4, 8, 'breakdown', 'TRUE'],
    [`${KODE}-2`, 'uji-hauler', 'engine', SUB2, 'CONTOH ganti liner', 6, 12, 'breakdown', 'TRUE'],
  ]);
  const p = await bacaUntukPratinjau(TENANT, 'job', 'field', buf);
  const sesudah = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM jobs WHERE tenant_id = ${TENANT}`;

  periksa('jumlah job TIDAK bertambah setelah pratinjau',
    sebelum[0]!.n === sesudah[0]!.n, `${sebelum[0]!.n} → ${sesudah[0]!.n}`);
  periksa('pratinjau menghitung 2 baris baru', p.baru === 2, String(p.baru));
  periksa('menyebut induk yang akan dibuat', p.indukBaru.length > 0,
    JSON.stringify(p.indukBaru));
}

console.log('\n─── 4. terapkan ───');
{
  const buf = await berkas(KOLOM, [
    [`${KODE}-1`, 'uji-hauler', 'engine', SUB, 'CONTOH ganti piston', 4, 8, 'breakdown', 'TRUE'],
    [`${KODE}-2`, 'uji-hauler', 'engine', SUB2, 'CONTOH ganti liner', 6, 12, 'breakdown', 'TRUE'],
  ]);
  kodeDipakai.push(`${KODE}-1`, `${KODE}-2`);
  const p = await bacaUntukPratinjau(TENANT, 'job', 'field', buf);
  const a = await perintah('impor_katalog',
    { jenis: 'job', sectionCode: 'field', baris: p.baris });
  periksa('impor diterima', a.ok === true, a.pesan);
  periksa('dua baris baru', Number(a.data?.hasil['baru']) === 2, String(a.data?.hasil['baru']));

  const j = (await sql<{ base_points: string; plan_hours: string }[]>`
    SELECT base_points, plan_hours FROM jobs
     WHERE tenant_id=${TENANT} AND job_code = ${`${KODE}-1`}`)[0]!;
  periksa('angkanya masuk benar',
    Number(j.base_points) === 8 && Number(j.plan_hours) === 4, JSON.stringify(j));

  const sub = await sql`
    SELECT 1 FROM job_sub_components sc
      JOIN job_components c ON c.id = sc.component_id
     WHERE sc.name = ${SUB} AND c.name = 'engine'`;
  periksa('induk komponen & sub-komponen ikut dibuat', sub.length > 0);
}

console.log('\n─── 5. impor ulang MENIMPA, bukan menumpuk ───');
{
  const buf = await berkas(KOLOM, [
    [`${KODE}-1`, 'uji-hauler', 'engine', SUB, 'CONTOH ganti piston', 4, 20, 'breakdown', 'TRUE'],
  ]);
  const p = await bacaUntukPratinjau(TENANT, 'job', 'field', buf);
  periksa('pratinjau menyebut base_point berubah 8 → 20',
    p.diubah.some((d) => d.medan === 'base_point' && d.lama === '8' && d.baru === '20'),
    JSON.stringify(p.diubah));
  periksa('tidak dihitung sebagai baris baru', p.baru === 0, String(p.baru));

  await perintah('impor_katalog', { jenis: 'job', sectionCode: 'field', baris: p.baris });
  const n = await sql`SELECT 1 FROM jobs WHERE tenant_id=${TENANT} AND job_code=${`${KODE}-1`}`;
  periksa('tetap SATU baris', n.length === 1, `${n.length}`);
  const j = (await sql<{ base_points: string }[]>`
    SELECT base_points FROM jobs WHERE tenant_id=${TENANT} AND job_code=${`${KODE}-1`}`)[0]!;
  periksa('nilainya yang terbaru', Number(j.base_points) === 20, j.base_points);
}

console.log('\n─── 6. yang TIDAK ada di berkas tidak disentuh ───');
{
  const n2 = (await sql<{ base_points: string }[]>`
    SELECT base_points FROM jobs WHERE tenant_id=${TENANT} AND job_code=${`${KODE}-2`}`)[0]!;
  /* Impor sebagian itu wajar — satu section, satu model. Menganggap "tidak ada
     di berkas" = "harus mati" akan mematikan seluruh katalog begitu ada yang
     mengimpor satu lembar kecil. */
  periksa('job yang tidak disertakan berkas kedua TETAP utuh',
    Number(n2.base_points) === 12, n2.base_points);
}

console.log('\n─── 7. baris bermasalah dilewati, sisanya tetap bisa ───');
{
  const buf = await berkas(KOLOM, [
    [`${KODE}-3`, '', '', '', 'CONTOH tanpa cascade', 2, 4, '', 'TRUE'],
    [`${KODE}-4`, 'uji-hauler', '', SUB, 'CONTOH separuh cascade', 2, 4, '', 'TRUE'],
    [`${KODE}-5`, '', '', '', 'CONTOH base point huruf', 2, 'abc', '', 'TRUE'],
    ['', '', '', '', 'CONTOH tanpa kode', 2, 4, '', 'TRUE'],
  ]);
  kodeDipakai.push(`${KODE}-3`);
  const p = await bacaUntukPratinjau(TENANT, 'job', 'field', buf);
  periksa('cascade separuh ditolak',
    p.masalah.some((m) => m.pesan.includes(`${KODE}-4`)), JSON.stringify(p.masalah));
  periksa('base_point bukan angka ditolak',
    p.masalah.some((m) => m.pesan.includes(`${KODE}-5`)));
  periksa('baris tanpa kode dilewati diam-diam, bukan jadi masalah',
    !p.masalah.some((m) => m.pesan.includes('tanpa kode')));
  periksa('baris yang sah tetap bisa diterapkan', p.baru === 1, String(p.baru));

  const a = await perintah('impor_katalog',
    { jenis: 'job', sectionCode: 'field', baris: p.baris });
  periksa('penerapannya lolos', a.ok === true, a.pesan);
}

console.log('\n─── 8. kode kembar di dalam satu berkas ditolak ───');
{
  const buf = await berkas(KOLOM, [
    [`${KODE}-9`, '', '', '', 'CONTOH A', 2, 4, '', 'TRUE'],
    [`${KODE}-9`, '', '', '', 'CONTOH B', 3, 6, '', 'TRUE'],
  ]);
  const p = await bacaUntukPratinjau(TENANT, 'job', 'field', buf);
  periksa('yang kedua ditandai bermasalah',
    p.masalah.some((m) => /lebih dari sekali/i.test(m.pesan)), JSON.stringify(p.masalah));
}

console.log('\n─── 9. bukan admin tidak bisa mengimpor ───');
{
  await sql`UPDATE mechanics SET may_admin = false WHERE id = ${l2.id}`;
  const a = await perintah('impor_katalog', {
    jenis: 'job', sectionCode: 'field',
    baris: [{ job_id: 'X', unit_model: '', component: '', sub_component: '',
              job_description: 'x', plan_hours: 1, base_point: 1, job_type: '',
              is_active: true }],
  });
  periksa('ditolak', a.ok === false, 'justru diterima');
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

console.log('\n─── 9b. UNIT: yang diunduh harus bisa diunggah balik utuh ───');
{
  /* Lubang yang ditutup di sini nyata dan diam: sampai 16 Sep 2026 templat unit
     TIDAK punya kolom `unit_scope`. Jadi siapa pun yang mengunduh daftar unit,
     menyunting satu faktor, lalu mengunggahnya balik akan MENGHAPUS lingkup
     seluruh unitnya — tyreman kehilangan 50 unit, tanpa satu pun peringatan,
     dan pratinjaunya berkata "tidak berubah". */
  const buf = await eksporKatalog(TENANT, 'unit', null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(1)!;
  const kepala = ((ws.getRow(1).values as unknown[]) ?? []).slice(1).map(String);
  periksa('templat unit membawa unit_scope', kepala.includes('unit_scope'),
    kepala.join(','));

  const sebelum = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM unit_sections`;
  const p = await bacaUntukPratinjau(TENANT, 'unit', null, buf);
  const scopeBerubah = p.diubah.filter((d) => d.medan === 'unit_scope');
  periksa('mengunggah balik apa adanya = tidak ada lingkup yang berubah',
    scopeBerubah.length === 0,
    JSON.stringify(scopeBerubah.slice(0, 3)));
  periksa('dan tidak ada baris yang bermasalah', p.masalah.length === 0,
    JSON.stringify(p.masalah.slice(0, 3)));

  const a = await perintah('impor_katalog',
    { jenis: 'unit', sectionCode: null, baris: p.baris });
  periksa('penerapannya lolos', a.ok === true, a.pesan);
  const sesudah = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM unit_sections`;
  periksa('jumlah baris lingkup TETAP sesudah bolak-balik Excel',
    sebelum[0]!.n === sesudah[0]!.n, `${sebelum[0]!.n} → ${sesudah[0]!.n}`);

  const glob = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM units WHERE is_global`;
  periksa('penanda global juga selamat', glob[0]!.n > 0, `${glob[0]!.n} unit global`);
}

console.log('\n─── 9c. faktor unit liar ditolak di pintu impor ───');
{
  const u = (await sql<{ kode: string; nama: string }[]>`
    SELECT unit_code::text AS kode, unit_name AS nama FROM units
     WHERE NOT is_virtual ORDER BY id LIMIT 1`)[0]!;
  const buf = await berkas(
    ['unit_code', 'unit_name', 'unit_model', 'unit_scope', 'unit_factor',
      'odometer', 'brand', 'model_type', 'mtbf_eligible', 'is_active'],
    [[u.kode, u.nama, '', 'field', 15, 'HM', '', '', 'FALSE', 'TRUE']],
  );
  const p = await bacaUntukPratinjau(TENANT, 'unit', null, buf);
  periksa('faktor 15 ditandai bermasalah, tidak diam-diam masuk',
    p.masalah.length === 1, JSON.stringify(p.masalah));
  periksa('alasannya menyuruh memeriksa titik desimal',
    /desimal/i.test(p.masalah[0]?.pesan ?? ''), p.masalah[0]?.pesan);
}

console.log('\n─── 10. kesehatan sistem ───');
{
  const k = await periksaKesehatan(TENANT);
  periksa('menghasilkan butir', k.butir.length > 5, String(k.butir.length));
  periksa('tiap butir menyebut apa yang harus dilakukan, bukan cuma jumlah',
    k.butir.every((b) => b.keterangan.length > 20));
  periksa('admin aktif terbaca sebagai sehat',
    k.butir.some((b) => b.judul.includes('admin aktif') && b.tingkat === 'baik'),
    JSON.stringify(k.butir[0]));

  // Butir "tidak ada admin" adalah satu-satunya yang SALAH saat angkanya nol.
  await sql`UPDATE mechanics SET may_admin = false WHERE tenant_id = ${TENANT}`;
  const k2 = await periksaKesehatan(TENANT);
  periksa('tanpa admin, dilaporkan SALAH — bukan diam',
    k2.butir[0]?.tingkat === 'salah' && /Tidak ada admin/.test(k2.butir[0]!.judul),
    JSON.stringify(k2.butir[0]));
  periksa('dan menyebut cara memperbaikinya',
    /admin:nyalakan/.test(k2.butir[0]?.keterangan ?? ''));
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

// Bersihkan jejak uji.
await sql`DELETE FROM jobs WHERE tenant_id = ${TENANT}
           AND job_code = ANY(${kodeDipakai}::citext[])`;
await sql`DELETE FROM job_sub_components WHERE name IN (${SUB}, ${SUB2})`;
await sql`DELETE FROM api_tokens WHERE token = ${tok}`;
periksa('jejak uji dibersihkan', true);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
