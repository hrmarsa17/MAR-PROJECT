import { sql, pakaiIdentitas, type Tx } from '../lib/db.js';
import { GalatAplikasi } from '../lib/errors.js';

/**
 * SATU PINTU untuk setiap perubahan data.
 *
 * Tidak ada jalur tulis lain di sistem ini — termasuk untuk aksi yang
 * "kelihatannya ringan". Di KMB V2, aksi yang dianggap ringan (save_override)
 * dikirim lewat jalur yang menyaring field dengan daftar putih manual, dan satu
 * field yang lupa ditambahkan hilang tanpa jejak sementara server menjawab
 * BERHASIL (13 Agu 2026).
 *
 * Empat jaminan:
 *
 *  1. Kiriman ulang dengan op_id yang sama mengembalikan STRUK LAMA, tidak
 *     mengeksekusi apa pun untuk kedua kalinya.
 *  2. Struk hanya ditulis pada jalur berhasil. Kegagalan tidak boleh punya
 *     struk — kalau punya, tombol "Coba lagi" akan mengembalikan galat lama
 *     tanpa pernah mencoba lagi.
 *  3. Efek samping dan struk berada dalam SATU transaksi. Tidak ada keadaan
 *     setengah jadi, sehingga "mode lanjutan" KMB V2 tidak perlu ada.
 *  4. Dua permintaan ber-op_id sama yang tiba bersamaan diurutkan oleh kunci
 *     advisory, bukan saling mendahului. Inilah yang gagal di KMB V2 ketika
 *     halaman dan service worker mengosongkan antrean yang sama.
 */

export interface KonteksPerintah {
  tx: Tx;
  tenantId: number;
  actorId: number;
}

export interface HasilPerintah<T> {
  hasil: T;
  /** true = ini pengulangan; tidak ada yang dieksekusi lagi. */
  diulang: boolean;
}

export interface OpsiPerintah<T> {
  opId: string;
  tenantId: number;
  actorId: number;
  action: string;
  jalankan: (ctx: KonteksPerintah) => Promise<T>;
}

export async function jalankanPerintah<T>(
  opsi: OpsiPerintah<T>,
): Promise<HasilPerintah<T>> {
  const { opId, tenantId, actorId, action, jalankan } = opsi;

  if (!opId || opId.length < 8) {
    throw new GalatAplikasi('MASUKAN_TIDAK_SAH', 'op_id wajib untuk setiap aksi tulis');
  }

  return sql.begin(async (tx) => {
    // Serialkan permintaan ber-op_id sama. Kunci ini terlepas sendiri saat
    // transaksi selesai — tidak ada kunci yang bisa tertinggal menggantung,
    // yang di GAS harus dijaga dengan timeout dan doa.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${opId}))`;

    const struk = await tx<{ result: unknown }[]>`
      SELECT result FROM processed_ops WHERE op_id = ${opId}
    `;
    if (struk.length > 0) {
      return { hasil: struk[0]!.result as T, diulang: true };
    }

    await pakaiIdentitas(tx, actorId);

    const hasil = await jalankan({ tx, tenantId, actorId });

    // Struk ditulis SESUDAH pekerjaan berhasil, di transaksi yang sama.
    await tx`
      INSERT INTO processed_ops (op_id, tenant_id, mechanic_id, action, result)
      VALUES (${opId}, ${tenantId}, ${actorId}, ${action},
              ${tx.json(hasil as never)})
    `;

    return { hasil, diulang: false };
  }) as Promise<HasilPerintah<T>>;
}

/**
 * Merebut keadaan secara atomik.
 *
 * Menggantikan pola baca-status → putuskan → tulis, yang di KMB V2 butuh
 * LockService untuk tidak dibobol dua approver yang menekan bersamaan — dan
 * tetap meninggalkan celah bila eksekusi mati di antara dua langkah.
 *
 * Bila tidak ada baris yang terkena, keadaannya sudah berubah: itu KONFLIK
 * yang bisa dijelaskan ke pengguna, bukan galat teknis.
 */
export async function rebutStatus(
  tx: Tx,
  woId: number,
  dari: readonly string[],
  ke: string,
): Promise<Record<string, unknown> | null> {
  const baris = await tx<Record<string, unknown>[]>`
    UPDATE work_orders
       SET status = ${ke}::wo_status
     WHERE id = ${woId}
       AND status = ANY(${dari as string[]}::wo_status[])
    RETURNING *
  `;
  return baris[0] ?? null;
}
