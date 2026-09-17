import './muat-env.js';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MEMULIHKAN DARI CADANGAN
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx scripts/pulihkan.ts                       lihat cadangan yang ada
 *   npx tsx scripts/pulihkan.ts <berkas> --ke <url>   pulihkan ke sebuah basis data
 *
 * ── MENIMPA ADALAH TINDAKAN YANG HARUS DIUCAPKAN ────────────────────────────
 * Memulihkan berarti MENGHAPUS isi basis data tujuan dan menggantinya dengan
 * keadaan di masa lalu. Kalau tujuannya keliru, yang hilang adalah seluruh WO
 * yang masuk sesudah cadangan itu dibuat — dan tidak ada tombol batal.
 *
 * Karena itu tujuan WAJIB disebut lewat `--ke`, tidak pernah diambil diam-diam
 * dari DATABASE_URL. Skrip yang memulihkan ke "basis data yang kebetulan sedang
 * dipakai" adalah cara paling mudah kehilangan sehari kerja.
 */

const argv = process.argv.slice(2);
const ambil = (nama: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DIR = resolve(process.cwd(), ambil('--dari') ?? 'cadangan');
const PG_RESTORE = process.env['PG_RESTORE_BIN']
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe' : 'pg_restore');

const berkasArg = argv.find((a) => a.endsWith('.dump'));
const tujuan = ambil('--ke');

if (!berkasArg || !tujuan) {
  console.log('\nCadangan yang tersedia:\n');
  if (!existsSync(DIR)) {
    console.log(`  (direktori ${DIR} belum ada)\n`);
  } else {
    const d = readdirSync(DIR).filter((f) => f.endsWith('.dump')).sort().reverse();
    if (d.length === 0) console.log('  (belum ada cadangan)\n');
    for (const f of d) console.log(`  ${f}`);
    console.log('');
  }
  console.log('Untuk memulihkan, sebutkan berkas DAN tujuannya:\n');
  console.log('    npx tsx scripts/pulihkan.ts cadangan/mar-….dump \\');
  console.log('        --ke postgres://pengguna:sandi@host:5432/nama_basis_data\n');
  console.log('Tujuannya WAJIB disebut. Ia tidak pernah diambil dari DATABASE_URL —');
  console.log('memulihkan ke basis data yang kebetulan sedang dipakai adalah cara');
  console.log('paling mudah kehilangan sehari kerja.\n');
  process.exit(berkasArg || tujuan ? 1 : 0);
}

const berkas = resolve(process.cwd(), berkasArg);
if (!existsSync(berkas)) {
  console.error(`Berkas tidak ada: ${berkas}`);
  process.exit(1);
}

const samar = tujuan.replace(/:\/\/[^@]*@/, '://***@');
console.log(`\n▶  Memulihkan ${berkasArg}`);
console.log(`   ke ${samar}`);
console.log('\n   Isi basis data tujuan akan DIGANTI. Ini tidak bisa dibatalkan.\n');

/* `--clean --if-exists` membuang objek lama lebih dulu, jadi pemulihan ke basis
   data yang sudah berisi tidak berakhir setengah tertimpa.
   `--no-owner --no-privileges`: pemilik & hak di server tujuan hampir selalu
   berbeda dari server asal, dan memaksakannya membuat pemulihan gagal karena
   alasan yang tak ada hubungannya dengan datanya. */
execFileSync(PG_RESTORE, [
  '--dbname', tujuan, '--clean', '--if-exists', '--no-owner', '--no-privileges', berkas,
], { stdio: 'inherit' });

console.log('\n✅ Pulih.\n');
console.log('   Periksa sebelum dipakai:');
console.log('     npx tsx scripts/migrasi.ts --izinkan-luar     (harus 0 tertinggal)');
console.log('     npm run orang                                 (token siapa saja yang berlaku)\n');
