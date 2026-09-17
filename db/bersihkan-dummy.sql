-- ════════════════════════════════════════════════════════════════════════════
-- PEMBERSIH DATA DUMMY MARPROJECT
-- ════════════════════════════════════════════════════════════════════════════
-- Skrip ini menghapus seluruh data contoh/uji (berawalan UJI-%, CONTOH-%, DUMMY-%)
-- dan mengembalikan database ke keadaan bersih, TANPA merusak struktur tabel,
-- akun admin asli, atau data katalog asli.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 1. Hapus Work Order dummy beserta seluruh dependensinya (CASCADE)
  DELETE FROM work_orders
   WHERE keterangan LIKE 'DUMMY-%'
      OR keterangan LIKE 'CONTOH%'
      OR wo_number LIKE 'WO-UJI-%';

  -- 2. Hapus token uji
  DELETE FROM api_tokens
   WHERE token LIKE 'token_uji_%';

  -- 3. Hapus job dummy
  DELETE FROM jobs
   WHERE job_code LIKE 'UJI-%'
      OR job_code LIKE 'CONTOH%';

  -- 4. Hapus sub-komponen dummy
  DELETE FROM job_sub_components
   WHERE name IN ('cylinder head', 'track link', 'engine overhaul')
     AND NOT EXISTS (SELECT 1 FROM jobs WHERE sub_component_id = job_sub_components.id);

  -- 5. Hapus komponen dummy
  DELETE FROM job_components
   WHERE name IN ('engine', 'undercarriage', 'component rebuild')
     AND NOT EXISTS (SELECT 1 FROM job_sub_components WHERE component_id = job_components.id);

  -- 6. Hapus riwayat meter unit dummy
  DELETE FROM meter_readings
   WHERE unit_id IN (SELECT id FROM units WHERE unit_code LIKE 'UJI-%' OR unit_code LIKE 'CONTOH%');

  -- 7. Hapus unit dummy
  DELETE FROM units
   WHERE unit_code LIKE 'UJI-%'
      OR unit_code LIKE 'CONTOH%';

  -- 7. Hapus model unit dummy
  DELETE FROM unit_models
   WHERE code LIKE 'uji-%'
      OR code LIKE 'contoh-%';

  -- 8. Hapus mekanik uji
  DELETE FROM mechanics
   WHERE mechanic_code LIKE 'UJI-%';

  RAISE NOTICE '✅ Sukses! Seluruh data dummy telah dibersihkan.';
END $$;
