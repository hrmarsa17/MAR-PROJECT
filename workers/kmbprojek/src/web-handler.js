/**
 * Web Desktop Handler untuk Cloudflare Workers (`kmbprojek`)
 * Menyajikan antarmuka desktop dan jembatan API google.script.run.
 * Mendukung penuh eksekusi mandiri via Supabase (`./supabase-backend.js`) tanpa pihak ketiga GAS,
 * serta memperbaiki Bug #24 (pembacaan `.result` vs `.data` dan pemetaan argumen `handle*`).
 */

import { renderWebPage } from './web-templates.js';
import {
  eksekusiAksiSupabaseMandiri,
  ekstrakWoId,
  apakahWoLahirDiSupabase,
  apakahWoLamaDariGas
} from './supabase-backend.js';
import { bacaStatusSaklar } from './index.js';

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


function lengkapiObjekWoWeb(w) {
  if (!w || typeof w !== 'object') return {};
  const id = String(w.id || w.wo_id || w.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || id);
  const rawStatus = String(w.status || 'pending_mechanic_work').toLowerCase();
  const st = (rawStatus === 'pending_l1' ? 'pending_supervisor' : (rawStatus === 'pending_l2' ? 'pending_superintendent' : rawStatus));
  const sg = ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
    ? 'pending_approval'
    : (st === 'approved' ? 'done' : (['rejected', 'cancelled'].includes(st) ? 'rejected' : 'assigned'));
  const sl = st === 'approved'
    ? 'Approved'
    : (st === 'pending_supervisor' || st === 'pending_l1'
      ? 'Menunggu Approval L1'
      : (st === 'pending_superintendent' || st === 'pending_l2'
        ? 'Menunggu Approval L2'
        : (st === 'pending_transfer'
          ? 'Menunggu Keputusan Transfer'
          : (w.status_label || 'Perlu Diisi Mekanik'))));
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
    mechanic_names: team_names,
    mechanics: team_names.join(', ') || '-',
    team_count: w.team_count || team.length || 1,
    requested_by_name: String(w.requested_by_name || w.transfer_requested_by_name || w.submitted_by_name || w.created_by_name || '-'),
    session_hours: Number(w.session_hours ?? w.transfer_session_hours ?? 0),
    partial_hours_now: Number(w.partial_hours_now ?? w.partial_hours ?? 0),
    partial_hours_after: Number(w.partial_hours_after ?? ((Number(w.partial_hours ?? 0) + Number(w.transfer_session_hours ?? w.session_hours ?? 0)).toFixed(2))),
    created_at_str: String(w.created_at_str || w.date || w.created_at || '-'),
  };
}

function ekstrakIsi(res) {
  if (!res || typeof res !== 'object') return {};
  const utama = res.result !== undefined && res.result !== null ? res.result : (res.data || {});
  if (utama && typeof utama === 'object' && !Array.isArray(utama) && utama.refs && typeof utama.refs === 'object') {
    return { ...utama, ...utama.refs };
  }
  return utama;
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
  const pingData = ekstrakIsi(pingRes);
  if (!pingRes || (!pingRes.success && !pingData.email && !pingData.mechanic_id)) {
    const errMsg = (pingRes && (pingRes.error || (pingRes.error && pingRes.error.message))) || 'Token tidak dikenal atau nonaktif.';
    return new Response(renderPesanWeb('Akses Ditolak', errMsg, 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const role = pingData.role || pingRes.role || 'supervisor';
  const email = pingData.email || pingRes.email || '';
  const name = pingData.name || pingData.nama || pingData.mechanic_name || pingRes.name || pingData.mechanic_id || '';
  const mechanic_id = pingData.mechanic_id || pingRes.mechanic_id || '';

  const user = {
    email,
    role,
    mechanic_name: name || mechanic_id || 'Pengguna',
    name,
    mechanic_id,
  };

  // 2. Tentukan halaman
  let page = (url.searchParams.get('page') || '').toLowerCase().trim().split('&')[0];
  if (!page) {
    const roleLower = String(role).toLowerCase();
    page = (roleLower === 'mechanic') ? 'mechanic'
         : (roleLower === 'supervisor') ? 'approvals'
         : 'dashboard';
  }

  // 3. Ambil data inisial halaman (perbaikan Bug #24: dukung .result maupun .data, serta backToken & activeFilter)
  const rawBack = (url.searchParams.get('back') || '').trim();
  const backToken = rawBack && rawBack !== token ? rawBack : '';
  const activeFilter = (url.searchParams.get('filter') || 'assigned').toLowerCase().trim();
  const context = {
    baseUrl: '/web',
    token,
    backToken,
    activeFilter,
    user,
    currentView: url.searchParams.get('view') || 'pending',
    viewAsMechanicId: url.searchParams.get('as') || '',
  };

  if (['users', 'user', 'admin', 'config', 'configs'].includes(page)) {
    const userRole = String(user.role || '').toLowerCase();
    if (userRole !== 'admin') {
      return new Response(renderPesanAksesAdminDitolak(userRole), {
        status: 403,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        },
      });
    }
    const tabAwal = page.startsWith('config') ? (url.searchParams.get('tab') || 'unit') : (url.searchParams.get('tab') || 'users');
    return new Response(renderHalamanCrudUserWeb(env.RUMAH || 'kmbprojek', token, user, tabAwal), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Web': 'users',
      },
    });
  }

  try {
    if (['create', 'workorder', 'hm', 'km', 'teknis', 'reports'].includes(page)) {
      const refs = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const d = ekstrakIsi(refs);
      if (refs && refs.success) {
        context.components = d.components || [];
        context.units = d.units || [];
        context.mechanics = d.mechanics || [];
        context.workConditions = d.work_conditions || [];
        context.userScope = d.user_scope || null;
      }
    } else if (['approvals', 'approval'].includes(page)) {
      const [pending, active, approved, rejected, refs] = await Promise.all([
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
        panggilAksiInternal('pull_create_refs', token, {}, env),
      ]);
      const dp = ekstrakIsi(pending);
      const da = ekstrakIsi(active);
      const dap = ekstrakIsi(approved);
      const dr = ekstrakIsi(rejected);
      const dref = ekstrakIsi(refs);

      const saringWoSah = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const semuaPending = saringWoSah(dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(lengkapiObjekWoWeb);
      const semuaTransfer = saringWoSah(dp.transfers || []).map(lengkapiObjekWoWeb);

      // Pembatasan Visibilitas Approval berdasarkan Role:
      // L1 (supervisor): CUMA BISA LIHAT DATA L1 (pending_supervisor / pending_l1)
      // L2 (superintendent): CUMA BISA LIHAT DATA L2 (pending_superintendent / pending_l2)
      // Admin: melihat semua antrean pending
      const userRole = String(user.role || '').toLowerCase();
      let pendingList = semuaPending.filter((w) => w.status !== 'pending_transfer');
      if (userRole === 'supervisor') {
        pendingList = pendingList.filter((w) => {
          const wst = String(w.status || '').toLowerCase();
          return wst === 'pending_supervisor' || wst === 'pending_l1';
        });
      } else if (userRole === 'superintendent') {
        pendingList = pendingList.filter((w) => {
          const wst = String(w.status || '').toLowerCase();
          return wst === 'pending_superintendent' || wst === 'pending_l2';
        });
      }

      context.pendingApprovals = pendingList;
      context.pendingTotal = pendingList.length;
      context.pendingCount = pendingList.length;
      context.pendingTransfers = semuaTransfer.length > 0 ? semuaTransfer : semuaPending.filter((w) => w.status === 'pending_transfer');
      context.activeWos = saringWoSah(da.active || da.wos || (Array.isArray(da) ? da : [])).map(lengkapiObjekWoWeb);
      context.approvedWos = saringWoSah(dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(lengkapiObjekWoWeb);
      context.rejectedWos = saringWoSah(dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(lengkapiObjekWoWeb);
      context.allMechanics = dref.mechanics || [];
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const [myWos, mon] = await Promise.all([
        panggilAksiInternal('pull_my_wos', token, {}, env),
        panggilAksiInternal('pull_monitoring', token, {}, env),
      ]);
      const dm = ekstrakIsi(myWos);
      const dmon = ekstrakIsi(mon);
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);
      const rawWosList = (dm.wos || (Array.isArray(dm) ? dm : [])).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const enrichedWos = rawWosList.map(lengkapiObjekWoWeb);
      const computedCounts = {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      const filteredWos = ['assigned', 'pending_approval', 'done'].includes(activeFilter)
        ? enrichedWos.filter((w) => w.status_group === activeFilter)
        : enrichedWos;
      const viewAsMech = context.viewAsMechanicId
        ? (mechsArr.find((m) => String(m.id || m.mechanic_id).toUpperCase() === String(context.viewAsMechanicId).toUpperCase()) || { id: context.viewAsMechanicId, name: context.viewAsMechanicId })
        : null;
      context.initialData = {
        wos: filteredWos,
        counts: computedCounts,
        viewing_as: viewAsMech ? { id: viewAsMech.id || viewAsMech.mechanic_id, name: viewAsMech.name || viewAsMech.id } : null,
        mechanic: user,
        tyre_pilihan: {
          jumlah_pos: 10,
          rtd_kritis: 5,
          problem: ['Worn Out', 'Cut/Torn', 'Run Flat', 'Separation', 'Puncture'],
          remarks: ['Scrap', 'Repair', 'Retread', 'Spare'],
          kondisi: ['New', 'Used', 'Repair', 'Retread'],
        },
      };
      context.monitoringData = {
        overall: (dmon && dmon.overall) || {
          mechanics: mechsArr.length,
          pending_mechanic_work: mechsArr.reduce((a, m) => a + (Number(m.pending_mechanic_work ?? m.pending_work) || 0), 0),
          expired: mechsArr.reduce((a, m) => a + (Number(m.expired) || 0), 0),
          pending_l1: mechsArr.reduce((a, m) => a + (Number(m.pending_l1) || 0), 0),
          pending_l2: mechsArr.reduce((a, m) => a + (Number(m.pending_l2) || 0), 0),
          approved: mechsArr.reduce((a, m) => a + (Number(m.approved) || 0), 0),
        },
        mechanics: mechsArr,
        periode: (dmon && dmon.periode) || '',
      };
      context.mons = mechsArr;
    } else if (['dashboard', 'main'].includes(page)) {
      const [mon, pending, active, approved, rejected] = await Promise.all([
        panggilAksiInternal('pull_monitoring', token, {}, env),
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
      ]);
      const dmon = ekstrakIsi(mon);
      const dp = ekstrakIsi(pending);
      const da = ekstrakIsi(active);
      const dap = ekstrakIsi(approved);
      const dr = ekstrakIsi(rejected);
      const ov = dmon.overall || {};
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);
      const saringWoSah = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const listPending = saringWoSah(dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(lengkapiObjekWoWeb);
      const listActive = saringWoSah(da.active || da.wos || (Array.isArray(da) ? da : [])).map(lengkapiObjekWoWeb);
      const listApproved = saringWoSah(dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(lengkapiObjekWoWeb);
      const listRejected = saringWoSah(dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(lengkapiObjekWoWeb);

      const petaWo = new Map();
      [...listPending, ...listActive, ...listApproved, ...listRejected].forEach((w) => {
        if (w && w.id && !petaWo.has(w.id)) petaWo.set(w.id, w);
      });
      const semuaWo = Array.from(petaWo.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      let totalPoints = 0;
      const lbMap = new Map();
      const trendMap = new Map();
      for (const w of listApproved) {
        const pts = Number(w.final_points ?? w.points ?? 0) || 0;
        const idr = Number(w.final_idr ?? w.idr_value ?? 0) || 0;
        totalPoints += pts;
        const tglKey = String(w.created_at_str || (w.created_at ? String(w.created_at).slice(0, 10) : 'Hari Ini'));
        trendMap.set(tglKey, Number(((trendMap.get(tglKey) || 0) + pts).toFixed(2)));
        const tim = Array.isArray(w.effective_team) && w.effective_team.length ? w.effective_team : [{ mechanic_id: w.lead_mechanic_id || '-', mechanic_name: (w.team_names && w.team_names[0]) || w.lead_mechanic_id || '-' }];
        for (const tm of tim) {
          const k = tm.mechanic_name || tm.mechanic_id || '-';
          if (!k || k === '-') continue;
          const cur = lbMap.get(k) || { mechanic_name: k, grade: tm.golongan || tm.position || '', jabatan: tm.jabatan_aktual || '', golongan: tm.golongan || '', wo_count: 0, wo_submitted_count: 0, total_points: 0, total_idr: 0 };
          cur.wo_count += 1;
          cur.wo_submitted_count += 1;
          cur.total_points = Number((cur.total_points + pts).toFixed(2));
          cur.total_idr = Math.round(cur.total_idr + idr);
          lbMap.set(k, cur);
        }
      }
      const leaderboard = Array.from(lbMap.values()).sort((a, b) => b.total_points - a.total_points);
      const woBerjam = semuaWo.filter((w) => Number(w.actual_hours) > 0);
      const avgJam = woBerjam.length > 0 ? Number((woBerjam.reduce((s, w) => s + Number(w.actual_hours), 0) / woBerjam.length).toFixed(1)) : 0;

      context.dashboardData = {
        user,
        periode: dmon.periode || 'Bulan Berjalan',
        periodeLabel: dmon.periode || 'Bulan Berjalan',
        stats: dmon.stats || {
          totalWOs: semuaWo.length || ((ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0) + (ov.approved || 0)),
          approved: listApproved.length || (ov.approved || 0),
          pending: listActive.length + listPending.length || ((ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0)),
          totalPoints: Number(totalPoints.toFixed(2)),
          activeMechanics: mechsArr.length || (ov.mechanics || 0),
          thisMonth: semuaWo.length,
          avgCompletion: avgJam,
          avgCompletionLabel: avgJam > 0 ? `${avgJam} jam` : '—',
          mechanicsByGrade: [],
        },
        recentWOs: semuaWo.slice(0, 20),
        leaderboard,
        submitLeaderboard: leaderboard.map((x) => ({ ...x, submit_count: x.wo_count })),
        leaderboardHarian: {
          label: 'Hari Ini',
          vessel: { nama: 'Rekondisi', jumlah_wo: listApproved.filter((w) => w.section === 'vessel').length, baris: leaderboard.slice(0, 5) },
          maintenance: { nama: 'Maintenance', jumlah_wo: listApproved.filter((w) => w.section !== 'vessel').length, baris: leaderboard.slice(0, 5) },
        },
        charts: dmon.charts || {
          pointsTrend: {
            labels: Array.from(trendMap.keys()),
            data: Array.from(trendMap.values()),
            periodeLabel: 'Bulan Berjalan',
          },
        },
      };
    }
  } catch (err) {
    console.error('Error saat mempersiapkan context halaman web:', err);
  }

  let html = renderWebPage(page, context);
  if (String(role).toLowerCase() === 'admin' && !html.includes('page=users')) {
    const navCrudLink = `<a href="/web?page=users&token=${encodeURIComponent(token)}" class="nav-link" target="_top">👥 Users &amp; Config</a>`;
    if (html.includes('<div style="display:flex;align-items:center;')) {
      html = html.replace('<div style="display:flex;align-items:center;', navCrudLink + '<div style="display:flex;align-items:center;');
    } else if (html.includes('</nav>')) {
      html = html.replace('</nav>', navCrudLink + '</nav>');
    }
  }
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
  const targetWoId = ekstrakWoId(body);
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);

  const token = body.token || (body.data && body.data.token) || '';
  const action = body.action || '';
  const data = body.data || {};
  if (typeof data === 'object' && data !== null && !data.token) {
    data.token = token;
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  const pakaiSupabase = url.searchParams.get('uji') !== 'gas' && Boolean(env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

  if (pakaiSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const hasilSupa = await eksekusiAksiSupabaseMandiri(action, token, { ...body, data }, env);
      if (hasilSupa) {
        if (hasilSupa.result !== undefined && hasilSupa.data === undefined) {
          hasilSupa.data = hasilSupa.result;
        }
        if (hasilSupa.success === false && typeof hasilSupa.error === 'string') {
          hasilSupa.error = { message: hasilSupa.error };
        }
        return new Response(JSON.stringify(hasilSupa), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    } catch (err) {
      if (tanpaGas || liveSaklar === 'supabase') {
        return new Response(JSON.stringify({
          success: false,
          source: 'SUPABASE',
          error: {
            message: 'Gagal mengeksekusi aksi di Supabase: ' + String(err?.message || err),
          },
        }), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
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
  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  if (env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const d = await eksekusiAksiSupabaseMandiri(action, token, { action, token, data }, env);
      if (d && d.success) return d;
    } catch (_) {}
    if (tanpaGas || liveSaklar === 'supabase') return null;
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
      <div class="nav-brand">⚙️ MAR (${rumahUp})</div>
      <a href="/web?page=dashboard&token=${tokEnc}" class="nav-link">Dashboard</a>
      <a href="/web?page=create&token=${tokEnc}" class="nav-link">Create WO</a>
      <a href="/web?page=mechanic&token=${tokEnc}" class="nav-link">Monitoring</a>
      <a href="/web?page=approvals&token=${tokEnc}" class="nav-link">Approvals</a>
      <a href="/web?page=users&token=${tokEnc}" class="nav-link active">👥 Users & Config (CRUD)</a>
      <span style="margin-left:auto;font-size:13px;color:#475569;font-weight:600;">${namaUser}</span>
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
      <div class="form-group" id="fGrupSection">
        <label for="btnToggleFSection">Section <small style="color:#64748B;font-weight:normal;">(bisa pilih lebih dari 1)</small></label>
        <div style="position:relative;width:100%;" id="wrapDropdownFSection">
          <button type="button" id="btnToggleFSection" onclick="toggleDropdownFSection(event)" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;background:#fff;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
            <span id="lblTampilFSection">Pilih Section...</span>
            <span style="font-size:11px;color:#64748B;">▼</span>
          </button>
          <div class="hidden" id="menuDropdownFSection" style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #CBD5E1;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:99;padding:6px;max-height:160px;overflow-y:auto;">
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13.5px;" onclick="event.stopPropagation()">
              <input type="checkbox" value="maintenance" id="cbFSec_maintenance" onchange="sinkronFSection()">
              <span>Maintenance</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13.5px;" onclick="event.stopPropagation()">
              <input type="checkbox" value="vessel" id="cbFSec_vessel" onchange="sinkronFSection()">
              <span>Vessel</span>
            </label>
          </div>
        </div>
        <input type="hidden" id="fSection" value="maintenance">
      </div>
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

    function toggleDropdownFSection(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('menuDropdownFSection');
      if (menu) menu.classList.toggle('hidden');
    }

    function sinkronFSection() {
      const cbM = document.getElementById('cbFSec_maintenance');
      const cbV = document.getElementById('cbFSec_vessel');
      const hidden = document.getElementById('fSection');
      const lbl = document.getElementById('lblTampilFSection');
      const vals = [];
      const labels = [];
      if (cbM && cbM.checked) { vals.push('maintenance'); labels.push('Maintenance'); }
      if (cbV && cbV.checked) { vals.push('vessel'); labels.push('Vessel'); }
      if (hidden) hidden.value = vals.join(', ');
      if (lbl) {
        lbl.textContent = labels.length ? labels.join(', ') : 'Pilih Section...';
        lbl.style.color = labels.length ? '#0F172A' : '#64748B';
      }
    }

    function aturFSection(val) {
      const parts = String(val || '').split(',').map((s) => s.trim().toLowerCase());
      const cbM = document.getElementById('cbFSec_maintenance');
      const cbV = document.getElementById('cbFSec_vessel');
      if (cbM) cbM.checked = parts.includes('maintenance') || parts.includes('field') || parts.includes('workshop');
      if (cbV) cbV.checked = parts.includes('vessel');
      if (!parts.filter(Boolean).length && cbM) cbM.checked = true;
      sinkronFSection();
    }

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('wrapDropdownFSection');
      if (wrap && !wrap.contains(e.target)) {
        const m = document.getElementById('menuDropdownFSection');
        if (m) m.classList.add('hidden');
      }
    });

    function bukaModal(u) {
      document.getElementById('judulModal').textContent = u ? ('Edit User: ' + u.mechanic_id) : 'Tambah User Baru';
      document.getElementById('fId').value = u ? u.mechanic_id : '';
      document.getElementById('fId').readOnly = Boolean(u);
      document.getElementById('fNama').value = u ? (u.name || '') : '';
      document.getElementById('fEmail').value = u ? (u.email || '') : '';
      document.getElementById('fRole').value = u ? (u.role || 'mechanic') : 'mechanic';
      aturFSection(u ? u.section : 'maintenance');
      document.getElementById('fGolongan').value = u ? (u.position || u.golongan || '') : '';
      document.getElementById('fStatus').value = u ? (u.status || 'ACTIVE') : 'ACTIVE';
      document.getElementById('modalUser').classList.add('show');
    }

    function tutupModal() {
      const m = document.getElementById('menuDropdownFSection');
      if (m) m.classList.add('hidden');
      document.getElementById('modalUser').classList.remove('show');
    }
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
      if (payload.aktif) {
        try { await panggilApi('admin_terbitkan_token', { mechanic_id: payload.mechanic_id, ganti: false }); } catch (_) {}
      }
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
          return '<tr><td><b>' + (x.unit_id || '') + '</b></td><td>' + (x.unit_name || x.unit_id || '') + '</td><td>' + (x.unit_model || '-') + '</td><td>' + (x.section || '-') + '</td><td>' + (x.unit_factor ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'unit\', ' + DATA_CONFIG.units.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'unit\', \'' + x.unit_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'component') {
        th.innerHTML = '<tr><th>ID Komponen</th><th>Nama Komponen</th><th>Kategori / Section</th><th>Base Points</th><th>Target Hours</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.components.filter((x) => !q || [x.component_id, x.component_name, x.category].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Belum ada data komponen.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.component_id || '') + '</b></td><td>' + (x.component_name || '') + '</td><td>' + (x.category || x.section || '-') + '</td><td>' + (x.base_points ?? 1) + '</td><td>' + (x.target_hours ?? 2) + ' jam</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'component\', ' + DATA_CONFIG.components.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'component\', \'' + x.component_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'job') {
        th.innerHTML = '<tr><th>Job ID</th><th>Section</th><th>Komponen → Sub</th><th>Deskripsi Pekerjaan</th><th>Plan Hours</th><th>Base Point</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.jobs.filter((x) => !q || [x.job_id, x.section, x.component, x.sub_component, x.job_description, x.unit_model].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748B;">Belum ada data katalog job.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.job_id || '') + '</b></td><td>' + (x.section || '-') + '</td><td>' + (x.component || '-') + ' · <small>' + (x.sub_component || '-') + '</small></td><td>' + (x.job_description || '') + '</td><td>' + (x.plan_hours ?? 2) + ' jam</td><td>' + (x.base_point ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'job\', ' + DATA_CONFIG.jobs.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'job\', \'' + x.job_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'factor') {
        th.innerHTML = '<tr><th>Tipe Faktor</th><th>Key (Kunci)</th><th>Nilai Pengali / Tarif</th><th>Keterangan</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.factors.filter((x) => !q || [x.factor_type, x.key, x.description].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748B;">Belum ada data faktor.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => '<tr><td><b>' + (x.factor_type || '') + '</b></td><td><code>' + (x.key || '') + '</code></td><td><b>' + (x.value ?? 1) + '</b></td><td>' + (x.description || '-') + '</td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'factor\', ' + DATA_CONFIG.factors.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'factor\', \'' + (x.factor_type || '') + ':' + (x.key || '') + '\')">🗑 Hapus</button></td></tr>').join('');
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
    .badge {
      display: inline-block; padding: 6px 14px; border-radius: 9999px;
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      background: #EF4444; color: #FFFFFF; margin-bottom: 18px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #F8FAFC; }
    p { font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px; }
    .btn {
      display: inline-block; padding: 10px 22px; border-radius: 10px;
      font-size: 14px; font-weight: 600; text-decoration: none;
      background: #3B82F6; color: #FFFFFF; transition: background 0.2s;
    }
    .btn:hover { background: #2563EB; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 Dilarang</div>
    <h1>Menu Terbatas Khusus Administrator</h1>
    <p>
      Halaman <strong>Manajemen Pengguna &amp; Konfigurasi Sistem</strong> hanya dapat diakses oleh akun dengan peran <strong>Admin</strong>.<br><br>
      Peran Anda saat ini: <strong style="color: #F8FAFC;">${roleLabel}</strong>.<br>
      Konfigurasi dan manajemen pengguna terpusat dikelola melalui Panel Saklar Pusat oleh Admin.
    </p>
    <a href="/web" class="btn">&larr; Kembali ke Dashboard</a>
  </div>
</body>
</html>`;
}
