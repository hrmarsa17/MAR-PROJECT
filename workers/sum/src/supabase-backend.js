/**
 * Backend Mandiri Penuh Supabase untuk Rumah KMB Project
 * Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2
 *
 * Menggantikan seluruh peran GAS:
 * - Aksi baca & tulis dilayani langsung oleh Cloudflare Worker + Supabase RPC skema kmb_projek
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

let cacheSaklar = { nilai: null, waktu: 0 };

export async function bacaStatusSaklar(env) {
  if (env.STORAGE_MODE === 'SUPABASE' || env.SAKLAR === 'supabase') {
    return 'supabase';
  }
  const sekarang = Date.now();
  if (cacheSaklar.nilai && cacheSaklar.waktu > sekarang) {
    return cacheSaklar.nilai;
  }
  let hasil = env.SAKLAR || 'gas';
  try {
    const isStaging = (env.GAS_URL && env.GAS_URL.includes('gas-tiruan')) || (env.RUMAH && env.RUMAH.includes('staging'));
    const url = isStaging
      ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev/api/saklar/status'
      : 'https://abadiops.com/api/saklar/status';

    const fetcher = (env && env.PINTU && typeof env.PINTU.fetch === 'function')
      ? env.PINTU.fetch.bind(env.PINTU)
      : fetch;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetcher(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      const val = data?.switches?.[env.RUMAH];
      if (val) {
        hasil = val;
        cacheSaklar = { nilai: hasil, waktu: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}

function normalisasiAksi(action) {
  const a = String(action || '').trim();
  const map = {
    'createWO': 'create_wo',
    'handleCreateWO': 'create_wo',
    'buat_wo': 'create_wo',
    'submitWork': 'submit_work',
    'handleSubmitMechanicWork': 'submit_work',
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

const cacheRefsPerRumah = {};

async function ambilRefsUntukLookup(env, token, rpcPrefix, supaHeaders) {
  const sekarang = Date.now();
  const c = cacheRefsPerRumah[rpcPrefix];
  if (c && (sekarang - c.waktu < 300000) && c.data) {
    return c.data;
  }
  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/${rpcPrefix}_create_refs_bertoken`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({ p_token: token }),
    });
    if (res.ok) {
      const j = await res.json();
      const data = j.result || j.data || {};
      cacheRefsPerRumah[rpcPrefix] = { waktu: sekarang, data };
      return data;
    }
  } catch (_) {}
  return cacheRefsPerRumah[rpcPrefix]?.data || {};
}

function lengkapiDataBlokDenganRefs(b, refs) {
  if (!b || typeof b !== 'object') return {};
  const comps = (refs && refs.components) || [];
  const units = (refs && refs.units) || [];

  const compId = String(b.component_id || b.component_no || b.component || '').trim();
  const unitId = String(b.unit_id || b.unit_code || '').trim();

  const c = comps.find((x) =>
    (x.component_no && x.component_no.toUpperCase() === compId.toUpperCase()) ||
    (x.component_id && x.component_id.toUpperCase() === compId.toUpperCase())
  );
  const u = units.find((x) =>
    (x.unit_id && x.unit_id.toUpperCase() === unitId.toUpperCase()) ||
    (x.unit_code && x.unit_code.toUpperCase() === unitId.toUpperCase())
  );

  const rawCompName = b.component_name || b.component;
  const isUnknownComp = !rawCompName || rawCompName === 'UNKNOWN';
  const compName = (!isUnknownComp ? rawCompName : null) || c?.component_name || c?.component_no || b.others_description || b.keterangan || compId || 'Pekerjaan';

  const rawUnitName = b.unit_name || b.unit_code;
  const isUnknownUnit = !rawUnitName || rawUnitName === 'UNKNOWN';
  const unitName = (!isUnknownUnit ? rawUnitName : null) || u?.unit_name || unitId || 'WORKSHOP';

  const unitFactor = Number(b.unit_factor ?? b.others_unit_factor ?? b.manual_unit_factor ?? u?.unit_factor ?? 1.0);
  const basePoints = Number(b.base_points ?? b.others_base_points ?? b.manual_base_points ?? c?.base_points ?? c?.base_point ?? 1.0);
  const targetHours = Number(b.target_hours ?? b.others_target_hours ?? b.manual_target_hours ?? c?.target_hours ?? 2.0);
  const category = b.category || c?.category || 'General';

  return {
    ...b,
    unit_id: unitId || 'WORKSHOP',
    unit_code: unitId || 'WORKSHOP',
    unit_name: unitName,
    unit_factor: unitFactor,
    component_id: compId || 'COM-001',
    component_no: compId || 'COM-001',
    component: compName,
    component_name: compName,
    activity: b.activity || b.job_description || compName,
    job_description: b.job_description || b.activity || compName,
    base_points: basePoints,
    target_hours: targetHours,
    category: category,
  };
}

export function normalisasiBlokWo(blk) {
  if (!blk || typeof blk !== 'object') return {};
  const b = { ...blk };
  if (b.manual_base_points !== undefined && b.others_base_points === undefined) b.others_base_points = b.manual_base_points;
  if (b.manual_target_hours !== undefined && b.others_target_hours === undefined) b.others_target_hours = b.manual_target_hours;
  if (b.manual_unit_factor !== undefined && b.others_unit_factor === undefined) b.others_unit_factor = b.manual_unit_factor;
  if ((!Array.isArray(b.team) || b.team.length === 0) && b.team_distribution && typeof b.team_distribution === 'object') {
    b.team = Object.entries(b.team_distribution)
      .filter(([mid]) => {
        const s = String(mid || '').trim().toLowerCase();
        return s !== '' && s !== 'undefined' && s !== 'null';
      })
      .map(([mid, pct]) => ({
        mechanic_id: String(mid).trim(),
        percentage: Number(pct) || 100,
      }));
  }
  if ((!Array.isArray(b.team) || b.team.length === 0) && Array.isArray(b.mechanics) && b.mechanics.length > 0) {
    b.team = b.mechanics
      .map((m) => (typeof m === 'object' && m !== null
        ? { mechanic_id: String(m.mechanic_id || m.id || m.name || '').trim(), percentage: 100 }
        : { mechanic_id: String(m).trim(), percentage: 100 }))
      .filter((m) => m.mechanic_id && !['undefined', 'null'].includes(m.mechanic_id.toLowerCase()));
  }
  if (!b.lead_mechanic_id && Array.isArray(b.team) && b.team.length > 0) {
    b.lead_mechanic_id = b.team[0].mechanic_id;
  }
  return b;
}

export function ekstrakWoId(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.trim();
  const d = body.data;
  if (typeof d === 'string' && d.trim().startsWith('WO-')) return d.trim();
  return (
    body.wo_id ||
    body.wo_number ||
    body.id ||
    (d && (d.wo_id || d.wo_number || d.id)) ||
    ''
  ).trim();
}

export function apakahWoLahirDiSupabase(woId) {
  if (!woId || typeof woId !== 'string') return false;
  const s = woId.trim().toUpperCase();
  if (s.startsWith('WO-SB-') || s.startsWith('WO-KMBP-') || s.startsWith('WO-SUM-') || s.startsWith('WO-KMB-') || s.startsWith('SB-')) return true;
  if (/^WO-\d{8}-\d{4}$/.test(s)) return true;
  return false;
}

export function apakahWoLamaDariGas(woId) {
  if (!woId || typeof woId !== 'string') return false;
  const s = woId.trim().toUpperCase();
  if (/^WO-\d{8}-\d{3}$/.test(s)) return true;
  return false;
}

/**
 * Eksekusi Backend Mandiri Supabase untuk Rumah KMB Project & Multi-Rumah
 */
export async function eksekusiSupabaseBackendKmbp(action, token, body, env) {
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

  const supaHeaders = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  const rumah = (env.RUMAH || 'kmbprojek').toLowerCase();
  const rpcPrefix = (rumah === 'sum') ? 'sum' : (rumah === 'kmbtra' || rumah === 'kmb') ? 'kmbtra' : 'kmb';
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/${rpcPrefix}_eksekusi_aksi_bertoken`;

  
  // Khusus loadJobsCatalog / getJobCatalogCached
  if (action === 'loadJobsCatalog' || action === 'getJobCatalogCached' || cleanAksi === 'getJobCatalogCached' || cleanAksi === 'loadJobsCatalog') {
    const rawSec = typeof body.data === 'string' ? body.data : (body.data?.section || body.section || (body.args && body.args[0]) || 'vessel');
    const sec = String(rawSec || 'vessel').toLowerCase().trim();

    try {
      const resRefs = await fetch(rpcUrl, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify({
          p_token: cleanToken,
          p_aksi: 'pull_create_refs',
          p_op_id: (body.op_id || 'cat-' + Date.now()),
          p_payload: {},
          p_extra: null,
        }),
      });

      if (resRefs.ok) {
        const refsData = await resRefs.json();
        const rData = refsData && refsData.result ? refsData.result : (refsData && refsData.data ? refsData.data : {});
        const refs = (rData && rData.refs) ? rData.refs : rData;

        let jobs = [];
        if (sec === 'vessel') {
          jobs = refs.jobs_vessel || [];
        } else if (sec === 'maintenance' || sec === 'field') {
          jobs = refs.jobs_field || [];
        } else if (sec === 'workshop') {
          jobs = refs.jobs_workshop || [];
        } else {
          jobs = refs['jobs_' + sec] || refs.jobs_field || refs.jobs_vessel || [];
        }

        return new Response(JSON.stringify({
          success: true,
          data: { jobs, section: sec },
          result: { jobs, section: sec },
          jobs: jobs,
          source: 'SUPABASE'
        }), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Rumah': env.RUMAH || 'sum',
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    } catch (err) {
      console.warn('Gagal memuat katalog Supabase:', err);
    }
  }

  // Khusus cekStatusKiriman
  if (cleanAksi === 'cekStatusKiriman') {
    return new Response(JSON.stringify({
      success: true,
      keadaan: 'selesai',
      pesan: 'Kiriman selesai diproses di Supabase.',
      struk: { created: [] },
      source: 'SUPABASE'
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // Siapkan payload
  let payload = body.data || body.payload || body;
  if (typeof payload !== 'object' || payload === null) {
    payload = {};
  }

  if (cleanAksi === 'create_wo') {
    const refs = await ambilRefsUntukLookup(env, cleanToken, rpcPrefix, supaHeaders);
    payload = lengkapiDataBlokDenganRefs(normalisasiBlokWo(payload), refs);
    if (!payload.lead_mechanic_id && Array.isArray(payload.team) && payload.team.length > 0) {
      payload.lead_mechanic_id = payload.team[0].mechanic_id;
    }
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

  try {
    // 1. Batch creation jika ada blocks (format form Web WorkOrder.html)
    const blocks = payload.blocks || (payload.data && payload.data.blocks);
    if (cleanAksi === 'create_wo' && Array.isArray(blocks) && blocks.length > 0) {
      const refs = await ambilRefsUntukLookup(env, cleanToken, rpcPrefix, supaHeaders);
      const created = [];
      const failed = [];
      for (let i = 0; i < blocks.length; i++) {
        const rawB = normalisasiBlokWo(blocks[i]);
        const b = lengkapiDataBlokDenganRefs(rawB, refs);
        const blockPayload = {
          unit_id: b.unit_id,
          unit_code: b.unit_id,
          unit_name: b.unit_name,
          unit_factor: b.unit_factor,
          component_id: b.component_id,
          component_no: b.component_id,
          component: b.component,
          component_name: b.component_name,
          activity: b.activity,
          job_description: b.job_description,
          category: b.category,
          lead_mechanic_id: b.lead_mechanic_id || (b.team && b.team[0] && b.team[0].mechanic_id) || '',
          shift: b.shift || payload.shift || '1',
          work_condition: b.work_condition || 'normal',
          duration_hours: b.duration_hours || b.actual_hours || 0,
          target_hours: b.target_hours,
          base_points: b.base_points,
          team: b.team || [],
          keterangan: b.keterangan || '',
          data: b
        };
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            p_token: cleanToken,
            p_aksi: 'create_wo',
            p_op_id: (body.op_id || 'op-' + Date.now()) + '-' + (i + 1),
            p_payload: blockPayload,
            p_extra: body.extra || null,
          }),
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.success && resData.result) {
            const woNum = resData.result.wo_number || resData.result.id;
            created.push({
              wo_number: woNum,
              wo_id: woNum,
              id: woNum,
              unit_id: b.unit_id,
              unit_name: b.unit_name,
              component: b.component,
              component_name: b.component_name,
              activity: b.activity,
              status: resData.result.status || 'assigned'
            });
          } else {
            failed.push({ index: i, error: (resData && resData.error) || 'Gagal membuat WO' });
          }
        } else {
          const errText = await res.text();
          failed.push({ index: i, error: errText });
        }
      }

      return new Response(JSON.stringify({
        success: created.length > 0,
        data: {
          wo_id: created[0]?.wo_number || '',
          id: created[0]?.wo_number || '',
          created: created,
          failed: failed,
        },
        result: {
          wo_id: created[0]?.wo_number || '',
          id: created[0]?.wo_number || '',
          created: created,
          status: created[0]?.status || 'assigned',
        },
        source: 'SUPABASE'
      }), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'sum',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

    // 2. Pemanggilan tunggal standar via RPC
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
      // Format respon agar kompatibel penuh dengan Web Desktop & PWA
      if (cleanAksi === 'create_wo' && data.success && data.result) {
        const woNum = data.result.wo_number || data.result.id;
        const singleCreated = [{
          wo_number: woNum,
          wo_id: woNum,
          id: woNum,
          unit_id: payload.unit_code || payload.unit_id || '',
          component: payload.component || '',
          activity: payload.activity || payload.job_description || '',
          status: data.result.status || 'assigned'
        }];
        data.data = {
          wo_id: woNum,
          id: woNum,
          created: singleCreated,
          failed: []
        };
      } else if (cleanAksi === 'pull_create_refs' && data.result) {
        data.data = (data.result && data.result.refs) ? data.result.refs : data.result;
      } else if (['pull_wo_detail', 'getWODetails', 'getWoDetailForMechanic'].includes(cleanAksi) && data.result) {
        const woObj = data.result.wo || data.result;
        const teamArr = woObj.team || data.result.team || [];
        const fullDetail = { ...woObj, wo: woObj, team: teamArr };
        data.result = fullDetail;
        data.data = fullDetail;
      } else if (!data.data && data.result) {
        data.data = data.result;
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'sum',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

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

export const eksekusiSupabaseBackendKmb = eksekusiSupabaseBackendKmbp;
export const eksekusiSupabaseBackendSum = eksekusiSupabaseBackendKmbp;
