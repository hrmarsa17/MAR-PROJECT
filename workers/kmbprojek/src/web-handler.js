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
  if (!page) {
    const roleLower = String(role).toLowerCase();
    page = (roleLower === 'mechanic') ? 'mechanic'
         : (roleLower === 'supervisor') ? 'approvals'
         : 'dashboard';
  }

  // 3. Ambil data inisial halaman jika diperlukan
  const context = {
    baseUrl: '/web',
    token: token,
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
      if (pending && pending.success && pendingData) {
        context.pendingApprovals = pendingData.pending || pendingData.approvals || [];
        context.pendingTransfers = pendingData.transfers || [];
        context.activeWos = pendingData.active || [];
        context.approvedWos = pendingData.approved || [];
        context.rejectedWos = pendingData.rejected || [];
      }
      const mechList = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const mechData = mechList && mechList.result ? mechList.result : (mechList && mechList.data ? mechList.data : {});
      const actualMechRefs = (mechData && mechData.refs) ? mechData.refs : mechData;
      if (mechList && mechList.success && actualMechRefs && (actualMechRefs.mechanics || actualMechRefs.allMechanics)) {
        context.allMechanics = actualMechRefs.mechanics || actualMechRefs.allMechanics || [];
      }
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const myWos = await panggilAksiInternal('pull_my_wos', token, {}, env);
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const myWosData = myWos && myWos.result ? myWos.result : (myWos && myWos.data ? myWos.data : {});
      const monData = mon && mon.result ? mon.result : (mon && mon.data ? mon.data : []);
      context.initialData = {
        wos: (myWosData && myWosData.wos) || [],
        counts: (myWosData && myWosData.counts) || { all:0, assigned:0, in_progress:0, pending_approval:0, done:0 },
        viewing_as: context.viewAsMechanicId || null,
        mechanic: user,
      };
      context.monitoringData = monData;
      context.mons = monData;
    } else if (['dashboard', 'main'].includes(page)) {
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const monData = mon && mon.result ? mon.result : (mon && mon.data ? mon.data : {});
      context.dashboardData = {
        stats: (monData && monData.stats) || { totalWOs: 0, approved: 0, pending: 0, totalPoints: 0 },
        recentWOs: (monData && monData.recentWOs) || [],
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
  const harusKeSupabase = woSupabase || (liveSaklar === 'supabase') || ((liveSaklar !== 'gas' || url.searchParams.get('uji') === 'supabase') && !woGas);

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

