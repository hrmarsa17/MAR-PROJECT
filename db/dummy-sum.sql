-- ════════════════════════════════════════════════════════════════════════════
-- DATA DUMMY SISTEM PT SUM (MAR PROJECT) — LENGKAP UNTUK SEMUA FITUR
-- ════════════════════════════════════════════════════════════════════════════
-- File ini mengisi seluruh kebutuhan pengujian aplikasi MAR untuk tenant SUM:
--   1. Dashboard Performa (Statistik, WO Terbaru Hari Ini, 3 Papan Peringkat, Tren Poin 3 Periode)
--   2. Dashboard Teknis (Tyre 10 posisi, RTD kritis < 5mm, Remove/Instal, Repair, Target Life KM)
--   3. Create WO (Section Field, Workshop, Tyreman; Unit aktif terhubung; Job katalog lengkap)
--   4. Monitoring Mekanik (Selector Mekanik, Token, Tab Assigned, In Progress, Selesai, Expired WO)
--   5. Approvals (Tab Menunggu L1/L2, Tab Aktif, Tab Ditolak dengan alasan, Tab Transfer Oper Shift)
--   6. Koreksi Meter (Unit HM & KM, Riwayat bertahap, 1 Bacaan Anomali 99999, Riwayat Ganti Panel)
--   7. Reports (Data insentif payroll siap ekspor)
--   8. Fitur Khusus: WO Borongan, Insiden Keselamatan (poin 0), WO Expired
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant       smallint;
  v_field        smallint;
  v_ws           smallint;
  v_tyre         smallint;

  v_tarif_junior integer;
  v_tarif_senior integer;
  v_tarif_adv    integer;

  v_supt         integer;
  v_supv         integer;
  v_m1           integer;
  v_m2           integer;
  v_m3           integer;
  v_mtyre        integer;

  v_u1           integer;
  v_u2           integer;
  v_u3           integer;
  v_u4           integer;

  v_j_fld1       integer;
  v_j_fld2       integer;
  v_j_fld4       integer;
  v_j_fld5       integer;
  v_j_tyr1       integer;
  v_j_tyr2       integer;
  v_j_tyr3       integer;
  v_j_ws1        integer;
  v_j_ws12       integer;
  v_j_ws78       integer;

  v_form_insp    integer;
  v_form_rem     integer;
  v_form_rep     integer;

  v_wo           bigint;
  v_wo_insp      bigint;
  v_wo_rem       bigint;
  v_wo_rep       bigint;
  v_grup         uuid;
BEGIN
  -- 1. Tenant SUM
  INSERT INTO tenants (code, name, timezone)
  VALUES ('SUM', 'SUM Project', 'Asia/Jakarta')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_tenant FROM tenants WHERE code = 'SUM';

  -- 2. Sections untuk SUM (Field, Workshop, Tyreman)
  INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
  VALUES 
    (v_tenant, 'field',    'Field',    'flat', true,  1),
    (v_tenant, 'workshop', 'Workshop', 'flat', false, 2),
    (v_tenant, 'tyreman',  'Tyreman',  'flat', true,  3)
  ON CONFLICT (tenant_id, code) DO UPDATE 
    SET name = EXCLUDED.name, picker_style = EXCLUDED.picker_style, 
        requires_unit = EXCLUDED.requires_unit, sort_order = EXCLUDED.sort_order, is_active = true;

  SELECT id INTO v_field FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_ws    FROM sections WHERE tenant_id = v_tenant AND code = 'workshop';
  SELECT id INTO v_tyre  FROM sections WHERE tenant_id = v_tenant AND code = 'tyreman';

  -- 3. Pay Rates
  INSERT INTO pay_rates (tenant_id, position, label, idr_per_point, section)
  VALUES
    (v_tenant, 'junior',  'Junior',  2500.00, NULL),
    (v_tenant, 'senior',  'Senior',  3500.00, NULL),
    (v_tenant, 'advisor', 'Advisor', 4500.00, NULL)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_tarif_junior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'junior' LIMIT 1;
  SELECT id INTO v_tarif_senior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'senior' LIMIT 1;
  SELECT id INTO v_tarif_adv    FROM pay_rates WHERE tenant_id = v_tenant AND position = 'advisor' LIMIT 1;

  -- 4. Difficulty Tiers
  INSERT INTO difficulty_tiers (tenant_id, code, name, multiplier)
  VALUES
    (v_tenant, 'standard', 'Standar', 2.0),
    (v_tenant, 'complex',  'Kompleks', 2.5),
    (v_tenant, 'overhaul', 'Overhaul', 3.0)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 5. Factors SUM
  INSERT INTO factors (tenant_id, factor_type, factor_key, factor_value, description)
  VALUES
    (v_tenant, 'work_condition', 'normal',     1.0, 'Normal working conditions'),
    (v_tenant, 'work_condition', 'difficult',  1.1, 'Difficult working conditions'),
    (v_tenant, 'work_condition', 'extreme',    1.2, 'Extreme working conditions'),
    (v_tenant, 'timeliness',     'on_time',    1.0, 'Completed on time'),
    (v_tenant, 'timeliness',     'late',       0.8, 'Late completion'),
    (v_tenant, 'timeliness',     'way_late',   0.5, 'Very late completion'),
    (v_tenant, 'safety',         'no_incident',1.0, 'No safety incidents'),
    (v_tenant, 'safety',         'incident',   0.0, 'Safety incident occurred'),
    (v_tenant, 'mtbf',           'first_time', 1.2, 'First time or good MTBF'),
    (v_tenant, 'mtbf',           'redo',       0.8, 'REDO job')
  ON CONFLICT (tenant_id, factor_type, factor_key) DO UPDATE SET factor_value = EXCLUDED.factor_value;

  -- 6. Setelan SUM
  INSERT INTO settings (tenant_id, setting_key, setting_value, description)
  VALUES
    (v_tenant, 'tyre_rtd_kritis',        '5',     'Ambang batas RTD kritis (mm)'),
    (v_tenant, 'tyre_target_life_km',    '50000', 'Target umur pakai ban (KM)'),
    (v_tenant, 'periode_payroll_mulai',  '16',    'Periode payroll mulai tanggal 16'),
    (v_tenant, 'shift1_mulai',           '06',    'Shift 1 mulai 06:00'),
    (v_tenant, 'shift2_mulai',           '18',    'Shift 2 mulai 18:00'),
    (v_tenant, 'meter_lompat_hm',        '2000',  'Ambang lompatan HM anomali'),
    (v_tenant, 'meter_lompat_km',        '20000', 'Ambang lompatan KM anomali'),
    (v_tenant, 'ambang_kembar_menit',    '30',    'Selisih jam mulai yang dicurigai kembar'),
    (v_tenant, 'retensi_struk_hari',     '30',    'Umur processed_ops sebelum dipangkas'),
    (v_tenant, 'umur_antrean_hari',      '20',    'Umur maksimum entri outbox')
  ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

  -- 7. Detail Forms untuk Dashboard Teknis Ban SUM
  INSERT INTO job_detail_forms (tenant_id, code, name, is_positional, position_count, is_enabled)
  VALUES
    (v_tenant, 'tyre_inspeksi',      'Inspeksi Ban',        true,  10, true),
    (v_tenant, 'tyre_remove_instal', 'Remove / Instal Ban', true,  10, true),
    (v_tenant, 'tyre_repair',        'Repair Ban',          false, NULL, true)
  ON CONFLICT (tenant_id, code) DO UPDATE SET is_enabled = true, position_count = EXCLUDED.position_count;

  SELECT id INTO v_form_insp FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_inspeksi';
  SELECT id INTO v_form_rem  FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_remove_instal';
  SELECT id INTO v_form_rep  FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_repair';

  -- Option Lists untuk Ban
  INSERT INTO option_lists (tenant_id, code, name)
  VALUES
    (v_tenant, 'tyre_problem', 'Problem ban'),
    (v_tenant, 'tyre_remarks', 'Keterangan ban'),
    (v_tenant, 'tyre_kondisi', 'Kondisi ban')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO option_values (list_id, value, sort_order)
  SELECT l.id, v.nilai, v.urut
  FROM option_lists l, (VALUES
    ('Side wall cut', 1), ('Impact material', 2), ('Run flat', 3), ('Tread cut', 4), ('Separasi', 5), ('Worn Out / Aus', 6)
  ) AS v(nilai, urut)
  WHERE l.tenant_id = v_tenant AND l.code = 'tyre_problem'
  ON CONFLICT (list_id, value) DO NOTHING;

  INSERT INTO option_values (list_id, value, sort_order)
  SELECT l.id, v.nilai, v.urut
  FROM option_lists l, (VALUES
    ('Scrap', 1), ('Repair', 2), ('Rotasi', 3), ('Stok', 4)
  ) AS v(nilai, urut)
  WHERE l.tenant_id = v_tenant AND l.code = 'tyre_remarks'
  ON CONFLICT (list_id, value) DO NOTHING;

  -- Form Fields
  INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
  VALUES
    (v_form_insp, 'pressure', 'Tekanan (psi)', 'numeric', true, false, 1),
    (v_form_insp, 'rtd',      'RTD (mm)',      'numeric', true, false, 2),
    (v_form_insp, 'suhu',     'Suhu (°C)',     'numeric', true, false, 3)
  ON CONFLICT (form_id, field_key) DO NOTHING;

  INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
  VALUES
    (v_form_rem, 'remove_sn',        'SN dilepas',      'text', false, false, 1),
    (v_form_rem, 'remove_merk',      'Merk dilepas',    'text', false, false, 2),
    (v_form_rem, 'remove_pattern',   'Pattern dilepas', 'text', false, false, 3),
    (v_form_rem, 'remove_size',      'Ukuran dilepas',  'text', false, false, 4),
    (v_form_rem, 'remove_problem',   'Problem',         'enum', false, false, 5),
    (v_form_rem, 'remove_remarks',   'Catatan dilepas', 'text', false, false, 6),
    (v_form_rem, 'instal_sn',        'SN dipasang',     'text', false, false, 7),
    (v_form_rem, 'instal_merk',      'Merk dipasang',   'text', false, false, 8),
    (v_form_rem, 'instal_pattern',   'Pattern dipasang','text', false, false, 9),
    (v_form_rem, 'instal_size',      'Ukuran dipasang', 'text', false, false, 10),
    (v_form_rem, 'lokasi_breakdown', 'Lokasi Breakdown','text', false, false, 11)
  ON CONFLICT (form_id, field_key) DO NOTHING;

  INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
  VALUES
    (v_form_rep, 'sn',      'SN ban',  'text', false, false, 1),
    (v_form_rep, 'merk',    'Merk',    'text', false, false, 2),
    (v_form_rep, 'pattern', 'Pattern', 'text', false, false, 3),
    (v_form_rep, 'size',    'Ukuran',  'text', false, false, 4)
  ON CONFLICT (form_id, field_key) DO NOTHING;

  -- 8. Master Units SUM
  INSERT INTO units (tenant_id, unit_code, unit_name, model_type, unit_factor, odometer, is_active)
  VALUES
    (v_tenant, 'UNIT-001', 'Excavator CAT 320', 'Excavator', 1.2, 'HM', true),
    (v_tenant, 'UNIT-002', 'Truck Volvo FH16',  'Truck',     1.0, 'KM', true),
    (v_tenant, 'UNIT-003', 'Loader Komatsu WA', 'Loader',    0.8, 'HM', true),
    (v_tenant, 'UNIT-004', 'Dozer Caterpillar', 'Dozer',     1.1, 'HM', true)
  ON CONFLICT (tenant_id, unit_code) DO UPDATE 
    SET unit_name = EXCLUDED.unit_name, unit_factor = EXCLUDED.unit_factor, 
        odometer = EXCLUDED.odometer, is_active = true;

  SELECT id INTO v_u1 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-001';
  SELECT id INTO v_u2 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-002';
  SELECT id INTO v_u3 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-003';
  SELECT id INTO v_u4 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-004';

  -- Hubungkan unit ke SEMUA sections (Field, Workshop, Tyreman)
  INSERT INTO unit_sections (unit_id, section_id)
  SELECT u.id, s.id
  FROM units u, sections s
  WHERE u.tenant_id = v_tenant AND s.tenant_id = v_tenant
  ON CONFLICT DO NOTHING;

  -- 9. Master Jobs SUM
  -- 9.1. Jobs Field
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES
    (v_tenant, 'FLD-001', v_field, 'Periodic Service 250 HM (Engine & Hydraulic)', 4.0, 10.0, 'Service', 1, true),
    (v_tenant, 'FLD-002', v_field, 'Periodic Service 500 HM (Complete Filter & Oil)', 6.0, 15.0, 'Service', 2, true),
    (v_tenant, 'FLD-003', v_field, 'Troubleshoot Low Power & Fuel Line', 3.0, 8.0, 'Troubleshooting', 1, true),
    (v_tenant, 'FLD-004', v_field, 'Replace Hydraulic Hose & Seal Cylinder', 4.0, 12.0, 'Repair', 2, true),
    (v_tenant, 'FLD-005', v_field, 'Track Tensioning & Underinspection', 2.0, 6.0, 'Inspection', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE 
    SET job_description = EXCLUDED.job_description, plan_hours = EXCLUDED.plan_hours, base_points = EXCLUDED.base_points;

  SELECT id INTO v_j_fld1 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'FLD-001';
  SELECT id INTO v_j_fld2 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'FLD-002';
  SELECT id INTO v_j_fld4 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'FLD-004';
  SELECT id INTO v_j_fld5 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'FLD-005';

  -- 9.2. Jobs Tyreman (Terhubung ke Detail Form)
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, detail_form_id, is_active)
  VALUES
    (v_tenant, 'TYR-001', v_tyre, 'Inspeksi Lengkap 10 Posisi Ban', 2.0, 8.0, 'Tyre Service', v_form_insp, true),
    (v_tenant, 'TYR-002', v_tyre, 'Remove & Instal Ban (Penggantian Ban)', 3.0, 12.0, 'Tyre Service', v_form_rem, true),
    (v_tenant, 'TYR-003', v_tyre, 'Repair & Patch Ban Tubeless', 2.5, 10.0, 'Tyre Service', v_form_rep, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE 
    SET job_description = EXCLUDED.job_description, plan_hours = EXCLUDED.plan_hours, 
        base_points = EXCLUDED.base_points, job_type = EXCLUDED.job_type, detail_form_id = EXCLUDED.detail_form_id;

  SELECT id INTO v_j_tyr1 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'TYR-001';
  SELECT id INTO v_j_tyr2 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'TYR-002';
  SELECT id INTO v_j_tyr3 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'TYR-003';

  -- 9.3. Jobs Workshop (COM-001 s/d COM-094)
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES
    (v_tenant, 'COM-001', v_ws, 'Intercooler [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 1, true),
    (v_tenant, 'COM-002', v_ws, 'Injector Volvo [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 1, true),
    (v_tenant, 'COM-012', v_ws, 'Disc Clutch [Remove & Install - Major Repair]', 8, 6, 'Remove & Install - Major Repair', 2, true),
    (v_tenant, 'COM-070', v_ws, 'Radiator Assembly [Remove & Install]', 4, 3, 'Remove & Install', 1, true),
    (v_tenant, 'COM-078', v_ws, 'Engine [Remove & Install - Overhaul Engine]', 56, 42, 'Remove & Install - Overhaul Engine', 3, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;

  SELECT id INTO v_j_ws1  FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-001';
  SELECT id INTO v_j_ws12 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-012';
  SELECT id INTO v_j_ws78 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-078';

  -- 10. Pengguna Uji SUM (Superintendent, Supervisor, Mekanik Field, Tyreman)
  -- Hapus work_orders, token & mekanik lama agar bersih dan rapi
  DELETE FROM work_orders WHERE tenant_id = v_tenant;
  DELETE FROM meter_panel_changes WHERE unit_id IN (SELECT id FROM units WHERE tenant_id = v_tenant);
  DELETE FROM meter_readings WHERE unit_id IN (SELECT id FROM units WHERE tenant_id = v_tenant);
  DELETE FROM api_tokens WHERE tenant_id = v_tenant;
  DELETE FROM audit_logs WHERE tenant_id = v_tenant;
  DELETE FROM mechanic_sections WHERE mechanic_id IN (SELECT id FROM mechanics WHERE tenant_id = v_tenant);
  DELETE FROM mechanics WHERE tenant_id = v_tenant;

  -- Superintendent L2: Pandu Wijaksono
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-SUPT-001', 'Pandu Wijaksono', 'pandu.sum@company.com', 'superintendent', 'Advisor', v_tarif_adv, true, true, true, true, true)
  RETURNING id INTO v_supt;

  -- Supervisor L1: Maman Suryadi
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-SUPV-001', 'Maman Suryadi', 'maman.sum@company.com', 'supervisor', 'Senior', v_tarif_senior, true, true, true, true, false)
  RETURNING id INTO v_supv;

  -- Mekanik 1 (Field): Ahmad Fauzi
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-001', 'Ahmad Fauzi', 'ahmad.sum@company.com', 'mechanic', 'Senior', v_tarif_senior, true, false, false, false, false)
  RETURNING id INTO v_m1;

  -- Mekanik 2 (Workshop): Budi Santoso (SUM)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-002', 'Budi Santoso (SUM)', 'budi.sum@company.com', 'mechanic', 'Junior', v_tarif_junior, true, false, false, false, false)
  RETURNING id INTO v_m2;

  -- Mekanik 3 (Field): Charlie Wijaya (SUM)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-003', 'Charlie Wijaya (SUM)', 'charlie.sum@company.com', 'mechanic', 'Junior', v_tarif_junior, true, false, false, false, false)
  RETURNING id INTO v_m3;

  -- Mekanik 4 (Tyreman): Dani Pratama (SUM)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, grade, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-004', 'Dani Pratama (Tyreman)', 'dani.sum@company.com', 'mechanic', 'Junior', v_tarif_junior, true, false, true, false, false)
  RETURNING id INTO v_mtyre;

  -- Token Login Pengguna SUM (Format: sum-<acak>)
  INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
  VALUES
    (v_tenant, v_supt,  'sum-sdan3i12d', true),  -- Superintendent Pandu (L2)
    (v_tenant, v_supv,  'sum-maman0123', true),  -- Supervisor Maman (L1)
    (v_tenant, v_m1,    'sum-ahmad0123', true),  -- Mekanik Field Ahmad
    (v_tenant, v_m2,    'sum-budi01234', true),  -- Mekanik Workshop Budi
    (v_tenant, v_m3,    'sum-charlie12', true),  -- Mekanik Field Charlie
    (v_tenant, v_mtyre, 'sum-dani01234', true);  -- Mekanik Tyre Dani

  -- 11. Transaksi Work Orders Uji SUM

  -- 11.1. WO Status: ASSIGNED (Pending Mechanic Work) - Field, Ahmad Fauzi (Dibuat hari ini 30 menit lalu)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-0001', v_field, v_j_fld1, v_u1, 'normal', 'Pit A Utara',
    'DUMMY: Service rutin 250 HM siap dikerjakan', 1450.0, 'pending_mechanic_work', v_supv, now() - interval '30 minutes'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);

  -- 11.2. WO Status: IN PROGRESS - Field, Charlie Wijaya (Mulai hari ini 1 jam lalu)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time
  ) VALUES (
    v_tenant, 'WO-SUM-0002', v_field, v_j_fld4, v_u3, 'difficult', 'Front Loading 2',
    'DUMMY: Perbaikan selang hidrolik sedang berjalan', 820.0, 'in_progress', v_supv, now() - interval '2 hours', now() - interval '1 hour'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 1.0, v_supv);

  -- 11.3. WO Status: PENDING SUPERVISOR (Menunggu L1 Approval) - Diserahkan 35 menit lalu
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time, end_time, session_hours, submitted_at
  ) VALUES (
    v_tenant, 'WO-SUM-0003', v_field, v_j_fld1, v_u4, 'normal', 'Pit B Selatan',
    'DUMMY: Service 250 selesai, menunggu persetujuan Supervisor (L1)', 2100.0, 'pending_supervisor',
    v_supv, now() - interval '3 hours', now() - interval '2 hours', now() - interval '35 minutes', 1.5, now() - interval '35 minutes'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);

  -- 11.4. WO Status: PENDING SUPERINTENDENT (Menunggu L2 Approval - Pandu Wijaksono)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at
  ) VALUES (
    v_tenant, 'WO-SUM-0004', v_field, v_j_fld2, v_u1, 'difficult', 'Workshop Bay 1',
    'DUMMY: Service 500 HM selesai & di-approve SPV, menunggu Approval Superintendent (L2)', 1455.0,
    'pending_superintendent', v_supv, now() - interval '4 hours', now() - interval '3 hours', now() - interval '50 minutes', 2.0, now() - interval '50 minutes',
    v_supv, now() - interval '30 minutes'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 0.5, v_supv);
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 0.5, v_supv);
  INSERT INTO approvals (work_order_id, stage, approver_id, decision, judgment, decided_at)
  VALUES (v_wo, 'supervisor', v_supv, 'approve', 'Pekerjaan rapi, filter diganti semua sesuai SOP', now() - interval '30 minutes');

  -- 11.5. WO Status: APPROVED (Field - Ahmad Fauzi & Charlie) -> Mengisi Papan Harian Field & Periode!
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at, mtbf_redo_status, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-0005', v_field, v_j_fld2, v_u1, 'normal', 'Workshop Bay 2',
    'DUMMY: Service Berkala Selesai Penuh & Disetujui L2', 1460.0, 'approved',
    v_supv, now() - interval '5 hours', now() - interval '4 hours', now() - interval '1 hour', 3.0, now() - interval '1 hour',
    v_supv, now() - interval '45 minutes', v_supt, now() - interval '20 minutes', 'first_time', 18.000
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 0.5, v_supv);
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 0.5, v_supv);
  INSERT INTO scoring_snapshots (
    work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor,
    timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points, created_at
  ) VALUES (
    v_wo, 15.0, 6.0, 3.0, 1.2, 1.0, 1.0, 'on_time', 1.0, 1.0, 18.000, now() - interval '20 minutes'
  );
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES 
    (v_wo, v_m1, v_field, 18.000, 3500.00, now() - interval '20 minutes'),
    (v_wo, v_m3, v_field, 18.000, 2500.00, now() - interval '20 minutes');
  INSERT INTO approvals (work_order_id, stage, approver_id, decision, judgment, decided_at)
  VALUES (v_wo, 'superintendent', v_supt, 'approve', 'Hasil memuaskan, checklist lengkap', now() - interval '20 minutes');

  -- 11.6. WO Status: APPROVED (Tyreman - Dani Pratama) -> Mengisi Papan Harian Tyreman & Dashboard Teknis Ban!
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    kilometers, status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at, mtbf_redo_status, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-0006', v_tyre, v_j_tyr1, v_u2, 'normal', 'Tyre Pit Stop',
    'DUMMY: Inspeksi 10 Posisi Ban Volvo FH16', 18600.0, 'approved',
    v_supv, now() - interval '4 hours', now() - interval '3 hours', now() - interval '70 minutes', 1.8, now() - interval '70 minutes',
    v_supv, now() - interval '50 minutes', v_supt, now() - interval '25 minutes', 'first_time', 9.600
  ) RETURNING id INTO v_wo_insp;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo_insp, v_mtyre, 1.0, v_supv);
  INSERT INTO scoring_snapshots (
    work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor,
    timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points, created_at
  ) VALUES (
    v_wo_insp, 8.0, 2.0, 1.8, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.2, 9.600, now() - interval '25 minutes'
  );
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES (v_wo_insp, v_mtyre, v_tyre, 9.600, 2500.00, now() - interval '25 minutes');

  -- 10 Posisi Nilai Inspeksi (Posisi 3 RTD = 4.0mm -> memicu badge KRITIS di Dashboard Teknis!)
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  SELECT v_wo_insp, v_form_insp, p.pos, d.kunci, d.nilai, v_mtyre, now() - interval '70 minutes'
  FROM generate_series(1, 10) AS p(pos),
  LATERAL (VALUES
    ('pressure', (105 + (p.pos % 4))::text),
    ('rtd',      CASE WHEN p.pos = 3 THEN '4.0' ELSE (24 - (p.pos % 5))::text END),
    ('suhu',     (40 + (p.pos % 5))::text)
  ) AS d(kunci, nilai)
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- 11.7. WO Status: APPROVED (Tyreman - Ganti Ban / Remove Instal Posisi 3 Aus)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    kilometers, status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at, mtbf_redo_status, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-0007', v_tyre, v_j_tyr2, v_u2, 'normal', 'Tyre Pit Stop',
    'DUMMY: Ganti Ban Posisi 3 Aus (RTD Kritis)', 18650.0, 'approved',
    v_supv, now() - interval '3 hours', now() - interval '2 hours', now() - interval '45 minutes', 1.5, now() - interval '45 minutes',
    v_supv, now() - interval '30 minutes', v_supt, now() - interval '15 minutes', 'first_time', 12.000
  ) RETURNING id INTO v_wo_rem;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo_rem, v_mtyre, 1.0, v_supv);
  INSERT INTO scoring_snapshots (
    work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor,
    timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points, created_at
  ) VALUES (
    v_wo_rem, 12.0, 3.0, 1.5, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 12.000, now() - interval '15 minutes'
  );
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES (v_wo_rem, v_mtyre, v_tyre, 12.000, 2500.00, now() - interval '15 minutes');

  -- Data Remove & Instal Form
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  VALUES
    (v_wo_rem, v_form_rem, 3, 'remove_sn',        'SN-MICH-9921',   v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'remove_merk',      'Michelin',       v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'remove_pattern',   'X-Quarry',       v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'remove_size',      '27.00R49',       v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'remove_problem',   'Worn Out / Aus', v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'remove_remarks',   'RTD tipis < 5mm',v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'instal_sn',        'SN-BS-1044',     v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'instal_merk',      'Bridgestone',    v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'instal_pattern',   'V-Steel',        v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'instal_size',      '27.00R49',       v_mtyre, now() - interval '45 minutes'),
    (v_wo_rem, v_form_rem, 3, 'lokasi_breakdown', 'Workshop Pit',   v_mtyre, now() - interval '45 minutes')
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- 11.8. WO Status: APPROVED (Tyreman - Repair Ban)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at, mtbf_redo_status, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-0008', v_tyre, v_j_tyr3, v_u2, 'normal', 'Tyre Rebuild Bay',
    'DUMMY: Repair & Patch Ban SN-MICH-9921', 'approved',
    v_supv, now() - interval '4 hours', now() - interval '3 hours', now() - interval '80 minutes', 1.5, now() - interval '80 minutes',
    v_supv, now() - interval '55 minutes', v_supt, now() - interval '30 minutes', 'first_time', 10.000
  ) RETURNING id INTO v_wo_rep;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo_rep, v_mtyre, 1.0, v_supv);
  INSERT INTO scoring_snapshots (
    work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor,
    timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points, created_at
  ) VALUES (
    v_wo_rep, 10.0, 2.5, 1.5, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 10.000, now() - interval '30 minutes'
  );
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES (v_wo_rep, v_mtyre, v_tyre, 10.000, 2500.00, now() - interval '30 minutes');
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  VALUES
    (v_wo_rep, v_form_rep, 0, 'sn',      'SN-MICH-9921', v_mtyre, now() - interval '80 minutes'),
    (v_wo_rep, v_form_rep, 0, 'merk',    'Michelin',     v_mtyre, now() - interval '80 minutes'),
    (v_wo_rep, v_form_rep, 0, 'pattern', 'X-Quarry',     v_mtyre, now() - interval '80 minutes'),
    (v_wo_rep, v_form_rep, 0, 'size',    '27.00R49',     v_mtyre, now() - interval '80 minutes')
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- 11.9. WO Status: PENDING TRANSFER (Tab Transfer di Approval)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time
  ) VALUES (
    v_tenant, 'WO-SUM-0009', v_field, v_j_fld4, v_u4, 'difficult', 'Pit C Barat',
    'DUMMY: Selesai shift 1, butuh oper shift ke shift 2', 2110.0, 'pending_transfer',
    v_supv, now() - interval '4 hours', now() - interval '3 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);
  INSERT INTO work_order_transfers (work_order_id, requested_by, session_start, session_stop, session_hours, note)
  VALUES (v_wo, v_m1, now() - interval '3 hours', now() - interval '40 minutes', 2.33, 'DUMMY: Silinder hidrolik sudah dilepas, seal kit baru belum dipasang');

  -- 11.10. WO Status: REJECTED (Tab Ditolak di Approval)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    hour_meter, status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    rejected_by, rejected_at, rejection_reason
  ) VALUES (
    v_tenant, 'WO-SUM-0010', v_field, v_j_fld5, v_u1, 'normal', 'Pit A',
    'DUMMY: Ditolak karena foto bukti perbaikan tidak lengkap', 1462.0, 'rejected',
    v_supv, now() - interval '5 hours', now() - interval '4 hours', now() - interval '2 hours', 2.0, now() - interval '2 hours',
    v_supv, now() - interval '50 minutes', 'DUMMY: Foto pengukuran ketegangan track belum diupload'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 1.0, v_supv);

  -- 11.11. WO Status: EXPIRED (>12 Jam)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-EXP-001', v_ws, v_j_ws1, v_u1, 'normal', 'Workshop Bay 3',
    'DUMMY: WO Terlewat (>12 jam belum dikerjakan)', 'pending_mechanic_work', v_supv, now() - interval '16 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 1.0, v_supv);

  -- 11.12. WO Status: BORONGAN (Grouped Work Orders)
  v_grup := gen_random_uuid();
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    wo_group_id, wo_group_mode, status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-BOR-01', v_field, v_j_fld1, v_u3, 'normal', 'Pit B',
    'DUMMY-BORONGAN: 1 Unit 2 Pekerjaan (Pekerjaan 1)', v_grup, 'unit', 'in_progress', v_supv, now() - interval '2 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 1.0, v_supv);

  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    wo_group_id, wo_group_mode, status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-BOR-02', v_field, v_j_fld4, v_u3, 'normal', 'Pit B',
    'DUMMY-BORONGAN: 1 Unit 2 Pekerjaan (Pekerjaan 2)', v_grup, 'unit', 'pending_mechanic_work', v_supv, now() - interval '2 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 1.0, v_supv);

  -- 11.13. HISTORIS PERIODE LALU (Untuk Tren Poin & Laporan Payroll)
  -- Periode -1 (~35 hari lalu)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by, created_at,
    start_time, end_time, session_hours, submitted_at, approved_l1_by, approved_l1_at,
    approved_l2_by, approved_l2_at, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-HIST-01', v_ws, v_j_ws78, v_u1, 'approved',
    v_supv, now() - interval '35 days', now() - interval '35 days', now() - interval '34 days', 24.0, now() - interval '34 days',
    v_supv, now() - interval '34 days', v_supt, now() - interval '34 days', 45.000
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES (v_wo, v_m1, v_ws, 45.000, 3500.00, now() - interval '34 days');

  -- Periode -2 (~65 hari lalu)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by, created_at,
    start_time, end_time, session_hours, submitted_at, approved_l1_by, approved_l1_at,
    approved_l2_by, approved_l2_at, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-HIST-02', v_ws, v_j_ws12, v_u2, 'approved',
    v_supv, now() - interval '65 days', now() - interval '65 days', now() - interval '64 days', 8.0, now() - interval '64 days',
    v_supv, now() - interval '64 days', v_supt, now() - interval '64 days', 30.000
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 1.0, v_supv);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point, awarded_at)
  VALUES (v_wo, v_m3, v_ws, 30.000, 2500.00, now() - interval '64 days');

  -- 12. Riwayat Meter SUM (Untuk Koreksi Meter)
  DELETE FROM meter_readings WHERE unit_id IN (SELECT id FROM units WHERE tenant_id = v_tenant);
  DELETE FROM meter_panel_changes WHERE unit_id IN (SELECT id FROM units WHERE tenant_id = v_tenant);

  -- Pembacaan bertahap wajar + 1 lonjakan anomali 99999
  INSERT INTO meter_readings (unit_id, kind, value, recorded_by, recorded_at)
  VALUES
    (v_u1, 'HM', 1200.0, v_supv, now() - interval '5 days'),
    (v_u1, 'HM', 1265.0, v_supv, now() - interval '4 days'),
    (v_u1, 'HM', 1330.0, v_supv, now() - interval '3 days'),
    (v_u1, 'HM', 1395.0, v_supv, now() - interval '2 days'),
    (v_u1, 'HM', 1460.0, v_supv, now() - interval '1 hour'),
    (v_u1, 'HM', 99999.0, v_supv, now()); -- LONJAKAN ANOMALI

  INSERT INTO meter_panel_changes (unit_id, kind, value_after, reason, recorded_by, changed_at)
  VALUES
    (v_u1, 'HM', 1200.0, 'Penggantian panel meter rusak (reset nol ke awal)', v_supv, now() - interval '5 days');

  INSERT INTO meter_readings (unit_id, kind, value, recorded_by, recorded_at)
  VALUES
    (v_u2, 'KM', 18000.0, v_supv, now() - interval '4 days'),
    (v_u2, 'KM', 18250.0, v_supv, now() - interval '3 days'),
    (v_u2, 'KM', 18500.0, v_supv, now() - interval '2 days'),
    (v_u2, 'KM', 18650.0, v_supv, now() - interval '1 hour');

  RAISE NOTICE '✅ Sukses! Data dummy komprehensif PT SUM berhasil dibuat.';
END $$;
