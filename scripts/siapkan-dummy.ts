import './muat-env.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * MENYUNTIKKAN DATA DUMMY LENGKAP KE BASIS DATA.
 *
 *   npx tsx scripts/siapkan-dummy.ts --jauh
 *   # atau:
 *   DATABASE_URL="<connection_string>" npx tsx scripts/siapkan-dummy.ts --izinkan-luar
 *
 * Mengisi:
 *   - Akun mekanik (UJI-L1, UJI-L2, UJI-M1, UJI-M2, UJI-M3, UJI-TYRE)
 *   - Token login untuk masing-masing user
 *   - Model & Unit contoh
 *   - Komponen & Joblist contoh
 *   - 14 Work Order berbagai status (Assigned, In Progress, L1, L2, Approved, Rejected, Transfer, Borongan)
 */

const alamat = process.env['DATABASE_URL'] ?? '';
if (!alamat) {
  console.error('\n❌ DATABASE_URL belum ditentukan.');
  process.exit(1);
}

if (!/:5433\//.test(alamat) && !process.argv.includes('--izinkan-luar') && !process.argv.includes('--jauh')) {
  console.error(
    '\n❌ DITOLAK. DATABASE_URL bukan basis data lokal (port 5433).\n' +
    '   Jika ingin menyuntikkan dummy ke cloud/Supabase, tambahkan --izinkan-luar atau --jauh:\n\n' +
    '       npx tsx scripts/siapkan-dummy.ts --jauh\n'
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');

console.log('⏳ Menjalankan db/dummy-lengkap.sql...');
const berkas = resolve(process.cwd(), 'db/dummy-lengkap.sql');
await sql.unsafe(readFileSync(berkas, 'utf8'));

const [mek] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM mechanics WHERE mechanic_code LIKE 'UJI-%'`;
const [wo] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM work_orders WHERE keterangan LIKE 'DUMMY-%' OR keterangan LIKE 'CONTOH%'`;
const [unit] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM units WHERE unit_code LIKE 'UJI-%' OR unit_code LIKE 'CONTOH%'`;
const [job] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM jobs WHERE job_code LIKE 'UJI-%' OR job_code LIKE 'CONTOH%'`;

console.log('\n✅ SELESAI! Data dummy berhasil dipasang:');
console.log(`   • Pengguna Uji : ${mek!.n} orang`);
console.log(`   • Unit Contoh  : ${unit!.n} unit`);
console.log(`   • Joblist      : ${job!.n} pekerjaan`);
console.log(`   • Work Order   : ${wo!.n} WO`);

console.log('\n🔑 DAFTAR TOKEN LOGIN:');
console.log('   • Supervisor (L1)     : token_uji_l1_spv_0123456789');
console.log('   • Superintendent (L2) : token_uji_l2_mgr_0123456789');
console.log('   • Mekanik Lapangan 1  : token_uji_m1_satu_012345678');
console.log('   • Mekanik Lapangan 2  : token_uji_m2_dua_0123456789');
console.log('   • Mekanik Workshop    : token_uji_m3_work_012345678');
console.log('   • Mekanik Tyre        : token_uji_tyre_012345678901');

await sql.end();
