#!/usr/bin/env node
/**
 * Tambalan "tutup GAS" (docs/SAKLAR.md, Tonggak 2; keputusan Gabriel 14 Nov 2026).
 *
 * Memasang di satu folder kode GAS (hasil clasp clone/pull) rumah tertentu:
 *   1. berkas _TutupGas.js: GAS membaca posisi saklar rumahnya dari pintu abadiops (/api/saklar/status), disimpan
 *      30 detik di CacheService; tanpa jawaban pintu dipakai posisi terakhir yang diketahui (Script Properties),
 *      bawaan `gas`. Selama posisi `gas` tidak ada yang berubah. Posisi lain = GAS DITUTUP;
 *   2. satu baris di awal doGet/doPost: kalau tertutup, jawab halaman/JSON "sudah pindah ke abadiops";
 *   3. satu baris di awal wajibMasukSah_ (_PenjagaRun.js): fungsi publik lain (google.script.run, pemicu
 *      terjadwal) ditolak dengan pesan yang sama sehingga tidak ada yang ditulis ke spreadsheet.
 * Semua langkah idempoten (aman dijalankan ulang). Penjaga google.script.run (tambal-penjaga.mjs) wajib sudah
 * terpasang lebih dulu.
 *
 * Jalur Supabase TIDAK memuat _TutupGas.js (tools/kembar/bundel-gas.mjs dan gas-lokal.mjs mengecualikannya):
 * kode GAS yang sama berjalan di Worker sebagai penulis setelah migrasi, dan tidak boleh ikut menutup dirinya.
 *
 * Pemakaian:
 *   node tools/kembar/tambal-tutup-gas.mjs --folder=<folder kode GAS> --rumah=<kode rumah> [--url=https://abadiops.com] [--kering]
 * Setelah itu: clasp push dari folder itu, lalu Gabriel men-deploy dari editor (keputusan 14 Nov: Claude tidak
 * men-deploy GAS). Tambalan tidur selama saklar rumah itu `gas`.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

export const NAMA_BERKAS = '_TutupGas.js';
const PENANDA = '/* tutup-gas */';

export function isiBerkasTutup(rumah, url) {
  return `/**
 * _TutupGas.gs — TUTUP GAS (docs/SAKLAR.md, Tonggak 2). Dipasang tools/kembar/tambal-tutup-gas.mjs; JANGAN diubah tangan.
 *
 * GAS rumah ini membaca posisi saklarnya sendiri dari pintu abadiops. Selama posisi \`gas\`, tidak ada yang berubah.
 * Begitu tombol "Mulai migrasi" ditekan (posisi menutup / supabase / membuka), GAS rumah ini DITUTUP:
 *   - doGet  → halaman "sistem sudah pindah ke abadiops" dengan tautan;
 *   - doPost → JSON { success:false, error:'…' } (PWA abadiops tidak memanggil GAS langsung);
 *   - fungsi publik lain (google.script.run, pemicu terjadwal) → galat dengan pesan yang sama, tanpa menulis.
 * Posisi disimpan 30 detik di CacheService. Kalau pintu tidak terjangkau, dipakai posisi terakhir yang diketahui
 * (Script Properties TUTUP_GAS_POSISI), bawaan \`gas\`: gangguan Cloudflare tidak mematikan GAS sebelum migrasi.
 * Jalur Supabase (Worker) tidak memuat berkas ini.
 */
var TUTUP_GAS_RUMAH_ = ${JSON.stringify(rumah)};
var TUTUP_GAS_URL_ = ${JSON.stringify(url)};
var TUTUP_GAS_POSISI_ = null;

function posisiSaklarRumah_() {
  if (TUTUP_GAS_POSISI_ !== null) return TUTUP_GAS_POSISI_;
  var posisi = null, cache = null, prop = null;
  try { cache = CacheService.getScriptCache(); posisi = cache.get('tutup_gas_posisi'); } catch (x) {}
  if (!posisi) {
    try {
      var r = UrlFetchApp.fetch(TUTUP_GAS_URL_ + '/api/saklar/status', { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() === 200) {
        var j = JSON.parse(r.getContentText());
        var v = j && j.switches ? j.switches[TUTUP_GAS_RUMAH_] : null;
        if (typeof v === 'string' && v) posisi = v;
      }
    } catch (x) {}
    try { prop = PropertiesService.getScriptProperties(); } catch (x) {}
    if (posisi) {
      try { if (cache) cache.put('tutup_gas_posisi', posisi, 30); } catch (x) {}
      try { if (prop && prop.getProperty('TUTUP_GAS_POSISI') !== posisi) prop.setProperty('TUTUP_GAS_POSISI', posisi); } catch (x) {}
    } else {
      try { posisi = (prop && prop.getProperty('TUTUP_GAS_POSISI')) || 'gas'; } catch (x) { posisi = 'gas'; }
    }
  }
  TUTUP_GAS_POSISI_ = posisi;
  return posisi;
}

function gasTertutup_() {
  return posisiSaklarRumah_() !== 'gas';
}

function pesanTutupGas_() {
  return 'Sistem MAR rumah ini sudah pindah ke abadiops. Buka ' + TUTUP_GAS_URL_ + ' dan masuk dengan token Anda.';
}

// Dipanggil di awal doGet ('web') dan doPost ('api'). null = GAS terbuka, lanjut seperti biasa.
function tutupGasJawab_(jenis) {
  if (!gasTertutup_()) return null;
  if (jenis === 'web') {
    var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<div style="font:16px system-ui,sans-serif;margin:2em;max-width:36em"><h2>Sistem sudah pindah ke abadiops</h2>'
      + '<p>' + pesanTutupGas_() + '</p><p><a href="' + TUTUP_GAS_URL_ + '" target="_top">Buka ' + TUTUP_GAS_URL_ + '</a></p></div>';
    return HtmlService.createHtmlOutput(html).setTitle('MAR sudah pindah ke abadiops');
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: pesanTutupGas_() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Dipanggil penjaga (wajibMasukSah_) di awal setiap fungsi publik.
function wajibGasTerbuka_() {
  if (gasTertutup_()) throw new Error(pesanTutupGas_());
}
`;
}

export const BARIS_PENJAGA = "  if (typeof wajibGasTerbuka_ === 'function') wajibGasTerbuka_();   /* tutup-gas */";

// Sisipkan baris tutup-gas di awal wajibMasukSah_ (setelah kurung kurawal pembuka).
export function tambalPenjaga(isi) {
  if (isi.includes('wajibGasTerbuka_')) return { isi, ubah: false };
  const m = isi.match(/function wajibMasukSah_\s*\([^)]*\)\s*\{[^\n]*\n/);
  if (!m) throw new Error('wajibMasukSah_ tidak ditemukan di _PenjagaRun.js; pasang penjaga (tambal-penjaga.mjs) dulu');
  const i = m.index + m[0].length;
  const eol = isi.includes('\r\n') ? '\r\n' : '\n';
  return { isi: isi.slice(0, i) + BARIS_PENJAGA + eol + isi.slice(i), ubah: true };
}

// Sisipkan pernyataan tutup-gas di baris pembuka doGet/doPost, setelah pernyataan penjaga bila ada.
export function tambalEntri(isi, nama, jenis) {
  const re = new RegExp(`^(function ${nama}\\s*\\([^)]*\\)\\s*\\{)([^\\n\\r]*)$`, 'm');
  const m = isi.match(re);
  if (!m) return { isi, ubah: false, ada: false };
  if (m[2].includes(PENANDA)) return { isi, ubah: false, ada: true };
  const sisip = ` ${PENANDA} var tutupGas__ = (typeof tutupGasJawab_ === 'function') ? tutupGasJawab_('${jenis}') : null; if (tutupGas__) return tutupGas__;`;
  const baris = m[1] + m[2] + sisip;
  return { isi: isi.slice(0, m.index) + baris + isi.slice(m.index + m[0].length), ubah: true, ada: true };
}

export function tambalFolder(folder, rumah, url, { kering = false } = {}) {
  const laporan = [];
  const fPenjaga = path.join(folder, '_PenjagaRun.js');
  if (!fs.existsSync(fPenjaga)) throw new Error(`${fPenjaga} tidak ada: pasang penjaga google.script.run dulu (tambal-penjaga.mjs)`);
  const berkasTutup = isiBerkasTutup(rumah, url);
  const fTutup = path.join(folder, NAMA_BERKAS);
  const lama = fs.existsSync(fTutup) ? fs.readFileSync(fTutup, 'utf8') : null;
  if (lama !== berkasTutup) {
    laporan.push(`${NAMA_BERKAS}: ${lama === null ? 'dibuat' : 'diperbarui'} (rumah ${rumah}, ${url})`);
    if (!kering) fs.writeFileSync(fTutup, berkasTutup);
  }
  const p = tambalPenjaga(fs.readFileSync(fPenjaga, 'utf8'));
  if (p.ubah) { laporan.push('_PenjagaRun.js: baris tutup-gas di awal wajibMasukSah_'); if (!kering) fs.writeFileSync(fPenjaga, p.isi); }
  const entri = { doGet: 'web', doPost: 'api' };
  const ditemukan = {};
  for (const f of fs.readdirSync(folder).filter((x) => x.endsWith('.js') && x !== NAMA_BERKAS)) {
    const fp = path.join(folder, f);
    let isi = fs.readFileSync(fp, 'utf8');
    let ubah = false;
    for (const [nama, jenis] of Object.entries(entri)) {
      const h = tambalEntri(isi, nama, jenis);
      if (h.ada) ditemukan[nama] = (ditemukan[nama] || 0) + 1;
      if (h.ubah) { isi = h.isi; ubah = true; laporan.push(`${f}: ${nama} ditutup bila saklar bukan gas`); }
    }
    if (ubah && !kering) fs.writeFileSync(fp, isi);
  }
  for (const nama of Object.keys(entri)) {
    if (ditemukan[nama] !== 1) throw new Error(`${nama} ditemukan ${ditemukan[nama] || 0} kali (harus tepat 1)`);
  }
  return laporan;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1].endsWith('tambal-tutup-gas.mjs')) {
  if (arg.folder && arg.rumah) {
    const url = String(arg.url || 'https://abadiops.com').replace(/\/+$/, '');
    const laporan = tambalFolder(path.resolve(String(arg.folder)), String(arg.rumah), url, { kering: Boolean(arg.kering) });
    console.log(laporan.length ? laporan.join('\n') : 'tidak ada yang perlu diubah (sudah terpasang)');
    if (arg.kering) console.log('(--kering: tidak ada berkas yang ditulis)');
  } else if (!arg.uji) {
    console.log('pemakaian: --folder=<folder kode GAS> --rumah=<kode rumah> [--url=https://abadiops.com] [--kering]');
    process.exitCode = 1;
  }
}
