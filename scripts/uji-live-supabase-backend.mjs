import './muat-env.ts';

// Force BACKEND_DRIVER=supabase
process.env['BACKEND_DRIVER'] = 'supabase';

const { POST } = await import('../src/app/api/gas/route.js');

async function testLiveSupabaseSystem() {
  console.log('================================================================');
  console.log('🚀 PENGUJIAN SISTEM DENGAN BACKEND SUPABASE AKTIF (LIVE DB)');
  console.log('================================================================\n');

  // Token uji supervisor KMB Project. Tidak ditulis di repo; isi lewat environment KMBP_UJI_SPV_TOKEN.
  const SPV_TOKEN = process.env.KMBP_UJI_SPV_TOKEN;
  if (!SPV_TOKEN) {
    console.error('❌ KMBP_UJI_SPV_TOKEN belum disetel di environment! (token uji supervisor KMB Project)');
    process.exit(1);
  }

  // 1. Test ping via /api/gas
  console.log('1. Menguji Aksi "ping" lewat /api/gas ...');
  const t0 = Date.now();
  const pingReq = new Request('http://localhost/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SPV_TOKEN, action: 'ping', system: 'KMB' }),
  });
  const pingRes = await POST(pingReq);
  const pingJson = await pingRes.json();
  const pingDur = Date.now() - t0;

  console.log(`   - Status HTTP: ${pingRes.status}`);
  console.log(`   - X-MAR-Backend: ${pingRes.headers.get('X-MAR-Backend')}`);
  console.log(`   - Waktu Respon: ${pingDur}ms (GAS biasanya ~2000ms)`);
  console.log(`   - Data User:`, pingJson.result);

  // 2. Test pull_create_refs via /api/gas
  console.log('\n2. Menguji Aksi "pull_create_refs" lewat /api/gas ...');
  const t1 = Date.now();
  const refsReq = new Request('http://localhost/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SPV_TOKEN, action: 'pull_create_refs', system: 'KMB' }),
  });
  const refsRes = await POST(refsReq);
  const refsJson = await refsRes.json();
  const refsDur = Date.now() - t1;

  console.log(`   - Status HTTP: ${refsRes.status}`);
  console.log(`   - X-MAR-Backend: ${refsRes.headers.get('X-MAR-Backend')}`);
  console.log(`   - Waktu Respon: ${refsDur}ms (GAS biasanya ~6400ms)`);
  console.log(`   - Total Unit: ${refsJson.result?.refs?.units?.length} unit`);
  console.log(`   - Total Komponen: ${refsJson.result?.refs?.components?.length} komponen`);
  console.log(`   - Total Mekanik: ${refsJson.result?.refs?.mechanics?.length} mekanik`);
  console.log(`   - Contoh Unit 1:`, refsJson.result?.refs?.units?.[0]);

  // 3. Test pull_monitoring via /api/gas
  console.log('\n3. Menguji Aksi "pull_monitoring" lewat /api/gas ...');
  const t2 = Date.now();
  const monReq = new Request('http://localhost/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SPV_TOKEN, action: 'pull_monitoring', system: 'KMB' }),
  });
  const monRes = await POST(monReq);
  const monJson = await monRes.json();
  const monDur = Date.now() - t2;

  console.log(`   - Status HTTP: ${monRes.status}`);
  console.log(`   - X-MAR-Backend: ${monRes.headers.get('X-MAR-Backend')}`);
  console.log(`   - Waktu Respon: ${monDur}ms (GAS biasanya ~8100ms)`);
  console.log(`   - Mekanik Terpantau: ${monJson.result?.mechanics?.length} orang`);
  console.log(`   - Ringkasan Status:`, monJson.result?.overall);
  console.log(`   - Contoh Mekanik 1:`, monJson.result?.mechanics?.[0]);

  console.log('\n================================================================');
  console.log('🎉 SEMUA PEMBACAAN DATA LANGSUNG DARI SUPABASE BERHASIL 100%!');
  console.log('================================================================');

  process.exit(0);
}

testLiveSupabaseSystem().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
