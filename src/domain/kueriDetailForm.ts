import { sql } from '../lib/db.js';

/**
 * BACAAN FORM DETAIL (ban) — dilekatkan ke daftar WO mekanik.
 *
 * Port dari `lekatkanDetailTyreKeWo` (`_DetailTyre.js:827`) dan
 * `nilaiTerakhirBanSemuaPos` (`:641`).
 *
 * ── DUA BATAS YANG MENGIKAT SELURUH BERKAS INI ──────────────────────────────
 * 1. Data teknis TIDAK mengubah poin maupun rupiah.
 * 2. Kegagalan detail ban tidak boleh menghilangkan jam kerja, status, atau tim
 *    (`_DetailTyre.js:5-8, 63-89`).
 *
 * ── SATU PERJALANAN, BUKAN SEPULUH ──────────────────────────────────────────
 * Form membuka sepuluh posisi sekaligus. Membaca nilai Before satu per satu
 * berarti sepuluh pembacaan untuk satu kartu — bentuk N+1 yang di KMB V2 sudah
 * pernah membuat semua pengirim dan approver ikut mengantre
 * (`_DetailTyre.js:632-637`). Di sini seluruh posisi untuk seluruh WO yang
 * tampil diambil dalam SATU kueri.
 */

export type JenisForm = 'tyre_inspeksi' | 'tyre_remove_instal' | 'tyre_repair';

export interface MedanForm {
  fieldKey: string;
  label: string;
  dataType: 'numeric' | 'text' | 'enum' | 'date';
  hasBeforeAfter: boolean;
  /** Isi dropdown bila `dataType = 'enum'`. */
  pilihan: string[];
}

export interface BekalForm {
  formId: number;
  kode: JenisForm;
  nama: string;
  posisional: boolean;
  jumlahPos: number;
  medan: MedanForm[];
  /**
   * Ambang RTD kritis. `null` = belum diputuskan siapa pun, dan karena itu
   * TIDAK ADA penandaan kritis sama sekali. Menebak ambangnya berarti menandai
   * ban dengan batas yang tak seorang pun setujui (`_DetailTyre.js:175-194`).
   */
  rtdKritis: number | null;
}

export interface NilaiPosisi {
  /** field_key → nilai yang diketik mekanik pada WO ini. */
  after: Record<string, string>;
}

export interface DetailWo {
  formId: number;
  jenis: JenisForm;
  /** posisi → field_key → nilai. Untuk form tanpa posisi, kuncinya "0". */
  isian: Record<string, NilaiPosisi>;
  /**
   * Keadaan ban saat DITINGGALKAN pekerjaan sebelumnya: nilai `after` dari
   * catatan TERBARU milik WO LAIN pada unit yang sama.
   */
  before: Record<string, Record<string, string>>;
  /** Kapan catatan Before itu dibuat, per posisi. */
  beforeAt: Record<string, string>;
}

/** Metadata form — sama untuk semua WO, jadi dibaca SEKALI per halaman. */
export async function bekalForm(tenantId: number): Promise<Map<number, BekalForm>> {
  const [form, medan, setelan] = await Promise.all([
    sql<{
      id: number; code: JenisForm; name: string;
      is_positional: boolean; position_count: number | null;
    }[]>`
      SELECT id, code::text AS code, name, is_positional, position_count
        FROM job_detail_forms
       WHERE tenant_id = ${tenantId} AND is_enabled
    `,
    sql<{
      form_id: number; field_key: string; label: string; data_type: string;
      has_before_after: boolean; pilihan: string[] | null;
    }[]>`
      SELECT d.form_id, d.field_key::text AS field_key, d.label,
             d.data_type::text AS data_type, d.has_before_after,
             opt.daftar AS pilihan
        FROM job_detail_fields d
        JOIN job_detail_forms f ON f.id = d.form_id
        LEFT JOIN LATERAL (
          SELECT array_agg(v.value ORDER BY v.sort_order, v.value) AS daftar
            FROM option_values v
           WHERE v.list_id = d.option_list_id AND v.is_active
        ) opt ON true
       WHERE f.tenant_id = ${tenantId} AND f.is_enabled
       ORDER BY d.sort_order, d.field_key
    `,
    sql<{ setting_value: string | null }[]>`
      SELECT setting_value FROM settings
       WHERE tenant_id = ${tenantId} AND setting_key = 'tyre_rtd_kritis'
    `,
  ]);

  const ambang = setelan[0]?.setting_value;
  const rtdKritis = ambang && Number(ambang) > 0 ? Number(ambang) : null;

  const peta = new Map<number, BekalForm>();
  for (const f of form) {
    peta.set(Number(f.id), {
      formId: Number(f.id),
      kode: f.code,
      nama: f.name,
      posisional: f.is_positional,
      jumlahPos: Number(f.position_count ?? 0),
      medan: [],
      rtdKritis,
    });
  }
  for (const m of medan) {
    peta.get(Number(m.form_id))?.medan.push({
      fieldKey: m.field_key,
      label: m.label,
      dataType: m.data_type as MedanForm['dataType'],
      hasBeforeAfter: m.has_before_after,
      pilihan: m.pilihan ?? [],
    });
  }
  return peta;
}

/**
 * Detail untuk sekumpulan WO sekaligus.
 *
 * Hanya WO yang jobnya benar-benar terhubung ke form yang aktif. WO tanpa form
 * tidak muncul di hasil, dan bagiannya di layar cukup tidak digambar — tidak
 * ada galat, tidak ada yang perlu ditunggu.
 */
export async function detailUntukWo(
  tenantId: number,
  woIds: number[],
): Promise<Map<number, DetailWo>> {
  const hasil = new Map<number, DetailWo>();
  if (woIds.length === 0) return hasil;

  const wo = await sql<{ id: number; form_id: number; kode: JenisForm; unit_id: number | null }[]>`
    SELECT w.id, f.id AS form_id, f.code::text AS kode, w.unit_id
      FROM work_orders w
      JOIN jobs j              ON j.id = w.job_id
      JOIN job_detail_forms f  ON f.id = j.detail_form_id
     WHERE w.tenant_id = ${tenantId}
       AND w.id = ANY(${woIds}::bigint[])
       AND f.is_enabled
  `;
  if (wo.length === 0) return hasil;

  const ids = wo.map((w) => Number(w.id));
  for (const w of wo) {
    hasil.set(Number(w.id), {
      formId: Number(w.form_id), jenis: w.kode,
      isian: {}, before: {}, beforeAt: {},
    });
  }

  // ── isian WO ini ──────────────────────────────────────────────────────────
  const isian = await sql<{
    work_order_id: number; position: number; field_key: string; value_after: string | null;
  }[]>`
    SELECT work_order_id, position, field_key::text AS field_key, value_after
      FROM work_order_detail_values
     WHERE work_order_id = ANY(${ids}::bigint[])
  `;
  for (const r of isian) {
    if (r.value_after === null) continue;
    const d = hasil.get(Number(r.work_order_id))!;
    const pos = String(r.position);
    (d.isian[pos] ??= { after: {} }).after[r.field_key] = r.value_after;
  }

  // ── Before: catatan TERBARU milik WO LAIN pada unit yang sama ─────────────
  /* Yang dipilih adalah CATATAN (WO + posisi) dulu, baru medannya — bukan
     medan terbaru satu per satu. `DISTINCT ON (position, field_key)` akan
     mencampur tiga waktu berbeda menjadi satu "Before" yang tak pernah ada
     pada satu saat pun. Tekanan dari kemarin, RTD dari bulan lalu, dan suhu
     dari minggu depan bukan keadaan sebuah ban.

     WO yang sedang dibuka DIKECUALIKAN. Tanpa itu, nilai After yang baru saja
     diketik mekanik muncul kembali sebagai Before miliknya sendiri, dan
     selisihnya selalu nol (`_DetailTyre.js:790-793`). */
  const unitPerWo = wo.filter((w) => w.unit_id !== null);
  if (unitPerWo.length > 0) {
    const before = await sql<{
      wo_pembaca: number; position: number; field_key: string;
      value_after: string | null; recorded_at: Date;
    }[]>`
      WITH pembaca AS (
        SELECT unnest(${unitPerWo.map((w) => Number(w.id))}::bigint[]) AS wo_id,
               unnest(${unitPerWo.map((w) => Number(w.unit_id))}::int[]) AS unit_id,
               unnest(${unitPerWo.map((w) => Number(w.form_id))}::int[]) AS form_id
      ),
      catatan AS (
        SELECT p.wo_id AS wo_pembaca, v.work_order_id, v.form_id, v.position,
               max(v.recorded_at) AS dicatat_at
          FROM pembaca p
          JOIN work_orders w ON w.unit_id = p.unit_id
                            AND w.tenant_id = ${tenantId}
                            AND w.id <> p.wo_id
          JOIN work_order_detail_values v ON v.work_order_id = w.id
                                         AND v.form_id = p.form_id
         GROUP BY p.wo_id, v.work_order_id, v.form_id, v.position
      ),
      terakhir AS (
        SELECT DISTINCT ON (wo_pembaca, position) *
          FROM catatan
         ORDER BY wo_pembaca, position, dicatat_at DESC, work_order_id DESC
      )
      SELECT t.wo_pembaca, t.position, v.field_key::text AS field_key,
             v.value_after, t.dicatat_at AS recorded_at
        FROM terakhir t
        JOIN work_order_detail_values v
          ON v.work_order_id = t.work_order_id
         AND v.form_id = t.form_id
         AND v.position = t.position
    `;
    for (const r of before) {
      const d = hasil.get(Number(r.wo_pembaca));
      if (!d) continue;
      const pos = String(r.position);
      // NULL tetap NULL. "Nol adalah angka, dan angka yang salah lebih buruk
      // daripada kekosongan yang jujur." (`_DetailTyre.js:592-595`)
      if (r.value_after !== null) {
        (d.before[pos] ??= {})[r.field_key] = r.value_after;
      }
      d.beforeAt[pos] = r.recorded_at.toISOString();
    }
  }

  return hasil;
}
