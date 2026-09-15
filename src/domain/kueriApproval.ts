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
  /** Sudah berupa label yang dibaca orang: "Shift 1", "Shift 2", … */
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
      -- Label DIAMBIL dari tabel faktor, bukan dipetakan di layar.
      -- work_condition bukan tingkat kesulitan melainkan SHIFT, dan kuncinya
      -- (normal / difficult / extreme) nama warisan yang menyesatkan kalau
      -- ditampilkan mentah. Satu sumber label untuk semua layar.
      -- (Jangan pakai backtick di komentar ini: ia menutup template literal.)
      coalesce(fwc.description, w.work_condition::text) AS kondisi,
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
    LEFT JOIN factors fwc ON fwc.tenant_id = w.tenant_id
                         AND fwc.factor_type = 'work_condition'
                         AND fwc.factor_key = w.work_condition
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

/* ══════════════════════════════════════════════════════════════════════════
   BEKAL MODAL EDIT OVERRIDE
   ══════════════════════════════════════════════════════════════════════════
   Modal ini mengubah angka yang jadi uang, jadi ia harus menampilkan DUA hal
   berdampingan untuk tiap medan:

     nilai EFEKTIF  yang berlaku sekarang — itu yang diisikan ke kotaknya
     nilai ASAL     dari katalog atau isian manual — itu yang ditulis "Original:"

   Kalau cuma yang efektif, approver kedua tak punya cara tahu bahwa angka di
   depannya sudah pernah dikoreksi orang lain. Kalau cuma yang asal, ia akan
   menimpa koreksi itu tanpa sadar.
   ══════════════════════════════════════════════════════════════════════════ */

export interface BarisRiwayatOverride {
  level: 'supervisor' | 'superintendent';
  kind: string;
  /** Nilai SEBELUM koreksi. `undefined` bila memang belum pernah ada. */
  lama: unknown;
  baru: unknown;
  oleh: string;
  set_at: string;
}

export interface BekalOverride {
  woId: number;
  woNumber: string;
  status: string;
  bolehDiubah: boolean;
  efektif: {
    basePoints: number;
    targetHours: number;
    workCondition: string;
    team: number[];
    startTime: string | null;
    endTime: string | null;
    sessionHours: number;
  };
  asal: {
    basePoints: number | null;
    targetHours: number | null;
    workCondition: string;
    team: number[];
    startTime: string | null;
    endTime: string | null;
    sessionHours: number;
  };
  /** Jam dari shift sebelum transfer. TIDAK bisa disunting, ikut ditambahkan. */
  partialHours: number;
  judgment: { teks: string; sumber: 'supervisor' | 'superintendent' | null };
  unit: { nama: string | null; factor: number };
  riwayat: BarisRiwayatOverride[];
  mekanik: { id: number; nama: string; jabatan: string | null }[];
  kondisi: { kunci: string; label: string; faktor: number }[];
}

const STATUS_BOLEH_DIUBAH_TAMPILAN = [
  'pending_mechanic_work', 'in_progress', 'pending_transfer',
  'pending_supervisor', 'pending_superintendent',
];

export async function bekalOverride(
  aku: Identitas,
  woId: number,
): Promise<BekalOverride | null> {
  const { nilaiEfektif } = await import('./nilaiEfektif.js');

  return sql.begin(async (tx) => {
    const wo = (
      await tx<{
        id: number; wo_number: string; status: string; work_condition: string;
        is_manual: boolean; partial_hours: string; session_hours: string | null;
        start_time: Date | null; end_time: Date | null;
        job_base_points: string | null; job_plan_hours: string | null;
        manual_base_points: string | null; manual_target_hours: string | null;
        unit_nama: string | null;
      }[]>`
        SELECT w.id, w.wo_number, w.status::text, w.work_condition::text AS work_condition,
               w.is_manual, w.partial_hours, w.session_hours, w.start_time, w.end_time,
               j.base_points AS job_base_points, j.plan_hours AS job_plan_hours,
               w.manual_base_points, w.manual_target_hours,
               u.unit_name AS unit_nama
          FROM work_orders w
          LEFT JOIN jobs  j ON j.id = w.job_id
          LEFT JOIN units u ON u.id = w.unit_id
         WHERE w.id = ${woId} AND w.tenant_id = ${aku.tenantId}
      `
    )[0];
    if (!wo) return null;

    // Resolver yang SAMA dengan yang dipakai menghitung uang. Kalau layar ini
    // memakai rumusnya sendiri, suatu hari ia akan menampilkan angka yang
    // berbeda dari yang dibayarkan — dan itu ditemukan lewat slip gaji.
    const ne = await nilaiEfektif(tx, woId);

    const [timAsal, ov, mekanik, kondisi] = await Promise.all([
      tx<{ mechanic_id: number }[]>`
        SELECT mechanic_id FROM work_order_team WHERE work_order_id = ${woId}
         ORDER BY mechanic_id
      `,
      /* Riwayat dari AUDIT_LOGS, bukan dari tabel override.
         Kunci utama tabel override (wo, level, kind) hanya menyimpan nilai
         TERAKHIR — koreksi kedua menghapus jejak yang pertama. Audit menyimpan
         tiap langkah berikut nilai LAMA-nya, dan itulah yang membuat layar bisa
         menampilkan "20 → 30" alih-alih cuma "30", persis seperti KMB V2
         (`Approval.html:1250-1252`). */
      tx<{ oleh: string; set_at: Date; details: Record<string, unknown> }[]>`
        SELECT m.name AS oleh, a.occurred_at AS set_at, a.details
          FROM audit_logs a
          JOIN mechanics m ON m.id = a.actor_id
         WHERE a.entity_type = 'work_order'
           AND a.entity_id = ${String(woId)}
           AND a.action = 'save_override'
         ORDER BY a.occurred_at ASC
      `,
      tx<{ id: number; nama: string; jabatan: string | null }[]>`
        SELECT m.id, m.name AS nama, pr.label AS jabatan
          FROM mechanics m
          LEFT JOIN pay_rates pr ON pr.id = m.pay_rate_id
         WHERE m.tenant_id = ${aku.tenantId} AND m.is_active AND m.role = 'mechanic'
         ORDER BY m.name
      `,
      tx<{ kunci: string; label: string; faktor: string }[]>`
        SELECT factor_key::text AS kunci,
               coalesce(description, factor_key::text) AS label,
               factor_value AS faktor
          FROM factors
         WHERE tenant_id = ${aku.tenantId} AND factor_type = 'work_condition'
         ORDER BY factor_value
      `,
    ]);

    const num = (v: string | null) => (v === null ? null : Number(v));

    // Judgment & waktu efektif dibaca dari tabel override (keadaan SEKARANG),
    // bukan dari audit (riwayat langkahnya).
    const kini = await tx<{ level: string; kind: string; value: unknown }[]>`
      SELECT level::text, kind::text, value FROM work_order_overrides
       WHERE work_order_id = ${woId}
    `;
    // Waktu efektif: override L2 menang atas L1; tanpa keduanya pakai kolom WO.
    const ovTime = (
      kini.find((r) => r.kind === 'time' && r.level === 'superintendent')
      ?? kini.find((r) => r.kind === 'time' && r.level === 'supervisor')
    )?.value as { start_time?: string; end_time?: string } | undefined;

    const jL2 = kini.find((r) => r.kind === 'judgment' && r.level === 'superintendent');
    const jL1 = kini.find((r) => r.kind === 'judgment' && r.level === 'supervisor');
    const jPakai = jL2 ?? jL1;

    return {
      woId: Number(wo.id),
      woNumber: wo.wo_number,
      status: wo.status,
      bolehDiubah: STATUS_BOLEH_DIUBAH_TAMPILAN.includes(wo.status),
      efektif: {
        basePoints: ne.basePoints,
        targetHours: ne.targetHours,
        workCondition: ne.workCondition,
        team: ne.team.map((t) => t.mechanicId).sort((a, b) => a - b),
        startTime: ovTime?.start_time ?? wo.start_time?.toISOString() ?? null,
        endTime: ovTime?.end_time ?? wo.end_time?.toISOString() ?? null,
        sessionHours: Number(wo.session_hours ?? 0),
      },
      asal: {
        basePoints: wo.is_manual ? num(wo.manual_base_points) : num(wo.job_base_points),
        targetHours: wo.is_manual ? num(wo.manual_target_hours) : num(wo.job_plan_hours),
        workCondition: wo.work_condition,
        team: timAsal.map((t) => Number(t.mechanic_id)),
        startTime: wo.start_time?.toISOString() ?? null,
        endTime: wo.end_time?.toISOString() ?? null,
        sessionHours: Number(wo.session_hours ?? 0),
      },
      partialHours: Number(wo.partial_hours ?? 0),
      judgment: {
        teks: typeof jPakai?.value === 'string' ? jPakai.value : '',
        sumber: (jPakai?.level as 'supervisor' | 'superintendent' | undefined) ?? null,
      },
      unit: { nama: wo.unit_nama, factor: ne.unitFactor },
      riwayat: ov.map((r) => ({
        level: String(r.details['level']) as 'supervisor' | 'superintendent',
        kind: String(r.details['kind']),
        lama: r.details['lama'],
        baru: r.details['baru'],
        oleh: r.oleh,
        set_at: r.set_at.toISOString(),
      })),
      mekanik: mekanik.map((m) => ({ id: Number(m.id), nama: m.nama, jabatan: m.jabatan })),
      kondisi: kondisi.map((k) => ({
        kunci: k.kunci, label: k.label, faktor: Number(k.faktor),
      })),
    };
  });
}
