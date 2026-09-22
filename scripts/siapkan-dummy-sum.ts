import './muat-env.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * MENYUNTIKKAN DATA DUMMY SISTEM PT SUM KE BASIS DATA.
 *
 *   npx tsx scripts/siapkan-dummy-sum.ts --jauh
 *   # atau:
 *   DATABASE_URL="<connection_string>" npx tsx scripts/siapkan-dummy-sum.ts --izinkan-luar
 *
 * Mengisi tenant PT SUM:
 *   - Sections & Master Units SUM (Excavator, Truck, Loader, Dozer)
 *   - 94 Komponen & Joblist SUM (COM-001 s/d COM-094)
 *   - Akun personil SUM (Superintendent, Supervisor, Mekanik)
 *   - Token login untuk masing-masing user SUM
 *   - Work Order berbagai status (Assigned, In Progress, L1, L2, Approved, Expired, Expired Reported, Expired Reopened)
 */

const alamat = process.env['DATABASE_URL'] ?? '';
if (!alamat) {
  console.error('\n❌ DATABASE_URL belum ditentukan.');
  process.exit(1);
}

if (!/:5433\//.test(alamat) && !process.argv.includes('--izinkan-luar') && !process.argv.includes('--jauh')) {
  console.error(
    '\n❌ DITOLAK. DATABASE_URL bukan basis data lokal (port 5433).\n' +
    '   Jika ingin menyuntikkan dummy SUM ke cloud/Supabase, tambahkan --izinkan-luar atau --jauh:\n\n' +
    '       npx tsx scripts/siapkan-dummy-sum.ts --jauh\n'
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');

console.log('⏳ Menjalankan db/dummy-sum.sql...');
const berkas = resolve(process.cwd(), 'db/dummy-sum.sql');
await sql.unsafe(readFileSync(berkas, 'utf8'));

const [mek] = await sql<{ n: string }[]>`
  SELECT count(*) AS n FROM mechanics m 
  JOIN tenants t ON t.id = m.tenant_id 
  WHERE t.code = 'SUM'
`;
const [wo] = await sql<{ n: string }[]>`
  SELECT count(*) AS n FROM work_orders w 
  JOIN tenants t ON t.id = w.tenant_id 
  WHERE t.code = 'SUM'
`;
const [unit] = await sql<{ n: string }[]>`
  SELECT count(*) AS n FROM units u 
  JOIN tenants t ON t.id = u.tenant_id 
  WHERE t.code = 'SUM'
`;
const [job] = await sql<{ n: string }[]>`
  SELECT count(*) AS n FROM jobs j 
  JOIN tenants t ON t.id = j.tenant_id 
  WHERE t.code = 'SUM'
`;

console.log('\n✅ SELESAI! Data dummy PT SUM berhasil dipasang:');
console.log(`   • Personil SUM : ${mek!.n} orang`);
console.log(`   • Unit SUM     : ${unit!.n} unit`);
console.log(`   • Joblist SUM  : ${job!.n} komponen/pekerjaan`);
console.log(`   • Work Order   : ${wo!.n} WO`);

console.log('\n🔑 DAFTAR TOKEN LOGIN PT SUM:');
console.log('   • Superintendent (L2) : sum-sdan3i12d (Pandu Wijaksono)');
console.log('   • Supervisor (L1)     : sum-maman0123 (Maman Suryadi)');
console.log('   • Mekanik SUM 1       : sum-ahmad0123 (Ahmad Fauzi)');
console.log('   • Mekanik SUM 2       : sum-budi01234 (Budi Santoso)');
console.log('   • Mekanik SUM 3       : sum-charlie12 (Charlie Wijaya)');
console.log('   • Mekanik Tyreman     : sum-dani01234 (Dani Pratama)');

await sql.end();
