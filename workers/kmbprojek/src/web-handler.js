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
  const st = String(w.status || 'pending_mechanic_work').toLowerCase();
  const sg = w.status_group || (
    ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
      ? 'pending_approval'
      : (st === 'approved' ? 'done' : 'assigned')
  );
  const sl = w.status_label || (
    sg === 'done' ? 'Approved' : (sg === 'pending_approval' ? 'Menunggu Approval' : 'Perlu Diisi Mekanik')
  );
  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = String(w.unit_id || w.unit_code || unitObj.unit_id || 'WORKSHOP');
  const unit_name = String(w.unit_name || unitObj.unit_name || unit_id);
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = String(w.component_id || compObj.component_no || compObj.component_id || compStr || w.job_id || 'COM-001');
  const component_name = String(w.component_name || w.others_description || w.activity || compObj.component_name || compStr || component_id || 'Pekerjaan');
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
    const userRole = String(user.role || '').toLowerCase();
    if (userRole !== 'admin') {
      return new Response(renderPesanAksesAdminDitolak(userRole), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const defTab = page === 'config' ? (url.searchParams.get('tab') || 'units') : 'users';
    const html = renderHalamanCrudUserWeb('kmbprojek', token, user, defTab);
    return new Response(html, {
      status: 200,
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

  // 3. Ambil data inisial halaman jika diperlukan
  const context = {
    baseUrl: '/web',
    token: token,
    backToken: backToken,
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
        context.pendingApprovals = (pendingData.pending || pendingData.approvals || pendingData.wos || (Array.isArray(pendingData) ? pendingData : [])).map(lengkapiObjekWoWeb);
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
      context.initialData = {
        wos: enrichedWos,
        counts: computedCounts,
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
  const html = renderWebPage(page, context);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
      'X-Abadi-Web': page,
    },
  });
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

  const liveSaklar = await bacaStatusSaklar(env);
  const targetWoId = ekstrakWoId(body);
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);

  // Aturan Saklar Balik & Satu Rumah Seumur Hidup:
  // 1. Jika WO lahir di Supabase (4 digit / WO-SB-*), WAJIB ke Supabase bahkan saat saklar 'gas'.
  // 2. Jika WO lama lahir di GAS (3 digit), saat dua_cabang tetap diteruskan ke GAS.
  const isAdminAction = action.startsWith('admin_') || action.startsWith('handleAdmin');
  const harusKeSupabase = isAdminAction || woSupabase || (liveSaklar === 'supabase') || ((liveSaklar !== 'gas' || url.searchParams.get('uji') === 'supabase') && !woGas);

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const resSupa = await eksekusiSupabaseBackendKmbp(action, token, body, env);
      if (resSupa && resSupa.status === 200) {
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

function renderHalamanCrudUserWeb(rumah, token, user, tabAwal = 'users') {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rumahUp = esc(String(rumah || 'kmbprojek').toUpperCase());
  const tokEnc = encodeURIComponent(token);
  const namaUser = esc(user.mechanic_name || user.name || user.mechanic_id || 'Admin');
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manajemen User & Config (CRUD) - ${rumahUp}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #0F172A; padding: 20px; }
    .container { max-width: 1240px; margin: 0 auto; }
    .navbar { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
    .nav-brand { font-weight: 700; margin-right: 12px; }
    .nav-link { text-decoration: none; color: #475569; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .nav-link.active { background: #F1F4EE; color: #384B2B; font-weight: 700; }
    .sub-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .sub-tab { padding: 9px 15px; border-radius: 10px; border: 1px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 13.5px; cursor: pointer; }
    .sub-tab.active { background: #4F633F; color: #fff; border-color: #4F633F; }
    .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    h1 { font-size: 21px; margin-bottom: 6px; }
    .sub { color: #64748B; font-size: 13.5px; margin-bottom: 16px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; margin-bottom: 14px; }
    input, select { padding: 9px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 14px; }
    .btn { padding: 8px 13px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
    .btn-primary { background: #4F633F; color: #fff; }
    .btn-secondary { background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; }
    .btn-danger { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: left; }
    th { background: #F8FAFC; font-size: 12px; text-transform: uppercase; color: #475569; }
    .badge { padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .b-active { background: #DCFCE7; color: #166534; }
    .b-inactive { background: #FEE2E2; color: #991B1B; }
    .modal { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: none; align-items: center; justify-content: center; z-index: 999; padding: 16px; }
    .modal.show { display: flex; }
    .modal-box { background: #fff; border-radius: 14px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 22px; }
    .form-group { margin-bottom: 11px; display: flex; flex-direction: column; gap: 4px; }
    .form-group label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="navbar">
      <div class="nav-brand">⚙️ MAR Admin (${rumahUp})</div>
      <a href="https://abadiops.com/saklar" class="nav-link">← Panel Saklar Pusat</a>
      <span class="nav-link active">👥 Users &amp; Config (Admin)</span>
      <span style="margin-left:auto;font-size:13px;color:#475569;font-weight:600;">${namaUser} (Admin)</span>
    </nav>

    <div class="sub-tabs">
      <button class="sub-tab active" id="tabBtn_users" onclick="gantiTab('users')">👷 Users & Token</button>
      <button class="sub-tab" id="tabBtn_unit" onclick="gantiTab('unit')">🚜 Config Units</button>
      <button class="sub-tab" id="tabBtn_component" onclick="gantiTab('component')">🔩 Config Components</button>
      <button class="sub-tab" id="tabBtn_job" onclick="gantiTab('job')">📋 Catalog Jobs</button>
      <button class="sub-tab" id="tabBtn_factor" onclick="gantiTab('factor')">⚖️ Config Factors & Tarif</button>
    </div>

    <div id="pesanStatus" style="margin-bottom:12px;padding:10px 14px;border-radius:10px;background:#E0F2FE;font-size:13px;color:#0369A1;display:none;"></div>

    <div class="card" id="panel_users">
      <h1>👷 Manajemen Pengguna & Token (CRUD)</h1>
      <p class="sub">Tambah (Create), Lihat (Read), Ubah Role/Data & Ganti Token (Update), atau Hapus Pengguna (Delete) langsung di Supabase.</p>
      <div class="toolbar">
        <input type="search" id="cari" placeholder="🔍 Cari ID, nama, role, section..." oninput="renderTabel()" style="min-width:260px;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="muatUsers()">🔄 Muat Ulang</button>
          <button class="btn btn-primary" onclick="bukaModal()">+ Tambah User Baru</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>ID</th><th>Nama</th><th>Role</th><th>Section / Golongan</th><th>Status</th><th>Token</th><th>Aksi CRUD</th></tr>
          </thead>
          <tbody id="tbodyUsers">
            <tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">Memuat daftar pengguna...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card hidden" id="panel_config">
      <h1 id="judulConfig">🚜 Manajemen Config (CRUD)</h1>
      <p class="sub" id="subConfig">Kelola master data konfigurasi langsung di Supabase (Create, Read, Update, Delete).</p>
      <div class="toolbar">
        <input type="search" id="cariConfig" placeholder="🔍 Cari kode, nama, section, deskripsi..." oninput="renderTabelConfig()" style="min-width:260px;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="muatConfig()">🔄 Muat Ulang</button>
          <button class="btn btn-primary" id="btnTambahConfig" onclick="bukaModalConfigBaru()">+ Tambah Data</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead id="theadConfig"></thead>
          <tbody id="tbodyConfig"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="modal" id="modalUser">
    <div class="modal-box">
      <h3 id="judulModal" style="margin-bottom:14px;">Tambah / Edit User</h3>
      <div class="form-group"><label>Kode / ID Mekanik (contoh: MNT-015, SPV-003)</label><input type="text" id="fId" placeholder="MNT-015"></div>
      <div class="form-group"><label>Nama Lengkap</label><input type="text" id="fNama" placeholder="Nama lengkap"></div>
      <div class="form-group"><label>Email (opsional)</label><input type="email" id="fEmail" placeholder="nama@abadiops.com"></div>
      <div class="form-group"><label>Role</label><select id="fRole"><option value="mechanic">mechanic (Mekanik)</option><option value="supervisor">supervisor (L1 Approver / Planner)</option><option value="superintendent">superintendent (L2 Approver / Admin)</option></select></div>
      <div class="form-group"><label>Section (maintenance / vessel / workshop / field)</label><input type="text" id="fSection" placeholder="maintenance"></div>
      <div class="form-group"><label>Position / Golongan</label><input type="text" id="fGolongan" placeholder="junior / senior / 2a / 3a"></div>
      <div class="form-group"><label>Status</label><select id="fStatus"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="tutupModal()">Batal</button>
        <button class="btn btn-primary" onclick="simpanUser()">💾 Simpan</button>
      </div>
    </div>
  </div>

  <div class="modal" id="modalConfig">
    <div class="modal-box">
      <h3 id="judulModalConfig" style="margin-bottom:14px;">Tambah / Edit Config</h3>
      <div id="formConfigContainer"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="tutupModalConfig()">Batal</button>
        <button class="btn btn-primary" onclick="simpanConfig()">💾 Simpan Config</button>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    let TAB_AKTIF = ${JSON.stringify(tabAwal || 'users')};
    let DAFTAR = [];
    let DATA_CONFIG = { units: [], components: [], jobs: [], factors: [] };
    let CONFIG_SUDAH_DIMUAT = false;

    async function panggilApi(action, data = {}) {
      const res = await fetch('/api/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: TOKEN,
          action,
          op_id: 'op-web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          data,
        }),
      });
      return res.json();
    }

    function info(msg) {
      const el = document.getElementById('pesanStatus');
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }

    function gantiTab(tab) {
      TAB_AKTIF = tab;
      ['users', 'unit', 'component', 'job', 'factor'].forEach((t) => {
        const b = document.getElementById('tabBtn_' + t);
        if (b) b.classList.toggle('active', t === tab);
      });
      const isUsers = tab === 'users';
      document.getElementById('panel_users').classList.toggle('hidden', !isUsers);
      document.getElementById('panel_config').classList.toggle('hidden', isUsers);
      if (!isUsers) {
        const petaJudul = {
          unit: ['🚜 Config Units (CRUD)', 'Tambah, ubah, atau hapus daftar unit kendaraan/alat berat & faktor unit.', '+ Tambah Unit'],
          component: ['🔩 Config Components (CRUD)', 'Tambah, ubah, atau hapus komponen pekerjaan, base points, dan target jam.', '+ Tambah Komponen'],
          job: ['📋 Catalog Jobs (CRUD)', 'Tambah, ubah, atau hapus katalog job bertingkat (Section → Component → Sub-Component → Job).', '+ Tambah Job Katalog'],
          factor: ['⚖️ Config Factors & Tarif (CRUD)', 'Tambah, ubah, atau hapus faktor pengali kondisi kerja, ketepatan waktu, safety, MTBF, dan tarif.', '+ Tambah Faktor / Tarif'],
        };
        const infoTab = petaJudul[tab] || petaJudul.unit;
        document.getElementById('judulConfig').textContent = infoTab[0];
        document.getElementById('subConfig').textContent = infoTab[1];
        document.getElementById('btnTambahConfig').textContent = infoTab[2];
        if (!CONFIG_SUDAH_DIMUAT) { muatConfig(); } else { renderTabelConfig(); }
      }
    }

    async function muatUsers() {
      info('⏳ Memuat daftar pengguna...');
      const r = await panggilApi('admin_daftar_user');
      if (!r || !r.success) {
        info('❌ Gagal memuat pengguna: ' + ((r && (r.error?.message || r.error)) || 'Akses ditolak'));
        return;
      }
      DAFTAR = (r.result && r.result.users) || (r.data && r.data.users) || [];
      info('✅ Memuat ' + DAFTAR.length + ' pengguna.');
      renderTabel();
    }

    function renderTabel() {
      const q = (document.getElementById('cari').value || '').toLowerCase().trim();
      const rows = DAFTAR.filter((u) => !q || [u.mechanic_id, u.name, u.role, u.section, u.golongan].join(' ').toLowerCase().includes(q));
      const tb = document.getElementById('tbodyUsers');
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Tidak ada pengguna yang cocok.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map((u) => {
        const st = String(u.status || 'ACTIVE').toUpperCase();
        return '<tr>' +
          '<td><b>' + (u.mechanic_id || '') + '</b></td>' +
          '<td>' + (u.name || '') + '</td>' +
          '<td>' + (u.role || 'mechanic') + '</td>' +
          '<td>' + ([u.section, u.position || u.golongan].filter(Boolean).join(' · ') || '-') + '</td>' +
          '<td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td>' +
          '<td><code>' + (u.token_masked || (u.has_token ? 'Aktif' : 'Belum ada')) + '</code></td>' +
          '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="btn btn-secondary" onclick="editUser(\'' + u.mechanic_id + '\')">✏️ Edit</button>' +
            '<button class="btn btn-secondary" onclick="kelolaToken(\'' + u.mechanic_id + '\', false)">🔑 Token</button>' +
            '<button class="btn btn-secondary" onclick="kelolaToken(\'' + u.mechanic_id + '\', true)">🔄 Ganti</button>' +
            '<button class="btn btn-danger" onclick="hapusUser(\'' + u.mechanic_id + '\')">🗑 Hapus</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function bukaModal(u) {
      document.getElementById('judulModal').textContent = u ? ('Edit User: ' + u.mechanic_id) : 'Tambah User Baru';
      document.getElementById('fId').value = u ? u.mechanic_id : '';
      document.getElementById('fId').readOnly = Boolean(u);
      document.getElementById('fNama').value = u ? (u.name || '') : '';
      document.getElementById('fEmail').value = u ? (u.email || '') : '';
      document.getElementById('fRole').value = u ? (u.role || 'mechanic') : 'mechanic';
      document.getElementById('fSection').value = u ? (u.section || '') : 'maintenance';
      document.getElementById('fGolongan').value = u ? (u.position || u.golongan || '') : '';
      document.getElementById('fStatus').value = u ? (u.status || 'ACTIVE') : 'ACTIVE';
      document.getElementById('modalUser').classList.add('show');
    }

    function tutupModal() { document.getElementById('modalUser').classList.remove('show'); }
    function editUser(id) { const u = DAFTAR.find((x) => x.mechanic_id === id); if (u) bukaModal(u); }

    async function simpanUser() {
      const payload = {
        mechanic_id: document.getElementById('fId').value.trim().toUpperCase(),
        name: document.getElementById('fNama').value.trim(),
        email: document.getElementById('fEmail').value.trim(),
        role: document.getElementById('fRole').value,
        section: document.getElementById('fSection').value.trim(),
        position: document.getElementById('fGolongan').value.trim(),
        golongan: document.getElementById('fGolongan').value.trim(),
        status: document.getElementById('fStatus').value,
        aktif: document.getElementById('fStatus').value === 'ACTIVE',
      };
      const r = await panggilApi('admin_simpan_user', payload);
      if (!r || !r.success) { alert('Gagal menyimpan user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      tutupModal();
      await muatUsers();
    }

    async function kelolaToken(id, ganti) {
      if (ganti && !confirm('Ganti token untuk ' + id + '? Token lama akan dicabut.')) return;
      const r = await panggilApi('admin_terbitkan_token', { mechanic_id: id, ganti: Boolean(ganti) });
      if (!r || !r.success) { alert('Gagal: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      const tok = (r.result && r.result.token) || (r.data && r.data.token) || '';
      prompt('Token untuk ' + id + ' (Salin):', tok);
      await muatUsers();
    }

    async function hapusUser(id) {
      if (!confirm('Hapus permanen user ' + id + ' beserta tokennya?')) return;
      const r = await panggilApi('admin_hapus_user', { mechanic_id: id });
      if (!r || !r.success) { alert('Gagal menghapus user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      await muatUsers();
    }

    async function muatConfig() {
      info('⏳ Memuat data konfigurasi dari Supabase...');
      const r = await panggilApi('admin_daftar_config', { jenis: 'all' });
      if (!r || !r.success) {
        info('❌ Gagal memuat config: ' + ((r && (r.error?.message || r.error)) || 'Pastikan SQL terbaru sudah dijalankan'));
        return;
      }
      const d = r.result || r.data || {};
      DATA_CONFIG = {
        units: Array.isArray(d.units) ? d.units : [],
        components: Array.isArray(d.components) ? d.components : [],
        jobs: Array.isArray(d.jobs) ? d.jobs : [],
        factors: Array.isArray(d.factors) ? d.factors : [],
      };
      CONFIG_SUDAH_DIMUAT = true;
      info('✅ Config dimuat: ' + DATA_CONFIG.units.length + ' Unit, ' + DATA_CONFIG.components.length + ' Komponen, ' + DATA_CONFIG.jobs.length + ' Job, ' + DATA_CONFIG.factors.length + ' Faktor.');
      renderTabelConfig();
    }

    function renderTabelConfig() {
      const q = (document.getElementById('cariConfig').value || '').toLowerCase().trim();
      const th = document.getElementById('theadConfig');
      const tb = document.getElementById('tbodyConfig');
      if (TAB_AKTIF === 'unit') {
        th.innerHTML = '<tr><th>Kode Unit</th><th>Nama Unit</th><th>Model</th><th>Section</th><th>Faktor Unit</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.units.filter((x) => !q || [x.unit_id, x.unit_name, x.unit_model, x.section].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Belum ada data unit.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.unit_id || '') + '</b></td><td>' + (x.unit_name || x.unit_id || '') + '</td><td>' + (x.unit_model || '-') + '</td><td>' + (x.section || '-') + '</td><td>' + (x.unit_factor ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'unit\', ' + idx + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'unit\', \'' + x.unit_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'component') {
        th.innerHTML = '<tr><th>ID Komponen</th><th>Nama Komponen</th><th>Kategori / Section</th><th>Base Points</th><th>Target Hours</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.components.filter((x) => !q || [x.component_id, x.component_name, x.category].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Belum ada data komponen.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.component_id || '') + '</b></td><td>' + (x.component_name || '') + '</td><td>' + (x.category || x.section || '-') + '</td><td>' + (x.base_points ?? 1) + '</td><td>' + (x.target_hours ?? 2) + ' jam</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'component\', ' + idx + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'component\', \'' + x.component_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'job') {
        th.innerHTML = '<tr><th>Job ID</th><th>Section</th><th>Komponen → Sub</th><th>Deskripsi Pekerjaan</th><th>Plan Hours</th><th>Base Point</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.jobs.filter((x) => !q || [x.job_id, x.section, x.component, x.sub_component, x.job_description, x.unit_model].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748B;">Belum ada data katalog job.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.job_id || '') + '</b></td><td>' + (x.section || '-') + '</td><td>' + (x.component || '-') + ' · <small>' + (x.sub_component || '-') + '</small></td><td>' + (x.job_description || '') + '</td><td>' + (x.plan_hours ?? 2) + ' jam</td><td>' + (x.base_point ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'job\', ' + idx + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'job\', \'' + x.job_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'factor') {
        th.innerHTML = '<tr><th>Tipe Faktor</th><th>Key (Kunci)</th><th>Nilai Pengali / Tarif</th><th>Keterangan</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.factors.filter((x) => !q || [x.factor_type, x.key, x.description].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748B;">Belum ada data faktor.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => '<tr><td><b>' + (x.factor_type || '') + '</b></td><td><code>' + (x.key || '') + '</code></td><td><b>' + (x.value ?? 1) + '</b></td><td>' + (x.description || '-') + '</td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'factor\', ' + idx + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'factor\', \'' + (x.factor_type || '') + ':' + (x.key || '') + '\')">🗑 Hapus</button></td></tr>').join('');
      }
    }

    function fg(lbl, id, val, ro, type) {
      return '<div class="form-group"><label>' + lbl + '</label><input ' + (type ? 'type="' + type + '" step="0.05" ' : '') + 'id="' + id + '" value="' + String(val ?? '').replace(/"/g, '&quot;') + '"' + (ro ? ' readonly' : '') + '></div>';
    }

    function bukaModalConfigBaru(item = null) {
      const box = document.getElementById('formConfigContainer');
      const t = TAB_AKTIF;
      document.getElementById('judulModalConfig').textContent = (item ? 'Edit ' : 'Tambah ') + t.toUpperCase();
      const selSt = '<div class="form-group"><label>Status</label><select id="cfg_status"><option value="ACTIVE"' + ((item?.status || 'ACTIVE') === 'ACTIVE' ? ' selected' : '') + '>ACTIVE</option><option value="INACTIVE"' + (item?.status === 'INACTIVE' ? ' selected' : '') + '>INACTIVE</option></select></div>';
      if (t === 'unit') {
        box.innerHTML = fg('Kode Unit (unit_id, contoh: DT-01, TB-ABADI-01)', 'cfg_unit_id', item?.unit_id || '', !!item) + fg('Nama Unit', 'cfg_unit_name', item?.unit_name || '') + fg('Model Unit', 'cfg_unit_model', item?.unit_model || '') + fg('Section (maintenance / vessel / field / workshop)', 'cfg_section', item?.section || 'maintenance') + fg('Faktor Unit', 'cfg_unit_factor', item?.unit_factor ?? 1.0, false, 'number') + selSt;
      } else if (t === 'component') {
        box.innerHTML = fg('ID Komponen (contoh: COM-001)', 'cfg_component_id', item?.component_id || '', !!item) + fg('Nama Komponen', 'cfg_component_name', item?.component_name || '') + fg('Kategori / Section', 'cfg_category', item?.category || item?.section || 'General') + fg('Base Points', 'cfg_base_points', item?.base_points ?? 1.25, false, 'number') + fg('Target Jam (Hours)', 'cfg_target_hours', item?.target_hours ?? 2.0, false, 'number') + selSt;
      } else if (t === 'job') {
        box.innerHTML = fg('Job ID (contoh: JOB-001)', 'cfg_job_id', item?.job_id || '', !!item) + fg('Section (maintenance / vessel / field / workshop)', 'cfg_section', item?.section || 'maintenance') + fg('Model Unit (opsional)', 'cfg_unit_model', item?.unit_model || '') + fg('Komponen Utama', 'cfg_component', item?.component || 'General') + fg('Sub-Komponen', 'cfg_sub_component', item?.sub_component || 'Standard') + fg('Deskripsi Pekerjaan', 'cfg_job_description', item?.job_description || '') + fg('Plan Hours (Target Jam)', 'cfg_plan_hours', item?.plan_hours ?? 2.0, false, 'number') + fg('Base Point', 'cfg_base_point', item?.base_point ?? 1.25, false, 'number') + fg('Job Type (Preventive / Corrective / Overhaul)', 'cfg_job_type', item?.job_type || 'Preventive') + selSt;
      } else if (t === 'factor') {
        box.innerHTML = fg('Tipe Faktor (work_condition / timeliness / safety / mtbf / rate / golongan)', 'cfg_factor_type', item?.factor_type || 'work_condition') + fg('Key (normal / difficult / extreme / on_time / late / junior)', 'cfg_key', item?.key || '') + fg('Nilai Angka (Value)', 'cfg_value', item?.value ?? 1.0, false, 'number') + fg('Keterangan', 'cfg_description', item?.description || '');
      }
      document.getElementById('modalConfig').classList.add('show');
    }

    function tutupModalConfig() { document.getElementById('modalConfig').classList.remove('show'); }
    function editConfigItem(jenis, idx) {
      const map = { unit: DATA_CONFIG.units, component: DATA_CONFIG.components, job: DATA_CONFIG.jobs, factor: DATA_CONFIG.factors };
      const item = (map[jenis] || [])[idx];
      if (item) bukaModalConfigBaru(item);
    }

    async function simpanConfig() {
      const t = TAB_AKTIF;
      const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      let payload = {};
      if (t === 'unit') payload = { unit_id: val('cfg_unit_id'), unit_name: val('cfg_unit_name'), unit_model: val('cfg_unit_model'), section: val('cfg_section'), unit_factor: val('cfg_unit_factor'), status: val('cfg_status') };
      else if (t === 'component') payload = { component_id: val('cfg_component_id'), component_name: val('cfg_component_name'), category: val('cfg_category'), base_points: val('cfg_base_points'), target_hours: val('cfg_target_hours'), status: val('cfg_status') };
      else if (t === 'job') payload = { job_id: val('cfg_job_id'), section: val('cfg_section'), unit_model: val('cfg_unit_model'), component: val('cfg_component'), sub_component: val('cfg_sub_component'), job_description: val('cfg_job_description'), plan_hours: val('cfg_plan_hours'), base_point: val('cfg_base_point'), job_type: val('cfg_job_type'), status: val('cfg_status') };
      else if (t === 'factor') payload = { factor_type: val('cfg_factor_type'), key: val('cfg_key'), value: val('cfg_value'), description: val('cfg_description') };
      const r = await panggilApi('admin_simpan_config', { jenis: t, payload });
      if (!r || !r.success) { alert('Gagal menyimpan config: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      tutupModalConfig();
      await muatConfig();
    }

    async function hapusConfigItem(jenis, kunci) {
      if (!confirm('Hapus item config ' + jenis + ' "' + kunci + '" dari Supabase?')) return;
      const r = await panggilApi('admin_hapus_config', { jenis, kunci });
      if (!r || !r.success) { alert('Gagal menghapus config: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      await muatConfig();
    }

    muatUsers();
    if (TAB_AKTIF !== 'users') gantiTab(TAB_AKTIF);
  </script>
</body>
</html>`;
}
