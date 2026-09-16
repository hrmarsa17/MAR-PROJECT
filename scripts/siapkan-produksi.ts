import './muat-env.js';
import { execSync } from 'node:child_process';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MENYIAPKAN BASIS DATA PRODUKSI — satu perintah, dari nol sampai bisa masuk
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx scripts/siapkan-produksi.ts \
 *       --db "postgres://postgres:SANDI@db.xxx.supabase.co:5432/postgres" \
 *       --kode ADM-001 --nama "Gabriel"
 *
 * Yang dikerjakannya, berurutan:
 *   1. memeriksa sambungan & kesiapan basis datanya
 *   2. memasang skema + baris kebijakan + seluruh migrasi
 *   3. membuat orang pertama beserta tokennya
 *   4. mencetak apa yang harus dilakukan berikutnya
 *
 * ── KENAPA IA MEMERIKSA DULU, PANJANG-LEBAR ─────────────────────────────────
 * Perintah ini dijalankan SEKALI, di tempat yang paling tidak boleh salah, oleh
 * orang yang sedang mengerjakan banyak hal lain. Kesalahan yang paling mahal
 * bukan galat yang berhenti dengan nyaring — melainkan yang JALAN TERUS dan
 * baru terasa berminggu-minggu kemudian.
 *
 * Dua yang khusus dijaga di sini:
 *
 *   ALAMAT POOLER, BUKAN LANGSUNG. Supabase memberi dua alamat. Yang porta 6543
 *   adalah pooler mode-transaksi — bagus untuk aplikasi, BURUK untuk memasang
 *   skema: DDL besar lewat pooler bisa putus di tengah dan meninggalkan skema
 *   separuh jadi. Migrasi harus lewat sambungan LANGSUNG (porta 5432).
 *
 *   BASIS DATA YANG SUDAH BERISI. Kalau di dalamnya sudah ada WO, ini bukan
 *   pemasangan baru — ini basis data yang sedang dipakai orang, dan skrip ini
 *   tidak boleh menyentuhnya.
 */

const argv = process.argv.slice(2);
const ambil = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const db = ambil('--db');
const kode = ambil('--kode');
const nama = ambil('--nama');

if (!db || !kode || !nama) {
  console.error(`
Pakai:

  npx tsx scripts/siapkan-produksi.ts \\
      --db "postgres://postgres:SANDI@db.xxxx.supabase.co:5432/postgres" \\
      --kode ADM-001 \\
      --nama "Gabriel"

  --db     Sambungan LANGSUNG dari Supabase (porta 5432), BUKAN pooler 6543.
           Ada di Project Settings -> Database -> Connection string -> URI.
  --kode   Kode orang pertama, mis. ADM-001
  --nama   Namanya
`);
  process.exit(1);
}

const samar = db.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
console.log(`\n════════════════════════════════════════════════════════════════`);
console.log('  MENYIAPKAN BASIS DATA PRODUKSI');
console.log(`════════════════════════════════════════════════════════════════\n`);
console.log(`  ${samar}\n`);

// ── 1. Periksa dulu, sentuh belakangan ─────────────────────────────────────
console.log('─── memeriksa ───');

if (/:6543\//.test(db) || /pooler\.supabase\.com/.test(db)) {
  console.error(`
  ❌ Ini alamat POOLER (porta 6543).

     Pooler bagus untuk aplikasi, tapi buruk untuk memasang skema: DDL besar
     lewat pooler bisa putus di tengah dan meninggalkan skema separuh jadi.

     Ambil sambungan LANGSUNG (porta 5432) di Supabase:
       Project Settings -> Database -> Connection string -> URI

     Alamat pooler tetap dipakai nanti — untuk Vercel, bukan untuk ini.
`);
  process.exit(1);
}

process.env['DATABASE_URL'] = db;
const { sql } = await import('../src/lib/db.js');

let versi = '';
try {
  versi = (await sql<{ v: string }[]>`SELECT version() AS v`)[0]!.v;
} catch (e) {
  console.error(`\n  ❌ Tidak bisa menyambung.\n     ${(e as Error).message}\n`);
  console.error('     Periksa: kata sandi benar? Alamatnya disalin utuh?\n');
  process.exit(1);
}
const angkaVersi = Number(/PostgreSQL (\d+)/.exec(versi)?.[1] ?? 0);
console.log(`  ✅ tersambung — PostgreSQL ${angkaVersi}`);
if (angkaVersi < 14) {
  console.error(`  ❌ Versi ${angkaVersi} terlalu tua. KMB butuh PostgreSQL 14 ke atas.\n`);
  process.exit(1);
}

/* citext dipakai hampir setiap kolom kode, pgcrypto untuk token. Keduanya ada
   di Supabase — tapi kalau suatu hari tidak, lebih baik ketahuan SEKARANG
   daripada di tengah pemasangan skema. */
for (const ext of ['citext', 'pgcrypto']) {
  const ada = (
    await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_available_extensions WHERE name = ${ext}`
  )[0]!.n;
  if (ada === 0) {
    console.error(`  ❌ Ekstensi "${ext}" tidak tersedia di server ini.\n`);
    await sql.end();
    process.exit(1);
  }
  console.log(`  ✅ ekstensi ${ext} tersedia`);
}

const adaWo = (
  await sql<{ ada: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name='work_orders') AS ada`
)[0]!.ada;

if (adaWo) {
  const isi = (
    await sql<{ wo: number; orang: number }[]>`
      SELECT (SELECT count(*)::int FROM work_orders) AS wo,
             (SELECT count(*)::int FROM mechanics) AS orang`
  )[0]!;
  console.log(`  ⚠️  basis data ini SUDAH berisi — ${isi.wo} WO, ${isi.orang} orang`);
  if (isi.wo > 0 || isi.orang > 0) {
    console.error(`
  ❌ Berhenti. Ini bukan basis data baru.

     Skrip ini hanya untuk pemasangan PERTAMA. Basis data yang sudah dipakai
     orang diperbarui dengan cara lain:

       npx tsx scripts/migrasi.ts --terapkan --izinkan-luar
`);
    await sql.end();
    process.exit(1);
  }
  console.log('     (tabelnya ada tapi kosong — dilanjutkan)');
} else {
  console.log('  ✅ basis data kosong — siap dipasang');
}
await sql.end();

// ── 2. Skema + kebijakan + migrasi ─────────────────────────────────────────
console.log('\n─── memasang skema, kebijakan, dan migrasi ───');
const jalan = (perintah: string) =>
  execSync(perintah, { encoding: 'utf8', env: { ...process.env, DATABASE_URL: db } });

try {
  const keluar = jalan('npx tsx scripts/migrasi.ts --awal --terapkan --izinkan-luar');
  for (const b of keluar.split('\n')) if (/✅|terpasang/.test(b)) console.log(`  ${b.trim()}`);
} catch (e) {
  console.error(`\n  ❌ Pemasangan gagal.\n${(e as Error).message}\n`);
  process.exit(1);
}

// ── 3. Orang pertama ───────────────────────────────────────────────────────
console.log('\n─── membuat orang pertama ───');
let token = '';
try {
  const keluar = jalan(
    `npx tsx scripts/orang-pertama.ts --kode "${kode}" --nama "${nama}" --izinkan-luar`);
  token = /TOKEN\s*:\s*([0-9a-f]{20})/.exec(keluar)?.[1] ?? '';
  console.log(`  ✅ ${kode} — ${nama} (superintendent, hak admin)`);
} catch (e) {
  console.error(`\n  ❌ Gagal membuat orang pertama.\n${(e as Error).message}\n`);
  process.exit(1);
}

// ── 4. Apa berikutnya ──────────────────────────────────────────────────────
const pooler = db
  .replace(':5432/', ':6543/')
  .replace(/db\.([a-z0-9]+)\.supabase\.co/, 'aws-0-ap-southeast-1.pooler.supabase.com');

console.log(`
════════════════════════════════════════════════════════════════
  SIAP. TOKEN ANDA:

      ${token}

  Simpan sekarang. Ia bisa dibaca lagi dari menu Admin nanti,
  tapi hanya oleh orang yang sudah bisa masuk — dan saat ini
  hanya Anda.
════════════════════════════════════════════════════════════════

  BERIKUTNYA — di vercel.com:

  1. Add New Project -> pilih repo ini
  2. Environment Variables, tambahkan SATU:

       Nama : DATABASE_URL
       Isi  : alamat POOLER (porta 6543) dari Supabase

     Bukan alamat yang barusan dipakai. Ambil yang
     "Transaction pooler" di Project Settings -> Database.
     Kira-kira bentuknya:

       ${pooler.replace(/:\/\/([^:]+):[^@]*@/, '://$1:SANDI@')}

  3. Deploy.

  Region sudah terkunci ke Singapura lewat vercel.json — pastikan
  proyek Supabase Anda juga di Singapura. Kalau berbeda, impor
  katalog besar akan putus di tengah; alasannya di docs/vercel.md.

  Sesudah hidup:
    - buka https://<proyek>.vercel.app/masuk, masukkan token di atas
    - Admin -> Orang & Token   : tambahkan mekanik, L1, L2
    - Admin -> Katalog Job     : unggah katalog lewat Excel
    - Admin -> Kesehatan Sistem: pastikan tak ada butir merah
════════════════════════════════════════════════════════════════
`);
