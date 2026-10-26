import fs from 'fs';

let content = fs.readFileSync('scripts/patched-app.js', 'utf8');

// Update localStorage key to v6
content = content.replace(/kmb_gas_refs_v4/g, 'kmb_gas_refs_v6');
content = content.replace(/kmb_gas_refs_v5/g, 'kmb_gas_refs_v6');

// Refine DEFAULT_PENDING_L1_LIST and add DEFAULT_PENDING_L2_LIST
const oldPendingDefStart = content.indexOf('const DEFAULT_PENDING_L1_LIST = [');
const oldPendingDefEnd = content.indexOf('const DEFAULT_ACTIVE_WOS =');

if (oldPendingDefStart !== -1 && oldPendingDefEnd !== -1) {
  const newPendingDefs = `const DEFAULT_PENDING_L1_LIST = [
  {
    id: "WO-20261026-004",
    raw_id: "WO-1792975278962-336",
    level: 1,
    date: "26 Oct 2026 07:41",
    shift: "Shift 2",
    unit_id: "XEVB42002 - ST",
    unit_name: "XEVB42002 - ST (BEIBEN)",
    component_name: "Testing And Adjusting - Tyre",
    section: "maintenance",
    location: "workshop",
    actual_hours: 0.3,
    target_hours: 2,
    final_points: 4.84,
    status: "PENDING_L1",
    team: [
      { name: "Afid Irham", mechanic_id: "MNT-003", points: 4.84, idr: 12100 },
      { name: "Rido Saputra", mechanic_id: "MNT-008", points: 4.84, idr: 12100 },
      { name: "Alan Rohim", mechanic_id: "MNT-009", points: 4.84, idr: 12100 }
    ],
    created_by: "Djarot"
  }
];

const DEFAULT_PENDING_L2_LIST = [
  {
    id: "WO-20261026-029",
    raw_id: "WO-1792983976896-192",
    level: 2,
    date: "26 Oct 2026 10:06",
    shift: "Shift 1",
    unit_id: "SDT-002",
    unit_name: "Comp Engine Rebuild (ENGINE)",
    component_name: "Assembling - Cylinder Block",
    section: "vessel",
    location: "workshop",
    actual_hours: 4.25,
    target_hours: 30,
    final_points: 82.50,
    status: "PENDING_L2",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 82.50, idr: 206250 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 82.50, idr: 206250 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-408",
    raw_id: "WO-1792990608901-228",
    level: 2,
    date: "26 Oct 2026 11:56",
    shift: "Shift 1",
    unit_id: "SDVS70011",
    unit_name: "SDVS70011 (NUSATAMA)",
    component_name: "Resealing - Hydrolik Ssytem",
    section: "vessel",
    location: "workshop",
    actual_hours: 3,
    target_hours: 18,
    final_points: 39.60,
    status: "PENDING_L2",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 39.60, idr: 99000 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 39.60, idr: 99000 }
    ],
    created_by: "Djarot"
  }
];

`;
  content = content.substring(0, oldPendingDefStart) + newPendingDefs + content.substring(oldPendingDefEnd);
}

// In state:
content = content.replace('pendingL2Wos: [],', 'pendingL2Wos: [...DEFAULT_PENDING_L2_LIST],');

// Update getPendingApprovalsForCurrentRole
const oldRoleFilterStart = content.indexOf('function getPendingApprovalsForCurrentRole() {');
const oldRoleFilterEnd = content.indexOf('function renderApprovals() {');

if (oldRoleFilterStart !== -1 && oldRoleFilterEnd !== -1) {
  const newRoleFilter = `function getPendingApprovalsForCurrentRole() {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  if (isSuperintendent) {
    // Superintendent (L2): ONLY show L2 pending approvals!
    const l2List = (state.pendingL2Wos || []).filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent' || w.level === 2);
    return l2List.length > 0 ? l2List : DEFAULT_PENDING_L2_LIST;
  } else {
    // Supervisor (L1): ONLY show L1 pending approvals (WO-20261026-004)! NEVER show L2!
    const l1List = (state.pendingL1Wos || []).filter(w => (w.level === 1 || !w.level) && (w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || !w.status || w.status === 'pending_transfer'));
    return l1List.length > 0 ? l1List : DEFAULT_PENDING_L1_LIST;
  }
}

`;
  content = content.substring(0, oldRoleFilterStart) + newRoleFilter + content.substring(oldRoleFilterEnd);
}

fs.writeFileSync('scripts/patched-app.js', content, 'utf8');
console.log('Successfully updated patched-app.js with separated L1 and L2 pending lists!');
