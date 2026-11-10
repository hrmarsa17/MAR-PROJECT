/**
 * Web Desktop Handler untuk Cloudflare Workers
 * Menyajikan antarmuka desktop 1:1 GAS dan jembatan API google.script.run
 */

import { renderWebPage } from './web-templates.js';
import {
  eksekusiSupabaseBackendKmbp,
  bacaStatusSaklar,
  ekstrakWoId,
  apakahWoLahirDiSupabase,
  apakahWoLamaDariGas
} from './supabase-backend.js';
import { cekBukuTamu, catatBukuTamu } from './buku-tamu.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

const ROUTER_ACTIONS = new Set([
  'createWO', 'startWO', 'finishWO', 'submitWO',
  'getMyWos', 'getWoDetailForMechanic', 'submitMechanicWork',
  'siapkanFormTyre', 'dataDashboardTeknis', 'dataDashboardField',
  'riwayatHmUnit', 'koreksiHmWo', 'gantiPanelHm',
  'riwayatKmUnit', 'koreksiKmWo', 'gantiPanelKm',
  'supervisorApprove', 'handleSupervisorApprove',
  'supervisorReject', 'handleSupervisorReject',
  'superintendentApprove', 'handleSuperintendentApprove',
  'superintendentReject', 'handleSuperintendentReject',
  'handleCancelWO', 'cancelWO',
  'handleOverrideTargetHours', 'handleSaveOverride',
  'handleApproveTransfer', 'handleRejectTransfer',
  'handleKembalikanKeMekanik', 'handleBulkApprove',
  'loadJobsCatalog', 'getJobCatalogCached',
  'handleCreateWO', 'cekStatusKiriman',
  'getWODetails',
  'generatePayrollReport', 'generateReport',
]);

function lengkapiObjekWoWeb(w) {
  if (!w || typeof w !== 'object') return {};
  const id = String(w.id || w.wo_id || w.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || id);

  const st = String(w.status || 'pending_mechanic_work').toLowerCase().trim();
  let sg = 'assigned';
  if (['approved', 'done', 'closed'].includes(st)) {
    sg = 'done';
  } else if (['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer', 'submitted', 'pending_approval'].includes(st)) {
    sg = 'pending_approval';
  } else if (w.status_group && ['assigned', 'pending_approval', 'done'].includes(String(w.status_group).toLowerCase().trim())) {
    sg = String(w.status_group).toLowerCase().trim();
  }

  let sl = 'Perlu Diisi Mekanik';
  if (sg === 'done') {
    sl = 'Approved';
  } else if (sg === 'pending_approval') {
    if (st === 'pending_l2' || st === 'pending_superintendent') sl = 'Menunggu Approval L2';
    else if (st === 'pending_l1' || st === 'pending_supervisor') sl = 'Menunggu Approval L1';
    else if (st === 'pending_transfer') sl = 'Menunggu Transfer';
    else sl = 'Menunggu Approval';
  } else {
    sl = (w.status_label && w.status_label !== 'Menunggu Approval') ? w.status_label : 'Perlu Diisi Mekanik';
  }

  const validOrEmpty = (str) => {
    const s = String(str || '').trim();
    return (s && s.toUpperCase() !== 'UNKNOWN' && s.toUpperCase() !== 'UNDEFINED' && s !== '-') ? s : '';
  };

  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = validOrEmpty(w.unit_id) || validOrEmpty(w.unit_code) || validOrEmpty(unitObj.unit_id) || 'WORKSHOP';
  const unit_name = validOrEmpty(w.unit_name) || validOrEmpty(unitObj.unit_name) || unit_id;
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = validOrEmpty(w.component_id) || validOrEmpty(compObj.component_no) || validOrEmpty(compObj.component_id) || validOrEmpty(compStr) || validOrEmpty(w.job_id) || 'COM-001';
  const component_name = validOrEmpty(w.component_name) ||
    validOrEmpty(compObj.component_name) ||
    validOrEmpty(compStr) ||
    validOrEmpty(w.others_description) ||
    validOrEmpty(w.activity) ||
    validOrEmpty(w.job_description) ||
    validOrEmpty(component_id) ||
    'Pekerjaan';
  const base_points = Number(w.base_points ?? w.points ?? compObj.base_points ?? 1.0);
  const target_hours = Number(w.target_hours ?? compObj.target_hours ?? 2.0);
  const effective_base_points = Number(w.effective_base_points ?? base_points);
  const effective_target_hours = Number(w.effective_target_hours ?? target_hours);

  let team = Array.isArray(w.team) ? w.team : (Array.isArray(w.effective_team) ? w.effective_team : []);
  if (!team.length && w.team_distribution && typeof w.team_distribution === 'object') {
    team = Object.entries(w.team_distribution).map(([mid, pct]) => ({
      mechanic_id: String(mid).trim(),
      mechanic_name: String(mid).trim(),
      name: String(mid).trim(),
      percentage: Number(pct) || 100,
    }));
  }
  if (!team.length && w.lead_mechanic_id) {
    const mName = String(w.mechanic_name || w.lead_mechanic_name || w.lead_mechanic_id);
    team = [{ mechanic_id: String(w.lead_mechanic_id), mechanic_name: mName, name: mName, percentage: 100 }];
  }
  team = team.map((m) => ({
    ...m,
    mechanic_id: String(m.mechanic_id || m.id || ''),
    mechanic_name: String(m.mechanic_name || m.name || m.mechanic_id || m.id || '-'),
    name: String(m.name || m.mechanic_name || m.mechanic_id || m.id || '-'),
    percentage: Number(m.percentage ?? 100),
  }));
  const team_names = Array.isArray(w.team_names) && w.team_names.length
    ? w.team_names
    : team.map((m) => m.mechanic_name);

  return {
    ...w,
    id,
    wo_id: id,
    wo_number,
    status: st,
    status_group: sg,
    status_label: sl,
    unit_id,
    unit_code: unit_id,
    unit_name,
    unit_factor,
    unit: {
      unit_id,
      unit_name,
      unit_factor,
    },
    component_id,
    component_name,
    base_points,
    target_hours,
    effective_base_points,
    effective_target_hours,
    component: {
      component_no: component_id,
      component_id,
      component_name,
      category: String(compObj.category || w.section || 'General'),
      base_points,
      target_hours,
    },
    team,
    effective_team: team,
    team_names,
    team_count: w.team_count || team.length || 1,
    created_at_str: String(w.created_at_str || w.date || w.created_at || '-'),
  };
}

export async function handleWebRequest(request, env, url) {
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return new Response(renderPesanWeb('Perlu Token', 'Token autentikasi tidak ditemukan. Silakan masuk melalui pintu resmi.', 'https://abadiops.com', 'Buka Pintu abadiops.com'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 1. Verifikasi token via ping
  const pingRes = await panggilAksiInternal('ping', token, {}, env);
  if (!pingRes || (!pingRes.success && !pingRes.email && !pingRes.mechanic_id)) {
    const errMsg = (pingRes && (pingRes.error || (pingRes.error && pingRes.error.message))) || 'Token tidak dikenal atau nonaktif.';
    return new Response(renderPesanWeb('Akses Ditolak', errMsg, 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const role = pingRes.role || (pingRes.result && pingRes.result.role) || 'supervisor';
  const email = pingRes.email || (pingRes.result && pingRes.result.email) || '';
  const name = pingRes.name || pingRes.mechanic_name || (pingRes.result && pingRes.result.name) || pingRes.mechanic_id || '';
  const mechanic_id = pingRes.mechanic_id || (pingRes.result && pingRes.result.mechanic_id) || '';

  const user = {
    email: email,
    role: role,
    mechanic_name: name || mechanic_id || 'Pengguna',
    name: name,
    mechanic_id: mechanic_id,
  };

  // 2. Tentukan halaman
  let page = (url.searchParams.get('page') || '').toLowerCase().trim().split('&')[0];

  if (page === 'users' || page === 'config') {
    return new Response(renderPesanAksesAdminDitolak(user.role), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!page) {
    const roleLower = String(role).toLowerCase();
    page = (roleLower === 'mechanic') ? 'mechanic'
         : (roleLower === 'supervisor') ? 'approvals'
         : 'dashboard';
  }

  const rawBack = (url.searchParams.get('back') || '').trim();
  const backToken = rawBack && rawBack !== token ? rawBack : '';
  const activeFilter = (url.searchParams.get('filter') || 'assigned').toLowerCase().trim();

  // 3. Ambil data inisial halaman jika diperlukan
  const context = {
    baseUrl: '/web',
    token: token,
    backToken: backToken,
    activeFilter: activeFilter,
    user: user,
    currentView: url.searchParams.get('view') || 'pending',
    viewAsMechanicId: url.searchParams.get('as') || '',
  };

  try {
    if (['create', 'workorder'].includes(page)) {
      const refs = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const refsData = refs && refs.result ? refs.result : (refs && refs.data ? refs.data : {});
      if (refs && refs.success && refsData) {
        const actualRefs = (refsData && refsData.refs) ? refsData.refs : refsData;
        context.components = actualRefs.components || refsData.components || [];
        context.units = actualRefs.units || refsData.units || [];
        context.mechanics = actualRefs.mechanics || refsData.mechanics || [];
        context.workConditions = actualRefs.work_conditions || refsData.work_conditions || [];
        context.userScope = actualRefs.user_scope || refsData.user_scope || null;
      }
    } else if (['approvals', 'approval'].includes(page)) {
      const pending = await panggilAksiInternal('pull_pending', token, {}, env);
      const pendingData = pending && pending.result ? pending.result : (pending && pending.data ? pending.data : {});
      if (pending && pendingData) {
        const rawList = (pendingData.pending || pendingData.approvals || pendingData.wos || (Array.isArray(pendingData) ? pendingData : [])).map(lengkapiObjekWoWeb);
        // Sesuai docs/SPEK-LAYAR/04-APPROVALS.md baris 49-52:
        // Antrean L1 (supervisor) hanya pending_supervisor / pending_l1.
        // Antrean L2 (superintendent) hanya pending_superintendent / pending_l2.
        let pendingList = rawList.filter((w) => w.status !== 'pending_transfer');
        if (roleLower === 'supervisor') {
          pendingList = pendingList.filter((w) => {
            const wst = String(w.status || '').toLowerCase().trim();
            return wst === 'pending_supervisor' || wst === 'pending_l1';
          });
        } else if (roleLower === 'superintendent') {
          pendingList = pendingList.filter((w) => {
            const wst = String(w.status || '').toLowerCase().trim();
            return wst === 'pending_superintendent' || wst === 'pending_l2';
          });
        }
        context.pendingApprovals = pendingList;
        context.pendingCount = pendingList.length;
        context.pendingTotal = pendingList.length;
        context.pendingTransfers = (pendingData.transfers || []).map(lengkapiObjekWoWeb);
        context.activeWos = (pendingData.active || []).map(lengkapiObjekWoWeb);
        context.approvedWos = (pendingData.approved || []).map(lengkapiObjekWoWeb);
        context.rejectedWos = (pendingData.rejected || []).map(lengkapiObjekWoWeb);
      }
      const mechList = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const mechData = mechList && mechList.result ? mechList.result : (mechList && mechList.data ? mechList.data : {});
      const actualMechRefs = (mechData && mechData.refs) ? mechData.refs : mechData;
      if (mechList && actualMechRefs && (actualMechRefs.mechanics || actualMechRefs.allMechanics)) {
        context.allMechanics = actualMechRefs.mechanics || actualMechRefs.allMechanics || [];
      }
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const myWos = await panggilAksiInternal('pull_my_wos', token, {}, env);
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const myWosData = myWos && myWos.result ? myWos.result : (myWos && myWos.data ? myWos.data : {});
      const monData = mon && mon.result ? mon.result : (mon && mon.data ? mon.data : {});
      const rawWosList = myWosData.wos || (Array.isArray(myWosData) ? myWosData : []);
      const enrichedWos = rawWosList.map(lengkapiObjekWoWeb);
      const computedCounts = myWosData.counts || {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      const filteredWos = ['assigned', 'pending_approval', 'done'].includes(activeFilter)
        ? enrichedWos.filter((w) => w.status_group === activeFilter)
        : enrichedWos;
      context.initialData = {
        wos: filteredWos,
        allWos: enrichedWos,
        counts: computedCounts,
        activeFilter,
        viewing_as: context.viewAsMechanicId || null,
        mechanic: user,
      };
      context.monitoringData = monData;
      context.mons = (monData && monData.mechanics) || (Array.isArray(monData) ? monData : []);
    } else if (['dashboard', 'main'].includes(page)) {
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const monData = mon && mon.result ? mon.result : (mon && mon.data ? mon.data : {});
      context.dashboardData = {
        user: user,
        stats: (monData && monData.stats) || { totalWOs: 0, approved: 0, pending: 0, totalPoints: 0 },
        recentWOs: (monData && monData.recentWOs ? monData.recentWOs : []).map(lengkapiObjekWoWeb),
        charts: (monData && monData.charts) || { pointsTrend: { labels: [], data: [] } },
      };
    }
  } catch (err) {
    console.error('Error saat mempersiapkan context halaman web:', err);
  }

  // 4. Render HTML
  try {
    const html = renderWebPage(page, context);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmb',
        'X-Abadi-Web': page,
      },
    });
  } catch (err) {
    console.error('Error saat merender halaman web:', err);
    return new Response(renderPesanWeb('Galat Tampilan Web', 'Terjadi kesalahan saat memuat halaman web: ' + ((err && err.message) || err), 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

export async function handleWebBridgeApi(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response('Hanya POST diperbolehkan', { status: 405, headers: CORS });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'JSON payload tidak valid' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const token = body.token || '';
  const action = body.action || '';
  const data = body.data || {};
  if (typeof data === 'object' && data !== null && !data.token) {
    data.token = token;
  }

  // Buku Tamu Kiriman (Idempotency Store di Cloudflare, docs/SAKLAR.md)
  const opId = body.op_id || body.kiriman_id || data.op_id || data.kiriman_id;
  if (opId) {
    const cached = await cekBukuTamu(opId, env);
    if (cached && cached.result) {
      return new Response(JSON.stringify(cached.result), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'X-Abadi-Buku-Tamu': 'hit' }
      });
    }
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const targetWoId = ekstrakWoId(body);
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);

  // Aturan Saklar Balik & Satu Rumah Seumur Hidup:
  // 1. Jika WO lahir di Supabase (4 digit / WO-SB-*), WAJIB ke Supabase bahkan saat saklar 'gas'.
  // 2. Jika WO lama lahir di GAS (3 digit), saat dua_cabang tetap diteruskan ke GAS.
  const harusKeSupabase = woSupabase || (liveSaklar === 'supabase') || ((liveSaklar !== 'gas' || url.searchParams.get('uji') === 'supabase') && !woGas);

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const resSupa = await eksekusiSupabaseBackendKmbp(action, token, body, env);
      if (resSupa && resSupa.status === 200) {
        if (opId) {
          try {
            const klon = resSupa.clone();
            const dataResult = await klon.json();
            await catatBukuTamu(opId, dataResult, env.RUMAH || 'kmbtra', env);
          } catch (_) {}
        }
        return resSupa;
      }
      if (liveSaklar === 'supabase' || woSupabase) {
        return resSupa || new Response(JSON.stringify({ success: false, error: 'Supabase backend gagal', source: 'SUPABASE' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    } catch (e) {
      if (liveSaklar === 'supabase' || woSupabase) {
        return new Response(JSON.stringify({ success: false, error: 'Supabase error: ' + ((e && e.message) || e), source: 'SUPABASE' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;

  try {
    let res;
    if (ROUTER_ACTIONS.has(action)) {
      // Format URL encoded untuk Router.gs
      const params = new URLSearchParams();
      params.append('action', action);
      if (token) params.append('token', token);
      params.append('data', typeof data === 'string' ? data : JSON.stringify(data));
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Abadi-Rumah': env.RUMAH || '',
          'X-Abadi-Token': token || '',
        },
        body: params.toString(),
        redirect: 'follow',
      });
    } else {
      // Format JSON untuk ApiService.gs
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'X-Abadi-Rumah': env.RUMAH || '',
          'X-Abadi-Token': token || '',
        },
        body: JSON.stringify({ token, action, data }),
        redirect: 'follow',
      });
    }

    const resText = await res.text();
    if (res.ok && opId) {
      try {
        const dataResult = JSON.parse(resText);
        await catatBukuTamu(opId, dataResult, env.RUMAH || 'kmbtra', env);
      } catch (_) {}
    }
    return new Response(resText, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Koneksi ke backend gagal: ' + ((err && err.message) || err) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function panggilAksiInternal(action, token, data, env) {
  const liveSaklar = await bacaStatusSaklar(env);
  const targetWoId = ekstrakWoId({ action, data });
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);
  const harusKeSupabase = woSupabase || (liveSaklar === 'supabase') || (liveSaklar !== 'gas' && !woGas);

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const resSupa = await eksekusiSupabaseBackendKmbp(action, token, { data: data || {} }, env);
      if (resSupa && resSupa.status === 200) {
        const json = await resSupa.json().catch(() => null);
        if (json) return json;
      }
      if (liveSaklar === 'supabase' || woSupabase) {
        return null;
      }
    } catch (_) {
      if (liveSaklar === 'supabase' || woSupabase) return null;
    }
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;
  try {
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'X-Abadi-Rumah': env.RUMAH || '',
      },
      body: JSON.stringify({ action, token, data: data || {} }),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

function renderPesanWeb(judul, pesan, urlTombol, teksTombol) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${judul} - Abadi Operation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #111827; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .box { background: white; padding: 2.5rem; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 440px; width: 100%; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #0F172A; }
    p { color: #64748B; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.75rem; }
    a { display: inline-block; background: #4F633F; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; font-size: 0.95rem; transition: background 0.2s; }
    a:hover { background: #384B2B; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${judul}</h1>
    <p>${pesan}</p>
    <a href="${urlTombol}">${teksTombol}</a>
  </div>
</body>
</html>`;
}

function renderPesanAksesAdminDitolak(userRole) {
  const roleLabel = String(userRole || 'Pengguna').toUpperCase();
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akses Ditolak (403) - Abadi Operation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0F172A; color: #F8FAFC;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: #1E293B; border: 1px solid #334155; border-radius: 16px;
      padding: 36px 28px; max-width: 540px; text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h1 { font-size: 21px; font-weight: 700; color: #F87171; margin-bottom: 12px; }
    .badge {
      display: inline-block; background: #334155; color: #F1F5F9;
      padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 700;
      margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    p { font-size: 14.5px; color: #94A3B8; line-height: 1.6; margin-bottom: 24px; }
    .btn-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-block; text-decoration: none; padding: 10px 20px;
      border-radius: 8px; font-weight: 600; font-size: 14px; transition: all 0.2s;
    }
    .btn-primary { background: #3B82F6; color: white; }
    .btn-primary:hover { background: #2563EB; }
    .btn-secondary { background: #334155; color: #E2E8F0; }
    .btn-secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Akses Terbatas Khusus Administrator</h1>
    <div class="badge">Peran Akun: ${roleLabel}</div>
    <p>
      Menu <strong>Manajemen Pengguna &amp; Token</strong> serta <strong>Master Data Config</strong> (Units, Components, Catalog Jobs, Factors) tidak diperuntukkan bagi peran operasional L1 / L2 di Web Desktop.
      <br><br>
      Konfigurasi sistem disatukan di <strong>Panel Saklar &amp; Pengelola Pusat</strong> yang hanya dapat diakses oleh Administrator dengan autentikasi kata sandi.
    </p>
    <div class="btn-group">
      <a href="/web" class="btn btn-secondary">← Kembali ke Halaman Utama</a>
      <a href="/saklar" class="btn btn-primary">Buka Panel Saklar Pusat →</a>
    </div>
  </div>
</body>
</html>`;
}

