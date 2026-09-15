import './muat-env.js';

/**
 * Mencabut token berlebih: menyisakan SATU token aktif terbaru per orang.
 *
 * Perlu karena uji asap pernah meninggalkan tokennya menumpuk — pembersihannya
 * menghapus lewat id dan tak pernah cocok, tanpa berbunyi. Layar Monitoring dan
 * `npm run orang` menampilkan yang TERBARU, jadi token yang sudah dicatat orang
 * bisa berbeda dari yang tampil, dan itu terlihat seperti sistem yang berubah
 * sendiri.
 *
 * TIDAK menghapus barisnya, hanya mencabut: catatan siapa pernah memegang token
 * apa tetap utuh.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: hanya untuk basis data pengembangan (port 5433).');
  process.exit(1);
}
const { sql } = await import('../src/lib/db.js');

const dicabut = await sql<{ id: number }[]>`
  UPDATE api_tokens SET is_active = false, revoked_at = now()
   WHERE is_active AND revoked_at IS NULL
     AND id NOT IN (
       SELECT DISTINCT ON (mechanic_id) id FROM api_tokens
        WHERE is_active AND revoked_at IS NULL
        ORDER BY mechanic_id, created_at DESC
     )
  RETURNING id
`;
console.log(`${dicabut.length} token berlebih dicabut. Sisa: satu aktif per orang.`);
await sql.end();
