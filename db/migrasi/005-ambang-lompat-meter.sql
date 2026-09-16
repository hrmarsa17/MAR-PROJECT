-- ════════════════════════════════════════════════════════════════════════════
-- 005 — AMBANG "MELOMPAT" untuk HM dan KM
-- ════════════════════════════════════════════════════════════════════════════
-- Dipakai layar Koreksi HM/KM untuk MENANDAI bacaan yang janggal. Ia tidak
-- menolak apa pun — hanya memberi tanda merah pada baris yang paling perlu
-- diperiksa manusia.
--
-- HM 2.000 jam ≈ tiga bulan kerja penuh. Lompatan sebesar itu dalam sekali
-- catat bukan pemakaian, melainkan salah ketik (`_Meter.js:45-47`).
--
-- KM 20.000 adalah angka SEMENTARA, dan penulis sumbernya menandainya begitu
-- dengan sengaja: untuk HM angkanya diturunkan dari jam kerja nyata, sedangkan
-- untuk KM belum ada data jarak tempuh harian unit KMB (`:60-66`). Karena ia
-- cuma menandai, salah tebak tidak menghalangi siapa pun bekerja — ia hanya
-- membuat penandanya kurang berguna. Sesuaikan begitu polanya terlihat.
--
-- Di sini keduanya DATA, bukan tetapan di kode: menyesuaikannya = UPDATE satu
-- baris, bukan deploy.
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO settings (tenant_id, setting_key, setting_value, description)
SELECT t.id, s.kunci, s.nilai, s.ket
FROM tenants t, (VALUES
  ('meter_lompat_hm', '2000',
   'Selisih HM sekali catat yang ditandai MELOMPAT di layar Koreksi HM. Menandai, tidak menolak.'),
  ('meter_lompat_km', '20000',
   'Selisih KM sekali catat yang ditandai MELOMPAT. Angka sementara — sesuaikan bila pola jarak tempuh sudah terlihat.')
) AS s(kunci, nilai, ket)
WHERE t.code = 'KMB'
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
