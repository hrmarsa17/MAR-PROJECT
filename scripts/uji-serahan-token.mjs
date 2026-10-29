// Uji serah-terima token dari pintu (keputusan 29 Okt nomor 10) di ketiga PWA rumah.
//
// Menjalankan fungsi ASLI `ambilTokenSerahan` dan `masukDariPintu` dari pwa/<rumah>/app.js
// dalam sandbox, dengan urutan boot yang sama dengan aplikasinya:
//   masukDariPintu(ambilTokenSerahan()); showScreen(S.token ? 'main' : 'login'); lepas kelas anti-kedip
//
// Kenapa ada (bug #19, 29 Okt): penjaga di masukDariPintu sempat dihapus. Akibatnya membuka
// aplikasi tanpa #token= mengosongkan token (online: layar login; offline: token di HP terhapus),
// HP yang sudah masuk dengan token lain langsung diganti tokennya (antrean kiriman pengguna lama
// terkirim atas nama token baru), dan layar login tersembunyi CSS saat token ditolak atau logout.
//
// Pakai:  node scripts/uji-serahan-token.mjs           (ketiga rumah)
//         node scripts/uji-serahan-token.mjs kmb       (satu rumah)
// Wajib lulus semua sebelum deploy PWA rumah mana pun (AGENTS.md §0a butir 13).
// Token di sini palsu ("tokenlamaX", "tokenbaruY"); tidak ada GAS atau jaringan yang dihubungi.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PWA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pwa');
const rumah = process.argv[2] ? [process.argv[2]] : ['sum', 'kmb', 'kmbprojek'];

function ambilKode(src) {
  const s = src.replace(/\r\n/g, '\n');
  const a = s.indexOf('var _masukDariPintu = false;');
  const b = s.indexOf('function masukDariPintu(t) {');
  const c = s.indexOf('\n}\n', b);
  if (a < 0 || b < 0 || c < 0) throw new Error('fungsi serah-terima tidak ditemukan');
  const i = s.indexOf('masukDariPintu(ambilTokenSerahan())', c);
  if (i < 0) throw new Error('boot tidak memanggil masukDariPintu(ambilTokenSerahan())');
  const boot = s.slice(i, i + 900);
  return { kode: s.slice(a, c + 2), lepasKelasDiBoot: /classList\.remove\('dari-pintu'\)/.test(boot) };
}

async function skenario(kode, lepasKelasDiBoot, { sesi, hash = '', search = '', online = true, pingOk = true }) {
  const catat = { toast: [], kv: [], layar: [], ping: 0, offline: [], url: null };
  const kelas = new Set();
  if (/(?:^#|&|\?)token=/.test(hash || search)) kelas.add('dari-pintu'); // skrip <head> di index.html
  const ctx = {
    S: { token: sesi || null, me: null, role: null },
    location: { hash, search, pathname: '/' },
    history: { replaceState: (_a, _b, u) => { catat.url = u; } },
    document: { documentElement: { classList: { add: (k) => kelas.add(k), remove: (k) => kelas.delete(k) } } },
    navigator: { onLine: online },
    toast: (m) => catat.toast.push(m),
    // Seperti GAS: token kosong atau tidak dikenal ditolak.
    api: () => { catat.ping++; return Promise.resolve(pingOk && ctx.S.token ? { success: true, result: { role: 'supervisor' } } : { success: false, error: 'Token tidak dikenal / nonaktif' }); },
    kvSet: (k, v) => { catat.kv.push(k + '=' + v); return Promise.resolve(); },
    showScreen: (n) => catat.layar.push(n),
    saveTokenOffline: (t) => catat.offline.push(t),
    requestNotifPermission() {}, requestPeriodicSync() {}, renderAll() {}, syncNow() {},
    pullRefs: () => Promise.resolve(),
    decodeURIComponent, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(kode + "\nmasukDariPintu(ambilTokenSerahan()); showScreen(S.token?'main':'login');" +
    (lepasKelasDiBoot ? "document.documentElement.classList.remove('dari-pintu');" : ''), ctx);
  await new Promise((r) => setTimeout(r, 20));
  const terakhir = catat.layar[catat.layar.length - 1];
  return { ...catat, token: ctx.S.token, layar: terakhir === 'login' && kelas.has('dari-pintu') ? 'KOSONG (login tersembunyi CSS)' : terakhir, kelas: kelas.has('dari-pintu') };
}

const X = 'tokenlamaX', Y = 'tokenbaruY';
const nama = (t) => (t === X ? 'X' : t === Y ? 'Y' : JSON.stringify(t));
const kasus = [
  ['S1 sudah masuk X, dibuka biasa (online)', { sesi: X }, (h) => h.token === X && h.layar === 'main' && h.ping === 0 && !h.toast.length],
  ['S2 sudah masuk X, dibuka biasa (offline)', { sesi: X, online: false }, (h) => h.token === X && h.layar === 'main' && !h.offline.length],
  ['S3 belum masuk, #token=Y diterima', { hash: '#token=' + Y }, (h) => h.token === Y && h.layar === 'main' && h.kv.includes('token=' + Y) && !h.kelas],
  ['S4 belum masuk, #token=Y ditolak', { hash: '#token=' + Y, pingOk: false }, (h) => h.token === null && h.layar === 'login' && h.toast.length === 1],
  ['S5 sudah masuk X, dari pintu dengan Y (HP dipakai bergantian)', { sesi: X, hash: '#token=' + Y }, (h) => h.token === X && h.layar === 'main' && h.ping === 0 && /token lain/.test(h.toast[0] || '') && !h.kelas],
  ['S6 sudah masuk X, dari pintu dengan X', { sesi: X, hash: '#token=' + X }, (h) => h.token === X && h.layar === 'main' && !h.toast.length],
  ['S7 belum masuk, ?token=Y: token dibuang dari alamat', { search: '?token=' + Y }, (h) => h.token === Y && h.url !== null && !String(h.url).includes(Y)],
  ['S8 belum masuk, #token=Y (offline)', { hash: '#token=' + Y, online: false }, (h) => h.token === Y && h.offline[0] === Y && h.layar === 'main'],
];

let gagal = 0, total = 0;
for (const r of rumah) {
  console.log(`\n== pwa/${r} ==`);
  let kode, lepasKelasDiBoot;
  try {
    ({ kode, lepasKelasDiBoot } = ambilKode(fs.readFileSync(path.join(PWA, r, 'app.js'), 'utf8')));
  } catch (e) {
    console.log(`GAGAL  semua skenario: ${e.message} (bentuknya harus sama dengan pwa/kmb)`);
    gagal += kasus.length; total += kasus.length;
    continue;
  }
  for (const [judul, opsi, lulus] of kasus) {
    const h = await skenario(kode, lepasKelasDiBoot, opsi);
    total++;
    if (lulus(h)) { console.log(`LULUS  ${judul}`); continue; }
    gagal++;
    console.log(`GAGAL  ${judul}  → token=${nama(h.token)}, layar=${h.layar}, ping=${h.ping}, toast=${JSON.stringify(h.toast)}, simpan-offline=${JSON.stringify(h.offline.map(nama))}, alamat=${h.url}`);
  }
}
console.log(`\n${total - gagal}/${total} lulus`);
process.exit(gagal ? 1 : 0);
