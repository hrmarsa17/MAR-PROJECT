import ExcelJS from 'exceljs';
const berkas = process.argv[2];
if (!berkas) { console.error('Pakai: npx tsx scripts/baca-xlsx.ts <berkas.xlsx>'); process.exit(1); }
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(berkas);
console.log('WORKSHEET:', wb.worksheets.map((w) => `${w.name} (${w.rowCount}b x ${w.columnCount}k)`).join(' | '));
for (const ws of wb.worksheets) {
  console.log(`\n══════ ${ws.name} ══════`);
  console.log('  views:', JSON.stringify(ws.views));
  const maks = Math.min(ws.rowCount, 9);
  for (let r = 1; r <= maks; r++) {
    const row = ws.getRow(r);
    const isi: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const v = row.getCell(c).value;
      if (v !== null && v !== undefined && v !== '') {
        isi.push(`${c}:${JSON.stringify(v).slice(0, 46)}`);
      }
    }
    if (isi.length) console.log(`  r${r} h=${row.height ?? '-'} ${isi.join('  ')}`);
  }
}
