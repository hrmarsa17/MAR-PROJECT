-- ════════════════════════════════════════════════════════════════════════════
-- KATALOG CONTOH — HANYA UNTUK MENGUJI LAYAR
-- ════════════════════════════════════════════════════════════════════════════
-- BUKAN data KMB. Unit dan joblist sungguhan disetorkan Gabriel setelah sistem
-- jadi (lihat docs/SERAH-TERIMA.md); yang di sini cuma cukup untuk membuktikan
-- cascade empat tingkat dan kedua mode grup benar-benar bekerja.
--
-- Semua namanya diawali "CONTOH" dengan sengaja, supaya tak seorang pun keliru
-- menyangkanya data sungguhan — termasuk saya, enam minggu lagi.
--
-- Jalankan lewat: npx tsx scripts/isi-katalog-contoh.ts
-- Idempotent: aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant   smallint;
  v_field    smallint;
  v_tyre     smallint;
  v_ws       smallint;
  v_hauler   integer;
  v_dozer    integer;
  v_engine   integer;
  v_undercar integer;
  v_sub_head integer;
  v_sub_turbo integer;
  v_sub_track integer;
  v_tier     smallint;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE code = 'KMB';
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Tenant KMB belum ada — jalankan db/seed.sql dulu'; END IF;

  SELECT id INTO v_field FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_tyre  FROM sections WHERE tenant_id = v_tenant AND code = 'tyreman';
  SELECT id INTO v_ws    FROM sections WHERE tenant_id = v_tenant AND code = 'workshop';
  SELECT id INTO v_tier  FROM difficulty_tiers WHERE tenant_id = v_tenant LIMIT 1;

  -- ── model unit ───────────────────────────────────────────────────────────
  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-hauler', 'CONTOH Hauler', v_field)
  ON CONFLICT (tenant_id, code, section_id) DO NOTHING;
  SELECT id INTO v_hauler FROM unit_models
   WHERE tenant_id = v_tenant AND code = 'contoh-hauler' AND section_id = v_field;

  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-dozer', 'CONTOH Bulldozer', v_field)
  ON CONFLICT (tenant_id, code, section_id) DO NOTHING;
  SELECT id INTO v_dozer FROM unit_models
   WHERE tenant_id = v_tenant AND code = 'contoh-dozer' AND section_id = v_field;

  -- Workshop juga memakai model, tapi TANPA unit — modelnya dipilih langsung.
  INSERT INTO unit_models (tenant_id, code, name, section_id)
  VALUES (v_tenant, 'contoh-rebuild', 'CONTOH Rebuild Engine', v_ws)
  ON CONFLICT (tenant_id, code, section_id) DO NOTHING;

  -- ── unit ─────────────────────────────────────────────────────────────────
  -- unit_factor berbeda-beda supaya panel Preview terlihat berubah saat unit
  -- diganti; itu satu-satunya cara memastikan pengalinya benar-benar terpakai.
  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES
    (v_tenant, 'CONTOH-HD01', 'CONTOH HD-001', v_hauler, 1.000, 'HM'),
    (v_tenant, 'CONTOH-HD02', 'CONTOH HD-002', v_hauler, 1.200, 'HM'),
    (v_tenant, 'CONTOH-HD03', 'CONTOH HD-003', v_hauler, 1.500, 'HM'),
    (v_tenant, 'CONTOH-DZ01', 'CONTOH DZ-001', v_dozer,  1.300, 'HM')
  ON CONFLICT (tenant_id, unit_code) DO NOTHING;

  -- Unit tyreman diukur KILOMETER, bukan jam mesin.
  INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
  VALUES
    (v_tenant, 'CONTOH-TY01', 'CONTOH TY-001', NULL, 1.000, 'KM'),
    (v_tenant, 'CONTOH-TY02', 'CONTOH TY-002', NULL, 1.100, 'KM')
  ON CONFLICT (tenant_id, unit_code) DO NOTHING;

  -- ── komponen & sub komponen ──────────────────────────────────────────────
  INSERT INTO job_components (section_id, name, sort_order)
  VALUES (v_field, 'CONTOH Engine', 1), (v_field, 'CONTOH Undercarriage', 2)
  ON CONFLICT (section_id, name) DO NOTHING;
  SELECT id INTO v_engine   FROM job_components WHERE section_id = v_field AND name = 'CONTOH Engine';
  SELECT id INTO v_undercar FROM job_components WHERE section_id = v_field AND name = 'CONTOH Undercarriage';

  INSERT INTO job_sub_components (component_id, name, sort_order)
  VALUES (v_engine, 'CONTOH Cylinder Head', 1), (v_engine, 'CONTOH Turbocharger', 2),
         (v_undercar, 'CONTOH Track Link', 1)
  ON CONFLICT (component_id, name) DO NOTHING;
  SELECT id INTO v_sub_head  FROM job_sub_components WHERE component_id = v_engine   AND name = 'CONTOH Cylinder Head';
  SELECT id INTO v_sub_turbo FROM job_sub_components WHERE component_id = v_engine   AND name = 'CONTOH Turbocharger';
  SELECT id INTO v_sub_track FROM job_sub_components WHERE component_id = v_undercar AND name = 'CONTOH Track Link';

  -- ── job field (cascade) ──────────────────────────────────────────────────
  -- Deskripsi yang SAMA sengaja ada di dua model unit: itu yang membuat mode
  -- grup 'job' (1 job · banyak unit) bisa diuji, karena job dicocokkan lewat
  -- deskripsinya, bukan lewat id — id-nya memang berbeda per model.
  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id,
                    job_description, plan_hours, base_points, difficulty_tier_id)
  VALUES
    (v_tenant, 'CONTOH-J001', v_field, v_hauler, v_sub_head,  'CONTOH Remove & Install Cylinder Head', 8.00, 20.000, v_tier),
    (v_tenant, 'CONTOH-J002', v_field, v_hauler, v_sub_turbo, 'CONTOH Ganti Turbocharger',             4.00, 10.000, v_tier),
    (v_tenant, 'CONTOH-J003', v_field, v_hauler, v_sub_head,  'CONTOH Adjust Valve Clearance',         3.00,  7.500, v_tier),
    (v_tenant, 'CONTOH-J004', v_field, v_dozer,  v_sub_head,  'CONTOH Remove & Install Cylinder Head', 9.00, 24.000, v_tier),
    (v_tenant, 'CONTOH-J005', v_field, v_dozer,  v_sub_track, 'CONTOH Ganti Track Link',               6.00, 15.000, v_tier)
  ON CONFLICT (tenant_id, job_code) DO NOTHING;

  -- ── job tyreman (datar, tanpa cascade) ───────────────────────────────────
  INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id,
                    job_description, plan_hours, base_points, difficulty_tier_id)
  VALUES
    (v_tenant, 'CONTOH-T001', v_tyre, NULL, NULL, 'CONTOH Inspeksi Tekanan Ban', 1.00, 2.500, v_tier),
    (v_tenant, 'CONTOH-T002', v_tyre, NULL, NULL, 'CONTOH Remove & Instal Ban',  2.50, 6.000, v_tier)
  ON CONFLICT (tenant_id, job_code) DO NOTHING;

  RAISE NOTICE 'Katalog contoh terpasang.';
END $$;
