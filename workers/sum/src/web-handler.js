/**
 * Web Desktop Handler untuk Cloudflare Workers
 * Menyajikan antarmuka desktop 1:1 GAS dan jembatan API google.script.run
 */

import { renderWebPage } from './web-templates.js';

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
  'loadJobsCatalog', 'getWODetails',
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
      if (refs && refs.success && refs.data) {
        context.components = refs.data.components || [];
        context.units = refs.data.units || [];
        context.mechanics = refs.data.mechanics || [];
        context.workConditions = refs.data.work_conditions || [];
        context.userScope = refs.data.user_scope || null;
      }
    } else if (['approvals', 'approval'].includes(page)) {
      const pending = await panggilAksiInternal('pull_pending', token, {}, env);
      if (pending && pending.success && pending.data) {
        context.pendingApprovals = pending.data.pending || [];
        context.pendingTransfers = pending.data.transfers || [];
        context.activeWos = pending.data.active || [];
        context.approvedWos = pending.data.approved || [];
        context.rejectedWos = pending.data.rejected || [];
      }
      const mechList = await panggilAksiInternal('pull_create_refs', token, {}, env);
      if (mechList && mechList.success && mechList.data && mechList.data.mechanics) {
        context.allMechanics = mechList.data.mechanics;
      }
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const myWos = await panggilAksiInternal('pull_my_wos', token, {}, env);
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      context.initialData = {
        wos: (myWos && myWos.data && myWos.data.wos) || [],
        counts: (myWos && myWos.data && myWos.data.counts) || { all:0, assigned:0, in_progress:0, pending_approval:0, done:0 },
        viewing_as: context.viewAsMechanicId || null,
        mechanic: user,
      };
      context.monitoringData = (mon && mon.data) || [];
      context.mons = (mon && mon.data) || [];
    } else if (['dashboard', 'main'].includes(page)) {
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      context.dashboardData = {
        stats: (mon && mon.data && mon.data.stats) || { totalWOs: 0, approved: 0, pending: 0, totalPoints: 0 },
        recentWOs: (mon && mon.data && mon.data.recentWOs) || [],
        charts: (mon && mon.data && mon.data.charts) || { pointsTrend: { labels: [], data: [] } },
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

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;

  try {
    let res;
    if (ROUTER_ACTIONS.has(action)) {
      // Format URL encoded untuk Router.gs
      const params = new URLSearchParams();
      params.append('action', action);
      params.append('data', JSON.stringify(data));
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Abadi-Rumah': env.RUMAH || '',
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
    return new Response(JSON.stringify({ success: false, error: 'Koneksi ke backend gagal: ' + (err.message || err) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function panggilAksiInternal(action, token, data, env) {
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
