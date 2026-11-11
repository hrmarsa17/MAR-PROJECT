import ExcelJS from 'exceljs';
import fs from 'fs';

async function testLivePayroll() {
  const url = 'https://abadiops-kmb-staging.kawanabadigrup.workers.dev/api/web';
  const token = 'kmb-767db2f62a87';

  console.log('Testing live endpoint:', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_payroll_report',
      token: token,
      filter_type: 'month',
      year: 2026,
      month: 11,
      section_filter: 'all'
    })
  });

  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Success:', data.success);
  console.log('Source:', data.source);
  console.log('Result metadata:', {
    filename: data.result?.filename,
    period: data.result?.period,
    summary: data.result?.summary,
    b64_length: data.result?.file_b64?.length
  });

  if (data.result?.file_b64) {
    const buf = Buffer.from(data.result.file_b64, 'base64');
    fs.writeFileSync('scratch/live_downloaded_payroll.xlsx', buf);
    console.log('Saved to scratch/live_downloaded_payroll.xlsx, size:', buf.byteLength);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('scratch/live_downloaded_payroll.xlsx');
    console.log('Worksheets in live downloaded xlsx:', wb.worksheets.map(w => w.name));
    
    const ws1 = wb.getWorksheet('Ringkasan');
    console.log('Ringkasan title:', ws1.getCell('A1').value, ws1.getCell('A1').fill?.fgColor?.argb);
    console.log('Ringkasan headers:', ws1.getRow(6).values.slice(1));
    console.log('Ringkasan total row:', ws1.getRow(ws1.rowCount).values.slice(1));

    const ws2 = wb.getWorksheet('Detail WO');
    console.log('Detail WO title:', ws2.getCell('A1').value);
    console.log('Detail WO header count:', ws2.getRow(5).values.length - 1);
    console.log('Detail WO row count:', ws2.rowCount);
  }
}

testLivePayroll().catch(console.error);
