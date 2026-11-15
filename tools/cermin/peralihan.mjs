#!/usr/bin/env node
/**
 * Pelaksana prosedur migrasi (docs/SAKLAR.md, Tonggak 2), dijalankan workflow .github/workflows/peralihan.yml tiap
 * 5 menit. Selama --menit (bawaan 4), setiap 15 detik:
 *   1. ambil satu permintaan terbuka dari public.cermin_permintaan (db/bersama/cermin_permintaan.sql), yang dibuat
 *      Durable Object saklar di pintu saat tombol Mulai migrasi / Kembali ke GAS ditekan; jalankan alatnya; tulis
 *      hasilnya. Permintaan yang macet (mulai lebih dari 45 menit tanpa selesai, misalnya runner mati) diambil ulang;
 *   2. sekali per putaran: cermin balik bertahap untuk rumah yang izin tulisnya terbuka (balik.mjs --semua --tulis);
 *      rumah lain dilewati alat itu sendiri.
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
 * Opsi: --menit=4, --sekali (satu putaran tanpa menunggu; untuk uji).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const MENIT = Number(arg.menit || 4);
const JEDA_MS = 15000;
const MACET_MENIT = 45;
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
  const akhir = Date.now() + MENIT * 60000;
  let balikBerkala = false, gagal = false;
  try {
    for (;;) {
      const [p] = await sql`
        UPDATE public.cermin_permintaan SET mulai_at = now(), pelaksana = ${PELAKSANA}
         WHERE id = (SELECT id FROM public.cermin_permintaan
                      WHERE selesai_at IS NULL AND (mulai_at IS NULL OR mulai_at < now() - make_interval(mins => ${MACET_MENIT}))
                      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, skema, jenis`;
      if (p) {
        console.log(`permintaan #${p.id} ${p.jenis} ${p.skema}: dikerjakan`);
        let h;
        try { h = await kerjakan(p); } catch (e) { h = { berhasil: false, hasil: e.message }; }
        await sql`UPDATE public.cermin_permintaan SET selesai_at = now(), berhasil = ${h.berhasil}, hasil = ${String(h.hasil).slice(-4000)} WHERE id = ${p.id}`;
        console.log(`permintaan #${p.id} ${p.jenis} ${p.skema}: ${h.berhasil ? 'BERHASIL' : 'GAGAL'}\n${String(h.hasil).split('\n').map((x) => '  ' + x).join('\n')}`);
        if (!h.berhasil) gagal = true;
        continue;   // mungkin ada permintaan lain yang menunggu
      }
      if (!balikBerkala) {
        balikBerkala = true;
        const h = await jalankan('tools/cermin/balik.mjs', ['--semua', '--tulis', '--ringkas']);
        console.log(`cermin balik berkala (keluar ${h.kode}):\n${h.keluaran.split('\n').map((x) => '  ' + x).join('\n')}`);
        if (h.kode !== 0) gagal = true;
      }
      if (arg.sekali || Date.now() + JEDA_MS > akhir) break;
      await tidur(JEDA_MS);
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
  if (gagal) process.exitCode = 1;
}

utama().catch((e) => { console.error(`Berhenti: ${e.message}`); process.exit(1); });
