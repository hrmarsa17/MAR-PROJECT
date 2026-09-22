import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';

/**
 * BACAAN.
 *
 * Dipisah dari perintah karena sifatnya berbeda: bacaan tidak pernah mengubah
 * apa pun, tidak butuh op_id, dan boleh dilayani salinan yang sedikit tertinggal.
 *
 * Satu hal yang TIDAK boleh ditiru dari KMB V2: menelan galat jadi daftar
 * kosong (`r.data ? r.data : []`). Approver pernah melihat "tidak ada WO aktif"
 * padahal ada 36, karena satu variabel salah ketik melempar dan galatnya
 * ditelan. Layar kosong yang tampak normal lebih berbahaya daripada pesan galat.
 */

export interface KartuWo {
  id: number;
  wo_number: string;
  status: string;
  section: string;
  unit_name: string | null;
  job_description: string | null;
  pembuat: string;
  tim: string[];
  actual_hours: number | null;
  target_hours: number | null;
  perkiraan_poin: number | null;
  created_at: string;
  kembar_dicurigai: boolean;
}

/** Scope kosong = boleh melihat semua section. Perilaku KMB V2 dipertahankan. */
export async function sectionYangBoleh(mechanicId: number): Promise<string[] | null> {
  const rows = await sql<{ section: string }[]>`
    SELECT section::text FROM mechanic_sections WHERE mechanic_id = ${mechanicId}
  `;
  return rows.length === 0 ? null : rows.map((r) => r.section);
}

export async function antreanApproval(aku: Identitas): Promise<KartuWo[]> {
  const tahap =
    aku.peran === 'superintendent' ? 'pending_superintendent'
    : aku.peran === 'supervisor' ? 'pending_supervisor'
    : null;
  if (!tahap) return [];

  const scope = await sectionYangBoleh(aku.mechanicId);

  return sql<KartuWo[]>`
    SELECT w.id,
           w.wo_number,
           w.status::text                          AS status,
           s.code::text                            AS section,
           u.unit_name,
           coalesce(j.job_description, w.manual_description) AS job_description,
           pembuat.name                            AS pembuat,
           coalesce(tim.nama, ARRAY[]::text[])     AS tim,
           w.actual_hours,
           coalesce(j.plan_hours, w.manual_target_hours) AS target_hours,
           -- Perkiraan, bukan angka final: poin sesungguhnya baru terbit saat
           -- L2 menyetujui, dan ia dibekukan di scoring_snapshots.
           round(coalesce(j.base_points, w.manual_base_points)
                 * coalesce(u.unit_factor, w.manual_unit_factor, 1), 2) AS perkiraan_poin,
           w.created_at,
           EXISTS (SELECT 1 FROM wo_kembar_dicurigai k WHERE k.wo_id = w.id) AS kembar_dicurigai
      FROM work_orders w
      JOIN sections  s       ON s.id = w.section_id
      JOIN mechanics pembuat ON pembuat.id = w.created_by
      LEFT JOIN jobs  j ON j.id = w.job_id
      LEFT JOIN units u ON u.id = w.unit_id
      LEFT JOIN LATERAL (
        SELECT array_agg(m.name ORDER BY m.name) AS nama
          FROM work_order_team t JOIN mechanics m ON m.id = t.mechanic_id
         WHERE t.work_order_id = w.id
      ) tim ON true
     WHERE w.tenant_id = ${aku.tenantId}
       AND w.status = ${tahap}::wo_status
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
     ORDER BY w.created_at ASC
  `;
}

export async function woSaya(aku: Identitas): Promise<KartuWo[]> {
  return sql<KartuWo[]>`
    SELECT w.id, w.wo_number, w.status::text AS status, s.code::text AS section,
           u.unit_name,
           coalesce(j.job_description, w.manual_description) AS job_description,
           pembuat.name AS pembuat,
           coalesce(tim.nama, ARRAY[]::text[]) AS tim,
           w.actual_hours,
           coalesce(j.plan_hours, w.manual_target_hours) AS target_hours,
           w.final_points AS perkiraan_poin,
           w.created_at,
           false AS kembar_dicurigai
      FROM work_orders w
      JOIN sections  s       ON s.id = w.section_id
      JOIN mechanics pembuat ON pembuat.id = w.created_by
      LEFT JOIN jobs  j ON j.id = w.job_id
      LEFT JOIN units u ON u.id = w.unit_id
      LEFT JOIN LATERAL (
        SELECT array_agg(m.name ORDER BY m.name) AS nama
          FROM work_order_team t JOIN mechanics m ON m.id = t.mechanic_id
         WHERE t.work_order_id = w.id
      ) tim ON true
     WHERE w.tenant_id = ${aku.tenantId}
       AND (w.created_by = ${aku.mechanicId}
            OR EXISTS (SELECT 1 FROM work_order_team t
                        WHERE t.work_order_id = w.id
                          AND t.mechanic_id = ${aku.mechanicId}))
       AND w.status <> 'cancelled'
     ORDER BY w.created_at DESC
     LIMIT 200
  `;
}

/**
 * Katalog untuk layar buat-WO.
 *
 * Dikirim UTUH sekali, lalu diiris di layar — sama seperti KMB V2, karena
 * cascade empat tingkat yang bolak-balik ke server terasa berat di sinyal
 * lapangan. Bedanya: poin TIDAK ikut dikirim kecuali penerimanya L2.
 */
export async function katalog(aku: Identitas) {
  const bolehLihatPoin = aku.peran === 'superintendent';

  const [sections, units, jobs, mekanik] = await Promise.all([
    sql`SELECT code::text, name, picker_style::text, requires_unit
          FROM sections WHERE tenant_id = ${aku.tenantId} AND is_active
         ORDER BY sort_order`,
    /**
     * DUA hubungan yang berbeda, dan dulu tertukar.
     *
     *   `sections`   — section MANA yang boleh memilih unit ini (`unit_sections`,
     *                  setara `unit_scope` V2). Boleh lebih dari satu.
     *   `unit_model` — model alatnya, yang menentukan JOB mana yang ditawarkan
     *                  untuknya di section cascade.
     *
     * Sampai 16 Sep 2026 baris ini mengambil `s.code` dari section MODEL dan
     * layar memakainya untuk menyaring dropdown unit. Model sebuah Hauler milik
     * field — jadi tyreman, yang mengurus ban 35 Hauler, melihat 6 unit dari 50
     * miliknya. Yang 44 hanya muncul kalau ia menekan "Tampilkan semua unit",
     * dan tak ada yang memberi tahu bahwa ia harus menekannya.
     */
    sql`SELECT u.id, u.unit_code::text, u.unit_name, u.unit_factor,
               um.code::text AS unit_model,
               u.is_global, u.is_virtual,
               coalesce(sc.daftar, ARRAY[]::text[]) AS sections
          FROM units u
          LEFT JOIN unit_models um ON um.id = u.unit_model_id
          LEFT JOIN LATERAL (
            SELECT array_agg(s.code::text ORDER BY s.code) AS daftar
              FROM unit_sections us JOIN sections s ON s.id = us.section_id
             WHERE us.unit_id = u.id
          ) sc ON true
         WHERE u.tenant_id = ${aku.tenantId} AND u.is_active
         ORDER BY u.unit_name`,
    sql`SELECT j.id, j.job_code::text,
               s.code::text  AS section,
               um.code::text AS unit_model,
               c.name::text  AS component,
               sc.name::text AS sub_component,
               coalesce(j.job_type::text, '') AS job_type,
               j.job_description, j.plan_hours,
               ${bolehLihatPoin ? sql`j.base_points` : sql`NULL::numeric`} AS base_points
          FROM jobs j
          JOIN sections s ON s.id = j.section_id
          LEFT JOIN unit_models        um ON um.id = j.unit_model_id
          LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
          LEFT JOIN job_components     c  ON c.id  = sc.component_id
         WHERE j.tenant_id = ${aku.tenantId} AND j.is_active
         ORDER BY j.job_description`,
    // Section mekanik ikut dikirim: dropdown tim disaring per section, dan
    // mekanik TANPA section selalu tampil (perilaku KMB V2 — kosong berarti
    // milik semua section).
    sql`SELECT m.id, m.name, m.role::text,
               coalesce(sec.daftar, ARRAY[]::text[]) AS sections,
               pr.label AS jabatan
          FROM mechanics m
          LEFT JOIN pay_rates pr ON pr.id = m.pay_rate_id
          LEFT JOIN LATERAL (
            SELECT array_agg(ms.section::text ORDER BY ms.section::text) AS daftar
              FROM mechanic_sections ms WHERE ms.mechanic_id = m.id
          ) sec ON true
         WHERE m.tenant_id = ${aku.tenantId} AND m.is_active
         ORDER BY m.name`,
  ]);

  const [kondisi, meter] = await Promise.all([
    // Kondisi kerja datang dari tabel faktor, TIDAK ditulis di layar. Di KMB V2
    // daftarnya juga dikirim server; menuliskannya di layar berarti pengalinya
    // punya dua versi — yang tampil dan yang menghitung.
    sql`SELECT factor_key::text AS kunci, factor_value AS faktor,
               coalesce(description, factor_key::text) AS label
          FROM factors
         WHERE tenant_id = ${aku.tenantId} AND factor_type = 'work_condition'
         ORDER BY factor_value`,
    meterTerakhirPerUnit(aku.tenantId),
  ]);

  return { sections, units, jobs, mekanik, kondisi, meter, tenantCode: aku.tenantCode };
}

/**
 * Angka meter TERAKHIR tiap unit, untuk catatan kaki di layar buat-WO.
 *
 * Yang diambil yang PALING BESAR, bukan yang tanggalnya paling baru
 * (`_Meter.js:413-417`): meter tak pernah mundur, dan WO yang dibuat menyusul
 * untuk pekerjaan kemarin tidak boleh menarik angka ini mundur.
 *
 * Ini CATATAN, bukan pagar. Unit bisa berganti panel jam, dan menolak angka
 * yang "mundur" akan menghalangi orang mencatat kenyataan. Manusia yang menilai.
 */
async function meterTerakhirPerUnit(tenantId: number) {
  const rows = await sql<{
    unit_id: number; kind: string; nilai: string; oleh: string | null; at: Date;
  }[]>`
    SELECT DISTINCT ON (r.unit_id, r.kind)
           r.unit_id, r.kind::text AS kind, r.value AS nilai,
           m.name AS oleh, r.recorded_at AS at
      FROM meter_readings r
      JOIN units u ON u.id = r.unit_id
      LEFT JOIN mechanics m ON m.id = r.recorded_by
     WHERE u.tenant_id = ${tenantId} AND r.value > 0
     ORDER BY r.unit_id, r.kind, r.value DESC
  `;
  const out: Record<string, { nilai: number; oleh: string | null; at: string }> = {};
  for (const r of rows) {
    // Kunci "HM:12" / "KM:12" — dua peta dalam satu kiriman, karena keduanya
    // angka yang berbeda dan tak bisa saling menggantikan.
    out[`${r.kind}:${r.unit_id}`] = {
      nilai: Number(r.nilai),
      oleh: r.oleh,
      at: r.at.toISOString(),
    };
  }
  return out;
}

/**
 * STATUS SEBUAH KIRIMAN. Read-only, aman dipanggil berkali-kali.
 *
 * Inilah yang menjawab pertanyaan yang tidak bisa dijawab layar sendiri:
 * sambungan putus saat permintaan BERANGKAT (server tak pernah menerima) dan
 * putus saat jawaban PULANG (server sudah menulis semuanya) terlihat persis
 * sama dari sisi klien. Bertanya ke sini adalah satu-satunya cara tahu.
 *
 * `processed_ops` hanya terisi pada jalur BERHASIL, jadi ada baris = pekerjaan
 * benar-benar tuntas, dan struk yang dulu dikirim masih utuh di sana.
 */
export async function statusKiriman(aku: Identitas, opId: string) {
  const baris = await sql<{ result: unknown; created_at: Date; action: string }[]>`
    SELECT result, created_at, action
      FROM processed_ops
     WHERE op_id = ${opId} AND tenant_id = ${aku.tenantId}
  `;
  const r = baris[0];
  if (!r) {
    // TIDAK ADA bukan berarti "gagal" — bisa juga masih berjalan. Yang bisa
    // dipastikan cuma: tak ada yang tercatat tuntas, jadi aman dibuat ulang
    // dengan op_id yang SAMA (kalau ternyata sedang berjalan, gerbang
    // idempotensi yang menahannya).
    return { keadaan: 'tidak_ada' as const, wo: [] };
  }
  const hasil = r.result as { dibuat?: { id: number; woNumber: string }[] };
  return {
    keadaan: 'selesai' as const,
    aksi: r.action,
    waktu: r.created_at.toISOString(),
    wo: hasil.dibuat ?? [],
  };
}

/** Rincian satu WO untuk layar approval, termasuk rincian skor bila sudah ada. */
export async function rincianWo(aku: Identitas, woId: number) {
  const wo = (
    await sql`
      SELECT w.*, s.code::text AS section, u.unit_name, u.unit_factor,
             j.job_description, j.plan_hours, j.base_points,
             pembuat.name AS pembuat_nama
        FROM work_orders w
        JOIN sections s ON s.id = w.section_id
        JOIN mechanics pembuat ON pembuat.id = w.created_by
        LEFT JOIN units u ON u.id = w.unit_id
        LEFT JOIN jobs  j ON j.id = w.job_id
       WHERE w.id = ${woId} AND w.tenant_id = ${aku.tenantId}
    `
  )[0];
  if (!wo) return null;

  const [tim, snapshot, poin, overrides] = await Promise.all([
    sql`SELECT m.id, m.name FROM work_order_team t
          JOIN mechanics m ON m.id = t.mechanic_id
         WHERE t.work_order_id = ${woId} ORDER BY m.name`,
    sql`SELECT * FROM scoring_snapshots WHERE work_order_id = ${woId}`,
    sql`SELECT p.*, m.name FROM mechanic_points p
          JOIN mechanics m ON m.id = p.mechanic_id
         WHERE p.work_order_id = ${woId}`,
    sql`SELECT level::text, kind::text, value, set_at FROM work_order_overrides
         WHERE work_order_id = ${woId}`,
  ]);

  return { wo, tim, snapshot: snapshot[0] ?? null, poin, overrides };
}
