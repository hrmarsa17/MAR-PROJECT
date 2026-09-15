import postgres, { type TransactionSql } from 'postgres';

/**
 * Satu kolam koneksi untuk seluruh proses.
 *
 * `transform: undefined` — nama kolom dibiarkan apa adanya (snake_case), sama
 * persis dengan yang tertulis di db/schema.sql. Penerjemahan otomatis ke
 * camelCase terasa rapi sampai suatu hari sebuah kolom tidak bisa ditemukan
 * dan tidak ada yang tahu ejaan mana yang benar.
 */
export const sql = postgres(
  process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/kmb_project',
  {
    max: Number(process.env['DB_POOL_MAX'] ?? 10),
    idle_timeout: 20,
    // Angka Postgres numeric dikirim sebagai string agar tidak kehilangan
    // ketelitian. Jalur uang mengubahnya sendiri lewat angka() di bawah.
    types: {},
    onnotice: () => {},
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
export type Tx = TransactionSql<Record<string, never>>;

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
