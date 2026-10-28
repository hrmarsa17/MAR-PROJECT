-- =============================================================================
-- Cermin mentah spreadsheet SUM V2 di Supabase (skema `sum`)
-- Rumah: sum · Pemegang: Gabriel · Penjelasan lengkap: db/sum/README.md
-- =============================================================================
--
-- Prinsip:
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

CREATE SCHEMA IF NOT EXISTS sum;

-- Keterangan spreadsheet: id, judul, zona waktu, waktu sinkron terakhir.
CREATE TABLE IF NOT EXISTS sum.cermin_meta (
  kunci     text PRIMARY KEY,
  nilai     text NOT NULL,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

-- Header asli setiap sheet, dibaca saat sinkron. Header di produksi bisa berbeda
-- dari yang tertulis di kode, jadi yang dipakai selalu yang tercatat di sini.
CREATE TABLE IF NOT EXISTS sum.cermin_header (
  sheet        text PRIMARY KEY,
  tabel        text NOT NULL,
  headers      text[] NOT NULL,
  tipe         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {header: 'teks'|'angka'|'tanggal'|'boolean'|'galat'|'campur:…'}
  jumlah_baris integer NOT NULL,
  sidik        text NOT NULL,                      -- sha256 isi sheet
  sinkron_at   timestamptz NOT NULL DEFAULT now()
);

-- Catatan setiap putaran sinkron per sheet. Dipakai untuk laporan selisih harian.
CREATE TABLE IF NOT EXISTS sum.cermin_log (
  id           bigserial PRIMARY KEY,
  sheet        text NOT NULL,
  mulai_at     timestamptz NOT NULL,
  selesai_at   timestamptz NOT NULL DEFAULT now(),
  jumlah_baris integer,
  sidik        text,
  galat        text
);

-- 19 tabel cermin, satu per sheet produksi SUM V2 (lihat docs/INVENTARIS-SUM.md).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_components', 'config_units', 'config_mechanics', 'config_factors', 'config_base_settings',
    'api_tokens', 'work_orders', 'work_orders_archive', 'work_order_team', 'approvals',
    'scoring_snapshots', 'mechanic_points', 'others_job_requests', 'audit_logs', 'mtbf_tracking',
    'processed_ops', 'web_kiriman', 'notification_queue', 'push_subs'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS sum.%I (
         baris      integer PRIMARY KEY,
         nilai      jsonb   NOT NULL,
         data       jsonb   NOT NULL,
         sinkron_at timestamptz NOT NULL DEFAULT now()
       )', t);
  END LOOP;
END $$;

-- Indeks untuk kunci yang sering dicari.
CREATE INDEX IF NOT EXISTS work_orders_id_idx         ON sum.work_orders         ((data->>'id'));
CREATE INDEX IF NOT EXISTS work_orders_wo_number_idx  ON sum.work_orders         ((data->>'wo_number'));
CREATE INDEX IF NOT EXISTS work_orders_status_idx     ON sum.work_orders         ((data->>'status'));
CREATE INDEX IF NOT EXISTS wo_archive_id_idx          ON sum.work_orders_archive ((data->>'id'));
CREATE INDEX IF NOT EXISTS wo_archive_wo_number_idx   ON sum.work_orders_archive ((data->>'wo_number'));
CREATE INDEX IF NOT EXISTS wo_team_wo_idx             ON sum.work_order_team     ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS wo_team_mechanic_idx       ON sum.work_order_team     ((data->>'mechanic_id'));
CREATE INDEX IF NOT EXISTS mechanic_points_wo_idx     ON sum.mechanic_points     ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS mechanic_points_mech_idx   ON sum.mechanic_points     ((data->>'mechanic_id'));
CREATE INDEX IF NOT EXISTS approvals_wo_idx           ON sum.approvals           ((data->>'wo_id'));
CREATE INDEX IF NOT EXISTS api_tokens_token_idx       ON sum.api_tokens          ((data->>'token'));
CREATE INDEX IF NOT EXISTS processed_ops_op_idx       ON sum.processed_ops       ((data->>'op_id'));
CREATE INDEX IF NOT EXISTS config_mechanics_email_idx ON sum.config_mechanics    ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS config_mechanics_id_idx    ON sum.config_mechanics    ((data->>'mechanic_id'));

-- Cermin hanya dibaca oleh Worker dan alat sinkron, tidak lewat API publik.
REVOKE ALL ON SCHEMA sum FROM anon, authenticated;
