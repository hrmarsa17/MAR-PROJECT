/**
 * app.js — Main Application Controller & Router untuk KMB Portal
 * 100% SPREADSHEET LIVE ENGINE (Direct Sync with Google Sheets & Google Apps Script)
 */

import { UNITS as FALLBACK_UNITS, MECHANICS as FALLBACK_MECHANICS, COMPONENTS as FALLBACK_COMPONENTS, TOKENS, FACTORS, RATES } from './data.js';
import { calculateWoPoints, calculateTeamDistribution } from './services/scoring.js';

const DEFAULT_MONITORING_OVERALL = {
  mechanics: 20,
  pending_mechanic_work: 7,
  pending_l1: 3,
  pending_l2: 21,
  approved: 13,
  periode: '26 Okt – 25 Nov 2026',
  total_poin: 20.20
};

const DEFAULT_MECHANICS_LIST = [
  { id: "VES-012", name: "Gusti Raka Pamungkas", section: "vessel", token: "97a47ff4c7e443f2a550", pending_mechanic_work: 2, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-002", name: "Mekanik Maintenance 2", section: "maintenance", token: "7ceafd98922343139b11", pending_mechanic_work: 2, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-009", name: "Alan Rohim", section: "maintenance", token: "abb499b53b564d0abc8e", pending_mechanic_work: 1, pending_l1: 1, pending_l2: 3, approved: 1 },
  { id: "VES-007", name: "Bayu Aji", section: "vessel", token: "bccd82db654b4caabe01", pending_mechanic_work: 1, pending_l1: 0, pending_l2: 1, approved: 3 },
  { id: "VES-011", name: "Yudo Hardianto", section: "vessel", token: "cad65b7ac67d485095f6", pending_mechanic_work: 1, pending_l1: 0, pending_l2: 3, approved: 1 },
  { id: "VES-010", name: "Aditya", section: "vessel", token: "c2309102d07946488229", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 1 },
  { id: "MNT-003", name: "Afid Irham", section: "maintenance", token: "67adf77d8d934659b5c5", pending_mechanic_work: 0, pending_l1: 1, pending_l2: 0, approved: 4 },
  { id: "VES-005", name: "Aji Laksono", section: "vessel", token: "c5f9fed98f4a41b29ff3", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-007", name: "Aldo Noviansyah", section: "maintenance", token: "da766cd0acc54b5f938b", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 6, approved: 5 },
  { id: "MNT-010", name: "Bagus Wahyu Nurcahyo", section: "maintenance", token: "58ea54f16b0149d1b06f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 2, approved: 1 },
  { id: "VES-009", name: "Cahyo Aji", section: "vessel", token: "abec2e7e7334498e8b84", pending_mechanic_work: 0, pending_l1: 2, pending_l2: 0, approved: 0 },
  { id: "VES-008", name: "Dimas", section: "vessel", token: "a4c9596a547548e19866", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-006", name: "Eliyadi", section: "maintenance", token: "66383ba88e8145368f80", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 1 },
  { id: "MNT-012", name: "Khoirul Musthofa", section: "vessel", token: "2022d461a0174205bb8f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 3, approved: 1 },
  { id: "MNT-004", name: "M. Riyanto", section: "vessel", token: "6587ce74c4ec46a8b023", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 0 },
  { id: "VES-013", name: "Nicko Herman Saputra", section: "vessel", token: "ea4d95e0439344b78605", pending_mechanic_work: 0, pending_l1: 2, pending_l2: 0, approved: 0 },
  { id: "VES-004", name: "Rahmat", section: "vessel", token: "0385984dc6234e26a53f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 1, approved: 3 },
  { id: "MNT-011", name: "Regista Pratama", section: "maintenance", token: "a184eb0d25ff4e9388f8", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 1 },
  { id: "MNT-008", name: "Rido Saputra", section: "maintenance", token: "151cc987cf5e4666840a", pending_mechanic_work: 0, pending_l1: 1, pending_l2: 4, approved: 0 },
  { id: "MNT-005", name: "Wiwit", section: "maintenance", token: "cac19e70058a43f8ab57", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 7, approved: 4 }
];

const DEFAULT_PENDING_L1_LIST = [
  {
    id: "WO-20261026-004",
    raw_id: "WO-1792975278962-336",
    date: "26 Oct 2026 07:41",
    shift: "Shift 2",
    unit_id: "XEVB42002 - ST",
    unit_name: "XEVB42002 - ST (BEIBEN)",
    component_name: "Testing And Adjusting — Tyre",
    section: "maintenance",
    actual_hours: 0.3,
    target_hours: 2,
    final_points: 4.84,
    status: "PENDING_L1",
    team: [
      { name: "Afid Irham", mechanic_id: "MNT-003", points: 4.84, idr: 0 },
      { name: "Rido Saputra", mechanic_id: "MNT-008", points: 4.84, idr: 0 },
      { name: "Alan Rohim", mechanic_id: "MNT-009", points: 4.84, idr: 0 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-029",
    raw_id: "WO-1792983976896-192",
    date: "26 Oct 2026 10:06",
    shift: "Shift 1",
    unit_id: "SDT-002",
    unit_name: "Comp Engine Rebuild (ENGINE)",
    component_name: "Assembling — Cylinder Block",
    section: "vessel",
    actual_hours: 4.25,
    target_hours: 30,
    final_points: 82.50,
    status: "PENDING_L1",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 82.50, idr: 0 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 82.50, idr: 0 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-408",
    raw_id: "WO-1792990608901-228",
    date: "26 Oct 2026 11:56",
    shift: "Shift 1",
    unit_id: "SDVS70011",
    unit_name: "SDVS70011 (NUSATAMA)",
    component_name: "Resealing — Hydrolik Ssytem",
    section: "vessel",
    actual_hours: 3,
    target_hours: 18,
    final_points: 39.60,
    status: "PENDING_L1",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 39.60, idr: 0 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 39.60, idr: 0 }
    ],
    created_by: "Djarot"
  }
];


// =========================================================================
// APPLICATION STATE
// =========================================================================
const state = {
  currentUser: null,
  activeToken: null,
  units: [...FALLBACK_UNITS],
  mechanics: [...FALLBACK_MECHANICS],
  components: [...FALLBACK_COMPONENTS],
  workConditions: [
    { key: 'normal', label: 'Shift 1 (Normal)', factor: 1.0 },
    { key: 'difficult', label: 'Shift 2 (Difficult)', factor: 1.1 },
    { key: 'extreme', label: 'Kondisi Ekstrim', factor: 1.2 }
  ],
  monitoringData: {
    overall: { ...DEFAULT_MONITORING_OVERALL },
    mechanics: [...DEFAULT_MECHANICS_LIST]
  },
  pendingL1Wos: [...DEFAULT_PENDING_L1_LIST],
  pendingL2Wos: [],
  activeWos: [],
  approvedWos: [],
  rejectedWos: [],
  workOrders: [...DEFAULT_PENDING_L1_LIST],
  activeTab: 'dashboard',
  monSubTab: 'mechanics',
  apprSubTab: 'l1',
  selectedWoIds: new Set(),
  grupMode: '',
  tampilSemuaUnit: false,
  joblists: [],
  isSyncing: false,
  lastSyncTime: null
};

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.title = 'KMB PORTAL - Mechanic Activity Report';
  loadCachedSpreadsheetData();
  initStorage();
  initEventListeners();
  checkAuth();
  initCreateWoState();
});

// =========================================================================
// API CLIENT (Cloudflare Worker Proxy -> Google Apps Script / Sheets)
// =========================================================================
async function api(action, data = {}, opId = null) {
  const token = state.activeToken;
  const isReadAction = action.startsWith('pull_') || action === 'ping';
  const autoOpId = opId || (isReadAction ? undefined : `op-${Date.now()}-${Math.round(Math.random() * 100000)}`);

  const payload = {
    token: token,
    action: action,
    data: data,
    op_id: autoOpId
  };

  try {
    const res = await fetch('/api/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    // Direct GAS fallback if proxy is unreachable
    try {
      const gasUrl = "https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec";
      const directRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      return await directRes.json();
    } catch (err2) {
      console.warn('API call error:', action, err2);
      return { success: false, error: err2.message };
    }
  }
}

// Load cached refs from previous session
function loadCachedSpreadsheetData() {
  try {
    const cached = localStorage.getItem('kmb_gas_refs_v4');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.units) && parsed.units.length > 0) state.units = parsed.units;
      if (Array.isArray(parsed.mechanics) && parsed.mechanics.length > 0) state.mechanics = parsed.mechanics;
      if (Array.isArray(parsed.components) && parsed.components.length > 0) state.components = parsed.components;
      if (parsed.monitoringData && parsed.monitoringData.overall) state.monitoringData = parsed.monitoringData;
      if (Array.isArray(parsed.workOrders) && parsed.workOrders.length > 0) state.workOrders = parsed.workOrders;
      if (Array.isArray(parsed.pendingL1Wos) && parsed.pendingL1Wos.length > 0) state.pendingL1Wos = parsed.pendingL1Wos;
      if (Array.isArray(parsed.activeWos)) state.activeWos = parsed.activeWos;
      if (Array.isArray(parsed.approvedWos)) state.approvedWos = parsed.approvedWos;
      if (Array.isArray(parsed.rejectedWos)) state.rejectedWos = parsed.rejectedWos;
    }
  } catch (e) {}
}

function saveCachedSpreadsheetData() {
  try {
    localStorage.setItem('kmb_gas_refs_v4', JSON.stringify({
      units: state.units,
      mechanics: state.mechanics,
      components: state.components,
      monitoringData: state.monitoringData,
      workOrders: state.workOrders,
      pendingL1Wos: state.pendingL1Wos,
      activeWos: state.activeWos,
      approvedWos: state.approvedWos,
      rejectedWos: state.rejectedWos,
      cached_at: new Date().toISOString()
    }));
  } catch (e) {}
}

// =========================================================================
// GOOGLE SPREADSHEET LIVE SYNC
// =========================================================================
export async function syncFromSpreadsheet(manual = false) {
  if (!state.activeToken) return;
  if (state.isSyncing) return;

  state.isSyncing = true;
  updateSyncIndicator(true);

  if (manual) {
    showToast('🔄 Menghubungkan ke Google Spreadsheet...', 'info');
  }

  try {
    // 1. Fetch Monitoring (Overall KPIs + 20 Mechanics)
    api('pull_monitoring').then(monRes => {
      if (monRes.success && monRes.result) {
        state.monitoringData = monRes.result;
        renderDashboard();
        renderMonitoring();
        renderApprovals();
        saveCachedSpreadsheetData();
      }
    });

    // 2. Fetch Pending L1 (Approvals)
    api('pull_pending').then(pendRes => {
      if (pendRes.success && pendRes.result && Array.isArray(pendRes.result.pending)) {
        state.pendingL1Wos = pendRes.result.pending.map(w => transformGasWo(w, 'PENDING_L1'));
        renderApprovals();
        renderDashboard();
        saveCachedSpreadsheetData();
      }
    });

    // 3. Fetch Catalogs & Refs
    api('pull_create_refs').then(refsRes => {
      if (refsRes.success && refsRes.result && refsRes.result.refs) {
        const refs = refsRes.result.refs;
        if (Array.isArray(refs.units) && refs.units.length > 0) {
          state.units = refs.units.map(u => ({
            unit_id: u.unit_id || u.id,
            unit_name: u.unit_name || u.name,
            unit_model: (u.unit_model || '').trim().toLowerCase(),
            unit_factor: parseFloat(u.unit_factor) || 1.0,
            unit_scope: Array.isArray(u.unit_scope) ? u.unit_scope.join(',') : (u.unit_scope || '')
          }));
        }
        if (Array.isArray(refs.mechanics) && refs.mechanics.length > 0) {
          state.mechanics = refs.mechanics.map(m => ({
            id: m.mechanic_id || m.id,
            mechanic_id: m.mechanic_id || m.id,
            name: String(m.mechanic_name || m.name || '').trim(),
            mechanic_name: String(m.mechanic_name || m.name || '').trim(),
            section: String(m.section || '').trim().toLowerCase(),
            position: String(m.position || m.jabatan_aktual || 'junior').trim()
          }));
        }
        const allJobs = [];
        if (Array.isArray(refs.jobs_vessel)) {
          refs.jobs_vessel.forEach(j => {
            allJobs.push({
              job_id: j.job_id,
              section: 'rekondisi',
              unit_model: (j.unit_model || 'vessel').trim().toLowerCase(),
              component: j.component,
              sub_component: j.sub_component,
              job_description: j.job_description,
              plan_hours: parseFloat(j.plan_hours) || 0,
              base_point: parseFloat(j.base_point) || (parseFloat(j.plan_hours || 0) * 2)
            });
          });
        }
        if (Array.isArray(refs.jobs_field)) {
          refs.jobs_field.forEach(j => {
            allJobs.push({
              job_id: j.job_id,
              section: 'maintenance',
              unit_model: (j.unit_model || 'hauler').trim().toLowerCase(),
              component: j.component,
              sub_component: j.sub_component,
              job_description: j.job_description,
              plan_hours: parseFloat(j.plan_hours) || 0,
              base_point: parseFloat(j.base_point) || (parseFloat(j.plan_hours || 0) * 2)
            });
          });
        }
        if (allJobs.length > 0) state.components = allJobs;
        renderJoblists();
        saveCachedSpreadsheetData();
      }
    });

    // 4. Fetch Active, Approved, Rejected WOs
    const [actRes, apprRes, rejRes] = await Promise.all([
      api('pull_active'),
      api('pull_approved'),
      api('pull_rejected')
    ]);

    if (actRes.success && actRes.result && Array.isArray(actRes.result.active)) {
      state.activeWos = actRes.result.active.map(w => transformGasWo(w, 'ACTIVE'));
    }
    if (apprRes.success && apprRes.result && Array.isArray(apprRes.result.approved)) {
      state.approvedWos = apprRes.result.approved.map(w => transformGasWo(w, 'APPROVED'));
    }
    if (rejRes.success && rejRes.result && Array.isArray(rejRes.result.rejected)) {
      state.rejectedWos = rejRes.result.rejected.map(w => transformGasWo(w, 'REJECTED'));
    }

    const combined = [
      ...state.pendingL1Wos,
      ...state.activeWos,
      ...state.approvedWos,
      ...state.rejectedWos
    ];
    if (combined.length > 0) state.workOrders = combined;

    state.lastSyncTime = new Date();
    updateEngineStatusBadge(true);
    saveCachedSpreadsheetData();

    renderJoblists();
    renderDashboard();
    renderApprovals();
    renderMonitoring();

    if (manual) {
      showToast('✅ Berhasil menyinkronkan data dengan Google Spreadsheet!', 'success');
    }
  } catch (err) {
    console.error('Spreadsheet sync error:', err);
    if (manual) {
      showToast('⚠️ Gagal terhubung ke Google Spreadsheet: ' + err.message, 'warning');
    }
  } finally {
    state.isSyncing = false;
    updateSyncIndicator(false);
  }
}

function updateEngineStatusBadge(connected) {
  const el = document.getElementById('engine-status');
  if (!el) return;
  if (connected) {
    el.innerHTML = '<i class="fa-solid fa-circle" style="color: #10B981; font-size: 8px;"></i> SPREADSHEET LIVE (Google Sheets)';
  } else {
    el.innerHTML = '<i class="fa-solid fa-circle" style="color: #F59E0B; font-size: 8px;"></i> SPREADSHEET (Offline Cache)';
  }
}

function updateSyncIndicator(loading) {
  const btn = document.getElementById('btn-sync-spreadsheet');
  if (!btn) return;
  if (loading) {
    btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> <span class="hide-mobile">Syncing...</span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span class="hide-mobile">Sync Sheets</span>';
    btn.disabled = false;
  }
}

function transformGasWo(w, defaultStatus) {
  const statusMap = {
    'pending_mechanic_work': 'ACTIVE',
    'pending_supervisor': 'PENDING_L1',
    'pending_superintendent': 'PENDING_L2',
    'approved': 'APPROVED',
    'rejected': 'REJECTED'
  };
  const st = statusMap[w.status] || defaultStatus;

  const teamList = [];
  if (Array.isArray(w.team_names) && w.team_names.length > 0) {
    w.team_names.forEach(name => {
      teamList.push({ name: String(name).trim(), mechanic_id: '', points: Number(w.final_points || w.base_points || 0), idr: 0 });
    });
  } else if (Array.isArray(w.team) && w.team.length > 0) {
    w.team.forEach(t => {
      teamList.push({
        name: String(t.name || t.mechanic_name || (t.mechanic_id ? `Mekanik ${t.mechanic_id}` : 'Mekanik')).trim(),
        mechanic_id: t.mechanic_id || '',
        points: Number(t.points || w.final_points || 0),
        idr: Number(t.idr || 0)
      });
    });
  } else if (w.created_by_name) {
    teamList.push({ name: String(w.created_by_name).trim(), mechanic_id: '', points: Number(w.final_points || 0), idr: 0 });
  }

  return {
    id: w.wo_number || w.id,
    raw_id: w.id,
    date: (w.created_at_str && String(w.created_at_str).trim()) || (w.created_at ? new Date(w.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'),
    final_idr: Number(w.final_idr || 0),
    rejection_reason: w.rejection_reason || '',
    rejected_by_name: w.rejected_by_name || '',
    shift: w.work_condition === 'difficult' ? 'Shift 2' : 'Shift 1',
    unit_id: w.unit_id || '-',
    unit_name: w.unit_name || w.unit_id || '-',
    component_no: w.component_no || w.job_id || '-',
    component_name: w.component_name || w.others_description || 'Pekerjaan',
    section: w.section || 'vessel',
    location: w.location || 'workshop',
    work_condition: w.work_condition || 'normal',
    keterangan: w.keterangan || '',
    base_points: Number(w.base_points || 0),
    unit_factor: Number(w.unit_factor || 1),
    actual_hours: Number(w.actual_hours || 0),
    target_hours: Number(w.target_hours || 0),
    final_points: Number(w.final_points || w.base_points || 0),
    team: teamList,
    status: st,
    judgment: w.judgment || '',
    created_by: w.created_by_name || w.created_by || 'Mekanik',
    created_at: w.created_at || new Date().toISOString()
  };
}

// =========================================================================
// AUTHENTICATION & TOKEN RESOLVER
// =========================================================================
function checkAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  const tokenFromStorage = localStorage.getItem('kmb_portal_token');

  const tokenToUse = tokenFromUrl || tokenFromStorage;

  if (tokenToUse) {
    loginWithToken(tokenToUse);
  } else {
    showGateOverlay();
  }
}

export async function loginWithToken(token) {
  const cleanToken = String(token).trim();

  // 1. First resolve from local TOKENS / state for instant UI rendering
  const tokenRecord = TOKENS.find(t => t.token.toLowerCase() === cleanToken.toLowerCase());
  let user = null;
  if (tokenRecord) {
    user = state.mechanics.find(m => (m.id || m.mechanic_id) === tokenRecord.mechanic_id);
  } else {
    user = state.mechanics.find(m => (m.id || m.mechanic_id).toLowerCase() === cleanToken.toLowerCase());
  }

  // Fallback temporary user
  if (!user) {
    user = {
      id: cleanToken,
      mechanic_id: cleanToken,
      name: 'User KMB',
      role: cleanToken === '52fdb552231348ffb14a' ? 'supervisor' : 'mechanic'
    };
  }

  state.currentUser = user;
  state.activeToken = cleanToken;
  localStorage.setItem('kmb_portal_token', cleanToken);

  const url = new URL(window.location);
  url.searchParams.set('token', cleanToken);
  window.history.replaceState({}, '', url);

  updateUserBar();
  hideGateOverlay();
  renderDashboard();
  renderApprovals();
  renderMonitoring();

  // Reset initial joblist user
  if (state.joblists.length > 0 && (!state.joblists[0].team || !state.joblists[0].team[0])) {
    state.joblists[0].team = [user.id || user.mechanic_id];
    renderJoblists();
  }

  // 2. Now verify against Google Apps Script / Google Sheets
  api('ping').then(res => {
    if (res.success && res.result) {
      const info = res.result;
      state.currentUser = {
        id: info.mechanic_id,
        mechanic_id: info.mechanic_id,
        name: info.name,
        mechanic_name: info.name,
        role: info.role || 'mechanic',
        email: info.email
      };
      updateUserBar();
      showToast(`Terhubung sebagai ${info.name} (${(info.role || 'user').toUpperCase()}) via Google Sheets!`, 'success');
    }
  });

  // Pull latest spreadsheet data in background
  syncFromSpreadsheet(false);
  return true;
}

function updateUserBar() {
  const u = state.currentUser;
  if (!u) return;

  const displayName = u.name || u.mechanic_name || 'Mekanik';
  document.getElementById('profile-name').textContent = displayName;
  
  const roleBadge = document.getElementById('profile-role');
  const roleName = (u.role || 'mechanic').toLowerCase();
  roleBadge.textContent = roleName.toUpperCase();
  roleBadge.className = `user-role-badge role-${roleName}`;

  document.getElementById('user-profile-bar').style.display = 'flex';
  document.getElementById('portal-nav').style.display = 'block';

  const isSupervisor = roleName === 'supervisor' || roleName === 'superintendent' || u.id === 'SPV-001';
  document.getElementById('nav-tab-approvals').style.display = isSupervisor ? 'flex' : 'none';
}

function showGateOverlay() {
  document.getElementById('gate-overlay').style.display = 'flex';
  document.getElementById('gate-error-msg').style.display = 'none';
}

function hideGateOverlay() {
  document.getElementById('gate-overlay').style.display = 'none';
}

function showGateError(msg) {
  const el = document.getElementById('gate-error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  localStorage.removeItem('kmb_portal_token');
  const url = new URL(window.location);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url);

  state.currentUser = null;
  state.activeToken = null;
  document.getElementById('user-profile-bar').style.display = 'none';
  document.getElementById('portal-nav').style.display = 'none';
  showGateOverlay();
  showToast('Anda telah keluar dari sesi.', 'info');
}

// =========================================================================
// STORAGE & SEED DATA
// =========================================================================
function initStorage() {
  const storedWos = localStorage.getItem('kmb_work_orders');
  if (storedWos) {
    try {
      state.workOrders = JSON.parse(storedWos);
    } catch (e) {
      state.workOrders = [];
    }
  }
}

function saveWorkOrders() {
  localStorage.setItem('kmb_work_orders', JSON.stringify(state.workOrders));
}

// =========================================================================
// 1:1 CREATE WORK ORDER ARCHITECTURE & CASCADES
// =========================================================================
function createDefaultJoblist() {
  return {
    section: 'rekondisi', // rekondisi | maintenance
    keterangan: '',
    others: false,
    othersDesc: '',
    othersBase: '',
    othersTarget: '',
    othersFactor: '1.0',
    unitId: '',
    component: '',
    subComponent: '',
    jobId: '',
    location: 'field',
    condition: '',
    team: [state.currentUser ? (state.currentUser.id || state.currentUser.mechanic_id) : ''],
    allMechanics: false
  };
}

function initCreateWoState() {
  state.joblists = [createDefaultJoblist()];
  renderJoblists();
  setupModelPembuatanHandlers();
}

function setupModelPembuatanHandlers() {
  const btnBebas = document.getElementById('btn-mode-bebas');
  const btnUnit = document.getElementById('btn-mode-unit');
  const btnJob = document.getElementById('btn-mode-job');
  const hintText = document.getElementById('mode-petunjuk-text');
  const btnToggleUnits = document.getElementById('btn-toggle-all-units');

  function setMode(mode) {
    state.grupMode = mode;
    btnBebas.classList.toggle('terpilih', mode === '');
    btnUnit.classList.toggle('terpilih', mode === 'unit');
    btnJob.classList.toggle('terpilih', mode === 'job');

    if (mode === 'unit') {
      hintText.textContent = 'Satu unit dikerjakan beberapa job. Unit joblist #1 jadi acuan dan dikunci untuk semua joblist; job tiap baris harus berbeda.';
      if (state.joblists.length > 1) {
        const u1 = state.joblists[0].unitId;
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].unitId = u1;
        }
      }
    } else if (mode === 'job') {
      hintText.textContent = 'Satu job dikerjakan di beberapa unit. Job joblist #1 jadi acuan dan dikunci untuk semua joblist; unit tiap baris harus berbeda.';
      if (state.joblists.length > 1) {
        const a = state.joblists[0];
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].component = a.component;
          state.joblists[i].subComponent = a.subComponent;
          state.joblists[i].jobId = a.jobId;
        }
      }
    } else {
      hintText.textContent = 'Bebas: setiap joblist boleh unit dan job berbeda, terbit sebagai WO terpisah tanpa ikatan grup.';
    }
    renderJoblists();
  }

  btnBebas.addEventListener('click', () => setMode(''));
  btnUnit.addEventListener('click', () => setMode('unit'));
  btnJob.addEventListener('click', () => setMode('job'));

  btnToggleUnits.addEventListener('click', () => {
    state.tampilSemuaUnit = !state.tampilSemuaUnit;
    const lbl = document.getElementById('label-toggle-all-units');
    lbl.textContent = state.tampilSemuaUnit ? '🔽 Sembunyikan unit global' : '🌐 Tampilkan semua unit';
    renderJoblists();
  });

  document.getElementById('btn-add-joblist').addEventListener('click', () => {
    const newBlock = createDefaultJoblist();
    const acuan = state.joblists[0];
    newBlock.section = acuan.section;
    newBlock.location = acuan.location;
    newBlock.condition = acuan.condition;

    if (state.grupMode === 'unit') {
      newBlock.unitId = acuan.unitId;
    } else if (state.grupMode === 'job') {
      newBlock.component = acuan.component;
      newBlock.subComponent = acuan.subComponent;
      newBlock.jobId = acuan.jobId;
    }

    state.joblists.push(newBlock);
    renderJoblists();
  });

  document.getElementById('btn-submit-all-wos').addEventListener('click', submitAllWorkOrders);
}

// Filter unit list per section using Spreadsheet units
function getAvailableUnits(section, showAll) {
  if (showAll) return state.units;
  const sec = (section || '').toLowerCase();
  if (sec === 'rekondisi') {
    return state.units.filter(u => {
      const scope = (u.unit_scope || '').toLowerCase();
      const model = (u.unit_model || '').toLowerCase();
      return scope.includes('vessel') || model.includes('vessel') || model.includes('dolly') || (!scope && !model);
    });
  } else {
    return state.units.filter(u => {
      const scope = (u.unit_scope || '').toLowerCase();
      const model = (u.unit_model || '').toLowerCase();
      return scope.includes('maintenance') || model.includes('hauler') || model.includes('engine') || model.includes('transmission');
    });
  }
}

// Distinct components available
function getAvailableComponents(unitId, section) {
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  const targetSection = isRekondisi ? 'rekondisi' : 'maintenance';
  
  let jobs = state.components.filter(j => j.section === targetSection);
  const unit = state.units.find(u => (u.unit_id || u.id) === unitId);
  if (unit && unit.unit_model) {
    const cleanModel = unit.unit_model.trim().toLowerCase();
    const filtered = jobs.filter(j => (j.unit_model || '').trim().toLowerCase() === cleanModel);
    if (filtered.length > 0) jobs = filtered;
  }
  const comps = [...new Set(jobs.map(j => j.component).filter(Boolean))].sort();
  return comps;
}

// Distinct sub components available
function getAvailableSubComponents(componentName, section) {
  if (!componentName) return [];
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  const targetSection = isRekondisi ? 'rekondisi' : 'maintenance';
  const filtered = state.components.filter(j => j.section === targetSection && j.component === componentName);
  return [...new Set(filtered.map(j => j.sub_component).filter(Boolean))].sort();
}

// Distinct jobs available
function getAvailableJobs(componentName, subComponentName, section) {
  if (!componentName) return [];
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  const targetSection = isRekondisi ? 'rekondisi' : 'maintenance';
  return state.components.filter(j => {
    if (j.section !== targetSection) return false;
    if (subComponentName) {
      return j.component === componentName && j.sub_component === subComponentName;
    }
    return j.component === componentName;
  });
}

// RENDER ALL JOBLIST CARDS
function renderJoblists() {
  const container = document.getElementById('joblists-container');
  if (!container) return;

  container.innerHTML = '';

  state.joblists.forEach((b, index) => {
    const card = document.createElement('div');
    card.className = 'wo-blok';
    card.id = `wo-blok-${index}`;

    const isLockedUnit = state.grupMode === 'unit' && index > 0;
    const isLockedJob = state.grupMode === 'job' && index > 0;
    const totalBlocks = state.joblists.length;

    // Header
    const head = `
      <div class="wo-blok-kepala">
        <span class="wo-blok-judul">Joblist #${index + 1}</span>
        ${totalBlocks > 1 ? `<button type="button" class="wo-blok-hapus" title="Hapus joblist" data-idx="${index}">×</button>` : ''}
      </div>
    `;

    // Section *
    const secHtml = `
      <div class="form-group">
        <label class="form-label">Section <span class="wajib">*</span></label>
        <div class="pilihan-grid-sec">
          <button type="button" class="sec-pill ${b.section === 'rekondisi' ? 'terpilih' : ''}" data-idx="${index}" data-sec="rekondisi">
            🚜 Rekondisi
          </button>
          <button type="button" class="sec-pill ${b.section === 'maintenance' ? 'terpilih' : ''}" data-idx="${index}" data-sec="maintenance">
            🚛 Maintenance
          </button>
        </div>
      </div>
    `;

    // Keterangan
    const ketHtml = `
      <div class="form-group">
        <label class="form-label">
          Keterangan untuk Mekanik <span class="form-hint-inline">(opsional)</span>
        </label>
        <textarea class="form-control field-keterangan" data-idx="${index}" rows="2" placeholder="cth: unit parkir di pit 3, koordinasi dgn operator dulu">${b.keterangan || ''}</textarea>
      </div>
    `;

    // Others Checkbox
    const othersCheckHtml = `
      <label class="others-baris">
        <input type="checkbox" class="field-others-toggle" data-idx="${index}" ${b.others ? 'checked' : ''}>
        <span>📝 Job manual (Others) — di luar katalog</span>
      </label>
    `;

    // Others Fields
    const othersFieldsHtml = `
      <div class="others-fields-box" id="others-box-${index}" style="${b.others ? 'display:block;' : 'display:none;'} margin-bottom: 16px;">
        <div class="form-group">
          <label class="form-label">Job Description <span class="wajib">*</span></label>
          <input type="text" class="form-control field-others-desc" data-idx="${index}" value="${b.othersDesc || ''}" placeholder="e.g. Bersih gudang, Training mekanik">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Base Points <span class="wajib">*</span></label>
            <input type="number" step="0.1" min="0.1" class="form-control field-others-base" data-idx="${index}" value="${b.othersBase || ''}" placeholder="e.g. 3.0">
          </div>
          <div class="form-group">
            <label class="form-label">Target Hours <span class="wajib">*</span></label>
            <input type="number" step="0.1" min="0.1" class="form-control field-others-target" data-idx="${index}" value="${b.othersTarget || ''}" placeholder="e.g. 4.0">
          </div>
        </div>
        <div class="form-group" style="max-width: 280px;">
          <label class="form-label">Unit Factor <span class="wajib">*</span></label>
          <input type="number" step="0.01" min="0.1" class="form-control field-others-factor" data-idx="${index}" value="${b.othersFactor || '1.0'}" placeholder="e.g. 1.0">
          <p class="form-hint" style="margin-top: 4px; font-size: 11px; color: #6B7280;">Pengali kesulitan (mis. 1.0 standar, 1.2 kompleks)</p>
        </div>
      </div>
    `;

    // Catalog Cascades
    const availableUnits = getAvailableUnits(b.section, state.tampilSemuaUnit);
    let unitOptions = '<option value="">-- Pilih Unit --</option>';
    availableUnits.forEach(u => {
      const uId = u.unit_id || u.id;
      const uName = u.unit_name || u.name;
      const uModel = u.unit_model ? ` · ${u.unit_model.toUpperCase()}` : '';
      const sel = String(uId) === String(b.unitId) ? 'selected' : '';
      unitOptions += `<option value="${uId}" ${sel}>${uName}${uModel}</option>`;
    });

    const availableComps = getAvailableComponents(b.unitId, b.section);
    let compOptions = '<option value="">-- Component --</option>';
    availableComps.forEach(c => {
      const sel = c === b.component ? 'selected' : '';
      compOptions += `<option value="${c}" ${sel}>${c}</option>`;
    });

    const availableSubs = getAvailableSubComponents(b.component, b.section);
    let subOptions = '<option value="">-- Sub Component --</option>';
    availableSubs.forEach(s => {
      const sel = s === b.subComponent ? 'selected' : '';
      subOptions += `<option value="${s}" ${sel}>${s}</option>`;
    });

    const availableJobs = getAvailableJobs(b.component, b.subComponent, b.section);
    let jobOptions = '<option value="">-- Job --</option>';
    availableJobs.forEach(j => {
      const jId = j.job_id || j.id;
      const jDesc = j.job_description;
      const jHours = j.plan_hours ? `${j.plan_hours} jam` : '';
      const jPts = j.base_point ? ` · ${j.base_point} pts` : '';
      const label = `${jDesc} (${jHours}${jPts})`;
      const sel = String(jId) === String(b.jobId) ? 'selected' : '';
      jobOptions += `<option value="${jId}" ${sel}>${label}</option>`;
    });

    const catalogHtml = `
      <div class="catalog-cascade-box" id="catalog-box-${index}" style="${b.others ? 'display:none;' : 'display:block;'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit <span class="wajib">*</span></label>
            <select class="form-control field-unit" data-idx="${index}" ${isLockedUnit ? 'disabled' : ''}>
              ${unitOptions}
            </select>
            ${isLockedUnit ? '<p class="tanda-kunci">🔒 Unit dikunci oleh grup — hapus joblist lain untuk mengubah</p>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Component <span class="wajib">*</span></label>
            <select class="form-control field-component" data-idx="${index}" ${isLockedJob ? 'disabled' : ''}>
              ${compOptions}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sub Component <span class="wajib">*</span></label>
            <select class="form-control field-sub-comp" data-idx="${index}" ${isLockedJob ? 'disabled' : ''}>
              ${subOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Job <span class="wajib">*</span></label>
            <select class="form-control field-job" data-idx="${index}" ${isLockedJob ? 'disabled' : ''}>
              ${jobOptions}
            </select>
            ${isLockedJob ? '<p class="tanda-kunci">🔒 Job dikunci oleh grup — hapus joblist lain untuk mengubah</p>' : ''}
          </div>
        </div>
      </div>
    `;

    // Location & Work Condition
    const locWcHtml = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">📍 Location <span class="wajib">*</span></label>
          <div class="location-grid">
            <button type="button" class="loc-pilihan ${b.location === 'workshop' ? 'terpilih' : ''}" data-idx="${index}" data-loc="workshop">
              🏭 Workshop
              <span class="sub">Di dalam bengkel</span>
            </button>
            <button type="button" class="loc-pilihan ${b.location === 'field' ? 'terpilih' : ''}" data-idx="${index}" data-loc="field">
              🚜 Field
              <span class="sub">Di lokasi lapangan</span>
            </button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Work Condition <span class="wajib">*</span></label>
          <select class="form-control field-condition" data-idx="${index}">
            <option value="">-- Select Work Condition --</option>
            <option value="normal" ${b.condition === 'normal' ? 'selected' : ''}>Normal (×1.0)</option>
            <option value="difficult" ${b.condition === 'difficult' ? 'selected' : ''}>Difficult (×1.1)</option>
            <option value="extreme" ${b.condition === 'extreme' ? 'selected' : ''}>Extreme (×1.2)</option>
          </select>
        </div>
      </div>
    `;

    // Preview Calculation
    const calc = computeBlockPreviewData(b);
    const prevHtml = `
      <div class="pratinjau">
        <div class="pratinjau-judul">Preview</div>
        <div class="pratinjau-kisi">
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Base Points:</span>
            <span class="pratinjau-nilai">${calc.basePointsStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Target Hours:</span>
            <span class="pratinjau-nilai ${calc.targetHoursStr === '-' ? 'inactive' : ''}">${calc.targetHoursStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Unit Factor:</span>
            <span class="pratinjau-nilai ${calc.unitFactorStr === '-' ? 'inactive' : ''}">${calc.unitFactorStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Work Condition:</span>
            <span class="pratinjau-nilai ${calc.workConditionStr === '-' ? 'inactive' : ''}">${calc.workConditionStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Estimated Points:</span>
            <span class="pratinjau-nilai ${calc.estimatedPointsStr === '-' ? 'inactive' : ''}">${calc.estimatedPointsStr}</span>
          </div>
        </div>
      </div>
    `;

    // Team Composition
    let teamRows = '';
    (b.team || ['']).forEach((mId, mIdx) => {
      let mechOptions = '<option value="">-- Select Mechanic --</option>';
      const availableMechs = getAvailableMechanics(b.section, b.allMechanics);
      availableMechs.forEach(m => {
        const id = m.id || m.mechanic_id;
        const name = m.name || m.mechanic_name;
        const pos = m.position || '';
        const sel = String(id) === String(mId) ? 'selected' : '';
        mechOptions += `<option value="${id}" ${sel}>${name}${pos ? ` (${pos})` : ''}</option>`;
      });

      teamRows += `
        <div class="team-member-row-exact">
          <select class="form-control field-team-select" data-bidx="${index}" data-midx="${mIdx}">
            ${mechOptions}
          </select>
          <button type="button" class="btn-del-member" data-bidx="${index}" data-midx="${mIdx}" title="Hapus mekanik">✕</button>
        </div>
      `;
    });

    const teamHtml = `
      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label">
          Team Composition <span class="wajib">*</span>
          <span class="form-hint-inline">(tiap mekanik dapat poin penuh)</span>
        </label>
        <div class="team-members-list">
          ${teamRows}
        </div>
        <div style="display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap;">
          <button type="button" class="btn-add-team-member" data-idx="${index}">+ Add Team Member</button>
          <label class="saklar-kecil">
            <input type="checkbox" class="field-all-mechs-check" data-idx="${index}" ${b.allMechanics ? 'checked' : ''}>
            <span>🔓 Tampilkan mekanik semua section</span>
          </label>
        </div>
      </div>
    `;

    card.innerHTML = head + secHtml + ketHtml + othersCheckHtml + othersFieldsHtml + catalogHtml + locWcHtml + prevHtml + teamHtml;
    container.appendChild(card);
  });

  attachBlockEventListeners();
}

function getAvailableMechanics(section, showAll) {
  if (showAll) return state.mechanics;
  const sec = (section || '').toLowerCase();
  const gasSec = sec === 'rekondisi' ? 'vessel' : 'maintenance';
  return state.mechanics.filter(m => {
    const s = (m.section || '').toLowerCase();
    if (!s) return true;
    return s.includes(gasSec);
  });
}

function computeBlockPreviewData(b) {
  let base = 0;
  let target = 0;
  let uf = 1.0;
  let ufStr = '-';
  let targetStr = '-';
  let wcStr = '-';
  let estStr = '-';

  if (b.others) {
    base = parseFloat(b.othersBase) || 0;
    target = parseFloat(b.othersTarget) || 0;
    uf = parseFloat(b.othersFactor) || 1.0;
    ufStr = uf > 0 ? `${uf.toFixed(2)}x (Manual)` : '-';
    targetStr = target > 0 ? `${target.toFixed(1)} jam` : '-';
  } else {
    const job = state.components.find(j => (j.job_id || j.id) === b.jobId);
    if (job) {
      base = parseFloat(job.base_point) || parseFloat(job.base_points) || 0;
      target = parseFloat(job.plan_hours) || parseFloat(job.target_hours) || 0;
      targetStr = target > 0 ? `${target.toFixed(1)} jam` : '-';
    }
    const unit = state.units.find(u => (u.unit_id || u.id) === b.unitId);
    if (unit) {
      uf = parseFloat(unit.unit_factor) || 1.0;
      ufStr = `${uf.toFixed(2)}x`;
    }
  }

  let wcFactor = null;
  if (b.condition === 'normal') {
    wcFactor = 1.0;
    wcStr = 'Normal (1.00x)';
  } else if (b.condition === 'difficult') {
    wcFactor = 1.1;
    wcStr = 'Difficult (1.10x)';
  } else if (b.condition === 'extreme') {
    wcFactor = 1.2;
    wcStr = 'Extreme (1.20x)';
  }

  if (base > 0 && wcFactor !== null && uf > 0) {
    const est = base * uf * wcFactor;
    estStr = `${est.toFixed(2)} points`;
  }

  return {
    basePointsStr: base > 0 ? base.toFixed(2) : '0.00',
    targetHoursStr: targetStr,
    unitFactorStr: ufStr,
    workConditionStr: wcStr,
    estimatedPointsStr: estStr
  };
}

function attachBlockEventListeners() {
  document.querySelectorAll('.wo-blok-hapus').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (state.joblists.length > 1) {
        state.joblists.splice(idx, 1);
        renderJoblists();
      }
    };
  });

  document.querySelectorAll('.sec-pill').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const sec = btn.dataset.sec;
      state.joblists[idx].section = sec;
      state.joblists[idx].unitId = '';
      state.joblists[idx].component = '';
      state.joblists[idx].subComponent = '';
      state.joblists[idx].jobId = '';
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-keterangan').forEach(txt => {
    txt.oninput = () => {
      const idx = parseInt(txt.dataset.idx, 10);
      state.joblists[idx].keterangan = txt.value;
    };
  });

  document.querySelectorAll('.field-others-toggle').forEach(chk => {
    chk.onchange = () => {
      const idx = parseInt(chk.dataset.idx, 10);
      state.joblists[idx].others = chk.checked;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-others-desc').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersDesc = inp.value;
    };
  });
  document.querySelectorAll('.field-others-base').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersBase = inp.value;
      renderJoblists();
    };
  });
  document.querySelectorAll('.field-others-target').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersTarget = inp.value;
      renderJoblists();
    };
  });
  document.querySelectorAll('.field-others-factor').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersFactor = inp.value;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-unit').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].unitId = sel.value;
      state.joblists[idx].component = '';
      state.joblists[idx].subComponent = '';
      state.joblists[idx].jobId = '';

      if (state.grupMode === 'unit' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].unitId = sel.value;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-component').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].component = sel.value;
      state.joblists[idx].subComponent = '';
      state.joblists[idx].jobId = '';

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].component = sel.value;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-sub-comp').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].subComponent = sel.value;
      state.joblists[idx].jobId = '';

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].subComponent = sel.value;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-job').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].jobId = sel.value;

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].jobId = sel.value;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.loc-pilihan').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      state.joblists[idx].location = btn.dataset.loc;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-condition').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].condition = sel.value;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-team-select').forEach(sel => {
    sel.onchange = () => {
      const bidx = parseInt(sel.dataset.bidx, 10);
      const midx = parseInt(sel.dataset.midx, 10);
      state.joblists[bidx].team[midx] = sel.value;
    };
  });

  document.querySelectorAll('.btn-del-member').forEach(btn => {
    btn.onclick = () => {
      const bidx = parseInt(btn.dataset.bidx, 10);
      const midx = parseInt(btn.dataset.midx, 10);
      if (state.joblists[bidx].team.length > 1) {
        state.joblists[bidx].team.splice(midx, 1);
        renderJoblists();
      } else {
        showToast('Minimal harus ada 1 mekanik dalam tim!', 'warning');
      }
    };
  });

  document.querySelectorAll('.btn-add-team-member').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      state.joblists[idx].team.push('');
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-all-mechs-check').forEach(chk => {
    chk.onchange = () => {
      const idx = parseInt(chk.dataset.idx, 10);
      state.joblists[idx].allMechanics = chk.checked;
      renderJoblists();
    };
  });
}

// SUBMIT ALL WORK ORDERS TO GOOGLE SPREADSHEET
async function submitAllWorkOrders() {
  for (let i = 0; i < state.joblists.length; i++) {
    const b = state.joblists[i];
    const n = i + 1;

    if (!b.condition) {
      showToast(`Joblist #${n}: Harap pilih Work Condition!`, 'warning');
      return;
    }

    if (b.others) {
      if (!b.othersDesc.trim()) {
        showToast(`Joblist #${n}: Harap isi Job Description manual!`, 'warning');
        return;
      }
      if (!(parseFloat(b.othersBase) > 0)) {
        showToast(`Joblist #${n}: Base points harus lebih besar dari 0!`, 'warning');
        return;
      }
    } else {
      if (!b.unitId) {
        showToast(`Joblist #${n}: Harap pilih Unit!`, 'warning');
        return;
      }
      if (!b.jobId) {
        showToast(`Joblist #${n}: Harap pilih Job!`, 'warning');
        return;
      }
    }

    const validTeam = (b.team || []).filter(Boolean);
    if (validTeam.length === 0) {
      showToast(`Joblist #${n}: Harap pilih minimal 1 mekanik!`, 'warning');
      return;
    }
  }

  const btnSubmit = document.getElementById('btn-submit-all-wos');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Spreadsheet...';

  const results = [];
  for (let i = 0; i < state.joblists.length; i++) {
    const b = state.joblists[i];
    const op_id = `op-${Date.now()}-${i + 1}`;
    const isRekondisi = b.section === 'rekondisi';
    const sectionGas = isRekondisi ? 'vessel' : 'maintenance';

    const payload = {
      section: sectionGas,
      work_condition: b.condition || 'normal',
      location: b.location || 'workshop',
      keterangan: b.keterangan || '',
      team: (b.team || []).filter(Boolean).map(mId => ({ mechanic_id: mId }))
    };

    if (b.others) {
      payload.component_id = 'COM-OTHERS';
      payload.others_description = b.othersDesc.trim();
      payload.others_base_points = parseFloat(b.othersBase) || 0;
      payload.others_target_hours = parseFloat(b.othersTarget) || 0;
      payload.others_unit_factor = parseFloat(b.othersFactor) || 1.0;
    } else {
      payload.unit_id = b.unitId;
      payload.component_id = b.jobId;
      payload.job_id = b.jobId;
    }

    const res = await api('create_wo', payload, op_id);
    results.push(res);
  }

  btnSubmit.disabled = false;
  btnSubmit.textContent = 'Create Work Order';

  const succeeded = results.filter(r => r && r.success);
  if (succeeded.length > 0) {
    const woIds = succeeded.map(s => s.result?.wo_id || 'WO').join(', ');
    showToast(`✅ Berhasil disimpan di Google Spreadsheet: ${woIds}!`, 'success');
    initCreateWoState();
    // Refresh active WOs from Google Sheets
    await syncFromSpreadsheet(false);
    switchTab('dashboard');
  } else {
    const err = results[0]?.error || 'Gagal menyimpan ke Google Spreadsheet';
    showToast(`❌ Gagal: ${err}`, 'danger');
  }
}

// =========================================================================
// DASHBOARD & MONITORING RENDERING
// =========================================================================
function updateDateString() {
  try {
    const d = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const el = document.getElementById('dashboard-date-str');
    if (el) el.textContent = d.toLocaleDateString('id-ID', options);
  } catch(e) {}
}

function renderDashboard() {
  updateDateString();

  const overall = state.monitoringData?.overall || DEFAULT_MONITORING_OVERALL;

  const totalWoCount = (overall.pending_mechanic_work || 7) + (overall.pending_l1 || 3) + (overall.pending_l2 || 21) + (overall.approved || 13);
  const approvedWoCount = overall.approved || 13;
  const pendingWoCount = (overall.pending_mechanic_work || 7) + (overall.pending_l1 || 3) + (overall.pending_l2 || 21);

  let totalApprovedPts = 0;
  let totalApprovedIdr = 0;
  if (Array.isArray(state.approvedWos) && state.approvedWos.length > 0) {
    state.approvedWos.forEach(w => {
      totalApprovedPts += Number(w.final_points) || 0;
      totalApprovedIdr += Number(w.final_idr) || 0;
    });
  } else {
    totalApprovedPts = overall.total_poin || 20.20;
    totalApprovedIdr = 52520;
  }

  const statTotalEl = document.getElementById('stat-total-wo');
  if (statTotalEl) statTotalEl.textContent = totalWoCount;
  const statApprEl = document.getElementById('stat-approved-wo');
  if (statApprEl) statApprEl.textContent = approvedWoCount;
  const statPendEl = document.getElementById('stat-pending-wo');
  if (statPendEl) statPendEl.textContent = pendingWoCount;
  const statPtsEl = document.getElementById('stat-total-points');
  if (statPtsEl) statPtsEl.textContent = totalApprovedPts.toFixed(2);
  const statIncEl = document.getElementById('stat-incentive-preview');
  if (statIncEl) statIncEl.textContent = `Live Sheets: Rp ${totalApprovedIdr.toLocaleString('id-ID')}`;

  const periodeEl = document.getElementById('dashboard-periode-str');
  if (periodeEl) {
    periodeEl.textContent = `📅 Periode: ${overall.periode || '26 Okt – 25 Nov 2026'} (Live Google Sheets)`;
  }

  const tbody = document.getElementById('dashboard-recent-wo-body');
  if (!tbody) return;

  const search = (document.getElementById('quick-search-wo')?.value || '').toLowerCase();
  const wos = state.workOrders.filter(w => {
    if (!search) return true;
    const txt = `${w.id} ${w.component_name} ${w.unit_name} ${w.status}`.toLowerCase();
    return txt.includes(search);
  });

  if (wos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);"><i class="fa-solid fa-inbox" style="font-size:24px; margin-bottom:8px; display:block;"></i>Tekan tombol <strong>Sync Sheets</strong> untuk mengambil transaksi terbaru.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  wos.slice(0, 10).forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.id}</strong></td>
      <td>${w.component_name}</td>
      <td>${w.team?.map(t => t.name).join(', ') || '-'}</td>
      <td><span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span></td>
      <td>${w.judgment || '-'}</td>
      <td>${w.created_by || 'Mekanik'}</td>
      <td>${w.date}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMonitoring() {
  const overall = state.monitoringData?.overall || DEFAULT_MONITORING_OVERALL;

  const kpiWork = document.getElementById('mon-kpi-work');
  if (kpiWork) kpiWork.textContent = overall.pending_mechanic_work || 7;
  const kpiL1 = document.getElementById('mon-kpi-l1');
  if (kpiL1) kpiL1.textContent = overall.pending_l1 || 3;
  const kpiL2 = document.getElementById('mon-kpi-l2');
  if (kpiL2) kpiL2.textContent = overall.pending_l2 || 21;
  const kpiAppr = document.getElementById('mon-kpi-approved');
  if (kpiAppr) kpiAppr.textContent = overall.approved || 13;

  const periodeEl = document.getElementById('monitoring-periode-str');
  if (periodeEl) {
    periodeEl.textContent = `Periode: ${overall.periode || '26 Okt – 25 Nov 2026'} (Live Google Sheets)`;
  }

  const countMech = document.getElementById('mon-count-mechanics');
  if (countMech) countMech.textContent = (state.monitoringData?.mechanics || DEFAULT_MECHANICS_LIST).length;

  const countWos = document.getElementById('mon-count-all-wos');
  if (countWos) countWos.textContent = state.workOrders.length || 58;

  const btnMech = document.getElementById('mon-subtab-mechanics-btn');
  const btnWos = document.getElementById('mon-subtab-wos-btn');
  const subviewMech = document.getElementById('mon-subview-mechanics');
  const subviewWos = document.getElementById('mon-subview-all-wos');

  if (state.monSubTab === 'mechanics') {
    btnMech?.classList.add('active-subtab');
    btnWos?.classList.remove('active-subtab');
    if (subviewMech) subviewMech.style.display = 'block';
    if (subviewWos) subviewWos.style.display = 'none';

    renderMechanicsMonitoringTable();
  } else {
    btnMech?.classList.remove('active-subtab');
    btnWos?.classList.add('active-subtab');
    if (subviewMech) subviewMech.style.display = 'none';
    if (subviewWos) subviewWos.style.display = 'block';

    renderAllWosMonitoringTable();
  }
}

function renderMechanicsMonitoringTable() {
  const tbody = document.getElementById('mon-mechanics-table-body');
  if (!tbody) return;

  const search = (document.getElementById('search-monitoring')?.value || '').toLowerCase();
  const sectionFilter = (document.getElementById('filter-monitoring-section')?.value || '').toLowerCase();

  const mechs = (state.monitoringData?.mechanics && state.monitoringData.mechanics.length > 0)
    ? state.monitoringData.mechanics
    : DEFAULT_MECHANICS_LIST;

  const filtered = mechs.filter(m => {
    if (sectionFilter && (m.section || '').toLowerCase() !== sectionFilter) return false;
    if (!search) return true;
    const txt = `${m.id} ${m.name} ${m.section}`.toLowerCase();
    return txt.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">Tidak ada data mekanik ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach((m, idx) => {
    const tr = document.createElement('tr');
    const isVessel = (m.section || '').toLowerCase() === 'vessel';
    const sectionBadge = isVessel
      ? '<span class="status-badge" style="background:#DBEAFE; color:#1E40AF; font-size:11px;">VESSEL</span>'
      : '<span class="status-badge" style="background:#D1FAE5; color:#065F46; font-size:11px;">MAINTENANCE</span>';

    const workBadge = m.pending_mechanic_work > 0
      ? `<span class="status-badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">${m.pending_mechanic_work}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const l1Badge = m.pending_l1 > 0
      ? `<span class="status-badge" style="background:#E0E7FF; color:#3730A3; font-weight:700;">${m.pending_l1}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const l2Badge = m.pending_l2 > 0
      ? `<span class="status-badge" style="background:#FCE7F3; color:#9D174D; font-weight:700;">${m.pending_l2}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const approvedBadge = m.approved > 0
      ? `<span class="status-badge" style="background:#DCFCE7; color:#166534; font-weight:700;">${m.approved}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    tr.innerHTML = `
      <td style="text-align: center; color: var(--text-dim);">${idx + 1}</td>
      <td><span class="status-badge" style="background:#F3F4F6; color:#1F2937; font-family:monospace; font-weight:600;">${m.id}</span></td>
      <td><strong>${m.name}</strong></td>
      <td>${sectionBadge}</td>
      <td style="text-align: center;">${workBadge}</td>
      <td style="text-align: center;">${l1Badge}</td>
      <td style="text-align: center;">${l2Badge}</td>
      <td style="text-align: center;">${approvedBadge}</td>
      <td>
        <div class="token-copy-box">
          <input type="text" class="token-copy-input" readonly value="${m.token || ''}" id="tok-${m.id}">
          <button class="btn-copy-token" id="btn-copy-${m.id}" onclick="window.copyMechanicToken('${m.token}', 'btn-copy-${m.id}')" title="Salin Link Akses">
            <i class="fa-regular fa-copy"></i> Salin
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAllWosMonitoringTable() {
  const tbody = document.getElementById('mon-all-wos-table-body');
  if (!tbody) return;

  const search = (document.getElementById('search-monitoring')?.value || '').toLowerCase();
  const sectionFilter = (document.getElementById('filter-monitoring-section')?.value || '').toLowerCase();

  const filtered = state.workOrders.filter(w => {
    if (sectionFilter && (w.section || '').toLowerCase() !== sectionFilter) return false;
    if (!search) return true;
    const teamNames = w.team?.map(t => t.name).join(' ') || '';
    const text = `${w.id} ${w.unit_name} ${w.component_name} ${teamNames} ${w.status}`.toLowerCase();
    return text.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-dim); padding:30px;">Tidak ada work order ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.id}</strong></td>
      <td>${w.date}</td>
      <td>${w.shift}</td>
      <td>${w.unit_name ? w.unit_name.split('—')[0] : '-'}</td>
      <td>${w.component_name}</td>
      <td>${w.team?.map(t => t.name).join('<br>') || '-'}</td>
      <td>${w.actual_hours || '-'}j / ${w.target_hours || '-'}j</td>
      <td><strong style="color:#2D6A4F;">${w.final_points ? w.final_points.toFixed(2) : '0.00'}</strong></td>
      <td><span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderApprovals() {
  const overall = state.monitoringData?.overall || DEFAULT_MONITORING_OVERALL;

  const l1Count = state.pendingL1Wos.length || 3;
  const l2Count = overall.pending_l2 || 21;
  const activeCount = state.activeWos.length || 7;
  const apprCount = state.approvedWos.length || 13;
  const rejCount = state.rejectedWos.length || 38;

  const cntL1El = document.getElementById('appr-count-l1');
  if (cntL1El) cntL1El.textContent = l1Count;
  const cntL2El = document.getElementById('appr-count-l2');
  if (cntL2El) cntL2El.textContent = l2Count;
  const cntActEl = document.getElementById('appr-count-active');
  if (cntActEl) cntActEl.textContent = activeCount;
  const cntApprEl = document.getElementById('appr-count-approved');
  if (cntApprEl) cntApprEl.textContent = apprCount;
  const cntRejEl = document.getElementById('appr-count-rejected');
  if (cntRejEl) cntRejEl.textContent = rejCount;

  document.querySelectorAll('#view-approvals .subtab-btn').forEach(btn => btn.classList.remove('active-subtab'));
  const activeBtn = document.getElementById(`appr-subtab-${state.apprSubTab}-btn`);
  if (activeBtn) activeBtn.classList.add('active-subtab');

  const badgeCount = document.getElementById('approval-badge-count');
  if (badgeCount) {
    if (l1Count > 0) {
      badgeCount.textContent = l1Count;
      badgeCount.style.display = 'inline-block';
    } else {
      badgeCount.style.display = 'none';
    }
  }

  let currentList = [];
  if (state.apprSubTab === 'l1') currentList = state.pendingL1Wos;
  else if (state.apprSubTab === 'l2') currentList = state.workOrders.filter(w => w.status === 'PENDING_L2');
  else if (state.apprSubTab === 'active') currentList = state.activeWos;
  else if (state.apprSubTab === 'approved') currentList = state.approvedWos;
  else if (state.apprSubTab === 'rejected') currentList = state.rejectedWos;

  const search = (document.getElementById('search-approvals')?.value || '').toLowerCase();
  const filtered = currentList.filter(w => {
    if (!search) return true;
    const txt = `${w.id} ${w.unit_name} ${w.component_name} ${w.team?.map(t => t.name).join(' ')}`.toLowerCase();
    return txt.includes(search);
  });

  const tbody = document.getElementById('approvals-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-dim); padding:30px;">Tidak ada data pada status ${state.apprSubTab.toUpperCase()}.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(w => {
    const tr = document.createElement('tr');
    const isL1 = state.apprSubTab === 'l1';

    let actionColumn = '';
    if (isL1) {
      actionColumn = `
        <button class="btn btn-success" style="padding:6px 10px; font-size:12px; margin-right:4px;" onclick="window.approveWo('${w.id}')">
          <i class="fa-solid fa-check"></i> Setujui
        </button>
        <button class="btn btn-danger" style="padding:6px 10px; font-size:12px;" onclick="window.rejectWo('${w.id}')">
          <i class="fa-solid fa-xmark"></i> Tolak
        </button>
      `;
    } else if (state.apprSubTab === 'rejected') {
      actionColumn = `<span style="font-size:11px; color:#EF4444;" title="${w.rejection_reason || 'Ditolak'}">${(w.rejection_reason || 'Ditolak').slice(0, 20)}</span>`;
    } else {
      actionColumn = `<span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span>`;
    }

    tr.innerHTML = `
      <td>${isL1 ? `<input type="checkbox" class="wo-approval-checkbox" value="${w.id}">` : '-'}</td>
      <td><strong>${w.id}</strong></td>
      <td>${w.date}</td>
      <td>${w.unit_name ? w.unit_name.split('—')[0] : '-'}</td>
      <td>${w.component_name}</td>
      <td>${w.team?.map(t => t.name).join(', ') || '-'}</td>
      <td><strong style="color:#2D6A4F;">${w.final_points ? w.final_points.toFixed(2) : '0.00'}</strong></td>
      <td><span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span></td>
      <td style="text-align: right; white-space: nowrap;">${actionColumn}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.approveWo = async function(woNumber) {
  const wo = state.workOrders.find(w => w.id === woNumber) || state.pendingL1Wos.find(w => w.id === woNumber);
  const woIdToSend = wo?.raw_id || woNumber;
  showToast(`⏳ Mengirim persetujuan ${woNumber} ke Google Spreadsheet...`, 'info');

  const res = await api('approve_l1', { wo_id: woIdToSend });
  if (res.success) {
    showToast(`✅ WO ${woNumber} disetujui di Google Spreadsheet! (Lanjut ke Superintendent L2)`, 'success');
    if (wo) wo.status = 'PENDING_L2';
    state.pendingL1Wos = state.pendingL1Wos.filter(w => w.id !== woNumber);
    saveCachedSpreadsheetData();
    renderApprovals();
    renderDashboard();
    renderMonitoring();
  } else {
    showToast(`❌ Gagal menyetujui: ${res.error || 'Server error'}`, 'danger');
  }
};

window.rejectWo = async function(woNumber) {
  const reason = prompt('Masukkan alasan penolakan work order:');
  if (reason === null) return;

  const wo = state.workOrders.find(w => w.id === woNumber) || state.pendingL1Wos.find(w => w.id === woNumber);
  const woIdToSend = wo?.raw_id || woNumber;
  showToast(`⏳ Mengirim penolakan ke Google Spreadsheet...`, 'info');

  const res = await api('reject', { wo_id: woIdToSend, reason: reason || 'Ditolak oleh supervisor' });
  if (res.success) {
    showToast(`✅ WO ${woNumber} ditolak di Google Spreadsheet.`, 'info');
    if (wo) {
      wo.status = 'REJECTED';
      wo.rejection_reason = reason;
    }
    state.pendingL1Wos = state.pendingL1Wos.filter(w => w.id !== woNumber);
    saveCachedSpreadsheetData();
    renderApprovals();
    renderDashboard();
    renderMonitoring();
  } else {
    showToast(`❌ Gagal menolak: ${res.error || 'Server error'}`, 'danger');
  }
};

window.copyMechanicToken = async function(token, btnId) {
  try {
    const fullUrl = `https://abadiops.com/?token=${token}`;
    await navigator.clipboard.writeText(fullUrl);
    const btn = document.getElementById(btnId);
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
      btn.style.background = '#2D6A4F';
      btn.style.color = '#FFFFFF';
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    }
    showToast(`Token tersalin! Link: ${fullUrl}`, 'success');
  } catch (err) {
    const input = document.getElementById(btnId.replace('btn-copy-', 'tok-'));
    if (input) {
      input.select();
      document.execCommand('copy');
      showToast('Token tersalin ke clipboard!', 'success');
    }
  }
};

async function bulkApprove() {
  const checkboxes = document.querySelectorAll('.wo-approval-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('Pilih minimal 1 work order untuk disetujui!', 'warning');
    return;
  }

  showToast(`⏳ Menyetujui ${checkboxes.length} work order di Google Spreadsheet...`, 'info');
  let count = 0;
  for (const cb of checkboxes) {
    const wo = state.workOrders.find(w => w.id === cb.value) || state.pendingL1Wos.find(w => w.id === cb.value);
    if (wo) {
      const res = await api('approve_l1', { wo_id: wo.raw_id || wo.id });
      if (res.success) count++;
    }
  }

  showToast(`✅ Berhasil menyetujui ${count} work order di Google Spreadsheet!`, 'success');
  await syncFromSpreadsheet(false);
}

function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.view-section').forEach(s => {
    s.classList.toggle('active', s.id === `view-${tabName}`);
  });

  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'approvals') renderApprovals();
  if (tabName === 'monitoring') renderMonitoring();
  if (tabName === 'create-wo') renderJoblists();
}

function initEventListeners() {
  const btnGoto = document.getElementById('btn-goto-create-wo');
  if (btnGoto) {
    btnGoto.addEventListener('click', () => switchTab('create-wo'));
  }

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('btn-enter-gate').addEventListener('click', () => {
    const token = document.getElementById('input-token').value;
    loginWithToken(token);
  });

  document.getElementById('input-token').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginWithToken(e.target.value);
    }
  });

  document.querySelectorAll('.quick-token-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      loginWithToken(btn.dataset.token);
    });
  });

  document.getElementById('btn-switch-token').addEventListener('click', logout);

  const btnSyncSheets = document.getElementById('btn-sync-spreadsheet');
  if (btnSyncSheets) {
    btnSyncSheets.addEventListener('click', () => syncFromSpreadsheet(true));
  }

  document.getElementById('btn-bulk-approve').addEventListener('click', bulkApprove);
  document.getElementById('btn-refresh-approvals').addEventListener('click', () => syncFromSpreadsheet(true));

  document.getElementById('check-all-approvals').addEventListener('change', (e) => {
    document.querySelectorAll('.wo-approval-checkbox').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // Monitoring sub-tab switchers
  document.getElementById('mon-subtab-mechanics-btn')?.addEventListener('click', () => {
    state.monSubTab = 'mechanics';
    renderMonitoring();
  });
  document.getElementById('mon-subtab-wos-btn')?.addEventListener('click', () => {
    state.monSubTab = 'all-wos';
    renderMonitoring();
  });

  document.getElementById('search-monitoring')?.addEventListener('input', renderMonitoring);
  document.getElementById('filter-monitoring-section')?.addEventListener('change', renderMonitoring);

  // Approvals sub-tab switchers
  ['l1', 'l2', 'active', 'approved', 'rejected'].forEach(tab => {
    document.getElementById('appr-subtab-' + tab + '-btn')?.addEventListener('click', () => {
      state.apprSubTab = tab;
      renderApprovals();
    });
  });

  document.getElementById('search-approvals')?.addEventListener('input', renderApprovals);
  document.getElementById('quick-search-wo')?.addEventListener('input', renderDashboard);
}

// Helpers
function getStatusBadgeClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'status-approved';
    case 'REJECTED': return 'status-rejected';
    case 'ACTIVE':
    case 'PENDING_L1':
    case 'PENDING_L2':
    case 'PENDING': return 'status-active';
    default: return 'status-active';
  }
}

function formatStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'APPROVED';
    case 'REJECTED': return 'DITOLAK';
    case 'ACTIVE': return 'ACTIVE';
    case 'PENDING_L1': return 'MENUNGGU L1';
    case 'PENDING_L2': return 'MENUNGGU L2';
    default: return status || 'PENDING';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${type === 'success' ? '#2D6A4F' : type === 'danger' ? '#DC2626' : type === 'warning' ? '#D97706' : '#2563EB'};
    color: #FFFFFF;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    font-size: 13.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 280px;
    animation: fadeIn 0.3s ease;
  `;

  const icon = type === 'success' ? 'fa-circle-check' : type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
