-- ════════════════════════════════════════════════════════════════════════════
-- 004 — FORM BAN: lima medan yang hilang, label layar, dan isi dropdown
-- ════════════════════════════════════════════════════════════════════════════
-- Benih form ban dibuat sebelum bentuk layarnya dibaca baris demi baris, dan
-- setelah dibaca ternyata kurang LIMA medan: remove_remarks, instal_tyre,
-- instal_inner, instal_flap, lokasi_breakdown. Blok Remove/Instal di KMB V2
-- punya 14 medan (`MechanicDashboard.html:1224-1242`), benih ini baru sembilan.
--
-- Labelnya juga bukan label layar. Benih menulis "SN dilepas"; yang dibaca
-- tyreman di lapangan adalah "Serial No" di bawah subjudul "Ban yang DILEPAS".
-- Subjudulnya yang membedakan lepas dan pasang, bukan labelnya — dan label
-- yang berbeda dari yang sudah dihafal orang adalah pelatihan ulang.
--
-- Isi dropdown juga belum ada sama sekali: tiga daftar dibuat kosong, sehingga
-- Problem/Remarks/Kondisi tidak menawarkan apa pun. Nilainya diambil dari
-- `_DetailTyre.js:134-137` — daftar yang sudah dipakai di lapangan.
--
-- Ambang RTD kritis dan umur sasaran SENGAJA TIDAK diisi. Keduanya angka yang
-- harus diputuskan manusia; menebaknya berarti menandai ban sebagai kritis
-- dengan batas yang tak seorang pun setujui. Tanpa ambang, tidak ada penandaan.
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Isi tiga daftar pilihan ─────────────────────────────────────────────
INSERT INTO option_values (list_id, value, sort_order)
SELECT l.id, v.nilai, v.urut
FROM option_lists l
JOIN tenants t ON t.id = l.tenant_id AND t.code = 'KMB',
LATERAL (VALUES
  ('Side wall cut', 1), ('Impact material', 2), ('Run flat', 3),
  ('Tread cut', 4), ('Separasi', 5)
) AS v(nilai, urut)
WHERE l.code = 'tyre_problem'
ON CONFLICT (list_id, value) DO NOTHING;

INSERT INTO option_values (list_id, value, sort_order)
SELECT l.id, v.nilai, v.urut
FROM option_lists l
JOIN tenants t ON t.id = l.tenant_id AND t.code = 'KMB',
LATERAL (VALUES
  ('Scrap', 1), ('Repair', 2), ('Rotasi', 3), ('Stok', 4)
) AS v(nilai, urut)
WHERE l.code = 'tyre_remarks'
ON CONFLICT (list_id, value) DO NOTHING;

INSERT INTO option_values (list_id, value, sort_order)
SELECT l.id, v.nilai, v.urut
FROM option_lists l
JOIN tenants t ON t.id = l.tenant_id AND t.code = 'KMB',
LATERAL (VALUES
  ('Baru', 1), ('Repair', 2), ('Bekas', 3)
) AS v(nilai, urut)
WHERE l.code = 'tyre_kondisi'
ON CONFLICT (list_id, value) DO NOTHING;

-- ─── 2. Lima medan yang hilang + label & urutan sesuai layar ────────────────
-- Urutannya mengikuti `MechanicDashboard.html:1225-1241` persis: enam medan
-- "DILEPAS" lalu delapan medan "DIPASANG". Urutan itu bukan selera — tangan
-- tyreman sudah hafal jalur pengisiannya.
INSERT INTO job_detail_fields
  (form_id, field_key, label, data_type, has_before_after, option_list_id, is_required, sort_order)
SELECT f.id, d.kunci, d.label, d.tipe, false,
       (SELECT l.id FROM option_lists l
         WHERE l.tenant_id = f.tenant_id AND l.code = d.daftar),
       false, d.urut
FROM job_detail_forms f, (VALUES
  ('remove_sn',        'Serial No',         'text', NULL,           1),
  ('remove_merk',      'Merk',              'text', NULL,           2),
  ('remove_pattern',   'Pattern',           'text', NULL,           3),
  ('remove_size',      'Size',              'text', NULL,           4),
  ('remove_problem',   'Problem',           'enum', 'tyre_problem', 5),
  ('remove_remarks',   'Remarks',           'enum', 'tyre_remarks', 6),
  ('instal_sn',        'Serial No',         'text', NULL,           7),
  ('instal_merk',      'Merk',              'text', NULL,           8),
  ('instal_pattern',   'Pattern',           'text', NULL,           9),
  ('instal_size',      'Size',              'text', NULL,          10),
  ('instal_tyre',      'Tyre',              'enum', 'tyre_kondisi',11),
  ('instal_inner',     'Inner',             'enum', 'tyre_kondisi',12),
  ('instal_flap',      'Flap',              'enum', 'tyre_kondisi',13),
  ('lokasi_breakdown', 'Lokasi breakdown',  'text', NULL,          14)
) AS d(kunci, label, tipe, daftar, urut)
WHERE f.code = 'tyre_remove_instal'
ON CONFLICT (form_id, field_key) DO UPDATE
  SET label          = EXCLUDED.label,
      data_type      = EXCLUDED.data_type,
      option_list_id = EXCLUDED.option_list_id,
      sort_order     = EXCLUDED.sort_order;

-- ─── 3. Label layar untuk Repair ────────────────────────────────────────────
UPDATE job_detail_fields d SET label = v.label
FROM job_detail_forms f, (VALUES
  ('sn', 'Serial No'), ('merk', 'Merk'), ('pattern', 'Pattern'), ('size', 'Size')
) AS v(kunci, label)
WHERE d.form_id = f.id AND f.code = 'tyre_repair' AND d.field_key = v.kunci;

-- ─── 4. Hubungkan job ban ke formnya ────────────────────────────────────────
-- Di KMB V2 pemetaan ini berupa daftar kode di setelan, dengan tebakan dari
-- NAMA pekerjaan bila daftarnya kosong (`_DetailTyre.js:679-691`). Tebakan itu
-- sumber kekeliruan yang tak pernah diperiksa siapa pun, jadi di sini ia jadi
-- FK: satu job, paling banyak satu form, tertulis.
--
-- Yang dicocokkan HANYA job di section tyreman, dan hanya lewat kata kerja yang
-- tegas. Job tyreman yang tidak cocok dibiarkan tanpa form — lebih baik tidak
-- punya form daripada punya form yang salah.
-- Tanpa join ke job_sub_components / job_components: keduanya tidak dipakai
-- oleh syarat mana pun di bawah, dan job yang sub_component_id-nya NULL akan
-- tersaring habis olehnya. Versi pertama migrasi ini memang begitu, dan
-- hasilnya nol job terhubung — ketahuan hanya karena dijalankan lalu dilihat.
UPDATE jobs j SET detail_form_id = f.id
FROM job_detail_forms f, sections s
WHERE f.tenant_id = j.tenant_id AND s.id = j.section_id AND s.code = 'tyreman'
  AND j.detail_form_id IS NULL
  AND f.code = CASE
        WHEN j.job_description ILIKE '%inspection%' OR j.job_description ILIKE '%inspeksi%'
          THEN 'tyre_inspeksi'
        WHEN j.job_description ILIKE '%repair%'
          THEN 'tyre_repair'
        WHEN j.job_description ILIKE '%remove%' OR j.job_description ILIKE '%instal%'
          OR j.job_description ILIKE '%assembly%'
          THEN 'tyre_remove_instal'
      END;
