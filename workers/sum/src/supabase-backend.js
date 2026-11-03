/**
 * Backend Mandiri Penuh Supabase untuk Rumah SUM V2
 * Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2
 *
 * Menggantikan seluruh peran GAS:
 * - Aksi baca & tulis dilayani langsung oleh Cloudflare Worker + Supabase RPC skema sum
 * - Mesin scoring JavaScript murni (1:1 ScoringService.gs)
 * - Penomoran WO 4-digit WIB (WO-YYYYMMDD-XXXX)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

// Ambang ketepatan waktu
const AMBANG_TEPAT_WAKTU = { ON_TIME_MAX: 100, LATE_MAX: 150 };

const FACTORS = {
  work_condition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
  safety: { no_incident: 1.0, incident: 0.0 },
  mtbf: { first_time: 1.2, redo: 0.8 },
};

const RATES = {
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

function bulatkan(nilai, desimal = 2) {
  if (!Number.isFinite(nilai)) return 0;
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

function hitungSkorMandiri(m) {
  const actual = parseFloat(m.actualHours) || 0;
  const target = parseFloat(m.targetHours) || 0;
  let timeStatus = 'on_time';
  if (target > 0) {
    const rasio = (actual / target) * 100;
    if (rasio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) timeStatus = 'on_time';
    else if (rasio <= AMBANG_TEPAT_WAKTU.LATE_MAX) timeStatus = 'late';
    else timeStatus = 'way_late';
  }

  const condFactor = (FACTORS.work_condition && FACTORS.work_condition[m.workCondition]) ?? 1.0;
  const timeFactor = (FACTORS.timeliness && FACTORS.timeliness[timeStatus]) ?? 1.0;
  const safeFactor = m.safetyIncident ? FACTORS.safety.incident : FACTORS.safety.no_incident;
  const mtbfFactor = (FACTORS.mtbf && FACTORS.mtbf[m.mtbfStatus || 'first_time']) ?? 1.0;

  const base = parseFloat(m.basePoints) || 0;
  const unit = parseFloat(m.unitFactor ?? 1.0) || 1.0;

  const finalPoints = bulatkan(base * unit * condFactor * timeFactor * safeFactor * mtbfFactor, 2);

  return {
    basePoints: base,
    unitFactor: unit,
    workConditionFactor: condFactor,
    timelinessFactor: timeFactor,
    safetyFactor: safeFactor,
    mtbfFactor: mtbfFactor,
    finalPoints,
  };
}

function normalisasiAksi(action) {
  const a = String(action || '').trim();
  const map = {
    'createWO': 'create_wo',
    'buat_wo': 'create_wo',
    'submitWork': 'submit_work',
    'submitMechanicWork': 'submit_work',
    'submitWO': 'submit_work',
    'kirim_kerja': 'submit_work',
    'handleSupervisorApprove': 'approve_l1',
    'supervisorApprove': 'approve_l1',
    'handleSuperintendentApprove': 'approve_l2',
    'superintendentApprove': 'approve_l2',
    'handleSupervisorReject': 'reject',
    'supervisorReject': 'reject',
    'handleSuperintendentReject': 'reject',
    'superintendentReject': 'reject',
    'handleCancelWO': 'cancel_wo',
    'cancelWO': 'cancel_wo',
    'batalkan_wo': 'cancel_wo',
    'handleSaveOverride': 'save_override',
    'handleOverrideTargetHours': 'save_override',
    'handleApproveTransfer': 'approve_transfer',
    'handleRejectTransfer': 'reject_transfer',
    'getMyWos': 'pull_my_wos',
    'getWoDetailForMechanic': 'pull_wo_detail',
    'getWODetails': 'pull_wo_detail',
  };
  return map[a] || a;
}

/**
 * Eksekusi Backend Mandiri Supabase untuk Rumah SUM
 */
export async function eksekusiSupabaseBackendSum(action, token, body, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }

  const cleanAksi = normalisasiAksi(action);
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Token tidak ditemukan',
      source: 'SUPABASE'
    }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // Siapkan payload
  let payload = body.data || body.payload || body;
  if (typeof payload !== 'object' || payload === null) {
    payload = {};
  }

  // Jika submit work, hitung poin jika belum tersedia
  if (cleanAksi === 'submit_work' && payload.actual_hours && payload.target_hours && !payload.final_points) {
    const skor = hitungSkorMandiri({
      basePoints: payload.base_points || payload.plan_points || 0,
      unitFactor: payload.unit_factor || 1.0,
      workCondition: payload.work_condition || 'normal',
      actualHours: payload.actual_hours,
      targetHours: payload.target_hours,
      safetyIncident: payload.safety_incident,
      mtbfStatus: payload.mtbf_status,
    });
    payload.final_points = skor.finalPoints;
    payload.points = skor.finalPoints;
  }

  const supaHeaders = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/sum_eksekusi_aksi_bertoken`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        p_token: cleanToken,
        p_aksi: cleanAksi,
        p_op_id: body.op_id || body.client_op_id || ('op-' + Date.now()),
        p_payload: payload,
        p_extra: body.extra || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': 'sum',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

    // Jika error HTTP dari Supabase
    const errText = await res.text();
    return new Response(JSON.stringify({
      success: false,
      error: `Supabase RPC gagal: ${errText}`,
      source: 'SUPABASE'
    }), {
      status: res.status >= 400 && res.status < 500 ? res.status : 500,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Kesalahan backend Supabase: ' + ((err && err.message) || err),
      source: 'SUPABASE'
    }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
