import postgres, { type TransactionSql } from 'postgres';

/**
 * Satu kolam koneksi untuk seluruh proses.
 *
 * `transform: undefined` — nama kolom dibiarkan apa adanya (snake_case), sama
 * persis dengan yang tertulis di db/schema.sql. Penerjemahan otomatis ke
 * camelCase terasa rapi sampai suatu hari sebuah kolom tidak bisa ditemukan
 * dan tidak ada yang tahu ejaan mana yang benar.
 */
/** OID tipe int8 (bigint) di Postgres. */
const OID_INT8 = 20;

/**
 * TIDAK ADA ALAMAT BAWAAN — dan itu disengaja.
 *
 * Sampai 15 Sep 2026 baris ini berbunyi:
 *
 *     process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/kmb_project'
 *
 * Port 5432 di mesin ini BUKAN basis data pengembangan; ia milik Gabriel.
 * Basis data dev berdiri di 5433. Artinya skrip apa pun yang lupa memuat `.env`
 * akan diam-diam mengarah ke basis data yang salah — dan ia hanya ketahuan
 * karena instans itu kebetulan berkata sandi. Kalau tidak, sebuah skrip bisa
 * saja MENULIS ke sana.
 *
 * Menebak alamat basis data adalah bentuk kemudahan yang harganya tidak
 * sebanding. Lebih baik berhenti di sini dengan pesan yang menyebutkan apa yang
 * harus dilakukan.
 */
const alamat = process.env['DATABASE_URL'];
if (!alamat) {
  throw new Error(
    'DATABASE_URL belum diisi. Basis data TIDAK ditebak — port 5432 di mesin ' +
    'pengembangan ini milik instans lain.\n' +
    '  • Next.js & vitest memuat .env sendiri.\n' +
    "  • Skrip `npx tsx` harus mengimpor './muat-env.js' SEBELUM src/lib/db.js.",
  );
}

/**
 * ── SATU PROSES YANG HIDUP TERUS, ATAU BANYAK YANG SEKEJAP ──────────────────
 *
 * Kolam koneksi disetel berbeda tergantung di mana ia berjalan, dan selisihnya
 * bukan penyetelan halus — ia menentukan apakah sistem masih bisa menyambung
 * saat ramai.
 *
 * Di server sendiri (Docker, `npm start`, `npm run dev`): SATU proses melayani
 * semua orang. Sepuluh koneksi dipakai bersama, dibuka sekali, hidup terus.
 *
 * Di Vercel: TIAP permintaan bisa membangunkan instans fungsinya sendiri, dan
 * tiap instans membuka kolamnya sendiri. Sepuluh koneksi per instans dikali
 * sekian instans menghabiskan jatah koneksi Postgres dalam hitungan menit —
 * dan yang terjadi berikutnya bukan lambat, melainkan "too many clients" untuk
 * semua orang sekaligus.
 *
 * Karena itu di sana kolamnya 1, dan penyambungannya lewat POOLER Supabase
 * (porta 6543), yang memang dibuat untuk pola ini.
 *
 * `prepare: false` WAJIB saat lewat pooler mode-transaksi: pernyataan yang
 * sudah disiapkan terikat pada satu koneksi, sementara pooler memindahkan
 * transaksi antar koneksi. Tanpa ini, galatnya muncul belakangan, sesekali,
 * dan berbunyi seperti masalah lain sama sekali.
 *
 * Dideteksi dari alamatnya sendiri, bukan dari sebuah flag yang bisa lupa
 * diisi: porta 6543 dan nama host pooler Supabase sudah cukup memberi tahu.
 */
const lewatPooler = /:6543\//.test(alamat) || /pooler\.supabase\.com/.test(alamat);
const tanpaServer = process.env['VERCEL'] === '1' || lewatPooler;

export const sql = postgres(
  alamat,
  {
    max: Number(process.env['DB_POOL_MAX'] ?? (tanpaServer ? 1 : 10)),
    idle_timeout: 20,
    prepare: !lewatPooler,
    onnotice: () => {},
    types: {
      /**
       * bigint dibaca sebagai number, bukan string.
       *
       * Bawaannya string, demi ketelitian — dan itu melahirkan kebohongan tipe
       * yang tidak bisa ditangkap TypeScript: sebuah fungsi boleh menyatakan
       * mengembalikan `{ id: number }` sementara isinya `"5"`. Nilainya
       * menyeberang batas basis data tanpa tipe, jadi kompiler tidak punya
       * apa pun untuk diperiksa. Ketahuannya baru di ujung, saat Zod menolak
       * `woId: "5"` dan tombol Setujui gagal tanpa sebab yang kelihatan.
       *
       * Aman untuk data sebesar ini: 100 WO/hari selama 100 tahun pun masih
       * jauh di bawah batas bilangan bulat JavaScript. Dan kalau suatu hari
       * asumsi itu patah, ia patah dengan NYARING — bukan diam-diam kehilangan
       * angka terakhir.
       */
      bigint: {
        to: OID_INT8,
        from: [OID_INT8],
        serialize: (x: number | string) => String(x),
        parse: (x: string) => {
          const n = Number(x);
          if (!Number.isSafeInteger(n)) {
            throw new Error(
              `bigint ${x} melampaui batas aman bilangan JavaScript — ` +
                `ubah penanganannya sebelum angka ini dipakai`,
            );
          }
          return n;
        },
      },
    },
  },
);

export type Sql = typeof sql;

/**
 * Tipe transaksi diambil dari yang diekspor postgres.js.
 *
 * Menurunkannya sendiri lewat `Parameters<Parameters<Sql['begin']>[0]>[0]`
 * tampak pintar tapi salah: `begin` punya beberapa bentuk, dan `Parameters`
 * hanya membaca yang terakhir — hasilnya `never`, yang membuat SETIAP query
 * di seluruh proyek kehilangan tipe tanpa satu pun galat yang menunjuk ke
 * sumbernya.
 */
type TipeKustom = Sql extends postgres.Sql<infer T> ? T : never;
export type Tx = TransactionSql<TipeKustom>;

/** numeric Postgres tiba sebagai string. Ubah sekali, di satu tempat. */
export function angka(nilai: unknown): number {
  if (nilai === null || nilai === undefined) {
    throw new Error('angka yang dibutuhkan bernilai kosong');
  }
  const n = typeof nilai === 'number' ? nilai : Number(nilai);
  if (!Number.isFinite(n)) throw new Error(`bukan angka: ${String(nilai)}`);
  return n;
}

export function angkaAtau(nilai: unknown, cadangan: number): number {
  if (nilai === null || nilai === undefined || nilai === '') return cadangan;
  const n = Number(nilai);
  return Number.isFinite(n) ? n : cadangan;
}

/**
 * Menetapkan identitas pemanggil untuk transaksi ini, dibaca oleh RLS.
 * SET LOCAL berlaku sampai transaksi selesai — tidak bocor ke permintaan lain
 * yang memakai koneksi sama dari kolam.
 */
export async function pakaiIdentitas(tx: Tx, mechanicId: number): Promise<void> {
  await tx`SELECT set_config('app.mechanic_id', ${String(mechanicId)}, true)`;
}
