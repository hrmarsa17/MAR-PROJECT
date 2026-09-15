import './muat-env.js';

/** Daftar akun di basis data pengembangan. Read-only. */
const { sql } = await import('../src/lib/db.js');

const rows = await sql<
  { kode: string; nama: string; peran: string; performa: boolean; uji: boolean }[]
>`
  SELECT mechanic_code::text AS kode, name AS nama, role::text AS peran,
         may_view_performance AS performa, is_test_account AS uji
    FROM mechanics
   ORDER BY CASE role WHEN 'superintendent' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END,
            id
   LIMIT 15
`;
for (const r of rows) {
  console.log(
    `${r.kode.padEnd(12)} ${r.nama.padEnd(22)} ${r.peran.padEnd(15)}` +
    ` performa=${r.performa ? 'ya ' : 'tdk'}${r.uji ? '  [uji]' : ''}`,
  );
}
await sql.end();
