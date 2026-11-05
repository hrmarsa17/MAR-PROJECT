/**
 * RUMUS POIN & RUPIAH — fungsi murni, tanpa basis data (`src/domain/scoring.mjs`).
 *
 * Satu-satunya sumber perhitungan poin dan uang di seluruh repo (AGENTS.md §1).
 * Diimpor oleh TypeScript (`src/domain/scoring.ts`) maupun Cloudflare Workers
 * (`workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`).
 */

export const AMBANG_TEPAT_WAKTU = Object.freeze({ ON_TIME_MAX: 100, LATE_MAX: 150 });

export const FACTORS = Object.freeze({
  work_condition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  workCondition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
  safety: { no_incident: 1.0, incident: 0.0 },
  mtbf: { first_time: 1.2, redo: 0.8 },
});

export const RATES = Object.freeze({
  helper: 1500,
  tyreman_helper: 1500,
  tyreman: 2500,
  junior: 2500,
  senior: 3000,
  middle: 3000,
  tyreman_senior: 3500,
  advisor: 3500,
  default: 2500,
});

/**
 * Pembulatan setengah-ke-atas yang tahan galat pecahan biner.
 * Menjamin 1.005 -> 1.01 dan 8.165 -> 8.17 tanpa tergelincir biner.
 * @param {number} nilai
 * @param {number} desimal
 * @returns {number}
 */
export function bulatkan(nilai, desimal = 2) {
  if (!Number.isFinite(nilai)) throw new Error(`bukan angka: ${String(nilai)}`);
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

/**
 * Status ketepatan waktu dari jam kerja aktual dibanding target.
 * @param {number} actualHours
 * @param {number} targetHours
 * @returns {'on_time' | 'late' | 'way_late'}
 */
export function statusKetepatanWaktu(actualHours, targetHours) {
  if (targetHours <= 0) return 'on_time';
  const ratio = (actualHours / targetHours) * 100;
  if (ratio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) return 'on_time';
  if (ratio <= AMBANG_TEPAT_WAKTU.LATE_MAX) return 'late';
  return 'way_late';
}

/**
 * FINAL = base × unit × kondisi × ketepatan × safety × mtbf
 * @param {{
 *   basePoints: number,
 *   targetHours: number,
 *   actualHours: number,
 *   unitFactor: number,
 *   workCondition: string,
 *   safetyIncident: boolean,
 *   mtbfRedoStatus: string | null
 * }} m
 * @param {{
 *   workCondition: Record<string, number>,
 *   timeliness: Record<string, number>,
 *   safety: Record<string, number>,
 *   mtbf: Record<string, number>
 * }} f
 */
export function hitungSkor(m, f = FACTORS) {
  const actual = parseFloat(m.actualHours) || 0;
  const target = parseFloat(m.targetHours) || 0;
  const timelinessStatus = statusKetepatanWaktu(actual, target);

  const workCondGroup = (f && (f.workCondition || f.work_condition)) || {};
  const timelinessGroup = (f && f.timeliness) || {};
  const safetyGroup = (f && f.safety) || {};
  const mtbfGroup = (f && f.mtbf) || {};

  const workConditionFactor = workCondGroup[m.workCondition] ?? 1.0;
  const timelinessFactor = timelinessGroup[timelinessStatus] ?? 1.0;
  const safetyFactor = m.safetyIncident
    ? (safetyGroup['incident'] ?? 0.0)
    : (safetyGroup['no_incident'] ?? 1.0);
  const mtbfKey = m.mtbfRedoStatus || m.mtbfStatus || 'first_time';
  const mtbfFactor = mtbfGroup[mtbfKey] ?? 1.0;

  const basePoints = parseFloat(m.basePoints) || 0;
  const unitFactor = parseFloat(m.unitFactor ?? 1.0) || 1.0;

  const finalPoints = bulatkan(
    basePoints *
      unitFactor *
      workConditionFactor *
      timelinessFactor *
      safetyFactor *
      mtbfFactor,
    2,
  );

  return {
    basePoints,
    targetHours: target,
    actualHours: actual,
    unitFactor,
    workConditionFactor,
    timelinessFactor,
    timelinessStatus,
    safetyFactor,
    mtbfFactor,
    finalPoints,
    finalScore: finalPoints,
  };
}

/**
 * Rupiah satu mekanik (Model Poin Penuh).
 * @param {number} points
 * @param {number} idrPerPoint
 * @returns {number}
 */
export function rupiahUntukPoin(points, idrPerPoint) {
  if (!Number.isFinite(points) || !Number.isFinite(idrPerPoint)) {
    throw new Error(`argumen tidak valid: points=${points}, idrPerPoint=${idrPerPoint}`);
  }
  return Math.round(points * idrPerPoint);
}

/**
 * Jam yang dipakai menghitung = sesi terakhir + akumulasi sebelum transfer.
 * @param {number} sessionHours
 * @param {number} partialHours
 * @returns {number}
 */
export function jamTerpakai(sessionHours, partialHours) {
  return bulatkan((sessionHours || 0) + (partialHours || 0), 2);
}

/**
 * Kompatibilitas dengan Portal KMB
 */
export function calculateWoPoints(params = {}) {
  return hitungSkor({
    basePoints: params.basePoints,
    unitFactor: params.unitFactor,
    workCondition: params.workCondition,
    actualHours: params.actualHours,
    targetHours: params.targetHours,
    safetyIncident: params.safetyIncident,
    mtbfStatus: params.mtbfStatus,
  }, FACTORS);
}

/**
 * Menghitung Poin dan IDR per Anggota Tim
 */
export function calculateTeamDistribution(finalScore, teamMembers = []) {
  if (!teamMembers || !teamMembers.length) return [];
  return teamMembers.map((m) => {
    const pct = parseFloat(m.percentage || 100) / 100;
    const memberPoints = bulatkan(finalScore * pct, 2);
    const pos = String(m.position || m.grade || m.role || '').toLowerCase();
    let rate = RATES.default;
    for (const [key, val] of Object.entries(RATES)) {
      if (pos.includes(key)) {
        rate = val;
        break;
      }
    }
    const memberIdr = rupiahUntukPoin(memberPoints, rate);
    return {
      mechanic_id: m.mechanic_id,
      mechanic_name: m.mechanic_name || m.name,
      percentage: m.percentage || 100,
      points: memberPoints,
      rate,
      idr: memberIdr,
    };
  });
}

/**
 * Hitung skor & rincian Rupiah per anggota tim untuk sebuah WO (KMB V2, KMB Project, atau SUM V2).
 * Mengikuti aturan rumah masing-masing (`docs/INVENTARIS-SUM.md` untuk SUM V2, `src/domain/scoring.ts` untuk KMB).
 */
export function hitungSkorDanRupiahWo({
  rumah,
  wo,
  factors,
  rates,
  team = null,
  singleMechanic = null,
}) {
  const f = {
    workCondition: (factors && (factors.workCondition || factors.work_condition)) || {
      normal: 1.0,
      difficult: 1.1,
      extreme: 1.2,
    },
    timeliness: (factors && factors.timeliness) || {
      on_time: 1.0,
      late: 0.8,
      way_late: 0.5,
    },
    safety: (factors && factors.safety) || {
      no_incident: 1.0,
      incident: 0.0,
    },
    mtbf: (factors && factors.mtbf) || {
      first_time: 1.2,
      redo: 0.8,
    },
  };

  const actualHours = Number(wo.actual_hours || wo.actualHours || 0);
  const targetHours = Number(wo.target_hours || wo.targetHours || 0);
  const basePoints = Number(wo.base_points || wo.basePoints || 0);
  const unitFactor = Number(wo.unit_factor ?? wo.unitFactor ?? 1.0);
  const workCondition = String(wo.work_condition || wo.workCondition || 'normal');
  const safetyIncident = Boolean(wo.safety_incident ?? wo.safetyIncident ?? false);
  const mtbfRedoStatus = wo.mtbf_redo_status || wo.mtbfRedoStatus || (wo.is_redo ? 'redo' : 'first_time');

  const skor = hitungSkor(
    {
      basePoints,
      targetHours,
      actualHours,
      unitFactor,
      workCondition,
      safetyIncident,
      mtbfRedoStatus,
    },
    f,
  );

  const teamAnggota = Array.isArray(team) && team.length > 0
    ? team
    : singleMechanic
    ? [{
        mechanic_id: singleMechanic.mechanic_id || singleMechanic.id,
        mechanic_name: singleMechanic.mechanic_name || singleMechanic.name,
        grade: singleMechanic.grade || singleMechanic.position || 'junior',
        percentage: 100,
      }]
    : [];

  const tarifPeta = rates || {
    helper: 1500,
    tyreman_helper: 1500,
    tyreman: 2500,
    junior: 2500,
    senior: 3000,
    middle: 3000,
    tyreman_senior: 3500,
    advisor: 3500,
    default: 2500,
  };

  let totalRupiah = 0;
  const breakdown = teamAnggota.map((m) => {
    const pct = Number(m.percentage ?? 100);
    const porsi = pct / 100;
    const poinMekanik = bulatkan(skor.finalPoints * porsi, 2);

    const pos = String(m.grade || m.position || m.role || 'junior').toLowerCase();
    let idrRate = tarifPeta[pos] || tarifPeta.default || 2500;
    for (const [k, v] of Object.entries(tarifPeta)) {
      if (pos.includes(k)) {
        idrRate = v;
        break;
      }
    }

    const rp = rupiahUntukPoin(poinMekanik, idrRate);
    totalRupiah += rp;

    return {
      mechanic_id: m.mechanic_id,
      mechanic_name: m.mechanic_name || m.name || '',
      grade: pos,
      percentage: pct,
      points: poinMekanik,
      idr_rate: idrRate,
      idr_total: rp,
    };
  });

  const ratioPercent = targetHours > 0 ? bulatkan((actualHours / targetHours) * 100, 1) : 0;

  return {
    rumah,
    wo_number: wo.wo_number || wo.woNumber || '',
    final_points: skor.finalPoints,
    total_idr: totalRupiah,
    timeliness_status: skor.timelinessStatus,
    team_breakdown: breakdown,
    factors_applied: {
      unit_factor: unitFactor,
      work_condition_factor: skor.workConditionFactor,
      timeliness_factor: skor.timelinessFactor,
      safety_factor: skor.safetyFactor,
      mtbf_factor: skor.mtbfFactor,
      ratio_percent: ratioPercent,
    },
  };
}
