import './muat-env.js';

/**
 * Uji export payroll.
 *
 * Yang dibuktikan di sini satu hal di atas segalanya: RUPIAHNYA DIBACA, BUKAN
 * DIHITUNG ULANG. Itu luka KMB V2 yang paling mahal — menaikkan tarif seseorang
 * mengubah slip gaji bulan-bulan yang sudah dibayar (9 Sep 2026, Rp 17,6 juta
 * bergeser surut). Ujinya menaikkan tarif SETELAH poin terbit lalu memastikan
 * angka laporannya tidak bergerak sedikit pun.
 */
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { dataPayroll } = await import('../src/domain/kueriPayroll.js');
const { workbookPayroll } = await import('../src/domain/excelPayroll.js');
const { identitasDariToken } = await import('../src/lib/auth.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function tokenUntuk(peran: string) {
  const m = (
    await sql<{ id: number; tenant_id: number }[]>`
      SELECT id, tenant_id FROM mechanics WHERE role = ${peran} AND is_active ORDER BY id LIMIT 1
    `
  )[0]!;
  const t = buatToken();
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return t;
}

const tok = await tokenUntuk('superintendent');
const aku = await identitasDariToken(tok);

// Periode yang memuat WO approved di data contoh.
const rentang = (
  await sql<{ mulai: Date; akhir: Date; n: string }[]>`
    SELECT min(coalesce(approved_l2_at, created_at)) AS mulai,
           max(coalesce(approved_l2_at, created_at)) AS akhir,
           count(*) AS n
      FROM work_orders WHERE status = 'approved'
  `
)[0]!;
if (Number(rentang.n) === 0) {
  console.error('Butuh WO approved. Jalankan: npm run db:contoh');
  process.exit(1);
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minta = { mode: 'range' as const, mulai: iso(rentang.mulai), akhir: iso(rentang.akhir) };

console.log('\n─── 1. laporan terbentuk ───');
const a = await dataPayroll(aku, minta);
periksa('ada baris detail', a.detail.length > 0, `${a.detail.length} baris`);
periksa('ada ringkasan mekanik', a.ringkas.length > 0, `${a.ringkas.length} mekanik`);
periksa('total rupiah > 0', a.statistik.idr > 0, String(a.statistik.idr));

console.log('\n─── 2. ringkasan = jumlah detailnya sendiri ───');
{
  const dariDetail = a.detail.reduce((s, d) => s + d.idr, 0);
  const dariRingkas = a.ringkas.reduce((s, r) => s + r.totalIdr, 0);
  periksa('rupiah ringkasan sama dengan rupiah detail',
    dariDetail === dariRingkas && dariRingkas === a.statistik.idr,
    `detail=${dariDetail} ringkas=${dariRingkas} statistik=${a.statistik.idr}`);

  const woRingkas = a.ringkas.reduce((s, r) => s + r.totalWo, 0);
  periksa('jumlah WO ringkasan sama dengan jumlah baris detail',
    woRingkas === a.detail.length, `${woRingkas} vs ${a.detail.length}`);
}

console.log('\n─── 3. rupiah DIBEKUKAN: menaikkan tarif tidak mengubah slip lama ───');
{
  const sebelum = a.statistik.idr;
  const tarif = await sql<{ id: number; idr_per_point: string }[]>`
    SELECT id, idr_per_point FROM pay_rates ORDER BY id
  `;
  // Naikkan SELURUH tarif dua kali lipat — persis jenis perubahan yang di KMB
  // V2 menggeser gaji yang sudah dibayar.
  await sql`UPDATE pay_rates SET idr_per_point = idr_per_point * 2`;
  const b = await dataPayroll(aku, minta);
  periksa('total rupiah TIDAK bergerak', b.statistik.idr === sebelum,
    `sebelum=${sebelum} sesudah=${b.statistik.idr}`);
  periksa('tarif per baris tetap tarif historisnya',
    b.detail.every((d, i) => d.idrPerPoint === a.detail[i]!.idrPerPoint));
  // Kembalikan.
  for (const t of tarif) {
    await sql`UPDATE pay_rates SET idr_per_point = ${t.idr_per_point} WHERE id = ${t.id}`;
  }
}

console.log('\n─── 4. rincian datang dari snapshot, bukan katalog ───');
{
  const pakaiSnapshot = a.detail.filter((d) => d.basePts > 0);
  periksa('baris punya rincian snapshot', pakaiSnapshot.length > 0);
  // final = base × unit × kondisi × waktu × safety × redo, dibulatkan 2.
  const meleset = pakaiSnapshot.filter((d) => {
    const h = d.basePts * d.xUnit * d.xKondisi * d.xWaktu * d.xSafety * d.xRedo;
    return Math.abs(Math.round(h * 100) / 100 - d.woPoin) > 0.02;
  });
  periksa('enam pengali snapshot menghasilkan WO Poin-nya sendiri',
    meleset.length === 0,
    meleset.slice(0, 2).map((d) => `${d.woNumber}: ${d.woPoin}`).join(', '));
}

console.log('\n─── 5. poin nol tidak masuk slip ───');
{
  periksa('tidak ada baris berpoin nol', a.detail.every((d) => d.poinMekanik > 0));
}

console.log('\n─── 6. periode kosong ditolak dengan alasan, bukan berkas kosong ───');
{
  let pesan = '';
  try {
    await dataPayroll(aku, { mode: 'range', mulai: '2001-01-01', akhir: '2001-01-02' });
  } catch (e) { pesan = (e as Error).message; }
  periksa('ditolak', pesan !== '', 'justru berhasil');
  periksa('alasannya disebut', /tidak ada work order/i.test(pesan), pesan);
}

console.log('\n─── 7. tanggal yang tidak ada di kalender ditolak ───');
{
  let pesan = '';
  try {
    await dataPayroll(aku, { mode: 'range', mulai: '2026-02-31', akhir: '2026-03-01' });
  } catch (e) { pesan = (e as Error).message; }
  periksa('31 Februari ditolak', /kalender/i.test(pesan), pesan || 'justru diterima');
}

console.log('\n─── 8. workbook benar-benar terbentuk ───');
{
  const buf = await workbookPayroll(a);
  periksa('berkas tidak kosong', buf.length > 2000, `${buf.length} bytes`);
  // XLSX itu ZIP: dua huruf pertamanya "PK".
  periksa('berformat xlsx (ZIP)', buf[0] === 0x50 && buf[1] === 0x4b);

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  periksa('tepat dua worksheet', wb.worksheets.length === 2,
    wb.worksheets.map((w) => w.name).join(', '));
  periksa('namanya Ringkasan & Detail WO',
    wb.getWorksheet('Ringkasan') !== undefined && wb.getWorksheet('Detail WO') !== undefined);

  const ws = wb.getWorksheet('Ringkasan')!;
  const barisTotal = 7 + a.ringkas.length;
  const selTotal = ws.getRow(barisTotal).getCell(8).value;
  periksa('sel TOTAL rupiah berupa ANGKA, bukan teks',
    typeof selTotal === 'number', `${typeof selTotal}: ${String(selTotal)}`);
  periksa('sel TOTAL cocok dengan statistik', Number(selTotal) === a.statistik.idr,
    `${String(selTotal)} vs ${a.statistik.idr}`);

  const det = wb.getWorksheet('Detail WO')!;
  periksa('kepala detail 23 kolom',
    det.getRow(5).cellCount === 23, String(det.getRow(5).cellCount));
  periksa('baris detail sama banyak dengan datanya',
    det.rowCount === 5 + a.detail.length, `${det.rowCount} vs ${5 + a.detail.length}`);
}

console.log('\n─── 9. mekanik tidak boleh mengunduh ───');
{
  const tMek = await tokenUntuk('mechanic');
  const r = await fetch(`${ALAMAT}/api/laporan?mode=range&mulai=${minta.mulai}&akhir=${minta.akhir}`,
    { headers: { Cookie: `kmb_token=${tMek}` } });
  const j = await r.json().catch(() => ({ ok: true }));
  periksa('ditolak', j.ok === false, 'justru diterima');
}

const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
