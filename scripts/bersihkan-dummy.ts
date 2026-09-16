import './muat-env.js';

/**
 * MENGHAPUS DATA CONTOH & UJI dari basis data pengembangan.
 *
 *   npx tsx scripts/bersihkan-dummy.ts            (pratinjau, tidak menghapus)
 *   npx tsx scripts/bersihkan-dummy.ts --terapkan
 *
 * Pratinjau adalah bawaannya, dengan sengaja: berkas ini menghapus, dan
 * penghapusan tidak punya tombol batal.
 *
 * ── YANG DIPERTAHANKAN, DAN KENAPA ──────────────────────────────────────────
 * AKUN. Kesembilan akun uji tetap ada (keputusan Gabriel 16 Sep 2026) — merekalah
 * satu-satunya pintu masuk ke sistem ini. Menghapusnya berarti mengunci diri di
 * luar, dan menambah orang asli dilakukan dari dalam, lewat menu Admin.
 *
 * KATALOG ASLI. Job, unit, model, komponen yang datang dari KMB V2 tidak
 * disentuh — hanya baris yang kodenya berawalan CONTOH atau UJI yang dihapus.
 * (Ditulis begitu, bukan dengan tanda bintang: "CONTOH" diikuti bintang lalu
 * garis miring akan MENUTUP komentar ini di tengah jalan.)
 *
 * FAKTOR, TARIF, SETELAN, SECTION. Bukan data contoh; itu kebijakan.
 *
 * ── YANG DIHAPUS ────────────────────────────────────────────────────────────
 * Seluruh WO beserta yang menggantung padanya (poin, snapshot, tim, transfer,
 * detail teknis, override), bacaan meter, penggantian panel, nomor urut WO,
 * struk idempotensi, dan audit log.
 *
 * Audit log ikut dihapus karena SELURUH isinya adalah jejak kegiatan contoh
 * pada baris yang sesudah ini tidak ada lagi. Membiarkannya membuat layar
 * Riwayat Perubahan penuh oleh perubahan atas WO dan job yang tak bisa dibuka
 * siapa pun.
 */

if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: skrip ini MENGHAPUS. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const terapkan = process.argv.includes('--terapkan');

const { sql } = await import('../src/lib/db.js');

/** Kode yang dianggap data contoh. Sengaja hanya awalan, bukan pencarian bebas. */
const POLA = ['CONTOH%', 'UJI%'];

async function hitung(nama: string, kueri: Promise<{ n: number }[]>): Promise<[string, number]> {
  return [nama, (await kueri)[0]?.n ?? 0];
}

const rincian: [string, number][] = await Promise.all([
  hitung('work order', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM work_orders`),
  hitung('  · poin mekanik', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mechanic_points`),
  hitung('  · snapshot skor', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM scoring_snapshots`),
  hitung('  · override approver', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM work_order_overrides`),
  hitung('bacaan meter', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM meter_readings`),
  hitung('penggantian panel', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM meter_panel_changes`),
  hitung('nomor urut WO', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM wo_number_counters`),
  hitung('struk idempotensi', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM processed_ops`),
  hitung('audit log', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_logs`),
  hitung('job contoh/uji', sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM jobs WHERE job_code::text ILIKE ANY(${POLA}::text[])`),
  hitung('unit contoh/uji', sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM units WHERE unit_code::text ILIKE ANY(${POLA}::text[])`),
  hitung('model unit contoh/uji', sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM unit_models WHERE code::text ILIKE ANY(${POLA}::text[])`),
]);

const dipertahankan: [string, number][] = await Promise.all([
  hitung('akun', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mechanics`),
  hitung('token', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM api_tokens`),
  hitung('job katalog asli', sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM jobs WHERE NOT job_code::text ILIKE ANY(${POLA}::text[])`),
  hitung('unit katalog asli', sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM units WHERE NOT unit_code::text ILIKE ANY(${POLA}::text[])`),
  hitung('faktor', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM factors`),
  hitung('tarif', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pay_rates`),
  hitung('setelan', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM settings`),
]);

console.log(`\n${terapkan ? '▶  MENGHAPUS' : '👀 PRATINJAU (tidak menghapus apa pun)'}\n`);
console.log('  AKAN DIHAPUS');
for (const [n, v] of rincian) console.log(`    ${String(v).padStart(6)}  ${n}`);
console.log('\n  DIPERTAHANKAN');
for (const [n, v] of dipertahankan) console.log(`    ${String(v).padStart(6)}  ${n}`);

if (!terapkan) {
  console.log('\n   Jalankan lagi dengan --terapkan untuk benar-benar menghapus.\n');
  await sql.end();
  process.exit(0);
}

/* SATU transaksi. Kalau ada satu saja yang gagal — misalnya sebuah job contoh
   ternyata masih dipakai WO yang belum terhapus — seluruhnya dibatalkan, dan
   basis data tidak tertinggal setengah bersih. */
await sql.begin(async (tx) => {
  // WO lebih dulu: poin, snapshot, tim, transfer, detail, dan override
  // menggantung padanya dengan ON DELETE CASCADE.
  await tx`DELETE FROM meter_readings`;
  await tx`DELETE FROM meter_panel_changes`;
  await tx`DELETE FROM work_orders`;
  await tx`DELETE FROM wo_number_counters`;
  await tx`DELETE FROM processed_ops`;
  await tx`DELETE FROM audit_logs`;

  await tx`DELETE FROM jobs WHERE job_code::text ILIKE ANY(${POLA}::text[])`;
  await tx`DELETE FROM units WHERE unit_code::text ILIKE ANY(${POLA}::text[])`;

  /* Model unit dihapus hanya kalau tidak ada lagi yang memakainya. Model contoh
     yang terlanjur dipakai job asli bukan lagi data contoh — ia jadi bagian
     katalog, dan menghapusnya akan memutus joblist unit itu. */
  await tx`
    DELETE FROM unit_models um
     WHERE um.code::text ILIKE ANY(${POLA}::text[])
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.unit_model_id = um.id)
       AND NOT EXISTS (SELECT 1 FROM units u WHERE u.unit_model_id = um.id)
  `;

  /* Komponen & sub-komponen yatim: dibuat uji impor lalu tak pernah dipakai.
     Disaring lewat "tidak punya job", bukan lewat namanya — sebagian dibuat
     dengan nama acak yang tidak berawalan UJI. */
  await tx`
    DELETE FROM job_sub_components sc
     WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.sub_component_id = sc.id)
  `;
  await tx`
    DELETE FROM job_components c
     WHERE NOT EXISTS (SELECT 1 FROM job_sub_components sc WHERE sc.component_id = c.id)
  `;
});

const sesudah = await Promise.all([
  hitung('work order', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM work_orders`),
  hitung('job', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM jobs`),
  hitung('unit', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM units`),
  hitung('akun', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mechanics`),
  hitung('token', sql<{ n: number }[]>`SELECT count(*)::int AS n FROM api_tokens`),
]);
console.log('\n  SESUDAH');
for (const [n, v] of sesudah) console.log(`    ${String(v).padStart(6)}  ${n}`);
console.log('\n✅ Selesai.\n');

await sql.end();
