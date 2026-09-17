-- ════════════════════════════════════════════════════════════════════════════
-- DATA DUMMY LENGKAP MARPROJECT — UNTUK PENGETESAN SEMUA FITUR & DASHBOARD
-- ════════════════════════════════════════════════════════════════════════════
-- File ini aman dijalankan di Supabase SQL Editor atau via psql.
-- Mengisi seluruh modul aplikasi:
--   1. Dashboard Performa (KPI, Tren, Leaderboard, Tabel WO)
--   2. Dashboard Teknis (Unit Tercatat, Posisi Ban 1-10, Baris Inspeksi, Remove/Instal, Repair, Life KM)
--   3. Koreksi Meter (Riwayat Pembacaan HM + Lonjakan Abnormal untuk dites)
--   4. Monitoring Mekanik (Selector Mekanik, Tab Assigned, In Progress, Selesai)
--   5. Approvals (Tab L1 Menunggu, L2 Menunggu, WO Aktif, Ditolak, Transfer Oper Shift)
--   6. Reports (Data Payroll siap diekspor ke Excel)
--   7. Fitur Khusus: WO Borongan, WO Insiden Keselamatan (poin 0)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant       smallint;
  v_field        smallint;
  v_ws           smallint;
  v_tyre         smallint;

  v_tarif_junior integer;
  v_tarif_senior integer;

  v_l1           integer;
  v_l2           integer;
  v_m1           integer;
  v_m2           integer;
  v_m3           integer;
  v_mtyre        integer;

  v_mod_hauler   integer;
  v_mod_dozer    integer;
  v_mod_ws       integer;
  v_mod_tyre     integer;

  v_unit_hauler  integer;
  v_unit_dozer   integer;
  v_unit_ws      integer;
  v_unit_tyre    integer;

  v_comp_engine  integer;
  v_sub_engine   integer;
  v_comp_under   integer;
  v_sub_under    integer;
  v_comp_ws      integer;
  v_sub_ws       integer;

  v_job_field    integer;
  v_job_dozer    integer;
  v_job_ws       integer;
  v_job_tyre     integer;

  v_form_insp    integer;
  v_form_rem     integer;
  v_form_rep     integer;

  v_wo           bigint;
  v_wo_insp      bigint;
  v_wo_rem       bigint;
  v_wo_rep       bigint;
  v_grup         uuid;
  v_status       wo_status;
  i              integer;
BEGIN
  -- 1. Pastikan Tenant KMB ada
  SELECT id INTO v_tenant FROM tenants WHERE code = 'KMB';
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant KMB belum ada. Jalankan db/seed.sql terlebih dahulu.';
  END IF;

  SELECT id INTO v_field FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_ws    FROM sections WHERE tenant_id = v_tenant AND code = 'workshop';
  SELECT id INTO v_tyre  FROM sections WHERE tenant_id = v_tenant AND code = 'tyreman';

  SELECT id INTO v_tarif_junior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'junior';
  SELECT id INTO v_tarif_senior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'senior';

  SELECT id INTO v_form_insp FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_inspeksi';
  SELECT id INTO v_form_rem  FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_remove_instal';
  SELECT id INTO v_form_rep  FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_repair';

  -- 2. Setelan Ambang Batas Teknis Ban
  INSERT INTO settings (tenant_id, setting_key, setting_value, description)
  VALUES
    (v_tenant, 'tyre_rtd_kritis', '5', 'Ambang batas RTD kritis (mm)'),
    (v_tenant, 'tyre_target_life_km', '50000', 'Target umur pakai ban (KM)')
  ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

  -- 3. Master Pengguna / Mekanik Uji
  -- Supervisor (L1)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-L1', 'Budi Santoso (Supervisor L1)', 'supervisor', v_tarif_senior, true, true, true, true)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_l1;

  -- Superintendent (L2)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-L2', 'Hendro Wijaya (Superintendent L2)', 'superintendent', v_tarif_senior, true, true, true, true)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_l2;

  -- Mekanik 1 (Field)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-M1', 'Agus Prayitno (Mekanik Field)', 'mechanic', v_tarif_junior, false, false, false, false)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_m1;

  -- Mekanik 2 (Field)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-M2', 'Dedi Kurniawan (Mekanik Field)', 'mechanic', v_tarif_senior, false, false, false, false)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_m2;

  -- Mekanik 3 (Workshop)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-M3', 'Fajar Ramadhan (Mekanik Workshop)', 'mechanic', v_tarif_junior, false, false, false, false)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_m3;

  -- Mekanik Tyre
  INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'UJI-TYRE', 'Rian Hidayat (Tyreman)', 'mechanic', v_tarif_junior, false, true, false, false)
  ON CONFLICT (tenant_id, mechanic_code) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = true
  RETURNING id INTO v_mtyre;

  -- 4. Token Login untuk masing-masing user
  INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
  VALUES
    (v_tenant, v_l1,    'token_uji_l1_spv_0123456789', true),
    (v_tenant, v_l2,    'token_uji_l2_mgr_0123456789', true),
    (v_tenant, v_m1,    'token_uji_m1_satu_012345678', true),
    (v_tenant, v_m2,    'token_uji_m2_dua_0123456789', true),
    (v_tenant, v_m3,    'token_uji_m3_work_012345678', true),
    (v_tenant, v_mtyre, 'token_uji_tyre_012345678901', true)
  ON CONFLICT (token) DO UPDATE SET is_active = true, revoked_at = NULL;

  -- 5. Model Unit
  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'uji-hauler', 'Dump Truck 70T (CONTOH)', v_field)
  ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_mod_hauler;

  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-dozer', 'Bulldozer D85 (CONTOH)', v_field)
  ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_mod_dozer;

  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-rebuild', 'Rebuild Engine Component (CONTOH)', v_ws)
  ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_mod_ws;

  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-tyre-unit', 'Support Tyre Truck (CONTOH)', v_tyre)
  ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_mod_tyre;

  -- 6. Unit Fisik
  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES (v_tenant, 'UJI-UNIT-1', 'DT-701 (Hauler)', v_mod_hauler, 1.0, 'HM')
  ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
  RETURNING id INTO v_unit_hauler;

  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES (v_tenant, 'CONTOH-DZ01', 'DZ-101 (Dozer)', v_mod_dozer, 1.2, 'HM')
  ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
  RETURNING id INTO v_unit_dozer;

  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES (v_tenant, 'CONTOH-WS01', 'WS-BENCH-01', v_mod_ws, 1.0, 'HM')
  ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
  RETURNING id INTO v_unit_ws;

  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES (v_tenant, 'UJI-UNIT-BAN', 'TYRE-SPT-01', v_mod_tyre, 1.0, 'HM')
  ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
  RETURNING id INTO v_unit_tyre;

  -- 7. Komponen & Sub-komponen (Cascade)
  INSERT INTO job_components (section_id, name)
  VALUES (v_field, 'engine')
  ON CONFLICT (section_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_comp_engine;

  INSERT INTO job_sub_components (component_id, name)
  VALUES (v_comp_engine, 'cylinder head')
  ON CONFLICT (component_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_sub_engine;

  INSERT INTO job_components (section_id, name)
  VALUES (v_field, 'undercarriage')
  ON CONFLICT (section_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_comp_under;

  INSERT INTO job_sub_components (component_id, name)
  VALUES (v_comp_under, 'track link')
  ON CONFLICT (component_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_sub_under;

  INSERT INTO job_components (section_id, name)
  VALUES (v_ws, 'component rebuild')
  ON CONFLICT (section_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_comp_ws;

  INSERT INTO job_sub_components (component_id, name)
  VALUES (v_comp_ws, 'engine overhaul')
  ON CONFLICT (component_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_sub_ws;

  -- 8. Katalog Joblist
  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points)
  VALUES (v_tenant, 'UJI-JOB-1', v_field, v_mod_hauler, v_sub_engine, 'Remove & Install Cylinder Head DT70', 8.0, 16.0)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET job_description = EXCLUDED.job_description
  RETURNING id INTO v_job_field;

  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points)
  VALUES (v_tenant, 'CONTOH-SERVICE-250', v_field, v_mod_dozer, v_sub_under, 'Periodic Service 250 HM & Track Inspection', 4.0, 12.0)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET job_description = EXCLUDED.job_description
  RETURNING id INTO v_job_dozer;

  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points)
  VALUES (v_tenant, 'CONTOH-REBUILD-ENGINE', v_ws, v_mod_ws, v_sub_ws, 'Complete Diesel Engine Overhaul', 24.0, 72.0)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET job_description = EXCLUDED.job_description
  RETURNING id INTO v_job_ws;

  -- Flat Job untuk Tyreman (unit_model_id dan sub_component_id NULL)
  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points, detail_form_id)
  VALUES (v_tenant, 'UJI-JOB-BAN', v_tyre, NULL, NULL, 'Inspeksi Lengkap & Rotasi Posisi Ban', 3.0, 10.0, v_form_insp)
  ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET job_description = EXCLUDED.job_description, detail_form_id = v_form_insp
  RETURNING id INTO v_job_tyre;

  -- 9. Bersihkan data dummy lama jika pernah dibuat sebelumnya
  DELETE FROM work_orders WHERE keterangan LIKE 'DUMMY-%' OR keterangan LIKE 'CONTOH%';
  DELETE FROM meter_readings WHERE recorded_by IN (v_l1, v_l2, v_m1, v_m2, v_m3, v_mtyre);

  -- 10. Buat 14 Work Order berbagai status operasional
  FOR i IN 1..14 LOOP
    v_status := (ARRAY[
      'pending_superintendent',
      'pending_superintendent',
      'pending_superintendent',
      'pending_supervisor',
      'pending_supervisor',
      'pending_mechanic_work',
      'pending_mechanic_work',
      'in_progress',
      'approved',
      'approved',
      'approved',
      'rejected',
      'pending_transfer',
      'approved'
    ]::wo_status[])[i];

    INSERT INTO work_orders (
      tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
      work_condition, location, keterangan,
      session_hours, start_time, end_time, submitted_at,
      approved_l1_by, approved_l1_at, mtbf_redo_status, created_at)
    VALUES (
      v_tenant,
      next_wo_number(v_tenant, current_date - (i % 4)),
      v_field,
      CASE WHEN i % 2 = 0 THEN v_job_field ELSE v_job_dozer END,
      CASE WHEN i % 2 = 0 THEN v_unit_hauler ELSE v_unit_dozer END,
      v_status,
      v_l1,
      (ARRAY['normal','difficult','extreme'])[1 + (i % 3)],
      CASE WHEN i % 2 = 0 THEN 'Lapangan Pit A' ELSE 'Workshop Main Bay' END,
      'DUMMY-WO #' || i || ': Simulasi alur ' || v_status::text,
      (ARRAY[6.0, 8.0, 7.5, 9.0, 4.0, 8.0, 2.5])[1 + (i % 7)],
      now() - make_interval(hours => 10 + i),
      now() - make_interval(hours => 2 + i),
      CASE WHEN v_status NOT IN ('pending_mechanic_work','in_progress') THEN now() - make_interval(hours => 2 + i) END,
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN v_l1 END,
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN now() - make_interval(hours => i) END,
      CASE WHEN i % 5 = 0 THEN 'redo' ELSE 'first_time' END,
      now() - make_interval(hours => 14 + i))
    RETURNING id INTO v_wo;

    -- Tim mekanik
    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_m1);
    IF i % 2 = 0 THEN
      INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_m2);
    END IF;

    -- Bila status pending_transfer: buat baris work_order_transfers
    IF v_status = 'pending_transfer' THEN
      INSERT INTO work_order_transfers (work_order_id, requested_by, session_start, session_stop, session_hours, note)
      VALUES (v_wo, v_m1, now() - interval '5 hours', now() - interval '2 hours', 3.0, 'DUMMY: Selesai shift 1, baut roda belum ditorsi');
    END IF;

    -- Bila status rejected: beri catatan penolakan
    IF v_status = 'rejected' THEN
      UPDATE work_orders
         SET rejected_by = v_l1, rejected_at = now() - interval '1 hour',
             rejection_reason = 'DUMMY: Bukti foto perbaikan belum lengkap'
       WHERE id = v_wo;
    END IF;

    -- Bila status approved: hitung final_points, scoring_snapshots, dan mechanic_points
    IF v_status = 'approved' THEN
      UPDATE work_orders
         SET final_points = 17.600, approved_l2_by = v_l2,
             approved_l2_at = now() - make_interval(hours => i)
       WHERE id = v_wo;

      INSERT INTO scoring_snapshots (
        work_order_id, base_points, target_hours, actual_hours, unit_factor,
        work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
      VALUES (v_wo, 16.0, 8.0, 7.5, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.1, 17.600);

      INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
      SELECT v_wo, t.mechanic_id, v_field, 17.600, p.idr_per_point
        FROM work_order_team t
        JOIN mechanics m ON m.id = t.mechanic_id
        JOIN pay_rates p ON p.id = m.pay_rate_id
       WHERE t.work_order_id = v_wo;
    END IF;
  END LOOP;

  -- 11. Tambah WO Borongan (Grouped Work Orders)
  v_grup := gen_random_uuid();
  FOR i IN 1..2 LOOP
    INSERT INTO work_orders (
      tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
      work_condition, location, keterangan, wo_group_id, wo_group_mode,
      session_hours, start_time, end_time, submitted_at, mtbf_redo_status, created_at)
    VALUES (
      v_tenant, next_wo_number(v_tenant, current_date), v_field, v_job_field, v_unit_hauler,
      CASE WHEN i = 1 THEN 'pending_mechanic_work' ELSE 'approved' END::wo_status,
      v_l1, 'normal', 'Workshop',
      'DUMMY-BORONGAN: 1 Unit, 2 Pekerjaan Borongan #' || i,
      v_grup, 'unit',
      CASE WHEN i = 2 THEN 4.0 END,
      CASE WHEN i = 2 THEN now() - interval '6 hours' END,
      CASE WHEN i = 2 THEN now() - interval '2 hours' END,
      CASE WHEN i = 2 THEN now() - interval '2 hours' END,
      'first_time', now() - interval '8 hours')
    RETURNING id INTO v_wo;

    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_m1);

    IF i = 2 THEN
      UPDATE work_orders SET final_points = 16.0, approved_l1_by = v_l1, approved_l1_at = now() - interval '1 hour', approved_l2_by = v_l2, approved_l2_at = now() - interval '30 minutes' WHERE id = v_wo;
      INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
      VALUES (v_wo, 16.0, 4.0, 4.0, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 16.0);
      INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
      SELECT v_wo, v_m1, v_field, 16.0, p.idr_per_point FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id WHERE m.id = v_m1;
    END IF;
  END LOOP;

  -- 12. Tambah WO Insiden Keselamatan (Safety Incident -> Poin 0, Kartu Merah)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, safety_incident,
    session_hours, start_time, end_time, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at,
    mtbf_redo_status, final_points, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date), v_field, v_job_field, v_unit_hauler,
    'approved', v_l1, 'normal', 'Workshop Bay 2',
    'DUMMY-INSIDEN: Jari tergores saat membuka baut cover pelindung', true,
    8.0, now() - interval '10 hours', now() - interval '2 hours',
    now() - interval '2 hours', v_l1, now() - interval '90 minutes',
    v_l2, now() - interval '1 hour', 'first_time', 0, now() - interval '12 hours')
  RETURNING id INTO v_wo;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_m1);
  INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
  VALUES (v_wo, 16.0, 8.0, 8.0, 1.0, 1.0, 1.0, 'on_time', 0.0, 1.0, 0.0);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  SELECT v_wo, v_m1, v_field, 0.0, p.idr_per_point FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id WHERE m.id = v_m1;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 13. DATA UNTUK DASHBOARD TEKNIS BAN (/teknis)
  -- ══════════════════════════════════════════════════════════════════════════

  -- (A) WO Inspeksi 10 Posisi Ban
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, safety_incident,
    kilometers, session_hours, start_time, end_time, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at,
    mtbf_redo_status, final_points, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date - 3), v_tyre, v_job_tyre, v_unit_tyre,
    'approved', v_l1, 'normal', 'Tyre Shop', 'DUMMY-TYRE: Inspeksi rutin 10 posisi ban', false,
    18450.0, 3.0, now() - interval '3 days', now() - interval '3 days' + interval '3 hours',
    now() - interval '3 days' + interval '3 hours', v_l1,
    now() - interval '3 days' + interval '4 hours', v_l2,
    now() - interval '3 days' + interval '5 hours', 'first_time', 10.0, now() - interval '3 days')
  RETURNING id INTO v_wo_insp;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo_insp, v_mtyre);
  INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
  VALUES (v_wo_insp, 10.0, 3.0, 3.0, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 10.0);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  SELECT v_wo_insp, v_mtyre, v_tyre, 10.0, p.idr_per_point FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id WHERE m.id = v_mtyre;

  -- Masukkan baris inspeksi 10 posisi ke work_order_detail_values
  -- Posisi 3 sengaja dibuat RTD = 4 (kritis < 5mm) agar memicu badge merah KRITIS di Dashboard Teknis!
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  SELECT v_wo_insp, v_form_insp, p.pos, d.kunci, d.nilai, v_mtyre, now() - interval '3 days' + interval '3 hours'
    FROM generate_series(1, 10) AS p(pos),
    LATERAL (VALUES
      ('pressure', (100 + (p.pos % 5))::text),
      ('rtd',      CASE WHEN p.pos = 3 THEN '4.0' ELSE (22 - (p.pos % 4))::text END),
      ('suhu',     (38 + (p.pos % 6))::text)
    ) AS d(kunci, nilai)
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- (B) WO Remove / Instal Ban (Ganti Ban Posisi 3 yang Kritis)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, safety_incident,
    kilometers, session_hours, start_time, end_time, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at,
    mtbf_redo_status, final_points, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date - 1), v_tyre, v_job_tyre, v_unit_tyre,
    'approved', v_l1, 'normal', 'Pit Stop A', 'DUMMY-TYRE: Ganti ban posisi 3 aus', false,
    18600.0, 2.5, now() - interval '1 day', now() - interval '1 day' + interval '2 hours',
    now() - interval '1 day' + interval '2 hours', v_l1,
    now() - interval '1 day' + interval '3 hours', v_l2,
    now() - interval '1 day' + interval '4 hours', 'first_time', 10.0, now() - interval '1 day')
  RETURNING id INTO v_wo_rem;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo_rem, v_mtyre);
  INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
  VALUES (v_wo_rem, 10.0, 2.5, 2.5, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 10.0);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  SELECT v_wo_rem, v_mtyre, v_tyre, 10.0, p.idr_per_point FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id WHERE m.id = v_mtyre;

  -- Masukkan data form remove_instal di Posisi 3
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  VALUES
    (v_wo_rem, v_form_rem, 3, 'remove_sn',        'SN-MICH-9921',   v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'remove_merk',      'Michelin',       v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'remove_pattern',   'X-Quarry',       v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'remove_size',      '27.00R49',       v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'remove_problem',   'Worn Out / Aus', v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'remove_remarks',   'RTD tipis < 5mm',v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'instal_sn',        'SN-BS-1044',     v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'instal_merk',      'Bridgestone',    v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'instal_pattern',   'V-Steel',        v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'instal_size',      '27.00R49',       v_mtyre, now() - interval '1 day'),
    (v_wo_rem, v_form_rem, 3, 'lokasi_breakdown', 'Workshop Pit',   v_mtyre, now() - interval '1 day')
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- (C) WO Repair Ban
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, safety_incident,
    session_hours, start_time, end_time, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at,
    mtbf_redo_status, final_points, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date), v_tyre, v_job_tyre, v_unit_tyre,
    'approved', v_l1, 'normal', 'Tyre Rebuild Bay', 'DUMMY-TYRE: Repair dan vulkanisir ban', false,
    2.0, now() - interval '6 hours', now() - interval '4 hours',
    now() - interval '4 hours', v_l1, now() - interval '3 hours',
    v_l2, now() - interval '2 hours', 'first_time', 10.0, now() - interval '8 hours')
  RETURNING id INTO v_wo_rep;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo_rep, v_mtyre);
  INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points)
  VALUES (v_wo_rep, 10.0, 2.0, 2.0, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.0, 10.0);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  SELECT v_wo_rep, v_mtyre, v_tyre, 10.0, p.idr_per_point FROM mechanics m JOIN pay_rates p ON p.id = m.pay_rate_id WHERE m.id = v_mtyre;

  -- Masukkan data repair ban
  INSERT INTO work_order_detail_values (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
  VALUES
    (v_wo_rep, v_form_rep, 0, 'sn',      'SN-MICH-9921', v_mtyre, now() - interval '4 hours'),
    (v_wo_rep, v_form_rep, 0, 'merk',    'Michelin',     v_mtyre, now() - interval '4 hours'),
    (v_wo_rep, v_form_rep, 0, 'pattern', 'X-Quarry',     v_mtyre, now() - interval '4 hours'),
    (v_wo_rep, v_form_rep, 0, 'size',    '27.00R49',     v_mtyre, now() - interval '4 hours')
  ON CONFLICT (work_order_id, form_id, position, field_key) DO UPDATE SET value_after = EXCLUDED.value_after;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 14. RIWAYAT METER UNTUK LAYAR KOREKSI METER (/koreksi)
  -- ══════════════════════════════════════════════════════════════════════════
  -- 5 bacaan wajar yang naik bertahap, dan 1 bacaan anomali (lonjakan ekstrem)
  -- untuk menguji fitur deteksi lonjakan meter di layar Koreksi Meter.
  INSERT INTO meter_readings (unit_id, kind, value, recorded_by, recorded_at)
  VALUES
    (v_unit_hauler, 'HM', 1200.0, v_l1, now() - interval '5 days'),
    (v_unit_hauler, 'HM', 1260.0, v_l1, now() - interval '4 days'),
    (v_unit_hauler, 'HM', 1315.0, v_l1, now() - interval '3 days'),
    (v_unit_hauler, 'HM', 1390.0, v_l1, now() - interval '2 days'),
    (v_unit_hauler, 'HM', 1450.0, v_l1, now() - interval '1 day'),
    (v_unit_hauler, 'HM', 99999.0, v_l1, now()); -- LONJAKAN ANOMALI

  RAISE NOTICE '✅ Sukses! Seluruh data dummy lengkap (termasuk Dashboard Teknis & Koreksi Meter) telah berhasil dibuat.';
END $$;
