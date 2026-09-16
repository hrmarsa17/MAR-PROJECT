import './muat-env.js';
import { execFileSync, execSync } from 'node:child_process';

/**
 * BASIS DATA BARU HARUS BISA BERDIRI DARI NOL.
 *
 *   npm run uji:db-baru
 *
 * Uji ini menjawab satu pertanyaan yang tidak bisa dijawab uji lain: kalau
 * hari ini kita memasang KMB di server kosong, apakah ia jalan?
 *
 * ── DUA HAL YANG DITEMUKANNYA, 16 Sep 2026 ──────────────────────────────────
 * Dijalankan pertama kali, ia langsung menemukan dua cacat yang tidak terlihat
 * dari basis data pengembangan — karena basis data itu sudah berisi sejak lama:
 *
 *   1. `db/schema.sql` hanya menanam `status_transitions`. Seluruh baris
 *      KEBIJAKAN — tenant, section, faktor, tarif, setelan, form detail ban —
 *      ada di `db/seed.sql` dan tidak pernah ikut dipasang. Basis data baru
 *      berdiri dengan 38 tabel KOSONG: tanpa tenant tak ada yang bisa dibuat,
 *      tanpa pay_rates approve melempar, tanpa factors seluruh pengali poin
 *      diam-diam jatuh ke 1,0.
 *
 *   2. Migrasi 005 menanam setelan lewat `FROM tenants WHERE code='KMB'`.
 *      Tanpa baris tenant ia tidak menyentuh apa pun — dan karena ada
 *      ON CONFLICT DO NOTHING, ia melapor BERHASIL. Migrasi yang "sukses"
 *      tanpa mengerjakan apa pun adalah kegagalan yang paling sulit dilihat.
 *
 * Basis data uji dibuat lalu dibuang; tidak ada yang tersisa.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini membuat & membuang basis data. Harus port 5433.');
  process.exit(1);
}

/* psql dipanggil langsung karena uji ini memang harus berdiri di LUAR aplikasi:
   yang diuji justru apakah aplikasi bisa dipasang, bukan apakah ia jalan. */
const PSQL = process.env['PSQL_BIN']
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe' : 'psql');

const asal = process.env['DATABASE_URL']!;
const induk = asal.replace(/\/[^/]+$/, '/postgres');
const uji = asal.replace(/\/[^/]+$/, '/kmb_uji_awal');

const psql = (conn: string, q: string) =>
  execFileSync(PSQL, [conn, '-t', '-A', '-c', q], { encoding: 'utf8' }).trim();

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

console.log('\n─── memasang basis data baru dari nol ───');
psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_awal');
psql(induk, 'CREATE DATABASE kmb_uji_awal');

try {
  execSync('npx tsx scripts/migrasi.ts --awal --terapkan', {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: uji },
  });
  periksa('skema + seluruh migrasi terpasang tanpa galat', true);

  const n = (q: string) => Number(psql(uji, q));

  periksa('seluruh 9 migrasi tercatat',
    n('SELECT count(*) FROM schema_migrations') === 9,
    psql(uji, 'SELECT count(*) FROM schema_migrations'));

  for (const t of ['work_orders', 'scoring_snapshots', 'mechanic_points', 'api_tokens',
    'jobs', 'units', 'unit_sections', 'factors', 'pay_rates', 'schema_migrations']) {
    periksa(`tabel ${t}`, psql(uji, `SELECT to_regclass('public.${t}') IS NOT NULL`) === 't');
  }

  console.log('\n─── baris KEBIJAKAN, yang tanpanya sistem tidak bisa dipakai ───');
  periksa('tenant KMB ada', n("SELECT count(*) FROM tenants WHERE code='KMB'") === 1);
  periksa('tiga section ada', n('SELECT count(*) FROM sections') === 3,
    psql(uji, 'SELECT count(*) FROM sections'));
  /* Tanpa tarif, nilaiEfektif() melempar saat approve — dan itu baru ketahuan
     saat WO pertama disetujui, bukan saat pemasangan. */
  periksa('tarif terisi', n('SELECT count(*) FROM pay_rates') > 0);
  /* Tanpa faktor, hitungSkor() memakai 1,0 untuk semuanya — poin terbit
     dengan angka yang salah, tanpa satu pun galat. */
  periksa('faktor terisi', n('SELECT count(*) FROM factors') >= 10,
    psql(uji, 'SELECT count(*) FROM factors'));
  periksa('form detail ban terpasang', n('SELECT count(*) FROM job_detail_forms') > 0);
  periksa('setelan dari migrasi 005 benar-benar masuk',
    n("SELECT count(*) FROM settings WHERE setting_key IN ('meter_lompat_hm','meter_lompat_km')") === 2);

  console.log('\n─── perubahan skema dari tiap migrasi benar-benar ada ───');
  periksa('006 · mechanics.may_admin',
    n("SELECT count(*) FROM information_schema.columns WHERE table_name='mechanics' AND column_name='may_admin'") === 1);
  periksa('007 · kode job unik per section',
    n("SELECT count(*) FROM pg_constraint WHERE conname='jobs_tenant_section_kode_key'") === 1);
  periksa('008 · units.is_global',
    n("SELECT count(*) FROM information_schema.columns WHERE table_name='units' AND column_name='is_global'") === 1);
  periksa('009 · satu token berlaku per orang',
    n("SELECT count(*) FROM pg_indexes WHERE indexname='api_tokens_satu_berlaku_idx'") === 1);

  console.log('\n─── dijalankan lagi tidak mengulang apa pun ───');
  const lagi = execSync('npx tsx scripts/migrasi.ts', {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: uji },
  });
  periksa('melaporkan 0 tertinggal', /akan diterapkan : 0/.test(lagi), lagi.trim().slice(-80));

  console.log('\n─── orang pertama: satu-satunya pintu masuk ───');
  /* Tanpa ini, sistem berdiri utuh lalu TIDAK BISA DIMASUKI siapa pun:
     menambah orang menuntut admin, dan admin harus sudah jadi orang. */
  periksa('basis data baru memang NOL orang',
    n('SELECT count(*) FROM mechanics') === 0);

  const buat = execSync(
    'npx tsx scripts/orang-pertama.ts --kode ADM-UJI --nama "Uji Pertama" --izinkan-luar',
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: uji } },
  );
  periksa('orang pertama terbuat', /ORANG PERTAMA DIBUAT/.test(buat));
  periksa('perannya superintendent — bisa menyetujui WO, bukan cuma buka Admin',
    psql(uji, "SELECT role::text FROM mechanics WHERE mechanic_code='ADM-UJI'") === 'superintendent');
  periksa('punya hak admin', psql(uji, "SELECT may_admin FROM mechanics WHERE mechanic_code='ADM-UJI'") === 't');
  periksa('punya satu token berlaku',
    n("SELECT count(*) FROM api_tokens t JOIN mechanics m ON m.id=t.mechanic_id"
      + " WHERE m.mechanic_code='ADM-UJI' AND t.is_active AND t.revoked_at IS NULL") === 1);

  const token = /TOKEN\s*:\s*([0-9a-f]{20})/.exec(buat)?.[1];
  periksa('tokennya dicetak supaya bisa dipakai', !!token, buat.slice(-200));

  let ditolak = false;
  try {
    execSync('npx tsx scripts/orang-pertama.ts --kode ADM-DUA --nama "Kedua" --izinkan-luar',
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: uji }, stdio: 'pipe' });
  } catch { ditolak = true; }
  /* Skrip CLI yang bisa membuat admin kapan saja adalah jalan memutar permanen
     mengelilingi seluruh pencatatan audit. Ia hanya boleh sekali. */
  periksa('dijalankan lagi DITOLAK — sudah ada admin', ditolak, 'justru membuat admin kedua');
} finally {
  psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_awal');
  console.log('\n  (basis data uji dibuang)');
}

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
