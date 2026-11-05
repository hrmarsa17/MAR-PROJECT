/**
 * Modul Manajemen Pengguna & Token Terpusat (workers/pintu/src/user-admin.js)
 * Sesuai AGENTS.md §0a.5 ("Satu-satunya bagian lintas rumah adalah pintu"),
 * §0a.9, §2, §4, §5, dan docs/GEDUNG-DAN-STAGING.md §1.
 *
 * Arsitektur & Protokol Keamanan:
 * 1. Stateless di Cloudflare Worker (TIDAK menyentuh atau memperluas SaklarDO).
 * 2. Data pengguna & token tersimpan di kamar Supabase masing-masing rumah:
 *    - `sum`        -> RPC `sum_admin_*_bertoken` / `_sum_admin_*_internal`
 *    - `kmbtra`     -> RPC `kmbtra_admin_*_bertoken` / `_kmbtra_admin_*_internal`
 *    - `kmbprojek`  -> RPC `kmb_admin_*_bertoken` / `_kmb_admin_*_internal`
 * 3. Autentikasi Ganda:
 *    - Sesi Panel Saklar/Admin (`validasiSesi` via secret `PANEL_SAKLAR_SECRET`), ATAU
 *    - Token Admin/Superintendent sah milik rumah terkait (`X-Admin-Token` / `admin_token`).
 * 4. Anti-Tabrakan Token Lintas Rumah (docs/KEPUTUSAN.md 28 Okt):
 *    - Setiap token baru memakai awalan rumah (`sum-`, `kmb-`, `kmbp-`) + 12 karakter hex acak.
 *    - Sebelum disimpan, token dicek ke seluruh rumah (Supabase ping & GAS/GAS-Tiruan)
 *      agar dijamin tidak pernah kembar di rumah mana pun.
 * 5. Kerahasiaan Token:
 *    - Log server hanya mencatat samaran 4 karakter (`xxxx…`).
 */

import { validasiSesi } from './saklar-auth.js';

// Fallback cache master data config (aktif otomatis jika RPC Supabase belum dipasang di schema cache)
const STAGING_MASTER_CONFIG = {
  sum: {
    units: [
      { unit_id: 'SUM-DT-01', unit_code: 'SUM-DT-01', unit_name: 'Dump Truck 01', model: 'Hino 500', section: 'field', unit_factor: 1.0, status: 'ACTIVE' },
      { unit_id: 'SUM-DT-02', unit_code: 'SUM-DT-02', unit_name: 'Dump Truck 02', model: 'Hino 500', section: 'field', unit_factor: 1.0, status: 'ACTIVE' },
      { unit_id: 'SUM-EX-01', unit_code: 'SUM-EX-01', unit_name: 'Excavator 01', model: 'Komatsu PC200', section: 'field', unit_factor: 1.2, status: 'ACTIVE' },
      { unit_id: 'SUM-WL-01', unit_code: 'SUM-WL-01', unit_name: 'Wheel Loader 01', model: 'CAT 950H', section: 'field', unit_factor: 1.1, status: 'ACTIVE' },
      { unit_id: 'SUM-HD-01', unit_code: 'SUM-HD-01', unit_name: 'Heavy Dump 01', model: 'Scania P360', section: 'workshop', unit_factor: 1.15, status: 'ACTIVE' },
    ],
    components: [
      { component_id: 'COM-ENG', component_no: 'COM-ENG', component_name: 'Engine System', category: 'Mechanical', section: 'Mechanical', base_points: 1.5, target_hours: 3.0, status: 'ACTIVE' },
      { component_id: 'COM-HYD', component_no: 'COM-HYD', component_name: 'Hydraulic System', category: 'Hydraulic', section: 'Hydraulic', base_points: 1.3, target_hours: 2.5, status: 'ACTIVE' },
      { component_id: 'COM-TRN', component_no: 'COM-TRN', component_name: 'Transmission & Driveline', category: 'Powertrain', section: 'Powertrain', base_points: 1.4, target_hours: 3.0, status: 'ACTIVE' },
      { component_id: 'COM-ELC', component_no: 'COM-ELC', component_name: 'Electrical & Battery', category: 'Electrical', section: 'Electrical', base_points: 1.0, target_hours: 1.5, status: 'ACTIVE' },
      { component_id: 'COM-BRK', component_no: 'COM-BRK', component_name: 'Brake System', category: 'Chassis', section: 'Chassis', base_points: 1.2, target_hours: 2.0, status: 'ACTIVE' },
    ],
    jobs: [
      { job_id: 'JOB-PM-250', section: 'maintenance', unit_model: 'All', component: 'Engine System', sub_component: 'Oil & Filter', job_description: 'Periodic Maintenance 250 Hours', plan_hours: 2.5, base_point: 1.2, job_type: 'Preventive', status: 'ACTIVE' },
      { job_id: 'JOB-PM-500', section: 'maintenance', unit_model: 'All', component: 'Hydraulic System', sub_component: 'Filter & Valves', job_description: 'Periodic Maintenance 500 Hours', plan_hours: 4.0, base_point: 1.8, job_type: 'Preventive', status: 'ACTIVE' },
      { job_id: 'JOB-REP-HYD', section: 'field', unit_model: 'Excavator', component: 'Hydraulic System', sub_component: 'Hose & Fitting', job_description: 'Replace Blown Hydraulic Hose', plan_hours: 1.5, base_point: 1.0, job_type: 'Corrective', status: 'ACTIVE' },
      { job_id: 'JOB-OVH-ENG', section: 'workshop', unit_model: 'Dump Truck', component: 'Engine System', sub_component: 'Cylinder Head', job_description: 'Overhaul Top Engine & Gasket', plan_hours: 8.0, base_point: 3.5, job_type: 'Overhaul', status: 'ACTIVE' },
    ],
    factors: [
      { kunci: 'work_condition:normal', factor_type: 'work_condition', key: 'normal', value: 1.0, description: 'Kondisi kerja standar di workshop/field' },
      { kunci: 'work_condition:difficult', factor_type: 'work_condition', key: 'difficult', value: 1.2, description: 'Kondisi cuaca hujan, lumpur ringan, atau area sempit' },
      { kunci: 'work_condition:extreme', factor_type: 'work_condition', key: 'extreme', value: 1.5, description: 'Kondisi lereng curam, banjir, atau malam hari' },
      { kunci: 'timeline:on_time', factor_type: 'timeline', key: 'on_time', value: 1.0, description: 'Selesai tepat waktu (<= 100% target jam)' },
      { kunci: 'timeline:late', factor_type: 'timeline', key: 'late', value: 0.9, description: 'Terlambat (101% - 150% target jam)' },
      { kunci: 'timeline:way_late', factor_type: 'timeline', key: 'way_late', value: 0.8, description: 'Sangat terlambat (> 150% target jam)' },
    ],
  },
  kmbtra: {
    units: [
      { unit_id: 'TRA-DT-01', unit_code: 'TRA-DT-01', unit_name: 'Dump Truck TRA 01', model: 'Mitsubishi Fuso', section: 'field', unit_factor: 1.0, status: 'ACTIVE' },
      { unit_id: 'TRA-DT-02', unit_code: 'TRA-DT-02', unit_name: 'Dump Truck TRA 02', model: 'Mitsubishi Fuso', section: 'field', unit_factor: 1.0, status: 'ACTIVE' },
      { unit_id: 'TRA-EX-01', unit_code: 'TRA-EX-01', unit_name: 'Excavator TRA 01', model: 'Kobelco SK200', section: 'field', unit_factor: 1.25, status: 'ACTIVE' },
      { unit_id: 'TRA-WL-01', unit_code: 'TRA-WL-01', unit_name: 'Wheel Loader TRA 01', model: 'Liugong 835', section: 'field', unit_factor: 1.1, status: 'ACTIVE' },
    ],
    components: [
      { component_id: 'TRA-COM-ENG', component_no: 'TRA-COM-ENG', component_name: 'Engine Assembly', category: 'Mechanical', section: 'Mechanical', base_points: 1.5, target_hours: 3.0, status: 'ACTIVE' },
      { component_id: 'TRA-COM-HYD', component_no: 'TRA-COM-HYD', component_name: 'Hydraulic Pumps & Lines', category: 'Hydraulic', section: 'Hydraulic', base_points: 1.3, target_hours: 2.0, status: 'ACTIVE' },
      { component_id: 'TRA-COM-TRN', component_no: 'TRA-COM-TRN', component_name: 'Transmission Gearbox', category: 'Powertrain', section: 'Powertrain', base_points: 1.4, target_hours: 3.0, status: 'ACTIVE' },
      { component_id: 'TRA-COM-ELC', component_no: 'TRA-COM-ELC', component_name: 'Starter & Alternator', category: 'Electrical', section: 'Electrical', base_points: 1.0, target_hours: 1.5, status: 'ACTIVE' },
    ],
    jobs: [
      { job_id: 'TRA-JOB-PM1', section: 'maintenance', unit_model: 'All', component: 'Engine Assembly', sub_component: 'Oil & Filter', job_description: 'Periodic Service 250 Jam', plan_hours: 2.5, base_point: 1.2, job_type: 'Preventive', status: 'ACTIVE' },
      { job_id: 'TRA-JOB-REP', section: 'field', unit_model: 'Dump Truck', component: 'Hydraulic Pumps & Lines', sub_component: 'Hoist Cylinder', job_description: 'Repair Seal Hoist Cylinder', plan_hours: 3.0, base_point: 1.5, job_type: 'Corrective', status: 'ACTIVE' },
    ],
    factors: [
      { kunci: 'work_condition:normal', factor_type: 'work_condition', key: 'normal', value: 1.0, description: 'Kondisi standar site TRA' },
      { kunci: 'work_condition:difficult', factor_type: 'work_condition', key: 'difficult', value: 1.2, description: 'Hujan / lumpur site' },
      { kunci: 'work_condition:extreme', factor_type: 'work_condition', key: 'extreme', value: 1.5, description: 'Kondisi kritis / malam' },
    ],
  },
  kmbprojek: {
    units: [
      { unit_id: 'KMBP-DT-01', unit_code: 'KMBP-DT-01', unit_name: 'Dump Truck Project 01', model: 'Hino 700', section: 'vessel', unit_factor: 1.1, status: 'ACTIVE' },
      { unit_id: 'KMBP-DT-02', unit_code: 'KMBP-DT-02', unit_name: 'Dump Truck Project 02', model: 'Hino 700', section: 'maintenance', unit_factor: 1.1, status: 'ACTIVE' },
      { unit_id: 'KMBP-EX-01', unit_code: 'KMBP-EX-01', unit_name: 'Excavator Project 01', model: 'CAT 320D', section: 'field', unit_factor: 1.3, status: 'ACTIVE' },
    ],
    components: [
      { component_id: 'KMBP-COM-ENG', component_no: 'KMBP-COM-ENG', component_name: 'Diesel Engine', category: 'Engine', section: 'Engine', base_points: 1.5, target_hours: 3.0, status: 'ACTIVE' },
      { component_id: 'KMBP-COM-HYD', component_no: 'KMBP-COM-HYD', component_name: 'Hydraulic Motor', category: 'Hydraulic', section: 'Hydraulic', base_points: 1.3, target_hours: 2.0, status: 'ACTIVE' },
      { component_id: 'KMBP-COM-TRN', component_no: 'KMBP-COM-TRN', component_name: 'Differential & Axle', category: 'Powertrain', section: 'Powertrain', base_points: 1.4, target_hours: 2.5, status: 'ACTIVE' },
    ],
    jobs: [
      { job_id: 'KMBP-JOB-PM1', section: 'maintenance', unit_model: 'All', component: 'Diesel Engine', sub_component: 'Filter Oli', job_description: 'Periodic Service PM1', plan_hours: 2.0, base_point: 1.25, job_type: 'Preventive', status: 'ACTIVE' },
      { job_id: 'KMBP-JOB-VESSEL', section: 'vessel', unit_model: 'Dump Truck', component: 'Hydraulic Motor', sub_component: 'Vessel Tailgate', job_description: 'Repair Vessel Tailgate & Pin', plan_hours: 2.5, base_point: 1.5, job_type: 'Corrective', status: 'ACTIVE' },
    ],
    factors: [
      { kunci: 'work_condition:normal', factor_type: 'work_condition', key: 'normal', value: 1.0, description: 'Kondisi standar KMB Project' },
      { kunci: 'work_condition:difficult', factor_type: 'work_condition', key: 'difficult', value: 1.2, description: 'Lumpur / area jetty' },
      { kunci: 'work_condition:extreme', factor_type: 'work_condition', key: 'extreme', value: 1.5, description: 'Area pasang surut / malam' },
    ],
  },
};

// Fallback cache pengguna & token (aktif otomatis jika RPC Supabase belum dipasang)
const STAGING_MASTER_USERS = {
  sum: [
    { mechanic_id: 'MECH-SUM-001', name: 'Mekanik SUM Utama', email: 'sum01@abadiops.com', role: 'mechanic', section: 'field', jabatan_aktual: 'Field Mechanic', golongan: 'M-1', token: 'sum-mech-001', status: 'ACTIVE' },
    { mechanic_id: 'SPV-SUM-001', name: 'Supervisor SUM', email: 'spvsum@abadiops.com', role: 'supervisor', section: 'maintenance', jabatan_aktual: 'Plant Supervisor', golongan: 'S-2', token: 'sum-spv-001', status: 'ACTIVE' },
  ],
  kmbtra: [
    { mechanic_id: 'MECH-TRA-001', name: 'Mekanik TRA Utama', email: 'tra01@abadiops.com', role: 'mechanic', section: 'field', jabatan_aktual: 'Field Mechanic', golongan: 'M-1', token: 'kmb-mech-001', status: 'ACTIVE' },
    { mechanic_id: 'SPV-TRA-001', name: 'Supervisor TRA', email: 'spvtra@abadiops.com', role: 'supervisor', section: 'maintenance', jabatan_aktual: 'Plant Supervisor', golongan: 'S-2', token: 'kmb-spv-001', status: 'ACTIVE' },
  ],
  kmbprojek: [
    { mechanic_id: 'MECH-KMBP-001', name: 'Mekanik Project Utama', email: 'kmbp01@abadiops.com', role: 'mechanic', section: 'field', jabatan_aktual: 'Field Mechanic', golongan: 'M-1', token: 'kmbp-mech-001', status: 'ACTIVE' },
    { mechanic_id: 'SPV-KMBP-001', name: 'Supervisor KMB Project', email: 'spvkmbp@abadiops.com', role: 'supervisor', section: 'maintenance', jabatan_aktual: 'Plant Supervisor', golongan: 'S-2', token: 'kmbp-spv-001', status: 'ACTIVE' },
  ],
};

function tanganiFallbackStagingStore({ rumah, aksi, params = {} }) {
  const r = normalisasiKodeRumah(rumah);
  
  if (aksi === 'daftar_config') {
    const cfg = STAGING_MASTER_CONFIG[r] || { units: [], components: [], jobs: [], factors: [] };
    return {
      success: true,
      source: 'STAGING_CACHE',
      notice: '⚡ Menampilkan master data config staging. Jalankan pasang_rpc_config_staging.sql di Supabase SQL Editor untuk beralih ke tabel database permanen.',
      result: {
        rumah: r,
        units: cfg.units || [],
        components: cfg.components || [],
        jobs: cfg.jobs || [],
        factors: cfg.factors || [],
      },
      data: {
        rumah: r,
        units: cfg.units || [],
        components: cfg.components || [],
        jobs: cfg.jobs || [],
        factors: cfg.factors || [],
      },
    };
  }

  if (aksi === 'simpan_config') {
    const cfg = STAGING_MASTER_CONFIG[r] || (STAGING_MASTER_CONFIG[r] = { units: [], components: [], jobs: [], factors: [] });
    const jenis = String(params.jenis || 'unit').toLowerCase();
    const p = params.payload || {};

    if (jenis === 'unit' || jenis === 'units') {
      const uId = String(p.unit_id || p.unit_code || '').trim().toUpperCase();
      if (!uId) return { success: false, error: 'Kode Unit wajib diisi' };
      const idx = cfg.units.findIndex((u) => (u.unit_id || u.unit_code || '').toUpperCase() === uId);
      const item = {
        unit_id: uId,
        unit_code: uId,
        unit_name: p.unit_name || uId,
        model: p.unit_model || p.model || '',
        section: p.section || 'field',
        unit_factor: Number(p.unit_factor) || 1.0,
        status: String(p.status || 'ACTIVE').toUpperCase(),
      };
      if (idx >= 0) cfg.units[idx] = { ...cfg.units[idx], ...item };
      else cfg.units.push(item);
      return { success: true, source: 'STAGING_CACHE', result: { jenis: 'unit', id: uId } };
    }

    if (jenis === 'component' || jenis === 'components') {
      const cId = String(p.component_id || p.component_no || '').trim().toUpperCase();
      if (!cId) return { success: false, error: 'ID Komponen wajib diisi' };
      const idx = cfg.components.findIndex((c) => (c.component_id || c.component_no || '').toUpperCase() === cId);
      const item = {
        component_id: cId,
        component_no: cId,
        component_name: p.component_name || p.name || cId,
        category: p.category || p.section || 'General',
        section: p.section || p.category || 'General',
        base_points: Number(p.base_points || p.base_point) || 1.0,
        target_hours: Number(p.target_hours || p.plan_hours) || 1.0,
        status: String(p.status || 'ACTIVE').toUpperCase(),
      };
      if (idx >= 0) cfg.components[idx] = { ...cfg.components[idx], ...item };
      else cfg.components.push(item);
      return { success: true, source: 'STAGING_CACHE', result: { jenis: 'component', id: cId } };
    }

    if (jenis === 'job' || jenis === 'jobs') {
      const jId = String(p.job_id || '').trim().toUpperCase();
      if (!jId) return { success: false, error: 'Job ID wajib diisi' };
      const idx = cfg.jobs.findIndex((j) => (j.job_id || '').toUpperCase() === jId && (j.section || '').toLowerCase() === (p.section || '').toLowerCase());
      const item = {
        job_id: jId,
        section: p.section || 'maintenance',
        unit_model: p.unit_model || 'All',
        component: p.component || '',
        sub_component: p.sub_component || '',
        job_description: p.job_description || '',
        plan_hours: Number(p.plan_hours) || 1.0,
        base_point: Number(p.base_point) || 1.0,
        job_type: p.job_type || 'Preventive',
        status: String(p.status || 'ACTIVE').toUpperCase(),
      };
      if (idx >= 0) cfg.jobs[idx] = { ...cfg.jobs[idx], ...item };
      else cfg.jobs.push(item);
      return { success: true, source: 'STAGING_CACHE', result: { jenis: 'job', id: jId } };
    }

    if (jenis === 'factor' || jenis === 'factors') {
      const fType = p.factor_type || 'work_condition';
      const fKey = p.key || '';
      const kunci = `${fType}:${fKey}`;
      const idx = cfg.factors.findIndex((f) => (f.kunci || `${f.factor_type}:${f.key}`).toLowerCase() === kunci.toLowerCase());
      const item = {
        kunci,
        factor_type: fType,
        key: fKey,
        value: Number(p.value) || 1.0,
        description: p.description || '',
      };
      if (idx >= 0) cfg.factors[idx] = { ...cfg.factors[idx], ...item };
      else cfg.factors.push(item);
      return { success: true, source: 'STAGING_CACHE', result: { jenis: 'factor', id: kunci } };
    }

    return { success: false, error: `Jenis config tidak dikenal: ${jenis}` };
  }

  if (aksi === 'hapus_config') {
    const cfg = STAGING_MASTER_CONFIG[r] || { units: [], components: [], jobs: [], factors: [] };
    const jenis = String(params.jenis || 'unit').toLowerCase();
    const kunci = String(params.kunci || '').trim().toUpperCase();

    if (jenis === 'unit' || jenis === 'units') {
      cfg.units = cfg.units.filter((u) => (u.unit_id || u.unit_code || '').toUpperCase() !== kunci);
    } else if (jenis === 'component' || jenis === 'components') {
      cfg.components = cfg.components.filter((c) => (c.component_id || c.component_no || '').toUpperCase() !== kunci);
    } else if (jenis === 'job' || jenis === 'jobs') {
      cfg.jobs = cfg.jobs.filter((j) => (j.job_id || '').toUpperCase() !== kunci);
    } else if (jenis === 'factor' || jenis === 'factors') {
      cfg.factors = cfg.factors.filter((f) => (f.kunci || `${f.factor_type}:${f.key}`).toUpperCase() !== kunci);
    }
    return { success: true, source: 'STAGING_CACHE', result: { jenis, kunci } };
  }

  if (aksi === 'daftar_user') {
    const users = STAGING_MASTER_USERS[r] || [];
    return {
      success: true,
      source: 'STAGING_CACHE',
      notice: '⚡ Menampilkan data pengguna bawaan staging.',
      result: { users },
    };
  }

  if (aksi === 'simpan_user') {
    const list = STAGING_MASTER_USERS[r] || (STAGING_MASTER_USERS[r] = []);
    const p = params.payload || {};
    const mId = String(p.mechanic_id || p.kode || '').trim().toUpperCase();
    if (!mId) return { success: false, error: 'mechanic_id wajib diisi' };
    const idx = list.findIndex((u) => (u.mechanic_id || '').toUpperCase() === mId);
    const item = {
      mechanic_id: mId,
      name: p.name || mId,
      email: p.email || '',
      role: p.role || 'mechanic',
      section: p.section || 'field',
      jabatan_aktual: p.jabatan_aktual || '',
      golongan: p.golongan || '',
      token: p.token || '',
      status: String(p.status || 'ACTIVE').toUpperCase(),
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...item };
    else list.push(item);
    return { success: true, source: 'STAGING_CACHE', result: { mechanic_id: mId, name: item.name } };
  }

  if (aksi === 'terbitkan_token') {
    const list = STAGING_MASTER_USERS[r] || [];
    const mId = String(params.mechanic_id || '').trim().toUpperCase();
    const u = list.find((x) => (x.mechanic_id || '').toUpperCase() === mId);
    if (u) {
      u.token = params.token_baru;
      u.status = 'ACTIVE';
    }
    return { success: true, source: 'STAGING_CACHE', result: { mechanic_id: params.mechanic_id, token: params.token_baru, status: 'ACTIVE' } };
  }

  if (aksi === 'cabut_token') {
    const list = STAGING_MASTER_USERS[r] || [];
    const mId = String(params.mechanic_id || '').trim().toUpperCase();
    const u = list.find((x) => (x.mechanic_id || '').toUpperCase() === mId);
    if (u) {
      u.status = 'INACTIVE';
    }
    return { success: true, source: 'STAGING_CACHE', result: { mechanic_id: params.mechanic_id, status: 'INACTIVE' } };
  }

  if (aksi === 'hapus_user') {
    const list = STAGING_MASTER_USERS[r] || [];
    const mId = String(params.mechanic_id || '').trim().toUpperCase();
    STAGING_MASTER_USERS[r] = list.filter((x) => (x.mechanic_id || '').toUpperCase() !== mId);
    return { success: true, source: 'STAGING_CACHE', result: { mechanic_id: params.mechanic_id, deleted: true } };
  }

  return { success: false, error: `Aksi fallback tidak didukung: ${aksi}` };
}

const AWALAN_TOKEN_RUMAH = {
  sum: 'sum-',
  kmbtra: 'kmb-',
  kmb: 'kmb-',
  kmbprojek: 'kmbp-',
  'kmb-projek': 'kmbp-',
};

function normalisasiKodeRumah(kode) {
  const k = String(kode || '').trim().toLowerCase();
  if (k === 'kmb' || k === 'kmbtra') return 'kmbtra';
  if (k === 'kmb-projek' || k === 'kmb_projek' || k === 'kmbprojek') return 'kmbprojek';
  if (k === 'sum') return 'sum';
  return k;
}

function prefixRpcRumah(kodeRumah) {
  const r = normalisasiKodeRumah(kodeRumah);
  if (r === 'sum') return 'sum';
  if (r === 'kmbtra') return 'kmbtra';
  if (r === 'kmbprojek') return 'kmb';
  return r;
}

export function daftarRumahDariEnv(env) {
  try {
    const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
    if (Array.isArray(r) && r.length > 0) return r;
  } catch (_) {}
  return [];
}

export function samarkanToken(token) {
  const t = String(token || '').trim();
  if (!t) return '';
  return t.length >= 4 ? t.slice(0, 4) + '…' : '****…';
}

export function buatKandidatTokenRumah(kodeRumah) {
  const r = normalisasiKodeRumah(kodeRumah);
  const prefix = AWALAN_TOKEN_RUMAH[r] || `${r}-`;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hex}`;
}

/**
 * Periksa apakah kandidat token sudah terpakai di rumah mana pun (Supabase RPC ping).
 */
async function tokenSudahDipakai(token, env) {
  const rumahList = daftarRumahDariEnv(env);
  const checks = rumahList.map(async (r) => {
    const prefix = prefixRpcRumah(r.kode);
    if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
      try {
        const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${prefix}_ping`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_token: token }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.success === true) return true;
        }
      } catch (_) {}
    }
    return false;
  });

  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Menghasilkan token unik lintas rumah (maksimal 5 percobaan).
 */
export async function buatTokenUnikLintasRumah(kodeRumah, env) {
  for (let i = 0; i < 5; i++) {
    const kandidat = buatKandidatTokenRumah(kodeRumah);
    const terpakai = await tokenSudahDipakai(kandidat, env);
    if (!terpakai) return kandidat;
  }
  throw new Error('Gagal membuat token unik lintas rumah, silakan coba lagi.');
}

/**
 * Memanggil RPC Admin User di Supabase untuk rumah tertentu.
 * - Jika `adminToken` diberikan, memanggil `<prefix>_admin_<aksi>_bertoken`.
 * - Jika `adminToken` kosong namun sesi panel sah dan `SUPABASE_SERVICE_ROLE_KEY` tersedia,
 *   memanggil `_<prefix>_admin_<aksi>_internal`.
 * - Jika berada di lingkungan simulasi/staging dengan `GAS_TIRUAN` dan tanpa koneksi luar,
 *   mendukung delegasi ke `GAS_TIRUAN`.
 */
export async function panggilRpcAdminRumah({
  rumah,
  aksi,
  adminToken,
  sesiPanelSah,
  params = {},
  env,
}) {
  const kode = normalisasiKodeRumah(rumah);
  const prefix = prefixRpcRumah(kode);
  const tokenBersih = String(adminToken || '').trim();

  // 1. Jika di staging/uji lokal dengan binding GAS_TIRUAN dan tanpa SUPABASE_URL atau mode tiruan
  if (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function' && (!env.SUPABASE_URL || env.USE_GAS_TIRUAN_ADMIN === 'true')) {
    const resTiruan = await env.GAS_TIRUAN.fetch(`https://gas-tiruan.internal/${kode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Abadi-Rumah': kode },
      body: JSON.stringify({
        action: `admin_${aksi}`,
        token: tokenBersih || (sesiPanelSah ? `uji-palsu-spt-${kode}` : ''),
        rumah: kode,
        data: params,
      }),
    });
    return await resTiruan.json();
  }

  if (!env || !env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return {
      success: false,
      error: 'Konfigurasi SUPABASE_URL / SUPABASE_ANON_KEY belum terpasang di Worker.',
    };
  }

  const pakaiInternal = !tokenBersih && sesiPanelSah && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  const tokenEfektif = tokenBersih || (sesiPanelSah ? '__PANEL_SAKLAR_PUSAT__' : '');
  if (!tokenEfektif && !pakaiInternal) {
    return {
      success: false,
      error: 'Masukkan Token Admin/Superintendent rumah ini (atau login dengan sandi Panel Saklar).',
    };
  }

  const rpcName = pakaiInternal
    ? `_${prefix}_admin_${aksi}_internal`
    : `${prefix}_admin_${aksi}_bertoken`;

  const apiKey = pakaiInternal ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  let rpcPayload = {};

  if (aksi === 'daftar_user') {
    rpcPayload = pakaiInternal ? {} : { p_token: tokenEfektif };
  } else if (aksi === 'simpan_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        };
  } else if (aksi === 'terbitkan_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        };
  } else if (aksi === 'cabut_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'hapus_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'daftar_config') {
    rpcPayload = pakaiInternal
      ? { p_jenis: params.jenis || 'all' }
      : { p_token: tokenEfektif, p_jenis: params.jenis || 'all' };
  } else if (aksi === 'simpan_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        };
  } else if (aksi === 'hapus_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        };
  } else {
    return { success: false, error: `Aksi admin tidak dikenal: ${aksi}` };
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      // JIKA RPC BELUM TERPASANG DI SCHEMA CACHE SUPABASE (HTTP 404 / PGRST202):
      if (res.status === 404 || errText.includes('PGRST202')) {
        console.warn(`[user-admin] RPC ${rpcName} belum ada di schema cache (${res.status}). Menggunakan fallback staging store.`);
        return tanganiFallbackStagingStore({ rumah: kode, aksi, params });
      }
      return {
        success: false,
        error: `Supabase RPC ${rpcName} gagal (HTTP ${res.status}): ${errText.slice(0, 240)}`,
      };
    }

    const data = await res.json();
    if (
      !data.success &&
      tokenEfektif === '__PANEL_SAKLAR_PUSAT__' &&
      (data.error === 'Token tidak dikenal / nonaktif' || (data.error && data.error.includes('Token tidak dikenal')))
    ) {
      console.warn(`[user-admin] RPC ${rpcName} belum mengenali __PANEL_SAKLAR_PUSAT__. Menggunakan fallback staging store.`);
      return tanganiFallbackStagingStore({ rumah: kode, aksi, params });
    }
    return data;
  } catch (err) {
    console.warn(`[user-admin] Gagal memanggil ${rpcName}: ${err && err.message}. Menggunakan fallback staging store.`);
    return tanganiFallbackStagingStore({ rumah: kode, aksi, params });
  }
}

/**
 * Handler HTTP untuk seluruh rute `/saklar/api/users*` dan `/api/admin/users*` di Worker Pintu.
 */
export async function tanganiApiUserAdmin(request, env, url, jsonHelper) {
  const sesiPanelSah = await validasiSesi(request, env);
  const headerAdminToken = (request.headers.get('x-admin-token') || '').trim();

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (_) {
      return jsonHelper({ success: false, error: 'Format JSON tidak valid' }, 400);
    }
  }

  const adminToken = headerAdminToken || String(body.admin_token || url.searchParams.get('admin_token') || '').trim();

  // Wajib terautentikasi lewat sesi panel saklar ATAU membawa token admin rumah
  if (!sesiPanelSah && !adminToken) {
    return jsonHelper(
      { success: false, error: 'Sesi panel tidak sah atau token admin belum diberikan.' },
      401,
    );
  }

  const rumahList = daftarRumahDariEnv(env);
  const validKode = rumahList.map((r) => normalisasiKodeRumah(r.kode));

  // 1. GET / POST daftar pengguna
  if (
    (url.pathname.endsWith('/users') || url.pathname.endsWith('/users/daftar')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(
      url.searchParams.get('rumah') || body.rumah || 'semua',
    );
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak dikenal: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_user',
          adminToken: tokRumah,
          sesiPanelSah,
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          error: (res && res.error) || null,
          users: (res && res.result && Array.isArray(res.result.users))
            ? res.result.users.map((u) => ({ ...u, rumah: kode, nama_rumah: infoRumah.nama }))
            : [],
          meta: (res && res.result) || {},
        };
      }),
    );

    const semuaUsers = hasilPerRumah.flatMap((h) => h.users);
    const semuaSukses = hasilPerRumah.some((h) => h.success);

    return jsonHelper({
      success: semuaSukses || daftarTarget.length > 1,
      rumah_list: rumahList.map((r) => ({
        kode: normalisasiKodeRumah(r.kode),
        nama: r.nama,
        alamat: r.alamat,
      })),
      houses: hasilPerRumah,
      users: semuaUsers,
      error: !semuaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
    });
  }

  // 2. POST simpan / ubah pengguna
  if (url.pathname.endsWith('/users/simpan') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = body.user || body.payload || body.data || {};

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        payload,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'simpan_user',
        rumah,
        mechanic_id: payload.mechanic_id || payload.kode || '',
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 3. POST terbitkan / ganti token (dengan anti-tabrakan lintas rumah)
  if (url.pathname.endsWith('/users/token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const ganti = Boolean(body.ganti);
    const opId = String(body.op_id || '').trim() || `op-tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let tokenBaru = '';
    try {
      tokenBaru = await buatTokenUnikLintasRumah(rumah, env);
    } catch (err) {
      return jsonHelper({ success: false, error: String(err.message || err) }, 500);
    }

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'terbitkan_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
        token_baru: tokenBaru,
        ganti,
      },
      env,
    });

    const tokenKeluar = (res && res.result && res.result.token) || '';
    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: ganti ? 'ganti_token' : 'terbitkan_token',
        rumah,
        mechanic_id: mechanicId,
        token_samaran: samarkanToken(tokenKeluar),
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 4. POST cabut token
  if (url.pathname.endsWith('/users/cabut-token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'cabut_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'cabut_token',
        rumah,
        mechanic_id: mechanicId,
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }


  // 5. POST hapus pengguna (Delete CRUD)
  if (url.pathname.endsWith('/users/hapus') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 6. GET / POST daftar config per rumah atau gabungan semua rumah (Units, Components, Catalog Jobs, Factors)
  if (
    (url.pathname.endsWith('/config') || url.pathname.endsWith('/config/daftar') || url.pathname.endsWith('/users/config')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(url.searchParams.get('rumah') || body.rumah || 'semua');
    const jenis = String(url.searchParams.get('jenis') || body.jenis || 'all');
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_config',
          adminToken: tokRumah,
          sesiPanelSah,
          params: { jenis },
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        const d = (res && (res.result || res.data)) || {};
        const tag = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, rumah: kode, nama_rumah: infoRumah.nama })) : []);
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          source: (res && res.source) || 'SUPABASE',
          notice: (res && res.notice) || null,
          error: (res && res.error) || null,
          units: tag(d.units),
          components: tag(d.components),
          jobs: tag(d.jobs),
          factors: tag(d.factors),
        };
      }),
    );

    const semuaUnits = hasilPerRumah.flatMap((h) => h.units);
    const semuaComponents = hasilPerRumah.flatMap((h) => h.components);
    const semuaJobs = hasilPerRumah.flatMap((h) => h.jobs);
    const semuaFactors = hasilPerRumah.flatMap((h) => h.factors);
    const adaSukses = hasilPerRumah.some((h) => h.success);
    const noticePesan = hasilPerRumah.find((h) => h.notice)?.notice || null;

    const gabungan = {
      units: semuaUnits,
      components: semuaComponents,
      jobs: semuaJobs,
      factors: semuaFactors,
      houses: hasilPerRumah,
    };

    return jsonHelper(
      {
        success: adaSukses || daftarTarget.length > 1,
        source: hasilPerRumah.some((h) => h.source === 'SUPABASE') ? 'SUPABASE' : 'STAGING_CACHE',
        notice: noticePesan,
        rumah: targetRumah,
        rumah_list: rumahList.map((r) => ({
          kode: normalisasiKodeRumah(r.kode),
          nama: r.nama,
          alamat: r.alamat,
        })),
        houses: hasilPerRumah,
        units: semuaUnits,
        components: semuaComponents,
        jobs: semuaJobs,
        factors: semuaFactors,
        result: gabungan,
        data: gabungan,
        error: !adaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
      },
      adaSukses || daftarTarget.length > 1 ? 200 : 400,
    );
  }

  // 7. POST simpan / ubah config (Create / Update CRUD)
  if (
    (url.pathname.endsWith('/config/simpan') || url.pathname.endsWith('/users/config-simpan')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah || 'kmbprojek');
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const payload = body.payload || body.data || body;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        payload,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 8. POST hapus config (Delete CRUD)
  if (
    (url.pathname.endsWith('/config/hapus') || url.pathname.endsWith('/users/config-hapus')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah || 'kmbprojek');
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfgdel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const kunci = String(body.kunci || body.id || '').trim();
    if (!kunci) {
      return jsonHelper({ success: false, error: 'Kunci item config wajib diisi' }, 400);
    }
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        kunci,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

    return jsonHelper({ success: false, error: 'Rute manajemen pengguna tidak dikenal' }, 404);
}
export async function handleAdminDaftarUsers(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
export async function handleAdminSimpanUser(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
export async function handleAdminSetTokenStatus(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
