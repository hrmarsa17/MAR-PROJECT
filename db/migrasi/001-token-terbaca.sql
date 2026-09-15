-- ════════════════════════════════════════════════════════════════════════════
-- 001 — TOKEN DISIMPAN TERBACA, BUKAN TER-HASH
-- ════════════════════════════════════════════════════════════════════════════
-- Keputusan Gabriel 15 Sep 2026. Alasannya ada di db/schema.sql pada tabel
-- api_tokens; ringkasnya: layar Monitoring ADA untuk membacakan token kembali
-- kepada mekanik yang lupa, dan hash mematikan justru fungsi itu.
--
-- ── YANG HILANG, DAN TIDAK BISA DIKEMBALIKAN ────────────────────────────────
-- Token yang sudah terlanjur ter-hash TIDAK bisa dipulihkan — itu memang sifat
-- hash. Baris-baris itu DICABUT, bukan dibiarkan menggantung dengan kolom
-- `token` kosong: token yang tak bisa dibaca DAN masih berlaku adalah keadaan
-- yang membingungkan semua orang.
--
-- Setelah migrasi ini, terbitkan ulang token tiap mekanik:
--     npm run token <kode_mekanik>
--
-- Aman diulang. Dijalankan dalam satu transaksi oleh scripts/migrasi.ts.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS token text;

-- Cabut yang tak punya token terbaca. Dilakukan SEBELUM kolomnya dijadikan
-- NOT NULL, kalau tidak ALTER-nya gagal pada baris lama.
UPDATE api_tokens
   SET is_active = false,
       revoked_at = coalesce(revoked_at, now())
 WHERE token IS NULL;

-- Baris tercabut tetap disimpan sebagai jejak, tapi butuh nilai unik supaya
-- lolos NOT NULL + UNIQUE. Diberi penanda yang jelas TIDAK BISA dipakai masuk:
-- panjangnya jauh di atas token sungguhan dan berawalan yang mustahil diketik.
UPDATE api_tokens
   SET token = 'DICABUT-MIGRASI-001-' || id::text
 WHERE token IS NULL;

ALTER TABLE api_tokens ALTER COLUMN token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_token_key'
  ) THEN
    ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_token_key UNIQUE (token);
  END IF;
END $$;

ALTER TABLE api_tokens DROP COLUMN IF EXISTS token_hash;
ALTER TABLE api_tokens DROP COLUMN IF EXISTS token_hint;
