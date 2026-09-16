import './muat-env.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CADANGAN BASIS DATA
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx scripts/cadangkan.ts [--ke <direktori>] [--simpan <hari>]
 *
 * ── KENAPA FORMAT custom, BUKAN .sql BIASA ──────────────────────────────────
 * `pg_dump -Fc` menghasilkan berkas yang bisa DIPULIHKAN SEBAGIAN — satu tabel
 * saja, atau semuanya — dan ia terkompresi. Berkas .sql polos hanya bisa
 * ditelan bulat-bulat, dan saat yang dibutuhkan cuma satu tabel yang tak
 * sengaja terhapus, "telan bulat-bulat" berarti mengembalikan juga seluruh WO
 * yang masuk sesudahnya.
 *
 * ── CADANGAN YANG TIDAK PERNAH DIUJI PULIH BUKAN CADANGAN ───────────────────
 * Karena itu ada `scripts/pulihkan.ts`, dan ada `scripts/uji-cadangan.ts` yang
 * benar-benar memulihkan ke basis data sementara lalu membandingkan isinya.
 * Yang menenangkan bukan adanya berkas cadangan, melainkan bukti bahwa ia
 * pernah dipulihkan.
 */

const argv = process.argv.slice(2);
const ambil = (nama: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DIR = resolve(process.cwd(), ambil('--ke') ?? 'cadangan');
const SIMPAN_HARI = Number(ambil('--simpan') ?? 14);

const PG_DUMP = process.env['PG_DUMP_BIN']
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe' : 'pg_dump');

const alamat = process.env['DATABASE_URL'];
if (!alamat) {
  console.error('DATABASE_URL belum diisi.');
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });

/* Nama berkas memuat tanggal DAN jam sampai detik. Dua cadangan di hari yang
   sama adalah hal biasa — sebelum migrasi, lalu sesudahnya — dan yang kedua
   tidak boleh menimpa yang pertama tanpa ada yang tahu. */
const cap = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const berkas = resolve(DIR, `kmb-${cap}.dump`);

console.log(`\n▶  Mencadangkan ke ${berkas}`);
execFileSync(PG_DUMP, [alamat, '--format=custom', '--file', berkas], { stdio: 'inherit' });

const ukuran = statSync(berkas).size;
if (ukuran < 1024) {
  /* pg_dump bisa keluar dengan status 0 dan menulis berkas nyaris kosong bila
     basis datanya salah. Cadangan kosong yang dikira berhasil lebih berbahaya
     daripada cadangan yang gagal dengan nyaring. */
  console.error(`\n❌ Berkas cadangan cuma ${ukuran} bita — hampir pasti bukan `
    + 'cadangan yang sah. Periksa DATABASE_URL.');
  process.exit(1);
}
console.log(`✅ ${(ukuran / 1024 / 1024).toFixed(1)} MB`);

// ── Pangkas yang lama ───────────────────────────────────────────────────────
const batas = Date.now() - SIMPAN_HARI * 86_400_000;
let dibuang = 0;
for (const f of readdirSync(DIR)) {
  if (!f.startsWith('kmb-') || !f.endsWith('.dump')) continue;
  const p = resolve(DIR, f);
  if (statSync(p).mtimeMs < batas) { unlinkSync(p); dibuang++; }
}

const sisa = readdirSync(DIR).filter((f) => f.endsWith('.dump'));
console.log(`   ${sisa.length} cadangan tersimpan`
  + (dibuang ? `, ${dibuang} yang lebih tua dari ${SIMPAN_HARI} hari dibuang` : '')
  + '\n');
