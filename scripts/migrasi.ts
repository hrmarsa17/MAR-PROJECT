import './muat-env.js';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MIGRASI — menerapkan yang BELUM terpasang, dan mencatat apa yang sudah
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx scripts/migrasi.ts                 lihat apa yang tertinggal
 *   npx tsx scripts/migrasi.ts --terapkan      terapkan yang tertinggal
 *   npx tsx scripts/migrasi.ts --awal --terapkan   basis data BARU: skema dulu
 *   npx tsx scripts/migrasi.ts ... --izinkan-luar  boleh bukan port 5433
 *
 * ── KENAPA DITULIS ULANG, 16 Sep 2026 ───────────────────────────────────────
 * Versi sebelumnya menjalankan SATU berkas yang disebut di argumen, dan tidak
 * mencatat apa pun. Dua akibatnya baru terasa saat sistem ini mau ditaruh di
 * server:
 *
 *   1. Pertanyaan "basis data ini sudah sampai migrasi berapa?" tidak punya
 *      jawaban. Yang ada cuma ingatan orang yang menjalankannya. Dengan
 *      sembilan migrasi dan akan bertambah, itu bukan dasar yang layak untuk
 *      sistem yang membayar orang.
 *
 *   2. Ia MENOLAK berjalan kecuali di port 5433. Pagar yang benar untuk skrip
 *      dev — tapi berarti tidak ada jalan sama sekali untuk menyiapkan basis
 *      data produksi, dan satu-satunya cara tersisa jadi menempelkan SQL dengan
 *      tangan, tepat di tempat yang paling tidak boleh ditebak-tebak.
 *
 * ── CHECKSUM, DAN KENAPA IA PENTING ─────────────────────────────────────────
 * Sidik jari isi tiap migrasi yang terpasang ikut disimpan. Kalau berkas yang
 * SUDAH diterapkan kemudian disunting, skrip ini berhenti dan menyebut
 * berkasnya. Tanpa itu, dua basis data yang sama-sama "sampai 009" bisa punya
 * skema berbeda — dan selisihnya baru ketahuan saat ada kueri yang jalan di
 * satu tempat dan gagal di tempat lain.
 *
 * Perbaikan yang benar untuk migrasi yang sudah dipakai bukan menyuntingnya,
 * melainkan menulis migrasi BARU.
 *
 * Berkas migrasi TIDAK boleh memuat BEGIN/COMMIT sendiri — transaksinya dibuka
 * di sini, satu per berkas.
 */

const argv = process.argv.slice(2);
const terapkan = argv.includes('--terapkan');
const awal = argv.includes('--awal');
const izinkanLuar = argv.includes('--izinkan-luar');
/** Bentuk lama: `migrasi.ts db/migrasi/00x.sql` — satu berkas, tetap didukung. */
const satuBerkas = argv.find((a) => a.endsWith('.sql'));

const alamat = process.env['DATABASE_URL'] ?? '';
if (!/:5433\//.test(alamat) && !izinkanLuar) {
  console.error(
    '\nDITOLAK. Migrasi mengubah SKEMA, dan DATABASE_URL tidak menunjuk ke basis\n'
    + 'data pengembangan (port 5433).\n\n'
    + 'Kalau ini memang basis data produksi dan Anda memang bermaksud\n'
    + 'menerapkannya, sebutkan dengan sengaja:\n'
    + '    npx tsx scripts/migrasi.ts --terapkan --izinkan-luar\n',
  );
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');

const DIR = resolve(process.cwd(), 'db/migrasi');
// CRLF/LF disamakan: berkas yang sama di Windows dan Linux harus bersidik sama.
const sidik = (isi: string) =>
  createHash('sha256').update(isi.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

/* Tabel pencatatnya dibuat skrip ini sendiri, bukan oleh sebuah migrasi — kalau
   ia sendiri sebuah migrasi, tidak ada tempat untuk mencatat bahwa ia sudah
   terpasang. */
await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    nama         text PRIMARY KEY,
    sidik        text NOT NULL,
    terpasang_at timestamptz NOT NULL DEFAULT now()
  )
`;

const adaTabel = (
  await sql<{ ada: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'work_orders'
    ) AS ada`
)[0]!.ada;

if (!adaTabel && !awal) {
  console.error(
    '\nBasis data ini KOSONG — tabel work_orders belum ada.\n\n'
    + 'Untuk basis data baru, pasang skemanya lebih dulu:\n'
    + `    npx tsx scripts/migrasi.ts --awal --terapkan${izinkanLuar ? ' --izinkan-luar' : ''}\n`,
  );
  await sql.end();
  process.exit(1);
}

const semua = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const terpasang = new Map(
  (await sql<{ nama: string; sidik: string }[]>`SELECT nama, sidik FROM schema_migrations`)
    .map((r) => [r.nama, r.sidik]),
);

// ── Berkas yang SUDAH terpasang tapi isinya berubah ─────────────────────────
const berubah = semua.filter((f) => {
  const lama = terpasang.get(f);
  return lama !== undefined && lama !== sidik(readFileSync(resolve(DIR, f), 'utf8'));
});
if (berubah.length > 0) {
  console.error(
    `\n❌ ${berubah.length} migrasi yang SUDAH terpasang isinya berubah:\n`
    + berubah.map((f) => `     ${f}`).join('\n')
    + '\n\nMenyunting migrasi yang sudah dipakai membuat dua basis data yang\n'
    + 'sama-sama "terpasang" punya skema yang berbeda. Yang benar adalah\n'
    + 'menulis migrasi BARU, bukan mengubah yang lama.\n',
  );
  await sql.end();
  process.exit(1);
}

const tertinggal = satuBerkas
  ? [satuBerkas.replace(/^.*[\\/]/, '')]
  : semua.filter((f) => !terpasang.has(f));

console.log(`\n${terapkan ? '▶  MENERAPKAN' : '👀 PRATINJAU'}   `
  + alamat.replace(/:\/\/[^@]*@/, '://***@'));
console.log('');
if (!adaTabel) console.log('  Basis data KOSONG — db/schema.sql dipasang lebih dulu.\n');
console.log(`  sudah terpasang : ${terpasang.size}`);
console.log(`  akan diterapkan : ${tertinggal.length}`);
for (const f of tertinggal) console.log(`     • ${f}`);

if (!terapkan) {
  console.log('\n   Jalankan lagi dengan --terapkan untuk benar-benar menerapkannya.\n');
  await sql.end();
  process.exit(0);
}

if (!adaTabel) {
  const skema = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
  await sql.begin(async (tx) => { await tx.unsafe(skema).simple(); });
  console.log('\n  ✅ db/schema.sql terpasang');

  /* ── SEED IKUT, DAN INI BUKAN KEMUDAHAN ───────────────────────────────────
     Ketahuan 16 Sep 2026 saat menguji basis data baru dari nol: `schema.sql`
     hanya menanam `status_transitions`. Baris KEBIJAKAN — tenant, section,
     faktor, tarif, setelan, form detail ban — semuanya ada di `db/seed.sql`
     dan dulu tidak pernah ikut dipasang.

     Akibatnya basis data produksi yang baru akan berdiri dengan 38 tabel
     KOSONG dan tidak bisa dipakai sama sekali: tanpa tenant tak ada yang bisa
     dibuat, tanpa pay_rates `nilaiEfektif()` melempar saat approve, dan tanpa
     factors seluruh pengali diam-diam jatuh ke 1,0.

     Lebih halus lagi: migrasi 005 menanam setelan lewat `FROM tenants WHERE
     code='KMB'`. Tanpa baris tenant ia tidak menyentuh apa pun — dan karena
     ada ON CONFLICT DO NOTHING, ia melapor BERHASIL. Migrasi yang "sukses"
     tanpa mengerjakan apa pun adalah bentuk kegagalan yang paling sulit
     dilihat. */
  const seed = readFileSync(resolve(process.cwd(), 'db/seed.sql'), 'utf8');
  await sql.begin(async (tx) => { await tx.unsafe(seed).simple(); });
  console.log('  ✅ db/seed.sql terpasang (tenant, section, faktor, tarif, setelan)');
}

/* Satu transaksi PER migrasi, bukan satu untuk semuanya. Migrasi kelima yang
   gagal tidak boleh membatalkan empat yang sudah benar — yang gagal cukup
   diperbaiki lalu dijalankan lagi. */
for (const f of tertinggal) {
  const isi = readFileSync(resolve(DIR, f), 'utf8');
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(isi).simple();
      await tx`
        INSERT INTO schema_migrations (nama, sidik) VALUES (${f}, ${sidik(isi)})
        ON CONFLICT (nama) DO UPDATE SET sidik = EXCLUDED.sidik
      `;
    });
    console.log(`  ✅ ${f}`);
  } catch (e) {
    console.error(`  ❌ ${f} — ${(e as Error).message}`);
    console.error('\n  Berhenti di sini. Migrasi sesudahnya TIDAK dijalankan.\n');
    await sql.end();
    process.exit(1);
  }
}

console.log(`\n✅ Selesai. ${tertinggal.length} migrasi diterapkan.\n`);
await sql.end();
