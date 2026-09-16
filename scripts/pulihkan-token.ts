import './muat-env.js';

/**
 * Menerbitkan token untuk siapa pun yang SEDANG TIDAK PUNYA token berlaku.
 *
 *   npx tsx scripts/pulihkan-token.ts
 *
 * ── KENAPA INI PERLU ADA ────────────────────────────────────────────────────
 * Skrip uji memakai token sungguhan untuk memanggil API. Sejak db/migrasi/009
 * hanya boleh ada SATU token berlaku per orang, jadi tiap uji mencabut token
 * yang ada sebelum memasang miliknya sendiri — persis seperti jalur produksi.
 * Saat selesai, ia menghapus tokennya sendiri, dan orangnya tertinggal tanpa
 * token berlaku sama sekali.
 *
 * Akibatnya: sesudah menjalankan seluruh suite, tak seorang pun bisa masuk
 * sampai token diterbitkan lagi. Itu wajar di basis data pengembangan, tapi
 * hanya kalau jalan keluarnya SATU perintah dan tidak perlu diingat caranya.
 *
 * ── YANG TIDAK DILAKUKAN SKRIP INI ──────────────────────────────────────────
 * Ia TIDAK menyentuh orang yang tokennya masih berlaku. Token yang sudah
 * dihafal orang tidak boleh berubah hanya karena ada yang menjalankan
 * pemulihan — itu justru keluhan yang mau dihilangkan.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: hanya untuk basis data pengembangan (port 5433).');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

const tanpa = await sql<{ id: number; tenant_id: number; kode: string; nama: string }[]>`
  SELECT m.id, m.tenant_id, m.mechanic_code::text AS kode, m.name AS nama
    FROM mechanics m
   WHERE m.is_active
     AND NOT EXISTS (
       SELECT 1 FROM api_tokens t
        WHERE t.mechanic_id = m.id AND t.is_active AND t.revoked_at IS NULL
          AND (t.expires_at IS NULL OR t.expires_at > now())
     )
   ORDER BY m.mechanic_code
`;

if (tanpa.length === 0) {
  console.log('\nSemua orang aktif sudah punya token berlaku. Tidak ada yang diubah.\n');
} else {
  console.log(`\n${tanpa.length} orang tidak punya token berlaku — diterbitkan:\n`);
  for (const m of tanpa) {
    const t = buatToken();
    await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
              VALUES (${m.tenant_id}, ${m.id}, ${t})`;
    console.log(`  ${m.kode.padEnd(14)} ${m.nama.padEnd(26)} ${t}`);
  }
  console.log('');
}

const utuh = await sql<{ kode: string; nama: string; token: string }[]>`
  SELECT m.mechanic_code::text AS kode, m.name AS nama, t.token
    FROM mechanics m
    JOIN api_tokens t ON t.mechanic_id = m.id
   WHERE m.is_active AND t.is_active AND t.revoked_at IS NULL
   ORDER BY m.mechanic_code
`;
console.log('Token berlaku sekarang:\n');
for (const u of utuh) console.log(`  ${u.kode.padEnd(14)} ${u.nama.padEnd(26)} ${u.token}`);
console.log('');

await sql.end();
