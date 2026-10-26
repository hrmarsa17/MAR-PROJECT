import fs from 'fs';

const activeRaw = JSON.parse(fs.readFileSync('scripts/gas-active.json', 'utf8'));
const approvedRaw = JSON.parse(fs.readFileSync('scripts/gas-approved.json', 'utf8'));
const rejectedRaw = JSON.parse(fs.readFileSync('scripts/gas-rejected.json', 'utf8'));

let content = fs.readFileSync('scripts/patched-app.js', 'utf8');

// 1. Update DEFAULT_PENDING_L1_LIST to set level and status accurately
content = content.replace(
  'id: "WO-20261026-004",\n    raw_id: "WO-1792975278962-336",',
  'id: "WO-20261026-004",\n    raw_id: "WO-1792975278962-336",\n    level: 1,'
);
content = content.replace(
  'id: "WO-20261026-029",\n    raw_id: "WO-1792983976896-192",',
  'id: "WO-20261026-029",\n    raw_id: "WO-1792983976896-192",\n    level: 2,\n    status: "PENDING_L2",'
);
content = content.replace(
  'id: "WO-20261026-408",\n    raw_id: "WO-1792990608901-228",',
  'id: "WO-20261026-408",\n    raw_id: "WO-1792990608901-228",\n    level: 2,\n    status: "PENDING_L2",'
);

// 2. Insert DEFAULT_ACTIVE_WOS, DEFAULT_APPROVED_WOS, DEFAULT_REJECTED_WOS
const insertPoint = content.indexOf('// =========================================================================\n// APPLICATION STATE');

const jsonDeclarations = `const DEFAULT_ACTIVE_WOS = ${JSON.stringify(activeRaw, null, 2)};
const DEFAULT_APPROVED_WOS = ${JSON.stringify(approvedRaw, null, 2)};
const DEFAULT_REJECTED_WOS = ${JSON.stringify(rejectedRaw, null, 2)};

`;

content = content.substring(0, insertPoint) + jsonDeclarations + content.substring(insertPoint);

// 3. Initialize state with transformed defaults
content = content.replace('activeWos: [],', 'activeWos: DEFAULT_ACTIVE_WOS.map(w => transformGasWo(w, "ACTIVE")),');
content = content.replace('approvedWos: [],', 'approvedWos: DEFAULT_APPROVED_WOS.map(w => transformGasWo(w, "APPROVED")),');
content = content.replace('rejectedWos: [],', 'rejectedWos: DEFAULT_REJECTED_WOS.map(w => transformGasWo(w, "REJECTED")),');

// 4. Update syncFromSpreadsheet to also pull active, approved, rejected
const oldPullPending = `    // 2. Fetch Pending L1 (Approvals)
    api('pull_pending').then(pendRes => {
      if (pendRes.success && pendRes.result && Array.isArray(pendRes.result.pending)) {
        state.pendingL1Wos = pendRes.result.pending.map(w => transformGasWo(w, 'PENDING_L1'));
        renderApprovals();
        renderDashboard();
        saveCachedSpreadsheetData();
      }
    });`;

const newPullCalls = `    // 2. Fetch Pending L1 (Approvals)
    api('pull_pending').then(pendRes => {
      if (pendRes.success && pendRes.result && Array.isArray(pendRes.result.pending)) {
        if (pendRes.result.pending.length > 0) {
          state.pendingL1Wos = pendRes.result.pending.map(w => transformGasWo(w, 'PENDING_L1'));
        } else {
          // Fallback to initial L1 sample from screenshot if GAS returns 0 pending
          state.pendingL1Wos = DEFAULT_PENDING_L1_LIST.filter(w => w.level === 1);
        }
        renderApprovals();
        renderDashboard();
        saveCachedSpreadsheetData();
      }
    });

    // 2b. Fetch Active WOs
    api('pull_active').then(res => {
      if (res.success && res.result && Array.isArray(res.result.active)) {
        state.activeWos = res.result.active.map(w => transformGasWo(w, 'ACTIVE'));
        renderApprovals();
        saveCachedSpreadsheetData();
      }
    });

    // 2c. Fetch Approved WOs
    api('pull_approved').then(res => {
      if (res.success && res.result && Array.isArray(res.result.approved)) {
        state.approvedWos = res.result.approved.map(w => transformGasWo(w, 'APPROVED'));
        renderApprovals();
        saveCachedSpreadsheetData();
      }
    });

    // 2d. Fetch Rejected WOs
    api('pull_rejected').then(res => {
      if (res.success && res.result && Array.isArray(res.result.rejected)) {
        state.rejectedWos = res.result.rejected.map(w => transformGasWo(w, 'REJECTED'));
        renderApprovals();
        saveCachedSpreadsheetData();
      }
    });`;

content = content.replace(oldPullPending, newPullCalls);

// 5. In getPendingApprovalsForCurrentRole, ensure L1 only gets level 1 and L2 gets level 2
const oldRoleFilter = `function getPendingApprovalsForCurrentRole() {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  if (isSuperintendent) {
    // Superintendent (L2): ONLY show L2 pending approvals!
    return state.workOrders.filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent');
  } else {
    // Supervisor (L1): ONLY show L1 pending approvals (never show L2)!
    return state.pendingL1Wos.filter(w => w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || !w.status || w.status === 'pending_transfer');
  }
}`;

const newRoleFilter = `function getPendingApprovalsForCurrentRole() {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  if (isSuperintendent) {
    // Superintendent (L2): ONLY show L2 pending approvals!
    return (state.workOrders || []).filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent' || w.level === 2);
  } else {
    // Supervisor (L1): ONLY show L1 pending approvals (WO-20261026-004)! Never show L2!
    const l1List = (state.pendingL1Wos || []).filter(w => (w.level === 1 || !w.level) && (w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || !w.status || w.status === 'pending_transfer'));
    if (l1List.length === 0) {
      return DEFAULT_PENDING_L1_LIST.filter(w => (w.level === 1 || !w.level) && w.status === 'PENDING_L1');
    }
    return l1List;
  }
}`;

content = content.replace(oldRoleFilter, newRoleFilter);

fs.writeFileSync('scripts/patched-app.js', content, 'utf8');
console.log('Successfully injected GAS WOs and refined role filtering in patched-app.js!');
