/**
 * Menerbitkan token untuk seorang mekanik.
 *
 *   npx tsx scripts/buat-token.ts UJI-L2
 *
 * Menerbitkan token BARU akan mencabut token lama orang itu — artinya mekanik
 * harus memasukkan yang baru di HP-nya. Untuk mekanik yang cuma LUPA tokennya,
 * jangan pakai skrip ini: bukakan layar Monitoring dan salin token yang sudah
 * ada. Itu memang gunanya layar itu.
 */
/* Satu-satunya skrip yang sampai 17 Sep 2026 masih menyalin pemuat .env-nya
   sendiri, sisa dari sebelum `muat-env.ts` ada. Akibatnya `--jauh` diam saja di
   sini: bendera yang tampak bekerja padahal tidak menyentuh apa pun — bentuk
   kegagalan yang persis sama dengan empat bug yang sudah menggigit proyek ini.
   Sekarang memakai pemuat bersama seperti 38 skrip lainnya. */
import './muat-env.js';

/* ════════════════════════════════════════════════════════════════════════════
   SKRIP INI MENGGANTI TOKEN ORANG — DAN TIDAK MENINGGALKAN JEJAK
   ════════════════════════════════════════════════════════════════════════════

   Ia menulis langsung ke tabel `api_tokens`, bukan lewat `terbitkanToken()`.
   Artinya tidak ada baris `admin_token_ganti` di `audit_logs`: token seorang
   mekanik berganti, HP-nya berhenti bisa masuk di tengah shift, dan tidak ada
   satu pun cara mengetahui siapa yang melakukannya atau kapan.

   Sampai 17 Sep 2026 ia berjalan pada BASIS DATA MANA PUN yang kebetulan
   ditunjuk DATABASE_URL — termasuk produksi. Namanya pun pendek dan nyaman
   (`npm run token`), jenis perintah yang diketik karena kebiasaan.

   Di produksi, penggantian token dikerjakan lewat Admin → Orang & Token →
   Ganti token. Di sana ia tercatat lengkap dengan siapa yang menekannya.

   Gabriel, 17 Sep 2026: "token jangan berubah-ubah terus tiap kita ngoding,
   karena ini sangat berbahaya apabila nanti sudah dipakai produksi."
*/
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')
    && !process.argv.includes('--izinkan-luar')) {
  console.error(
    '\n❌ DITOLAK. DATABASE_URL bukan basis data pengembangan (port 5433).\n\n'
    + '   Skrip ini MENCABUT token orang lalu menerbitkan yang baru, dan TIDAK\n'
    + '   meninggalkan jejak audit sama sekali. Di basis data yang dipakai orang\n'
    + '   sungguhan, itu berarti seseorang tiba-tiba tidak bisa masuk dan tak ada\n'
    + '   yang tahu kenapa.\n\n'
    + '   Yang benar untuk produksi:\n'
    + '     • LUPA tokennya   → Admin → Orang & Token, salin yang sudah ada.\n'
    + '                         Token TIDAK perlu diganti hanya karena lupa.\n'
    + '     • Memang harus    → Admin → Orang & Token → Ganti token.\n'
    + '       diganti           Tercatat siapa yang menggantinya.\n\n'
    + '   Kalau Anda benar-benar bermaksud melakukannya dari baris perintah:\n'
    + '       ... --izinkan-luar\n',
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

const kode = process.argv[2];
if (!kode) {
  console.error('Pakai: npx tsx scripts/buat-token.ts <kode_mekanik>');
  process.exit(1);
}

const mek = (
  await sql<{ id: number; tenant_id: number; tenant_code: string; name: string; role: string }[]>`
    SELECT m.id, m.tenant_id, t.code::text as tenant_code, m.name, m.role::text
      FROM mechanics m
      JOIN tenants t ON t.id = m.tenant_id
     WHERE m.mechanic_code = ${kode} AND m.is_active
  `
)[0];

if (!mek) {
  console.error(`Mekanik dengan kode "${kode}" tidak ditemukan.`);
  await sql.end();
  process.exit(1);
}

const token = buatToken(mek.tenant_code);
await sql`
  UPDATE api_tokens SET is_active = false, revoked_at = now()
   WHERE mechanic_id = ${mek.id} AND is_active
`;
await sql`
  INSERT INTO api_tokens (tenant_id, mechanic_id, token)
  VALUES (${mek.tenant_id}, ${mek.id}, ${token})
`;

console.log('');
console.log(`  ${mek.name}  (${mek.role})`);
console.log(`  TOKEN: ${token}`);
console.log('');
console.log('  Token lama orang ini dicabut. Yang ini bisa dibaca lagi kapan saja');
console.log('  di layar Monitoring — mekanik yang lupa tak perlu token baru.');
console.log('');

await sql.end();
