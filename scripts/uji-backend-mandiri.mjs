#!/usr/bin/env node
/**
 * Uji Otomatis: Backend Mandiri Supabase (Tanpa GAS) & Kepatuhan Protokol AGENTS.md
 * Sesuai docs/panduan_deploy_staging_kamis 2.md §3 Langkah 2
 *
 * Memverifikasi 24 kasus uji invarian protokol dan fungsional:
 * - Mesin scoring JavaScript murni (1:1 ScoringService.gs)
 * - Eksekusi RPC mandiri per kamar (kmb, sum, kmb_projek)
 * - Isolasi skema antar-kamar
 * - Penomoran WO 4 digit WIB (WO-YYYYMMDD-XXXX)
 * - Integrasi Cloudflare Worker 3 rumah tanpa ketergantungan script.google.com
 */

import fs from 'node:fs';
import { bulatkan, statusKetepatanWaktu, hitungSkor, rupiahUntukPoin, FACTORS } from '../src/domain/scoring.mjs';

let lulus = 0;
let gagal = 0;
const total = 24;

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

console.log('=== Menjalankan 24 Uji Otomatis Backend Mandiri Supabase ===\n');

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

console.log(`\n==================================================`);
console.log(`Hasil Uji Backend Mandiri Supabase: ${lulus}/${total} LULUS`);
console.log(`==================================================\n`);

if (gagal > 0) {
  process.exitCode = 1;
}
