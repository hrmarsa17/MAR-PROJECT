const KMB_URL = 'https://abadiops-kmb-staging.kawanabadigrup.workers.dev';
const SUM_URL = 'https://abadiops-sum-staging.kawanabadigrup.workers.dev';

const KMB_TOKEN = '49ae897c18534448998a'; // Yoga KMB
const SUM_TOKEN = '253de60cc43340d68d5a'; // Adi SUM

async function testReport(baseUrl, rumah, token) {
  console.log(`\n=== Testing Reports on ${rumah.toUpperCase()} (${baseUrl}) ===`);

  // 1. Test GET /web?page=reports
  const pageRes = await fetch(`${baseUrl}/web?page=reports&token=${token}`);
  console.log(`GET /web?page=reports status: ${pageRes.status}`);
  const pageHtml = await pageRes.text();
  const hasReportsTitle = pageHtml.includes('Laporan Payroll') || pageHtml.includes('Payroll Report') || pageHtml.includes('doExport');
  console.log(`Halaman Reports mengandung doExport/Laporan: ${hasReportsTitle} (${pageHtml.length} bytes)`);

  // 2. Test generatePayrollReport (Month filter)
  const monthPayload = {
    action: 'generatePayrollReport',
    token: token,
    args: ['month', 2026, 11, null, null, 'all', token],
  };

  const monthRes = await fetch(`${baseUrl}/api/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(monthPayload),
  });
  console.log(`POST /api/web (month) status: ${monthRes.status}`);
  const monthData = await monthRes.json();
  console.log('Month response:', {
    success: monthData.success,
    source: monthData.source,
    period: monthData.data?.period || monthData.result?.period,
    summary: monthData.data?.summary || monthData.result?.summary,
    filename: monthData.data?.filename || monthData.result?.filename,
    has_b64: Boolean(monthData.data?.file_b64 || monthData.result?.file_b64),
    b64_len: (monthData.data?.file_b64 || monthData.result?.file_b64 || '').length,
  });

  // 3. Test generatePayrollReport (Range filter)
  const rangePayload = {
    action: 'generatePayrollReport',
    token: token,
    args: ['range', null, null, '2026-10-01', '2026-11-10', 'all', token],
  };

  const rangeRes = await fetch(`${baseUrl}/api/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rangePayload),
  });
  console.log(`POST /api/web (range) status: ${rangeRes.status}`);
  const rangeData = await rangeRes.json();
  console.log('Range response:', {
    success: rangeData.success,
    source: rangeData.source,
    period: rangeData.data?.period || rangeData.result?.period,
    summary: rangeData.data?.summary || rangeData.result?.summary,
    filename: rangeData.data?.filename || rangeData.result?.filename,
    has_b64: Boolean(rangeData.data?.file_b64 || rangeData.result?.file_b64),
    b64_len: (rangeData.data?.file_b64 || rangeData.result?.file_b64 || '').length,
  });
}

async function main() {
  await testReport(KMB_URL, 'kmb', KMB_TOKEN);
  await testReport(SUM_URL, 'sum', SUM_TOKEN);
}

main().catch(console.error);
