-- =============================================================================
-- Cermin mentah spreadsheet KMB V2 di Supabase (skema `kmb`)
-- Rumah: kmb · Pemegang: Gabriel · Penjelasan lengkap: db/kmb/README.md
-- =============================================================================
--
-- Prinsip (identik dengan db/sum/cermin_sheet.sql, keputusan 29 Okt):
--   * Satu tabel per sheet, satu baris tabel per baris sheet (`baris` = nomor baris
--     di sheet; baris data pertama = 2).
--   * `nilai` berisi isi baris PERSIS seperti getValues() di GAS, berupa array
--     menurut urutan kolom. Sel kosong disimpan sebagai "" (bukan null), dan
--     tanggal sebagai string ISO UTC. Kolom ini sumber kebenaran.
--   * `data` berisi objek {header: nilai} untuk memudahkan kueri. Kalau ada header
--     kembar, yang paling kanan menang. Untuk kepastian, selalu pakai `nilai`.
--   * Tidak ada kolom yang diganti nama, dibuang, atau dihitung ulang.
--   * Data hanya mengalir dari spreadsheet ke sini, tidak pernah sebaliknya.
--   * Setiap sinkron mengganti isi satu sheet secara utuh dalam satu transaksi.
--
-- Aman dijalankan ulang (IF NOT EXISTS).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS kmb;

-- Keterangan spreadsheet: id, judul, zona waktu, waktu sinkron terakhir.
CREATE TABLE IF NOT EXISTS kmb.cermin_meta (
  kunci     text PRIMARY KEY,
  nilai     text NOT NULL,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

-- Header asli setiap sheet, dibaca saat sinkron. Header di produksi bisa berbeda
-- dari yang tertulis di kode, jadi yang dipakai selalu yang tercatat di sini.
CREATE TABLE IF NOT EXISTS kmb.cermin_header (
  sheet        text PRIMARY KEY,
  tabel        text NOT NULL,
  headers      text[] NOT NULL,
  tipe         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {header: 'teks'|'angka'|'tanggal'|'boolean'|'galat'|'campur:…'}
  jumlah_baris integer NOT NULL,
  sidik        text NOT NULL,                      -- sha256 isi sheet
  sinkron_at   timestamptz NOT NULL DEFAULT now()
);

-- Catatan setiap putaran sinkron per sheet. Dipakai untuk laporan selisih harian.
CREATE TABLE IF NOT EXISTS kmb.cermin_log (
  id           bigserial PRIMARY KEY,
  sheet        text NOT NULL,
  mulai_at     timestamptz NOT NULL,
  selesai_at   timestamptz NOT NULL DEFAULT now(),
  jumlah_baris integer,
  sidik        text,
  galat        text
);

-- 21 tabel cermin untuk sheet produksi KMB V2.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_components', 'config_units', 'config_mechanics', 'config_factors', 'config_rates', 'config_base_settings',
    'api_tokens', 'work_orders', 'work_orders_archive', 'work_order_team', 'approvals',
    'scoring_snapshots', 'mechanic_points', 'others_job_requests', 'audit_logs',
    'processed_ops', 'web_kiriman', 'tyre_records', 'counter_wo', 'notification_queue', 'push_subs'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS kmb.%I (
         baris      integer PRIMARY KEY,
         nilai      jsonb   NOT NULL,
         data       jsonb   NOT NULL,
         sinkron_at timestamptz NOT NULL DEFAULT now()
       )', t);
  END LOOP;
END $$;

-- Indeks untuk kunci yang sering dicari.
CREATE INDEX IF NOT EXISTS kmb_work_orders_id_idx         ON kmb.work_orders         ((data->>'id'));
CREATE INDEX IF NOT EXISTS kmb_work_orders_wo_number_idx  ON kmb.work_orders         ((data->>'wo_number'));
CREATE INDEX IF NOT EXISTS kmb_work_orders_status_idx     ON kmb.work_orders         ((data->>'status'));
CREATE INDEX IF NOT EXISTS kmb_wo_archive_id_idx          ON kmb.work_orders_archive ((data->>'id'));
CREATE INDEX IF NOT EXISTS kmb_wo_archive_wo_number_idx   ON kmb.work_orders_archive ((data->>'wo_number'));
CREATE INDEX IF NOT EXISTS kmb_wo_team_wo_idx             ON kmb.work_order_team     ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS kmb_wo_team_mechanic_idx       ON kmb.work_order_team     ((data->>'mechanic_id'));
CREATE INDEX IF NOT EXISTS kmb_mechanic_points_wo_idx     ON kmb.mechanic_points     ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS kmb_mechanic_points_mech_idx   ON kmb.mechanic_points     ((data->>'mechanic_id'));
CREATE INDEX IF NOT EXISTS kmb_approvals_wo_idx           ON kmb.approvals           ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS kmb_api_tokens_token_idx       ON kmb.api_tokens          ((data->>'token'));
CREATE INDEX IF NOT EXISTS kmb_processed_ops_op_idx       ON kmb.processed_ops       ((data->>'op_id'));
CREATE INDEX IF NOT EXISTS kmb_config_mechanics_email_idx ON kmb.config_mechanics    ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS kmb_config_mechanics_id_idx    ON kmb.config_mechanics    ((data->>'mechanic_id'));

-- Cermin hanya dibaca oleh Worker dan alat sinkron, tidak lewat API publik.
REVOKE ALL ON SCHEMA kmb FROM anon, authenticated;
