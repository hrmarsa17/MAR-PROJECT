#!/usr/bin/env node
/**
 * Latihan cermin balik di SALINAN spreadsheet (docs/SIAP-MULAI.md langkah 6; syarat `gas.jalan_kembali_siap`).
 * Spreadsheet asli tidak pernah disentuh: sasarannya salinan yang dibuat Gabriel (File → Make a copy) dan dibagikan ke
 * akun layanan sebagai Editor; skemanya ruang uji `uji_<skema>` (Worker uji `abadiops-*-staging` menulis ke sana).
 *
 *   --tahap=awal   segarkan uji_<skema> dari cermin asli (public.cermin_salin_ke_uji), lalu cermin balik PENUH ke salinan
 *                  + uji hak Editor + periksa. Sesudah ini, salinan = uji_<skema>.
 *   (di antaranya) jalankan satu siklus WO di Worker uji staging-<rumah>.abadiops.com: buat WO → kerja mekanik → L1 → L2,
 *                  dan bila perlu pemicu pemangkas (POST /api/uji-pemicu). Tulisan itu masuk ke uji_<skema>.
 *   --tahap=akhir  cermin balik BERTAHAP (hanya baris yang berubah) ke salinan + periksa. Lulus = semua sheet sama.
 *
 * Variabel lingkungan: DATABASE_URL (Gedung 1), GOOGLE_SA_KEY_FILE, dan keempat <SKEMA>_SPREADSHEET_ID asli (supaya
 * balik.mjs bisa menolak bila salinan ternyata spreadsheet asli).
 * Pemakaian: node tools/cermin/latihan-balik.mjs --skema=kmbbupr --salinan=<ID salinan> --tahap=awal|akhir
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const { skema, salinan, tahap } = arg;
if (!/^[a-z][a-z0-9_]*$/.test(String(skema || '')) || String(skema).startsWith('uji_')) throw new Error('--skema=<skema asli>, misalnya kmbbupr');
if (!salinan || typeof salinan !== 'string') throw new Error('--salinan=<ID spreadsheet salinan> wajib');
if (Object.entries(process.env).some(([k, v]) => /_SPREADSHEET_ID$/.test(k) && v === salinan)) throw new Error('salinan adalah spreadsheet ASLI. Berhenti.');
if (!['awal', 'akhir'].includes(tahap)) throw new Error('--tahap=awal atau --tahap=akhir');

const balik = (...opsi) => {
  const r = spawnSync(process.execPath, [path.join(AKAR, 'tools/cermin/balik.mjs'), `--skema=uji_${skema}`, `--sasaran=${salinan}`, ...opsi], { cwd: AKAR, env: process.env, encoding: 'utf8' });
  const keluaran = `${r.stdout || ''}${r.stderr || ''}`.trim();
  console.log(keluaran);
  return { kode: r.status, keluaran };
};

if (tahap === 'awal') {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', idle_timeout: 20, onnotice: () => {} });
  try {
    const [r] = await sql`SELECT public.cermin_salin_ke_uji(${skema}) AS h`;
    console.log(`uji_${skema} disegarkan dari ${skema}: ${r.h.tabel} tabel, ${r.h.baris} baris`);
  } finally { await sql.end({ timeout: 2 }); }
  const h = balik('--penuh', '--tulis', '--periksa', '--uji-editor');
  if (h.kode !== 0 || !/periksa .* sama|sama$/m.test(h.keluaran) || /BERBEDA|GAGAL|Berhenti/.test(h.keluaran)) { console.log('LATIHAN AWAL GAGAL'); process.exit(1); }
  console.log('LATIHAN AWAL LULUS: salinan = uji_' + skema + '. Sekarang jalankan satu siklus WO di Worker uji, lalu --tahap=akhir.');
} else {
  const h = balik('--tulis', '--periksa');
  const lulus = h.kode === 0 && !/BERBEDA|GAGAL|Berhenti/.test(h.keluaran);
  console.log(lulus ? `LATIHAN LULUS: cermin balik bertahap uji_${skema} → salinan, semua sheet sama.` : 'LATIHAN AKHIR GAGAL');
  if (!lulus) process.exit(1);
}
