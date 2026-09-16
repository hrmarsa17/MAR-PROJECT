-- ════════════════════════════════════════════════════════════════════════════
-- 007 — KODE JOB UNIK PER SECTION, BUKAN PER TENANT
-- ════════════════════════════════════════════════════════════════════════════
-- Ketahuan saat memindahkan katalog KMB yang sesungguhnya, 16 Sep 2026:
-- 162 kode job dipakai DI DUA SECTION dengan arti yang sama sekali berbeda.
--
--   field    JOB-1210  →  Bus / Engine Assy / Overhaul   150 jam  300 poin
--   workshop JOB-1210  →  Comp Engine Rebuild / Washing    8 jam   16 poin
--
-- Di KMB V2 hal ini "jalan" karena section sebuah job adalah SHEET ASALNYA
-- (`JobCatalogService.js:5`) — jadi kodenya memang tidak pernah dimaksudkan
-- unik secara global. Skema kita menganggapnya unik per tenant, dan akibatnya
-- impor sheet kedua MENIMPA baris sheet pertama: 162 job field lenyap, diganti
-- isi workshop, tanpa satu pun galat.
--
-- Identitas job yang benar karena itu adalah (tenant, section, kode).
--
-- ⚠️ CATATAN UNTUK KMB V2 — TIDAK DIPERBAIKI DI SINI, HANYA DICATAT:
-- `getJobRecord()` (`JobCatalogService.js:84-92`) membangun petanya dengan
-- FIELD ditaruh terakhir supaya "menang". Untuk 162 kode itu, WO WORKSHOP
-- diselesaikan memakai baris FIELD — base point 300 alih-alih 16. Itu jalur
-- uang di sistem yang sedang berjalan.
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tenant_id_job_code_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_tenant_section_kode_key'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_tenant_section_kode_key
      UNIQUE (tenant_id, section_id, job_code);
  END IF;
END $$;

COMMENT ON COLUMN jobs.job_code IS
  'Kode job dari katalog. UNIK PER SECTION, bukan per tenant: di KMB V2 kode '
  'yang sama dipakai di field dan workshop untuk pekerjaan yang berbeda.';
