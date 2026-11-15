#!/usr/bin/env node
/**
 * Pelaksana prosedur migrasi (docs/SAKLAR.md, Tonggak 2), dijalankan workflow .github/workflows/peralihan.yml
 * (jadwal tiap 5 menit, tetapi GitHub nyatanya menjalankannya ±1 jam sekali; 15 Nov: 03.51, 04.39, 05.29, 06.18, 07.24
 * UTC), atau dijalankan manual tepat sebelum tombol ditekan. Setiap 15 detik:
 *   1. ambil satu permintaan terbuka dari public.cermin_permintaan (db/bersama/cermin_permintaan.sql), yang dibuat
 *      Durable Object saklar di pintu saat tombol Mulai migrasi / Kembali ke GAS ditekan; jalankan alatnya; tulis
 *      hasilnya. Permintaan yang macet (mulai lebih dari 45 menit tanpa selesai, misalnya runner mati) diambil ulang;
 *   2. tiap 5 menit (pertama kali di awal putaran): cermin balik bertahap untuk rumah yang izin tulisnya terbuka
 *      (balik.mjs --semua --tulis); rumah lain dilewati alat itu sendiri.
 * Lama putaran: menunggu permintaan pertama selama --menit (bawaan 4). Sesudah satu permintaan selesai, putaran tetap
 * menunggu --lanjut menit lagi (bawaan 20): prosedur Mulai meminta dua pekerjaan berurutan (sinkron terakhir, lalu
 * cermin balik awal), dan selama prosedur berjalan saklar `menutup` menahan semua tulisan, jadi langkah berikutnya
 * tidak boleh menunggu jadwal GitHub. Permintaan baru tidak diambil lagi sesudah --maks menit (bawaan 150) sejak
 * putaran dimulai; timeout job di workflow lebih panjang dari itu.
 *
 * Jenis permintaan:
 *   sinkron_akhir  sinkron.mjs --skema=<s> --periksa --akhir      berhasil: keluar 0 dan "diperiksa N/N sama"
 *                  (--akhir: satu-satunya sinkron maju yang boleh menulis sesudah prosedur Mulai mengunci sinkron maju,
 *                  db/bersama/cermin_maju.sql)
 *   balik_awal     balik.mjs --penuh --tulis --periksa --uji-editor berhasil: keluar 0 dan "periksa N/N sama"
 *   balik_akhir    balik.mjs --tulis --periksa; bila gagal diulang dengan --penuh
 * Keluaran alat selalu --ringkas: repo publik, log Actions terbaca siapa saja.
 *
 * Variabel lingkungan: sama dengan sinkron.mjs (GOOGLE_SA_KEY_FILE, <SKEMA>_SPREADSHEET_ID, DATABASE_URL).
 * Opsi: --menit=4, --lanjut=20, --maks=150, --sekali (satu putaran tanpa menunggu; untuk uji),
 *       --hanya=<awalan skema> (mis. latihan_: pelaksana lokal rumah latihan). Hanya permintaan rumah yang punya
 *       <SKEMA>_SPREADSHEET_ID di lingkungan yang diambil (skemaDilayani).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const angka = (x, awal, min, maks) => { const n = Number(x); return Number.isFinite(n) && n >= min && n <= maks ? n : awal; };
const MENIT = angka(arg.menit, 4, 1, 150);
const LANJUT_MENIT = angka(arg.lanjut, 20, 1, 60);
const MAKS_MENIT = angka(arg.maks, 150, 1, 300);
const BALIK_MENIT = 5;
const JEDA_MS = 15000;
const MACET_MENIT = 45;

// ── Jadwal putaran (murni; diuji di tests/peralihan.test.ts) ────────────────────
// akhir: putaran berhenti menunggu; batas: sesudahnya tidak ada permintaan baru yang diambil (akhir ≤ batas).
export function jadwalAwal(mulai, { menit = 4, maks = 150 } = {}) {
  const batas = mulai + maks * 60000;
  return { akhir: Math.min(batas, mulai + menit * 60000), batas };
}
// Sesudah satu permintaan selesai: tunggu permintaan berikutnya `lanjut` menit lagi, tidak melewati batas.
export function perpanjang(j, sekarang, lanjut = 20) {
  return { ...j, akhir: Math.min(j.batas, Math.max(j.akhir, sekarang + lanjut * 60000)) };
}
export const bolehAmbil = (j, sekarang) => sekarang < j.batas;
export const waktunyaBalik = (terakhir, sekarang, menit = 5) => terakhir === null || sekarang - terakhir >= menit * 60000;
export const sudahAkhir = (j, sekarang, jedaMs = 15000) => sekarang + jedaMs > j.akhir;

// Rumah yang dilayani pelaksana ini: yang punya <SKEMA>_SPREADSHEET_ID di lingkungannya, dipersempit --hanya=<awalan>.
// Permintaan rumah lain TIDAK diambil (dibiarkan untuk pelaksana yang melayaninya), bukan diambil lalu digagalkan:
// pelaksana GitHub hanya mengenal rumah dari rahasia CERMIN_RUMAH(_LATIHAN), pelaksana lokal rumah latihan memakai
// abadiops.env dengan --hanya=latihan_ (uji kering di produksi, 15 Nov).
export function skemaDilayani(lingkungan, hanya = '') {
  return Object.entries(lingkungan)
    .map(([k, v]) => [k.match(/^([A-Z][A-Z0-9_]*)_SPREADSHEET_ID$/), v])
    .filter(([m, v]) => m && v)
    .map(([m]) => m[1].toLowerCase())
    .filter((s) => !hanya || s.startsWith(hanya))
    .sort();
}
const DILAYANI = skemaDilayani(process.env, typeof arg.hanya === 'string' ? arg.hanya : '');
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const PELAKSANA = process.env.GITHUB_RUN_ID ? `github-${process.env.GITHUB_RUN_ID}` : `lokal-${process.pid}`;

// Jalankan satu alat (node <berkas> <opsi>), kembalikan { kode, keluaran } (stdout + stderr, dipotong).
function jalankan(berkas, opsi) {
  return new Promise((selesai) => {
    const p = spawn(process.execPath, [path.join(AKAR, berkas), ...opsi], { cwd: AKAR, env: process.env });
    let keluaran = '';
    const tampung = (d) => { keluaran = (keluaran + d.toString()).slice(-20000); };
    p.stdout.on('data', tampung);
    p.stderr.on('data', tampung);
    p.on('close', (kode) => selesai({ kode, keluaran: keluaran.trim() }));
    p.on('error', (e) => selesai({ kode: -1, keluaran: e.message }));
  });
}

const semuaSama = (teks, kata) => {
  const m = [...String(teks).matchAll(new RegExp(`${kata} (\\d+)/(\\d+) sama`, 'g'))];
  return m.length > 0 && m.every((x) => x[1] === x[2] && Number(x[2]) > 0);
};
const lolos = (h, kata) => h.kode === 0 && semuaSama(h.keluaran, kata) && !/DILEWATI|GAGAL|Berhenti/.test(h.keluaran);

async function kerjakan(p) {
  const s = `--skema=${p.skema}`;
  if (p.jenis === 'sinkron_akhir') {
    const h = await jalankan('tools/cermin/sinkron.mjs', [s, '--periksa', '--akhir', '--ringkas']);
    return { berhasil: lolos(h, 'diperiksa'), hasil: h.keluaran };
  }
  if (p.jenis === 'balik_awal') {
    const h = await jalankan('tools/cermin/balik.mjs', [s, '--penuh', '--tulis', '--periksa', '--uji-editor', '--ringkas']);
    return { berhasil: lolos(h, 'periksa'), hasil: h.keluaran };
  }
  if (p.jenis === 'balik_akhir') {
    const h = await jalankan('tools/cermin/balik.mjs', [s, '--tulis', '--periksa', '--ringkas']);
    if (lolos(h, 'periksa')) return { berhasil: true, hasil: h.keluaran };
    const h2 = await jalankan('tools/cermin/balik.mjs', [s, '--penuh', '--tulis', '--periksa', '--ringkas']);
    return { berhasil: lolos(h2, 'periksa'), hasil: `bertahap: ${h.keluaran}\npenuh: ${h2.keluaran}` };
  }
  return { berhasil: false, hasil: `jenis tidak dikenal: ${p.jenis}` };
}

async function utama() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi');
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 20, idle_timeout: 20, onnotice: () => {} });
  let jadwal = jadwalAwal(Date.now(), { menit: MENIT, maks: MAKS_MENIT });
  let balikTerakhir = null, gagal = false;
  const jam = (t) => new Date(t).toISOString().slice(11, 16) + ' UTC';
  console.log(`menunggu permintaan sampai ${jam(jadwal.akhir)} (diperpanjang ${LANJUT_MENIT} menit sesudah tiap permintaan, paling lama sampai ${jam(jadwal.batas)}); melayani ${DILAYANI.length} rumah`);
  try {
    for (;;) {
      const [p] = bolehAmbil(jadwal, Date.now()) && DILAYANI.length ? await sql`
        UPDATE public.cermin_permintaan SET mulai_at = now(), pelaksana = ${PELAKSANA}
         WHERE id = (SELECT id FROM public.cermin_permintaan
                      WHERE selesai_at IS NULL AND skema = ANY(${DILAYANI}::text[])
                        AND (mulai_at IS NULL OR mulai_at < now() - make_interval(mins => ${MACET_MENIT}))
                      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, skema, jenis` : [];
      if (p) {
        console.log(`permintaan #${p.id} ${p.jenis} ${p.skema}: dikerjakan`);
        let h;
        try { h = await kerjakan(p); } catch (e) { h = { berhasil: false, hasil: e.message }; }
        await sql`UPDATE public.cermin_permintaan SET selesai_at = now(), berhasil = ${h.berhasil}, hasil = ${String(h.hasil).slice(-4000)} WHERE id = ${p.id}`;
        console.log(`permintaan #${p.id} ${p.jenis} ${p.skema}: ${h.berhasil ? 'BERHASIL' : 'GAGAL'}\n${String(h.hasil).split('\n').map((x) => '  ' + x).join('\n')}`);
        if (!h.berhasil) gagal = true;
        // Langkah prosedur berikutnya biasanya diminta beberapa menit kemudian: jangan sampai menunggu jadwal GitHub.
        jadwal = perpanjang(jadwal, Date.now(), LANJUT_MENIT);
        console.log(`menunggu permintaan berikutnya sampai ${jam(jadwal.akhir)}`);
        continue;   // mungkin ada permintaan lain yang menunggu
      }
      if (waktunyaBalik(balikTerakhir, Date.now(), BALIK_MENIT)) {
        balikTerakhir = Date.now();
        // Dengan --hanya: hanya rumah yang dilayani (pelaksana lokal rumah latihan tidak menyentuh rumah asli).
        const daftar = arg.hanya ? DILAYANI.map((s) => [`--skema=${s}`]) : [['--semua']];
        for (const sasaran of daftar) {
          const h = await jalankan('tools/cermin/balik.mjs', [...sasaran, '--tulis', '--ringkas']);
          console.log(`cermin balik berkala (keluar ${h.kode}):\n${h.keluaran.split('\n').map((x) => '  ' + x).join('\n')}`);
          if (h.kode !== 0) gagal = true;
        }
      }
      if (arg.sekali || sudahAkhir(jadwal, Date.now(), JEDA_MS)) break;
      await tidur(JEDA_MS);
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
  if (gagal) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  utama().catch((e) => { console.error(`Berhenti: ${e.message}`); process.exit(1); });
}
