import fs from 'fs';

let content = fs.readFileSync('scripts/patched-app.js', 'utf8');

// 1. Update state.apprSubTab default
content = content.replace(/apprSubTab:\s*'l1'/g, "apprSubTab: 'pending'");

// 2. Replace renderApprovals and related functions
const oldRenderStart = content.indexOf('function renderApprovals() {');
const oldRenderEnd = content.indexOf('window.copyMechanicToken = async function');

if (oldRenderStart !== -1 && oldRenderEnd !== -1) {
  const newApprovalsCode = `function getPendingApprovalsForCurrentRole() {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  if (isSuperintendent) {
    // Superintendent (L2): ONLY show L2 pending approvals!
    return state.workOrders.filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent');
  } else {
    // Supervisor (L1): ONLY show L1 pending approvals (never show L2)!
    return state.pendingL1Wos.filter(w => w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || !w.status || w.status === 'pending_transfer');
  }
}

function renderApprovals() {
  const container = document.getElementById('approvals-cards-container');
  if (!container) return;

  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  // 1. Role-based pending list
  const rolePendingList = getPendingApprovalsForCurrentRole();
  const activeList = state.activeWos || [];
  const approvedList = state.approvedWos || [];
  const transferList = (state.pendingL1Wos || []).filter(w => w.status === 'pending_transfer');
  const rejectedList = state.rejectedWos || [];

  // Update counts on subtabs
  const cntPendingEl = document.getElementById('appr-count-pending');
  if (cntPendingEl) cntPendingEl.textContent = rolePendingList.length;

  const cntActEl = document.getElementById('appr-count-active');
  if (cntActEl) {
    cntActEl.textContent = activeList.length;
    cntActEl.style.display = activeList.length > 0 ? 'inline-block' : 'none';
  }
  const cntApprEl = document.getElementById('appr-count-approved');
  if (cntApprEl) {
    cntApprEl.textContent = approvedList.length;
    cntApprEl.style.display = approvedList.length > 0 ? 'inline-block' : 'none';
  }
  const cntTransEl = document.getElementById('appr-count-transfer');
  if (cntTransEl) {
    cntTransEl.textContent = transferList.length;
    cntTransEl.style.display = transferList.length > 0 ? 'inline-block' : 'none';
  }
  const cntRejEl = document.getElementById('appr-count-rejected');
  if (cntRejEl) {
    cntRejEl.textContent = rejectedList.length;
    cntRejEl.style.display = rejectedList.length > 0 ? 'inline-block' : 'none';
  }

  // Update navbar badge count
  const badgeCount = document.getElementById('approval-badge-count');
  if (badgeCount) {
    if (rolePendingList.length > 0) {
      badgeCount.textContent = rolePendingList.length;
      badgeCount.style.display = 'inline-block';
    } else {
      badgeCount.style.display = 'none';
    }
  }

  // Update active subtab class
  const currentSub = state.apprSubTab || 'pending';
  document.querySelectorAll('.appr-sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === currentSub);
  });

  // Determine current active list
  let currentList = [];
  let sectionTitle = 'Pending Approvals';
  let sectionIcon = '<i class="fa-solid fa-square-check" style="color: #10B981;"></i>';

  if (currentSub === 'pending') {
    currentList = rolePendingList;
    sectionTitle = 'Pending Approvals';
    sectionIcon = '<i class="fa-solid fa-square-check" style="color: #10B981;"></i>';
  } else if (currentSub === 'active') {
    currentList = activeList;
    sectionTitle = 'WO Aktif';
    sectionIcon = '⏳';
  } else if (currentSub === 'approved') {
    currentList = approvedList;
    sectionTitle = 'WO Approved';
    sectionIcon = '🏆';
  } else if (currentSub === 'transfer') {
    currentList = transferList;
    sectionTitle = 'Transfer WO';
    sectionIcon = '🔁';
  } else if (currentSub === 'rejected') {
    currentList = rejectedList;
    sectionTitle = 'WO Ditolak';
    sectionIcon = '❌';
  }

  // Section title & count pill
  const titleEl = document.getElementById('appr-section-title');
  if (titleEl) titleEl.innerHTML = sectionIcon + ' ' + sectionTitle;
  const countEl = document.getElementById('appr-section-count');
  if (countEl) countEl.textContent = currentList.length;

  // Filter with search
  const search = (document.getElementById('search-approvals')?.value || '').toLowerCase();
  const filtered = currentList.filter(w => {
    if (!search) return true;
    const teamNames = w.team?.map(t => t.name).join(' ') || '';
    const txt = (w.id + ' ' + (w.unit_name || '') + ' ' + (w.component_name || '') + ' ' + teamNames).toLowerCase();
    return txt.includes(search);
  });

  if (filtered.length === 0) {
    container.innerHTML = \`
      <div style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; padding:48px 24px; text-align:center; color:var(--text-dim);">
        <i class="fa-solid fa-inbox" style="font-size:32px; color:#9CA3AF; margin-bottom:12px; display:block;"></i>
        <h3 style="font-size:16px; font-weight:700; color:#111827; margin-bottom:4px;">Tidak Ada Data</h3>
        <p style="font-size:13px; margin:0;">Tidak ada work order pada tab \${sectionTitle} untuk peran \${isSuperintendent ? 'L2 (Superintendent)' : 'L1 (Supervisor)'}.</p>
      </div>
    \`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(w => {
    const card = document.createElement('div');
    card.className = 'wo-approval-card';
    card.id = 'card-' + w.id;

    // Duration formatting: e.g. 0.3 hr -> 18 menit / tgt 2 jam
    let durationText = '';
    const actHours = parseFloat(w.actual_hours) || 0;
    const tgtHours = parseFloat(w.target_hours) || 2;
    if (actHours > 0 && actHours < 1) {
      durationText = Math.round(actHours * 60) + ' menit / tgt ' + tgtHours + ' jam';
    } else if (actHours >= 1) {
      durationText = actHours + ' jam / tgt ' + tgtHours + ' jam';
    } else {
      durationText = '0 menit / tgt ' + tgtHours + ' jam';
    }

    const isLate = actHours > tgtHours;
    const onTimeBadge = '<span class="wo-ontime-pill ' + (isLate ? 'late' : 'ontime') + '">' + (isLate ? '⏱ TERLAMBAT' : '⏱ ON TIME') + '</span>';

    // Team members formatting: "Afid Irham + 2 org"
    let teamText = '-';
    if (Array.isArray(w.team) && w.team.length > 0) {
      const leaderName = w.team[0].name || w.team[0].mechanic_name || 'Mekanik';
      teamText = w.team.length > 1 ? leaderName + ' + ' + (w.team.length - 1) + ' org' : leaderName;
    }

    // Unit & Lokasi
    const rawUnit = w.unit_name || w.unit_id || '-';
    const unitTitle = rawUnit.includes('(') ? rawUnit.split('(')[0].trim() : rawUnit;
    const unitCode = w.unit_id || unitTitle;
    const lokasiStr = w.location || w.lokasi || 'BENGKEL';

    // Component & Type
    const compTitle = w.component_name || w.job_name || '-';
    const jobCodeStr = w.job_code || w.job_id || 'JCB-0103';
    const jobTypeStr = w.type || w.job_type || 'preventive';

    const isPending = currentSub === 'pending';
    const isChecked = state.selectedWoIds.has(w.id);

    card.innerHTML = \`
      <div class="wo-card-main-row">
        <!-- 1. Selection & WO Meta -->
        <div class="wo-col-meta">
          \${isPending ? \`<input type="checkbox" class="wo-chk-custom wo-approval-checkbox" value="\${w.id}" \${isChecked ? 'checked' : ''} onchange="window.toggleSelectWo('\${w.id}', this.checked)">\` : ''}
          <div>
            <div class="wo-id-link">\${w.id}</div>
            <div class="wo-date-text"><i class="fa-regular fa-clock"></i> \${w.date}</div>
            <span class="wo-level-badge level-\${w.level || (isSuperintendent ? 2 : 1)}">Level \${w.level || (isSuperintendent ? 2 : 1)}</span>
          </div>
        </div>

        <!-- 2. Unit & Lokasi -->
        <div class="wo-col-unit">
          <div class="wo-col-hdr">UNIT & LOKASI</div>
          <div class="wo-unit-title">
            <i class="fa-solid fa-tractor" style="color: #059669;"></i>
            <span>\${unitTitle}</span>
          </div>
          <div class="wo-unit-subtitle">(\${unitCode})</div>
          <span class="wo-loc-pill">🏢 \${lokasiStr}</span>
        </div>

        <!-- 3. Pekerjaan / Komponen -->
        <div class="wo-col-comp">
          <div class="wo-col-hdr">PEKERJAAN / KOMPONEN</div>
          <div class="wo-comp-title">\${compTitle}</div>
          <div class="wo-comp-meta">\${jobTypeStr} · No: \${jobCodeStr}</div>
        </div>

        <!-- 4. Durasi & Tim -->
        <div class="wo-col-dur">
          <div class="wo-col-hdr">DURASI & TIM</div>
          <div class="wo-dur-time"><i class="fa-regular fa-clock"></i> \${durationText}</div>
          \${onTimeBadge}
          <div class="wo-team-text">\${teamText}</div>
        </div>

        <!-- 5. Actions -->
        <div class="wo-col-btn-group">
          <button type="button" class="btn-wo-detail" onclick="window.toggleWoDetail('\${w.id}')">
            <i class="fa-regular fa-eye"></i> Lihat Detail
          </button>
          \${isPending ? \`
            <button type="button" class="btn-wo-approve" onclick="window.approveWo('\${w.id}')">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button type="button" class="btn-wo-icon btn-wo-edit" title="Edit WO" onclick="window.editWo('\${w.id}')">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-transfer" title="Transfer WO" onclick="window.transferWo('\${w.id}')">
              <i class="fa-solid fa-arrow-right-arrow-left"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-hold" title="Tahan WO" onclick="window.holdWo('\${w.id}')">
              <i class="fa-solid fa-ban"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-reject" title="Tolak WO" onclick="window.rejectWo('\${w.id}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          \` : \`
            <span class="status-badge \${getStatusBadgeClass(w.status)}">\${formatStatus(w.status)}</span>
          \`}
        </div>
      </div>

      <!-- Expandable Detail Drawer -->
      <div class="wo-card-drawer" id="drawer-\${w.id}" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #111827;"><i class="fa-solid fa-users"></i> Anggota Tim & Alokasi Poin (\${w.team?.length || 0} Mekanik)</strong>
          <span style="font-weight: 700; color: #2D6A4F;">Total Poin WO: \${w.final_points ? w.final_points.toFixed(2) : '0.00'}</span>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #F3F4F6;">
                <th style="padding: 6px 10px; text-align: left;">Mekanik</th>
                <th style="padding: 6px 10px; text-align: center;">ID Mekanik</th>
                <th style="padding: 6px 10px; text-align: center;">Poin Akhir</th>
                <th style="padding: 6px 10px; text-align: right;">Estimasi IDR</th>
              </tr>
            </thead>
            <tbody>
              \${(w.team || []).map(t => \`
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 6px 10px; font-weight: 600; color: #111827;">\${t.name}</td>
                  <td style="padding: 6px 10px; text-align: center; color: #6B7280; font-family: monospace;">\${t.mechanic_id || '-'}</td>
                  <td style="padding: 6px 10px; text-align: center; font-weight: 700; color: #059669;">\${t.points ? t.points.toFixed(2) : (w.final_points || 0).toFixed(2)}</td>
                  <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #111827;">Rp \${Math.round((t.points || w.final_points || 0) * 2500).toLocaleString('id-ID')}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    \`;

    container.appendChild(card);
  });
}

window.toggleWoDetail = function(woId) {
  const drawer = document.getElementById('drawer-' + woId);
  if (drawer) {
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
  }
};

window.toggleSelectWo = function(woId, isChecked) {
  if (isChecked) state.selectedWoIds.add(woId);
  else state.selectedWoIds.delete(woId);
  updateBulkApproveBtn();
};

function updateBulkApproveBtn() {
  const count = state.selectedWoIds.size;
  const bulkBtn = document.getElementById('btn-bulk-approve');
  const countSpan = document.getElementById('bulk-selected-count');
  if (bulkBtn && countSpan) {
    countSpan.textContent = count;
    bulkBtn.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

window.editWo = function(woId) {
  showToast('Fitur Edit WO ' + woId + ' sedang dipersiapkan.', 'info');
};

window.transferWo = function(woId) {
  const newShift = prompt('Transfer WO ' + woId + ' ke shift:', 'Shift 2');
  if (newShift) {
    showToast('WO ' + woId + ' dipindahkan ke ' + newShift + '.', 'info');
  }
};

window.holdWo = function(woId) {
  showToast('WO ' + woId + ' ditahan sementara.', 'warning');
};

window.approveWo = async function(woNumber) {
  const wo = state.workOrders.find(w => w.id === woNumber) || state.pendingL1Wos.find(w => w.id === woNumber);
  const woIdToSend = wo?.raw_id || woNumber;
  showToast('⏳ Mengirim persetujuan ' + woNumber + ' ke Google Spreadsheet...', 'info');

  const res = await api('approve_l1', { wo_id: woIdToSend });
  if (res.success) {
    showToast('✅ WO ' + woNumber + ' disetujui di Google Spreadsheet! (Lanjut ke Superintendent L2)', 'success');
    if (wo) wo.status = 'PENDING_L2';
    state.pendingL1Wos = state.pendingL1Wos.filter(w => w.id !== woNumber);
    state.selectedWoIds.delete(woNumber);
    updateBulkApproveBtn();
    saveCachedSpreadsheetData();
    renderApprovals();
    renderDashboard();
    renderMonitoring();
  } else {
    showToast('❌ Gagal menyetujui: ' + (res.error || 'Server error'), 'danger');
  }
};

window.rejectWo = async function(woNumber) {
  const reason = prompt('Masukkan alasan penolakan work order:');
  if (reason === null) return;

  const wo = state.workOrders.find(w => w.id === woNumber) || state.pendingL1Wos.find(w => w.id === woNumber);
  const woIdToSend = wo?.raw_id || woNumber;
  showToast('⏳ Mengirim penolakan ke Google Spreadsheet...', 'info');

  const res = await api('reject', { wo_id: woIdToSend, reason: reason || 'Ditolak oleh supervisor' });
  if (res.success) {
    showToast('✅ WO ' + woNumber + ' ditolak di Google Spreadsheet.', 'info');
    if (wo) {
      wo.status = 'REJECTED';
      wo.rejection_reason = reason;
      state.rejectedWos.unshift(wo);
    }
    state.pendingL1Wos = state.pendingL1Wos.filter(w => w.id !== woNumber);
    state.selectedWoIds.delete(woNumber);
    updateBulkApproveBtn();
    saveCachedSpreadsheetData();
    renderApprovals();
    renderDashboard();
    renderMonitoring();
  } else {
    showToast('❌ Gagal menolak: ' + (res.error || 'Server error'), 'danger');
  }
};

async function bulkApprove() {
  const selected = Array.from(state.selectedWoIds);
  if (selected.length === 0) {
    showToast('Pilih minimal 1 work order untuk disetujui!', 'warning');
    return;
  }

  showToast('⏳ Menyetujui ' + selected.length + ' work order terpilih...', 'info');
  let successCount = 0;
  for (const id of selected) {
    const wo = state.pendingL1Wos.find(w => w.id === id) || state.workOrders.find(w => w.id === id);
    const woIdToSend = wo?.raw_id || id;
    const res = await api('approve_l1', { wo_id: woIdToSend });
    if (res.success) {
      successCount++;
      state.pendingL1Wos = state.pendingL1Wos.filter(w => w.id !== id);
    }
  }

  state.selectedWoIds.clear();
  updateBulkApproveBtn();
  showToast('✅ Berhasil menyetujui ' + successCount + ' work order!', 'success');
  saveCachedSpreadsheetData();
  renderApprovals();
  renderDashboard();
  renderMonitoring();
}

`;

  content = content.substring(0, oldRenderStart) + newApprovalsCode + content.substring(oldRenderEnd);
  console.log('Replaced renderApprovals successfully!');
} else {
  console.error('Could not find renderApprovals boundaries');
}

// 3. Update initEventListeners for the subtabs and action bar buttons
const oldSubtabsCode = `  // Approvals sub-tab switchers
  ['l1', 'l2', 'active', 'approved', 'rejected'].forEach(tab => {
    document.getElementById('appr-subtab-' + tab + '-btn')?.addEventListener('click', () => {
      state.apprSubTab = tab;
      renderApprovals();
    });
  });`;

const newSubtabsCode = `  // Approvals sub-tab switchers (1:1 GAS Match)
  ['pending', 'active', 'approved', 'transfer', 'rejected'].forEach(sub => {
    document.getElementById('appr-subtab-' + sub)?.addEventListener('click', () => {
      state.apprSubTab = sub;
      renderApprovals();
    });
  });

  // Action bar buttons
  let allDetailsOpen = false;
  document.getElementById('btn-toggle-all-details')?.addEventListener('click', () => {
    allDetailsOpen = !allDetailsOpen;
    document.querySelectorAll('.wo-card-drawer').forEach(d => {
      d.style.display = allDetailsOpen ? 'block' : 'none';
    });
    const btn = document.getElementById('btn-toggle-all-details');
    if (btn) {
      btn.innerHTML = allDetailsOpen
        ? '<i class="fa-regular fa-folder-closed" style="color: #F59E0B;"></i> Tutup Semua Detail'
        : '<i class="fa-regular fa-folder-open" style="color: #F59E0B;"></i> Buka Semua Detail';
    }
  });

  let allSelected = false;
  document.getElementById('btn-select-all-page')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.wo-chk-custom');
    allSelected = !allSelected;
    checkboxes.forEach(cb => {
      cb.checked = allSelected;
      if (allSelected) state.selectedWoIds.add(cb.value);
      else state.selectedWoIds.delete(cb.value);
    });
    updateBulkApproveBtn();
  });`;

content = content.replace(oldSubtabsCode, newSubtabsCode);

// Also remove old check-all-approvals listener safely
content = content.replace(/document\.getElementById\('check-all-approvals'\)\.addEventListener[\s\S]*?\}\);\n/g, '');

fs.writeFileSync('scripts/patched-app.js', content, 'utf8');
console.log('Successfully written updated scripts/patched-app.js!');
