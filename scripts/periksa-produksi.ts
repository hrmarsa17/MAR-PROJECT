import './muat-env.js';

/**
 * PEMERIKSA ISI BASIS DATA — hanya membaca, tidak pernah menulis.
 *
 *   $env:DATABASE_URL="<PROD>"; npx tsx scripts/periksa-produksi.ts; Remove-Item Env:DATABASE_URL
 *
 * Skrip pemindah katalog melaporkan apa yang IA lakukan. Yang tidak ia laporkan
 * adalah apa yang akhirnya berdiri di sana — dan dua hal itu bisa berbeda:
 * transaksi yang putus di tengah, migrasi yang lupa dijalankan ulang, atau
 * alamat DATABASE_URL yang ternyata menunjuk ke basis data lain sejak tiga
 * perintah yang lalu. Yang membuktikan cuma membaca ulang dari basis datanya.
 *
 * Dipakai bukan sekali: sesudah pemasangan, sesudah tiap impor besar, dan
 * sebelum hari WO sungguhan yang pertama.
 *
 * ── KENAPA TRANSAKSI READ ONLY ──────────────────────────────────────────────
 * Skrip ini akan sering dijalankan dengan DATABASE_URL yang menunjuk ke
 * PRODUKSI, sambil mengerjakan hal lain. `SET TRANSACTION READ ONLY` membuat
 * Postgres sendiri yang menolak tulisan apa pun — jaminannya bukan pada
 * ketelitian orang yang membacanya, melainkan pada basis datanya.
 */

const { sql } = await import('../src/lib/db.js');

let merah = 0;
let kuning = 0;

function baris(label: string, nilai: string | number, catatan = '') {
  console.log(`  ${label.padEnd(38)} ${String(nilai).padStart(7)}`
    + (catatan ? `   ${catatan}` : ''));
}
function nyata(label: string, nilai: string | number, ok: boolean, catatan = '') {
  if (!ok) merah++;
  console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(35)} ${String(nilai).padStart(7)}`
    + (catatan ? `   ${catatan}` : ''));
}
function ragu(label: string, nilai: string | number, catatan: string) {
  kuning++;
  console.log(`  ⚠️  ${label.padEnd(35)} ${String(nilai).padStart(7)}   ${catatan}`);
}

const n = (r: { c: number }[]) => Number(r[0]?.c ?? 0);

await sql.begin(async (tx) => {
  await tx`SET TRANSACTION READ ONLY`;

  const [alamat] = await tx<{ db: string; versi: string }[]>`
    SELECT current_database() AS db, version() AS versi`;
  console.log(`\n📋 ISI BASIS DATA`);
  console.log(`   ${alamat!.db} — ${alamat!.versi.split(' ').slice(0, 2).join(' ')}\n`);

  /* ── Skema ──────────────────────────────────────────────────────────────
     Migrasi yang kurang bukan "fitur yang belum ada": ia kolom yang tidak ada
     sementara kode yang berjalan menganggapnya ada. Galatnya muncul di layar
     orang lapangan, bukan di sini. */
  console.log('─── Skema ───');
  const migrasi = n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM schema_migrations`);
  nyata('migrasi terpasang', migrasi, migrasi >= 9, migrasi < 9 ? 'harusnya ≥ 9' : '');

  /* ── Katalog ────────────────────────────────────────────────────────────
     Section yang nol job berarti seluruh orang di section itu tidak bisa
     membuat WO sama sekali — dan itu baru ketahuan pada shift pertama. */
  console.log('\n─── Katalog job ───');
  const perSection = await tx<{ kode: string; c: number; mati: number }[]>`
    SELECT s.code::text AS kode,
           count(j.id)::int AS c,
           count(*) FILTER (WHERE NOT j.is_active)::int AS mati
      FROM sections s LEFT JOIN jobs j ON j.section_id = s.id
     WHERE s.tenant_id = (SELECT id FROM tenants WHERE code = 'KMB')
     GROUP BY s.code ORDER BY s.code`;
  for (const r of perSection) {
    nyata(`job ${r.kode}`, r.c, r.c > 0,
      r.c === 0 ? 'KOSONG — section ini tidak bisa dipakai' : (r.mati ? `${r.mati} nonaktif` : ''));
  }

  /* base_points 0 adalah pekerjaan yang dikerjakan tapi tidak dibayar. Ia sah
     secara skema, jadi tidak ada yang menahannya — hanya pembacaan seperti ini
     yang menemukannya sebelum seseorang mengerjakannya sebulan penuh. */
  const nol = await tx<{ kode: string; desc: string }[]>`
    SELECT j.job_code::text AS kode, j.job_description AS desc
      FROM jobs j WHERE j.is_active AND (j.base_points = 0 OR j.plan_hours = 0)
     ORDER BY j.job_code LIMIT 10`;
  if (nol.length > 0) {
    ragu('job aktif berpoin/berjam NOL', nol.length, 'dikerjakan tapi tidak dibayar');
    for (const r of nol) console.log(`         • ${r.kode}  ${r.desc}`);
  } else {
    baris('job aktif berpoin/berjam nol', 0);
  }

  /* ── Unit ───────────────────────────────────────────────────────────────
     `unit_sections` pernah jadi data mati: terisi tapi tidak pernah dibaca,
     sehingga tyreman hanya melihat 6 dari 50 unit. Karena itu ia dihitung di
     sini, bukan hanya jumlah unitnya. */
  console.log('\n─── Unit ───');
  const unit = (await tx<{ c: number; global: number; semu: number; mati: number }[]>`
    SELECT count(*)::int AS c,
           count(*) FILTER (WHERE is_global)::int AS global,
           count(*) FILTER (WHERE is_virtual)::int AS semu,
           count(*) FILTER (WHERE NOT is_active)::int AS mati
      FROM units WHERE tenant_id = (SELECT id FROM tenants WHERE code = 'KMB')`)[0]!;
  nyata('unit', unit.c, unit.c > 0);
  baris('  di antaranya global', unit.global, 'bisa dipilih semua section');
  baris('  di antaranya semu', unit.semu, 'job manual / workshop');
  baris('  di antaranya nonaktif', unit.mati);

  const lingkup = await tx<{ kode: string; c: number }[]>`
    SELECT s.code::text AS kode, count(*)::int AS c
      FROM unit_sections us JOIN sections s ON s.id = us.section_id
     GROUP BY s.code ORDER BY s.code`;
  const terikat = n(await tx<{ c: number }[]>`
    SELECT count(DISTINCT unit_id)::int AS c FROM unit_sections`);
  for (const r of lingkup) baris(`  terlihat oleh ${r.kode}`, r.c);

  /* Unit yang bukan global, bukan semu, dan tidak punya satu pun baris
     unit_sections tidak muncul di daftar siapa pun. Ia ada di basis data dan
     tak seorang pun bisa memilihnya. */
  const yatim = n(await tx<{ c: number }[]>`
    SELECT count(*)::int AS c FROM units u
     WHERE u.is_active AND NOT u.is_global AND NOT u.is_virtual
       AND NOT EXISTS (SELECT 1 FROM unit_sections us WHERE us.unit_id = u.id)`);
  if (yatim > 0) ragu('unit tanpa section & tanpa global', yatim, 'tidak muncul di daftar siapa pun');
  else baris('unit tanpa section & tanpa global', 0);
  baris('unit dengan lingkup tertulis', terikat);

  /* ── Form ban ───────────────────────────────────────────────────────────
     Migrasi 004 dijalankan saat pemasangan, ketika katalog masih nol job — jadi
     ia tidak memetakan apa pun. Kalau tidak diulang SESUDAH katalog masuk,
     mekanik ban mengirim kerja dan tidak ada tempat mencatat tekanan maupun
     RTD, dan layar Teknis kosong tanpa alasan yang kelihatan. */
  console.log('\n─── Form detail ban ───');
  const ban = await tx<{ kode: string; desc: string; form: string | null }[]>`
    SELECT j.job_code::text AS kode, j.job_description AS desc, f.code::text AS form
      FROM jobs j JOIN sections s ON s.id = j.section_id
      LEFT JOIN job_detail_forms f ON f.id = j.detail_form_id
     WHERE s.code = 'tyreman' ORDER BY j.job_code`;
  const kata = /inspection|inspeksi|repair|remove|instal|assembly/i;
  for (const r of ban) {
    if (r.form) baris(`  ${r.kode} ${r.desc.slice(0, 26)}`, '', `→ ${r.form}`);
    else if (kata.test(r.desc)) {
      merah++;
      console.log(`  ❌ ${r.kode} ${r.desc.padEnd(30)}   TANPA FORM — migrasi 004 belum diulang`);
    } else {
      baris(`  ${r.kode} ${r.desc.slice(0, 26)}`, '', '— tanpa form (disengaja)');
    }
  }

  /* ── Kebijakan ──────────────────────────────────────────────────────────
     Tarif dan faktor tidak punya nilai bawaan di kode. Tabel yang kosong
     berarti setiap WO yang disetujui membeku dengan nilai nol, dan pembekuan
     itu tidak bisa dibatalkan tanpa hitung ulang. */
  console.log('\n─── Kebijakan ───');
  const tarif = n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM pay_rates`);
  nyata('tarif (pay_rates)', tarif, tarif > 0, tarif === 0 ? 'WO membeku bernilai NOL' : '');
  const faktor = n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM factors`);
  nyata('faktor', faktor, faktor >= 10, faktor < 10 ? 'harusnya ≥ 10' : '');
  baris('setelan', n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM settings`));

  /* ── Orang ──────────────────────────────────────────────────────────────
     Tanpa admin aktif tidak ada yang bisa menambah orang lewat menu, dan
     `orang-pertama.ts` menolak jalan lagi selama masih ada admin. */
  console.log('\n─── Orang & token ───');
  const orang = (await tx<{ c: number; admin: number; aktif: number }[]>`
    SELECT count(*)::int AS c,
           count(*) FILTER (WHERE may_admin AND is_active)::int AS admin,
           count(*) FILTER (WHERE is_active)::int AS aktif
      FROM mechanics`)[0]!;
  baris('orang', orang.c, `${orang.aktif} aktif`);
  nyata('admin aktif', orang.admin, orang.admin > 0,
    orang.admin === 0 ? 'tidak ada yang bisa menambah orang' : '');
  baris('token aktif', n(await tx<{ c: number }[]>`
    SELECT count(*)::int AS c FROM api_tokens WHERE is_active AND revoked_at IS NULL`));

  /* Orang aktif tanpa token tidak bisa masuk sama sekali. Ia bukan galat —
     hanya belum diterbitkan tokennya — tapi ia menjelaskan keluhan "saya tidak
     bisa login" sebelum keluhannya datang. */
  const tanpaToken = n(await tx<{ c: number }[]>`
    SELECT count(*)::int AS c FROM mechanics m
     WHERE m.is_active AND NOT EXISTS (
       SELECT 1 FROM api_tokens t
        WHERE t.mechanic_id = m.id AND t.is_active AND t.revoked_at IS NULL)`);
  if (tanpaToken > 0) ragu('orang aktif TANPA token', tanpaToken, 'tidak bisa masuk');

  /* ── Operasional ────────────────────────────────────────────────────────
     Di basis data yang baru dipasang angka-angka ini harus nol. Kalau tidak,
     DATABASE_URL menunjuk ke tempat yang salah — dan itu lebih baik diketahui
     SEKARANG daripada sesudah sesuatu ditulis ke sana. */
  console.log('\n─── Operasional ───');
  baris('work order', n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM work_orders`));
  baris('poin mekanik', n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM mechanic_points`));
  baris('baris audit', n(await tx<{ c: number }[]>`SELECT count(*)::int AS c FROM audit_logs`));
});

console.log(`\n${merah > 0 ? '❌' : kuning > 0 ? '⚠️ ' : '✅'} `
  + `${merah} masalah, ${kuning} perlu diperhatikan\n`);

await sql.end();
process.exit(merah > 0 ? 1 : 0);
