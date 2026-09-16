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

/**
 * Pagar kedua, dipasang 16 Sep 2026 sesudah data contoh dibersihkan.
 *
 * Sejak katalog KMB yang sesungguhnya masuk, basis data ini bukan lagi sekadar
 * tempat coba-coba. Menjalankan skrip ini di atasnya menyuntikkan kembali WO,
 * unit, dan job berawalan CONTOH — persis yang baru saja dihapus atas
 * permintaan Gabriel.
 *
 * Uji masih membutuhkannya, jadi ia tidak dimatikan; ia hanya berhenti berjalan
 * tanpa diminta dua kali. Untuk kembali bersih sesudahnya:
 *   npx tsx scripts/bersihkan-dummy.ts --terapkan
 */
const [asli] = await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM jobs
   WHERE NOT (job_code::text ILIKE 'CONTOH%' OR job_code::text ILIKE 'UJI%')
`;
if ((asli?.n ?? 0) > 100 && !process.argv.includes('--paksa')) {
  console.error(
    `\nDITOLAK. Basis data ini sudah berisi katalog SUNGGUHAN (${asli!.n} job).\n\n`
    + 'Skrip ini menyuntikkan data CONTOH — WO, unit, dan job palsu — yang\n'
    + 'bercampur dengan katalog asli dan harus dibersihkan lagi sesudahnya.\n\n'
    + 'Kalau memang itu yang Anda mau (mis. untuk menjalankan uji):\n'
    + '    npm run db:contoh -- --paksa\n\n'
    + 'Untuk kembali bersih sesudahnya:\n'
    + '    npx tsx scripts/bersihkan-dummy.ts --terapkan\n',
  );
  await sql.end();
  process.exit(1);
}

const berkas = resolve(process.cwd(), 'db/contoh.sql');
await sql.unsafe(readFileSync(berkas, 'utf8'));

const [wo] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM work_orders`;
const [unit] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM units`;
const [job] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM jobs`;
console.log(`Terisi. WO=${wo!.n}  unit=${unit!.n}  job=${job!.n}`);
await sql.end();
