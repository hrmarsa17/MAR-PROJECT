import './muat-env.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ORANG PERTAMA — satu-satunya pintu masuk ke sistem yang baru dipasang
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx scripts/orang-pertama.ts --kode ADM-001 --nama "Gabriel" \
 *       [--tarif junior] [--izinkan-luar]
 *
 * ── KENAPA INI HARUS ADA ────────────────────────────────────────────────────
 * Ketahuan 16 Sep 2026, saat menyiapkan penerapan: basis data produksi yang
 * baru berdiri dengan skema lengkap, kebijakan lengkap — dan NOL ORANG.
 *
 * Sementara itu satu-satunya cara menambah orang adalah menu Admin, dan menu
 * Admin menuntut `may_admin`, yang hanya bisa dimiliki orang yang sudah ada.
 * Lingkaran itu tidak punya pintu: sistem berdiri utuh lalu tidak bisa
 * dimasuki siapa pun, selamanya.
 *
 * ── DAN KENAPA IA BUKAN PINTU BELAKANG ──────────────────────────────────────
 * Skrip ini MENOLAK berjalan kalau sudah ada admin. Ia hanya bisa dipakai
 * sekali, pada sistem yang benar-benar kosong. Sesudah orang pertama ada,
 * semua penambahan berikutnya lewat menu Admin — tercatat di audit log, dengan
 * nama yang melakukannya.
 *
 * Sebuah skrip CLI yang bisa membuat admin kapan saja adalah jalan memutar
 * permanen mengelilingi seluruh pencatatan itu.
 */

const argv = process.argv.slice(2);
const ambil = (nama: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 ? argv[i + 1] : undefined;
};

const kode = ambil('--kode');
const nama = ambil('--nama');
const tarifKode = ambil('--tarif');
const izinkanLuar = argv.includes('--izinkan-luar');

if (!kode || !nama) {
  console.error(
    '\nPakai:\n'
    + '    npx tsx scripts/orang-pertama.ts --kode ADM-001 --nama "Gabriel"\n\n'
    + 'Pilihan:\n'
    + '    --tarif <posisi>   tarif yang dipakai (bawaan: yang termurah)\n'
    + '    --izinkan-luar     boleh dijalankan di luar basis data dev\n',
  );
  process.exit(1);
}

const alamat = process.env['DATABASE_URL'] ?? '';
if (!/:5433\//.test(alamat) && !izinkanLuar) {
  console.error(
    '\nDITOLAK. DATABASE_URL bukan basis data pengembangan (port 5433).\n'
    + 'Kalau ini memang server produksi yang baru dipasang:\n'
    + '    npx tsx scripts/orang-pertama.ts --kode … --nama … --izinkan-luar\n',
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

const sudahAdaAdmin = (
  await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM mechanics WHERE may_admin AND is_active`
)[0]!.n;

if (sudahAdaAdmin > 0) {
  console.error(
    `\nDITOLAK. Sistem ini sudah punya ${sudahAdaAdmin} admin aktif.\n\n`
    + 'Skrip ini hanya untuk sistem yang benar-benar KOSONG. Menambah orang\n'
    + 'berikutnya dilakukan lewat menu Admin — di sana ia tercatat di audit log\n'
    + 'lengkap dengan siapa yang melakukannya, dan itu memang seharusnya.\n',
  );
  await sql.end();
  process.exit(1);
}

const tenant = (
  await sql<{ id: number; code: string }[]>`
    SELECT id, code::text FROM tenants ORDER BY id LIMIT 1`
)[0];
if (!tenant) {
  console.error(
    '\nBelum ada tenant. Basis data ini belum dipasang dengan benar:\n'
    + '    npx tsx scripts/migrasi.ts --awal --terapkan'
    + (izinkanLuar ? ' --izinkan-luar' : '') + '\n',
  );
  await sql.end();
  process.exit(1);
}

const tarif = (
  await sql<{ id: number; position: string; label: string; idr_per_point: string }[]>`
    SELECT id, position::text, label, idr_per_point FROM pay_rates
     WHERE tenant_id = ${tenant.id}
       AND (${tarifKode ?? null}::text IS NULL OR position::text = ${tarifKode ?? null})
     ORDER BY idr_per_point LIMIT 1`
)[0];
if (!tarif) {
  const ada = await sql<{ position: string }[]>`
    SELECT position::text FROM pay_rates WHERE tenant_id = ${tenant.id}`;
  console.error(
    `\nTarif "${tarifKode}" tidak ada. Yang tersedia: `
    + ada.map((t) => t.position).join(', ') + '\n',
  );
  await sql.end();
  process.exit(1);
}

/* Peran superintendent (L2), bukan sekadar penanda admin. Orang pertama harus
   bisa menyetujui WO juga — kalau tidak, sistem bisa membuat WO tapi tak ada
   satu pun yang bisa menuntaskannya sampai orang kedua ditambahkan. */
const orang = (
  await sql<{ id: number }[]>`
    INSERT INTO mechanics
      (tenant_id, mechanic_code, name, role, pay_rate_id, is_active,
       is_test_account, may_view_performance, may_view_technical,
       may_view_report, may_admin)
    VALUES (${tenant.id}, ${kode.trim()}, ${nama.trim()}, 'superintendent',
            ${tarif.id}, true, false, true, true, true, true)
    RETURNING id`
)[0]!;

const token = buatToken();
await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
          VALUES (${tenant.id}, ${orang.id}, ${token})`;

console.log(`
════════════════════════════════════════════════════════════════
  ORANG PERTAMA DIBUAT
════════════════════════════════════════════════════════════════

  Kode    : ${kode.trim()}
  Nama    : ${nama.trim()}
  Peran   : superintendent (L2) — bisa menyetujui WO
  Akses   : Performa, Teknis, Reports, Admin
  Tarif   : ${tarif.label} (${tarif.position})

  TOKEN   : ${token}

  Simpan token itu sekarang. Ia bisa dibaca lagi kapan saja dari menu
  Admin maupun layar Monitoring — tapi hanya oleh orang yang sudah
  bisa masuk, dan saat ini hanya Anda.

  Berikutnya:
    1. Buka https://<domain>/masuk, masukkan token di atas
    2. Menu Admin → Orang & Token → tambahkan mekanik & approver asli
    3. Menu Admin → Katalog Job → unggah katalog lewat Excel

  Skrip ini tidak akan berjalan lagi selama masih ada admin aktif.
════════════════════════════════════════════════════════════════
`);

await sql.end();
