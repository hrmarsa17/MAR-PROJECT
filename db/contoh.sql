-- Data contoh untuk melihat layar terisi. Bukan bagian produksi.
--   psql -f db/contoh.sql

DO $$
DECLARE
  v_tenant  smallint;
  v_section smallint;
  v_job     integer;
  v_unit    integer;
  v_l1      integer;
  v_l2      integer;
  v_mek     integer[];
  v_wo      bigint;
  v_status  wo_status;
  i         integer;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE code = 'KMB';
  SELECT id INTO v_section FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_job  FROM jobs  WHERE tenant_id = v_tenant AND job_code = 'UJI-JOB-1';
  SELECT id INTO v_unit FROM units WHERE tenant_id = v_tenant AND unit_code = 'UJI-UNIT-1';
  SELECT id INTO v_l1 FROM mechanics WHERE mechanic_code = 'UJI-L1';
  SELECT id INTO v_l2 FROM mechanics WHERE mechanic_code = 'UJI-L2';
  SELECT array_agg(id) INTO v_mek FROM mechanics WHERE mechanic_code IN ('UJI-M1','UJI-M2');

  FOR i IN 1..14 LOOP
    v_status := (ARRAY[
      'pending_superintendent','pending_superintendent','pending_superintendent',
      'pending_superintendent','pending_superintendent','pending_supervisor',
      'pending_supervisor','pending_mechanic_work','in_progress',
      'approved','approved','approved','rejected','pending_transfer'
    ]::wo_status[])[i];

    INSERT INTO work_orders (
      tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
      work_condition, location, keterangan,
      session_hours, start_time, end_time, submitted_at,
      approved_l1_by, approved_l1_at, mtbf_redo_status, created_at)
    VALUES (
      v_tenant,
      next_wo_number(v_tenant, current_date - (i % 4)),
      v_section, v_job, v_unit, v_status,
      CASE WHEN i % 3 = 0 THEN v_mek[1] ELSE v_l1 END,
      (ARRAY['normal','difficult','extreme'])[1 + (i % 3)],
      CASE WHEN i % 2 = 0 THEN 'Lapangan' ELSE 'Workshop' END,
      CASE WHEN i % 4 = 0 THEN 'Menunggu part dari gudang pusat' ELSE NULL END,
      -- sengaja bervariasi: ada yang tepat waktu, ada yang lewat target
      (ARRAY[6.0, 8.0, 9.5, 13.0, 7.25, 8.0, 2.0])[1 + (i % 7)],
      now() - make_interval(hours => 10 + i),
      now() - make_interval(hours => 2 + i),
      now() - make_interval(hours => 2 + i),
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN v_l1 END,
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN now() - make_interval(hours => i) END,
      CASE WHEN i % 5 = 0 THEN 'redo' ELSE 'first_time' END,
      now() - make_interval(hours => 12 + i))
    RETURNING id INTO v_wo;

    INSERT INTO work_order_team (work_order_id, mechanic_id)
    VALUES (v_wo, v_mek[1]);
    IF i % 2 = 0 THEN
      INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[2]);
    END IF;

    -- WO yang sudah approved perlu poin & snapshot supaya layar tidak berbohong
    IF v_status = 'approved' THEN
      UPDATE work_orders SET final_points = 17.6, approved_l2_by = v_l2,
             approved_l2_at = now() - make_interval(hours => i) WHERE id = v_wo;
      INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours,
        actual_hours, unit_factor, work_condition_factor, timeliness_factor,
        timeliness_status, safety_factor, mtbf_factor, final_points)
      VALUES (v_wo, 16, 8, 8, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.1, 17.6);
      INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
      SELECT v_wo, t.mechanic_id, v_section, 17.6, p.idr_per_point
        FROM work_order_team t
        JOIN mechanics m ON m.id = t.mechanic_id
        JOIN pay_rates p ON p.id = m.pay_rate_id
       WHERE t.work_order_id = v_wo;
    END IF;
  END LOOP;

  RAISE NOTICE 'Data contoh dibuat.';
END $$;
