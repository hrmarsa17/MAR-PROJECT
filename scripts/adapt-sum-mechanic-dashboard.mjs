import fs from 'fs';

const kmb = fs.readFileSync('workers/kmb/web/MechanicDashboard.html', 'utf8');

let sumDash = kmb;

// 1. Update Title and Brand
sumDash = sumDash.replace('<title>Monitoring - Mechanic Activity Report</title>', '<title>Monitoring - MAR SUM V2</title>');
sumDash = sumDash.replace('<div class="nav-brand">⚙️ Mechanic Activity Report</div>', '<div class="nav-brand">⚙️ MAR SUM V2</div>');

// 2. Update TIMER_KEY
sumDash = sumDash.replace("var TIMER_KEY = 'mar_projek_kmb_timers';", "var TIMER_KEY = 'mar_sum_timers';");

// 3. Ensure Cancel WO is in navbar if permitted
const navOld = '<? if (_akses.teknis) { ?>';
const navNew = `<? if (bolehMenuCancelWo(user.role)) { ?> <a href="<?= baseUrl ?>?page=cancel" class="nav-link" target="_top">Cancel WO</a> <? } ?>
      <? if (_akses.teknis) { ?>`;
if (sumDash.includes(navOld) && !sumDash.includes('?page=cancel')) {
  sumDash = sumDash.replace(navOld, navNew);
}

// 4. Update button text in timer to '⏸ Jeda' and '⏹ Selesai'
sumDash = sumDash.replace('>⏸ Pause</button>', '>⏸ Jeda</button>');
sumDash = sumDash.replace('>⏹ Finish &amp; Isi Jam</button>', '>⏹ Selesai</button>');

// 5. Update timer box background to #f0fdf4 and border #86efac
sumDash = sumDash.replace(
  'id="timerPill" style="background:#F1F4EE;border:1px solid #D2E9BB;',
  'id="timerPill" style="background:#f0fdf4;border:1px solid #86efac;'
);

// 6. Ensure Transfer button in modal footer is '🔄 Transfer ke Shift Berikutnya'
sumDash = sumDash.replace('🔁 Transfer ke Shift Berikutnya', '🔄 Transfer ke Shift Berikutnya');

// 7. Ensure btnSubmit and kirimLangsung buttons have #4d5e3e
sumDash = sumDash.replace(
  'id="btnSubmit" onclick="submitWork()" disabled>📮 Kirim</button>',
  'id="btnSubmit" onclick="submitWork()" disabled style="background:#4d5e3e;border-color:#4d5e3e;">📮 Kirim</button>'
);
sumDash = sumDash.replace(
  `<button type="button" class="btn btn-primary" style="flex:1;" onclick="event.stopPropagation();kirimLangsung('`,
  `<button type="button" class="btn btn-primary" style="flex:1;background:#4d5e3e;border-color:#4d5e3e;" onclick="event.stopPropagation();kirimLangsung('`
);

// 8. Normalization of status on cards:
// If status_group === 'assigned' or any assigned status, badge text MUST be 'Perlu Diisi Mekanik'
sumDash = sumDash.replace(
  `'<div class="wo-status ' + (isIncident ? 'status-done-incident' : ('status-' + wo.status_group)) + '">' + (isIncident ? '⚠️ Insiden' : (wo.status_label || wo.status)) + '</div>' +`,
  `'<div class="wo-status ' + (isIncident ? 'status-done-incident' : ((wo.status_group === 'assigned' || ['assigned', 'pending_mechanic_work', 'open', 'in_progress', 'perlu_diisi_mekanik'].includes(String(wo.status || '').toLowerCase().trim())) ? 'status-assigned' : ('status-' + (wo.status_group || 'assigned')))) + '">' + (isIncident ? '⚠️ Insiden' : ((wo.status_group === 'assigned' || ['assigned', 'pending_mechanic_work', 'open', 'in_progress', 'perlu_diisi_mekanik'].includes(String(wo.status || '').toLowerCase().trim())) ? 'Perlu Diisi Mekanik' : (wo.status_label || wo.status))) + '</div>' +`
);

// 9. Normalization of status in openWoDetail:
sumDash = sumDash.replace(
  `var canSubmit = (wo.status_group === 'assigned' || wo.status_group === 'in_progress');`,
  `var stNorm = String(wo.status || '').toLowerCase().trim();
        var canSubmit = (wo.status_group === 'assigned' || wo.status_group === 'in_progress' || ['assigned', 'pending_mechanic_work', 'open', 'in_progress', 'perlu_diisi_mekanik'].includes(stNorm));`
);

sumDash = sumDash.replace(
  `document.getElementById('modalStatus').textContent = wo.status_label || wo.status;`,
  `document.getElementById('modalStatus').textContent = canSubmit ? 'Perlu Diisi Mekanik' : (wo.status_label || wo.status || '-');`
);

// 10. Auto fill Start Time when ▶ Start clicked if empty:
sumDash = sumDash.replace(
  `st.state='running'; st.start_epoch=Date.now();
        timerSave(); timerStartTicker(); timerRefreshUI();`,
  `st.state='running'; st.start_epoch=Date.now();
        var curStart = document.getElementById('inputStartTime') ? document.getElementById('inputStartTime').value : '';
        if (!curStart) {
          dtSet('inputStartTime', toDatetimeLocal(new Date()));
        }
        timerSave(); timerStartTicker(); timerRefreshUI();`
);

// 11. Ensure transfer note label and placeholder:
sumDash = sumDash.replace(
  `<label class="form-label">Catatan bila WO dioper ke shift berikutnya <span style="font-weight:400;color:#718096;">(opsional)</span></label>`,
  `<label class="form-label">Catatan bila WO dioper ke shift berikutnya (opsional)</label>`
);
sumDash = sumDash.replace(
  `placeholder="cth: baut roda kiri belum kencang, tinggal torsi ulang"`,
  `placeholder="cth: baut roda kiri belum kencang,"`
);

// 12. Ensure submitWork passes wo_id and notes:
sumDash = sumDash.replace(
  `handleSubmitMechanicWork({wo_id: wo.id, start_time: st, end_time: et, hour_meter: hm, kilometers: km, part_category: document.getElementById('inputPartCategory').value, view_as: appState.viewingAs ? appState.viewingAs.id : null, token: PAGE_TOKEN,`,
  `handleSubmitMechanicWork({wo_id: wo.wo_number || wo.id, id: wo.wo_number || wo.id, start_time: st, end_time: et, actual_hours: ((new Date(et)-new Date(st))/3600000).toFixed(2), hour_meter: hm, kilometers: km, part_category: '', notes: document.getElementById('inputTransferNote') ? document.getElementById('inputTransferNote').value : '', view_as: appState.viewingAs ? appState.viewingAs.id : null, token: PAGE_TOKEN,`
);

// 13. Ensure kirimLangsung passes wo_id and id:
sumDash = sumDash.replace(
  `token: PAGE_TOKEN, wo_id: woId,`,
  `token: PAGE_TOKEN, wo_id: wo.wo_number || woId, id: wo.wo_number || woId, actual_hours: (total / 3600000).toFixed(2),`
);

// 14. Support backwards-compatible single timer keys in timerState:
sumDash = sumDash.replace(
  `function timerState(woId) {
        var all = timerAll();
        if (!all[woId]) all[woId] = { state:'idle', start_epoch:0, elapsed_ms:0 };
        return all[woId];
      }`,
  `function timerState(woId) {
        var all = timerAll();
        if (!all[woId]) {
          try {
            var old = localStorage.getItem('mar_sum_timer_' + woId);
            if (old) all[woId] = JSON.parse(old);
          } catch(e) {}
        }
        if (!all[woId]) all[woId] = { state:'idle', start_epoch:0, elapsed_ms:0 };
        return all[woId];
      }`
);

fs.writeFileSync('workers/sum/web/MechanicDashboard.html', sumDash, 'utf8');
console.log('Successfully written workers/sum/web/MechanicDashboard.html, length:', sumDash.length);
