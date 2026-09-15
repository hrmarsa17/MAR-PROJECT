import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';

/**
 * BACAAN LAYAR APPROVAL.
 *
 * Bentuk kartunya ditentukan oleh apa yang approver butuhkan untuk memutuskan
 * TANPA membuka apa pun: nomor, pekerjaan, unit, jam rencana vs nyata, base
 * points, faktor unit, keterangan mekanik, dan susunan tim — semuanya sekaligus.
 *
 * Itu sebabnya kueri ini lebar. Di KMB V2 kelebaran yang sama dicapai dengan
 * memindai beberapa sheet lalu menjahitnya di JavaScript; di sini satu kueri
 * dengan JOIN, dan kolom yang sama keluar dalam satu perjalanan.
 */

export type TabApproval = 'menunggu' | 'aktif' | 'approved' | 'transfer' | 'ditolak';

export interface KartuApproval {
  id: number;
  wo_number: string;
  status: string;
  tahap: string;
  dibuat_mekanik: boolean;
  ketepatan: 'on_time' | 'late' | 'way_late' | null;

  job_code: string | null;
  job_nama: string | null;
  job_kategori: string | null;

  unit_code: string | null;
  unit_nama: string | null;
  unit_factor: number | null;
  lokasi: string | null;

  dibuat_at: string;
  dikirim_at: string | null;
  kondisi: string;
  actual_hours: number | null;
  target_hours: number | null;
  base_points: number | null;

  keterangan: string | null;
  tim: string[];
  l1_oleh: string | null;
  putaran: number;
  ada_override: boolean;
  kembar_dicurigai: boolean;
  final_points: number | null;
}

async function scopeSection(mechanicId: number): Promise<string[] | null> {
  const rows = await sql<{ section: string }[]>`
    SELECT section::text FROM mechanic_sections WHERE mechanic_id = ${mechanicId}
  `;
  return rows.length === 0 ? null : rows.map((r) => r.section);
}

/** Status yang ditampilkan tiap tab. */
function statusUntukTab(tab: TabApproval, peran: Identitas['peran']): string[] {
  switch (tab) {
    case 'menunggu':
      // Hanya tahap yang memang giliran orang ini. L2 tidak perlu melihat
      // antrean L1 di tab utamanya — itu pekerjaan orang lain.
      return peran === 'superintendent' ? ['pending_superintendent'] : ['pending_supervisor'];
    case 'aktif':
      return ['pending_mechanic_work', 'in_progress'];
    case 'approved':
      return ['approved'];
    case 'transfer':
      return ['pending_transfer'];
    case 'ditolak':
      return ['rejected', 'cancelled'];
  }
}

export async function kartuApproval(
  aku: Identitas,
  tab: TabApproval,
  batas = 25,
): Promise<KartuApproval[]> {
  const scope = await scopeSection(aku.mechanicId);
  const status = statusUntukTab(tab, aku.peran);
  // Approved & ditolak diurut terbaru dulu; antrean diurut TERLAMA dulu supaya
  // yang paling lama menunggu tidak tenggelam.
  const terbaruDulu = tab === 'approved' || tab === 'ditolak';

  return sql<KartuApproval[]>`
    SELECT
      w.id,
      w.wo_number,
      w.status::text AS status,
      CASE w.status
        WHEN 'pending_supervisor'      THEN 'Level 1'
        WHEN 'pending_superintendent'  THEN 'Level 2'
        WHEN 'approved'                THEN 'Approved'
        WHEN 'rejected'                THEN 'Ditolak'
        WHEN 'cancelled'               THEN 'Dibatalkan'
        WHEN 'pending_transfer'        THEN 'Transfer'
        ELSE 'Aktif'
      END AS tahap,
      (pembuat.role = 'mechanic') AS dibuat_mekanik,

      CASE
        WHEN w.actual_hours IS NULL OR coalesce(j.plan_hours, w.manual_target_hours) IS NULL
          THEN NULL
        WHEN coalesce(j.plan_hours, w.manual_target_hours) <= 0 THEN 'on_time'
        WHEN w.actual_hours / coalesce(j.plan_hours, w.manual_target_hours) <= 1.0 THEN 'on_time'
        WHEN w.actual_hours / coalesce(j.plan_hours, w.manual_target_hours) <= 1.5 THEN 'late'
        ELSE 'way_late'
      END AS ketepatan,

      j.job_code::text AS job_code,
      coalesce(
        nullif(concat_ws(' — ', c.name::text, sc.name::text, j.job_description), ''),
        w.manual_description
      ) AS job_nama,
      j.job_type::text AS job_kategori,

      u.unit_code::text AS unit_code,
      u.unit_nama,
      coalesce(u.unit_factor, w.manual_unit_factor) AS unit_factor,
      w.location AS lokasi,

      w.created_at   AS dibuat_at,
      w.submitted_at AS dikirim_at,
      w.work_condition::text AS kondisi,
      w.actual_hours,
      coalesce(j.plan_hours, w.manual_target_hours) AS target_hours,
      coalesce(j.base_points, w.manual_base_points) AS base_points,

      w.keterangan,
      coalesce(tim.nama, ARRAY[]::text[]) AS tim,
      l1.name AS l1_oleh,
      w.putaran,
      EXISTS (SELECT 1 FROM work_order_overrides o WHERE o.work_order_id = w.id) AS ada_override,
      EXISTS (SELECT 1 FROM wo_kembar_dicurigai k WHERE k.wo_id = w.id) AS kembar_dicurigai,
      w.final_points

    FROM work_orders w
    JOIN sections  s       ON s.id = w.section_id
    JOIN mechanics pembuat ON pembuat.id = w.created_by
    LEFT JOIN mechanics l1 ON l1.id = w.approved_l1_by
    LEFT JOIN jobs j                ON j.id  = w.job_id
    LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
    LEFT JOIN job_components     c  ON c.id  = sc.component_id
    LEFT JOIN LATERAL (
      SELECT u2.unit_code, u2.unit_name AS unit_nama, u2.unit_factor
        FROM units u2 WHERE u2.id = w.unit_id
    ) u ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(m.name ORDER BY m.name) AS nama
        FROM work_order_team t JOIN mechanics m ON m.id = t.mechanic_id
       WHERE t.work_order_id = w.id
    ) tim ON true

    WHERE w.tenant_id = ${aku.tenantId}
      AND w.status::text = ANY(${status})
      AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
    ORDER BY
      CASE WHEN ${terbaruDulu} THEN w.created_at END DESC,
      CASE WHEN NOT ${terbaruDulu} THEN w.created_at END ASC
    LIMIT ${batas}
  `;
}

export interface HitunganTab {
  menunggu: number; aktif: number; approved: number; transfer: number; ditolak: number;
}

/**
 * Jumlah per tab, satu perjalanan.
 *
 * KMB V2 memuat 25 kartu dari 369 yang menunggu dan memberi tahu berapa
 * sisanya — jujur soal apa yang belum ditampilkan, alih-alih diam. Angka di
 * sini yang membuat kejujuran itu mungkin.
 */
export async function hitunganTab(aku: Identitas): Promise<HitunganTab> {
  const scope = await scopeSection(aku.mechanicId);
  const tahapSaya =
    aku.peran === 'superintendent' ? 'pending_superintendent' : 'pending_supervisor';

  const r = (
    await sql<Record<string, string>[]>`
      SELECT
        count(*) FILTER (WHERE w.status::text = ${tahapSaya}) AS menunggu,
        count(*) FILTER (WHERE w.status IN ('pending_mechanic_work','in_progress')) AS aktif,
        count(*) FILTER (WHERE w.status = 'approved') AS approved,
        count(*) FILTER (WHERE w.status = 'pending_transfer') AS transfer,
        count(*) FILTER (WHERE w.status IN ('rejected','cancelled')) AS ditolak
      FROM work_orders w
      JOIN sections s ON s.id = w.section_id
      WHERE w.tenant_id = ${aku.tenantId}
        AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
    `
  )[0]!;

  return {
    menunggu: Number(r['menunggu']),
    aktif: Number(r['aktif']),
    approved: Number(r['approved']),
    transfer: Number(r['transfer']),
    ditolak: Number(r['ditolak']),
  };
}
