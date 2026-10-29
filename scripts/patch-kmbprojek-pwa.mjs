import fs from 'node:fs';
import path from 'node:path';

const pwaDir = path.resolve('pwa/kmbprojek');

// 1. Patch sw.js
const swPath = path.join(pwaDir, 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');

swContent = swContent.replace(
  "var CACHE = 'mar-projek-v13';",
  "var CACHE = 'mar-projek-v14';"
);

swContent = swContent.replace(
  "var API_URL = 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';",
  "var API_URL = './api';"
);

fs.writeFileSync(swPath, swContent, 'utf8');
console.log('sw.js patched successfully');

// 2. Patch app.js
const appPath = path.join(pwaDir, 'app.js');
let appContent = fs.readFileSync(appPath, 'utf8');

// Line 15 API_URL and Line 21 APP_VERSION
appContent = appContent.replace(
  "var CONFIG = { API_URL: 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec' };",
  "var CONFIG = { API_URL: './api' };"
);

appContent = appContent.replace(
  "var APP_VERSION = 'projek-v13';",
  "var APP_VERSION = 'projek-v14';"
);

// Add ambilTokenSerahan & masukDariPintu
const serahanCode = `/* ── Serah-terima token dari pintu abadiops.com (#token=…) ──
   Tambahan migrasi (keputusan Gabriel 29 Okt, nomor 10): pengguna sudah mengisi token dan
   memilih "Aplikasi" di pintu, jadi layar login TIDAK ditampilkan sama sekali. Token dipakai
   seperti hasil doLogin(): layar utama langsung tampil, ping memastikan peran, data disinkron.
   Token dihapus dari alamat. Kalau HP ini sudah masuk dengan token lain, token itu TIDAK
   diganti, karena antrean kirimannya bisa hilang saat logout. */
var _masukDariPintu = false;
function ambilTokenSerahan() {
  var m = /(?:^#|&)token=([^&]+)/.exec(location.hash || '');
  if (!m) return '';
  var t = '';
  try { t = decodeURIComponent(m[1]).trim(); } catch (e) {}
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  return t;
}
function masukDariPintu(t) {
  if (!t) return;
  if (S.token) {
    if (S.token !== t) toast('Sudah masuk dengan token lain di HP ini. Logout dulu kalau mau ganti.');
    return;
  }
  _masukDariPintu = true;
  S.token = t;
  requestNotifPermission(); requestPeriodicSync();
  if (!navigator.onLine) { saveTokenOffline(t); return; }
  api('ping').then(function(r) {
    if (r.success) {
      S.me = r.result;
      S.role = (r.result && r.result.role) ? r.result.role : 'mechanic';
      return kvSet('token',t).then(function() { return kvSet('me',S.me); })
        .then(function() { return kvSet('role',S.role); })
        .then(function() { if (S.role !== 'mechanic') return pullRefs().catch(function(){}); })
        .then(function() { showScreen('main'); renderAll(); syncNow(false); });
    }
    S.token = null; showScreen('login'); toast('❌ '+(r.error||'Token ditolak'));
  }).catch(function() { saveTokenOffline(t); });
}

`;

appContent = appContent.replace('openDb().then(function() {', serahanCode + 'openDb().then(function() {');

// Add call in openDb chain
const targetBoot = `  setelMeterCreate();
  syncVersionFromCache().then(function(){ showScreen(S.token?'main':'login'); renderAll(); });`;

const replacementBoot = `  setelMeterCreate();
  masukDariPintu(ambilTokenSerahan()); // sebelum layar dipilih: tanpa layar login (keputusan 29 Okt nomor 10)
  syncVersionFromCache().then(function(){ showScreen(S.token?'main':'login'); renderAll(); });`;

appContent = appContent.replace(targetBoot, replacementBoot);

// Update ping boot check to exclude _masukDariPintu
appContent = appContent.replace(
  'if (S.token && navigator.onLine) {',
  'if (S.token && navigator.onLine && !_masukDariPintu) {'
);

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('app.js patched successfully');
