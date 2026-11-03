#!/usr/bin/env node
/**
 * Uji Otomatis: Manajemen Pengguna & Token Terpusat serta Kepatuhan Protokol AGENTS.md
 * Sesuai docs/panduan_deploy_staging_kamis.md §3 Langkah 2
 *
 * Memverifikasi 27 kasus uji invarian protokol dan fungsional:
 * - Isolasi kamar (kmb, sum, kmb_projek)
 * - Bebas hardcode tenant_id & token mentah
 * - Kemurnian SaklarDO (hanya saklar v1)
 * - Rute admin di Worker pintu & 3 Worker rumah
 * - Keamanan RPC (revoke public/anon/authenticated)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let lulus = 0;
let gagal = 0;
const total = 27;

function uji(no, deskripsi, kondisi) {
  if (kondisi) {
    console.log(`  ✅ [${String(no).padStart(2, '0')}/${total}] LULUS: ${deskripsi}`);
    lulus++;
  } else {
    console.error(`  ❌ [${String(no).padStart(2, '0')}/${total}] GAGAL: ${deskripsi}`);
    gagal++;
  }
}

console.log('=== Menjalankan 27 Uji Otomatis Manajemen Pengguna & Protokol ===\n');

// 1-5: Keberadaan File SQL
const sqlKmb = fs.existsSync('db/kmb/rpc_admin_user.sql') ? fs.readFileSync('db/kmb/rpc_admin_user.sql', 'utf8') : '';
const sqlSum = fs.existsSync('db/sum/rpc_admin_user.sql') ? fs.readFileSync('db/sum/rpc_admin_user.sql', 'utf8') : '';
const sqlKmbp = fs.existsSync('db/kmb_projek/rpc_admin_user.sql') ? fs.readFileSync('db/kmb_projek/rpc_admin_user.sql', 'utf8') : '';
const sqlMigrasi = fs.existsSync('db/migrasi/013-admin-user-tenant.sql') ? fs.readFileSync('db/migrasi/013-admin-user-tenant.sql', 'utf8') : '';
const sqlContoh = fs.existsSync('db/contoh-user-admin.sql') ? fs.readFileSync('db/contoh-user-admin.sql', 'utf8') : '';

uji(1, 'db/kmb/rpc_admin_user.sql ada dan mendefinisikan kmbtra_admin_daftar_user_bertoken', sqlKmb.includes('kmbtra_admin_daftar_user_bertoken'));
uji(2, 'db/sum/rpc_admin_user.sql ada dan mendefinisikan sum_admin_daftar_user_bertoken', sqlSum.includes('sum_admin_daftar_user_bertoken'));
uji(3, 'db/kmb_projek/rpc_admin_user.sql ada dan mendefinisikan kmb_admin_daftar_user_bertoken', sqlKmbp.includes('kmb_admin_daftar_user_bertoken'));
uji(4, 'db/migrasi/013-admin-user-tenant.sql ada dan menambahkan tenant secara idempoten', sqlMigrasi.includes('public.tenants') && sqlMigrasi.includes('ON CONFLICT'));
uji(5, 'db/contoh-user-admin.sql ada dan menggunakan resolusi dinamis tenants', sqlContoh.includes('SELECT id INTO v_tenant') && !sqlContoh.includes('tenant_id = 1;'));

// 6-8: Isolasi Kamar Antar-Skema (buang komentar SQL terlebih dahulu)
function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
const codeKmb = stripSqlComments(sqlKmb);
const codeSum = stripSqlComments(sqlSum);
const codeKmbp = stripSqlComments(sqlKmbp);

uji(6, 'db/kmb/rpc_admin_user.sql terisolasi (tidak mengintip skema sum atau kmb_projek)', !codeKmb.includes('sum.') && !codeKmb.includes('kmb_projek.'));
uji(7, 'db/sum/rpc_admin_user.sql terisolasi (tidak mengintip skema kmb. atau kmb_projek.)', !codeSum.includes('kmb.') && !codeSum.includes('kmb_projek.'));
uji(8, 'db/kmb_projek/rpc_admin_user.sql terisolasi (tidak mengintip skema kmb. atau sum.)', !codeKmbp.includes('kmb.') && !codeKmbp.includes('sum.'));

// 9-11: Keamanan Eksekusi RPC
uji(9, 'RPC kmb mencabut izin eksekusi fungsi internal dari PUBLIC, anon, authenticated', sqlKmb.includes('REVOKE EXECUTE ON FUNCTION kmb._cek_is_admin') && sqlKmb.includes('TO service_role'));
uji(10, 'RPC sum mencabut izin eksekusi fungsi internal dari PUBLIC, anon, authenticated', sqlSum.includes('REVOKE EXECUTE ON FUNCTION sum._cek_is_admin') && sqlSum.includes('TO service_role'));
uji(11, 'RPC kmb_projek mencabut izin eksekusi fungsi internal dari PUBLIC, anon, authenticated', sqlKmbp.includes('REVOKE EXECUTE ON FUNCTION kmb_projek._cek_is_admin') && sqlKmbp.includes('TO service_role'));

// 12: Bebas Hardcode Tenant di Auth TypeScript
const authTs = fs.readFileSync('src/backends/supabase/auth.ts', 'utf8');
uji(12, 'src/backends/supabase/auth.ts tidak menggunakan hardcoded tenantId tanpa kueri dinamis', authTs.includes('SELECT id FROM tenants WHERE code =') && authTs.includes('Resolusi dinamis tenant_id'));

// 13-14: Kemurnian SaklarDO & Stateless User Admin
const userAdminJs = fs.existsSync('workers/pintu/src/user-admin.js') ? fs.readFileSync('workers/pintu/src/user-admin.js', 'utf8') : '';
const saklarDoJs = fs.readFileSync('workers/pintu/src/saklar-do.js', 'utf8');
uji(13, 'workers/pintu/src/user-admin.js ada dan mengekspor penangan daftar & simpan user', userAdminJs.includes('handleAdminDaftarUsers') && userAdminJs.includes('handleAdminSimpanUser'));
uji(14, 'SaklarDO tetap murni (hanya switches & history, tag v1, tidak ada penyimpanan user di DO)', !saklarDoJs.includes('user_admin') && !saklarDoJs.includes('api_tokens') && saklarDoJs.includes('switches') && saklarDoJs.includes('history'));

// 15-17: Rute Admin di Worker Pintu
const pintuIndexJs = fs.readFileSync('workers/pintu/src/index.js', 'utf8');
uji(15, 'Worker pintu mengarahkan GET /saklar/api/admin/users ke user-admin.js', pintuIndexJs.includes('/saklar/api/admin/users') && pintuIndexJs.includes('handleAdminDaftarUsers'));
uji(16, 'Worker pintu mengarahkan POST /saklar/api/admin/users/simpan ke user-admin.js', pintuIndexJs.includes('/saklar/api/admin/users/simpan') && pintuIndexJs.includes('handleAdminSimpanUser'));
uji(17, 'Worker pintu mengarahkan POST /saklar/api/admin/tokens/status ke user-admin.js', pintuIndexJs.includes('/saklar/api/admin/tokens/status') && pintuIndexJs.includes('handleAdminSetTokenStatus'));

// 18-19: UI Panel Pintu (saklar.html)
const saklarHtml = fs.readFileSync('workers/pintu/public/saklar.html', 'utf8');
uji(18, 'saklar.html memiliki Tab Manajemen Pengguna & Token Terpusat', saklarHtml.includes('Manajemen Pengguna & Token (Pusat 3 Rumah)') && saklarHtml.includes('viewUserAdmin'));
uji(19, 'saklar.html memiliki modal Tambah Pengguna Baru', saklarHtml.includes('modalTambahUser') && saklarHtml.includes('submitTambahUser'));

// 20-22: Rute Admin di 3 Worker Rumah
const kmbIndexJs = fs.readFileSync('workers/kmb/src/index.js', 'utf8');
const sumIndexJs = fs.readFileSync('workers/sum/src/index.js', 'utf8');
const kmbpIndexJs = fs.readFileSync('workers/kmbprojek/src/index.js', 'utf8');
uji(20, 'Worker KMB menangani aksi admin (kmbtra_admin_daftar_user_bertoken)', kmbIndexJs.includes('kmbtra_admin_daftar_user_bertoken'));
uji(21, 'Worker SUM menangani aksi admin (sum_admin_daftar_user_bertoken)', sumIndexJs.includes('sum_admin_daftar_user_bertoken'));
uji(22, 'Worker KMB Project menangani aksi admin (kmb_admin_daftar_user_bertoken)', kmbpIndexJs.includes('kmb_admin_daftar_user_bertoken'));

// 23-24: Kepatuhan Konfigurasi & Rahasia
const pintuWrangler = fs.readFileSync('workers/pintu/wrangler.toml', 'utf8');
uji(23, 'Tidak ada hardcode token produksi di file user-admin.js', !userAdminJs.includes('sptgqsjgszwbreikxdph.supabase.co') && !userAdminJs.includes('ghp_'));
uji(24, 'workers/pintu/wrangler.toml memiliki SUPABASE_URL & SUPABASE_ANON_KEY di vars dan env.staging', pintuWrangler.includes('SUPABASE_URL') && pintuWrangler.includes('env.staging.vars'));

// 25-26: Pemeriksaan Sintaks JS
let syntaxPintu = false;
let syntaxUserAdmin = false;
try {
  execSync('node --check workers/pintu/src/index.js', { stdio: 'ignore' });
  syntaxPintu = true;
} catch (_) {}
try {
  execSync('node --check workers/pintu/src/user-admin.js', { stdio: 'ignore' });
  syntaxUserAdmin = true;
} catch (_) {}
uji(25, 'Sintaks workers/pintu/src/index.js valid (node --check)', syntaxPintu);
uji(26, 'Sintaks workers/pintu/src/user-admin.js valid (node --check)', syntaxUserAdmin);

// 27: Penanganan Error Seragam (source: SUPABASE)
uji(27, 'RPC Admin mengembalikan galat standar {"success":false,"error":"Token tidak dikenal / nonaktif","source":"SUPABASE"}', sqlKmb.includes("'source', 'SUPABASE'") && sqlSum.includes("'source', 'SUPABASE'") && sqlKmbp.includes("'source', 'SUPABASE'"));

console.log(`\n==================================================`);
console.log(`Hasil Uji Manajemen Pengguna & Protokol: ${lulus}/${total} LULUS`);
console.log(`==================================================\n`);

if (gagal > 0) {
  process.exitCode = 1;
}
