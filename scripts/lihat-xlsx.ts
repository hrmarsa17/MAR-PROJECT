import ExcelJS from 'exceljs';

/**
 * Melihat isi sebuah .xlsx: nama lembar, jumlah baris, dan kepala kolomnya.
 *
 *   npx tsx scripts/lihat-xlsx.ts "<berkas.xlsx>" [nama-lembar]
 *
 * Tanpa nama lembar: daftar seluruh lembar. Dengan nama lembar: tiga baris
 * pertamanya, untuk memastikan bentuk datanya sebelum diimpor.
 *
 * Tidak menulis apa pun dan tidak menyentuh basis data.
 */
const berkas = process.argv[2];
const lembar = process.argv[3];
if (!berkas) {
  console.error('Pakai: npx tsx scripts/lihat-xlsx.ts "<berkas.xlsx>" [nama-lembar]');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(berkas);

if (!lembar) {
  console.log(`\n  BARIS  LEMBAR                         KEPALA KOLOM`);
  console.log('  ' + '─'.repeat(100));
  for (const ws of wb.worksheets) {
    const kepala = ((ws.getRow(1).values as unknown[]) ?? [])
      .slice(1).map((v) => String(v ?? '')).slice(0, 9);
    console.log(`  ${String(ws.rowCount).padStart(5)}  ${ws.name.padEnd(30)}${kepala.join(' | ')}`);
  }
  console.log('');
} else {
  const ws = wb.getWorksheet(lembar);
  if (!ws) {
    console.error(`Lembar "${lembar}" tidak ada.`);
    process.exit(1);
  }
  console.log(`\n${ws.name} — ${ws.rowCount} baris\n`);
  for (let i = 1; i <= Math.min(4, ws.rowCount); i++) {
    const v = ((ws.getRow(i).values as unknown[]) ?? []).slice(1)
      .map((x) => String(x ?? '').slice(0, 24));
    console.log(`  ${String(i).padStart(3)}  ${v.join(' | ')}`);
  }
  console.log('');
}
