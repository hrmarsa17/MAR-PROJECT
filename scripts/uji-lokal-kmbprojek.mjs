// Uji lokal Worker abadiops-kmbprojek dan file PWA 1:1
const BASE = 'http://127.0.0.1:8787';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';

let lulus = 0;
let gagal = 0;

function assert(kondisi, pesan) {
  if (kondisi) {
    console.log('✅ ' + pesan);
    lulus++;
  } else {
    console.error('❌ ' + pesan);
    gagal++;
  }
}

async function run() {
  console.log('--- 1. Uji File Statis PWA ---');
  const files = [
    { path: '/', type: 'text/html' },
    { path: '/index.html', type: 'text/html' },
    { path: '/app.js', type: 'application/javascript' },
    { path: '/sw.js', type: 'application/javascript' },
    { path: '/manifest.json', type: 'application/json' },
    { path: '/icon-192.png', type: 'image/png' },
    { path: '/icon-512.png', type: 'image/png' },
  ];

  for (const f of files) {
    const res = await fetch(BASE + f.path);
    assert(res.status === 200, `${f.path} status 200 (dapat: ${res.status})`);
  }

  const appRes = await fetch(BASE + '/app.js');
  const appTxt = await appRes.text();
  assert(appTxt.includes("APP_VERSION = 'projek-v14'"), "app.js memuat APP_VERSION = 'projek-v14'");
  assert(appTxt.includes("API_URL: './api'"), "app.js memuat API_URL: './api'");
  assert(appTxt.includes('ambilTokenSerahan'), "app.js memuat ambilTokenSerahan");
  assert(appTxt.includes('masukDariPintu'), "app.js memuat masukDariPintu");

  const swRes = await fetch(BASE + '/sw.js');
  const swTxt = await swRes.text();
  assert(swTxt.includes("CACHE = 'mar-projek-v14'"), "sw.js memuat CACHE = 'mar-projek-v14'");
  assert(swTxt.includes("API_URL = './api'"), "sw.js memuat API_URL = './api'");

  console.log('\n--- 2. Uji Endpoint Sehat ---');
  const sehatRes = await fetch(BASE + '/api/sehat');
  const sehatJson = await sehatRes.json();
  assert(sehatRes.status === 200, 'Endpoint /api/sehat status 200');
  assert(sehatJson.ok === true && sehatJson.rumah === 'kmbprojek' && sehatJson.saklar === 'gas',
    `Respons sehat valid: ${JSON.stringify(sehatJson)}`);

  console.log('\n--- 3. Uji Kembar Terusan ke GAS KMB Project ---');
  const fakePayload = JSON.stringify({ token: 'uji-palsu-kmbprojek-999', action: 'ping' });

  // Panggilan langsung ke GAS
  const gasStart = Date.now();
  const gasRes = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: fakePayload,
    redirect: 'follow',
  });
  const gasText = await gasRes.text();
  const gasDur = Date.now() - gasStart;
  console.log(`GAS langsung (${gasDur}ms):`, gasText.slice(0, 100));

  // Panggilan lewat Worker
  const workerStart = Date.now();
  const workerRes = await fetch(BASE + '/api', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: fakePayload,
  });
  const workerText = await workerRes.text();
  const workerDur = Date.now() - workerStart;
  console.log(`Worker (${workerDur}ms):`, workerText.slice(0, 100));

  assert(workerRes.status === gasRes.status, `Status HTTP sama: ${workerRes.status}`);
  assert(workerText === gasText, 'Respon JSON worker sama persis dengan respon langsung GAS');
  assert(workerRes.headers.get('X-Abadi-Rumah') === 'kmbprojek', 'Header X-Abadi-Rumah = kmbprojek');
  assert(workerRes.headers.get('X-Abadi-Jalur') === 'gas', 'Header X-Abadi-Jalur = gas');

  console.log('\n--- 4. Uji Penolakan Token Rumah Lain ---');
  // Token format rumah lain atau token acak lain
  const sumTokenPayload = JSON.stringify({ token: 'sum-uji-palsu-token-01', action: 'ping' });
  const sumRes = await fetch(BASE + '/api', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: sumTokenPayload,
  });
  const sumJson = await sumRes.json();
  assert(sumJson.success === false, 'Token rumah SUM ditolak');
  assert(sumJson.error && sumJson.error.toLowerCase().includes('tidak dikenal'),
    `Pesan penolakan standar GAS: "${sumJson.error}"`);

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
  if (gagal > 0) process.exit(1);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
