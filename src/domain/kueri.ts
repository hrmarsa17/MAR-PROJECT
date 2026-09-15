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
    sql`SELECT u.id, u.unit_code::text, u.unit_name, u.unit_factor,
               um.code::text AS unit_model, s.code::text AS section
          FROM units u
          LEFT JOIN unit_models um ON um.id = u.unit_model_id
          LEFT JOIN sections   s  ON s.id  = um.section_id
         WHERE u.tenant_id = ${aku.tenantId} AND u.is_active
         ORDER BY u.unit_name`,
    sql`SELECT j.id, j.job_code::text,
               s.code::text  AS section,
               um.code::text AS unit_model,
               c.name::text  AS component,
               sc.name::text AS sub_component,
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

  return { sections, units, jobs, mekanik };
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
