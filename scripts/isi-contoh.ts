import './muat-env.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Menjalankan ulang db/contoh.sql di basis data PENGEMBANGAN.
 *
 * Perlu karena uji integrasi berbagi basis data yang sama dan membersihkan
 * barisnya — sesudah `npm test`, layar jadi kosong dan itu mudah disangka bug.
 *
 * Menolak berjalan kalau DATABASE_URL bukan port pengembangan. Skrip yang
 * MENULIS tidak boleh mengandalkan kewaspadaan orang yang menjalankannya.
 */
const alamat = process.env['DATABASE_URL'] ?? '';
if (!/:5433\//.test(alamat)) {
  console.error(
    'DITOLAK. Skrip ini menulis data contoh dan hanya boleh jalan di basis data\n' +
    'pengembangan (port 5433). DATABASE_URL sekarang menunjuk ke tempat lain.',
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');

const berkas = resolve(process.cwd(), 'db/contoh.sql');
await sql.unsafe(readFileSync(berkas, 'utf8'));

const [wo] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM work_orders`;
const [unit] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM units`;
const [job] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM jobs`;
console.log(`Terisi. WO=${wo!.n}  unit=${unit!.n}  job=${job!.n}`);
await sql.end();
