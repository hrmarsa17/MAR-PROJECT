import './muat-env.js';

/**
 * Menyalakan hak Admin untuk satu orang.
 *
 *   npm run admin:nyalakan UJI-L2
 *   npm run admin:nyalakan UJI-L2 -- --matikan
 *
 * KENAPA INI ADA, DAN KENAPA BUKAN TOMBOL DI LAYAR.
 *
 * Hak admin mati secara bawaan untuk semua orang. Yang PERTAMA menyalakannya
 * tidak bisa lewat menu Admin itu sendiri — pintu yang bisa membuka dirinya
 * sendiri bukan pintu. Jadi orang pertama disalakan dari sini, dari mesin yang
 * memegang basis datanya; sesudah itu ia bisa memberi hak kepada yang lain
 * lewat layar.
 *
 * Skrip ini juga jalan keluar bila hak admin terlanjur hilang dari semua orang.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: skrip ini mengubah hak akses. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const kode = process.argv[2];
const matikan = process.argv.includes('--matikan');
if (!kode) {
  console.error('Pakai: npm run admin:nyalakan <KODE-MEKANIK> [-- --matikan]');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');

const r = await sql<{ id: number; nama: string; peran: string }[]>`
  UPDATE mechanics SET may_admin = ${!matikan}
   WHERE mechanic_code = ${kode}
  RETURNING id, name AS nama, role::text AS peran
`;

if (r.length === 0) {
  console.error(`\nTidak ada mekanik berkode "${kode}".\n`);
  console.error('Lihat daftarnya: npm run orang\n');
  await sql.end();
  process.exit(1);
}

const o = r[0]!;
console.log(`\n${matikan ? '🔒 Hak admin DICABUT' : '🔓 Hak admin DINYALAKAN'} untuk `
  + `${o.nama} (${kode}, ${o.peran}).\n`);

if (!matikan) {
  const lain = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM mechanics WHERE may_admin AND is_active
  `;
  console.log(`Sekarang ada ${lain[0]!.n} orang yang bisa membuka menu Admin.`);
  console.log('Menu "Admin" akan muncul di navbar setelah ia masuk ulang.\n');
} else {
  const sisa = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM mechanics WHERE may_admin AND is_active
  `;
  if (Number(sisa[0]!.n) === 0) {
    console.log('⚠️  TIDAK ADA LAGI yang bisa membuka menu Admin.');
    console.log('    Nyalakan lagi lewat skrip ini sebelum butuh mengubah apa pun.\n');
  }
}

await sql.end();
