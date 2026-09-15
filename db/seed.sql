-- ════════════════════════════════════════════════════════════════════════════
-- DATA BENIH — kerangka, bukan isi
--
-- Unit dan joblist sungguhan disetorkan pemilik produk. Yang ada di sini hanya
-- yang menentukan BENTUK sistem: section, faktor, tarif, tingkat kesulitan, dan
-- form detail. Semuanya bisa diubah lewat layar nanti, tanpa menyentuh kode.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO tenants (code, name, timezone) VALUES ('KMB', 'KMB Project', 'Asia/Jakarta');

-- ─── Section ────────────────────────────────────────────────────────────────
-- picker_style menentukan bentuk pemilihan job; requires_unit menentukan apakah
-- unit wajib. Di KMB V2 ketiganya adalah cabang `if` yang tersebar di layar dan
-- server. Di sini mereka baris data: menambah section = satu INSERT.

INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
SELECT t.id, s.code, s.name, s.style::picker_style, s.req, s.urut
FROM tenants t, (VALUES
  ('tyreman',  'Tyreman',  'flat',    true,  1),
  ('field',    'Field',    'cascade', true,  2),
  ('workshop', 'Workshop', 'cascade', false, 3)
) AS s(code, name, style, req, urut)
WHERE t.code = 'KMB';

-- ─── Faktor ─────────────────────────────────────────────────────────────────
-- Faktor yang TIDAK ada bernilai 1,0 (tanpa penyesuaian), bukan 0. Satu baris
-- terhapus tidak boleh membuat semua orang dibayar nol.

INSERT INTO factors (tenant_id, factor_type, factor_key, factor_value, description)
SELECT t.id, f.tipe, f.kunci, f.nilai, f.ket
FROM tenants t, (VALUES
  ('work_condition','normal',      1.0, 'Kondisi kerja biasa'),
  ('work_condition','difficult',   1.2, 'Medan/cuaca menyulitkan'),
  ('work_condition','extreme',     1.5, 'Kondisi ekstrem'),
  ('timeliness',    'on_time',     1.0, 'Selesai dalam target jam'),
  ('timeliness',    'late',        0.8, 'Lewat target sampai 150%'),
  ('timeliness',    'way_late',    0.5, 'Lewat 150% target'),
  ('safety',        'no_incident', 1.0, 'Tanpa insiden'),
  ('safety',        'incident',    0.0, 'Ada insiden — SELURUH WO jadi nol'),
  ('mtbf',          'first_time',  1.2, 'Perbaikan pertama'),
  ('mtbf',          'redo',        0.8, 'Kerja ulang')
) AS f(tipe, kunci, nilai, ket)
WHERE t.code = 'KMB';

-- ─── Tarif per jabatan ──────────────────────────────────────────────────────
-- Mekanik menunjuk baris ini lewat kunci asing yang NOT NULL. Tidak ada jalan
-- untuk gagal cocok, dan karena itu tidak ada nilai cadangan yang bisa dipakai
-- diam-diam. Di KMB V2 tarif dicari lewat nama setelan 'rate_<jabatan>'; satu
-- spasi di kolom jabatan membuat sistem memakai 50.000/poin tanpa memberi tahu.

INSERT INTO pay_rates (tenant_id, position, label, idr_per_point, section)
SELECT t.id, r.pos, r.label, r.tarif, NULL
FROM tenants t, (VALUES
  ('junior',  'Junior',  2500.00),
  ('senior',  'Senior',  3500.00),
  ('advisor', 'Advisor', 4500.00)
) AS r(pos, label, tarif)
WHERE t.code = 'KMB';

-- ─── Tingkat kesulitan ──────────────────────────────────────────────────────
-- Pembantu pengisian katalog, BUKAN sumber kebenaran. base_points tetap kolom
-- yang bisa disunting langsung, karena angkanya akan terus disesuaikan seiring
-- sistem berjalan.
--
-- Angka di bawah adalah rasio base_point ÷ plan_hours yang terbaca di seluruh
-- 1.399 baris katalog KMB V2 — pola yang konsisten tanpa kecuali, tapi tidak
-- pernah tertulis sebagai aturan di kolom mana pun.

INSERT INTO difficulty_tiers (tenant_id, code, name, multiplier)
SELECT t.id, d.kode, d.nama, d.kali
FROM tenants t, (VALUES
  ('standard', 'Standar',  2.0),
  ('complex',  'Kompleks', 2.5),
  ('overhaul', 'Overhaul', 3.0)
) AS d(kode, nama, kali)
WHERE t.code = 'KMB';

-- ─── Form detail: ban ───────────────────────────────────────────────────────
-- Paket tyreman KMB V2 terbangun penuh lalu ditidurkan lewat satu tetapan di
-- kode. Di sini menyalakan atau memadamkannya adalah UPDATE satu baris, dan
-- jumlah posisi ban adalah data — bukan angka yang tertanam di kode.

INSERT INTO job_detail_forms (tenant_id, code, name, is_positional, position_count, is_enabled)
SELECT t.id, f.kode, f.nama, f.pos, f.jml, f.nyala
FROM tenants t, (VALUES
  ('tyre_inspeksi',       'Inspeksi Ban',           true,  10, true),
  ('tyre_remove_instal',  'Remove / Instal Ban',    true,  10, true),
  ('tyre_repair',         'Repair Ban',             false, NULL, true)
) AS f(kode, nama, pos, jml, nyala)
WHERE t.code = 'KMB';

-- Daftar pilihan. Ambang dan umur sasaran sengaja DIBIARKAN KOSONG — itu
-- keputusan yang harus diambil manusia, bukan ditebak kode.
INSERT INTO option_lists (tenant_id, code, name)
SELECT t.id, l.kode, l.nama
FROM tenants t, (VALUES
  ('tyre_problem',  'Problem ban'),
  ('tyre_remarks',  'Keterangan ban'),
  ('tyre_kondisi',  'Kondisi ban')
) AS l(kode, nama)
WHERE t.code = 'KMB';

-- Medan form. `has_before_after` inilah yang menjadikan "pressure before/after
-- 10 posisi" sebagai konfigurasi: menambah medan keempat = satu INSERT.
INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
SELECT f.id, d.kunci, d.label, d.tipe, d.ba, d.wajib, d.urut
FROM job_detail_forms f, (VALUES
  ('pressure', 'Tekanan (psi)', 'numeric', true,  false, 1),
  ('rtd',      'RTD (mm)',      'numeric', true,  false, 2),
  ('suhu',     'Suhu (°C)',     'numeric', true,  false, 3)
) AS d(kunci, label, tipe, ba, wajib, urut)
WHERE f.code = 'tyre_inspeksi';

INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
SELECT f.id, d.kunci, d.label, d.tipe, false, false, d.urut
FROM job_detail_forms f, (VALUES
  ('remove_sn',        'SN dilepas',      'text', 1),
  ('remove_merk',      'Merk dilepas',    'text', 2),
  ('remove_pattern',   'Pattern dilepas', 'text', 3),
  ('remove_size',      'Ukuran dilepas',  'text', 4),
  ('remove_problem',   'Problem',         'enum', 5),
  ('instal_sn',        'SN dipasang',     'text', 6),
  ('instal_merk',      'Merk dipasang',   'text', 7),
  ('instal_pattern',   'Pattern dipasang','text', 8),
  ('instal_size',      'Ukuran dipasang', 'text', 9)
) AS d(kunci, label, tipe, urut)
WHERE f.code = 'tyre_remove_instal';

INSERT INTO job_detail_fields (form_id, field_key, label, data_type, has_before_after, is_required, sort_order)
SELECT f.id, d.kunci, d.label, d.tipe, false, false, d.urut
FROM job_detail_forms f, (VALUES
  ('sn',      'SN ban',  'text', 1),
  ('merk',    'Merk',    'text', 2),
  ('pattern', 'Pattern', 'text', 3),
  ('size',    'Ukuran',  'text', 4)
) AS d(kunci, label, tipe, urut)
WHERE f.code = 'tyre_repair';

-- ─── Setelan ────────────────────────────────────────────────────────────────
INSERT INTO settings (tenant_id, setting_key, setting_value, description)
SELECT t.id, s.kunci, s.nilai, s.ket
FROM tenants t, (VALUES
  ('periode_payroll_mulai', '16',  'Periode gaji dimulai tanggal ini, berakhir tanggal 15'),
  ('shift1_mulai',          '06',  'Shift 1 mulai jam (leaderboard harian)'),
  ('shift2_mulai',          '18',  'Shift 2 mulai jam'),
  ('ambang_kembar_menit',   '30',  'Selisih jam mulai yang dicurigai kembar'),
  ('retensi_struk_hari',    '30',  'Umur processed_ops sebelum dipangkas'),
  ('umur_antrean_hari',     '20',  'Umur maksimum entri outbox di HP — WAJIB < retensi_struk_hari')
) AS s(kunci, nilai, ket)
WHERE t.code = 'KMB';
