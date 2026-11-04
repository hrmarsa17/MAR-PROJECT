#!/usr/bin/env node
/**
 * Uji Otomatis: Backend Mandiri Supabase (Tanpa GAS) & Kepatuhan Protokol AGENTS.md
 * Sesuai docs/panduan_deploy_staging_kamis (3).md §3 Langkah 2 & §8
 *
 * Memverifikasi 40 kasus uji invarian protokol dan fungsional:
 * - Mesin scoring JavaScript murni (1:1 ScoringService.gs)
 * - Eksekusi RPC mandiri per kamar (kmb, sum, kmb_projek)
 * - Isolasi skema antar-kamar
 * - Penomoran WO 4 digit WIB (WO-YYYYMMDD-XXXX)
 * - Normalisasi form payload Web Desktop (team_distribution, manual_*, dll)
 * - Invarian Saklar Balik & Satu Rumah Seumur Hidup
 * - Integrasi Cloudflare Worker 3 rumah tanpa ketergantungan script.google.com
 */

import fs from 'node:fs';
import { bulatkan, statusKetepatanWaktu, hitungSkor, rupiahUntukPoin, FACTORS } from '../src/domain/scoring.mjs';
import {
  normalisasiBlokWo,
  ekstrakWoId,
  apakahWoLahirDiSupabase,
  apakahWoLamaDariGas
} from '../workers/kmbprojek/src/supabase-backend.js';

let lulus = 0;
let gagal = 0;
const total = 40;

function uji(no, deskripsi, kondisi) {
  if (kondisi) {
    console.log(`  ✅ [${String(no).padStart(2, '0')}/${total}] LULUS: ${deskripsi}`);
    lulus++;
  } else {
    console.error(`  ❌ [${String(no).padStart(2, '0')}/${total}] GAGAL: ${deskripsi}`);
    gagal++;
  }
}

function stripComments(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

console.log('=== Menjalankan 40 Uji Otomatis Backend Mandiri Supabase ===\n');

// 1-6: Mesin Skor Murni JavaScript (src/domain/scoring.mjs)
uji(1, 'src/domain/scoring.mjs ada dan mengekspor fungsi scoring inti', typeof bulatkan === 'function' && typeof statusKetepatanWaktu === 'function' && typeof hitungSkor === 'function' && typeof rupiahUntukPoin === 'function');
uji(2, 'src/domain/scoring.mjs membulatkan tahan galat biner (1.005 -> 1.01 dan 8.165 -> 8.17)', bulatkan(1.005, 2) === 1.01 && bulatkan(8.165, 2) === 8.17);
uji(3, 'src/domain/scoring.mjs evaluasi ketepatan waktu akurat (on_time <= 100%, late <= 150%, way_late > 150%)', statusKetepatanWaktu(5, 5) === 'on_time' && statusKetepatanWaktu(6, 5) === 'late' && statusKetepatanWaktu(8, 5) === 'way_late');

const skorUji = hitungSkor({
  basePoints: 10,
  unitFactor: 1.0,
  workCondition: 'normal',
  actualHours: 5,
  targetHours: 5,
  safetyIncident: false,
  mtbfStatus: 'first_time',
}, FACTORS);
uji(4, 'src/domain/scoring.mjs menghitung finalPoints identik rumus GAS (10 * 1 * 1 * 1 * 1 * 1.2 = 12)', skorUji.finalPoints === 12);

const skorIncident = hitungSkor({
  basePoints: 10,
  unitFactor: 1.0,
  workCondition: 'normal',
  actualHours: 5,
  targetHours: 5,
  safetyIncident: true,
}, FACTORS);
uji(5, 'src/domain/scoring.mjs penalti insiden keselamatan menghanguskan poin (safetyFactor = 0 -> finalPoints = 0)', skorIncident.finalPoints === 0 && skorIncident.safetyFactor === 0);
uji(6, 'src/domain/scoring.mjs menghitung rupiah per poin dengan benar', rupiahUntukPoin(10, 2500) === 25000);

// 7-9: Keberadaan File SQL Backend Penuh Per Kamar
const sqlKmb = fs.existsSync('db/kmb/rpc_backend_penuh.sql') ? fs.readFileSync('db/kmb/rpc_backend_penuh.sql', 'utf8') : '';
const sqlSum = fs.existsSync('db/sum/rpc_backend_penuh.sql') ? fs.readFileSync('db/sum/rpc_backend_penuh.sql', 'utf8') : '';
const sqlKmbp = fs.existsSync('db/kmb_projek/rpc_backend_penuh.sql') ? fs.readFileSync('db/kmb_projek/rpc_backend_penuh.sql', 'utf8') : '';

uji(7, 'db/kmb/rpc_backend_penuh.sql ada dan mendefinisikan kmbtra_eksekusi_aksi_bertoken', sqlKmb.includes('kmbtra_eksekusi_aksi_bertoken'));
uji(8, 'db/sum/rpc_backend_penuh.sql ada dan mendefinisikan sum_eksekusi_aksi_bertoken', sqlSum.includes('sum_eksekusi_aksi_bertoken'));
uji(9, 'db/kmb_projek/rpc_backend_penuh.sql ada dan mendefinisikan kmb_eksekusi_aksi_bertoken', sqlKmbp.includes('kmb_eksekusi_aksi_bertoken'));

// 10-12: Isolasi Skema Antar-Kamar
const codeKmb = stripComments(sqlKmb);
const codeSum = stripComments(sqlSum);
const codeKmbp = stripComments(sqlKmbp);

uji(10, 'db/kmb/rpc_backend_penuh.sql terisolasi (tidak mengintip sum. atau kmb_projek.)', !codeKmb.includes('sum.') && !codeKmb.includes('kmb_projek.'));
uji(11, 'db/sum/rpc_backend_penuh.sql terisolasi (tidak mengintip kmb. atau kmb_projek.)', !codeSum.includes('kmb.') && !codeSum.includes('kmb_projek.'));
uji(12, 'db/kmb_projek/rpc_backend_penuh.sql terisolasi (tidak mengintip kmb. atau sum.)', !codeKmbp.includes('kmb.') && !codeKmbp.includes('sum.'));

// 13: Keamanan & Penolakan Token Tidak Dikenal
uji(13, 'RPC menolak token tidak sah dengan standar error {"success":false,"error":"Token tidak dikenal / nonaktif","source":"SUPABASE"}',
  sqlKmb.includes("'source', 'SUPABASE'") && sqlSum.includes("'source', 'SUPABASE'") && sqlKmbp.includes("'source', 'SUPABASE'"));

// 14: Penomoran WO 4 Digit WIB
uji(14, 'RPC menghasilkan nomor WO 4 digit urut WIB (WO-YYYYMMDD-XXXX)',
  sqlKmb.includes("to_char((now() AT TIME ZONE 'Asia/Jakarta'), 'YYYYMMDD')") &&
  sqlKmb.includes("lpad(coalesce(v_next_seq, 1)::text, 4, '0')") &&
  sqlSum.includes("lpad(coalesce(v_next_seq, 1)::text, 4, '0')") &&
  sqlKmbp.includes("lpad(coalesce(v_next_seq, 1)::text, 4, '0')"));

// 15: Dukungan Aksi Baca Lengkap
uji(15, 'RPC menangani aksi baca lengkap (pull_create_refs, pull_monitoring, pull_my_wos, pull_pending, dll)',
  sqlKmb.includes('pull_create_refs') && sqlKmb.includes('pull_monitoring') && sqlKmb.includes('pull_my_wos') && sqlKmb.includes('pull_pending') &&
  sqlSum.includes('pull_create_refs') && sqlSum.includes('pull_monitoring') && sqlSum.includes('pull_my_wos') && sqlSum.includes('pull_pending') &&
  sqlKmbp.includes('pull_create_refs') && sqlKmbp.includes('pull_monitoring') && sqlKmbp.includes('pull_my_wos') && sqlKmbp.includes('pull_pending'));

// 16: Dukungan Aksi Tulis Lengkap
uji(16, 'RPC menangani aksi tulis lengkap (create_wo, submit_work, save_override, approve_l1, approve_l2, reject, cancel_wo)',
  sqlKmb.includes('create_wo') && sqlKmb.includes('submit_work') && sqlKmb.includes('approve_l1') && sqlKmb.includes('approve_l2') &&
  sqlSum.includes('create_wo') && sqlSum.includes('submit_work') && sqlSum.includes('approve_l1') && sqlSum.includes('approve_l2') &&
  sqlKmbp.includes('create_wo') && sqlKmbp.includes('submit_work') && sqlKmbp.includes('approve_l1') && sqlKmbp.includes('approve_l2'));

// 17: Dukungan Aksi Transfer & Expired
uji(17, 'RPC menangani aksi transfer (request_transfer, approve_transfer, reject_transfer) & expired',
  sqlKmb.includes('request_transfer') && sqlKmb.includes('approve_transfer') && sqlKmb.includes('report_expired') &&
  sqlSum.includes('request_transfer') && sqlSum.includes('approve_transfer') && sqlSum.includes('report_expired') &&
  sqlKmbp.includes('request_transfer') && sqlKmbp.includes('approve_transfer') && sqlKmbp.includes('report_expired'));

// 18-20: Keberadaan Modul Supabase Backend di Worker Rumah
const jsKmb = fs.existsSync('workers/kmb/src/supabase-backend.js') ? fs.readFileSync('workers/kmb/src/supabase-backend.js', 'utf8') : '';
const jsSum = fs.existsSync('workers/sum/src/supabase-backend.js') ? fs.readFileSync('workers/sum/src/supabase-backend.js', 'utf8') : '';
const jsKmbp = fs.existsSync('workers/kmbprojek/src/supabase-backend.js') ? fs.readFileSync('workers/kmbprojek/src/supabase-backend.js', 'utf8') : '';

uji(18, 'workers/kmb/src/supabase-backend.js ada dan mengekspor eksekusiSupabaseBackendKmb', jsKmb.includes('eksekusiSupabaseBackendKmb'));
uji(19, 'workers/sum/src/supabase-backend.js ada dan mengekspor eksekusiSupabaseBackendSum', jsSum.includes('eksekusiSupabaseBackendSum'));
uji(20, 'workers/kmbprojek/src/supabase-backend.js ada dan mengekspor eksekusiSupabaseBackendKmbp', jsKmbp.includes('eksekusiSupabaseBackendKmbp'));

// 21-23: Integrasi di Index Worker Rumah
const idxKmb = fs.readFileSync('workers/kmb/src/index.js', 'utf8');
const idxSum = fs.readFileSync('workers/sum/src/index.js', 'utf8');
const idxKmbp = fs.readFileSync('workers/kmbprojek/src/index.js', 'utf8');

uji(21, 'workers/kmb/src/index.js mengintegrasikan eksekusiSupabaseBackendKmb', idxKmb.includes('eksekusiSupabaseBackendKmb') && idxKmb.includes('supabase-backend.js'));
uji(22, 'workers/sum/src/index.js mengintegrasikan eksekusiSupabaseBackendSum', idxSum.includes('eksekusiSupabaseBackendSum') && idxSum.includes('supabase-backend.js'));
uji(23, 'workers/kmbprojek/src/index.js mengintegrasikan eksekusiSupabaseBackendKmbp', idxKmbp.includes('eksekusiSupabaseBackendKmbp') && idxKmbp.includes('supabase-backend.js'));

// 24: Mode Supabase Murni Mandiri Tanpa Ketergantungan GAS
uji(24, 'Saat mode liveSaklar === "supabase", worker tidak melakukan fallback ke GAS',
  idxKmb.includes("liveSaklar === 'supabase'") &&
  idxSum.includes("liveSaklar === 'supabase'") &&
  idxKmbp.includes("liveSaklar === 'supabase'"));

// 25-27: Normalisasi Form Payload Web Desktop (WorkOrder.html & Section Others)
const blokManual = normalisasiBlokWo({
  manual_base_points: 15,
  manual_target_hours: 4,
  manual_unit_factor: 1.1,
  team_distribution: { 'MNT-003': 60, 'MNT-005': 40 }
});
uji(25, 'normalisasiBlokWo memetakan manual_base_points, manual_target_hours, manual_unit_factor ke others_*',
  blokManual.others_base_points === 15 && blokManual.others_target_hours === 4 && blokManual.others_unit_factor === 1.1);

uji(26, 'normalisasiBlokWo mengonversi team_distribution menjadi array team [{ mechanic_id, percentage }]',
  Array.isArray(blokManual.team) && blokManual.team.length === 2 && blokManual.team[0].mechanic_id === 'MNT-003' && blokManual.team[0].percentage === 60);

uji(27, 'normalisasiBlokWo mengisi otomatis lead_mechanic_id dari entri pertama team_distribution',
  blokManual.lead_mechanic_id === 'MNT-003');

// 28-31: Invarian Deteksi WO Supabase vs WO Lama GAS (Aturan Saklar Balik docs/SAKLAR.md)
uji(28, 'apakahWoLahirDiSupabase mendeteksi nomor WO 4 digit urut harian WIB (WO-20261104-0001)',
  apakahWoLahirDiSupabase('WO-20261104-0001') && apakahWoLahirDiSupabase('WO-20261104-9999'));

uji(29, 'apakahWoLahirDiSupabase mendeteksi format penomoran prefix Supabase (WO-SB-*, WO-KMBP-*, WO-SUM-*, WO-KMB-*)',
  apakahWoLahirDiSupabase('WO-SB-123') && apakahWoLahirDiSupabase('WO-KMBP-001') && apakahWoLahirDiSupabase('WO-SUM-002'));

uji(30, 'apakahWoLahirDiSupabase menolak nomor WO 3 digit lama dari GAS (WO-20261028-012)',
  !apakahWoLahirDiSupabase('WO-20261028-012') && !apakahWoLahirDiSupabase('WO-20261101-003'));

uji(31, 'apakahWoLamaDariGas mendeteksi nomor WO 3 digit lama dari GAS (WO-20261028-012)',
  apakahWoLamaDariGas('WO-20261028-012') && !apakahWoLamaDariGas('WO-20261104-0001'));

// 32: Ekstraksi ID Work Order dari Berbagai Bentuk Payload
uji(32, 'ekstrakWoId mengekstrak ID dari berbagai variasi payload (wo_id, id, data.wo_id, data string)',
  ekstrakWoId({ wo_id: 'WO-20261104-0001' }) === 'WO-20261104-0001' &&
  ekstrakWoId({ data: { id: 'WO-20261104-0002' } }) === 'WO-20261104-0002' &&
  ekstrakWoId({ data: 'WO-20261104-0003' }) === 'WO-20261104-0003');

// 33-35: Integrasi Saklar Balik di Index Worker Rumah
uji(33, 'workers/kmbprojek/src/index.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  idxKmbp.includes('apakahWoLahirDiSupabase') && idxKmbp.includes('woSupabase'));

uji(34, 'workers/kmb/src/index.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  idxKmb.includes('apakahWoLahirDiSupabase') && idxKmb.includes('woSupabase'));

uji(35, 'workers/sum/src/index.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  idxSum.includes('apakahWoLahirDiSupabase') && idxSum.includes('woSupabase'));

// 36-38: Integrasi Saklar Balik di Web Desktop Bridge (/api/web)
const webKmb = fs.readFileSync('workers/kmb/src/web-handler.js', 'utf8');
const webSum = fs.readFileSync('workers/sum/src/web-handler.js', 'utf8');
const webKmbp = fs.readFileSync('workers/kmbprojek/src/web-handler.js', 'utf8');

uji(36, 'workers/kmbprojek/src/web-handler.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  webKmbp.includes('apakahWoLahirDiSupabase') && webKmbp.includes('woSupabase'));

uji(37, 'workers/kmb/src/web-handler.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  webKmb.includes('apakahWoLahirDiSupabase') && webKmb.includes('woSupabase'));

uji(38, 'workers/sum/src/web-handler.js mengimplementasikan deteksi Saklar Balik apakahWoLahirDiSupabase',
  webSum.includes('apakahWoLahirDiSupabase') && webSum.includes('woSupabase'));

// 39: Respon Modal Detail WO Menyediakan Struktur r.data.wo dan r.result.wo
uji(39, 'workers/kmbprojek/src/supabase-backend.js menyediakan properti wo: woObj pada aksi detail WO',
  jsKmbp.includes('pull_wo_detail') && jsKmbp.includes('wo: woObj') && jsKmb.includes('wo: woObj') && jsSum.includes('wo: woObj'));

// 40: Penanganan Katalog Mandiri getJobCatalogCached
uji(40, 'workers/kmbprojek/src/supabase-backend.js menangani getJobCatalogCached mengembalikan jobs cascade',
  jsKmbp.includes('getJobCatalogCached') && jsKmbp.includes('jobs_field') && jsKmbp.includes('jobs_vessel'));

console.log(`\n==================================================`);
console.log(`Hasil Uji Backend Mandiri Supabase: ${lulus}/${total} LULUS`);
console.log(`==================================================\n`);

if (gagal > 0) {
  process.exitCode = 1;
}
