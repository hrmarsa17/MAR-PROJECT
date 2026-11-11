import { buildPayrollWorkbook } from './payroll-excel.js';
import ExcelJS from 'exceljs';
import fs from 'fs';

const SUPABASE_URL = 'https://dnnqrslftndcbmnvuveb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HgQd9sXhK3-CrFyUId-LEw_q_ah2S0O';

function uint8ArrayToBase64(uint8) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function _formatDateId(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd} ${mmm} ${yyyy}`;
  } catch (_) {
    return String(date);
  }
}

function _formatTimeOnly(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (_) {
    return String(date);
  }
}

function _labelKondisi(wc) {
  const k = String(wc || '').toLowerCase();
  if (k === 'normal') return 'Shift 1';
  if (k === 'difficult') return 'Shift 2';
  if (k === 'extreme') return 'Kondisi Ekstrim';
  return wc || '-';
}

function getRateForJabatan(jabatan, position) {
  const j = String(jabatan || position || '').toLowerCase();
  if (j.includes('helper')) return 1500;
  if (j.includes('sr') || j.includes('senior')) return 3000;
  if (j.includes('jr') || j.includes('junior') || j.includes('welder') || j.includes('mekanik')) return 2500;
  return 2500;
}

async function run() {
  const rpcUrl = SUPABASE_URL + '/rest/v1/rpc/kmbtra_eksekusi_aksi_bertoken';
  const approvedRes = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_token: 'kmb-767db2f62a87',
      p_aksi: 'pull_approved',
      p_op_id: 'report-test',
      p_payload: {}
    })
  });

  const approvedData = await approvedRes.json();
  const allApproved = approvedData.result || [];
  console.log('Total approved WOs from Supabase:', allApproved.length);

  // Load refs for mechanics lookup
  const refsRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/kmbtra_create_refs_bertoken', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_token: 'kmb-767db2f62a87' })
  });
  const refsData = await refsRes.json();
  const mechsList = refsData.result?.mechanics || [];
  const allMechanics = {};
  mechsList.forEach(m => {
    allMechanics[m.mechanic_id] = m;
  });

  const periodLabel = '26 Okt – 25 Nov 2026';
  const now = new Date();
  const generatedAt = `${_formatDateId(now)} ${now.toLocaleTimeString('id-ID')}`;

  const detailRows = [];
  const mechanicMap = {};

  allApproved.forEach(w => {
    const pts = Number(w.final_points ?? w.points ?? w.base_points ?? 1) || 1;
    let teamMembers = [];
    if (Array.isArray(w.team) && w.team.length > 0) {
      teamMembers = w.team;
    } else if (w.lead_mechanic_id) {
      teamMembers = [{ mechanic_id: w.lead_mechanic_id, percentage: 100 }];
    } else if (w.submitted_by) {
      teamMembers = [{ mechanic_id: w.submitted_by, percentage: 100 }];
    } else {
      teamMembers = [{ mechanic_id: 'VES-011', percentage: 100 }];
    }

    teamMembers.forEach(tm => {
      const mid = String(tm.mechanic_id || 'MECH-01').trim();
      const mechInfo = allMechanics[mid];
      const mName = mechInfo?.mechanic_name || mechInfo?.name || tm.mechanic_name || mid;
      const mJabatan = mechInfo?.grade || mechInfo?.position || (mid.startsWith('TYRE') ? 'Mekanik Jr' : 'Mekanik Jr');
      const rate = getRateForJabatan(mJabatan, mechInfo?.position);
      const pct = Number(tm.percentage || 100) / 100;
      const mPoints = Number((pts * pct).toFixed(2));
      const mIdr = Math.round(mPoints * rate);

      const dRow = {
        mechanic_id: mid,
        mechanic_name: mName,
        jabatan: mJabatan,
        tgl_submit: _formatDateId(w.submitted_at || w.created_at),
        tgl_approved: _formatDateId(w.approved_l2_at || w.superintendent_approved_at || w.approved_at || w.created_at),
        wo_number: w.wo_number || w.id || '-',
        unit: w.unit_name || w.unit_code || w.unit_id || 'OTHERS',
        col_i: w.sub_component || w.component_name || w.component || 'Others',
        col_j: w.job_description || w.activity || w.others_description || 'General Job',
        kondisi: _labelKondisi(w.work_condition),
        lokasi: w.location ? (String(w.location).charAt(0).toUpperCase() + String(w.location).slice(1)) : 'Workshop',
        start_time: _formatTimeOnly(w.start_time),
        end_time: _formatTimeOnly(w.end_time),
        actual_hours: Number(w.actual_hours ?? w.duration_hours ?? 0),
        plan_hours: (w.plan_hours || w.target_hours) ? Number(w.plan_hours || w.target_hours) : null,
        snap_base: Number(w.base_points ?? 1),
        snap_unit: Number(w.unit_factor ?? 1),
        snap_wc: Number(w.work_condition_factor ?? (w.work_condition === 'extreme' ? 1.2 : (w.work_condition === 'difficult' ? 1.1 : 1.0))),
        snap_time: Number(w.timeliness_factor ?? 1.0),
        snap_safety: Number(w.safety_incident ? 0 : (w.safety_factor ?? 1.0)),
        snap_mtbf: Number(w.mtbf_factor ?? 1.0),
        snap_wo_points: pts,
        points: mPoints,
        rate: rate,
        idr: mIdr
      };
      detailRows.push(dRow);

      if (!mechanicMap[mid]) {
        mechanicMap[mid] = {
          mechanic_id: mid,
          mechanic_name: mName,
          jabatan: mJabatan,
          rate: rate,
          wo_count: 0,
          total_points: 0,
          total_idr: 0
        };
      }
      mechanicMap[mid].wo_count++;
      mechanicMap[mid].total_points += mPoints;
      mechanicMap[mid].total_idr += mIdr;
    });
  });

  detailRows.sort((a, b) => {
    if (a.mechanic_name < b.mechanic_name) return -1;
    if (a.mechanic_name > b.mechanic_name) return 1;
    if (a.wo_number < b.wo_number) return -1;
    if (a.wo_number > b.wo_number) return 1;
    return 0;
  });

  const summaryRows = Object.values(mechanicMap).sort((a, b) => b.total_points - a.total_points);

  const wb = await buildPayrollWorkbook({
    periodLabel,
    generatedAt,
    summaryRows,
    detailRows
  });

  const buffer = await wb.xlsx.writeBuffer();
  const fileB64 = uint8ArrayToBase64(new Uint8Array(buffer));
  const filename = `Payroll_${periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

  console.log('Generated filename:', filename);
  console.log('Buffer size:', buffer.byteLength, 'bytes');
  console.log('Base64 length:', fileB64.length);

  fs.writeFileSync('scratch/' + filename, Buffer.from(buffer));
  console.log('Saved to scratch/' + filename);
}

run().catch(console.error);

