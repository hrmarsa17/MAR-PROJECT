import './muat-env.js';
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CADANGAN YANG TIDAK PERNAH DIUJI PULIH BUKAN CADANGAN.
 *
 *   npm run uji:cadangan
 *
 * Yang diuji di sini bukan "apakah pg_dump menghasilkan berkas" — itu selalu
 * berhasil. Yang diuji: apakah berkas itu, dipulihkan ke basis data KOSONG,
 * menghasilkan isi yang sama dengan aslinya.
 *
 * Ketenangan tidak datang dari adanya berkas cadangan. Ia datang dari pernah
 * melihatnya pulih.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini membuat & membuang basis data. Harus port 5433.');
  process.exit(1);
}

const BIN = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\' : '';
const PSQL = process.env['PSQL_BIN'] ?? `${BIN}psql${BIN ? '.exe' : ''}`;

const asal = process.env['DATABASE_URL']!;
const induk = asal.replace(/\/[^/]+$/, '/postgres');
const salinan = asal.replace(/\/[^/]+$/, '/kmb_uji_pulih');
const DIR = resolve(process.cwd(), 'cadangan-uji');

const psql = (conn: string, q: string) =>
  execFileSync(PSQL, [conn, '-t', '-A', '-c', q], { encoding: 'utf8' }).trim();

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

/** Cap isi basis data: yang harus sama persis sebelum dan sesudah pulih. */
const CAP: [string, string][] = [
  ['job', 'SELECT count(*) FROM jobs'],
  ['unit', 'SELECT count(*) FROM units'],
  ['lingkup unit', 'SELECT count(*) FROM unit_sections'],
  ['orang', 'SELECT count(*) FROM mechanics'],
  ['token', 'SELECT count(*) FROM api_tokens'],
  ['work order', 'SELECT count(*) FROM work_orders'],
  ['poin mekanik', 'SELECT count(*) FROM mechanic_points'],
  ['migrasi tercatat', 'SELECT count(*) FROM schema_migrations'],
  ['faktor', 'SELECT count(*) FROM factors'],
  // Yang paling penting: RUPIAH. Kalau angka ini bergeser sedikit pun,
  // cadangannya tidak layak dipakai memulihkan payroll.
  ['total rupiah terbit', 'SELECT coalesce(sum(idr_value),0)::text FROM mechanic_points'],
  ['total base point katalog', 'SELECT coalesce(sum(base_points),0)::text FROM jobs'],
];

/* Keluarannya DITANGKAP, bukan diwariskan (`stdio: 'inherit'`). Di Windows,
   proses anak yang mewarisi stdio sambil dijalankan di dalam pipeline
   PowerShell bisa keluar dengan status bukan-nol tanpa galat yang sebenarnya —
   dan itu terbaca seperti cadangan yang gagal padahal ia berhasil. */
const jalan = (perintah: string, env: Record<string, string> = {}) =>
  execSync(perintah, { encoding: 'utf8', env: { ...process.env, ...env } });

console.log('\n─── mencadangkan basis data pengembangan ───');
rmSync(DIR, { recursive: true, force: true });
console.log(jalan('npx tsx scripts/cadangkan.ts --ke cadangan-uji').trim());

const dump = readdirSync(DIR).filter((f) => f.endsWith('.dump'))[0];
periksa('berkas cadangan terbentuk', !!dump, 'tidak ada .dump');
if (!dump) { process.exit(1); }

const sebelum = CAP.map(([nama, q]) => [nama, psql(asal, q)] as const);

console.log('\n─── memulihkan ke basis data KOSONG ───');
psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_pulih');
psql(induk, 'CREATE DATABASE kmb_uji_pulih');
try {
  const keluar = jalan(`npx tsx scripts/pulihkan.ts cadangan-uji/${dump} --ke "${salinan}"`);
  periksa('pemulihan selesai tanpa galat', /Pulih/.test(keluar), keluar.trim().slice(-120));

  console.log('\n─── isinya harus sama persis ───');
  for (const [nama, q] of CAP) {
    const a = sebelum.find(([n]) => n === nama)![1];
    const b = psql(salinan, q);
    periksa(`${nama.padEnd(24)} ${a}`, a === b, `asli ${a} vs pulih ${b}`);
  }

  console.log('\n─── basis data hasil pulih harus langsung bisa dipakai ───');
  const sisa = jalan('npx tsx scripts/migrasi.ts --izinkan-luar', { DATABASE_URL: salinan });
  /* Cadangan yang pulih tapi ketinggalan migrasi akan tampak sehat sampai ada
     kueri yang menyentuh kolom yang belum ada. */
  periksa('tidak ada migrasi yang tertinggal', /akan diterapkan : 0/.test(sisa),
    sisa.trim().slice(-60));
} finally {
  psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_pulih');
  rmSync(DIR, { recursive: true, force: true });
  console.log('\n  (basis data & berkas uji dibuang)');
}

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
