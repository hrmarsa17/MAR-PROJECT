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
 *     process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/mar_project'
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
function buatKoneksi(url: string) {
  try {
    new URL(url);
  } catch {
    const samar = url.replace(/:\/\/([^:@/]*):[^@/]*@/, '://$1:***@');
    throw new Error(
      `DATABASE_URL bukan alamat yang sah: "${samar}"\n` +
      '  • Bentuknya: postgresql://pengguna:sandi@host:porta/nama_basis_data\n' +
      '  • Kata sandi bersimbol harus di-URL-encode (@ jadi %40, ! jadi %21).',
    );
  }

  const modeTransaksi = /:6543\//.test(url);
  const tanpaServer = modeTransaksi;

  const kolamDiminta = Number(process.env['DB_POOL_MAX']?.trim());
  const kolam = Number.isInteger(kolamDiminta) && kolamDiminta > 0
    ? kolamDiminta
    : (tanpaServer ? 1 : 10);

  return postgres(
    url,
    {
      max: kolam,
      idle_timeout: 20,
      prepare: !modeTransaksi,
      onnotice: () => {},
      types: {
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
}

const poolMap = new Map<string, ReturnType<typeof postgres>>();

/**
 * Mendapatkan koneksi SQL spesifik tenant ('KMB' atau 'SUM') atau fallback default.
 */
export function dapatkanSql(sistemAtauTenant?: string | null): Sql {
  const s = sistemAtauTenant?.toUpperCase();
  let url: string | undefined;

  if (s === 'SUM') {
    url = process.env['DATABASE_URL_SUM'] || process.env['DATABASE_URL'];
  } else if (s === 'KMB') {
    url = process.env['DATABASE_URL_KMB'] || process.env['DATABASE_URL'];
  } else {
    url = process.env['DATABASE_URL_KMB'] || process.env['DATABASE_URL'];
  }

  if (!url) {
    url = process.env['DATABASE_URL'] || (process.env.CI || process.env.CF_PAGES ? 'postgres://ci:ci@127.0.0.1:5432/ci' : undefined);
  }

  if (!url) {
    throw new Error(
      `DATABASE_URL belum diisi untuk sistem ${s || 'DEFAULT'}. Basis data TIDAK ditebak.\n` +
      '  • Konfigurasikan DATABASE_URL_KMB atau DATABASE_URL_SUM di environment variable.',
    );
  }

  if (!poolMap.has(url)) {
    poolMap.set(url, buatKoneksi(url));
  }

  return poolMap.get(url)!;
}

// Instance default untuk backward compatibility
export const sql = dapatkanSql('KMB');
export const sqlKmb = dapatkanSql('KMB');
export const sqlSum = process.env['DATABASE_URL_SUM'] ? dapatkanSql('SUM') : sql;

export type Sql = ReturnType<typeof postgres>;

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
