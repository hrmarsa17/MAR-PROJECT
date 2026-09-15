import './muat-env.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Menjalankan satu berkas migrasi di basis data PENGEMBANGAN.
 *
 *   npx tsx scripts/migrasi.ts db/migrasi/001-token-terbaca.sql
 *
 * Berkasnya TIDAK boleh memuat BEGIN/COMMIT sendiri — transaksinya dibuka di
 * sini, supaya migrasi yang gagal di tengah tidak meninggalkan skema separuh
 * jadi.
 */
const berkas = process.argv[2];
if (!berkas) {
  console.error('Pakai: npx tsx scripts/migrasi.ts <berkas.sql>');
  process.exit(1);
}
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: migrasi mengubah skema. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const isi = readFileSync(resolve(process.cwd(), berkas), 'utf8');

await sql.begin(async (tx) => { await tx.unsafe(isi).simple(); });
console.log(`Migrasi selesai: ${berkas}`);
await sql.end();
