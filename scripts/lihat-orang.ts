import './muat-env.js';

/**
 * Daftar akun + token aktifnya di basis data pengembangan. Read-only.
 *
 *   npm run orang
 *
 * Token bisa dibaca lagi di sini karena memang disimpan terbaca — keputusan
 * Gabriel 15 Sep 2026; alasannya di db/schema.sql pada tabel api_tokens.
 * Layar Monitoring menampilkan hal yang sama untuk mekanik.
 */
const { sql } = await import('../src/lib/db.js');

const rows = await sql<{
  kode: string; nama: string; peran: string;
  performa: boolean; uji: boolean; token: string | null; section: string | null;
}[]>`
  SELECT m.mechanic_code::text AS kode,
         m.name                AS nama,
         m.role::text          AS peran,
         m.may_view_performance AS performa,
         m.is_test_account     AS uji,
         t.token,
         sec.daftar            AS section
    FROM mechanics m
    LEFT JOIN LATERAL (
      SELECT at.token FROM api_tokens at
       WHERE at.mechanic_id = m.id AND at.is_active AND at.revoked_at IS NULL
       ORDER BY at.created_at DESC LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(ms.section::text, ',' ORDER BY ms.section::text) AS daftar
        FROM mechanic_sections ms WHERE ms.mechanic_id = m.id
    ) sec ON true
   WHERE m.tenant_id = (SELECT id FROM tenants WHERE code = 'KMB')
     AND m.is_active
   ORDER BY CASE m.role WHEN 'superintendent' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END,
            m.name
`;

const PERAN: Record<string, string> = {
  superintendent: 'L2 · Manager',
  supervisor:     'L1 · Planner',
  mechanic:       'Mekanik',
};

console.log('');
console.log('  KODE          NAMA                      PERAN           SECTION    TOKEN');
console.log('  ' + '─'.repeat(94));
let peranTerakhir = '';
for (const r of rows) {
  if (r.peran !== peranTerakhir) { console.log(''); peranTerakhir = r.peran; }
  const tanda = [r.uji ? 'uji' : '', r.performa ? '' : ''].filter(Boolean).join(' ');
  console.log(
    '  ' +
    r.kode.padEnd(14) +
    r.nama.slice(0, 24).padEnd(26) +
    (PERAN[r.peran] ?? r.peran).padEnd(16) +
    (r.section ?? '—').padEnd(11) +
    (r.token ?? '(belum punya token)') +
    (tanda ? `  [${tanda}]` : ''),
  );
}
console.log('');
console.log('  Masuk lewat http://localhost:3000/masuk — tempel tokennya di sana.');
console.log('  Menu Performa hanya terbuka untuk L2 dan siapa pun yang penanda');
console.log('  may_view_performance-nya menyala.');
console.log('');

await sql.end();
