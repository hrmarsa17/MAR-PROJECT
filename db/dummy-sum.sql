-- ════════════════════════════════════════════════════════════════════════════
-- DATA DUMMY SISTEM PT SUM (MAR PROJECT)
-- ════════════════════════════════════════════════════════════════════════════
-- File ini mengisi master data dan data dummy untuk tenant PT SUM:
--   1. Sections: Workshop, Field (picker_style: flat)
--   2. Faktor Kondisi Kerja, Timeliness, Safety, MTBF (sesuai SUM v2)
--   3. Tarif Per Jabatan (Junior, Senior, Advisor)
--   4. Master Units (CAT 320, Volvo FH16, Komatsu WA, Cat Dozer)
--   5. Master Jobs/Komponen (94 komponen SUM COM-001 s/d COM-094)
--   6. Pengguna Uji SUM (Superintendent, Supervisor, Mekanik) + Token Login
--   7. Transaksi Work Order Uji SUM (Normal, Assigned, In Progress, L1, L2, Approved, Expired, Expired Reported, Expired Reopened)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant       smallint;
  v_ws           smallint;
  v_field        smallint;

  v_tarif_junior integer;
  v_tarif_senior integer;
  v_tarif_adv    integer;

  v_supt         integer;
  v_supv         integer;
  v_m1           integer;
  v_m2           integer;
  v_m3           integer;

  v_u1           integer;
  v_u2           integer;
  v_u3           integer;
  v_u4           integer;

  v_j1           integer;
  v_j2           integer;
  v_j12          integer;
  v_j70          integer;
  v_j78          integer;

  v_wo           bigint;
BEGIN
  -- 1. Ambil atau Buat Tenant SUM
  INSERT INTO tenants (code, name, timezone)
  VALUES ('SUM', 'SUM Project', 'Asia/Jakarta')
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO v_tenant FROM tenants WHERE code = 'SUM';

  -- 2. Sections untuk SUM
  INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
  VALUES 
    (v_tenant, 'workshop', 'Workshop', 'flat', false, 1),
    (v_tenant, 'field', 'Field', 'flat', true, 2)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_ws FROM sections WHERE tenant_id = v_tenant AND code = 'workshop';
  SELECT id INTO v_field FROM sections WHERE tenant_id = v_tenant AND code = 'field';

  -- 3. Pay Rates
  INSERT INTO pay_rates (tenant_id, position, label, idr_per_point, section)
  SELECT v_tenant, p.pos, p.lbl, p.idr, NULL
  FROM (VALUES
    ('junior', 'Junior', 2500.00),
    ('senior', 'Senior', 3500.00),
    ('advisor', 'Advisor', 4500.00)
  ) AS p(pos, lbl, idr)
  WHERE NOT EXISTS (
    SELECT 1 FROM pay_rates WHERE tenant_id = v_tenant AND position = p.pos AND section IS NULL
  );

  SELECT id INTO v_tarif_junior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'junior';
  SELECT id INTO v_tarif_senior FROM pay_rates WHERE tenant_id = v_tenant AND position = 'senior';
  SELECT id INTO v_tarif_adv    FROM pay_rates WHERE tenant_id = v_tenant AND position = 'advisor';

  -- 4. Difficulty Tiers
  INSERT INTO difficulty_tiers (tenant_id, code, name, multiplier)
  VALUES
    (v_tenant, 'standard', 'Standar', 2.0),
    (v_tenant, 'complex', 'Kompleks', 2.5),
    (v_tenant, 'overhaul', 'Overhaul', 3.0)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 5. Factors SUM (Normal 1.0, Difficult 1.1, Extreme 1.2)
  INSERT INTO factors (tenant_id, factor_type, factor_key, factor_value, description)
  VALUES
    (v_tenant, 'work_condition', 'normal', 1.0, 'Normal working conditions'),
    (v_tenant, 'work_condition', 'difficult', 1.1, 'Difficult working conditions (e.g., rain, heat)'),
    (v_tenant, 'work_condition', 'extreme', 1.2, 'Extreme working conditions (e.g., confined space, high risk)'),
    (v_tenant, 'timeliness', 'on_time', 1.0, 'Completed on time (actual <= target)'),
    (v_tenant, 'timeliness', 'late', 0.8, 'Late completion (101-150% target)'),
    (v_tenant, 'timeliness', 'way_late', 0.5, 'Very late completion (>150% target)'),
    (v_tenant, 'safety', 'no_incident', 1.0, 'No safety incidents'),
    (v_tenant, 'safety', 'incident', 0.0, 'Safety incident occurred'),
    (v_tenant, 'mtbf', 'first_time', 1.2, 'First time or good MTBF'),
    (v_tenant, 'mtbf', 'redo', 0.8, 'REDO job')
  ON CONFLICT (tenant_id, factor_type, factor_key) DO NOTHING;

  -- 6. Units SUM
  INSERT INTO units (tenant_id, unit_code, unit_name, model_type, unit_factor, is_active)
  VALUES
    (v_tenant, 'UNIT-001', 'Excavator CAT 320', 'Excavator', 1.2, true),
    (v_tenant, 'UNIT-002', 'Truck Volvo FH16', 'Truck', 1.0, true),
    (v_tenant, 'UNIT-003', 'Loader Komatsu WA', 'Loader', 0.8, true),
    (v_tenant, 'UNIT-004', 'Dozer Caterpillar', 'Dozer', 1.1, true)
  ON CONFLICT (tenant_id, unit_code) DO NOTHING;

  SELECT id INTO v_u1 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-001';
  SELECT id INTO v_u2 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-002';
  SELECT id INTO v_u3 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-003';
  SELECT id INTO v_u4 FROM units WHERE tenant_id = v_tenant AND unit_code = 'UNIT-004';

  -- Hubungkan unit ke sections
  INSERT INTO unit_sections (unit_id, section_id)
  SELECT u.id, s.id
  FROM units u, sections s
  WHERE u.tenant_id = v_tenant AND s.tenant_id = v_tenant
  ON CONFLICT DO NOTHING;

  -- 7. Master Jobs SUM (94 Komponen)
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-001', v_ws, 'Intercooler [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-002', v_ws, 'Injector Volvo [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-003', v_ws, 'Injector Beiben [Remove & Install - Major Repair]', 4, 2, 'Remove & Install - Major Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-004', v_ws, 'Injector Axor [Remove & Install - Major Repair]', 2, 1, 'Remove & Install - Major Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-005', v_ws, 'Alternator [Remove & Install - Minor Repair]', 1, 0.5, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-006', v_ws, 'Water Pump [Remove & Install - Minor Repair]', 3, 1.5, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-007', v_ws, 'Fuel Filter [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-008', v_ws, 'Rehose Fuel [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-009', v_ws, 'Radiator & Cooling System [Remove & Install - Minor Repair]', 4, 2, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-010', v_ws, 'Adjust Valve [Adjustment - Minor Repair]', 3, 1.5, 'Adjustment - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-011', v_ws, 'Turbocharger [Remove & Install - Minor Repair]', 3, 1.5, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-012', v_ws, 'Disc Clutch [Remove & Install - Major Repair]', 8, 6, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-013', v_ws, 'Transmission [Remove & Install - Major Repair]', 8, 6, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-014', v_ws, 'Clucth Cylinder [Remove & Install - Major Repair]', 6, 6, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-015', v_ws, 'Servo Clutch [Remove & Install - Minor Repair]', 3, 3, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-016', v_ws, 'Rehose Transmission [Remove & Install - Minor Repair]', 3, 3, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-017', v_ws, 'Propeller Shaft & U-Joint Rear [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-018', v_ws, 'Propeller Shaft & U-Joint Front [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-019', v_ws, 'Front Axle And Wheel [Remove & Install - Major Repair]', 12, 6, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-020', v_ws, 'Center Bearing / Support Bearing [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-021', v_ws, 'Rear Axle And Wheel [Remove & Install - Minor Repair]', 12, 6, 'Remove & Install - Minor Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-022', v_ws, 'Final Drive Lh [Overhaul - Major Repair]', 4, 2, 'Overhaul - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-023', v_ws, 'Final Drive Rh [Overhaul - Major Repair]', 4, 2, 'Overhaul - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-024', v_ws, 'Air Compressor And Air Tank [Remove & Install - Major Repair]', 4, 2, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-025', v_ws, 'Brake Chamber + Brake Relay [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-026', v_ws, 'Brake Valves + Accumulator [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-027', v_ws, 'Slack Adjuster [Remove & Install & Adjustment - Minor Repair]', 2, 1, 'Remove & Install & Adjustment - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-028', v_ws, 'Front Brake [Remove & Install & Adjustment - Minor Repair]', 0.5, 1, 'Remove & Install & Adjustment - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-029', v_ws, 'Rear Brake [Remove & Install & Adjustment - Minor Repair]', 0.5, 1, 'Remove & Install & Adjustment - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-030', v_ws, 'Hydraulic Control Valve [Reseal - Minor Repair]', 1, 0.5, 'Reseal - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-031', v_ws, 'Hydraulic Cylinder [Remove & Install - Major Repair]', 12, 6, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-032', v_ws, 'Hidraulic Hose [Remove & Install - Minor Repair]', 1, 0.5, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-033', v_ws, 'Hydraulic Pump / Pto [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-034', v_ws, 'Boggie And Suspension [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-035', v_ws, 'Steering And Brake Valve [Remove & Install - Minor Repair]', 6, 3, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-036', v_ws, 'Steering Gearbox [Remove & Install - Major Repair]', 6, 3, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-037', v_ws, 'Steering Lingkage ( Tie Rod ) [Remove & Install - Minor Repair]', 3, 1.5, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-038', v_ws, 'Steering Pump [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-039', v_ws, 'Drag Link [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-040', v_ws, 'Rehose Steering [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-041', v_ws, 'King Pin [Remove & Install - Major Repair]', 2, 2, 'Remove & Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-042', v_ws, 'Air Conditioner [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-043', v_ws, 'Alternator [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-044', v_ws, 'Electric Harness [Remove & Install, Repair - Minor Repair]', 3, 1.5, 'Remove & Install, Repair - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-045', v_ws, 'Starting Motor [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-046', v_ws, 'Wiper Blade [Remove & Install - Minor Repair]', 0.33, 10, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-047', v_ws, 'Head Lamp [Remove & Install, Repair - Minor Repair]', 1, 0.5, 'Remove & Install, Repair - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-048', v_ws, 'Tail Lamp [Remove & Install, Repair - Minor Repair]', 1, 0.5, 'Remove & Install, Repair - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-049', v_ws, 'Trouble Shooting Air Conditioning [Trouble Shooting - Major Repair]', 3, 6, 'Trouble Shooting - Major Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-050', v_ws, 'Hose Air Conditioning [Remove & Install - Minor Repair]', 2, 2, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-051', v_ws, 'Vessel [Welding Repair - Major Repair]', 3, 1.5, 'Welding Repair - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-052', v_ws, 'Tail Gate [Welding Repair - Minor Repair]', 2, 1, 'Welding Repair - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-053', v_ws, 'Upper Structure [Welding Repair - Minor Repair]', 3, 1.5, 'Welding Repair - Minor Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-054', v_ws, 'Lower Structure [Welding Repair - Minor Repair]', 3, 1.5, 'Welding Repair - Minor Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-055', v_ws, 'Front Spring A1 [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-056', v_ws, 'Front Spring A2 [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-057', v_ws, 'Rear Spring A1 [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-058', v_ws, 'Rear Spring A2 [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-059', v_ws, 'Torque Rod [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-060', v_ws, 'V - Stay [Remove & Install - Minor Repair]', 4, 2, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-061', v_ws, 'Shock Absorber Rear [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-062', v_ws, 'Shock Absorber Front [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-063', v_ws, 'Contact Stud / Hollow Spring [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-064', v_ws, 'Spring Seat [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-065', v_ws, 'Stabilizer [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-066', v_ws, 'Rear Tire [Remove & Install - Minor Repair]', 0.5, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-067', v_ws, 'Front Tire [Remove & Install - Minor Repair]', 0.5, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-068', v_ws, 'Stock Tire / Repair Tire [Remove & Install - Minor Repair]', 2, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-069', v_ws, 'Wheel Bearing [Remove & Install - Minor Repair]', 1, 1, 'Remove & Install - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-070', v_ws, 'Periodic Service 250 [PS & Backlog - PM Ringan]', 3, 3, 'PS & Backlog - PM Ringan', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-071', v_ws, 'Periodic Service 500 [PS & Backlog - PM Sedang]', 3, 3, 'PS & Backlog - PM Sedang', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-072', v_ws, 'Periodic Service 750 [PS & Backlog - PM Sedang]', 3, 3, 'PS & Backlog - PM Sedang', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-073', v_ws, 'Periodic Service 1000 [PS & Backlog - PM Berat]', 6, 6, 'PS & Backlog - PM Berat', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-074', v_ws, 'Greasing [Schedule Greasing - PM Ringan]', 0.25, 0.5, 'Schedule Greasing - PM Ringan', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-075', v_ws, 'Refill Oil / Coolant [P2H - PM Ringan]', 0.25, 0.5, 'P2H - PM Ringan', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-076', v_ws, 'Inspection Unit [Inspection - Minor Repair]', 1, 0.5, 'Inspection - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-077', v_ws, 'Cek Pressure Tire [Adjustment - Minor Repair]', 0.25, 0.5, 'Adjustment - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-078', v_ws, 'Engine [Remove & Install - Overhaul Engine]', 56, 42, 'Remove & Install - Overhaul Engine', 3, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-079', v_ws, 'Transmission [Remove & Install - Overhaul Transmissi]', 56, 30, 'Remove & Install - Overhaul Transmissi', 3, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-080', v_ws, 'Repair Cabin Vessel [Painting - Major Repair]', 112, 112, 'Painting - Major Repair', 4, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-081', v_ws, 'Remove Install Engine [Ovh Remove Install - Major Repair]', 24, 12, 'Ovh Remove Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-082', v_ws, 'Remove Install Transmission [Ovh Remove Install - Major Repair]', 24, 12, 'Ovh Remove Install - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-083', v_ws, 'Front Brake Lining 1 Set [Rotable - Minor Repair]', 0.5, 1, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-084', v_ws, 'Rear Brake Lining 1 Set [Rotable - Minor Repair]', 0.5, 1, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-085', v_ws, 'Rotable Alternator [Rotable - Minor Repair]', 1, 0.5, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-086', v_ws, 'Rotable Motor Starting [Rotable - Minor Repair]', 1, 0.5, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-087', v_ws, 'Rotable Injector Volvo 6 Pcs [Rotable - Minor Repair]', 6, 3, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-088', v_ws, 'Rotable Injector Axor 6 Pcs [Rotable - Minor Repair]', 3, 3, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-089', v_ws, 'Rotable Torque Rod Volvo Axor Beiben [Rotable - Minor Repair]', 1, 0.5, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-090', v_ws, 'Rotable V Stay Volvo Axor Beiben [Rotable - Minor Repair]', 1, 0.5, 'Rotable - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-091', v_ws, 'Commissioning Completed [Inspection Repair - Minor Repair]', 12, 24, 'Inspection Repair - Minor Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-092', v_ws, 'Stock Spring Sesis [Welding & Repair - Minor Repair]', 4, 3.5, 'Welding & Repair - Minor Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-093', v_ws, 'Fabrikasi Support Minor [Welding & Repair - Minor Repair]', 4, 2, 'Welding & Repair - Minor Repair', 1, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;
  INSERT INTO jobs (tenant_id, job_code, section_id, job_description, plan_hours, base_points, job_type, default_team_size, is_active)
  VALUES (v_tenant, 'COM-094', v_ws, 'Fabrikasi Support Major [Welding & Repair - Major Repair]', 10, 8, 'Welding & Repair - Major Repair', 2, true)
  ON CONFLICT (tenant_id, section_id, job_code) DO NOTHING;

  SELECT id INTO v_j1 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-001';
  SELECT id INTO v_j2 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-002';
  SELECT id INTO v_j12 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-012';
  SELECT id INTO v_j70 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-070';
  SELECT id INTO v_j78 FROM jobs WHERE tenant_id = v_tenant AND job_code = 'COM-078';

  -- 8. Pengguna Uji SUM (Superintendent, Supervisor, Mekanik)
  -- Hapus token lama jika ada agar bersih
  DELETE FROM api_tokens WHERE tenant_id = v_tenant;
  DELETE FROM mechanics WHERE tenant_id = v_tenant;

  -- Superintendent L2
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-SUPT-001', 'Pandu Wijaksono', 'pandu.sum@company.com', 'superintendent', v_tarif_adv, true, true, true, true, true)
  RETURNING id INTO v_supt;

  -- Supervisor L1
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-SUPV-001', 'Maman Suryadi', 'maman.sum@company.com', 'supervisor', v_tarif_senior, true, true, false, false, false)
  RETURNING id INTO v_supv;

  -- Mekanik 1
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-001', 'Ahmad Fauzi', 'ahmad.sum@company.com', 'mechanic', v_tarif_senior, true, false, false, false, false)
  RETURNING id INTO v_m1;

  -- Mekanik 2
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-002', 'Budi Santoso (SUM)', 'budi.sum@company.com', 'mechanic', v_tarif_junior, true, false, false, false, false)
  RETURNING id INTO v_m2;

  -- Mekanik 3
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active, may_view_performance, may_view_technical, may_view_report, may_admin)
  VALUES (v_tenant, 'SUM-MECH-003', 'Charlie Wijaya (SUM)', 'charlie.sum@company.com', 'mechanic', v_tarif_junior, true, false, false, false, false)
  RETURNING id INTO v_m3;

  -- Token Login Pengguna SUM
  INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
  VALUES
    (v_tenant, v_supt, 'token_sum_supt_pandu_012345', true),
    (v_tenant, v_supv, 'token_sum_supv_maman_012345', true),
    (v_tenant, v_m1,   'token_sum_mech_ahmad_012345', true),
    (v_tenant, v_m2,   'token_sum_mech_budi_0123456', true),
    (v_tenant, v_m3,   'token_sum_mech_charlie_123',  true);

  -- 9. Transaksi Work Orders Uji SUM
  DELETE FROM work_orders WHERE tenant_id = v_tenant;

  -- WO 1: Assigned (Pending Mechanic Work) - Normal
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-0001', v_ws, v_j1, v_u1, 'normal', 'workshop', 'Perbaikan Intercooler rutin',
    'pending_mechanic_work', v_supv, now() - interval '2 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);

  -- WO 2: In Progress - Normal
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at, start_time
  ) VALUES (
    v_tenant, 'WO-SUM-0002', v_ws, v_j2, v_u2, 'difficult', 'field', 'Penggantian Injector Volvo di lapangan',
    'in_progress', v_supv, now() - interval '3 hours', now() - interval '2 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 0.5, v_supv);
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 0.5, v_supv);

  -- WO 3: Pending Supervisor (Submitted)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at, start_time, end_time, session_hours, submitted_at
  ) VALUES (
    v_tenant, 'WO-SUM-0003', v_ws, v_j70, v_u3, 'normal', 'workshop', 'Periodic Service 250 selesai',
    'pending_supervisor', v_supv, now() - interval '5 hours', now() - interval '4 hours', now() - interval '1 hour', 3.0, now() - interval '1 hour'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 1.0, v_supv);

  -- WO 4: Pending Superintendent (L1 Approved)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at
  ) VALUES (
    v_tenant, 'WO-SUM-0004', v_ws, v_j12, v_u2, 'difficult', 'workshop', 'Overhaul Disc Clutch siap approval L2',
    'pending_superintendent', v_supv, now() - interval '8 hours', now() - interval '7 hours', now() - interval '2 hours', 5.0, now() - interval '2 hours',
    v_supv, now() - interval '1 hour'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 0.6, v_supv);
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 0.4, v_supv);

  -- WO 5: Approved (Selesai & Final)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at, start_time, end_time, session_hours, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at, final_points
  ) VALUES (
    v_tenant, 'WO-SUM-0005', v_ws, v_j78, v_u4, 'normal', 'workshop', 'Engine Overhaul Selesai & Disetujui',
    'approved', v_supv, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', now() - interval '2 days' + interval '30 hours', 29.0, now() - interval '1 day',
    v_supv, now() - interval '1 day', v_supt, now() - interval '20 hours', 55.44
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 0.5, v_supv);
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 0.5, v_supv);

  INSERT INTO scoring_snapshots (
    work_order_id, base_points, target_hours, actual_hours, unit_factor, work_condition_factor, timeliness_factor, timeliness_status, safety_factor, mtbf_factor, final_points
  ) VALUES (
    v_wo, 42.0, 56.0, 29.0, 1.1, 1.0, 1.0, 'on_time', 1.0, 1.2, 55.44
  );

  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  VALUES 
    (v_wo, v_m1, v_ws, 27.72, 3500.00),
    (v_wo, v_m3, v_ws, 27.72, 2500.00);

  -- ─── Fitur Khas SUM: WO EXPIRED (> 12 JAM) ───
  -- WO 6: Expired tapi BELUM dilaporkan (>12 jam sejak dibuat)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-EXP-001', v_ws, v_j1, v_u1, 'normal', 'workshop', 'WO Terlewat (Expired >12 jam)',
    'pending_mechanic_work', v_supv, now() - interval '16 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m1, 1.0, v_supv);

  -- WO 7: Expired SUDAH dilaporkan oleh mekanik (is_reported_expired = true)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-EXP-002', v_ws, v_j2, v_u2, 'difficult', 'field', 'WO Expired Dilaporkan ke Pengawas',
    'in_progress', v_supv, now() - interval '20 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m2, 1.0, v_supv);

  -- WO 8: Expired SUDAH dibuka kembali oleh pengawas (reopened_at di-set)
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, work_condition, location, keterangan,
    status, created_by, created_at
  ) VALUES (
    v_tenant, 'WO-SUM-EXP-003', v_ws, v_j12, v_u3, 'normal', 'workshop', 'WO Expired Dibuka Kembali',
    'in_progress', v_supv, now() - interval '24 hours'
  ) RETURNING id INTO v_wo;
  INSERT INTO work_order_team (work_order_id, mechanic_id, share, added_by) VALUES (v_wo, v_m3, 1.0, v_supv);

END $$;
