/**
 * RUMUS POIN & RUPIAH — Mesin Skor Murni JavaScript (ESM)
 * Formula 100% Identik dengan ScoringService.gs & ScoringService.calculateScore
 * Sesuai AGENTS.md §1, §5 & docs/panduan_deploy_staging_kamis 2.md
 */

export const AMBANG_TEPAT_WAKTU = { ON_TIME_MAX: 100, LATE_MAX: 150 };

export const FACTORS = {
  work_condition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  workCondition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
  safety: { no_incident: 1.0, incident: 0.0 },
  mtbf: { first_time: 1.2, redo: 0.8 },
};

export const RATES = {
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

/**
 * Pembulatan setengah-ke-atas yang tahan galat pecahan biner.
 * Menjamin 1.005 -> 1.01 dan 8.165 -> 8.17 tanpa tergelincir biner.
 */
export function bulatkan(nilai, desimal = 2) {
  if (!Number.isFinite(nilai)) throw new Error(`bukan angka: ${String(nilai)}`);
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

/**
 * Menentukan status ketepatan waktu berdasarkan rasio actual vs target hours.
 */
export function statusKetepatanWaktu(actualHours, targetHours) {
  if (targetHours <= 0) return 'on_time';
  const rasio = (actualHours / targetHours) * 100;
  if (rasio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) return 'on_time';
  if (rasio <= AMBANG_TEPAT_WAKTU.LATE_MAX) return 'late';
  return 'way_late';
}

/**
 * FINAL = base × unit × kondisi × ketepatan × safety × mtbf
 */
export function hitungSkor(m, f = FACTORS) {
  const actual = parseFloat(m.actualHours) || 0;
  const target = parseFloat(m.targetHours) || 0;
  const timelinessStatus = statusKetepatanWaktu(actual, target);

  const workCondGroup = f.workCondition || f.work_condition || {};
  const timelinessGroup = f.timeliness || {};
  const safetyGroup = f.safety || {};
  const mtbfGroup = f.mtbf || {};

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
    2
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
 * Menghitung rupiah untuk sejumlah poin berdasarkan rate per poin.
 */
export function rupiahUntukPoin(points, idrPerPoint) {
  if (!Number.isFinite(points) || !Number.isFinite(idrPerPoint)) {
    throw new Error('poin dan rate wajib angka');
  }
  if (idrPerPoint < 0) throw new Error('rate tidak boleh negatif');
  return bulatkan(points * idrPerPoint, 0);
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

export function hitungSkorDanRupiahWo({
  rumah,
  wo,
  factorsList = [],
  baseSettingsList = [],
  mechanicsList = [],
  safetyIncident = false,
  mtbfRedoStatus = 'first_time',
}) {
  const petaFaktor = {
    workCondition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
    timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
    safety: { no_incident: 1.0, incident: 0.0 },
    mtbf: { first_time: 1.0, redo: 0.5 },
    golongan: { '1': 0.6, '2': 1.0, '3': 1.1, '4': 1.2, '5': 1.3 },
    rates: { junior: 2500, senior: 3500, advisor: 4500, mechanic: 2500 },
  };

  for (const row of factorsList || []) {
    const fType = String(row.factor_type || row.type || '').trim().toLowerCase();
    const fKey = String(row.key || row.factor_key || '').trim().toLowerCase();
    const fVal = Number(row.value);
    if (!Number.isFinite(fVal)) continue;
    if (fType === 'work_condition') petaFaktor.workCondition[fKey] = fVal;
    else if (fType === 'timeliness') petaFaktor.timeliness[fKey] = fVal;
    else if (fType === 'safety') petaFaktor.safety[fKey] = fVal;
    else if (fType === 'mtbf') petaFaktor.mtbf[fKey] = fVal;
    else if (fType === 'golongan' || fType === 'grade_multiplier') petaFaktor.golongan[fKey] = fVal;
    else if (fType === 'rate' || fType === 'pay_rate') petaFaktor.rates[fKey] = fVal;
  }

  let rateGlobalSum = 2500;
  for (const s of baseSettingsList || []) {
    const k = String(s.key || s.setting_key || '').trim().toLowerCase();
    const v = Number(s.value || s.setting_value);
    if (Number.isFinite(v) && v > 0 && (k.includes('rate') || k.includes('point') || k.includes('tarif'))) {
      rateGlobalSum = v;
    }
  }

  const isSum = String(rumah || '').toLowerCase() === 'sum';
  const basePoints = Number(wo.effective_base_points ?? wo.base_points ?? 1.0) || 1.0;
  const targetHours = Number(wo.effective_target_hours ?? wo.target_hours ?? 1.0) || 1.0;
  const actualHours = Number(wo.actual_hours ?? wo.duration_hours ?? targetHours) || targetHours;
  const unitFactor = Number(wo.unit_factor ?? 1.0) || 1.0;
  const workCondition = String(wo.work_condition || 'normal').toLowerCase();

  // Di SUM V2, MTBF dinonaktifkan (selalu 1.0) sesuai docs/INVENTARIS-SUM.md
  const skor = hitungSkor(
    {
      basePoints,
      targetHours,
      actualHours,
      unitFactor,
      workCondition,
      safetyIncident: Boolean(safetyIncident),
      mtbfRedoStatus: isSum ? null : (mtbfRedoStatus || 'first_time'),
    },
    petaFaktor,
  );

  const petaMekanik = new Map();
  for (const m of mechanicsList || []) {
    const id = String(m.mechanic_id || m.id || '').trim();
    if (id) petaMekanik.set(id, m);
  }

  const teamArr = Array.isArray(wo.effective_team) && wo.effective_team.length > 0
    ? wo.effective_team
    : (Array.isArray(wo.team) ? wo.team : []);

  let totalIdr = 0;
  const mechanicPoints = teamArr.map((anggota) => {
    const mid = String(anggota.mechanic_id || anggota || '').trim();
    const info = petaMekanik.get(mid) || anggota || {};
    const mName = String(info.name || info.mechanic_name || anggota.mechanic_name || mid);

    let effectiveRate = 2500;
    if (isSum) {
      const gol = String(info.golongan || '').trim().toLowerCase();
      const awalanGol = gol.slice(0, 1);
      const pengali = petaFaktor.golongan[gol] ?? petaFaktor.golongan[awalanGol] ?? 1.0;
      effectiveRate = bulatkan(rateGlobalSum * pengali, 2);
    } else {
      const pos = String(info.position || info.grade || 'junior').trim().toLowerCase();
      effectiveRate = petaFaktor.rates[pos] ?? 2500;
    }

    const idrValue = rupiahUntukPoin(skor.finalPoints, effectiveRate);
    totalIdr += idrValue;

    return {
      mechanic_id: mid,
      mechanic_name: mName,
      points: skor.finalPoints,
      rate_per_point: effectiveRate,
      idr_value: idrValue,
      idr_amount: idrValue,
    };
  });

  const ratioPercent = targetHours > 0 ? bulatkan((actualHours / targetHours) * 100, 0) : 100;
  const timelinessLabel = skor.timelinessStatus === 'on_time'
    ? 'On Time'
    : (skor.timelinessStatus === 'late' ? 'Late' : 'Way Late');

  return {
    ...skor,
    totalIdr,
    mechanicPoints,
    timeliness: {
      status: skor.timelinessStatus,
      label: timelinessLabel,
      factor: skor.timelinessFactor,
      ratio_percent: ratioPercent,
    },
  };
}
