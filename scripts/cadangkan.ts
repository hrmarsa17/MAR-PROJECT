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

/* `--ke` yang ada tapi KOSONG bukan "pakai bawaan".
   Sebuah berkas .cmd yang memanggil `--ke "%TUJUAN%"` dengan TUJUAN tak
   tersetel mengirim string kosong, dan `resolve(cwd, '')` adalah direktori
   kerja — yaitu akar proyek. Hasilnya: dump berisi SELURUH basis data mendarat
   di dalam repo, tanpa satu pun peringatan. Sudah terjadi sekali, 16 Sep 2026,
   saat sebuah templat .cmd rusak karena karakter non-ASCII. */
const keArg = ambil('--ke');
if (keArg !== undefined && keArg.trim() === '') {
  console.error('\n❌ --ke diberikan tapi kosong. Sebutkan direktorinya, atau '
    + 'hilangkan --ke sama sekali untuk memakai ./cadangan.\n');
  process.exit(1);
}
const DIR = resolve(process.cwd(), keArg ?? 'cadangan');
const SIMPAN_HARI = Number(ambil('--simpan') ?? 14);

const PG_DUMP = process.env['PG_DUMP_BIN']
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe' : 'pg_dump');

const alamat = process.env['DATABASE_URL'];
if (!alamat) {
  console.error('DATABASE_URL belum diisi.');
  process.exit(1);
}

/* POOLER MODE TRANSAKSI TIDAK BISA DIPAKAI MENCADANGKAN.
   `pg_dump` bekerja dalam SATU sesi: ia membuka transaksi repeatable-read lalu
   membaca seluruh tabel di dalamnya, supaya potretnya konsisten pada satu
   titik waktu. Pooler mode transaksi (porta 6543) justru memindahkan transaksi
   antar koneksi — itu yang membuatnya hemat, dan itu pula yang membuatnya tidak
   cocok di sini.

   Alamat inilah yang paling mungkin tersalin ke tugas terjadwal, karena ia yang
   dipakai Vercel dan karena itu yang paling sering ada di papan klip. Ditolak
   dengan menyebut alamat penggantinya — bukan dibiarkan menghasilkan cadangan
   yang mungkin tidak utuh dan baru ketahuan saat dibutuhkan. */
if (/:6543\//.test(alamat)) {
  console.error(
    '\n❌ DITOLAK: alamat ini pooler MODE TRANSAKSI (porta 6543).\n\n'
    + '   pg_dump butuh satu sesi utuh; mode transaksi tidak menyediakannya.\n'
    + '   Pakai salah satu dari Supabase → Connect:\n'
    + '     • Session pooler   porta 5432 (IPv4, paling aman dipakai di sini)\n'
    + '     • Direct connection porta 5432 (IPv6 saja)\n',
  );
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
/* UKURAN BUKAN BUKTI ISINYA ADA.
   Pemeriksaan di atas hanya menangkap cadangan yang nyaris kosong. Sebuah dump
   bisa berukuran wajar, berstatus 0, dan tetap kehilangan tabel yang justru
   paling dibutuhkan — misalnya karena hak baca peran yang dipakai berbeda dari
   yang dikira. Yang seperti itu baru ketahuan saat dipulihkan, dan saat itu
   sudah terlambat menurut definisi.

   Maka daftar isinya dibaca kembali dan tabel-tabel yang menyimpan UANG dan
   IDENTITAS harus benar-benar ada di sana. */
const WAJIB = [
  'work_orders', 'mechanic_points', 'scoring_snapshots',
  'jobs', 'units', 'mechanics', 'api_tokens', 'pay_rates', 'factors',
];
const PG_RESTORE = process.env['PG_RESTORE_BIN']
  ?? PG_DUMP.replace(/pg_dump(\.exe)?$/, (s) => s.replace('pg_dump', 'pg_restore'));
const daftar = execFileSync(PG_RESTORE, ['--list', berkas], { encoding: 'utf8' });
const hilang = WAJIB.filter(
  (t) => !new RegExp(`TABLE DATA public ${t}\\b`).test(daftar),
);
if (hilang.length > 0) {
  console.error(`\n❌ Cadangan tidak memuat ${hilang.length} tabel yang wajib ada: `
    + `${hilang.join(', ')}\n   Berkasnya TIDAK bisa diandalkan. Periksa hak baca `
    + 'peran pada DATABASE_URL yang dipakai.\n');
  process.exit(1);
}

console.log(`✅ ${(ukuran / 1024 / 1024).toFixed(1)} MB`
  + `, ${WAJIB.length} tabel inti diperiksa ada`);

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
