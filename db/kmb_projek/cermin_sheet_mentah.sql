-- =============================================================================
-- Cermin mentah spreadsheet KMB Project di Supabase (skema `kmb_projek`)
-- Rumah: kmb-projek · Pemegang: Raka · Sesuai docs/SERAH-TERIMA-2026-10-29.md §5 Langkah 2
-- =============================================================================
--
-- Format mentah JSONB (seragam dengan db/sum/cermin_sheet.sql dan db/kmb/cermin_sheet.sql):
--   * Satu tabel per sheet, satu baris tabel per baris sheet (`baris` = nomor baris di sheet).
--   * `nilai`: array nilai baris persis seperti getValues() di GAS. Sumber kebenaran.
--   * `data`: objek {header: nilai} untuk kueri cepat.
--   * Menghilangkan perbedaan kolom dan masalah katalog hilang (bug #12 & #15).
--   * Data mengalir searah dari Google Sheets ke Supabase.
--
-- Aman dijalankan ulang (IF NOT EXISTS).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

-- Keterangan spreadsheet: id, judul, zona waktu, waktu sinkron terakhir.
CREATE TABLE IF NOT EXISTS kmb_projek.cermin_meta (
  kunci     text PRIMARY KEY,
  nilai     text NOT NULL,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

-- Header asli setiap sheet, dibaca saat sinkron.
CREATE TABLE IF NOT EXISTS kmb_projek.cermin_header (
  sheet        text PRIMARY KEY,
  tabel        text NOT NULL,
  headers      text[] NOT NULL,
  tipe         jsonb NOT NULL DEFAULT '{}'::jsonb,
  jumlah_baris integer NOT NULL,
  sidik        text NOT NULL,
  sinkron_at   timestamptz NOT NULL DEFAULT now()
);

-- Catatan setiap putaran sinkron per sheet. Dipakai untuk laporan selisih harian.
CREATE TABLE IF NOT EXISTS kmb_projek.cermin_log (
  id           bigserial PRIMARY KEY,
  sheet        text NOT NULL,
  mulai_at     timestamptz NOT NULL,
  selesai_at   timestamptz NOT NULL DEFAULT now(),
  jumlah_baris integer,
  sidik        text,
  galat        text
);

-- Tabel cermin mentah untuk sheet KMB Project
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_components', 'config_units', 'config_mechanics', 'config_factors', 'config_base_settings',
    'api_tokens', 'work_orders', 'work_orders_archive', 'job_catalog', 'catalog_jobs',
    'meter_panel_changes', 'processed_ops', 'audit_logs', 'web_kiriman',
    'scoring_snapshots', 'notification_queue', 'push_subs'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS kmb_projek.%I (
         baris      integer PRIMARY KEY,
         nilai      jsonb   NOT NULL,
         data       jsonb   NOT NULL,
         sinkron_at timestamptz NOT NULL DEFAULT now()
       )', t);
  END LOOP;
END $$;

-- Indeks kueri cepat
CREATE INDEX IF NOT EXISTS kmbp_wo_id_idx        ON kmb_projek.work_orders         ((data->>'id'));
CREATE INDEX IF NOT EXISTS kmbp_wo_number_idx    ON kmb_projek.work_orders         ((data->>'wo_number'));
CREATE INDEX IF NOT EXISTS kmbp_wo_status_idx    ON kmb_projek.work_orders         ((data->>'status'));
CREATE INDEX IF NOT EXISTS kmbp_tokens_token_idx ON kmb_projek.api_tokens          ((data->>'token'));
CREATE INDEX IF NOT EXISTS kmbp_ops_op_idx       ON kmb_projek.processed_ops       ((data->>'op_id'));
CREATE INDEX IF NOT EXISTS kmbp_mech_id_idx      ON kmb_projek.config_mechanics    ((data->>'mechanic_id'));

REVOKE ALL ON SCHEMA kmb_projek FROM anon, authenticated;
