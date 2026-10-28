/**
 * Buat token baru yang TIDAK bertabrakan dengan token di ketiga rumah, atau cek token yang sudah ada.
 *
 * Tidak ada daftar token yang ditulis di repo. Setiap token dicek LANGSUNG ke GAS ketiga rumah
 * (ping), jadi token yang bertambah besok ikut terperiksa tanpa mengubah apa pun di sini.
 * Daftar rumah dan alamat GAS diambil dari workers/pintu/wrangler.toml ([vars] RUMAH), sumber yang
 * sama dengan pintu. Bisa ditimpa environment APPSCRIPT_URL_<KODE> (misalnya APPSCRIPT_URL_SUM).
 *
 * Format token selama migrasi: hex 20 karakter, sama dengan buatan GAS (docs/KEPUTUSAN.md 28 Okt).
 *
 * Pemakaian:
 *   node scripts/buat-token-tiga-rumah.mjs            # 1 token baru
 *   node scripts/buat-token-tiga-rumah.mjs 3          # 3 token baru
 *   node scripts/buat-token-tiga-rumah.mjs --cek <token> [<token> ...]
 *
 * Batas: ping hanya melihat token AKTIF. Token nonaktif bernilai sama tidak terlihat.
 * Token acak 80 bit praktis tidak mungkin kembar karena kebetulan; yang berbahaya adalah
 * token yang DISALIN antar-rumah, dan itu ditolak pintu saat login. Token yang dicetak
 * skrip ini JANGAN di-commit.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Daftar rumah dibaca dari konfigurasi pintu (workers/pintu/wrangler.toml, [vars] RUMAH): satu
// sumber untuk pintu dan alat ini. Rumah baru (misalnya kmbbupr) otomatis ikut dicek.
const tomlPintu = readFileSync(new URL('../workers/pintu/wrangler.toml', import.meta.url), 'utf8');
const RUMAH = {};
for (const m of tomlPintu.matchAll(/\{\s*kode\s*=\s*"([^"]+)",\s*nama\s*=\s*"([^"]+)",\s*gas\s*=\s*"([^"]+)"/g)) {
  RUMAH[m[2]] = process.env['APPSCRIPT_URL_' + m[1].toUpperCase()] || m[3];
}
if (Object.keys(RUMAH).length < 3) { console.error('❌ Daftar rumah di workers/pintu/wrangler.toml tidak terbaca'); process.exit(1); }
for (const [nama, url] of Object.entries(RUMAH)) {
  if (!url) { console.error(`❌ Alamat GAS ${nama} tidak ditemukan di worker.js atau environment`); process.exit(1); }
}

const samar = (t) => String(t).slice(0, 4) + '…';

// true = diterima (token dipakai rumah itu), false = ditolak, null = rumah tidak menjawab
async function dipakaiDi(url, token) {
  for (let coba = 1; coba <= 3; coba++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token, action: 'ping', data: {} }),
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      const j = JSON.parse(await r.text());
      if (j && j.success === true) return true;
      if (j && j.success === false) return false;
    } catch (_) { /* coba lagi */ }
  }
  return null;
}

async function periksa(token) {
  const hasil = {};
  await Promise.all(Object.entries(RUMAH).map(async ([nama, url]) => { hasil[nama] = await dipakaiDi(url, token); }));
  return hasil;
}

const args = process.argv.slice(2);
if (args[0] === '--cek') {
  const daftar = args.slice(1);
  if (!daftar.length) { console.error('❌ Sebutkan token yang mau dicek.'); process.exit(1); }
  let kembar = 0;
  for (const t of daftar) {
    const h = await periksa(t.trim());
    const dipakai = Object.keys(h).filter((n) => h[n] === true);
    const diam = Object.keys(h).filter((n) => h[n] === null);
    if (dipakai.length > 1) kembar++;
    console.log(`${samar(t)}  dipakai di: ${dipakai.join(' + ') || '-'}${dipakai.length > 1 ? '   ⚠️ KEMBAR' : ''}${diam.length ? `   (tidak menjawab: ${diam.join(', ')})` : ''}`);
  }
  process.exit(kembar ? 1 : 0);
}

const jumlah = Math.max(1, Math.min(20, parseInt(args[0] || '1', 10) || 1));
const bebas = [];
let percobaan = 0;
while (bebas.length < jumlah && percobaan < jumlah * 5) {
  percobaan++;
  const t = randomBytes(10).toString('hex');
  const h = await periksa(t);
  if (Object.values(h).every((v) => v === false)) bebas.push(t);
  else console.error(`  ${samar(t)} dibuang: ${JSON.stringify(h)}`);
}
if (bebas.length < jumlah) {
  console.error(`❌ Hanya ${bebas.length} dari ${jumlah} token yang bisa dipastikan bebas (ada rumah yang tidak menjawab). Coba lagi nanti.`);
}
console.log(`Token bebas di ketiga rumah (ditolak GAS KMB Project, SUM V2, dan KMB V2). JANGAN di-commit:`);
bebas.forEach((t) => console.log('  ' + t));
process.exit(bebas.length === jumlah ? 0 : 1);
