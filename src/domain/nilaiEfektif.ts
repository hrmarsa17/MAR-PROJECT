import { angka, angkaAtau, type Tx } from '../lib/db.js';
import { tidakDitemukan } from '../lib/errors.js';
import type { FaktorTersedia, MasukanSkor, TimelinessStatus } from './scoring.js';
import { jamTerpakai } from './scoring.js';

/**
 * Menyusun angka yang BENAR-BENAR dipakai menghitung uang untuk satu WO.
 *
 * Satu fungsi, satu jawaban. Di KMB V2 urutan menang override punya DUA
 * implementasi terpisah: `getEffectiveBasePoints()` yang dibaca layar approver,
 * dan logika sebaris di dalam `superintendentApprove` yang dipakai perhitungan
 * sungguhan. Keduanya kebetulan sepakat hari ini. Tidak ada yang menjamin
 * keduanya tetap sepakat besok.
 *
 * Urutan menang: override L2 → override L1 → nilai manual (WO Others) → katalog.
 */

export interface NilaiEfektif extends MasukanSkor {
  team: { mechanicId: number; idrPerPoint: number; share: number }[];
  sectionId: number;
}

type BarisOverride = { level: string; kind: string; value: unknown };

function ambilOverride(rows: BarisOverride[], kind: string): unknown | undefined {
  // L2 menang. Baris yang ADA berarti level itu pernah menyentuh — termasuk
  // ketika ia sengaja mengosongkan (value null).
  const l2 = rows.find((r) => r.kind === kind && r.level === 'superintendent');
  if (l2) return l2.value;
  const l1 = rows.find((r) => r.kind === kind && r.level === 'supervisor');
  if (l1) return l1.value;
  return undefined;
}

export async function nilaiEfektif(tx: Tx, woId: number): Promise<NilaiEfektif> {
  const wo = (
    await tx<Record<string, unknown>[]>`
      SELECT w.*,
             j.base_points  AS job_base_points,
             j.plan_hours   AS job_plan_hours,
             u.unit_factor  AS unit_unit_factor
        FROM work_orders w
        LEFT JOIN jobs  j ON j.id = w.job_id
        LEFT JOIN units u ON u.id = w.unit_id
       WHERE w.id = ${woId}
    `
  )[0];
  if (!wo) throw tidakDitemukan('Work order', woId);

  const ov = await tx<BarisOverride[]>`
    SELECT level::text, kind::text, value
      FROM work_order_overrides WHERE work_order_id = ${woId}
  `;

  // ── base points & target hours ────────────────────────────────────────────
  // WO manual ("Others") menyimpan angkanya di KOLOM SENDIRI. Di KMB V2 ia
  // menumpang kolom override L1, sehingga setiap WO Others tampak seperti
  // sudah di-override oleh supervisor padahal tak seorang pun menyentuhnya.
  const baseKatalog = wo['is_manual']
    ? angka(wo['manual_base_points'])
    : angka(wo['job_base_points']);
  const targetKatalog = wo['is_manual']
    ? angka(wo['manual_target_hours'])
    : angka(wo['job_plan_hours']);

  const ovBase = ambilOverride(ov, 'base_points');
  const ovTarget = ambilOverride(ov, 'target_hours');
  const basePoints = ovBase == null ? baseKatalog : angka(ovBase);
  const targetHours = ovTarget == null ? targetKatalog : angka(ovTarget);

  // ── unit factor ───────────────────────────────────────────────────────────
  const ovUnit = ambilOverride(ov, 'unit');
  let unitFactor: number;
  if (ovUnit != null && typeof ovUnit === 'object' && 'unit_factor' in (ovUnit as object)) {
    unitFactor = angka((ovUnit as { unit_factor: unknown }).unit_factor);
  } else if (wo['is_manual']) {
    unitFactor = angka(wo['manual_unit_factor']);
  } else {
    // Unit tak ditemukan → 1,0. Berbeda dari base_points yang hilang, yang
    // melempar: faktor hilang berarti "tanpa penyesuaian", bukan "nol".
    unitFactor = angkaAtau(wo['unit_unit_factor'], 1.0);
  }

  // ── kondisi kerja & jam ───────────────────────────────────────────────────
  const ovCond = ambilOverride(ov, 'work_condition');
  const workCondition =
    ovCond == null ? String(wo['work_condition'] ?? 'normal') : String(ovCond);

  const ovTime = ambilOverride(ov, 'time');
  const sessionHours =
    ovTime != null && typeof ovTime === 'object' && 'session_hours' in (ovTime as object)
      ? angka((ovTime as { session_hours: unknown }).session_hours)
      : angkaAtau(wo['session_hours'], 0);

  // Jam transfer TIDAK BOLEH tertimpa oleh picker override. Picker hanya
  // mengoreksi sesi terakhir; partial_hours adalah kerja shift sebelumnya yang
  // sudah disetujui. Menyalin pola SUM (yang tidak punya transfer) apa adanya
  // akan menghapusnya diam-diam.
  const actualHours = jamTerpakai(sessionHours, angkaAtau(wo['partial_hours'], 0));

  // ── tim ───────────────────────────────────────────────────────────────────
  const ovTeam = ambilOverride(ov, 'team');
  const idTim: number[] = Array.isArray(ovTeam)
    ? (ovTeam as unknown[]).map((x) => Number(x))
    : (
        await tx<{ mechanic_id: number }[]>`
          SELECT mechanic_id FROM work_order_team WHERE work_order_id = ${woId}
        `
      ).map((r) => r.mechanic_id);

  const team = (
    await tx<{ mechanic_id: number; idr_per_point: string; share: string }[]>`
      SELECT m.id AS mechanic_id, p.idr_per_point, t.share
        FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id
        JOIN work_order_team t ON t.mechanic_id = m.id
       WHERE t.work_order_id = ${woId}
         AND m.id = ANY(${idTim}::int[])
    `
  ).map((r) => ({ mechanicId: r.mechanic_id, idrPerPoint: angka(r.idr_per_point), share: angka(r.share) }));

  if (team.length !== idTim.length) {
    throw tidakDitemukan('Tarif mekanik', 'salah satu anggota tim');
  }

  return {
    basePoints,
    targetHours,
    actualHours,
    unitFactor,
    workCondition,
    safetyIncident: Boolean(wo['safety_incident']),
    mtbfRedoStatus: (wo['mtbf_redo_status'] as string | null) ?? null,
    team,
    sectionId: Number(wo['section_id']),
  };
}

/** Memuat seluruh faktor tenant sekali, dalam bentuk yang dipakai hitungSkor. */
export async function muatFaktor(tx: Tx, tenantId: number): Promise<FaktorTersedia> {
  const rows = await tx<{ factor_type: string; factor_key: string; factor_value: string }[]>`
    SELECT factor_type::text, factor_key::text, factor_value
      FROM factors WHERE tenant_id = ${tenantId}
  `;
  const f: FaktorTersedia = {
    workCondition: {},
    timeliness: {} as Record<TimelinessStatus, number>,
    safety: {},
    mtbf: {},
  };
  for (const r of rows) {
    const nilai = angka(r.factor_value);
    if (r.factor_type === 'work_condition') f.workCondition[r.factor_key] = nilai;
    else if (r.factor_type === 'timeliness')
      f.timeliness[r.factor_key as TimelinessStatus] = nilai;
    else if (r.factor_type === 'safety') f.safety[r.factor_key] = nilai;
    else if (r.factor_type === 'mtbf') f.mtbf[r.factor_key] = nilai;
  }
  return f;
}
