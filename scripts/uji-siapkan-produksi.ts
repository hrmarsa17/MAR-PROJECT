import './muat-env.js';
import { execFileSync, execSync } from 'node:child_process';

/**
 * SKRIP PEMASANGAN PRODUKSI — pagarnya harus menahan, bukan sekadar ada.
 *
 *   npm run uji:siapkan
 *
 * `siapkan-produksi.ts` dijalankan SEKALI, di tempat yang paling tidak boleh
 * salah, oleh orang yang sedang mengerjakan banyak hal lain. Yang diuji di sini
 * bukan jalur berhasilnya saja — melainkan apakah ia BERHENTI pada tiga keadaan
 * yang, kalau diteruskan, baru terasa berminggu-minggu kemudian:
 *
 *   1. diberi alamat POOLER  → DDL besar lewat pooler bisa putus di tengah dan
 *                              meninggalkan skema separuh jadi
 *   2. basis data SUDAH BERISI → itu basis data yang sedang dipakai orang
 *   3. dijalankan DUA KALI     → orang pertama kedua = admin tanpa jejak audit
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini membuat & membuang basis data. Harus port 5433.');
  process.exit(1);
}

const BIN = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\' : '';
const PSQL = process.env['PSQL_BIN'] ?? `${BIN}psql${BIN ? '.exe' : ''}`;

const asal = process.env['DATABASE_URL']!;
const induk = asal.replace(/\/[^/]+$/, '/postgres');
const uji = asal.replace(/\/[^/]+$/, '/kmb_uji_prod');

const psql = (conn: string, q: string) =>
  execFileSync(PSQL, [conn, '-t', '-A', '-c', q], { encoding: 'utf8' }).trim();

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

/** Menjalankan skrip pemasangan; mengembalikan keluaran + apakah ia berhenti. */
function siapkan(db: string, argsTambahan = ''): { keluar: string; berhenti: boolean } {
  try {
    const keluar = execSync(
      `npx tsx scripts/siapkan-produksi.ts --db "${db}" `
      + `--kode ADM-UJI --nama "Uji Produksi" ${argsTambahan}`,
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return { keluar, berhenti: false };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      keluar: String(err.stdout ?? '') + String(err.stderr ?? ''),
      berhenti: true,
    };
  }
}

psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_prod');
psql(induk, 'CREATE DATABASE kmb_uji_prod');

try {
  console.log('\n─── 1. alamat POOLER ditolak ───');
  {
    /* Dibuat-buat supaya terlihat seperti alamat pooler Supabase. Kalau
       pemeriksaan ini lolos, skema besar dipasang lewat sambungan yang bisa
       memindahkan transaksi antar koneksi di tengah jalan. */
    const p = uji.replace(':5433/', ':6543/');
    const h = siapkan(p);
    periksa('berhenti', h.berhenti, 'justru diteruskan');
    periksa('menyebut kata POOLER', /POOLER/i.test(h.keluar), h.keluar.slice(-120));
    periksa('memberi tahu di mana mengambil alamat yang benar',
      /Connection string/i.test(h.keluar));
    periksa('dan TIDAK menyentuh basis data',
      psql(uji, "SELECT to_regclass('public.work_orders') IS NULL") === 't');
  }

  console.log('\n─── 2. jalur berhasil: dari nol sampai bisa masuk ───');
  let token = '';
  {
    const h = siapkan(uji);
    periksa('selesai tanpa berhenti', !h.berhenti, h.keluar.slice(-200));
    periksa('memeriksa versi Postgres lebih dulu', /PostgreSQL \d+/.test(h.keluar));
    periksa('memeriksa ekstensi citext', /ekstensi citext/.test(h.keluar));
    periksa('memeriksa ekstensi pgcrypto', /ekstensi pgcrypto/.test(h.keluar));
    periksa('skema terpasang',
      psql(uji, "SELECT to_regclass('public.work_orders') IS NOT NULL") === 't');
    periksa('seluruh 9 migrasi tercatat',
      psql(uji, 'SELECT count(*) FROM schema_migrations') === '9');
    periksa('baris kebijakan ikut — tarif terisi',
      Number(psql(uji, 'SELECT count(*) FROM pay_rates')) > 0);
    periksa('baris kebijakan ikut — faktor terisi',
      Number(psql(uji, 'SELECT count(*) FROM factors')) >= 10);

    token = /TOKEN ANDA:\s*\n*\s*([0-9a-f]{20})/.exec(h.keluar)?.[1] ?? '';
    periksa('token dicetak besar-besar', !!token, h.keluar.slice(-300));
    periksa('orang pertama superintendent',
      psql(uji, "SELECT role::text FROM mechanics WHERE mechanic_code='ADM-UJI'")
        === 'superintendent');

    /* Yang dicetak harus token yang SUNGGUH bisa dipakai — bukan sekadar dua
       puluh huruf heksadesimal yang terlihat meyakinkan. */
    periksa('token yang dicetak memang token yang tersimpan',
      psql(uji, `SELECT count(*) FROM api_tokens WHERE token='${token}'`
        + ' AND is_active AND revoked_at IS NULL') === '1');

    periksa('menyebut langkah Vercel berikutnya', /vercel\.com/i.test(h.keluar));
    periksa('menyebut porta 6543 untuk Vercel, bukan 5432', /6543/.test(h.keluar));
    periksa('mengingatkan region harus sama', /Singapura/i.test(h.keluar));
  }

  console.log('\n─── 3. dijalankan lagi DITOLAK ───');
  {
    const h = siapkan(uji);
    periksa('berhenti', h.berhenti, 'justru membuat admin kedua');
    periksa('menyebut basis data sudah berisi', /SUDAH berisi|bukan basis data baru/i.test(h.keluar),
      h.keluar.slice(-150));
    periksa('menunjukkan perintah yang benar untuk memperbarui',
      /migrasi\.ts --terapkan/.test(h.keluar));
    periksa('hanya ada SATU orang, bukan dua',
      psql(uji, 'SELECT count(*) FROM mechanics') === '1');
  }
} finally {
  psql(induk, 'DROP DATABASE IF EXISTS kmb_uji_prod');
  console.log('\n  (basis data uji dibuang)');
}

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
