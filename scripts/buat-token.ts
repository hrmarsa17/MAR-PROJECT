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
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const env = resolve(process.cwd(), '.env');
if (existsSync(env)) {
  for (const baris of readFileSync(env, 'utf8').split('\n')) {
    const b = baris.trim();
    if (!b || b.startsWith('#')) continue;
    const i = b.indexOf('=');
    if (i < 0) continue;
    const k = b.slice(0, i).trim();
    if (process.env[k] === undefined) {
      process.env[k] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

const kode = process.argv[2];
if (!kode) {
  console.error('Pakai: npx tsx scripts/buat-token.ts <kode_mekanik>');
  process.exit(1);
}

const mek = (
  await sql<{ id: number; tenant_id: number; name: string; role: string }[]>`
    SELECT id, tenant_id, name, role::text FROM mechanics
     WHERE mechanic_code = ${kode} AND is_active
  `
)[0];

if (!mek) {
  console.error(`Mekanik dengan kode "${kode}" tidak ditemukan.`);
  await sql.end();
  process.exit(1);
}

const token = buatToken();
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
