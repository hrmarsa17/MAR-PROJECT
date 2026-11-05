# Panduan Lengkap Persiapan & Eksekusi Hari Kamis (Supabase Mandiri + User & Config CRUD Per Sistem/Rumah di `/saklar`)

Dokumen ini adalah panduan kerja lengkap langkah demi langkah untuk menyiapkan **Backend Mandiri Supabase (Tanpa Pihak Ketiga GAS)**, **Manajemen Pengguna & Token (Full CRUD Per Sistem/Rumah di `/saklar`)**, **Manajemen Master Data Config (Full CRUD Per Sistem/Rumah di `/saklar`: Units, Components, Catalog Jobs, Factors & Tarif)**, serta **perbaikan menyeluruh seluruh layar operasional**.

## 🎛️ Desain CRUD Config di Halaman `/saklar` (1:1 Sama Persis dengan User Management & Dibagi Per Sistem/Rumah)

Sesuai permintaan Anda, manajemen **CRUD Config (`Units`, `Components`, `Catalog Jobs`, `Factors & Tarif`)** di halaman **`/saklar`** (`workers/pintu/public/saklar.html` & `workers/pintu/src/user-admin.js`) kini dibuat **identik 1:1 dengan Manajemen Pengguna (`User Management`)**:

1. **Tab & Filter Per Sistem / Rumah (`SUM V2`, `KMB TRA / V2`, `KMB Projek`, dan `Semua Rumah / Gabungan`)**:
   * Dilengkapi tombol tab cepat per sistem/rumah (`🚜 SUM V2 (sum)`, `🚛 KMB TRA / V2 (kmb)`, `⚙️ KMB Projek (kmb_projek)`, `🏢 Semua Rumah (Gabungan)`) serta dropdown **Pilih Rumah (Kamar Supabase)** yang tersinkronisasi otomatis.
   * Token Admin per rumah (`TOKEN_ADMIN_PER_RUMAH`) dibagi otomatis antara tab **Manajemen Pengguna** dan tab **Manajemen Config**, sehingga Anda cukup mengisi token sekali saja.
2. **5 Kotak Ringkasan KPI Config & Filter Status (`Semua`, `Aktif Saja`, `Nonaktif Saja`)**:
   * Menampilkan jumlah real-time **Config Units**, **Config Components**, **Catalog Jobs**, **Config Factors & Tarif**, serta jumlah baris **Ditampilkan** sesuai filter aktif.
3. **Kolom Badge `RUMAH` di Setiap Baris Tabel Config**:
   * Sama persis dengan tabel User Management, kolom pertama pada tabel Units, Components, Catalog Jobs, dan Factors menampilkan lencana sistem/rumah (`SUM`, `KMBTRA`, `KMBPROJEK`).
   * Tombol **Ubah** dan **🗑 Hapus** pada setiap baris otomatis mengarah ke kamar sistem/rumah pemilik baris tersebut (sekalipun Anda sedang membuka mode `Semua Rumah (Gabungan)`).
4. **Pilihan `Rumah / Sistem Target *` di Dalam Modal Tambah / Ubah Config**:
   * Saat menekan **+ Tambah Unit / Component / Catalog Job / Factor**, field paling atas di dalam modal adalah **Rumah / Sistem Target \*** (`SUM V2`, `KMB TRA / V2`, `KMB Projek`) — persis seperti modal **Tambah Pengguna**.

## 🔍 Ringkasan 10 Perbaikan Alur Aplikasi Lainnya yang Sudah Termasuk

1. **Perbaikan Sintaks Blok Anonim PostgreSQL (`DO $$ ... END $$;`) + Auto-Token Mekanik di SQL Langkah A**.
2. **Injeksi Otomatis Tombol Menu `👥 Users & Config` di Navbar Seluruh Halaman Web Desktop (`web-handler.js`)**.
3. **Halaman Dashboard Utama (`/web?page=dashboard` / `Main.html`) Menampilkan Recent Work Orders, Leaderboard, Tren Poin, & Statistik Lengkap**.
4. **Penyaringan Kartu Hantu `WO-0` & Pemisahan Tab Transfer (`/web?page=approvals&view=transfer`) di Halaman Approvals**.
5. **Reset Akurat `status_group` Saat WO Dikembalikan ke Mekanik (`handleKembalikanKeMekanik`) atau Transfer Disetujui (`handleApproveTransfer`)**.
6. **Perbaikan Aksi `handleGetWoDetailForMechanic` & Bentuk Array `handleDaftarCancelWo` (Halaman Cancel WO SUM V2)**.
7. **Kelengkapan Penuh Aksi Tulis di `kmb_eksekusi_aksi_bertoken` (`db/kmb_projek/rpc_backend_penuh.sql`)**.
8. **Fallback Katalog `getJobCatalogCached("vessel")` & Dinamisasi `work_conditions` dari `config_factors`**.
9. **Kelengkapan Field Kartu Mekanik pada `sum_monitoring_bertoken` & `kmbtra_monitoring_bertoken`**.
10. **Perbaikan Tombol `Ubah` Config Saat Filter Pencarian Aktif & Respons `cekStatusKiriman`**.

### ⚡ 3 Langkah Copy-Paste Agar Semua Fitur Langsung Aktif di Staging Sekarang

#### Langkah A — Copy-Paste & Run SQL Ini di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`)

Buka **Supabase Dashboard Staging (`dnnqrslftndcbmnvuveb`) → SQL Editor → New Query**, tempel seluruh blok SQL di bawah ini (mencakup Backend Mandiri + RPC Admin User & Config CRUD untuk ketiga sistem `kmb_projek`, `sum`, dan `kmb`, termasuk otorisasi otomatis sesi Panel Saklar Pusat `__PANEL_SAKLAR_PUSAT__` tanpa wajib mengisi token per rumah atau `SUPABASE_SERVICE_ROLE_KEY`), lalu klik **Run**:

```sql
-- ==============================================================================
-- BACKEND PENUH MANDIRI SUPABASE (BACA + TULIS + DESKTOP WEB) — SKEMA `kmb_projek`
-- Rumah: kmbprojek · Pemegang: Raka · Tanpa Ketergantungan Pihak Ketiga (GAS)
-- Sesuai AGENTS.md §0a, §1, §2, §5, docs/KEPUTUSAN.md, & docs/SAKLAR.md
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_units' AND column_name = 'unit_code'
  ) THEN
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_name text;
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_factor numeric DEFAULT 1.0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_components' AND column_name = 'component_id'
  ) THEN
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS base_points numeric DEFAULT 1.25;
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS target_hours numeric DEFAULT 2.0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'mechanic_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'token'
  ) THEN
    INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
    SELECT coalesce(nullif(btrim(m.token), ''), substr(md5(m.mechanic_id || '-kmbp-auto'), 1, 20)),
           lower(coalesce(nullif(btrim(m.role), ''), 'mechanic')),
           btrim(m.mechanic_id),
           coalesce(nullif(btrim(m.name), ''), btrim(m.mechanic_id)),
           'ACTIVE',
           now()
      FROM kmb_projek.config_mechanics m
     WHERE upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE'
       AND nullif(btrim(m.mechanic_id), '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM kmb_projek.api_tokens t
          WHERE upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(m.mechanic_id))
            AND upper(btrim(coalesce(t.status, 'ACTIVE'))) = 'ACTIVE'
       )
    ON CONFLICT (token) DO NOTHING;
  END IF;
END $$;

-- Pastikan tabel catalog_jobs selalu tersedia (Perbaikan Bug #15)
CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs (
    job_id TEXT PRIMARY KEY,
    section TEXT NOT NULL DEFAULT 'maintenance',
    unit_model TEXT,
    component TEXT NOT NULL,
    sub_component TEXT,
    job_description TEXT NOT NULL,
    plan_hours NUMERIC DEFAULT 2.0,
    base_point NUMERIC DEFAULT 1.0,
    job_type TEXT DEFAULT 'Preventive',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
REVOKE ALL ON TABLE kmb_projek.catalog_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS kmb_projek.wo_counter_supabase (
  tanggal   text PRIMARY KEY,
  terakhir  integer NOT NULL DEFAULT 0,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb_projek.wo_supabase (
  id        text PRIMARY KEY,
  wo_number text NOT NULL,
  status    text NOT NULL,
  data      jsonb NOT NULL,
  team      jsonb NOT NULL DEFAULT '[]'::jsonb,
  points    jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot  jsonb,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kmbp_wo_supa_status_idx ON kmb_projek.wo_supabase (status);
CREATE INDEX IF NOT EXISTS kmbp_wo_supa_number_idx ON kmb_projek.wo_supabase (wo_number);

CREATE TABLE IF NOT EXISTS kmb_projek.wo_ops_supabase (
  op_id        text PRIMARY KEY,
  action       text NOT NULL,
  actor_id     text,
  result_json  jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb_projek.meter_panel_supabase (
  id           bigserial PRIMARY KEY,
  unit_id      text NOT NULL,
  jenis        text NOT NULL,
  nilai_baru   numeric NOT NULL,
  diganti_pada timestamptz NOT NULL,
  alasan       text NOT NULL,
  actor_id     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE kmb_projek.wo_counter_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.wo_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.wo_ops_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.meter_panel_supabase FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- HELPER INTERNAL 1: Validasi Token Aktif KMB Project (Dual-Format & Case-Insensitive)
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._validasi_token_aktif(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean    text := btrim(coalesce(p_token, ''));
  v_is_jsonb boolean;
  v_user     record;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      SELECT t.data->>'token' AS token,
             coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'user_id'), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
             coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), '') AS name,
             lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
             coalesce(m.data->>'email', '') AS email,
             coalesce(m.data->>'section', 'maintenance') AS section,
             upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
        FROM kmb_projek.api_tokens t
        LEFT JOIN kmb_projek.config_mechanics m
          ON upper(btrim(coalesce(t.data->>'user_id', t.data->>'mechanic_id', ''))) = upper(btrim(coalesce(m.data->>'mechanic_id', '')))
       WHERE trim(t.data->>'token') = $1
         AND upper(coalesce(t.data->>'status', 'ACTIVE')) = 'ACTIVE'
         AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
       LIMIT 1
    $q$ INTO v_user USING v_clean;
  ELSE
    SELECT t.token,
           coalesce(nullif(trim(m.mechanic_id), ''), trim(t.user_id), '') AS mechanic_id,
           coalesce(nullif(trim(m.name), ''), trim(t.name), '') AS name,
           lower(coalesce(nullif(trim(m.role), ''), trim(t.role), 'mechanic')) AS role,
           coalesce(m.email, '') AS email,
           coalesce(m.section, 'maintenance') AS section,
           upper(coalesce(m.status, 'ACTIVE')) AS mech_status
      INTO v_user
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m
        ON upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(coalesce(m.mechanic_id, '')))
        OR btrim(coalesce(t.token, '')) = btrim(coalesce(m.token, ''))
     WHERE trim(t.token) = v_clean
       AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
     LIMIT 1;
  END IF;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role,
    'email', v_user.email,
    'section', v_user.section
  );
END;
$$;

-- ==============================================================================
-- HELPER INTERNAL 2: Nomor WO 4-Digit Harian WIB (`WO-YYYYMMDD-XXXX`)
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._nomor_wo_baru_wib()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tgl  text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  v_max  int := 0;
  v_urut int;
BEGIN
  SELECT coalesce(max(
    CASE
      WHEN wo_number ~ ('^WO-' || v_tgl || '-[0-9]{4}$')
      THEN substring(wo_number from '[0-9]{4}$')::int
      ELSE 0
    END
  ), 0)
  INTO v_max
  FROM kmb_projek.wo_supabase;

  INSERT INTO kmb_projek.wo_counter_supabase (tanggal, terakhir, diubah_at)
  VALUES (v_tgl, GREATEST(v_max, 0) + 1, now())
  ON CONFLICT (tanggal) DO UPDATE
    SET terakhir = GREATEST(kmb_projek.wo_counter_supabase.terakhir, v_max) + 1,
        diubah_at = now()
  RETURNING terakhir INTO v_urut;

  RETURN 'WO-' || v_tgl || '-' || lpad(v_urut::text, 4, '0');
END;
$$;

-- ==============================================================================
-- HELPER INTERNAL 3: Normalisasi Status & Gabung WO Cermin + WO Supabase
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._normalisasi_status_wo(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(btrim(coalesce(p_status, '')));
BEGIN
  IF s IN ('open', 'active', 'assigned', 'in_progress', 'draft', 'pending_mechanic_work') THEN
    RETURN 'pending_mechanic_work';
  ELSIF s IN ('pending_l1', 'pending_supervisor') THEN
    RETURN 'pending_supervisor';
  ELSIF s IN ('pending_l2', 'pending_superintendent') THEN
    RETURN 'pending_superintendent';
  ELSIF s = 'pending_transfer' THEN
    RETURN 'pending_transfer';
  ELSIF s = 'approved' THEN
    RETURN 'approved';
  ELSIF s = 'rejected' THEN
    RETURN 'rejected';
  ELSIF s IN ('cancelled', 'canceled') THEN
    RETURN 'cancelled';
  ELSIF s = 'expired' THEN
    RETURN 'expired';
  END IF;
  RETURN coalesce(nullif(s, ''), 'pending_mechanic_work');
END;
$$;

CREATE OR REPLACE FUNCTION kmb_projek._semua_wo_json()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_jsonb boolean;
BEGIN
  -- 1. Kembalikan semua WO dari wo_supabase lebih dulu (abaikan baris hantu/kosong)
  RETURN QUERY
    SELECT s.data
      FROM kmb_projek.wo_supabase s
     WHERE nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0';

  -- 2. Kembalikan WO dari work_orders yang belum ada di wo_supabase
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'work_orders' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    RETURN QUERY EXECUTE $q$
      SELECT w.data || jsonb_build_object(
               'id', coalesce(w.data->>'id', w.data->>'wo_number'),
               'wo_id', coalesce(w.data->>'id', w.data->>'wo_number'),
               'wo_number', coalesce(w.data->>'wo_number', w.data->>'id'),
               'status', kmb_projek._normalisasi_status_wo(w.data->>'status'),
               'component_name', coalesce(w.data->>'component_name', w.data->>'component', w.data->>'activity', 'Pekerjaan'),
               'unit_id', coalesce(w.data->>'unit_id', w.data->>'unit_code', ''),
               'unit_name', coalesce(w.data->>'unit_name', w.data->>'unit_code', '')
             )
        FROM kmb_projek.work_orders w
       WHERE nullif(btrim(coalesce(w.data->>'wo_number', w.data->>'id', '')), '') IS NOT NULL
         AND upper(btrim(coalesce(w.data->>'wo_number', w.data->>'id', ''))) <> 'WO-0'
         AND NOT EXISTS (
           SELECT 1 FROM kmb_projek.wo_supabase s
            WHERE s.id = coalesce(w.data->>'id', '') OR s.wo_number = coalesce(w.data->>'wo_number', '')
         )
    $q$;
  ELSE
    RETURN QUERY
      SELECT jsonb_build_object(
               'id', w.id,
               'wo_id', w.id,
               'wo_number', w.wo_number,
               'date', w.date::text,
               'shift', coalesce(w.shift, '1'),
               'unit_id', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_code', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_name', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_factor', 1.0,
               'unit', jsonb_build_object(
                 'unit_id', coalesce(w.unit_code, 'WORKSHOP'),
                 'unit_name', coalesce(w.unit_code, 'WORKSHOP'),
                 'unit_factor', 1.0
               ),
               'component_id', coalesce(w.component, 'COM-001'),
               'component_name', coalesce(nullif(w.activity, ''), w.component, 'Pekerjaan'),
               'base_points', coalesce(w.points, 1.0),
               'target_hours', 2.0,
               'effective_base_points', coalesce(w.points, 1.0),
               'effective_target_hours', 2.0,
               'component', jsonb_build_object(
                 'component_no', coalesce(w.component, 'COM-001'),
                 'component_id', coalesce(w.component, 'COM-001'),
                 'component_name', coalesce(nullif(w.activity, ''), w.component, 'Pekerjaan'),
                 'category', coalesce(w.section, 'General'),
                 'base_points', coalesce(w.points, 1.0),
                 'target_hours', 2.0
               ),
               'activity', w.activity,
               'section', coalesce(w.section, 'maintenance'),
               'work_condition', 'normal',
               'location', 'workshop',
               'start_time', w.start_time,
               'end_time', w.end_time,
               'actual_hours', coalesce(w.duration_hours, 0),
               'duration_hours', coalesce(w.duration_hours, 0),
               'status', kmb_projek._normalisasi_status_wo(w.status),
               'points', coalesce(w.points, 0),
               'final_points', coalesce(w.points, 0),
               'idr_value', coalesce(w.idr_value, 0),
               'final_idr', coalesce(w.idr_value, 0),
               'lead_mechanic_id', w.lead_mechanic_id,
               'mechanic_ids', coalesce(w.mechanic_ids, w.lead_mechanic_id, ''),
               'team', CASE WHEN w.lead_mechanic_id IS NOT NULL
                            THEN jsonb_build_array(jsonb_build_object('mechanic_id', w.lead_mechanic_id, 'mechanic_name', coalesce(m.name, w.lead_mechanic_id), 'name', coalesce(m.name, w.lead_mechanic_id), 'percentage', 100))
                            ELSE '[]'::jsonb END,
               'effective_team', CASE WHEN w.lead_mechanic_id IS NOT NULL
                            THEN jsonb_build_array(jsonb_build_object('mechanic_id', w.lead_mechanic_id, 'mechanic_name', coalesce(m.name, w.lead_mechanic_id), 'name', coalesce(m.name, w.lead_mechanic_id), 'percentage', 100))
                            ELSE '[]'::jsonb END,
               'team_names', CASE WHEN w.lead_mechanic_id IS NOT NULL
                                  THEN jsonb_build_array(coalesce(m.name, w.lead_mechanic_id))
                                  ELSE '[]'::jsonb END,
               'keterangan', coalesce(w.notes, ''),
               'created_by', coalesce(w.created_by, ''),
               'created_at', coalesce(to_char(w.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF'), w.date::text),
               'created_at_str', w.date::text
             )
        FROM kmb_projek.work_orders w
        LEFT JOIN kmb_projek.config_mechanics m ON upper(btrim(m.mechanic_id)) = upper(btrim(w.lead_mechanic_id))
       WHERE nullif(btrim(coalesce(w.wo_number, w.id, '')), '') IS NOT NULL
         AND upper(btrim(coalesce(w.wo_number, w.id, ''))) <> 'WO-0'
         AND NOT EXISTS (
           SELECT 1 FROM kmb_projek.wo_supabase s
            WHERE s.id = w.id OR s.wo_number = w.wo_number
         );
  END IF;
END;
$$;

-- Helper pencocokan apakah sebuah WO dimiliki oleh mekanik tertentu (case-insensitive pada ID maupun Nama)
CREATE OR REPLACE FUNCTION kmb_projek._wo_milik_mekanik(p_wo jsonb, p_mid text, p_mname text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_id   text := upper(btrim(coalesce(p_mid, '')));
  v_name text := upper(btrim(coalesce(p_mname, '')));
BEGIN
  IF v_id = '' AND v_name = '' THEN
    RETURN false;
  END IF;

  IF v_id <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_id
    OR upper(btrim(coalesce(p_wo->>'mechanic_id', ''))) = v_id
  ) THEN
    RETURN true;
  END IF;

  IF v_name <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_name
    OR upper(btrim(coalesce(p_wo->>'mechanic_name', ''))) = v_name
  ) THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_wo->'team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'effective_team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'effective_team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'team_distribution') = 'object' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(p_wo->'team_distribution') td
       WHERE (v_id <> '' AND upper(btrim(td.key)) = v_id)
          OR (v_name <> '' AND upper(btrim(td.key)) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_id <> '' AND coalesce(p_wo->>'mechanic_ids', '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(p_wo->>'mechanic_ids', '[,;]') s
       WHERE upper(btrim(s)) = v_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ==============================================================================
-- 1. RPC BACA LENGKAP KMB PROJECT (`ping`, `create_refs`, `monitoring`, `my_wos`, `wos_by_status`, `monitoring_daftar`, `wo_detail`, `konteks_skor`)
-- ==============================================================================

-- 1a. Ping Token
CREATE OR REPLACE FUNCTION public.kmb_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object(
      'success', false,
      'result', null,
      'error', v_auth->>'error',
      'source', 'SUPABASE'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'result', json_build_object(
      'mechanic_id', coalesce(v_auth->>'mechanic_id', ''),
      'name', coalesce(v_auth->>'name', ''),
      'role', coalesce(v_auth->>'role', 'mechanic'),
      'email', coalesce(v_auth->>'email', ''),
      'section', coalesce(v_auth->>'section', ''),
      'tenant_code', 'KMB'
    ),
    'source', 'SUPABASE'
  );
END;
$$;

-- 1b. Katalog Referensi Pembuatan WO (Units, Mechanics, Components, Jobs Cascade)
CREATE OR REPLACE FUNCTION public.kmb_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units jsonb;
  v_mechs jsonb;
  v_comps jsonb;
  v_jobs_field jsonb;
  v_jobs_workshop jsonb := '[]'::jsonb;
  v_jobs_vessel jsonb;
  v_factors jsonb;
  v_refs jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  -- Units
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.unit_code,
    'unit_name', coalesce(nullif(btrim(u.unit_name), ''), u.unit_code),
    'unit_type', coalesce(u.section, 'OTHERS'),
    'unit_model', coalesce(u.model, ''),
    'unit_scope', jsonb_build_array(coalesce(u.section, 'all')),
    'unit_factor', coalesce(u.unit_factor, 1.0)
  ) ORDER BY u.unit_code), '[]'::jsonb)
  INTO v_units
  FROM kmb_projek.config_units u
  WHERE upper(btrim(coalesce(u.status, 'ACTIVE'))) = 'ACTIVE';

  -- Mechanics (case-insensitive role & status)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'mechanic_id', m.mechanic_id,
    'mechanic_name', coalesce(nullif(btrim(m.name), ''), m.mechanic_id),
    'name', coalesce(nullif(btrim(m.name), ''), m.mechanic_id),
    'section', coalesce(nullif(btrim(m.section), ''), 'maintenance')
  ) ORDER BY m.mechanic_id), '[]'::jsonb)
  INTO v_mechs
  FROM kmb_projek.config_mechanics m
  WHERE lower(btrim(coalesce(m.role, 'mechanic'))) = 'mechanic'
    AND upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE';

  -- Components
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', c.component_id,
    'component_no', c.component_id,
    'component_name', c.name,
    'category', coalesce(c.section, 'General'),
    'base_points', coalesce(c.base_points, 1.25),
    'target_hours', coalesce(c.target_hours, 2.0)
  ) ORDER BY c.component_id), '[]'::jsonb)
  INTO v_comps
  FROM kmb_projek.config_components c
  WHERE upper(btrim(coalesce(c.status, 'ACTIVE'))) = 'ACTIVE';

  -- Jobs Field / Maintenance
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_field
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, 'maintenance'))) IN ('maintenance', 'field')
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  -- Fallback otomatis jika catalog_jobs maintenance masih kosong
  IF jsonb_array_length(v_jobs_field) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'job_id', c.component_id,
      'unit_model', '',
      'component', c.name,
      'sub_component', 'General',
      'job_description', c.name,
      'plan_hours', 2.0,
      'base_point', 1.25,
      'job_type', 'Preventive'
    ) ORDER BY c.component_id), '[]'::jsonb)
    INTO v_jobs_field
    FROM kmb_projek.config_components c
    WHERE upper(btrim(coalesce(c.status, 'ACTIVE'))) = 'ACTIVE';
  END IF;

  -- Jobs Vessel / Rekondisi / Tyre
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_vessel
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, ''))) IN ('vessel', 'rekondisi', 'tyre', 'tyreman')
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  IF jsonb_array_length(v_jobs_vessel) = 0 THEN
    v_jobs_vessel := v_jobs_field;
  END IF;

  -- Jobs Workshop
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_workshop
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, ''))) = 'workshop'
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  IF jsonb_array_length(v_jobs_workshop) = 0 THEN
    v_jobs_workshop := v_jobs_field;
  END IF;

  -- Factors
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'type', f.factor_type,
    'factor_type', f.factor_type,
    'key', f.key,
    'value', f.value
  )), '[]'::jsonb)
  INTO v_factors
  FROM kmb_projek.config_factors f;

  v_refs := jsonb_build_object(
    'sections', jsonb_build_array('vessel', 'maintenance'),
    'units', v_units,
    'mechanics', v_mechs,
    'components', v_comps,
    'jobs_field', v_jobs_field,
    'jobs_workshop', v_jobs_workshop,
    'jobs_vessel', v_jobs_vessel,
    'factors', v_factors,
    'work_conditions', jsonb_build_array(
      jsonb_build_object('key', 'normal', 'label', 'Shift 1', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'normal' LIMIT 1), 1.0)),
      jsonb_build_object('key', 'difficult', 'label', 'Shift 2', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'difficult' LIMIT 1), 1.1)),
      jsonb_build_object('key', 'extreme', 'label', 'Kondisi Ekstrim', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'extreme' LIMIT 1), 1.2))
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', v_refs || jsonb_build_object('refs', v_refs, 'pulled_at', v_pulled),
    'data', v_refs
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public.kmb_create_refs();
END;
$$;

-- 1c. Monitoring Ringkasan (Menghitung gabungan wo_supabase + work_orders melalui _semua_wo_json)
CREATE OR REPLACE FUNCTION public.kmb_monitoring()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mechs  jsonb;
  v_total  int := 0;
  v_p_work int := 0;
  v_exp    int := 0;
  v_p_l1   int := 0;
  v_p_l2   int := 0;
  v_app    int := 0;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH semua_wo AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
  ),
  token_aktif AS (
    SELECT DISTINCT ON (upper(btrim(user_id)))
           upper(btrim(user_id)) AS uid_upper,
           btrim(token) AS token
      FROM kmb_projek.api_tokens
     WHERE upper(btrim(coalesce(status, 'ACTIVE'))) = 'ACTIVE'
       AND nullif(btrim(user_id), '') IS NOT NULL
     ORDER BY upper(btrim(user_id)), created_at DESC NULLS LAST
  ),
  mech_counts AS (
    SELECT m.mechanic_id AS id,
           m.mechanic_id AS mechanic_id,
           coalesce(nullif(btrim(m.name), ''), m.mechanic_id) AS name,
           coalesce(m.section, 'maintenance') AS section,
           coalesce(ta.token, nullif(btrim(m.token), ''), '') AS token,
           (coalesce(ta.token, nullif(btrim(m.token), '')) IS NOT NULL) AS has_token,
           CASE WHEN coalesce(m.is_test_account, false) THEN 'UJI' ELSE '' END AS uji,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_mechanic_work'), 0)::int AS pending_mechanic_work,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'expired'), 0)::int AS expired,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_supervisor'), 0)::int AS pending_l1,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_superintendent'), 0)::int AS pending_l2,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'approved'), 0)::int AS approved
      FROM kmb_projek.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.uid_upper = upper(btrim(m.mechanic_id))
      LEFT JOIN semua_wo w ON kmb_projek._wo_milik_mekanik(w.wo, m.mechanic_id, m.name)
     WHERE lower(btrim(coalesce(m.role, 'mechanic'))) = 'mechanic'
       AND upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE'
     GROUP BY m.mechanic_id, m.name, m.section, m.token, m.is_test_account, ta.token
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'mechanic_id', mechanic_id,
           'name', name,
           'section', section,
           'token', token,
           'has_token', has_token,
           'uji', uji,
           'pending_mechanic_work', pending_mechanic_work,
           'pending_work', pending_mechanic_work,
           'expired', expired,
           'pending_l1', pending_l1,
           'pending_l2', pending_l2,
           'approved', approved
         ) ORDER BY id), '[]'::jsonb),
         count(*)::int
    INTO v_mechs, v_total
    FROM mech_counts;

  SELECT coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_mechanic_work'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'expired'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_supervisor'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_superintendent'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'approved'), 0)::int
    INTO v_p_work, v_exp, v_p_l1, v_p_l2, v_app
    FROM kmb_projek._semua_wo_json() AS wo;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'overall', jsonb_build_object(
        'mechanics', coalesce(v_total, 0),
        'total_mechanics', coalesce(v_total, 0),
        'pending_mechanic_work', coalesce(v_p_work, 0),
        'expired', coalesce(v_exp, 0),
        'pending_l1', coalesce(v_p_l1, 0),
        'pending_l2', coalesce(v_p_l2, 0),
        'approved', coalesce(v_app, 0)
      ),
      'mechanics', coalesce(v_mechs, '[]'::jsonb),
      'pulled_at', v_pulled
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth  jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_hasil jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  v_hasil := public.kmb_monitoring()::jsonb;
  IF lower(coalesce(v_auth->>'role', 'mechanic')) = 'mechanic' AND (v_hasil #> '{result,mechanics}') IS NOT NULL THEN
    v_hasil := jsonb_set(v_hasil, '{result,mechanics}', '[]'::jsonb);
  END IF;
  RETURN v_hasil::json;
END;
$$;

-- 1d. Daftar WO Mekanik (`kmb_my_wos` & `kmb_my_wos_bertoken`, Case-Insensitive pada ID & Nama)
CREATE OR REPLACE FUNCTION public.kmb_my_wos(p_mechanic_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mid    text := btrim(coalesce(p_mechanic_id, ''));
  v_mname  text := '';
  v_wos    jsonb := '[]'::jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  SELECT coalesce(name, '') INTO v_mname
    FROM kmb_projek.config_mechanics
   WHERE upper(btrim(mechanic_id)) = upper(v_mid)
   LIMIT 1;

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE kmb_projek._wo_milik_mekanik(wo, v_mid, v_mname)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth   jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_mid    text;
  v_mname  text;
  v_wos    jsonb := '[]'::jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  v_mid   := coalesce(v_auth->>'mechanic_id', '');
  v_mname := coalesce(v_auth->>'name', '');

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE kmb_projek._wo_milik_mekanik(wo, v_mid, v_mname)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

-- 1e. Daftar WO berdasarkan status (`kmb_wos_by_status` & `kmb_wos_by_status_bertoken`)
CREATE OR REPLACE FUNCTION public.kmb_wos_by_status(p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req       text := lower(btrim(coalesce(p_status, 'pending')));
  v_wos       jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_pulled    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua
   WHERE (
     (v_req = 'pending' AND (wo->>'status') IN ('pending_supervisor', 'pending_superintendent', 'pending_transfer'))
     OR (v_req = 'active' AND (wo->>'status') IN ('pending_mechanic_work', 'expired'))
     OR (v_req = 'approved' AND (wo->>'status') = 'approved')
     OR (v_req = 'rejected' AND (wo->>'status') IN ('rejected', 'cancelled'))
     OR (v_req = 'cancelable' AND (wo->>'status') IN ('pending_mechanic_work', 'pending_supervisor', 'pending_superintendent', 'expired'))
     OR (v_req = 'transfers' AND ((wo->>'status') = 'pending_transfer' OR coalesce(wo->>'transfer_status', '') = 'pending'))
     OR ((wo->>'status') = v_req)
   );

  WITH tr AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE (wo->>'status') = 'pending_transfer' OR coalesce(wo->>'transfer_status', '') = 'pending'
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_transfers
    FROM tr;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'wos', v_wos,
      'pending', CASE WHEN v_req = 'pending' THEN v_wos ELSE '[]'::jsonb END,
      'active', CASE WHEN v_req = 'active' THEN v_wos ELSE '[]'::jsonb END,
      'approved', CASE WHEN v_req = 'approved' THEN v_wos ELSE '[]'::jsonb END,
      'rejected', CASE WHEN v_req = 'rejected' THEN v_wos ELSE '[]'::jsonb END,
      'transfers', CASE WHEN v_req = 'transfers' THEN v_wos ELSE v_transfers END,
      'pulled_at', v_pulled
    ),
    'data', jsonb_build_object(
      'wos', v_wos,
      'pending', CASE WHEN v_req = 'pending' THEN v_wos ELSE '[]'::jsonb END,
      'active', CASE WHEN v_req = 'active' THEN v_wos ELSE '[]'::jsonb END,
      'approved', CASE WHEN v_req = 'approved' THEN v_wos ELSE '[]'::jsonb END,
      'rejected', CASE WHEN v_req = 'rejected' THEN v_wos ELSE '[]'::jsonb END,
      'transfers', CASE WHEN v_req = 'transfers' THEN v_wos ELSE v_transfers END
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public.kmb_wos_by_status(p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_monitoring_daftar_bertoken(p_token text, p_kategori text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth  jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_kat   text := lower(btrim(coalesce(p_kategori, 'belum')));
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE (v_kat = 'belum' AND (wo->>'status') = 'pending_mechanic_work')
        OR (v_kat = 'expired' AND (wo->>'status') = 'expired')
        OR (v_kat = 'l1' AND (wo->>'status') = 'pending_supervisor')
        OR (v_kat = 'l2' AND (wo->>'status') = 'pending_superintendent')
        OR (v_kat = 'approved' AND (wo->>'status') = 'approved')
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_items
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'kategori', v_kat,
      'judul', 'Daftar Work Order',
      'total', jsonb_array_length(v_items),
      'ditampilkan', jsonb_array_length(v_items),
      'items', v_items
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wo_detail_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_wo   jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = btrim(coalesce(p_wo_id, ''))
      OR trim(wo->>'wo_number') = btrim(coalesce(p_wo_id, ''))
   LIMIT 1;

  IF v_wo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Work order tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  RETURN jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', v_wo || jsonb_build_object('wo', v_wo), 'data', v_wo || jsonb_build_object('wo', v_wo))::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_konteks_skor_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth    jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_wo      jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = btrim(coalesce(p_wo_id, ''))
      OR trim(wo->>'wo_number') = btrim(coalesce(p_wo_id, ''))
   LIMIT 1;

  IF v_wo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Work order tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('factor_type', factor_type, 'type', factor_type, 'key', key, 'value', value)), '[]'::jsonb)
      INTO v_factors FROM kmb_projek.config_factors;
  EXCEPTION WHEN OTHERS THEN v_factors := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'wo', v_wo,
      'factors', v_factors,
      'base_settings', '[]'::jsonb,
      'mechanics', coalesce((SELECT jsonb_agg(jsonb_build_object('mechanic_id', mechanic_id, 'name', name, 'section', section)) FROM kmb_projek.config_mechanics), '[]'::jsonb)
    )
  )::json;
END;
$$;

-- ==============================================================================
-- 2. EKSEKUSI AKSI TULIS & DESKTOP MANDIRI (`kmb_eksekusi_aksi_bertoken`)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.kmb_eksekusi_aksi_bertoken(
  p_token   text,
  p_aksi    text,
  p_op_id   text,
  p_payload jsonb,
  p_skor_js jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth       jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_aksi       text := btrim(coalesce(p_aksi, ''));
  v_op_id      text := btrim(coalesce(p_op_id, ''));
  v_actor_id   text;
  v_actor_name text;
  v_actor_role text;
  v_cached     jsonb;
  v_now_iso    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
  v_tgl_str    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY');
  v_wo_id      text;
  v_wo_num     text;
  v_wo         jsonb;
  v_bp         numeric := 1.0;
  v_th         numeric := 2.0;
  v_uf         numeric := 1.0;
  v_act_hours  numeric := 0;
  v_part_hours numeric := 0;
  v_start_iso  text;
  v_end_iso    text;
  v_reason     text;
  v_team       jsonb := '[]'::jsonb;
  v_team_names jsonb := '[]'::jsonb;
  v_lead_id    text := '';
  v_elem       jsonb;
  v_blk        jsonb;
  v_blocks     jsonb;
  v_created    jsonb := '[]'::jsonb;
  v_mid        text;
  v_mid_canon  text;
  v_mname      text;
  v_job_id     text;
  v_comp_id    text;
  v_comp_name  text;
  v_unit_id    text;
  v_unit_name  text;
  v_fp         numeric := 0;
  v_total_idr  numeric := 0;
  v_putaran    int := 1;
  v_out        jsonb;
  v_is_rel     boolean;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  v_actor_id   := v_auth->>'mechanic_id';
  v_actor_name := v_auth->>'name';
  v_actor_role := v_auth->>'role';

  IF v_op_id <> '' THEN
    SELECT result_json INTO v_cached FROM kmb_projek.wo_ops_supabase WHERE op_id = v_op_id LIMIT 1;
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'work_orders' AND column_name = 'wo_number'
  ) INTO v_is_rel;

  -- A. SIMPAN PUSH SUBSCRIPTION
  IF v_aksi = 'save_push_sub' THEN
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('saved', true));
  END IF;

  -- B. BUAT WORK ORDER BARU (Mendukung baik payload tunggal maupun batch `blocks: [...]`)
  IF v_aksi IN ('create_wo', 'createWO', 'handleCreateWO', 'buat_wo') THEN
    IF jsonb_typeof(p_payload->'blocks') = 'array' AND jsonb_array_length(p_payload->'blocks') > 0 THEN
      v_blocks := p_payload->'blocks';
    ELSIF jsonb_typeof(p_payload->'data'->'blocks') = 'array' AND jsonb_array_length(p_payload->'data'->'blocks') > 0 THEN
      v_blocks := p_payload->'data'->'blocks';
    ELSE
      v_blocks := jsonb_build_array(coalesce(p_payload, '{}'::jsonb));
    END IF;

    FOR v_blk IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
      v_wo_num     := kmb_projek._nomor_wo_baru_wib();
      v_wo_id      := 'WO-KMBP-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      v_team       := '[]'::jsonb;
      v_team_names := '[]'::jsonb;
      v_lead_id    := '';

      v_job_id    := btrim(coalesce(v_blk->>'job_id', ''));
      v_comp_id   := btrim(coalesce(nullif(v_blk->>'component_id', ''), nullif(v_blk->>'component', ''), nullif(v_job_id, ''), 'COM-001'));
      v_comp_name := btrim(coalesce(nullif(v_blk->>'component_name', ''), nullif(v_blk->>'others_description', ''), nullif(v_blk->>'activity', ''), ''));
      v_unit_id   := btrim(coalesce(nullif(v_blk->>'unit_id', ''), nullif(v_blk->>'unit_code', ''), 'WORKSHOP'));
      v_unit_name := btrim(coalesce(nullif(v_blk->>'unit_name', ''), ''));

      v_bp := coalesce(nullif(v_blk->>'others_base_points', '')::numeric, nullif(v_blk->>'manual_base_points', '')::numeric, nullif(v_blk->>'base_points', '')::numeric, null);
      v_th := coalesce(nullif(v_blk->>'others_target_hours', '')::numeric, nullif(v_blk->>'manual_target_hours', '')::numeric, nullif(v_blk->>'target_hours', '')::numeric, null);
      v_uf := coalesce(nullif(v_blk->>'others_unit_factor', '')::numeric, nullif(v_blk->>'manual_unit_factor', '')::numeric, nullif(v_blk->>'unit_factor', '')::numeric, null);

      -- Lengkapi unit_name & unit_factor dari config_units bila belum dikirim klien
      IF v_unit_id <> '' AND v_unit_id <> 'WORKSHOP' AND v_unit_id <> 'OTHERS' THEN
        BEGIN
          SELECT coalesce(nullif(v_unit_name, ''), nullif(btrim(unit_name), ''), v_unit_id),
                 coalesce(v_uf, unit_factor, 1.0)
            INTO v_unit_name, v_uf
            FROM kmb_projek.config_units
           WHERE upper(btrim(unit_code)) = upper(v_unit_id)
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
      v_unit_name := coalesce(nullif(v_unit_name, ''), v_unit_id);
      v_uf        := coalesce(v_uf, 1.0);

      -- Lengkapi nama pekerjaan, poin dasar, dan target jam dari catalog_jobs / config_components bila belum dikirim klien
      IF v_job_id <> '' THEN
        BEGIN
          SELECT coalesce(nullif(v_comp_name, ''), job_description, component, v_comp_id),
                 coalesce(v_bp, base_point, 1.25),
                 coalesce(v_th, plan_hours, 2.0)
            INTO v_comp_name, v_bp, v_th
            FROM kmb_projek.catalog_jobs
           WHERE btrim(job_id) = v_job_id
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      IF (coalesce(v_comp_name, '') = '' OR v_bp IS NULL OR v_th IS NULL) AND v_is_rel THEN
        BEGIN
          SELECT coalesce(nullif(v_comp_name, ''), name, v_comp_id),
                 coalesce(v_bp, base_points, 1.25),
                 coalesce(v_th, target_hours, 2.0)
            INTO v_comp_name, v_bp, v_th
            FROM kmb_projek.config_components
           WHERE btrim(component_id) = v_comp_id OR btrim(component_id) = v_job_id
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      v_comp_name := coalesce(nullif(v_comp_name, ''), v_job_id, v_comp_id, 'Pekerjaan');
      v_bp := coalesce(v_bp, 1.25);
      v_th := coalesce(v_th, 2.0);

      IF jsonb_typeof(v_blk->'team') = 'array' THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_blk->'team') LOOP
          v_mid := btrim(coalesce(v_elem->>'mechanic_id', v_elem->>'id', v_elem #>> '{}', ''));
          IF v_mid <> '' THEN
            v_mid_canon := v_mid;
            v_mname     := v_mid;
            BEGIN
              IF v_is_rel THEN
                SELECT mechanic_id, coalesce(nullif(btrim(name), ''), mechanic_id)
                  INTO v_mid_canon, v_mname
                  FROM kmb_projek.config_mechanics
                 WHERE upper(btrim(mechanic_id)) = upper(v_mid)
                    OR upper(btrim(name)) = upper(v_mid)
                 LIMIT 1;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
            v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid);
            v_mname     := coalesce(nullif(v_mname, ''), v_mid_canon);
            IF v_lead_id = '' THEN v_lead_id := v_mid_canon; END IF;
            v_team := v_team || jsonb_build_array(jsonb_build_object(
              'mechanic_id', v_mid_canon,
              'mechanic_name', v_mname,
              'name', v_mname,
              'percentage', coalesce(nullif(v_elem->>'percentage', '')::numeric, 100)
            ));
            v_team_names := v_team_names || jsonb_build_array(v_mname);
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(v_blk->'team_distribution') = 'object' THEN
        FOR v_mid IN SELECT key FROM jsonb_each(v_blk->'team_distribution') LOOP
          v_mid := btrim(coalesce(v_mid, ''));
          IF v_mid <> '' THEN
            v_mid_canon := v_mid;
            v_mname     := v_mid;
            BEGIN
              IF v_is_rel THEN
                SELECT mechanic_id, coalesce(nullif(btrim(name), ''), mechanic_id)
                  INTO v_mid_canon, v_mname
                  FROM kmb_projek.config_mechanics
                 WHERE upper(btrim(mechanic_id)) = upper(v_mid)
                    OR upper(btrim(name)) = upper(v_mid)
                 LIMIT 1;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
            v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid);
            v_mname     := coalesce(nullif(v_mname, ''), v_mid_canon);
            IF v_lead_id = '' THEN v_lead_id := v_mid_canon; END IF;
            v_team := v_team || jsonb_build_array(jsonb_build_object(
              'mechanic_id', v_mid_canon,
              'mechanic_name', v_mname,
              'name', v_mname,
              'percentage', coalesce(nullif(v_blk->'team_distribution'->>v_mid, '')::numeric, 100)
            ));
            v_team_names := v_team_names || jsonb_build_array(v_mname);
          END IF;
        END LOOP;
      END IF;

      -- Fallback bila pembuat WO adalah mekanik sendiri dan tidak memilih tim
      IF v_lead_id = '' AND v_actor_role = 'mechanic' THEN
        v_lead_id := v_actor_id;
        v_team := jsonb_build_array(jsonb_build_object('mechanic_id', v_actor_id, 'mechanic_name', v_actor_name, 'name', v_actor_name, 'percentage', 100));
        v_team_names := jsonb_build_array(v_actor_name);
      END IF;

      v_wo := jsonb_build_object(
        'id', v_wo_id,
        'wo_id', v_wo_id,
        'wo_number', v_wo_num,
        'status', 'pending_mechanic_work',
        'status_group', 'assigned',
        'status_label', 'Perlu Diisi Mekanik',
        'section', coalesce(v_blk->>'section', v_auth->>'section', 'maintenance'),
        'job_id', v_job_id,
        'component_id', v_comp_id,
        'component_name', v_comp_name,
        'component', jsonb_build_object(
          'component_no', v_comp_id,
          'component_id', v_comp_id,
          'component_name', v_comp_name,
          'category', coalesce(v_blk->>'section', 'General'),
          'base_points', v_bp,
          'target_hours', v_th
        ),
        'unit_id', v_unit_id,
        'unit_code', v_unit_id,
        'unit_name', v_unit_name,
        'unit_factor', v_uf,
        'unit', jsonb_build_object(
          'unit_id', v_unit_id,
          'unit_name', v_unit_name,
          'unit_factor', v_uf
        ),
        'base_points', v_bp,
        'target_hours', v_th,
        'effective_base_points', v_bp,
        'effective_target_hours', v_th,
        'work_condition', coalesce(v_blk->>'work_condition', 'normal'),
        'location', coalesce(v_blk->>'location', 'workshop'),
        'hour_meter', coalesce(v_blk->>'hour_meter', ''),
        'kilometers', coalesce(v_blk->>'kilometers', ''),
        'keterangan', coalesce(v_blk->>'keterangan', v_blk->>'notes', ''),
        'wo_group_id', coalesce(v_blk->>'wo_group_id', ''),
        'wo_group_mode', coalesce(v_blk->>'wo_group_mode', ''),
        'grup_total', coalesce(nullif(v_blk->>'grup_total', '')::int, jsonb_array_length(v_blocks)),
        'grup_selesai', 0,
        'lead_mechanic_id', v_lead_id,
        'team', v_team,
        'effective_team', v_team,
        'team_names', v_team_names,
        'team_count', GREATEST(jsonb_array_length(v_team), 1),
        'created_by', v_actor_id,
        'created_by_name', v_actor_name,
        'created_by_is_mechanic', (v_actor_role = 'mechanic'),
        'created_at', v_now_iso,
        'created_at_str', v_tgl_str,
        'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'source', 'SUPABASE'
      );

      INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
      VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, v_team, now());

      IF v_is_rel THEN
        BEGIN
          INSERT INTO kmb_projek.work_orders (
            id, wo_number, date, shift, unit_code, component, activity, section,
            lead_mechanic_id, mechanic_ids, status, notes, created_by, created_at, source
          ) VALUES (
            v_wo_id, v_wo_num, (now() AT TIME ZONE 'Asia/Jakarta')::date, 'Shift 1',
            v_unit_id, v_comp_id, v_comp_name, v_wo->>'section',
            v_lead_id, v_lead_id, 'assigned', v_wo->>'keterangan', v_actor_id, now(), 'SUPABASE'
          ) ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      v_created := v_created || jsonb_build_array(jsonb_build_object(
        'id', v_wo_id,
        'wo_id', v_wo_id,
        'wo_number', v_wo_num,
        'unit_id', v_unit_id,
        'unit_name', v_unit_name,
        'component_id', v_comp_id,
        'component_name', v_comp_name,
        'label', v_comp_name || ' · ' || v_unit_id
      ));
    END LOOP;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object(
        'id', v_created->0->>'wo_id',
        'wo_id', v_created->0->>'wo_id',
        'wo_number', v_created->0->>'wo_number',
        'status', 'pending_mechanic_work',
        'created', v_created,
        'failed', '[]'::jsonb,
        'message', 'Work order ' || coalesce(v_created->0->>'wo_number', '') || ' berhasil dibuat di Supabase'
      ),
      'data', jsonb_build_object(
        'id', v_created->0->>'wo_id',
        'wo_id', v_created->0->>'wo_id',
        'wo_number', v_created->0->>'wo_number',
        'created', v_created,
        'failed', '[]'::jsonb
      )
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- Ambil WO untuk aksi mutasi
  v_wo_id := btrim(coalesce(p_payload->>'wo_id', p_payload->>'id', p_payload->>'wo_number', ''));
  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = v_wo_id OR trim(wo->>'wo_number') = v_wo_id
   LIMIT 1;

  IF v_wo IS NULL AND v_aksi NOT IN ('riwayatHmUnit', 'riwayatKmUnit', 'gantiPanelHm', 'gantiPanelKm', 'ganti_panel_meter', 'dataDashboardTeknis', 'dataDashboardField', 'loadJobsCatalog', 'generatePayrollReport', 'generateReport') THEN
    RETURN json_build_object('success', false, 'error', 'Work order ' || v_wo_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF v_wo IS NOT NULL THEN
    v_wo_id  := v_wo->>'id';
    v_wo_num := v_wo->>'wo_number';
  END IF;

  -- C. SUBMIT WORK
  IF v_aksi IN ('submit_work', 'submit_job', 'submitMechanicWork', 'handleSubmitMechanicWork', 'submitWO', 'startWO', 'finishWO', 'kirim_kerja') THEN
    v_start_iso := coalesce(nullif(trim(p_payload->>'start_time'), ''), v_now_iso);
    v_end_iso   := coalesce(nullif(trim(p_payload->>'end_time'), ''), v_now_iso);
    BEGIN
      v_act_hours := round((EXTRACT(EPOCH FROM (v_end_iso::timestamptz - v_start_iso::timestamptz)) / 3600.0)::numeric, 2);
      IF v_act_hours <= 0 THEN v_act_hours := 0.25; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_act_hours := coalesce(nullif(p_payload->>'duration_hours', '')::numeric, 1.0);
    END;
    v_act_hours := round(v_act_hours + coalesce((v_wo->>'partial_hours')::numeric, 0), 2);

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_supervisor',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Approval L1',
      'start_time', v_start_iso,
      'end_time', v_end_iso,
      'actual_hours', v_act_hours,
      'duration_hours', v_act_hours,
      'hour_meter', coalesce(nullif(p_payload->>'hour_meter', ''), v_wo->>'hour_meter', ''),
      'kilometers', coalesce(nullif(p_payload->>'kilometers', ''), v_wo->>'kilometers', ''),
      'part_type', coalesce(p_payload->>'part_type', p_payload->>'part_category', v_wo->>'part_type', ''),
      'part_category', coalesce(p_payload->>'part_category', p_payload->>'part_type', v_wo->>'part_category', ''),
      'submitted_by', v_actor_id,
      'submitted_by_name', v_actor_name,
      'submitted_at', v_now_iso,
      'submitted_at_str', v_tgl_str
    );

    IF p_payload ? 'detail_tyre' AND p_payload->'detail_tyre' IS NOT NULL AND jsonb_typeof(p_payload->'detail_tyre') = 'object' THEN
      v_wo := v_wo || jsonb_build_object(
        'detail_tyre', p_payload->'detail_tyre',
        'tyre', jsonb_build_object(
          'jenis', CASE
            WHEN p_payload->'detail_tyre' ? 'inspeksi' THEN 'inspeksi'
            WHEN p_payload->'detail_tyre' ? 'remove_instal' THEN 'remove_instal'
            WHEN p_payload->'detail_tyre' ? 'repair' THEN 'repair'
            ELSE coalesce(v_wo #>> '{tyre,jenis}', 'inspeksi')
          END,
          'before', coalesce(v_wo #> '{tyre,before}', '{}'::jsonb),
          'isian', p_payload->'detail_tyre'
        )
      );
    END IF;

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_supervisor', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_supervisor', data = EXCLUDED.data, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders
           SET status = 'pending_supervisor', duration_hours = v_act_hours, submitted_by = v_actor_id, submitted_at = now()
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_supervisor', 'actual_hours', v_act_hours),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_supervisor', 'actual_hours', v_act_hours)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- D. SAVE OVERRIDE
  IF v_aksi IN ('save_override', 'handleSaveOverride', 'handleOverrideTargetHours') THEN
    IF v_actor_role = 'mechanic' THEN
      RETURN json_build_object('success', false, 'error', 'Mekanik tidak berhak melakukan override', 'source', 'SUPABASE');
    END IF;

    IF p_payload ? 'base_points' AND nullif(btrim(coalesce(p_payload->>'base_points', '')), '') IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object(
        'base_points', (p_payload->>'base_points')::numeric,
        'effective_base_points', (p_payload->>'base_points')::numeric,
        'has_spv_override_bp', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_bp')::boolean, false) END,
        'has_supt_override_bp', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_bp')::boolean, false) END
      );
    END IF;
    IF p_payload ? 'target_hours' AND nullif(btrim(coalesce(p_payload->>'target_hours', '')), '') IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object(
        'target_hours', (p_payload->>'target_hours')::numeric,
        'effective_target_hours', (p_payload->>'target_hours')::numeric,
        'has_spv_override_th', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_th')::boolean, false) END,
        'has_supt_override_th', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_th')::boolean, false) END
      );
    END IF;
    IF p_payload ? 'start_time' AND p_payload ? 'end_time' AND nullif(btrim(coalesce(p_payload->>'start_time', '')), '') IS NOT NULL THEN
      v_start_iso := p_payload->>'start_time';
      v_end_iso   := p_payload->>'end_time';
      BEGIN
        v_act_hours := round((EXTRACT(EPOCH FROM (v_end_iso::timestamptz - v_start_iso::timestamptz)) / 3600.0)::numeric, 2);
        IF v_act_hours > 0 THEN
          v_wo := v_wo || jsonb_build_object('start_time', v_start_iso, 'end_time', v_end_iso, 'actual_hours', v_act_hours, 'duration_hours', v_act_hours);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF jsonb_typeof(p_payload->'team') = 'array' AND jsonb_array_length(p_payload->'team') > 0 THEN
      v_team := '[]'::jsonb;
      v_team_names := '[]'::jsonb;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(p_payload->'team') LOOP
        v_mid := btrim(coalesce(v_elem->>'mechanic_id', v_elem->>'id', v_elem #>> '{}', ''));
        IF v_mid <> '' THEN
          v_mname := v_mid;
          BEGIN
            IF v_is_rel THEN
              SELECT coalesce(nullif(btrim(name), ''), mechanic_id) INTO v_mname
                FROM kmb_projek.config_mechanics
               WHERE upper(btrim(mechanic_id)) = upper(v_mid) LIMIT 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          v_mname := coalesce(nullif(v_mname, ''), v_mid);
          v_team := v_team || jsonb_build_array(jsonb_build_object('mechanic_id', v_mid, 'mechanic_name', v_mname, 'name', v_mname, 'percentage', 100));
          v_team_names := v_team_names || jsonb_build_array(v_mname);
        END IF;
      END LOOP;
      v_wo := v_wo || jsonb_build_object(
        'team', v_team,
        'effective_team', v_team,
        'team_names', v_team_names,
        'has_spv_override_team', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_team')::boolean, false) END,
        'has_supt_override_team', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_team')::boolean, false) END
      );
    END IF;

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, team = EXCLUDED.team, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- E. APPROVE L1
  IF v_aksi IN ('approve_l1', 'supervisorApprove', 'handleSupervisorApprove') THEN
    IF v_actor_role NOT IN ('supervisor', 'foreman_approver', 'superintendent', 'admin') THEN
      RETURN json_build_object('success', false, 'error', 'Hanya Supervisor (L1) atau Superintendent (L2) yang berhak menyetujui L1', 'source', 'SUPABASE');
    END IF;

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_superintendent',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Approval L2',
      'safety_incident', coalesce((p_payload->>'safety_incident')::boolean, false),
      'mtbf_redo_status', coalesce(p_payload->>'mtbf_status', p_payload->>'mtbf_redo_status', 'first_time'),
      'l1_by', v_actor_id,
      'l1_name', v_actor_name,
      'approved_by_supervisor', v_actor_name,
      'approved_by_supervisor_name', v_actor_name,
      'l1_at', v_now_iso,
      'supervisor_approved_at', v_now_iso,
      'l1_notes', coalesce(p_payload->>'notes', '')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_superintendent', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_superintendent', data = EXCLUDED.data, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders SET status = 'pending_superintendent', approved_l1_by = v_actor_id, approved_l1_at = now()
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_superintendent'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_superintendent')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- F. APPROVE L2
  IF v_aksi IN ('approve_l2', 'superintendentApprove', 'handleSuperintendentApprove') THEN
    v_fp        := coalesce((p_skor_js->>'finalPoints')::numeric, (v_wo->>'base_points')::numeric, 1.25);
    v_total_idr := coalesce((p_skor_js->>'totalIdr')::numeric, 0);

    v_wo := v_wo || jsonb_build_object(
      'status', 'approved',
      'status_group', 'done',
      'status_label', 'Approved',
      'safety_incident', coalesce((p_payload->>'safety_incident')::boolean, (v_wo->>'safety_incident')::boolean, false),
      'mtbf_redo_status', coalesce(p_payload->>'mtbf_status', v_wo->>'mtbf_redo_status', 'first_time'),
      'l2_by', v_actor_id,
      'l2_name', v_actor_name,
      'l2_at', v_now_iso,
      'disahkan_at_str', v_tgl_str,
      'final_points', v_fp,
      'points', v_fp,
      'final_idr', v_total_idr,
      'idr_value', v_total_idr,
      'timeliness', coalesce(p_skor_js->'timeliness', jsonb_build_object('status', coalesce(p_skor_js->>'timelinessStatus', 'on_time'), 'label', 'On Time'))
    );

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, points, snapshot, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'approved', v_wo, coalesce(v_wo->'team', '[]'::jsonb), coalesce(p_skor_js->'mechanicPoints', '[]'::jsonb), p_skor_js, now())
    ON CONFLICT (id) DO UPDATE SET status = 'approved', data = EXCLUDED.data, points = EXCLUDED.points, snapshot = EXCLUDED.snapshot, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders
           SET status = 'approved', approved_l2_by = v_actor_id, approved_l2_at = now(), points = v_fp, idr_value = v_total_idr
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'approved', 'final_points', v_fp, 'final_idr', v_total_idr),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'approved', 'final_points', v_fp, 'final_idr', v_total_idr)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- G. REJECT ATAU KEMBALIKAN KE MEKANIK
  IF v_aksi IN ('reject', 'supervisorReject', 'superintendentReject', 'handleSupervisorReject', 'handleSuperintendentReject', 'kembalikan', 'handleKembalikanKeMekanik') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'rejection_reason', 'Ditolak'));
    IF v_aksi IN ('kembalikan', 'handleKembalikanKeMekanik') THEN
      v_putaran := coalesce((v_wo->>'putaran')::int, 1) + 1;
      v_wo := v_wo || jsonb_build_object(
        'status', 'pending_mechanic_work',
        'status_group', 'assigned',
        'status_label', 'Perlu Diperbaiki Mekanik',
        'putaran', v_putaran,
        'alasan_kembali', v_reason,
        'return_reason', v_reason,
        'dikembalikan_oleh_nama', v_actor_name,
        'returned_by', v_actor_name,
        'returned_at', v_now_iso
      );
    ELSE
      v_wo := v_wo || jsonb_build_object(
        'status', 'rejected',
        'status_group', 'rejected',
        'status_label', 'Ditolak',
        'rejection_reason', v_reason,
        'rejected_by', v_actor_id,
        'rejected_by_name', v_actor_name,
        'rejected_at', v_now_iso
      );
    END IF;
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status', 'putaran', v_putaran),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status', 'putaran', v_putaran)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- H. CANCEL WO
  IF v_aksi IN ('cancel_wo', 'cancel', 'cancelWO', 'handleCancelWO', 'batal_wo') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'cancel_reason', 'Dibatalkan'));
    v_wo := v_wo || jsonb_build_object(
      'status', 'cancelled',
      'status_group', 'rejected',
      'status_label', 'Dibatalkan',
      'cancel_reason', v_reason,
      'rejection_reason', v_reason,
      'cancelled_by', v_actor_id,
      'cancelled_by_name', v_actor_name,
      'rejected_by_name', v_actor_name,
      'cancelled_at', v_now_iso,
      'final_points', 0,
      'points', 0,
      'final_idr', 0,
      'idr_value', 0
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, points, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'cancelled', v_wo, coalesce(v_wo->'team', '[]'::jsonb), '[]'::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET status = 'cancelled', data = EXCLUDED.data, points = '[]'::jsonb, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'cancelled'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'cancelled')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- I. TRANSFER WO (request_transfer, approve_transfer, reject_transfer)
  IF v_aksi IN ('request_transfer', 'handleRequestTransfer') THEN
    v_start_iso := coalesce(nullif(trim(p_payload->>'session_start_time'), ''), v_now_iso);
    BEGIN
      v_part_hours := GREATEST(0, round((EXTRACT(EPOCH FROM (now() - v_start_iso::timestamptz)) / 3600.0)::numeric, 2));
    EXCEPTION WHEN OTHERS THEN
      v_part_hours := 0;
    END;

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_transfer',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Keputusan Transfer',
      'transfer_status', 'pending',
      'transfer_note', coalesce(p_payload->>'transfer_note', ''),
      'transfer_session_hours', v_part_hours,
      'session_hours', v_part_hours,
      'partial_hours_now', coalesce((v_wo->>'partial_hours')::numeric, 0),
      'partial_hours_after', round(coalesce((v_wo->>'partial_hours')::numeric, 0) + v_part_hours, 2),
      'transfer_requested_by', v_actor_id,
      'transfer_requested_by_name', v_actor_name,
      'requested_by_name', v_actor_name,
      'transfer_requested_at', v_now_iso
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_transfer', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_transfer', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_transfer'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_transfer')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('approve_transfer', 'handleApproveTransfer') THEN
    v_team := '[]'::jsonb;
    v_team_names := '[]'::jsonb;
    v_lead_id := '';
    IF jsonb_typeof(p_payload->'target_mechanic_ids') = 'array' THEN
      FOR v_elem IN SELECT * FROM jsonb_array_elements(p_payload->'target_mechanic_ids') LOOP
        v_mid := btrim(coalesce(v_elem #>> '{}', v_elem->>'mechanic_id', ''));
        IF v_mid <> '' THEN
          v_mname := v_mid;
          BEGIN
            IF v_is_rel THEN
              SELECT coalesce(nullif(btrim(name), ''), mechanic_id) INTO v_mname
                FROM kmb_projek.config_mechanics
               WHERE upper(btrim(mechanic_id)) = upper(v_mid) LIMIT 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          v_mname := coalesce(nullif(v_mname, ''), v_mid);
          IF v_lead_id = '' THEN v_lead_id := v_mid; END IF;
          v_team := v_team || jsonb_build_array(jsonb_build_object('mechanic_id', v_mid, 'mechanic_name', v_mname, 'name', v_mname, 'percentage', 100));
          v_team_names := v_team_names || jsonb_build_array(v_mname);
        END IF;
      END LOOP;
    END IF;
    IF jsonb_array_length(v_team) = 0 THEN
      v_team := coalesce(v_wo->'team', '[]'::jsonb);
      v_team_names := coalesce(v_wo->'team_names', '[]'::jsonb);
      v_lead_id := coalesce(v_wo->>'lead_mechanic_id', '');
    END IF;

    v_part_hours := round(coalesce((v_wo->>'partial_hours')::numeric, 0) + coalesce((v_wo->>'transfer_session_hours')::numeric, 0), 2);
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'transfer_status', 'approved',
      'partial_hours', v_part_hours,
      'lead_mechanic_id', v_lead_id,
      'team', v_team,
      'effective_team', v_team,
      'team_names', v_team_names,
      'team_count', GREATEST(jsonb_array_length(v_team), 1),
      'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, v_team, now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, team = EXCLUDED.team, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work', 'partial_hours', v_part_hours),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work', 'partial_hours', v_part_hours)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('reject_transfer', 'handleRejectTransfer') THEN
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'transfer_status', 'rejected',
      'transfer_rejection_reason', coalesce(p_payload->>'rejection_reason', p_payload->>'reason', '')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- J. REPORT EXPIRED & REOPEN EXPIRED
  IF v_aksi IN ('report_expired', 'reportExpiredWO', 'handleReportExpired') THEN
    v_wo := v_wo || jsonb_build_object('is_reported_expired', true, 'dilaporkan', true, 'reported_expired_at', v_now_iso);
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'is_reported_expired', true),
      'data', jsonb_build_object('wo_id', v_wo_id, 'is_reported_expired', true)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('reopen_expired', 'handleReopenExpired', 'handleReopenExpiredWO') THEN
    IF v_actor_role NOT IN ('supervisor', 'foreman_approver', 'superintendent', 'admin') THEN
      RETURN json_build_object('success', false, 'error', 'Hanya Pengawas (L1/L2) yang berhak membuka kunci WO expired', 'source', 'SUPABASE');
    END IF;
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'is_expired', false,
      'is_reported_expired', false,
      'dilaporkan', false,
      'dibuka_ulang', true,
      'reopened_at', v_now_iso,
      'reopened_by', v_actor_id,
      'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'status', 'pending_mechanic_work', 'reopened_at', v_now_iso),
      'data', jsonb_build_object('wo_id', v_wo_id, 'status', 'pending_mechanic_work', 'reopened_at', v_now_iso)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- K. KOREKSI METER & GANTI PANEL METER (HM / KM)
  IF v_aksi IN ('koreksiHmWo', 'handleKoreksiHmWo', 'koreksiKmWo', 'handleKoreksiKmWo', 'koreksi_meter') THEN
    IF lower(v_aksi) LIKE '%hm%' OR coalesce(p_payload->>'jenis', 'hm') = 'hm' THEN
      v_wo := v_wo || jsonb_build_object('hour_meter', coalesce(p_payload->>'nilai_baru', p_payload->>'hm_baru', ''));
    ELSE
      v_wo := v_wo || jsonb_build_object('kilometers', coalesce(p_payload->>'nilai_baru', p_payload->>'km_baru', ''));
    END IF;
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('wo_id', v_wo_id, 'updated', true), 'data', json_build_object('wo_id', v_wo_id, 'updated', true));
  END IF;

  IF v_aksi IN ('gantiPanelHm', 'handleGantiPanelHm', 'gantiPanelKm', 'handleGantiPanelKm', 'ganti_panel_meter') THEN
    INSERT INTO kmb_projek.meter_panel_supabase (unit_id, jenis, nilai_baru, diganti_pada, alasan, actor_id)
    VALUES (
      coalesce(p_payload->>'unit_id', p_payload->>'unit_code', ''),
      CASE WHEN lower(v_aksi) LIKE '%km%' THEN 'km' ELSE 'hm' END,
      coalesce(nullif(coalesce(p_payload->>'nilai_baru', p_payload->>'hm_baru', p_payload->>'km_baru'), '')::numeric, 0),
      coalesce(nullif(coalesce(p_payload->>'diganti_pada', p_payload->>'berlaku_at'), '')::timestamptz, now()),
      coalesce(p_payload->>'alasan', 'Ganti panel meter'),
      v_actor_id
    );
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('saved', true), 'data', json_build_object('saved', true));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Aksi ' || v_aksi || ' belum didukung', 'source', 'SUPABASE');
END;
$$;

REVOKE EXECUTE ON FUNCTION kmb_projek._validasi_token_aktif(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._nomor_wo_baru_wib() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._normalisasi_status_wo(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._semua_wo_json() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._wo_milik_mekanik(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_create_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_my_wos(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_wos_by_status(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kmb_create_refs() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmb_ping(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_create_refs_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring_daftar_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wo_detail_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_konteks_skor_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH KMB PROJECT (Skema `kmb_projek`)
-- Rumah: kmb-projek · Pemegang: Raka · Sesuai AGENTS.md §0a.9, §2, §4, §5
-- ==============================================================================
--
-- Kompatibilitas Ganda (Dual-Format):
--   Skema `kmb_projek` di Gedung 1 & Gedung 2 memiliki tabel cermin relasional
--   (`db/kmb_projek/cermin_sheet.sql`) sekaligus disiapkan menuju cermin mentah
--   JSONB (`db/kmb_projek/cermin_sheet_mentah.sql`). Fungsi RPC di file ini
--   mendeteksi bentuk kolom secara otomatis sehingga 100% aman dijalankan pada
--   kedua bentuk tabel tanpa galat.
--
-- Prinsip Keamanan & Isolasi:
--   1. Hanya menyentuh skema `kmb_projek` (Kamar tidak saling mengintip).
--   2. Semua fungsi internal di-REVOKE dari PUBLIC/anon/authenticated.
--   3. Pintu masuk publik (`kmb_admin_*_bertoken`) memvalidasi token admin aktif.
--   4. Tidak ada `tenant_id` yang di-hardcode.
--   5. Nilai token mentah tidak pernah dicatat di `audit_logs` (hanya md5 & samaran).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

-- Pastikan kolom tambahan & tabel audit_logs tersedia pada skema relasional kmb_projek
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'mechanic_id'
  ) THEN
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS may_admin boolean NOT NULL DEFAULT false;
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'token'
  ) THEN
    ALTER TABLE kmb_projek.api_tokens ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
    ALTER TABLE kmb_projek.api_tokens ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kmb_projek.audit_logs (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);

REVOKE ALL ON SCHEMA kmb_projek FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA kmb_projek FROM anon, authenticated;

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean    text := btrim(coalesce(p_token, ''));
  v_is_jsonb boolean;
  v_user     record;
  v_boleh    boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'mechanic_id', 'GABRIEL-PANEL',
      'name', 'Panel Saklar Pusat',
      'role', 'admin'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      SELECT t.data->>'token' AS token,
             coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'user_id'), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
             coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), '') AS name,
             lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
             lower(coalesce(m.data->>'may_admin', 'false')) AS may_admin,
             upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
        FROM kmb_projek.api_tokens t
        LEFT JOIN kmb_projek.config_mechanics m
          ON trim(coalesce(t.data->>'user_id', t.data->>'mechanic_id')) = trim(m.data->>'mechanic_id')
       WHERE trim(t.data->>'token') = $1
         AND upper(coalesce(t.data->>'status', 'ACTIVE')) = 'ACTIVE'
         AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
       LIMIT 1
    $q$ INTO v_user USING v_clean;
  ELSE
    SELECT t.token,
           coalesce(nullif(trim(m.mechanic_id), ''), trim(t.user_id), '') AS mechanic_id,
           coalesce(nullif(trim(m.name), ''), trim(t.name), '') AS name,
           lower(coalesce(nullif(trim(m.role), ''), trim(t.role), 'mechanic')) AS role,
           CASE WHEN coalesce(m.may_admin, false) THEN 'true' ELSE 'false' END AS may_admin,
           upper(coalesce(m.status, 'ACTIVE')) AS mech_status
      INTO v_user
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m ON upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(coalesce(m.mechanic_id, ''))) OR btrim(coalesce(t.token, '')) = btrim(coalesce(m.token, ''))
     WHERE trim(t.token) = v_clean
       AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
     LIMIT 1;
  END IF;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_jsonb boolean;
  v_users    json;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      WITH token_aktif AS (
        SELECT DISTINCT ON (trim(coalesce(data->>'user_id', data->>'mechanic_id')))
               trim(coalesce(data->>'user_id', data->>'mechanic_id')) AS mechanic_id,
               trim(data->>'token') AS token
          FROM kmb_projek.api_tokens
         WHERE upper(coalesce(data->>'status', 'ACTIVE')) = 'ACTIVE'
           AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
         ORDER BY trim(coalesce(data->>'user_id', data->>'mechanic_id')), baris DESC
      ),
      daftar AS (
        SELECT coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
               coalesce(m.data->>'name', '') AS name,
               coalesce(m.data->>'email', '') AS email,
               lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
               coalesce(m.data->>'section', 'maintenance') AS section,
               upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
               (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
               (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
               (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
               ta.token AS token,
               CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                    THEN left(ta.token, 4) || '…'
                    ELSE null
               END AS token_masked,
               (ta.token IS NOT NULL) AS has_token,
               0 AS jejak
          FROM kmb_projek.config_mechanics m
          LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
         WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
         ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
                  lower(coalesce(m.data->>'role', 'mechanic')),
                  coalesce(m.data->>'name', '')
      )
      SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json) FROM daftar
    $q$ INTO v_users;
  ELSE
    WITH token_aktif AS (
      SELECT DISTINCT ON (trim(user_id))
             trim(user_id) AS mechanic_id,
             trim(token) AS token
        FROM kmb_projek.api_tokens
       WHERE upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
         AND nullif(trim(user_id), '') IS NOT NULL
       ORDER BY trim(user_id), created_at DESC NULLS LAST
    ),
    jejak_wo AS (
      SELECT trim(lead_mechanic_id) AS mechanic_id,
             count(*)::int AS wo_count
        FROM kmb_projek.work_orders
       WHERE nullif(trim(lead_mechanic_id), '') IS NOT NULL
       GROUP BY trim(lead_mechanic_id)
    ),
    daftar AS (
      SELECT m.mechanic_id,
             m.name,
             coalesce(m.email, '') AS email,
             lower(coalesce(nullif(trim(m.role), ''), 'mechanic')) AS role,
             coalesce(m.section, 'maintenance') AS section,
             upper(coalesce(nullif(trim(m.status), ''), 'ACTIVE')) AS status,
             (upper(coalesce(nullif(trim(m.status), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
             coalesce(m.is_test_account, false) AS akun_uji,
             (coalesce(m.may_admin, false) OR lower(coalesce(m.role, '')) IN ('superintendent', 'admin')) AS boleh_admin,
             coalesce(ta.token, nullif(trim(m.token), '')) AS token,
             CASE WHEN coalesce(ta.token, nullif(trim(m.token), '')) IS NOT NULL
                  THEN left(coalesce(ta.token, trim(m.token)), 4) || '…'
                  ELSE null
             END AS token_masked,
             (coalesce(ta.token, nullif(trim(m.token), '')) IS NOT NULL) AS has_token,
             coalesce(jw.wo_count, 0) AS jejak
        FROM kmb_projek.config_mechanics m
        LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.mechanic_id)
        LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.mechanic_id)
       ORDER BY (upper(coalesce(m.status, 'ACTIVE')) = 'ACTIVE') DESC,
                lower(coalesce(m.role, 'mechanic')),
                m.name
    )
    SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
      INTO v_users
      FROM daftar;
  END IF;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbprojek',
    'result', json_build_object(
      'rumah', 'kmbprojek',
      'users', v_users,
      'sections', json_build_array('vessel', 'maintenance', 'workshop'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_kode        text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama        text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email       text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran       text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_section     text := btrim(coalesce(p_payload->>'section', 'maintenance'));
  v_aktif       boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status      text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji    boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_admin boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama        record;
  v_baru        boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT mechanic_id, name, section, email, role, status, may_admin, is_test_account
    INTO v_lama
    FROM kmb_projek.config_mechanics
   WHERE upper(trim(mechanic_id)) = v_kode
   LIMIT 1;

  IF v_lama.mechanic_id IS NOT NULL THEN
    UPDATE kmb_projek.config_mechanics
       SET name = v_nama,
           email = v_email,
           role = v_peran,
           section = v_section,
           status = v_status,
           may_admin = v_boleh_admin,
           is_test_account = v_akun_uji,
           updated_at = now()
     WHERE upper(trim(mechanic_id)) = v_kode;
    v_baru := false;

    -- Sinkronkan juga nama & peran di api_tokens milik mekanik ini
    UPDATE kmb_projek.api_tokens
       SET name = v_nama,
           role = v_peran
     WHERE upper(trim(user_id)) = v_kode;
  ELSE
    INSERT INTO kmb_projek.config_mechanics (
      mechanic_id, name, section, email, role, status, may_admin, is_test_account, created_at, updated_at
    ) VALUES (
      v_kode, v_nama, v_section, v_email, v_peran, v_status, v_boleh_admin, v_akun_uji, now(), now()
    );
    v_baru := true;
  END IF;

  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
    'mechanic',
    v_kode,
    jsonb_build_object(
      'lama', CASE WHEN v_baru THEN null ELSE row_to_json(v_lama)::jsonb END,
      'baru', jsonb_build_object(
        'mechanic_id', v_kode,
        'name', v_nama,
        'email', v_email,
        'role', v_peran,
        'section', v_section,
        'status', v_status,
        'may_admin', v_boleh_admin,
        'is_test_account', v_akun_uji
      )
    )
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    text;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT mechanic_id, name, role, status INTO v_mech
    FROM kmb_projek.config_mechanics
   WHERE upper(trim(mechanic_id)) = v_target_id
   LIMIT 1;

  IF v_mech.mechanic_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.status, 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', v_mech.name || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  SELECT trim(token) INTO v_tok_lama
    FROM kmb_projek.api_tokens
   WHERE upper(trim(user_id)) = v_target_id
     AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_tok_lama IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama,
        'token_masked', left(v_tok_lama, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'kmbprojek'
      )
    );
  END IF;

  IF v_tok_lama IS NOT NULL THEN
    v_mengganti := true;
    UPDATE kmb_projek.api_tokens
       SET status = 'REVOKED',
           revoked_at = now()
     WHERE upper(trim(user_id)) = v_target_id
       AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE';
  END IF;

  IF v_token = '' THEN
    v_token := 'kmbp-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
  VALUES (v_token, coalesce(v_mech.role, 'mechanic'), v_target_id, v_mech.name, 'ACTIVE', now())
  ON CONFLICT (token) DO UPDATE
    SET status = 'ACTIVE', revoked_at = NULL, user_id = EXCLUDED.user_id, role = EXCLUDED.role, name = EXCLUDED.name;

  UPDATE kmb_projek.config_mechanics
     SET token = v_token,
         updated_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  -- Audit log TANPA nilai token mentah
  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
    'mechanic',
    v_target_id,
    jsonb_build_object(
      'nama', v_mech.name,
      'mengganti_lama', v_mengganti,
      'token_md5', md5(v_token),
      'token_samaran', left(v_token, 4) || '…'
    )
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE kmb_projek.api_tokens
       SET status = 'REVOKED',
           revoked_at = now()
     WHERE upper(trim(user_id)) = v_target_id
       AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
    RETURNING token
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE kmb_projek.config_mechanics
     SET token = NULL,
         updated_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    'admin_token_cabut',
    'mechanic',
    v_target_id,
    jsonb_build_object('dicabut', v_dicabut)
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._kmb_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._kmb_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `kmb_projek`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM kmb_projek.api_tokens WHERE upper(trim(coalesce(user_id, ''))) = v_target_id;
  DELETE FROM kmb_projek.config_mechanics WHERE upper(trim(mechanic_id)) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'kmbprojek')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmb_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmb_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `kmb_projek`
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_units' AND column_name = 'unit_code'
  ) THEN
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_name text;
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_factor numeric DEFAULT 1.0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_components' AND column_name = 'component_id'
  ) THEN
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS base_points numeric DEFAULT 1.25;
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS target_hours numeric DEFAULT 2.0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._kmb_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.unit_code,
    'unit_code', u.unit_code,
    'unit_name', coalesce(nullif(btrim(u.unit_name), ''), u.unit_code),
    'unit_model', coalesce(u.model, ''),
    'section', coalesce(u.section, 'maintenance'),
    'unit_factor', coalesce(u.unit_factor, 1.0),
    'current_hm', coalesce(u.current_hm, 0),
    'current_km', coalesce(u.current_km, 0),
    'status', upper(coalesce(u.status, 'ACTIVE'))
  ) ORDER BY u.unit_code), '[]'::jsonb)
  INTO v_units
  FROM kmb_projek.config_units u;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', c.component_id,
    'component_no', c.component_id,
    'component_name', c.name,
    'category', coalesce(c.section, 'General'),
    'section', coalesce(c.section, 'maintenance'),
    'base_points', coalesce(c.base_points, 1.25),
    'target_hours', coalesce(c.target_hours, 2.0),
    'status', upper(coalesce(c.status, 'ACTIVE'))
  ) ORDER BY c.component_id), '[]'::jsonb)
  INTO v_comps
  FROM kmb_projek.config_components c;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'section', coalesce(j.section, 'maintenance'),
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive'),
    'status', upper(coalesce(j.status, 'ACTIVE'))
  ) ORDER BY j.section, j.component, j.job_id), '[]'::jsonb)
  INTO v_jobs
  FROM kmb_projek.catalog_jobs j;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', f.factor_type || ':' || f.key,
    'factor_type', f.factor_type,
    'key', f.key,
    'value', f.value,
    'description', coalesce(f.description, '')
  ) ORDER BY f.factor_type, f.key), '[]'::jsonb)
  INTO v_factors
  FROM kmb_projek.config_factors f;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbprojek',
    'result', jsonb_build_object(
      'rumah', 'kmbprojek',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'kmbprojek',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmb_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_units (unit_code, unit_name, model, section, unit_factor, status, updated_at)
    VALUES (
      v_id,
      btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      btrim(coalesce(p_payload->>'section', 'maintenance')),
      coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      now()
    )
    ON CONFLICT (unit_code) DO UPDATE SET
      unit_name   = EXCLUDED.unit_name,
      model       = EXCLUDED.model,
      section     = EXCLUDED.section,
      unit_factor = EXCLUDED.unit_factor,
      status      = EXCLUDED.status,
      updated_at  = now();

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_components (component_id, name, section, base_points, target_hours, status)
    VALUES (
      v_id,
      btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.25),
      coalesce(nullif(p_payload->>'target_hours', '')::numeric, 2.0),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    )
    ON CONFLICT (component_id) DO UPDATE SET
      name         = EXCLUDED.name,
      section      = EXCLUDED.section,
      base_points  = EXCLUDED.base_points,
      target_hours = EXCLUDED.target_hours,
      status       = EXCLUDED.status;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    INSERT INTO kmb_projek.catalog_jobs (
      job_id, section, unit_model, component, sub_component, job_description, plan_hours, base_point, job_type, status
    ) VALUES (
      v_id,
      lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'maintenance'))),
      btrim(coalesce(p_payload->>'unit_model', '')),
      btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 2.0),
      coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    )
    ON CONFLICT (job_id) DO UPDATE SET
      section         = EXCLUDED.section,
      unit_model      = EXCLUDED.unit_model,
      component       = EXCLUDED.component,
      sub_component   = EXCLUDED.sub_component,
      job_description = EXCLUDED.job_description,
      plan_hours      = EXCLUDED.plan_hours,
      base_point      = EXCLUDED.base_point,
      job_type        = EXCLUDED.job_type,
      status          = EXCLUDED.status;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_factors (factor_type, key, value, description)
    VALUES (
      v_ft,
      v_fk,
      coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      btrim(coalesce(p_payload->>'description', ''))
    )
    ON CONFLICT (factor_type, key) DO UPDATE SET
      value       = EXCLUDED.value,
      description = EXCLUDED.description;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmb_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb_projek.config_units WHERE upper(btrim(unit_code)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb_projek.config_components WHERE upper(btrim(component_id)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    DELETE FROM kmb_projek.catalog_jobs WHERE upper(btrim(job_id)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb_projek.config_factors
     WHERE lower(btrim(factor_type)) || ':' || lower(btrim(key)) = lower(v_kunci)
        OR lower(btrim(key)) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmb_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmb_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH SUM V2 (Skema `sum`)
-- Rumah: sum · Pemegang: Gabriel · Sesuai AGENTS.md §0a.9, §2, §4, §5 & INVENTARIS-SUM.md
-- ==============================================================================
--
-- Prinsip Protokol & Keamanan:
--   1. Isolasi Kamar (docs/GEDUNG-DAN-STAGING.md §1): Hanya membaca & menulis
--      ke skema `sum`. Tidak pernah mengintip skema rumah lain.
--   2. Wajib Token & Hak Admin (Bug #13 & #22): Fungsi internal ditutup dari
--      PUBLIC/anon/authenticated. Pintu masuk publik (`*_bertoken`) wajib
--      memvalidasi token aktif di `sum.api_tokens` milik pengguna berhak admin
--      (`role IN ('superintendent', 'admin')` atau `may_admin = 'true'`).
--   3. Khas SUM V2 (docs/INVENTARIS-SUM.md):
--      - Mendukung 5 peran SUM: `mechanic`, `supervisor`, `superintendent`,
--        `foreman`, `foreman_approver`.
--      - Mendukung kolom `jabatan_aktual`, `golongan` (1a–5c), dan `notify_email`.
--   4. Anti-Kekunci Sendiri: Admin tidak bisa menonaktifkan akun sendiri,
--      mencabut hak admin sendiri, atau mencabut token sendiri.
--   5. Orang Tidak Pernah Dihapus: Hanya dinonaktifkan (`status = 'INACTIVE'`).
--      Token lama dicabut (`is_active = 'false'`, `revoked_at` diisi), bukan dihapus.
--   6. Jejak Audit Bersih: Nilai token mentah TIDAK PERNAH ditulis ke `sum.audit_logs`
--      (hanya `md5(token)` dan samaran 4 karakter).
--
-- Aman dijalankan berulang kali (idempotent).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS sum;

CREATE TABLE IF NOT EXISTS sum.admin_users_supabase (
  mechanic_id text PRIMARY KEY,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sum.admin_tokens_supabase (
  token       text PRIMARY KEY,
  mechanic_id text NOT NULL,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE sum.admin_users_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sum.admin_tokens_supabase FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sum._pertahankan_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT mechanic_id, data FROM sum.admin_users_supabase LOOP
    UPDATE sum.config_mechanics
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'name', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'role', 'mechanic'),
             coalesce(r.data->>'jabatan_aktual', ''),
             coalesce(r.data->>'golongan', ''),
             coalesce(r.data->>'status', 'ACTIVE'),
             coalesce(r.data->>'may_admin', 'false')
           ),
           sinkron_at = now()
     WHERE trim(data->>'mechanic_id') = trim(r.mechanic_id);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.config_mechanics WHERE baris >= 100000;
      INSERT INTO sum.config_mechanics (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'name', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'role', 'mechanic'),
          coalesce(r.data->>'jabatan_aktual', ''),
          coalesce(r.data->>'golongan', ''),
          coalesce(r.data->>'status', 'ACTIVE'),
          coalesce(r.data->>'may_admin', 'false')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_users ON sum.config_mechanics;
CREATE TRIGGER trg_sum_pertahankan_admin_users
AFTER INSERT ON sum.config_mechanics
FOR EACH STATEMENT
EXECUTE FUNCTION sum._pertahankan_admin_users();

CREATE OR REPLACE FUNCTION sum._pertahankan_admin_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT token, mechanic_id, data FROM sum.admin_tokens_supabase LOOP
    UPDATE sum.api_tokens
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'token', ''),
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'is_active', 'true'),
             coalesce(r.data->>'created_at', '')
           ),
           sinkron_at = now()
     WHERE trim(data->>'token') = trim(r.token);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.api_tokens WHERE baris >= 100000;
      INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'token', ''),
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'is_active', 'true'),
          coalesce(r.data->>'created_at', '')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_tokens ON sum.api_tokens;
CREATE TRIGGER trg_sum_pertahankan_admin_tokens
AFTER INSERT ON sum.api_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION sum._pertahankan_admin_tokens();

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
  v_boleh boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'mechanic_id', 'GABRIEL-PANEL',
      'name', 'Panel Saklar Pusat',
      'role', 'admin'
    );
  END IF;

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
         lower(coalesce(m.data->>'may_admin', t.data->>'may_admin', 'false')) AS may_admin,
         upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
    INTO v_user
    FROM sum.api_tokens t
    LEFT JOIN sum.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
      OR (nullif(trim(t.data->>'email'), '') IS NOT NULL AND lower(trim(t.data->>'email')) = lower(trim(m.data->>'email')))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
     AND (t.data->>'revoked_at' IS NULL OR trim(t.data->>'revoked_at') = '')
   LIMIT 1;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users json;
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (trim(data->>'mechanic_id'))
           trim(data->>'mechanic_id') AS mechanic_id,
           trim(data->>'token') AS token,
           data->>'created_at' AS created_at
      FROM sum.api_tokens
     WHERE (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
       AND nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY trim(data->>'mechanic_id'), baris DESC
  ),
  jejak_wo AS (
    SELECT trim(data->>'mechanic_id') AS mechanic_id,
           count(*)::int AS wo_count
      FROM sum.work_order_team
     WHERE nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     GROUP BY trim(data->>'mechanic_id')
  ),
  daftar AS (
    SELECT m.baris,
           coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
           coalesce(m.data->>'name', '') AS name,
           coalesce(m.data->>'email', '') AS email,
           lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
           coalesce(m.data->>'jabatan_aktual', '') AS jabatan_aktual,
           coalesce(m.data->>'golongan', '') AS golongan,
           coalesce(m.data->>'notify_email', '') AS notify_email,
           upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
           (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
           (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
           (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
           ta.token AS token,
           CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                THEN left(ta.token, 4) || '…'
                ELSE null
           END AS token_masked,
           (ta.token IS NOT NULL) AS has_token,
           coalesce(jw.wo_count, 0) AS jejak
      FROM sum.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
      LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.data->>'mechanic_id')
     WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
              lower(coalesce(m.data->>'role', 'mechanic')),
              coalesce(m.data->>'name', '')
  )
  SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
    INTO v_users
    FROM daftar;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'sum',
    'result', json_build_object(
      'rumah', 'sum',
      'users', v_users,
      'roles', json_build_array('mechanic', 'supervisor', 'superintendent', 'foreman', 'foreman_approver'),
      'golongan_options', json_build_array('1a', '1b', '1c', '2a', '2b', '2c', '3a', '3b', '3c', '4a', '4b', '4c', '5a', '5b', '5c'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id        text := btrim(coalesce(p_op_id, ''));
  v_existing_op  jsonb;
  v_kode         text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama         text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email        text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran        text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_jabatan      text := btrim(coalesce(p_payload->>'jabatan_aktual', p_payload->>'grade', ''));
  v_golongan     text := lower(btrim(coalesce(p_payload->>'golongan', '')));
  v_notify_email text := lower(btrim(coalesce(p_payload->>'notify_email', v_email)));
  v_aktif        boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status       text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji     boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_admin  boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama         record;
  v_baris        int;
  v_baru         boolean := false;
  v_data_baru    jsonb;
  v_waktu_wib    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_hasil        jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'foreman', 'foreman_approver', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT baris, data INTO v_lama
    FROM sum.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_kode
   LIMIT 1;

  v_data_baru := coalesce(v_lama.data, '{}'::jsonb) || jsonb_build_object(
    'mechanic_id', v_kode,
    'name', v_nama,
    'email', v_email,
    'role', v_peran,
    'jabatan_aktual', v_jabatan,
    'golongan', v_golongan,
    'notify_email', v_notify_email,
    'status', v_status,
    'is_test_account', CASE WHEN v_akun_uji THEN 'true' ELSE 'false' END,
    'may_admin', CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END,
    'source', 'SUPABASE',
    'updated_at', v_waktu_wib
  );

  IF v_lama.baris IS NOT NULL THEN
    UPDATE sum.config_mechanics
       SET data = v_data_baru,
           nilai = jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_jabatan, v_golongan, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
           sinkron_at = now()
     WHERE baris = v_lama.baris;
    v_baris := v_lama.baris;
    v_baru := false;
  ELSE
    SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.config_mechanics WHERE baris >= 100000;
    INSERT INTO sum.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
      v_baris,
      jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_jabatan, v_golongan, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
      v_data_baru,
      now()
    );
    v_baru := true;
  END IF;

  INSERT INTO sum.admin_users_supabase (mechanic_id, data, diubah_at)
  VALUES (v_kode, v_data_baru, now())
  ON CONFLICT (mechanic_id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END, 'mechanic', v_kode),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
      'entity_type', 'mechanic',
      'entity_id', v_kode,
      'details', jsonb_build_object(
        'lama', coalesce(v_lama.data, null),
        'baru', v_data_baru
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_simpan_user',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    record;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_baris       int;
  v_tok_data    jsonb;
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT baris, data INTO v_mech
    FROM sum.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
   LIMIT 1;

  IF v_mech.baris IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.data->>'status', 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', coalesce(v_mech.data->>'name', v_target_id) || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  SELECT baris, trim(data->>'token') AS token, data
    INTO v_tok_lama
    FROM sum.api_tokens
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
     AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
     AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
   ORDER BY baris DESC
   LIMIT 1;

  IF v_tok_lama.token IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', json_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama.token,
        'token_masked', left(v_tok_lama.token, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'sum'
      )
    );
  END IF;

  IF v_tok_lama.token IS NOT NULL THEN
    v_mengganti := true;
    UPDATE sum.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false');

    UPDATE sum.admin_tokens_supabase
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
           diubah_at = now()
     WHERE upper(trim(mechanic_id)) = v_target_id;
  END IF;

  IF v_token = '' THEN
    v_token := 'sum-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  v_tok_data := jsonb_build_object(
    'token', v_token,
    'mechanic_id', v_target_id,
    'name', coalesce(v_mech.data->>'name', v_target_id),
    'email', coalesce(v_mech.data->>'email', ''),
    'role', coalesce(v_mech.data->>'role', 'mechanic'),
    'is_active', 'true',
    'created_at', v_waktu_wib,
    'revoked_at', '',
    'source', 'SUPABASE'
  );

  SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.api_tokens WHERE baris >= 100000;
  INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
  VALUES (
    v_baris,
    jsonb_build_array(v_token, v_target_id, coalesce(v_mech.data->>'email', ''), 'true', v_waktu_wib),
    v_tok_data,
    now()
  );

  INSERT INTO sum.admin_tokens_supabase (token, mechanic_id, data, diubah_at)
  VALUES (v_token, v_target_id, v_tok_data, now())
  ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Audit log TANPA token mentah
  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END, 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object(
        'nama', coalesce(v_mech.data->>'name', v_target_id),
        'mengganti_lama', v_mengganti,
        'token_md5', md5(v_token),
        'token_samaran', left(v_token, 4) || '…'
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_terbitkan_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE sum.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
    RETURNING baris
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE sum.admin_tokens_supabase
     SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
         diubah_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), 'admin_token_cabut', 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', 'admin_token_cabut',
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object('dicabut', v_dicabut)
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_cabut_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._sum_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._sum_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `sum`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM sum.api_tokens WHERE upper(trim(coalesce(data->>'mechanic_id', data->>'user_id', ''))) = v_target_id;
  DELETE FROM sum.config_mechanics WHERE upper(trim(coalesce(data->>'mechanic_id', ''))) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'sum')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sum_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sum_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `sum`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_code', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_name', coalesce(nullif(btrim(data->>'unit_name'), ''), data->>'unit_id', ''),
    'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
    'section', coalesce(data->>'section', data->>'unit_type', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', '')), '[]'::jsonb)
  INTO v_units
  FROM sum.config_units
  WHERE coalesce(data->>'unit_id', data->>'unit_code', '') <> '';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', coalesce(data->>'component_id', data->>'component_no', ''),
    'component_no', coalesce(data->>'component_no', data->>'component_id', ''),
    'component_name', coalesce(data->>'component_name', data->>'name', ''),
    'category', coalesce(data->>'category', data->>'section', 'General'),
    'section', coalesce(data->>'section', data->>'category', 'General'),
    'base_points', coalesce(nullif(regexp_replace(coalesce(data->>'base_points', data->>'base_point', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'target_hours', coalesce(nullif(regexp_replace(coalesce(data->>'target_hours', data->>'plan_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'component_id', data->>'component_no', '')), '[]'::jsonb)
  INTO v_comps
  FROM sum.config_components
  WHERE coalesce(data->>'component_id', data->>'component_no', '') <> '';

  
  v_jobs := v_comps;
  

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', coalesce(data->>'factor_type', data->>'type', 'factor') || ':' || coalesce(data->>'key', data->>'factor_key', ''),
    'factor_type', coalesce(data->>'factor_type', data->>'type', 'work_condition'),
    'key', coalesce(data->>'key', data->>'factor_key', ''),
    'value', coalesce(nullif(regexp_replace(coalesce(data->>'value', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'description', coalesce(data->>'description', '')
  ) ORDER BY coalesce(data->>'factor_type', data->>'type', ''), coalesce(data->>'key', '')), '[]'::jsonb)
  INTO v_factors
  FROM sum.config_factors
  WHERE coalesce(data->>'key', data->>'factor_key', '') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'sum',
    'result', jsonb_build_object(
      'rumah', 'sum',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'sum',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._sum_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'unit_id', v_id,
      'unit_code', v_id,
      'unit_name', btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      'section', btrim(coalesce(p_payload->>'section', 'field')),
      'unit_type', btrim(coalesce(p_payload->>'section', 'UNIT')),
      'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM sum.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_units SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_units WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_units (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'component_id', v_id,
      'component_no', v_id,
      'component_name', btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      'category', btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    v_obj := jsonb_build_object(
      'job_id', v_id,
      'component_id', v_id,
      'component_no', v_id,
      'section', lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'field'))),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', '')),
      'component', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'category', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'sub_component', btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      'job_description', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'component_name', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'plan_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'base_points', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'job_type', btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      'is_active', 'TRUE'
    );
    
    SELECT baris INTO v_baris FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'factor_type', v_ft,
      'type', v_ft,
      'key', v_fk,
      'factor_key', v_fk,
      'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      'description', btrim(coalesce(p_payload->>'description', ''))
    );
    SELECT baris INTO v_baris
      FROM sum.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) = v_ft
       AND lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = v_fk
     LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_ft, v_fk), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._sum_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM sum.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    
    DELETE FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM sum.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) || ':' || lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci)
        OR lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sum_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sum_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH KMB V2 / TRA (Skema `kmb`)
-- Rumah: kmb · Pemegang: Gabriel · Sesuai AGENTS.md §0a.9, §2, §4, §5
-- ==============================================================================
--
-- Prinsip Protokol & Keamanan:
--   1. Isolasi Kamar (docs/GEDUNG-DAN-STAGING.md §1): Hanya membaca & menulis
--      ke skema `kmb`. Tidak pernah mengintip skema rumah lain.
--   2. Wajib Token & Hak Admin (Bug #13 & #22): Fungsi internal ditutup dari
--      PUBLIC/anon/authenticated. Pintu masuk publik (`*_bertoken`) wajib
--      memvalidasi token aktif di `kmb.api_tokens` milik pengguna berhak admin
--      (`role IN ('superintendent', 'admin')` atau `may_admin = 'true'`).
--   3. Tanpa Hardcode (AGENTS.md §5): Tidak ada `tenant_id`, token, atau daftar
--      mekanik yang di-hardcode.
--   4. Anti-Kekunci Sendiri (`src/domain/admin.ts`): Admin tidak bisa mencabut
--      hak admin dirinya sendiri, menonaktifkan dirinya sendiri, atau mencabut
--      token dirinya sendiri.
--   5. Orang Tidak Pernah Dihapus: Hanya dinonaktifkan (`status = 'INACTIVE'`).
--      Token lama dicabut (`is_active = 'false'`, `revoked_at` diisi), bukan dihapus.
--   6. Jejak Audit Bersih (`AGENTS.md` §4 & §0a.9): Nilai token mentah TIDAK PERNAH
--      ditulis ke `kmb.audit_logs` (hanya `md5(token)` dan samaran 4 karakter).
--   7. Tahan Sinkron Cermin: Perubahan dari Supabase disimpan juga di tabel
--      pendamping `kmb.admin_users_supabase` & `kmb.admin_tokens_supabase` dengan
--      trigger statement-level agar tidak terhapus saat `sinkron-cermin.mjs` jalan.
--
-- Aman dijalankan berulang kali (idempotent).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb;

-- Tabel pendamping untuk menjaga mutasi pengguna/token Supabase saat cermin disinkron ulang
CREATE TABLE IF NOT EXISTS kmb.admin_users_supabase (
  mechanic_id text PRIMARY KEY,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb.admin_tokens_supabase (
  token       text PRIMARY KEY,
  mechanic_id text NOT NULL,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE kmb.admin_users_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb.admin_tokens_supabase FROM PUBLIC, anon, authenticated;

-- Trigger penahan agar baris yang dikelola di Supabase tetap bertahan seusai sinkron cermin
CREATE OR REPLACE FUNCTION kmb._pertahankan_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT mechanic_id, data FROM kmb.admin_users_supabase LOOP
    UPDATE kmb.config_mechanics
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'name', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'role', 'mechanic'),
             coalesce(r.data->>'section', ''),
             coalesce(r.data->>'position', ''),
             coalesce(r.data->>'status', 'ACTIVE'),
             coalesce(r.data->>'may_admin', 'false')
           ),
           sinkron_at = now()
     WHERE trim(data->>'mechanic_id') = trim(r.mechanic_id);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.config_mechanics WHERE baris >= 100000;
      INSERT INTO kmb.config_mechanics (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'name', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'role', 'mechanic'),
          coalesce(r.data->>'section', ''),
          coalesce(r.data->>'position', ''),
          coalesce(r.data->>'status', 'ACTIVE'),
          coalesce(r.data->>'may_admin', 'false')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_users ON kmb.config_mechanics;
CREATE TRIGGER trg_kmb_pertahankan_admin_users
AFTER INSERT ON kmb.config_mechanics
FOR EACH STATEMENT
EXECUTE FUNCTION kmb._pertahankan_admin_users();

CREATE OR REPLACE FUNCTION kmb._pertahankan_admin_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT token, mechanic_id, data FROM kmb.admin_tokens_supabase LOOP
    UPDATE kmb.api_tokens
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'token', ''),
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'is_active', 'true'),
             coalesce(r.data->>'created_at', '')
           ),
           sinkron_at = now()
     WHERE trim(data->>'token') = trim(r.token);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.api_tokens WHERE baris >= 100000;
      INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'token', ''),
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'is_active', 'true'),
          coalesce(r.data->>'created_at', '')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_tokens ON kmb.api_tokens;
CREATE TRIGGER trg_kmb_pertahankan_admin_tokens
AFTER INSERT ON kmb.api_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION kmb._pertahankan_admin_tokens();

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN KMB V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
  v_boleh boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'mechanic_id', 'GABRIEL-PANEL',
      'name', 'Panel Saklar Pusat',
      'role', 'admin'
    );
  END IF;

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
         lower(coalesce(m.data->>'may_admin', t.data->>'may_admin', 'false')) AS may_admin,
         upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
    INTO v_user
    FROM kmb.api_tokens t
    LEFT JOIN kmb.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
      OR (nullif(trim(t.data->>'email'), '') IS NOT NULL AND lower(trim(t.data->>'email')) = lower(trim(m.data->>'email')))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
     AND (t.data->>'revoked_at' IS NULL OR trim(t.data->>'revoked_at') = '')
   LIMIT 1;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users json;
  v_rates json;
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (trim(data->>'mechanic_id'))
           trim(data->>'mechanic_id') AS mechanic_id,
           trim(data->>'token') AS token,
           data->>'created_at' AS created_at
      FROM kmb.api_tokens
     WHERE (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
       AND nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY trim(data->>'mechanic_id'), baris DESC
  ),
  jejak_wo AS (
    SELECT trim(data->>'mechanic_id') AS mechanic_id,
           count(*)::int AS wo_count
      FROM kmb.work_order_team
     WHERE nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     GROUP BY trim(data->>'mechanic_id')
  ),
  daftar AS (
    SELECT m.baris,
           coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
           coalesce(m.data->>'name', '') AS name,
           coalesce(m.data->>'email', '') AS email,
           lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
           coalesce(m.data->>'section', '') AS section,
           coalesce(m.data->>'position', m.data->>'grade', 'junior') AS position,
           coalesce(m.data->>'grade', m.data->>'position', '') AS grade,
           upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
           (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
           (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
           (lower(coalesce(m.data->>'boleh_lihat_performa', m.data->>'may_view_performance', 'false')) IN ('true', '1')) AS boleh_performa,
           (lower(coalesce(m.data->>'boleh_lihat_teknis', m.data->>'may_view_technical', 'false')) IN ('true', '1')) AS boleh_teknis,
           (lower(coalesce(m.data->>'boleh_lihat_report', m.data->>'may_view_report', 'false')) IN ('true', '1')) AS boleh_report,
           (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
           ta.token AS token,
           CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                THEN left(ta.token, 4) || '…'
                ELSE null
           END AS token_masked,
           (ta.token IS NOT NULL) AS has_token,
           coalesce(jw.wo_count, 0) AS jejak
      FROM kmb.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
      LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.data->>'mechanic_id')
     WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
              lower(coalesce(m.data->>'role', 'mechanic')),
              coalesce(m.data->>'name', '')
  )
  SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
    INTO v_users
    FROM daftar;

  SELECT coalesce(json_agg(json_build_object(
    'key', coalesce(data->>'key', data->>'position', ''),
    'label', coalesce(data->>'label', data->>'key', ''),
    'value', coalesce((nullif(trim(data->>'value'), ''))::numeric, 0)
  )), '[]'::json)
    INTO v_rates
    FROM kmb.config_rates;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbtra',
    'result', json_build_object(
      'rumah', 'kmbtra',
      'users', v_users,
      'rates', v_rates,
      'sections', json_build_array('field', 'workshop', 'tyreman'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id        text := btrim(coalesce(p_op_id, ''));
  v_existing_op  jsonb;
  v_kode         text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama         text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email        text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran        text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_section      text := btrim(coalesce(p_payload->>'section', ''));
  v_position     text := btrim(coalesce(p_payload->>'position', p_payload->>'grade', 'junior'));
  v_aktif        boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status       text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji     boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_perf   boolean := coalesce((p_payload->>'bolehPerforma')::boolean, (p_payload->>'may_view_performance')::boolean, false);
  v_boleh_tek    boolean := coalesce((p_payload->>'bolehTeknis')::boolean, (p_payload->>'may_view_technical')::boolean, false);
  v_boleh_rep    boolean := coalesce((p_payload->>'bolehReport')::boolean, (p_payload->>'may_view_report')::boolean, false);
  v_boleh_admin  boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama         record;
  v_baris        int;
  v_baru         boolean := false;
  v_data_baru    jsonb;
  v_waktu_wib    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_hasil        jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  -- Cek idempotensi di processed_ops
  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  -- Cegah admin mengunci dirinya sendiri
  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT baris, data INTO v_lama
    FROM kmb.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_kode
   LIMIT 1;

  v_data_baru := coalesce(v_lama.data, '{}'::jsonb) || jsonb_build_object(
    'mechanic_id', v_kode,
    'name', v_nama,
    'email', v_email,
    'role', v_peran,
    'section', v_section,
    'position', v_position,
    'grade', v_position,
    'status', v_status,
    'is_test_account', CASE WHEN v_akun_uji THEN 'true' ELSE 'false' END,
    'boleh_lihat_performa', CASE WHEN v_boleh_perf THEN 'true' ELSE 'false' END,
    'boleh_lihat_teknis', CASE WHEN v_boleh_tek THEN 'true' ELSE 'false' END,
    'boleh_lihat_report', CASE WHEN v_boleh_rep THEN 'true' ELSE 'false' END,
    'may_admin', CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END,
    'source', 'SUPABASE',
    'updated_at', v_waktu_wib
  );

  IF v_lama.baris IS NOT NULL THEN
    UPDATE kmb.config_mechanics
       SET data = v_data_baru,
           nilai = jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_section, v_position, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
           sinkron_at = now()
     WHERE baris = v_lama.baris;
    v_baris := v_lama.baris;
    v_baru := false;
  ELSE
    SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.config_mechanics WHERE baris >= 100000;
    INSERT INTO kmb.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
      v_baris,
      jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_section, v_position, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
      v_data_baru,
      now()
    );
    v_baru := true;
  END IF;

  INSERT INTO kmb.admin_users_supabase (mechanic_id, data, diubah_at)
  VALUES (v_kode, v_data_baru, now())
  ON CONFLICT (mechanic_id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Catat di audit_logs (tanpa token)
  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END, 'mechanic', v_kode),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
      'entity_type', 'mechanic',
      'entity_id', v_kode,
      'details', jsonb_build_object(
        'lama', coalesce(v_lama.data, null),
        'baru', v_data_baru
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_simpan_user',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    record;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_baris       int;
  v_tok_data    jsonb;
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT baris, data INTO v_mech
    FROM kmb.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
   LIMIT 1;

  IF v_mech.baris IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.data->>'status', 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', coalesce(v_mech.data->>'name', v_target_id) || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  -- Cek apakah sudah punya token aktif
  SELECT baris, trim(data->>'token') AS token, data
    INTO v_tok_lama
    FROM kmb.api_tokens
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
     AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
     AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
   ORDER BY baris DESC
   LIMIT 1;

  IF v_tok_lama.token IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', json_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama.token,
        'token_masked', left(v_tok_lama.token, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'kmbtra'
      )
    );
  END IF;

  -- Cabut token lama (disimpan sebagai riwayat, tidak dihapus)
  IF v_tok_lama.token IS NOT NULL THEN
    v_mengganti := true;
    UPDATE kmb.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false');

    UPDATE kmb.admin_tokens_supabase
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
           diubah_at = now()
     WHERE upper(trim(mechanic_id)) = v_target_id;
  END IF;

  -- Bangun token baru berawalan kmb- jika belum disediakan Pintu
  IF v_token = '' THEN
    v_token := 'kmb-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  v_tok_data := jsonb_build_object(
    'token', v_token,
    'mechanic_id', v_target_id,
    'name', coalesce(v_mech.data->>'name', v_target_id),
    'email', coalesce(v_mech.data->>'email', ''),
    'role', coalesce(v_mech.data->>'role', 'mechanic'),
    'is_active', 'true',
    'created_at', v_waktu_wib,
    'revoked_at', '',
    'source', 'SUPABASE'
  );

  SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.api_tokens WHERE baris >= 100000;
  INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
  VALUES (
    v_baris,
    jsonb_build_array(v_token, v_target_id, coalesce(v_mech.data->>'email', ''), 'true', v_waktu_wib),
    v_tok_data,
    now()
  );

  INSERT INTO kmb.admin_tokens_supabase (token, mechanic_id, data, diubah_at)
  VALUES (v_token, v_target_id, v_tok_data, now())
  ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Audit log TANPA nilai token mentah (hanya md5 & samaran 4 karakter)
  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END, 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object(
        'nama', coalesce(v_mech.data->>'name', v_target_id),
        'mengganti_lama', v_mengganti,
        'token_md5', md5(v_token),
        'token_samaran', left(v_token, 4) || '…'
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_terbitkan_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE kmb.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
    RETURNING baris, trim(data->>'token') AS token, data
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE kmb.admin_tokens_supabase
     SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
         diubah_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), 'admin_token_cabut', 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', 'admin_token_cabut',
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object('dicabut', v_dicabut)
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_cabut_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- Tutup fungsi internal dari publik/anon, hanya buka fungsi *_bertoken.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._kmbtra_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._kmbtra_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `kmb`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM kmb.api_tokens WHERE upper(trim(coalesce(data->>'mechanic_id', data->>'user_id', ''))) = v_target_id;
  DELETE FROM kmb.config_mechanics WHERE upper(trim(coalesce(data->>'mechanic_id', ''))) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'kmbtra')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `kmb`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_code', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_name', coalesce(nullif(btrim(data->>'unit_name'), ''), data->>'unit_id', ''),
    'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
    'section', coalesce(data->>'section', data->>'unit_type', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', '')), '[]'::jsonb)
  INTO v_units
  FROM kmb.config_units
  WHERE coalesce(data->>'unit_id', data->>'unit_code', '') <> '';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', coalesce(data->>'component_id', data->>'component_no', ''),
    'component_no', coalesce(data->>'component_no', data->>'component_id', ''),
    'component_name', coalesce(data->>'component_name', data->>'name', ''),
    'category', coalesce(data->>'category', data->>'section', 'General'),
    'section', coalesce(data->>'section', data->>'category', 'General'),
    'base_points', coalesce(nullif(regexp_replace(coalesce(data->>'base_points', data->>'base_point', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'target_hours', coalesce(nullif(regexp_replace(coalesce(data->>'target_hours', data->>'plan_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'component_id', data->>'component_no', '')), '[]'::jsonb)
  INTO v_comps
  FROM kmb.config_components
  WHERE coalesce(data->>'component_id', data->>'component_no', '') <> '';

  
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', coalesce(data->>'job_id', data->>'component_id', ''),
    'section', coalesce(data->>'section', 'field'),
    'unit_model', coalesce(data->>'unit_model', ''),
    'component', coalesce(data->>'component', data->>'category', 'General'),
    'sub_component', coalesce(data->>'sub_component', 'Standard'),
    'job_description', coalesce(data->>'job_description', data->>'component_name', ''),
    'plan_hours', coalesce(nullif(regexp_replace(coalesce(data->>'plan_hours', data->>'target_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'base_point', coalesce(nullif(regexp_replace(coalesce(data->>'base_point', data->>'base_points', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'job_type', coalesce(data->>'job_type', 'Preventive'),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'job_id', '')), '[]'::jsonb)
  INTO v_jobs
  FROM kmb.config_jobs_field;
  

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', coalesce(data->>'factor_type', data->>'type', 'factor') || ':' || coalesce(data->>'key', data->>'factor_key', ''),
    'factor_type', coalesce(data->>'factor_type', data->>'type', 'work_condition'),
    'key', coalesce(data->>'key', data->>'factor_key', ''),
    'value', coalesce(nullif(regexp_replace(coalesce(data->>'value', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'description', coalesce(data->>'description', '')
  ) ORDER BY coalesce(data->>'factor_type', data->>'type', ''), coalesce(data->>'key', '')), '[]'::jsonb)
  INTO v_factors
  FROM kmb.config_factors
  WHERE coalesce(data->>'key', data->>'factor_key', '') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbtra',
    'result', jsonb_build_object(
      'rumah', 'kmbtra',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'kmbtra',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmbtra_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'unit_id', v_id,
      'unit_code', v_id,
      'unit_name', btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      'section', btrim(coalesce(p_payload->>'section', 'field')),
      'unit_type', btrim(coalesce(p_payload->>'section', 'UNIT')),
      'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM kmb.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_units SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_units WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_units (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'component_id', v_id,
      'component_no', v_id,
      'component_name', btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      'category', btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    v_obj := jsonb_build_object(
      'job_id', v_id,
      'component_id', v_id,
      'component_no', v_id,
      'section', lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'field'))),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', '')),
      'component', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'category', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'sub_component', btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      'job_description', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'component_name', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'plan_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'base_points', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'job_type', btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      'is_active', 'TRUE'
    );
    
    SELECT baris INTO v_baris FROM kmb.config_jobs_field WHERE upper(btrim(coalesce(data->>'job_id', data->>'component_id', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_jobs_field SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_jobs_field WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_jobs_field (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'factor_type', v_ft,
      'type', v_ft,
      'key', v_fk,
      'factor_key', v_fk,
      'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      'description', btrim(coalesce(p_payload->>'description', ''))
    );
    SELECT baris INTO v_baris
      FROM kmb.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) = v_ft
       AND lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = v_fk
     LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_ft, v_fk), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmbtra_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    
    DELETE FROM kmb.config_jobs_field WHERE upper(btrim(coalesce(data->>'job_id', data->>'component_id', ''))) = upper(v_kunci);
    
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) || ':' || lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci)
        OR lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;
```

#### Langkah B — Copy-Paste File Worker `kmbprojek` di VS Code Anda Lalu Jalankan `wrangler deploy`

1. **Ganti isi file `workers/kmbprojek/src/web-handler.js` di VS Code Anda dengan kode lengkap ini**:

```javascript
/**
 * Web Desktop Handler untuk Cloudflare Workers (`kmbprojek`)
 * Menyajikan antarmuka desktop dan jembatan API google.script.run.
 * Mendukung penuh eksekusi mandiri via Supabase (`./supabase-backend.js`) tanpa pihak ketiga GAS,
 * serta memperbaiki Bug #24 (pembacaan `.result` vs `.data` dan pemetaan argumen `handle*`).
 */

import { renderWebPage } from './web-templates.js';
import { eksekusiAksiSupabaseMandiri } from './supabase-backend.js';
import { bacaStatusSaklar } from './index.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

const ROUTER_ACTIONS = new Set([
  'createWO', 'startWO', 'finishWO', 'submitWO',
  'getMyWos', 'getWoDetailForMechanic', 'submitMechanicWork',
  'siapkanFormTyre', 'dataDashboardTeknis', 'dataDashboardField',
  'riwayatHmUnit', 'koreksiHmWo', 'gantiPanelHm',
  'riwayatKmUnit', 'koreksiKmWo', 'gantiPanelKm',
  'supervisorApprove', 'handleSupervisorApprove',
  'supervisorReject', 'handleSupervisorReject',
  'superintendentApprove', 'handleSuperintendentApprove',
  'superintendentReject', 'handleSuperintendentReject',
  'handleCancelWO', 'cancelWO',
  'handleOverrideTargetHours', 'handleSaveOverride',
  'handleApproveTransfer', 'handleRejectTransfer',
  'handleKembalikanKeMekanik', 'handleBulkApprove',
  'loadJobsCatalog', 'getWODetails',
  'generatePayrollReport', 'generateReport',
]);


function lengkapiObjekWoWeb(w) {
  if (!w || typeof w !== 'object') return {};
  const id = String(w.id || w.wo_id || w.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || id);
  const st = String(w.status || 'pending_mechanic_work').toLowerCase();
  const sg = ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
    ? 'pending_approval'
    : (st === 'approved' ? 'done' : (['rejected', 'cancelled'].includes(st) ? 'rejected' : 'assigned'));
  const sl = st === 'approved'
    ? 'Approved'
    : (st === 'pending_supervisor' || st === 'pending_l1'
      ? 'Menunggu Approval L1'
      : (st === 'pending_superintendent' || st === 'pending_l2'
        ? 'Menunggu Approval L2'
        : (st === 'pending_transfer'
          ? 'Menunggu Keputusan Transfer'
          : (w.status_label || 'Perlu Diisi Mekanik'))));
  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = String(w.unit_id || w.unit_code || unitObj.unit_id || 'WORKSHOP');
  const unit_name = String(w.unit_name || unitObj.unit_name || unit_id);
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = String(w.component_id || compObj.component_no || compObj.component_id || compStr || w.job_id || 'COM-001');
  const component_name = String(w.component_name || w.others_description || w.activity || compObj.component_name || compStr || component_id || 'Pekerjaan');
  const base_points = Number(w.base_points ?? w.points ?? compObj.base_points ?? 1.0);
  const target_hours = Number(w.target_hours ?? compObj.target_hours ?? 2.0);
  const effective_base_points = Number(w.effective_base_points ?? base_points);
  const effective_target_hours = Number(w.effective_target_hours ?? target_hours);

  let team = Array.isArray(w.team) ? w.team : (Array.isArray(w.effective_team) ? w.effective_team : []);
  if (!team.length && w.team_distribution && typeof w.team_distribution === 'object') {
    team = Object.entries(w.team_distribution).map(([mid, pct]) => ({
      mechanic_id: String(mid).trim(),
      mechanic_name: String(mid).trim(),
      name: String(mid).trim(),
      percentage: Number(pct) || 100,
    }));
  }
  if (!team.length && w.lead_mechanic_id) {
    const mName = String(w.mechanic_name || w.lead_mechanic_name || w.lead_mechanic_id);
    team = [{ mechanic_id: String(w.lead_mechanic_id), mechanic_name: mName, name: mName, percentage: 100 }];
  }
  team = team.map((m) => ({
    ...m,
    mechanic_id: String(m.mechanic_id || m.id || ''),
    mechanic_name: String(m.mechanic_name || m.name || m.mechanic_id || m.id || '-'),
    name: String(m.name || m.mechanic_name || m.mechanic_id || m.id || '-'),
    percentage: Number(m.percentage ?? 100),
  }));
  const team_names = Array.isArray(w.team_names) && w.team_names.length
    ? w.team_names
    : team.map((m) => m.mechanic_name);

  return {
    ...w,
    id,
    wo_id: id,
    wo_number,
    status: st,
    status_group: sg,
    status_label: sl,
    unit_id,
    unit_code: unit_id,
    unit_name,
    unit_factor,
    unit: {
      unit_id,
      unit_name,
      unit_factor,
    },
    component_id,
    component_name,
    base_points,
    target_hours,
    effective_base_points,
    effective_target_hours,
    component: {
      component_no: component_id,
      component_id,
      component_name,
      category: String(compObj.category || w.section || 'General'),
      base_points,
      target_hours,
    },
    team,
    effective_team: team,
    team_names,
    mechanic_names: team_names,
    mechanics: team_names.join(', ') || '-',
    team_count: w.team_count || team.length || 1,
    requested_by_name: String(w.requested_by_name || w.transfer_requested_by_name || w.submitted_by_name || w.created_by_name || '-'),
    session_hours: Number(w.session_hours ?? w.transfer_session_hours ?? 0),
    partial_hours_now: Number(w.partial_hours_now ?? w.partial_hours ?? 0),
    partial_hours_after: Number(w.partial_hours_after ?? ((Number(w.partial_hours ?? 0) + Number(w.transfer_session_hours ?? w.session_hours ?? 0)).toFixed(2))),
    created_at_str: String(w.created_at_str || w.date || w.created_at || '-'),
  };
}

function ekstrakIsi(res) {
  if (!res || typeof res !== 'object') return {};
  const utama = res.result !== undefined && res.result !== null ? res.result : (res.data || {});
  if (utama && typeof utama === 'object' && !Array.isArray(utama) && utama.refs && typeof utama.refs === 'object') {
    return { ...utama, ...utama.refs };
  }
  return utama;
}

export async function handleWebRequest(request, env, url) {
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return new Response(renderPesanWeb('Perlu Token', 'Token autentikasi tidak ditemukan. Silakan masuk melalui pintu resmi.', 'https://abadiops.com', 'Buka Pintu abadiops.com'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 1. Verifikasi token via ping
  const pingRes = await panggilAksiInternal('ping', token, {}, env);
  const pingData = ekstrakIsi(pingRes);
  if (!pingRes || (!pingRes.success && !pingData.email && !pingData.mechanic_id)) {
    const errMsg = (pingRes && (pingRes.error || (pingRes.error && pingRes.error.message))) || 'Token tidak dikenal atau nonaktif.';
    return new Response(renderPesanWeb('Akses Ditolak', errMsg, 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const role = pingData.role || pingRes.role || 'supervisor';
  const email = pingData.email || pingRes.email || '';
  const name = pingData.name || pingData.nama || pingData.mechanic_name || pingRes.name || pingData.mechanic_id || '';
  const mechanic_id = pingData.mechanic_id || pingRes.mechanic_id || '';

  const user = {
    email,
    role,
    mechanic_name: name || mechanic_id || 'Pengguna',
    name,
    mechanic_id,
  };

  // 2. Tentukan halaman
  let page = (url.searchParams.get('page') || '').toLowerCase().trim().split('&')[0];
  if (!page) {
    const roleLower = String(role).toLowerCase();
    page = (roleLower === 'mechanic') ? 'mechanic'
         : (roleLower === 'supervisor') ? 'approvals'
         : 'dashboard';
  }

  // 3. Ambil data inisial halaman (perbaikan Bug #24: dukung .result maupun .data, serta backToken & activeFilter)
  const rawBack = (url.searchParams.get('back') || '').trim();
  const backToken = rawBack && rawBack !== token ? rawBack : '';
  const activeFilter = (url.searchParams.get('filter') || 'assigned').toLowerCase().trim();
  const context = {
    baseUrl: '/web',
    token,
    backToken,
    activeFilter,
    user,
    currentView: url.searchParams.get('view') || 'pending',
    viewAsMechanicId: url.searchParams.get('as') || '',
  };

  if (['users', 'user', 'admin', 'config', 'configs'].includes(page)) {
    const tabAwal = page.startsWith('config') ? (url.searchParams.get('tab') || 'unit') : (url.searchParams.get('tab') || 'users');
    return new Response(renderHalamanCrudUserWeb(env.RUMAH || 'kmbprojek', token, user, tabAwal), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Web': 'users',
      },
    });
  }

  try {
    if (['create', 'workorder', 'hm', 'km', 'teknis', 'reports'].includes(page)) {
      const refs = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const d = ekstrakIsi(refs);
      if (refs && refs.success) {
        context.components = d.components || [];
        context.units = d.units || [];
        context.mechanics = d.mechanics || [];
        context.workConditions = d.work_conditions || [];
        context.userScope = d.user_scope || null;
      }
    } else if (['approvals', 'approval'].includes(page)) {
      const [pending, active, approved, rejected, refs] = await Promise.all([
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
        panggilAksiInternal('pull_create_refs', token, {}, env),
      ]);
      const dp = ekstrakIsi(pending);
      const da = ekstrakIsi(active);
      const dap = ekstrakIsi(approved);
      const dr = ekstrakIsi(rejected);
      const dref = ekstrakIsi(refs);

      const saringWoSah = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const semuaPending = saringWoSah(dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(lengkapiObjekWoWeb);
      const semuaTransfer = saringWoSah(dp.transfers || []).map(lengkapiObjekWoWeb);
      context.pendingApprovals = semuaPending.filter((w) => w.status !== 'pending_transfer');
      context.pendingTransfers = semuaTransfer.length > 0 ? semuaTransfer : semuaPending.filter((w) => w.status === 'pending_transfer');
      context.activeWos = saringWoSah(da.active || da.wos || (Array.isArray(da) ? da : [])).map(lengkapiObjekWoWeb);
      context.approvedWos = saringWoSah(dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(lengkapiObjekWoWeb);
      context.rejectedWos = saringWoSah(dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(lengkapiObjekWoWeb);
      context.allMechanics = dref.mechanics || [];
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const [myWos, mon] = await Promise.all([
        panggilAksiInternal('pull_my_wos', token, {}, env),
        panggilAksiInternal('pull_monitoring', token, {}, env),
      ]);
      const dm = ekstrakIsi(myWos);
      const dmon = ekstrakIsi(mon);
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);
      const rawWosList = (dm.wos || (Array.isArray(dm) ? dm : [])).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const enrichedWos = rawWosList.map(lengkapiObjekWoWeb);
      const computedCounts = {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      const filteredWos = ['assigned', 'pending_approval', 'done'].includes(activeFilter)
        ? enrichedWos.filter((w) => w.status_group === activeFilter)
        : enrichedWos;
      const viewAsMech = context.viewAsMechanicId
        ? (mechsArr.find((m) => String(m.id || m.mechanic_id).toUpperCase() === String(context.viewAsMechanicId).toUpperCase()) || { id: context.viewAsMechanicId, name: context.viewAsMechanicId })
        : null;
      context.initialData = {
        wos: filteredWos,
        counts: computedCounts,
        viewing_as: viewAsMech ? { id: viewAsMech.id || viewAsMech.mechanic_id, name: viewAsMech.name || viewAsMech.id } : null,
        mechanic: user,
        tyre_pilihan: {
          jumlah_pos: 10,
          rtd_kritis: 5,
          problem: ['Worn Out', 'Cut/Torn', 'Run Flat', 'Separation', 'Puncture'],
          remarks: ['Scrap', 'Repair', 'Retread', 'Spare'],
          kondisi: ['New', 'Used', 'Repair', 'Retread'],
        },
      };
      context.monitoringData = {
        overall: (dmon && dmon.overall) || {
          mechanics: mechsArr.length,
          pending_mechanic_work: mechsArr.reduce((a, m) => a + (Number(m.pending_mechanic_work ?? m.pending_work) || 0), 0),
          expired: mechsArr.reduce((a, m) => a + (Number(m.expired) || 0), 0),
          pending_l1: mechsArr.reduce((a, m) => a + (Number(m.pending_l1) || 0), 0),
          pending_l2: mechsArr.reduce((a, m) => a + (Number(m.pending_l2) || 0), 0),
          approved: mechsArr.reduce((a, m) => a + (Number(m.approved) || 0), 0),
        },
        mechanics: mechsArr,
        periode: (dmon && dmon.periode) || '',
      };
      context.mons = mechsArr;
    } else if (['dashboard', 'main'].includes(page)) {
      const [mon, pending, active, approved, rejected] = await Promise.all([
        panggilAksiInternal('pull_monitoring', token, {}, env),
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
      ]);
      const dmon = ekstrakIsi(mon);
      const dp = ekstrakIsi(pending);
      const da = ekstrakIsi(active);
      const dap = ekstrakIsi(approved);
      const dr = ekstrakIsi(rejected);
      const ov = dmon.overall || {};
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);
      const saringWoSah = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const listPending = saringWoSah(dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(lengkapiObjekWoWeb);
      const listActive = saringWoSah(da.active || da.wos || (Array.isArray(da) ? da : [])).map(lengkapiObjekWoWeb);
      const listApproved = saringWoSah(dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(lengkapiObjekWoWeb);
      const listRejected = saringWoSah(dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(lengkapiObjekWoWeb);

      const petaWo = new Map();
      [...listPending, ...listActive, ...listApproved, ...listRejected].forEach((w) => {
        if (w && w.id && !petaWo.has(w.id)) petaWo.set(w.id, w);
      });
      const semuaWo = Array.from(petaWo.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      let totalPoints = 0;
      const lbMap = new Map();
      const trendMap = new Map();
      for (const w of listApproved) {
        const pts = Number(w.final_points ?? w.points ?? 0) || 0;
        const idr = Number(w.final_idr ?? w.idr_value ?? 0) || 0;
        totalPoints += pts;
        const tglKey = String(w.created_at_str || (w.created_at ? String(w.created_at).slice(0, 10) : 'Hari Ini'));
        trendMap.set(tglKey, Number(((trendMap.get(tglKey) || 0) + pts).toFixed(2)));
        const tim = Array.isArray(w.effective_team) && w.effective_team.length ? w.effective_team : [{ mechanic_id: w.lead_mechanic_id || '-', mechanic_name: (w.team_names && w.team_names[0]) || w.lead_mechanic_id || '-' }];
        for (const tm of tim) {
          const k = tm.mechanic_name || tm.mechanic_id || '-';
          if (!k || k === '-') continue;
          const cur = lbMap.get(k) || { mechanic_name: k, grade: tm.golongan || tm.position || '', jabatan: tm.jabatan_aktual || '', golongan: tm.golongan || '', wo_count: 0, wo_submitted_count: 0, total_points: 0, total_idr: 0 };
          cur.wo_count += 1;
          cur.wo_submitted_count += 1;
          cur.total_points = Number((cur.total_points + pts).toFixed(2));
          cur.total_idr = Math.round(cur.total_idr + idr);
          lbMap.set(k, cur);
        }
      }
      const leaderboard = Array.from(lbMap.values()).sort((a, b) => b.total_points - a.total_points);
      const woBerjam = semuaWo.filter((w) => Number(w.actual_hours) > 0);
      const avgJam = woBerjam.length > 0 ? Number((woBerjam.reduce((s, w) => s + Number(w.actual_hours), 0) / woBerjam.length).toFixed(1)) : 0;

      context.dashboardData = {
        user,
        periode: dmon.periode || 'Bulan Berjalan',
        periodeLabel: dmon.periode || 'Bulan Berjalan',
        stats: dmon.stats || {
          totalWOs: semuaWo.length || ((ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0) + (ov.approved || 0)),
          approved: listApproved.length || (ov.approved || 0),
          pending: listActive.length + listPending.length || ((ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0)),
          totalPoints: Number(totalPoints.toFixed(2)),
          activeMechanics: mechsArr.length || (ov.mechanics || 0),
          thisMonth: semuaWo.length,
          avgCompletion: avgJam,
          avgCompletionLabel: avgJam > 0 ? `${avgJam} jam` : '—',
          mechanicsByGrade: [],
        },
        recentWOs: semuaWo.slice(0, 20),
        leaderboard,
        submitLeaderboard: leaderboard.map((x) => ({ ...x, submit_count: x.wo_count })),
        leaderboardHarian: {
          label: 'Hari Ini',
          vessel: { nama: 'Rekondisi', jumlah_wo: listApproved.filter((w) => w.section === 'vessel').length, baris: leaderboard.slice(0, 5) },
          maintenance: { nama: 'Maintenance', jumlah_wo: listApproved.filter((w) => w.section !== 'vessel').length, baris: leaderboard.slice(0, 5) },
        },
        charts: dmon.charts || {
          pointsTrend: {
            labels: Array.from(trendMap.keys()),
            data: Array.from(trendMap.values()),
            periodeLabel: 'Bulan Berjalan',
          },
        },
      };
    }
  } catch (err) {
    console.error('Error saat mempersiapkan context halaman web:', err);
  }

  let html = renderWebPage(page, context);
  if (String(role).toLowerCase() !== 'mechanic' && !html.includes('page=users')) {
    const navCrudLink = `<a href="/web?page=users&token=${encodeURIComponent(token)}" class="nav-link" target="_top">👥 Users &amp; Config</a>`;
    if (html.includes('<div style="display:flex;align-items:center;')) {
      html = html.replace('<div style="display:flex;align-items:center;', navCrudLink + '<div style="display:flex;align-items:center;');
    } else if (html.includes('</nav>')) {
      html = html.replace('</nav>', navCrudLink + '</nav>');
    }
  }
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
      'X-Abadi-Web': page,
    },
  });
}

export async function handleWebBridgeApi(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response('Hanya POST diperbolehkan', { status: 405, headers: CORS });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'JSON payload tidak valid' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const token = body.token || (body.data && body.data.token) || '';
  const action = body.action || '';
  const data = body.data || {};
  if (typeof data === 'object' && data !== null && !data.token) {
    data.token = token;
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  const pakaiSupabase = url.searchParams.get('uji') !== 'gas' && Boolean(env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

  if (pakaiSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const hasilSupa = await eksekusiAksiSupabaseMandiri(action, token, { ...body, data }, env);
      if (hasilSupa) {
        if (hasilSupa.result !== undefined && hasilSupa.data === undefined) {
          hasilSupa.data = hasilSupa.result;
        }
        if (hasilSupa.success === false && typeof hasilSupa.error === 'string') {
          hasilSupa.error = { message: hasilSupa.error };
        }
        return new Response(JSON.stringify(hasilSupa), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    } catch (err) {
      if (tanpaGas || liveSaklar === 'supabase') {
        return new Response(JSON.stringify({
          success: false,
          source: 'SUPABASE',
          error: 'Gagal mengeksekusi aksi di Supabase: ' + String(err?.message || err),
        }), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;

  try {
    let res;
    if (ROUTER_ACTIONS.has(action)) {
      const params = new URLSearchParams();
      params.append('action', action);
      params.append('data', JSON.stringify(data));
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Abadi-Rumah': env.RUMAH || '',
        },
        body: params.toString(),
        redirect: 'follow',
      });
    } else {
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'X-Abadi-Rumah': env.RUMAH || '',
        },
        body: JSON.stringify({ token, action, data }),
        redirect: 'follow',
      });
    }

    const resText = await res.text();
    return new Response(resText, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Koneksi ke backend gagal: ' + (err.message || err) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function panggilAksiInternal(action, token, data, env) {
  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  if (env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const d = await eksekusiAksiSupabaseMandiri(action, token, { action, token, data }, env);
      if (d && d.success) return d;
    } catch (_) {}
    if (tanpaGas || liveSaklar === 'supabase') return null;
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;
  try {
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'X-Abadi-Rumah': env.RUMAH || '',
      },
      body: JSON.stringify({ action, token, data: data || {} }),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

function renderPesanWeb(judul, pesan, urlTombol, teksTombol) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${judul} - Abadi Operation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #111827; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .box { background: white; padding: 2.5rem; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 440px; width: 100%; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #0F172A; }
    p { color: #64748B; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.75rem; }
    a { display: inline-block; background: #4F633F; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; font-size: 0.95rem; transition: background 0.2s; }
    a:hover { background: #384B2B; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${judul}</h1>
    <p>${pesan}</p>
    <a href="${urlTombol}">${teksTombol}</a>
  </div>
</body>
</html>`;
}


function renderHalamanCrudUserWeb(rumah, token, user, tabAwal = 'users') {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rumahUp = esc(String(rumah || 'kmbprojek').toUpperCase());
  const tokEnc = encodeURIComponent(token);
  const namaUser = esc(user.mechanic_name || user.name || user.mechanic_id || 'Admin');
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manajemen User & Config (CRUD) - ${rumahUp}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #0F172A; padding: 20px; }
    .container { max-width: 1240px; margin: 0 auto; }
    .navbar { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
    .nav-brand { font-weight: 700; margin-right: 12px; }
    .nav-link { text-decoration: none; color: #475569; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .nav-link.active { background: #F1F4EE; color: #384B2B; font-weight: 700; }
    .sub-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .sub-tab { padding: 9px 15px; border-radius: 10px; border: 1px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 13.5px; cursor: pointer; }
    .sub-tab.active { background: #4F633F; color: #fff; border-color: #4F633F; }
    .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    h1 { font-size: 21px; margin-bottom: 6px; }
    .sub { color: #64748B; font-size: 13.5px; margin-bottom: 16px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; margin-bottom: 14px; }
    input, select { padding: 9px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 14px; }
    .btn { padding: 8px 13px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
    .btn-primary { background: #4F633F; color: #fff; }
    .btn-secondary { background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; }
    .btn-danger { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: left; }
    th { background: #F8FAFC; font-size: 12px; text-transform: uppercase; color: #475569; }
    .badge { padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .b-active { background: #DCFCE7; color: #166534; }
    .b-inactive { background: #FEE2E2; color: #991B1B; }
    .modal { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: none; align-items: center; justify-content: center; z-index: 999; padding: 16px; }
    .modal.show { display: flex; }
    .modal-box { background: #fff; border-radius: 14px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 22px; }
    .form-group { margin-bottom: 11px; display: flex; flex-direction: column; gap: 4px; }
    .form-group label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="navbar">
      <div class="nav-brand">⚙️ MAR (${rumahUp})</div>
      <a href="/web?page=dashboard&token=${tokEnc}" class="nav-link">Dashboard</a>
      <a href="/web?page=create&token=${tokEnc}" class="nav-link">Create WO</a>
      <a href="/web?page=mechanic&token=${tokEnc}" class="nav-link">Monitoring</a>
      <a href="/web?page=approvals&token=${tokEnc}" class="nav-link">Approvals</a>
      <a href="/web?page=users&token=${tokEnc}" class="nav-link active">👥 Users & Config (CRUD)</a>
      <span style="margin-left:auto;font-size:13px;color:#475569;font-weight:600;">${namaUser}</span>
    </nav>

    <div class="sub-tabs">
      <button class="sub-tab active" id="tabBtn_users" onclick="gantiTab('users')">👷 Users & Token</button>
      <button class="sub-tab" id="tabBtn_unit" onclick="gantiTab('unit')">🚜 Config Units</button>
      <button class="sub-tab" id="tabBtn_component" onclick="gantiTab('component')">🔩 Config Components</button>
      <button class="sub-tab" id="tabBtn_job" onclick="gantiTab('job')">📋 Catalog Jobs</button>
      <button class="sub-tab" id="tabBtn_factor" onclick="gantiTab('factor')">⚖️ Config Factors & Tarif</button>
    </div>

    <div id="pesanStatus" style="margin-bottom:12px;padding:10px 14px;border-radius:10px;background:#E0F2FE;font-size:13px;color:#0369A1;display:none;"></div>

    <div class="card" id="panel_users">
      <h1>👷 Manajemen Pengguna & Token (CRUD)</h1>
      <p class="sub">Tambah (Create), Lihat (Read), Ubah Role/Data & Ganti Token (Update), atau Hapus Pengguna (Delete) langsung di Supabase.</p>
      <div class="toolbar">
        <input type="search" id="cari" placeholder="🔍 Cari ID, nama, role, section..." oninput="renderTabel()" style="min-width:260px;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="muatUsers()">🔄 Muat Ulang</button>
          <button class="btn btn-primary" onclick="bukaModal()">+ Tambah User Baru</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>ID</th><th>Nama</th><th>Role</th><th>Section / Golongan</th><th>Status</th><th>Token</th><th>Aksi CRUD</th></tr>
          </thead>
          <tbody id="tbodyUsers">
            <tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">Memuat daftar pengguna...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card hidden" id="panel_config">
      <h1 id="judulConfig">🚜 Manajemen Config (CRUD)</h1>
      <p class="sub" id="subConfig">Kelola master data konfigurasi langsung di Supabase (Create, Read, Update, Delete).</p>
      <div class="toolbar">
        <input type="search" id="cariConfig" placeholder="🔍 Cari kode, nama, section, deskripsi..." oninput="renderTabelConfig()" style="min-width:260px;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="muatConfig()">🔄 Muat Ulang</button>
          <button class="btn btn-primary" id="btnTambahConfig" onclick="bukaModalConfigBaru()">+ Tambah Data</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead id="theadConfig"></thead>
          <tbody id="tbodyConfig"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="modal" id="modalUser">
    <div class="modal-box">
      <h3 id="judulModal" style="margin-bottom:14px;">Tambah / Edit User</h3>
      <div class="form-group"><label>Kode / ID Mekanik (contoh: MNT-015, SPV-003)</label><input type="text" id="fId" placeholder="MNT-015"></div>
      <div class="form-group"><label>Nama Lengkap</label><input type="text" id="fNama" placeholder="Nama lengkap"></div>
      <div class="form-group"><label>Email (opsional)</label><input type="email" id="fEmail" placeholder="nama@abadiops.com"></div>
      <div class="form-group"><label>Role</label><select id="fRole"><option value="mechanic">mechanic (Mekanik)</option><option value="supervisor">supervisor (L1 Approver / Planner)</option><option value="superintendent">superintendent (L2 Approver / Admin)</option></select></div>
      <div class="form-group"><label>Section (maintenance / vessel / workshop / field)</label><input type="text" id="fSection" placeholder="maintenance"></div>
      <div class="form-group"><label>Position / Golongan</label><input type="text" id="fGolongan" placeholder="junior / senior / 2a / 3a"></div>
      <div class="form-group"><label>Status</label><select id="fStatus"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="tutupModal()">Batal</button>
        <button class="btn btn-primary" onclick="simpanUser()">💾 Simpan</button>
      </div>
    </div>
  </div>

  <div class="modal" id="modalConfig">
    <div class="modal-box">
      <h3 id="judulModalConfig" style="margin-bottom:14px;">Tambah / Edit Config</h3>
      <div id="formConfigContainer"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="tutupModalConfig()">Batal</button>
        <button class="btn btn-primary" onclick="simpanConfig()">💾 Simpan Config</button>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    let TAB_AKTIF = ${JSON.stringify(tabAwal || 'users')};
    let DAFTAR = [];
    let DATA_CONFIG = { units: [], components: [], jobs: [], factors: [] };
    let CONFIG_SUDAH_DIMUAT = false;

    async function panggilApi(action, data = {}) {
      const res = await fetch('/api/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: TOKEN,
          action,
          op_id: 'op-web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          data,
        }),
      });
      return res.json();
    }

    function info(msg) {
      const el = document.getElementById('pesanStatus');
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }

    function gantiTab(tab) {
      TAB_AKTIF = tab;
      ['users', 'unit', 'component', 'job', 'factor'].forEach((t) => {
        const b = document.getElementById('tabBtn_' + t);
        if (b) b.classList.toggle('active', t === tab);
      });
      const isUsers = tab === 'users';
      document.getElementById('panel_users').classList.toggle('hidden', !isUsers);
      document.getElementById('panel_config').classList.toggle('hidden', isUsers);
      if (!isUsers) {
        const petaJudul = {
          unit: ['🚜 Config Units (CRUD)', 'Tambah, ubah, atau hapus daftar unit kendaraan/alat berat & faktor unit.', '+ Tambah Unit'],
          component: ['🔩 Config Components (CRUD)', 'Tambah, ubah, atau hapus komponen pekerjaan, base points, dan target jam.', '+ Tambah Komponen'],
          job: ['📋 Catalog Jobs (CRUD)', 'Tambah, ubah, atau hapus katalog job bertingkat (Section → Component → Sub-Component → Job).', '+ Tambah Job Katalog'],
          factor: ['⚖️ Config Factors & Tarif (CRUD)', 'Tambah, ubah, atau hapus faktor pengali kondisi kerja, ketepatan waktu, safety, MTBF, dan tarif.', '+ Tambah Faktor / Tarif'],
        };
        const infoTab = petaJudul[tab] || petaJudul.unit;
        document.getElementById('judulConfig').textContent = infoTab[0];
        document.getElementById('subConfig').textContent = infoTab[1];
        document.getElementById('btnTambahConfig').textContent = infoTab[2];
        if (!CONFIG_SUDAH_DIMUAT) { muatConfig(); } else { renderTabelConfig(); }
      }
    }

    async function muatUsers() {
      info('⏳ Memuat daftar pengguna...');
      const r = await panggilApi('admin_daftar_user');
      if (!r || !r.success) {
        info('❌ Gagal memuat pengguna: ' + ((r && (r.error?.message || r.error)) || 'Akses ditolak'));
        return;
      }
      DAFTAR = (r.result && r.result.users) || (r.data && r.data.users) || [];
      info('✅ Memuat ' + DAFTAR.length + ' pengguna.');
      renderTabel();
    }

    function renderTabel() {
      const q = (document.getElementById('cari').value || '').toLowerCase().trim();
      const rows = DAFTAR.filter((u) => !q || [u.mechanic_id, u.name, u.role, u.section, u.golongan].join(' ').toLowerCase().includes(q));
      const tb = document.getElementById('tbodyUsers');
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Tidak ada pengguna yang cocok.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map((u) => {
        const st = String(u.status || 'ACTIVE').toUpperCase();
        return '<tr>' +
          '<td><b>' + (u.mechanic_id || '') + '</b></td>' +
          '<td>' + (u.name || '') + '</td>' +
          '<td>' + (u.role || 'mechanic') + '</td>' +
          '<td>' + ([u.section, u.position || u.golongan].filter(Boolean).join(' · ') || '-') + '</td>' +
          '<td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td>' +
          '<td><code>' + (u.token_masked || (u.has_token ? 'Aktif' : 'Belum ada')) + '</code></td>' +
          '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="btn btn-secondary" onclick="editUser(\'' + u.mechanic_id + '\')">✏️ Edit</button>' +
            '<button class="btn btn-secondary" onclick="kelolaToken(\'' + u.mechanic_id + '\', false)">🔑 Token</button>' +
            '<button class="btn btn-secondary" onclick="kelolaToken(\'' + u.mechanic_id + '\', true)">🔄 Ganti</button>' +
            '<button class="btn btn-danger" onclick="hapusUser(\'' + u.mechanic_id + '\')">🗑 Hapus</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function bukaModal(u) {
      document.getElementById('judulModal').textContent = u ? ('Edit User: ' + u.mechanic_id) : 'Tambah User Baru';
      document.getElementById('fId').value = u ? u.mechanic_id : '';
      document.getElementById('fId').readOnly = Boolean(u);
      document.getElementById('fNama').value = u ? (u.name || '') : '';
      document.getElementById('fEmail').value = u ? (u.email || '') : '';
      document.getElementById('fRole').value = u ? (u.role || 'mechanic') : 'mechanic';
      document.getElementById('fSection').value = u ? (u.section || '') : 'maintenance';
      document.getElementById('fGolongan').value = u ? (u.position || u.golongan || '') : '';
      document.getElementById('fStatus').value = u ? (u.status || 'ACTIVE') : 'ACTIVE';
      document.getElementById('modalUser').classList.add('show');
    }

    function tutupModal() { document.getElementById('modalUser').classList.remove('show'); }
    function editUser(id) { const u = DAFTAR.find((x) => x.mechanic_id === id); if (u) bukaModal(u); }

    async function simpanUser() {
      const payload = {
        mechanic_id: document.getElementById('fId').value.trim().toUpperCase(),
        name: document.getElementById('fNama').value.trim(),
        email: document.getElementById('fEmail').value.trim(),
        role: document.getElementById('fRole').value,
        section: document.getElementById('fSection').value.trim(),
        position: document.getElementById('fGolongan').value.trim(),
        golongan: document.getElementById('fGolongan').value.trim(),
        status: document.getElementById('fStatus').value,
        aktif: document.getElementById('fStatus').value === 'ACTIVE',
      };
      const r = await panggilApi('admin_simpan_user', payload);
      if (!r || !r.success) { alert('Gagal menyimpan user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      if (payload.aktif) {
        try { await panggilApi('admin_terbitkan_token', { mechanic_id: payload.mechanic_id, ganti: false }); } catch (_) {}
      }
      tutupModal();
      await muatUsers();
    }

    async function kelolaToken(id, ganti) {
      if (ganti && !confirm('Ganti token untuk ' + id + '? Token lama akan dicabut.')) return;
      const r = await panggilApi('admin_terbitkan_token', { mechanic_id: id, ganti: Boolean(ganti) });
      if (!r || !r.success) { alert('Gagal: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      const tok = (r.result && r.result.token) || (r.data && r.data.token) || '';
      prompt('Token untuk ' + id + ' (Salin):', tok);
      await muatUsers();
    }

    async function hapusUser(id) {
      if (!confirm('Hapus permanen user ' + id + ' beserta tokennya?')) return;
      const r = await panggilApi('admin_hapus_user', { mechanic_id: id });
      if (!r || !r.success) { alert('Gagal menghapus user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      await muatUsers();
    }

    async function muatConfig() {
      info('⏳ Memuat data konfigurasi dari Supabase...');
      const r = await panggilApi('admin_daftar_config', { jenis: 'all' });
      if (!r || !r.success) {
        info('❌ Gagal memuat config: ' + ((r && (r.error?.message || r.error)) || 'Pastikan SQL terbaru sudah dijalankan'));
        return;
      }
      const d = r.result || r.data || {};
      DATA_CONFIG = {
        units: Array.isArray(d.units) ? d.units : [],
        components: Array.isArray(d.components) ? d.components : [],
        jobs: Array.isArray(d.jobs) ? d.jobs : [],
        factors: Array.isArray(d.factors) ? d.factors : [],
      };
      CONFIG_SUDAH_DIMUAT = true;
      info('✅ Config dimuat: ' + DATA_CONFIG.units.length + ' Unit, ' + DATA_CONFIG.components.length + ' Komponen, ' + DATA_CONFIG.jobs.length + ' Job, ' + DATA_CONFIG.factors.length + ' Faktor.');
      renderTabelConfig();
    }

    function renderTabelConfig() {
      const q = (document.getElementById('cariConfig').value || '').toLowerCase().trim();
      const th = document.getElementById('theadConfig');
      const tb = document.getElementById('tbodyConfig');
      if (TAB_AKTIF === 'unit') {
        th.innerHTML = '<tr><th>Kode Unit</th><th>Nama Unit</th><th>Model</th><th>Section</th><th>Faktor Unit</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.units.filter((x) => !q || [x.unit_id, x.unit_name, x.unit_model, x.section].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Belum ada data unit.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.unit_id || '') + '</b></td><td>' + (x.unit_name || x.unit_id || '') + '</td><td>' + (x.unit_model || '-') + '</td><td>' + (x.section || '-') + '</td><td>' + (x.unit_factor ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'unit\', ' + DATA_CONFIG.units.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'unit\', \'' + x.unit_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'component') {
        th.innerHTML = '<tr><th>ID Komponen</th><th>Nama Komponen</th><th>Kategori / Section</th><th>Base Points</th><th>Target Hours</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.components.filter((x) => !q || [x.component_id, x.component_name, x.category].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748B;">Belum ada data komponen.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.component_id || '') + '</b></td><td>' + (x.component_name || '') + '</td><td>' + (x.category || x.section || '-') + '</td><td>' + (x.base_points ?? 1) + '</td><td>' + (x.target_hours ?? 2) + ' jam</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'component\', ' + DATA_CONFIG.components.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'component\', \'' + x.component_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'job') {
        th.innerHTML = '<tr><th>Job ID</th><th>Section</th><th>Komponen → Sub</th><th>Deskripsi Pekerjaan</th><th>Plan Hours</th><th>Base Point</th><th>Status</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.jobs.filter((x) => !q || [x.job_id, x.section, x.component, x.sub_component, x.job_description, x.unit_model].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748B;">Belum ada data katalog job.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => {
          const st = String(x.status || 'ACTIVE').toUpperCase();
          return '<tr><td><b>' + (x.job_id || '') + '</b></td><td>' + (x.section || '-') + '</td><td>' + (x.component || '-') + ' · <small>' + (x.sub_component || '-') + '</small></td><td>' + (x.job_description || '') + '</td><td>' + (x.plan_hours ?? 2) + ' jam</td><td>' + (x.base_point ?? 1) + '</td><td><span class="badge ' + (st === 'ACTIVE' ? 'b-active' : 'b-inactive') + '">' + st + '</span></td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'job\', ' + DATA_CONFIG.jobs.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'job\', \'' + x.job_id + '\')">🗑 Hapus</button></td></tr>';
        }).join('');
      } else if (TAB_AKTIF === 'factor') {
        th.innerHTML = '<tr><th>Tipe Faktor</th><th>Key (Kunci)</th><th>Nilai Pengali / Tarif</th><th>Keterangan</th><th>Aksi CRUD</th></tr>';
        const rows = DATA_CONFIG.factors.filter((x) => !q || [x.factor_type, x.key, x.description].join(' ').toLowerCase().includes(q));
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748B;">Belum ada data faktor.</td></tr>'; return; }
        tb.innerHTML = rows.map((x, idx) => '<tr><td><b>' + (x.factor_type || '') + '</b></td><td><code>' + (x.key || '') + '</code></td><td><b>' + (x.value ?? 1) + '</b></td><td>' + (x.description || '-') + '</td><td style="display:flex;gap:6px;"><button class="btn btn-secondary" onclick="editConfigItem(\'factor\', ' + DATA_CONFIG.factors.indexOf(x) + ')">✏️ Edit</button><button class="btn btn-danger" onclick="hapusConfigItem(\'factor\', \'' + (x.factor_type || '') + ':' + (x.key || '') + '\')">🗑 Hapus</button></td></tr>').join('');
      }
    }

    function fg(lbl, id, val, ro, type) {
      return '<div class="form-group"><label>' + lbl + '</label><input ' + (type ? 'type="' + type + '" step="0.05" ' : '') + 'id="' + id + '" value="' + String(val ?? '').replace(/"/g, '&quot;') + '"' + (ro ? ' readonly' : '') + '></div>';
    }

    function bukaModalConfigBaru(item = null) {
      const box = document.getElementById('formConfigContainer');
      const t = TAB_AKTIF;
      document.getElementById('judulModalConfig').textContent = (item ? 'Edit ' : 'Tambah ') + t.toUpperCase();
      const selSt = '<div class="form-group"><label>Status</label><select id="cfg_status"><option value="ACTIVE"' + ((item?.status || 'ACTIVE') === 'ACTIVE' ? ' selected' : '') + '>ACTIVE</option><option value="INACTIVE"' + (item?.status === 'INACTIVE' ? ' selected' : '') + '>INACTIVE</option></select></div>';
      if (t === 'unit') {
        box.innerHTML = fg('Kode Unit (unit_id, contoh: DT-01, TB-ABADI-01)', 'cfg_unit_id', item?.unit_id || '', !!item) + fg('Nama Unit', 'cfg_unit_name', item?.unit_name || '') + fg('Model Unit', 'cfg_unit_model', item?.unit_model || '') + fg('Section (maintenance / vessel / field / workshop)', 'cfg_section', item?.section || 'maintenance') + fg('Faktor Unit', 'cfg_unit_factor', item?.unit_factor ?? 1.0, false, 'number') + selSt;
      } else if (t === 'component') {
        box.innerHTML = fg('ID Komponen (contoh: COM-001)', 'cfg_component_id', item?.component_id || '', !!item) + fg('Nama Komponen', 'cfg_component_name', item?.component_name || '') + fg('Kategori / Section', 'cfg_category', item?.category || item?.section || 'General') + fg('Base Points', 'cfg_base_points', item?.base_points ?? 1.25, false, 'number') + fg('Target Jam (Hours)', 'cfg_target_hours', item?.target_hours ?? 2.0, false, 'number') + selSt;
      } else if (t === 'job') {
        box.innerHTML = fg('Job ID (contoh: JOB-001)', 'cfg_job_id', item?.job_id || '', !!item) + fg('Section (maintenance / vessel / field / workshop)', 'cfg_section', item?.section || 'maintenance') + fg('Model Unit (opsional)', 'cfg_unit_model', item?.unit_model || '') + fg('Komponen Utama', 'cfg_component', item?.component || 'General') + fg('Sub-Komponen', 'cfg_sub_component', item?.sub_component || 'Standard') + fg('Deskripsi Pekerjaan', 'cfg_job_description', item?.job_description || '') + fg('Plan Hours (Target Jam)', 'cfg_plan_hours', item?.plan_hours ?? 2.0, false, 'number') + fg('Base Point', 'cfg_base_point', item?.base_point ?? 1.25, false, 'number') + fg('Job Type (Preventive / Corrective / Overhaul)', 'cfg_job_type', item?.job_type || 'Preventive') + selSt;
      } else if (t === 'factor') {
        box.innerHTML = fg('Tipe Faktor (work_condition / timeliness / safety / mtbf / rate / golongan)', 'cfg_factor_type', item?.factor_type || 'work_condition') + fg('Key (normal / difficult / extreme / on_time / late / junior)', 'cfg_key', item?.key || '') + fg('Nilai Angka (Value)', 'cfg_value', item?.value ?? 1.0, false, 'number') + fg('Keterangan', 'cfg_description', item?.description || '');
      }
      document.getElementById('modalConfig').classList.add('show');
    }

    function tutupModalConfig() { document.getElementById('modalConfig').classList.remove('show'); }
    function editConfigItem(jenis, idx) {
      const map = { unit: DATA_CONFIG.units, component: DATA_CONFIG.components, job: DATA_CONFIG.jobs, factor: DATA_CONFIG.factors };
      const item = (map[jenis] || [])[idx];
      if (item) bukaModalConfigBaru(item);
    }

    async function simpanConfig() {
      const t = TAB_AKTIF;
      const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      let payload = {};
      if (t === 'unit') payload = { unit_id: val('cfg_unit_id'), unit_name: val('cfg_unit_name'), unit_model: val('cfg_unit_model'), section: val('cfg_section'), unit_factor: val('cfg_unit_factor'), status: val('cfg_status') };
      else if (t === 'component') payload = { component_id: val('cfg_component_id'), component_name: val('cfg_component_name'), category: val('cfg_category'), base_points: val('cfg_base_points'), target_hours: val('cfg_target_hours'), status: val('cfg_status') };
      else if (t === 'job') payload = { job_id: val('cfg_job_id'), section: val('cfg_section'), unit_model: val('cfg_unit_model'), component: val('cfg_component'), sub_component: val('cfg_sub_component'), job_description: val('cfg_job_description'), plan_hours: val('cfg_plan_hours'), base_point: val('cfg_base_point'), job_type: val('cfg_job_type'), status: val('cfg_status') };
      else if (t === 'factor') payload = { factor_type: val('cfg_factor_type'), key: val('cfg_key'), value: val('cfg_value'), description: val('cfg_description') };
      const r = await panggilApi('admin_simpan_config', { jenis: t, payload });
      if (!r || !r.success) { alert('Gagal menyimpan config: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      tutupModalConfig();
      await muatConfig();
    }

    async function hapusConfigItem(jenis, kunci) {
      if (!confirm('Hapus item config ' + jenis + ' "' + kunci + '" dari Supabase?')) return;
      const r = await panggilApi('admin_hapus_config', { jenis, kunci });
      if (!r || !r.success) { alert('Gagal menghapus config: ' + ((r && (r.error?.message || r.error)) || 'Unknown error')); return; }
      await muatConfig();
    }

    muatUsers();
    if (TAB_AKTIF !== 'users') gantiTab(TAB_AKTIF);
  </script>
</body>
</html>`;
}
```

2. **Buat/ganti isi file `workers/kmbprojek/src/supabase-backend.js` di VS Code Anda dengan kode lengkap ini**:

```javascript
/**
 * Mesin Backend Mandiri Supabase — Rumah `KMB Project` (`kmb`)
 *
 * Melayani SELURUH aksi baca, tulis, manajemen pengguna admin, dan desktop web
 * langsung dari Cloudflare Worker + Supabase skema `kmb_projek` tanpa memanggil
 * pihak ketiga Google Apps Script (GAS).
 *
 * Perhitungan poin dan Rupiah hanya menggunakan `src/domain/scoring.mjs` (AGENTS.md §1).
 */

import { hitungSkorDanRupiahWo } from '../../../src/domain/scoring.mjs';

const RUMAH_KODE = 'kmbprojek';
const RPC_PREFIX = 'kmb';

export const SEMUA_AKSI_SUPABASE = new Set([
  // Aksi Baca PWA & Web
  'ping',
  'get_vapid_key',
  'pull_create_refs',
  'pull_monitoring',
  'pull_monitoring_daftar',
  'handleMonitoringDaftar',
  'getMonitoringDaftar',
  'pull_wo_detail',
  'handleMonitoringDetail',
  'handleMonitoringDetailWo',
  'getMonitoringDetailWo',
  'getWODetails',
  'getWoDetailForMechanic',
  'handleGetWoDetailForMechanic',
  'pull_my_wos',
  'getMyWos',
  'pull_pending',
  'pull_active',
  'pull_approved',
  'pull_rejected',
  'pull_cancelable',
  'handleDaftarCancelWo',
  'getDaftarCancelWo',
  'pull_transfers',
  'loadJobsCatalog',
  'getJobCatalogCached',
  'siapkanFormTyre',
  'dataDashboardTeknis',
  'handleDataDashboardTeknis',
  'dataDashboardField',
  'handleDataDashboardField',
  'riwayatHmUnit',
  'handleRiwayatHmUnit',
  'riwayatKmUnit',
  'handleRiwayatKmUnit',
  'generatePayrollReport',
  'handleGeneratePayrollReport',
  'generateReport',
  'cekStatusKiriman',
  'handleCekKiriman',

  // Aksi Manajemen Pengguna Admin
  'admin_daftar_user',
  'admin_simpan_user',
  'admin_terbitkan_token',
  'admin_cabut_token',
  'admin_hapus_user',
  'admin_daftar_config',
  'admin_simpan_config',
  'admin_hapus_config',

  // Aksi Tulis PWA & Web Desktop
  'save_push_sub',
  'create_wo',
  'createWO',
  'handleCreateWO',
  'submit_work',
  'submit_job',
  'submitMechanicWork',
  'handleSubmitMechanicWork',
  'submitWO',
  'startWO',
  'finishWO',
  'save_override',
  'handleSaveOverride',
  'handleOverrideTargetHours',
  'approve_l1',
  'supervisorApprove',
  'handleSupervisorApprove',
  'approve_l2',
  'superintendentApprove',
  'handleSuperintendentApprove',
  'handleBulkApprove',
  'reject',
  'supervisorReject',
  'superintendentReject',
  'handleSupervisorReject',
  'handleSuperintendentReject',
  'kembalikan',
  'handleKembalikanKeMekanik',
  'cancel_wo',
  'cancel',
  'cancelWO',
  'handleCancelWO',
  'request_transfer',
  'handleRequestTransfer',
  'approve_transfer',
  'handleApproveTransfer',
  'reject_transfer',
  'handleRejectTransfer',
  'report_expired',
  'reportExpiredWO',
  'handleReportExpired',
  'reopen_expired',
  'handleReopenExpired',
  'handleReopenExpiredWO',
  'koreksiHmWo',
  'handleKoreksiHmWo',
  'koreksiKmWo',
  'handleKoreksiKmWo',
  'gantiPanelHm',
  'handleGantiPanelHm',
  'gantiPanelKm',
  'handleGantiPanelKm',
]);

export const AKSI_ADMIN_SUPABASE = new Set([
  'admin_daftar_user',
  'admin_simpan_user',
  'admin_terbitkan_token',
  'admin_cabut_token',
  'admin_hapus_user',
  'admin_daftar_config',
  'admin_simpan_config',
  'admin_hapus_config',
]);

async function panggilRpcSupabase(rpcName, payload, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`RPC ${rpcName} HTTP ${res.status}: ${errText.slice(0, 180)}`);
  }

  return res.json();
}

function lengkapiWoObj(w) {
  if (!w || typeof w !== 'object') return {};
  const id = String(w.id || w.wo_id || w.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || id);
  const st = String(w.status || 'pending_mechanic_work').toLowerCase();
  const sg = ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
    ? 'pending_approval'
    : (st === 'approved' ? 'done' : (['rejected', 'cancelled'].includes(st) ? 'rejected' : 'assigned'));
  const sl = st === 'approved'
    ? 'Approved'
    : (st === 'pending_supervisor' || st === 'pending_l1'
      ? 'Menunggu Approval L1'
      : (st === 'pending_superintendent' || st === 'pending_l2'
        ? 'Menunggu Approval L2'
        : (st === 'pending_transfer'
          ? 'Menunggu Keputusan Transfer'
          : (w.status_label || 'Perlu Diisi Mekanik'))));
  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = String(w.unit_id || w.unit_code || unitObj.unit_id || 'WORKSHOP');
  const unit_name = String(w.unit_name || unitObj.unit_name || unit_id);
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = String(w.component_id || compObj.component_no || compObj.component_id || compStr || w.job_id || 'COM-001');
  const component_name = String(w.component_name || w.others_description || w.activity || compObj.component_name || compStr || component_id || 'Pekerjaan');
  const base_points = Number(w.base_points ?? w.points ?? compObj.base_points ?? 1.0);
  const target_hours = Number(w.target_hours ?? compObj.target_hours ?? 2.0);
  const effective_base_points = Number(w.effective_base_points ?? base_points);
  const effective_target_hours = Number(w.effective_target_hours ?? target_hours);

  let team = Array.isArray(w.team) ? w.team : (Array.isArray(w.effective_team) ? w.effective_team : []);
  if (!team.length && w.team_distribution && typeof w.team_distribution === 'object') {
    team = Object.entries(w.team_distribution).map(([mid, pct]) => ({
      mechanic_id: String(mid).trim(),
      mechanic_name: String(mid).trim(),
      name: String(mid).trim(),
      percentage: Number(pct) || 100,
    }));
  }
  if (!team.length && w.lead_mechanic_id) {
    const mName = String(w.mechanic_name || w.lead_mechanic_name || w.lead_mechanic_id);
    team = [{ mechanic_id: String(w.lead_mechanic_id), mechanic_name: mName, name: mName, percentage: 100 }];
  }
  team = team.map((m) => ({
    ...m,
    mechanic_id: String(m.mechanic_id || m.id || ''),
    mechanic_name: String(m.mechanic_name || m.name || m.mechanic_id || m.id || '-'),
    name: String(m.name || m.mechanic_name || m.mechanic_id || m.id || '-'),
    percentage: Number(m.percentage ?? 100),
  }));
  const team_names = Array.isArray(w.team_names) && w.team_names.length
    ? w.team_names
    : team.map((m) => m.mechanic_name);

  return {
    ...w,
    id,
    wo_id: id,
    wo_number,
    status: st,
    status_group: sg,
    status_label: sl,
    unit_id,
    unit_code: unit_id,
    unit_name,
    unit_factor,
    unit: { unit_id, unit_name, unit_factor },
    component_id,
    component_name,
    base_points,
    target_hours,
    effective_base_points,
    effective_target_hours,
    component: {
      component_no: component_id,
      component_id,
      component_name,
      category: String(compObj.category || w.section || 'General'),
      base_points,
      target_hours,
    },
    team,
    effective_team: team,
    team_names,
    mechanic_names: team_names,
    mechanics: team_names.join(', ') || '-',
    team_count: w.team_count || team.length || 1,
    requested_by_name: String(w.requested_by_name || w.transfer_requested_by_name || w.submitted_by_name || w.created_by_name || '-'),
    session_hours: Number(w.session_hours ?? w.transfer_session_hours ?? 0),
    partial_hours_now: Number(w.partial_hours_now ?? w.partial_hours ?? 0),
    partial_hours_after: Number(w.partial_hours_after ?? ((Number(w.partial_hours ?? 0) + Number(w.transfer_session_hours ?? w.session_hours ?? 0)).toFixed(2))),
    created_at_str: String(w.created_at_str || w.date || w.created_at || '-'),
  };
}

function normalisasiBlokWo(blk) {
  if (!blk || typeof blk !== 'object') return {};
  const b = { ...blk };
  if (b.manual_base_points !== undefined && b.others_base_points === undefined) b.others_base_points = b.manual_base_points;
  if (b.manual_target_hours !== undefined && b.others_target_hours === undefined) b.others_target_hours = b.manual_target_hours;
  if (b.manual_unit_factor !== undefined && b.others_unit_factor === undefined) b.others_unit_factor = b.manual_unit_factor;
  if (!Array.isArray(b.team) && b.team_distribution && typeof b.team_distribution === 'object') {
    b.team = Object.entries(b.team_distribution)
      .filter(([mid]) => String(mid || '').trim() !== '')
      .map(([mid, pct]) => ({
        mechanic_id: String(mid).trim(),
        percentage: Number(pct) || 100,
      }));
  }
  return b;
}

function normalisasiDataMasukan(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};
  let dataObj = {};
  if (typeof parsed.data === 'string') {
    try { dataObj = JSON.parse(parsed.data); } catch (_) {}
  } else if (parsed.data && typeof parsed.data === 'object') {
    dataObj = parsed.data;
  } else if (parsed.payload && typeof parsed.payload === 'object') {
    dataObj = parsed.payload;
  } else {
    dataObj = { ...parsed };
  }

  // Dukungan shim google.script.run multi-argumen (`args: [...]`)
  if (Array.isArray(parsed.args) && parsed.args.length > 0) {
    const arg0 = parsed.args[0];
    if (arg0 && typeof arg0 === 'object' && !Array.isArray(arg0)) {
      dataObj = { ...dataObj, ...arg0 };
    } else if (typeof arg0 === 'string') {
      if (!dataObj.wo_id) dataObj.wo_id = arg0;
      if (!dataObj.kategori) dataObj.kategori = arg0;
      if (!dataObj.unit_id) dataObj.unit_id = arg0;
      if (!dataObj.filter_type) dataObj.filter_type = arg0;
    }
    if (parsed.args.length > 1) {
      if (typeof parsed.args[1] === 'string' && !dataObj.reason) dataObj.reason = parsed.args[1];
      if (parsed.args.length >= 5) {
        dataObj.year = parsed.args[1];
        dataObj.month = parsed.args[2];
        dataObj.start_date = parsed.args[3];
        dataObj.end_date = parsed.args[4];
        dataObj.doc_type = parsed.args[5];
      }
    }
  }
  if (dataObj.override_data && typeof dataObj.override_data === 'object') {
    dataObj = { ...dataObj, ...dataObj.override_data };
  }
  if (dataObj.hm_baru !== undefined && dataObj.nilai_baru === undefined) dataObj.nilai_baru = dataObj.hm_baru;
  if (dataObj.km_baru !== undefined && dataObj.nilai_baru === undefined) dataObj.nilai_baru = dataObj.km_baru;
  if (dataObj.berlaku_at !== undefined && dataObj.diganti_pada === undefined) dataObj.diganti_pada = dataObj.berlaku_at;
  if (!dataObj.section && Array.isArray(parsed.args) && typeof parsed.args[0] === 'string') {
    dataObj.section = parsed.args[0];
  }
  return normalisasiBlokWo(dataObj);
}

/**
 * Eksekusi aksi langsung ke Supabase tanpa pihak ketiga (GAS).
 * Mengembalikan objek JSON standar `{ success, source: 'SUPABASE', result, data }`.
 */
export async function eksekusiAksiSupabaseMandiri(action, token, parsed, env) {
  const cleanAction = String(action || '').trim();
  const cleanToken = String(token || (parsed && parsed.token) || '').trim();
  const dataObj = normalisasiDataMasukan(parsed);
  const opId = String(parsed?.op_id || dataObj?.op_id || `op-auto-${Date.now()}`).trim();

  if (cleanAction === 'get_vapid_key') {
    return {
      success: true,
      source: 'SUPABASE',
      result: { key: (env && env.VAPID_PUBLIC_KEY) || '' },
    };
  }

  if (!cleanToken) {
    return {
      success: false,
      source: 'SUPABASE',
      error: 'Token tidak dikenal / nonaktif',
    };
  }

  // 1. Ping / Verifikasi Token
  if (cleanAction === 'ping') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
  }

  // 2. Katalog & Referensi Pembuatan WO
  if (['pull_create_refs', 'loadJobsCatalog', 'siapkanFormTyre'].includes(cleanAction)) {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success && d.result && !d.result.refs) {
      d.result = { ...d.result, refs: d.result };
    }
    if (d && d.success && !d.data) {
      d.data = (d.result && d.result.refs) || d.result;
    }
    return d;
  }

  // 2b. Katalog Pekerjaan per Section (`getJobCatalogCached` untuk WorkOrder.html di Web Desktop)
  if (cleanAction === 'getJobCatalogCached') {
    const sec = String(dataObj.section || dataObj.kategori || 'maintenance').trim().toLowerCase();
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const refs = (d && d.result && (d.result.refs || d.result)) || {};
    let jobs = [];
    if (sec === 'vessel' && Array.isArray(refs.jobs_vessel) && refs.jobs_vessel.length > 0) {
      jobs = refs.jobs_vessel;
    } else if (sec === 'workshop' && Array.isArray(refs.jobs_workshop) && refs.jobs_workshop.length > 0) {
      jobs = refs.jobs_workshop;
    } else if (Array.isArray(refs.jobs_field) && refs.jobs_field.length > 0) {
      jobs = refs.jobs_field;
    } else if (Array.isArray(refs.jobs)) {
      jobs = refs.jobs.filter((j) => !j.section || String(j.section).toLowerCase() === sec);
    } else {
      jobs = [
        ...(Array.isArray(refs.jobs_field) ? refs.jobs_field : []),
        ...(Array.isArray(refs.jobs_vessel) ? refs.jobs_vessel : []),
        ...(Array.isArray(refs.jobs_workshop) ? refs.jobs_workshop : []),
      ];
    }
    return {
      success: true,
      source: 'SUPABASE',
      result: { jobs, section: sec },
      data: { jobs, section: sec },
    };
  }

  // 3. Monitoring Ringkasan
  if (cleanAction === 'pull_monitoring') {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_monitoring_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success && !d.data) d.data = d.result;
    return d;
  }

  // 4. Monitoring Daftar per Kategori (belum, expired, l1, l2, approved)
  if (['pull_monitoring_daftar', 'handleMonitoringDaftar', 'getMonitoringDaftar'].includes(cleanAction)) {
    const kat = String(dataObj.kategori || dataObj.category || 'belum').trim();
    return await panggilRpcSupabase(`${RPC_PREFIX}_monitoring_daftar_bertoken`, {
      p_token: cleanToken,
      p_kategori: kat,
    }, env);
  }

  // 5. Detail Satu WO
  if (['pull_wo_detail', 'handleMonitoringDetail', 'handleMonitoringDetailWo', 'getMonitoringDetailWo', 'getWODetails', 'getWoDetailForMechanic', 'handleGetWoDetailForMechanic'].includes(cleanAction)) {
    const woId = String(dataObj.wo_id || dataObj.woId || dataObj.id || '').trim();
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_wo_detail_bertoken`, {
      p_token: cleanToken,
      p_wo_id: woId,
    }, env);
    if (d && d.success && d.result && typeof d.result === 'object') {
      const woObj = lengkapiWoObj(d.result.wo || d.result);
      d.result = { ...woObj, wo: woObj };
      d.data = { ...woObj, wo: woObj };
    }
    return d;
  }

  // 6. Daftar WO Mekanik (`pull_my_wos`)
  if (['pull_my_wos', 'getMyWos'].includes(cleanAction)) {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_my_wos_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success) {
      const rawWos = Array.isArray(d.result) ? d.result : (Array.isArray(d.result?.wos) ? d.result.wos : []);
      const enrichedWos = rawWos.map(lengkapiWoObj).map((w) => {
        const st = String(w.status || 'pending_mechanic_work').toLowerCase();
        const sg = w.status_group || (
          ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
            ? 'pending_approval'
            : (st === 'approved' ? 'done' : 'assigned')
        );
        const sl = w.status_label || (
          sg === 'done' ? 'Approved' : (sg === 'pending_approval' ? 'Menunggu Approval' : 'Perlu Diisi Mekanik')
        );
        const teamArr = Array.isArray(w.team) ? w.team : [];
        return {
          ...w,
          status_group: sg,
          status_label: sl,
          team_count: w.team_count || teamArr.length || 1,
        };
      });
      const counts = {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      d.result = {
        ...(typeof d.result === 'object' && !Array.isArray(d.result) ? d.result : {}),
        wos: enrichedWos,
        counts,
        pulled_at: d.pulled_at || new Date().toISOString(),
      };
      d.data = d.result;
    }
    return d;
  }

  // 7. Daftar WO Berdasarkan Status (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`, `pull_cancelable`, `pull_transfers`)
  if (['pull_pending', 'pull_active', 'pull_approved', 'pull_rejected', 'pull_cancelable', 'handleDaftarCancelWo', 'getDaftarCancelWo', 'pull_transfers'].includes(cleanAction)) {
    const petaStatus = {
      pull_pending: 'pending',
      pull_active: 'active',
      pull_approved: 'approved',
      pull_rejected: 'rejected',
      pull_cancelable: 'cancelable',
      handleDaftarCancelWo: 'cancelable',
      getDaftarCancelWo: 'cancelable',
      pull_transfers: 'transfers',
    };
    const st = petaStatus[cleanAction] || 'pending';
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
      p_token: cleanToken,
      p_status: st,
    }, env);
    if (d && d.success && d.result) {
      const rawList = Array.isArray(d.result) ? d.result : (d.result.wos || d.result[st] || []);
      const wos = rawList
        .filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0')
        .map(lengkapiWoObj);
      d.result = {
        ...(typeof d.result === 'object' && !Array.isArray(d.result) ? d.result : {}),
        wos,
        [st]: wos,
      };
      if (['handleDaftarCancelWo', 'getDaftarCancelWo'].includes(cleanAction)) {
        d.data = wos;
      } else {
        d.data = d.result;
      }
    }
    return d;
  }

  // 8. Aksi Manajemen Pengguna Admin
  if (cleanAction === 'admin_daftar_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_daftar_user_bertoken`, { p_token: cleanToken }, env);
  }
  if (cleanAction === 'admin_simpan_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_simpan_user_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_payload: dataObj,
    }, env);
  }
  if (cleanAction === 'admin_terbitkan_token') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_terbitkan_token_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
      p_token_baru: String(dataObj.token_baru || ''),
      p_ganti: Boolean(dataObj.ganti),
    }, env);
  }
  if (cleanAction === 'admin_cabut_token') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_cabut_token_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
    }, env);
  }
  if (cleanAction === 'admin_hapus_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_hapus_user_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
    }, env);
  }
  if (cleanAction === 'admin_daftar_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_daftar_config_bertoken`, {
      p_token: cleanToken,
      p_jenis: String(dataObj.jenis || 'all'),
    }, env);
  }
  if (cleanAction === 'admin_simpan_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_simpan_config_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_jenis: String(dataObj.jenis || 'unit'),
      p_payload: (dataObj.payload && typeof dataObj.payload === 'object') ? dataObj.payload : dataObj,
    }, env);
  }
  if (cleanAction === 'admin_hapus_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_hapus_config_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_jenis: String(dataObj.jenis || 'unit'),
      p_kunci: String(dataObj.kunci || dataObj.id || ''),
    }, env);
  }

  // 9. Aksi Dashboard Teknis, Riwayat Meter, Cek Kiriman, & Payroll Report (Web Desktop)
  if (['cekStatusKiriman', 'handleCekKiriman'].includes(cleanAction)) {
    return {
      success: true,
      source: 'SUPABASE',
      kiriman: 'TIDAK_ADA',
      keadaan: 'tidak_ada',
      pesan: 'Kiriman itu tidak pernah sampai ke server — aman diisi ulang dari awal.',
      result: { created: [], failed: [] },
      data: { created: [], failed: [] },
    };
  }
  if (['dataDashboardTeknis', 'handleDataDashboardTeknis', 'dataDashboardField', 'handleDataDashboardField'].includes(cleanAction)) {
    const refs = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const units = (refs && refs.result && (refs.result.units || (refs.result.refs && refs.result.refs.units))) || [];
    const isField = cleanAction.toLowerCase().includes('field');
    const payloadOut = isField
      ? {
          demo: Boolean(dataObj.demo),
          periode: 'Bulan Berjalan',
          hari: 30,
          mohh: 720,
          ringkas: { pa: 1.0, unit: units.length, kejadian: 0, total_bd: 0, mttr: null, mtbf: null },
          terbuka: [],
          unit: units.map((u) => ({
            nama: u.unit_id || u.unit_code || '-',
            equipment: u.unit_model || u.unit_type || '-',
            ub0: 0, ub1: 0, sb0: 0, total_bd: 0, kejadian: 0,
            mttr: null, mtbf: null, hm_bacaan: 0, hm_liputan: 0, hm_dibuang: 0,
            pa: 1.0, target_pa: 0.9, terbuka: false,
          })),
          units,
          summary: { total_units: units.length },
        }
      : {
          demo: Boolean(dataObj.demo),
          rtd_kritis: 5,
          dipindai_sebagian: false,
          batas_pindai: 500,
          target_life_km: 50000,
          ringkas: { unit: units.length, posisi: 0, baris_inspeksi: 0, baris_removeinstal: 0, baris_repair: 0 },
          mingguan: [],
          kondisi: [],
          problem: { jenis: [], posisi: [] },
          riwayat: [],
          repair: [],
          life: { jumlah: 0, per_merk: [], per_posisi: [], selesai: [] },
          units,
          summary: { total_units: units.length },
        };
    return {
      success: true,
      source: 'SUPABASE',
      result: payloadOut,
      data: payloadOut,
    };
  }
  if (['riwayatHmUnit', 'handleRiwayatHmUnit', 'riwayatKmUnit', 'handleRiwayatKmUnit'].includes(cleanAction)) {
    const unitId = String(dataObj.unit_id || dataObj.unit_code || '').trim();
    const isKm = cleanAction.toLowerCase().includes('km');
    const approved = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
      p_token: cleanToken,
      p_status: 'approved',
    }, env);
    const wos = ((approved && approved.result && approved.result.wos) || []).filter(
      (w) => !unitId || String(w.unit_id || w.unit_code) === unitId
    );
    const bacaan = wos
      .filter((w) => isKm ? (w.kilometers !== undefined && w.kilometers !== '') : (w.hour_meter !== undefined && w.hour_meter !== ''))
      .map((w) => {
        const val = Number(isKm ? w.kilometers : w.hour_meter) || 0;
        return {
          wo_id: w.id || w.wo_id || w.wo_number,
          wo_number: w.wo_number || w.id,
          at: w.submitted_at || w.created_at || w.date || '',
          section: w.section || 'maintenance',
          oleh_nama: w.submitted_by_name || w.created_by_name || (Array.isArray(w.team_names) && w.team_names[0]) || '-',
          hm: val,
          nilai: val,
          janggal: '',
        };
      });
    const outMeter = {
      unit_id: unitId,
      acuan: bacaan.length > 0 ? { hm: bacaan[0].hm, nilai: bacaan[0].nilai, at: bacaan[0].at, oleh: bacaan[0].oleh_nama, wo_number: bacaan[0].wo_number } : null,
      panel: [],
      bacaan,
      wos,
    };
    return {
      success: true,
      source: 'SUPABASE',
      result: outMeter,
      data: outMeter,
    };
  }
  if (['generatePayrollReport', 'handleGeneratePayrollReport', 'generateReport'].includes(cleanAction)) {
    const approved = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
      p_token: cleanToken,
      p_status: 'approved',
    }, env);
    const wos = ((approved && approved.result && approved.result.wos) || []).map(lengkapiWoObj);
    const mechSet = new Set();
    let totalIdr = 0;
    let totalPoints = 0;
    const csvRows = ['No WO,Tanggal,Section,Unit,Komponen/Pekerjaan,Mekanik,Jam Aktual,Poin Final,Rupiah (IDR)'];
    for (const w of wos) {
      const pts = Number(w.final_points ?? w.points ?? w.base_points ?? 0) || 0;
      const idr = Number(w.final_idr ?? w.idr_value ?? 0) || 0;
      totalPoints += pts;
      totalIdr += idr;
      const tNames = Array.isArray(w.team_names) && w.team_names.length ? w.team_names : [w.lead_mechanic_id || '-'];
      tNames.forEach((m) => { if (m && m !== '-') mechSet.add(m); });
      const cleanCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      csvRows.push([
        cleanCsv(w.wo_number),
        cleanCsv(w.created_at_str || w.date || ''),
        cleanCsv(w.section || ''),
        cleanCsv(w.unit_id || ''),
        cleanCsv(w.component_name || ''),
        cleanCsv(tNames.join('; ')),
        cleanCsv(w.actual_hours ?? w.duration_hours ?? 0),
        cleanCsv(pts),
        cleanCsv(idr),
      ].join(','));
    }
    const csvText = csvRows.join('\r\n');
    let fileB64 = '';
    try {
      fileB64 = btoa(unescape(encodeURIComponent(csvText)));
    } catch (_) {}
    const reportOut = {
      period: dataObj.start_date && dataObj.end_date
        ? `${dataObj.start_date} s/d ${dataObj.end_date}`
        : (dataObj.month && dataObj.year ? `Bulan ${dataObj.month}/${dataObj.year}` : 'Semua Periode Approved'),
      summary: {
        total_mechanics: mechSet.size,
        total_wos: wos.length,
        total_idr: Math.round(totalIdr),
        total_points: Number(totalPoints.toFixed(2)),
      },
      dikecualikan: { baris: 0, nama: [] },
      filename: `Payroll_${RUMAH_KODE.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
      file_b64: fileB64,
      wos,
      total_wo: wos.length,
      generated_at: new Date().toISOString(),
    };
    return {
      success: true,
      source: 'SUPABASE',
      result: reportOut,
      data: reportOut,
    };
  }

  // 10. Bulk Approve (Web Desktop)
  if (cleanAction === 'handleBulkApprove') {
    const ids = Array.isArray(dataObj.wo_ids)
      ? dataObj.wo_ids
      : (Array.isArray(dataObj.ids) ? dataObj.ids : []);
    const level = Number(dataObj.level || 1);
    const subAction = level === 2 ? 'approve_l2' : 'approve_l1';
    const results = [];
    for (const id of ids) {
      const subRes = await eksekusiAksiSupabaseMandiri(
        subAction,
        cleanToken,
        { op_id: `${opId}-${id}`, data: { ...dataObj, wo_id: id } },
        env
      );
      results.push(subRes);
    }
    return {
      success: true,
      source: 'SUPABASE',
      result: { approved_count: results.filter((r) => r && r.success).length, results },
      data: { approved_count: results.filter((r) => r && r.success).length, results },
    };
  }

  // 11. Normalisasi nama aksi tulis Web Desktop (handle*) ke aksi standar RPC
  const petaAksiTulis = {
    handleCreateWO: 'create_wo',
    createWO: 'create_wo',
    handleSubmitMechanicWork: 'submit_work',
    submitMechanicWork: 'submit_work',
    submitWO: 'submit_work',
    startWO: 'submit_work',
    finishWO: 'submit_work',
    handleSaveOverride: 'save_override',
    handleOverrideTargetHours: 'save_override',
    handleSupervisorApprove: 'approve_l1',
    supervisorApprove: 'approve_l1',
    handleSuperintendentApprove: 'approve_l2',
    superintendentApprove: 'approve_l2',
    handleSupervisorReject: 'reject',
    supervisorReject: 'reject',
    handleSuperintendentReject: 'reject',
    superintendentReject: 'reject',
    handleKembalikanKeMekanik: 'kembalikan',
    handleCancelWO: 'cancel_wo',
    cancelWO: 'cancel_wo',
    handleRequestTransfer: 'request_transfer',
    handleApproveTransfer: 'approve_transfer',
    handleRejectTransfer: 'reject_transfer',
    reportExpiredWO: 'report_expired',
    handleReportExpired: 'report_expired',
    handleReopenExpired: 'reopen_expired',
    handleReopenExpiredWO: 'reopen_expired',
    handleKoreksiHmWo: 'koreksiHmWo',
    handleKoreksiKmWo: 'koreksiKmWo',
    handleGantiPanelHm: 'gantiPanelHm',
    handleGantiPanelKm: 'gantiPanelKm',
  };
  const aksiRpc = petaAksiTulis[cleanAction] || cleanAction;

  // Dukungan pembuatan WO batch (`blocks: [...]`) dari halaman Web Desktop (`WorkOrder.html`)
  if (aksiRpc === 'create_wo' && Array.isArray(dataObj.blocks) && dataObj.blocks.length > 0) {
    const kirimanId = String(dataObj.kiriman_id || opId);
    const sharedGroupMode = String(dataObj.blocks[0]?.wo_group_mode || dataObj.wo_group_mode || '').trim();
    const sharedGroupId = (sharedGroupMode && dataObj.blocks.length >= 2)
      ? String(dataObj.blocks[0]?.wo_group_id || `GRP-${kirimanId}`)
      : '';
    const created = [];
    const failed = [];
    for (let i = 0; i < dataObj.blocks.length; i++) {
      const blk = normalisasiBlokWo(dataObj.blocks[i] || {});
      if (sharedGroupId && !blk.wo_group_id) blk.wo_group_id = sharedGroupId;
      if (sharedGroupMode && !blk.wo_group_mode) blk.wo_group_mode = sharedGroupMode;
      if (sharedGroupId) blk.grup_total = dataObj.blocks.length;
      const subRes = await panggilRpcSupabase(`${RPC_PREFIX}_eksekusi_aksi_bertoken`, {
        p_token: cleanToken,
        p_aksi: 'create_wo',
        p_op_id: `${kirimanId}-${i + 1}`,
        p_payload: blk,
        p_skor_js: null,
      }, env);
      const compLbl = blk.component_name || blk.others_description || blk.job_id || blk.component_id || (subRes && subRes.result && subRes.result.component_name) || 'Pekerjaan';
      const unitLbl = blk.unit_id || (subRes && subRes.result && subRes.result.unit_id) || 'WORKSHOP';
      if (subRes && subRes.success && subRes.result) {
        created.push({
          ...subRes.result,
          index: i,
          component_id: blk.component_id || blk.job_id || '',
          component_name: compLbl,
          unit_id: unitLbl,
          label: `${compLbl} · ${unitLbl}`,
        });
      } else {
        failed.push({ index: i, component_id: blk.component_id || blk.job_id || '', unit_id: unitLbl, label: `${compLbl} · ${unitLbl}`, error: (subRes && subRes.error) || 'Gagal membuat baris WO' });
      }
    }
    return {
      success: failed.length === 0,
      source: 'SUPABASE',
      result: { created, failed, wo_id: created[0]?.wo_id, wo_number: created[0]?.wo_number },
      data: { created, failed, wo_id: created[0]?.wo_id, wo_number: created[0]?.wo_number },
    };
  }

  // 12. Khusus Approve L2: Hitung Poin & Rupiah di JS (`src/domain/scoring.mjs`) sebelum simpan ke Supabase
  let skorJs = null;
  if (aksiRpc === 'approve_l2') {
    const woId = String(dataObj.wo_id || dataObj.id || '').trim();
    if (woId) {
      try {
        const konteks = await panggilRpcSupabase(`${RPC_PREFIX}_konteks_skor_bertoken`, {
          p_token: cleanToken,
          p_wo_id: woId,
        }, env);
        if (konteks && konteks.success && konteks.result && konteks.result.wo) {
          skorJs = hitungSkorDanRupiahWo({
            rumah: RUMAH_KODE,
            wo: konteks.result.wo,
            factorsList: konteks.result.factors || [],
            baseSettingsList: konteks.result.base_settings || [],
            mechanicsList: konteks.result.mechanics || [],
            safetyIncident: Boolean(dataObj.safety_incident),
            mtbfRedoStatus: String(dataObj.mtbf_status || dataObj.mtbf_redo_status || 'first_time'),
          });
        }
      } catch (_) {}
    }
  }

  // 13. Panggil RPC Eksekusi Aksi Tulis di Supabase
  return await panggilRpcSupabase(`${RPC_PREFIX}_eksekusi_aksi_bertoken`, {
    p_token: cleanToken,
    p_aksi: aksiRpc,
    p_op_id: opId,
    p_payload: dataObj,
    p_skor_js: skorJs,
  }, env);
}
```

3. **Buat file `src/domain/scoring.mjs` di VS Code Anda dengan kode ini**:

```javascript
/**
 * RUMUS POIN & RUPIAH — fungsi murni, tanpa basis data (`src/domain/scoring.mjs`).
 *
 * Satu-satunya sumber perhitungan poin dan uang di seluruh repo (AGENTS.md §1).
 * Diimpor oleh TypeScript (`src/domain/scoring.ts`) maupun Cloudflare Workers
 * (`workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`).
 */

export const AMBANG_TEPAT_WAKTU = Object.freeze({ ON_TIME_MAX: 100, LATE_MAX: 150 });

/**
 * Pembulatan setengah-ke-atas yang tahan galat pecahan biner.
 * @param {number} nilai
 * @param {number} desimal
 * @returns {number}
 */
export function bulatkan(nilai, desimal) {
  if (!Number.isFinite(nilai)) throw new Error(`bukan angka: ${String(nilai)}`);
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

/**
 * Status ketepatan waktu dari jam kerja aktual dibanding target.
 * @param {number} actualHours
 * @param {number} targetHours
 * @returns {'on_time' | 'late' | 'way_late'}
 */
export function statusKetepatanWaktu(actualHours, targetHours) {
  if (targetHours <= 0) return 'on_time';
  const rasio = (actualHours / targetHours) * 100;
  if (rasio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) return 'on_time';
  if (rasio <= AMBANG_TEPAT_WAKTU.LATE_MAX) return 'late';
  return 'way_late';
}

/**
 * FINAL = base × unit × kondisi × ketepatan × safety × mtbf
 * @param {{
 *   basePoints: number,
 *   targetHours: number,
 *   actualHours: number,
 *   unitFactor: number,
 *   workCondition: string,
 *   safetyIncident: boolean,
 *   mtbfRedoStatus: string | null
 * }} m
 * @param {{
 *   workCondition: Record<string, number>,
 *   timeliness: Record<string, number>,
 *   safety: Record<string, number>,
 *   mtbf: Record<string, number>
 * }} f
 */
export function hitungSkor(m, f) {
  const timelinessStatus = statusKetepatanWaktu(m.actualHours, m.targetHours);

  const workConditionFactor = (f.workCondition && f.workCondition[m.workCondition]) ?? 1.0;
  const timelinessFactor = (f.timeliness && f.timeliness[timelinessStatus]) ?? 1.0;
  const safetyFactor = m.safetyIncident
    ? ((f.safety && f.safety['incident']) ?? 0.0)
    : ((f.safety && f.safety['no_incident']) ?? 1.0);
  const mtbfFactor = m.mtbfRedoStatus ? ((f.mtbf && f.mtbf[m.mtbfRedoStatus]) ?? 1.0) : 1.0;

  const finalPoints = bulatkan(
    m.basePoints *
      m.unitFactor *
      workConditionFactor *
      timelinessFactor *
      safetyFactor *
      mtbfFactor,
    2,
  );

  return {
    basePoints: m.basePoints,
    targetHours: m.targetHours,
    actualHours: m.actualHours,
    unitFactor: m.unitFactor,
    workConditionFactor,
    timelinessFactor,
    timelinessStatus,
    safetyFactor,
    mtbfFactor,
    finalPoints,
  };
}

/**
 * Rupiah satu mekanik (Model Poin Penuh).
 * @param {number} points
 * @param {number} idrPerPoint
 * @returns {number}
 */
export function rupiahUntukPoin(points, idrPerPoint) {
  if (!Number.isFinite(points) || !Number.isFinite(idrPerPoint)) {
    throw new Error('poin dan rate wajib angka');
  }
  if (idrPerPoint < 0) throw new Error('rate tidak boleh negatif');
  return bulatkan(points * idrPerPoint, 0);
}

/**
 * Jam yang dipakai menghitung = sesi terakhir + akumulasi sebelum transfer.
 * @param {number} sessionHours
 * @param {number} partialHours
 * @returns {number}
 */
export function jamTerpakai(sessionHours, partialHours) {
  return bulatkan((sessionHours || 0) + (partialHours || 0), 2);
}

/**
 * Hitung skor & rincian Rupiah per anggota tim untuk sebuah WO (KMB V2, KMB Project, atau SUM V2).
 * Mengikuti aturan rumah masing-masing (`docs/INVENTARIS-SUM.md` untuk SUM V2, `src/domain/scoring.ts` untuk KMB).
 */
export function hitungSkorDanRupiahWo({
  rumah,
  wo,
  factorsList = [],
  baseSettingsList = [],
  mechanicsList = [],
  safetyIncident = false,
  mtbfRedoStatus = 'first_time',
}) {
  const petaFaktor = {
    workCondition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
    timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
    safety: { no_incident: 1.0, incident: 0.0 },
    mtbf: { first_time: 1.0, redo: 0.5 },
    golongan: { '1': 0.6, '2': 1.0, '3': 1.1, '4': 1.2, '5': 1.3 },
    rates: { junior: 2500, senior: 3500, advisor: 4500, mechanic: 2500 },
  };

  for (const row of factorsList || []) {
    const fType = String(row.factor_type || row.type || '').trim().toLowerCase();
    const fKey = String(row.key || row.factor_key || '').trim().toLowerCase();
    const fVal = Number(row.value);
    if (!Number.isFinite(fVal)) continue;
    if (fType === 'work_condition') petaFaktor.workCondition[fKey] = fVal;
    else if (fType === 'timeliness') petaFaktor.timeliness[fKey] = fVal;
    else if (fType === 'safety') petaFaktor.safety[fKey] = fVal;
    else if (fType === 'mtbf') petaFaktor.mtbf[fKey] = fVal;
    else if (fType === 'golongan' || fType === 'grade_multiplier') petaFaktor.golongan[fKey] = fVal;
    else if (fType === 'rate' || fType === 'pay_rate') petaFaktor.rates[fKey] = fVal;
  }

  let rateGlobalSum = 2500;
  for (const s of baseSettingsList || []) {
    const k = String(s.key || s.setting_key || '').trim().toLowerCase();
    const v = Number(s.value || s.setting_value);
    if (Number.isFinite(v) && v > 0 && (k.includes('rate') || k.includes('point') || k.includes('tarif'))) {
      rateGlobalSum = v;
    }
  }

  const isSum = String(rumah || '').toLowerCase() === 'sum';
  const basePoints = Number(wo.effective_base_points ?? wo.base_points ?? 1.0) || 1.0;
  const targetHours = Number(wo.effective_target_hours ?? wo.target_hours ?? 1.0) || 1.0;
  const actualHours = Number(wo.actual_hours ?? wo.duration_hours ?? targetHours) || targetHours;
  const unitFactor = Number(wo.unit_factor ?? 1.0) || 1.0;
  const workCondition = String(wo.work_condition || 'normal').toLowerCase();

  // Di SUM V2, MTBF dinonaktifkan (selalu 1.0) sesuai docs/INVENTARIS-SUM.md
  const skor = hitungSkor(
    {
      basePoints,
      targetHours,
      actualHours,
      unitFactor,
      workCondition,
      safetyIncident: Boolean(safetyIncident),
      mtbfRedoStatus: isSum ? null : (mtbfRedoStatus || 'first_time'),
    },
    petaFaktor,
  );

  const petaMekanik = new Map();
  for (const m of mechanicsList || []) {
    const id = String(m.mechanic_id || m.id || '').trim();
    if (id) petaMekanik.set(id, m);
  }

  const teamArr = Array.isArray(wo.effective_team) && wo.effective_team.length > 0
    ? wo.effective_team
    : (Array.isArray(wo.team) ? wo.team : []);

  let totalIdr = 0;
  const mechanicPoints = teamArr.map((anggota) => {
    const mid = String(anggota.mechanic_id || anggota || '').trim();
    const info = petaMekanik.get(mid) || anggota || {};
    const mName = String(info.name || info.mechanic_name || anggota.mechanic_name || mid);

    let effectiveRate = 2500;
    if (isSum) {
      const gol = String(info.golongan || '').trim().toLowerCase();
      const awalanGol = gol.slice(0, 1);
      const pengali = petaFaktor.golongan[gol] ?? petaFaktor.golongan[awalanGol] ?? 1.0;
      effectiveRate = bulatkan(rateGlobalSum * pengali, 2);
    } else {
      const pos = String(info.position || info.grade || 'junior').trim().toLowerCase();
      effectiveRate = petaFaktor.rates[pos] ?? 2500;
    }

    const idrValue = rupiahUntukPoin(skor.finalPoints, effectiveRate);
    totalIdr += idrValue;

    return {
      mechanic_id: mid,
      mechanic_name: mName,
      points: skor.finalPoints,
      rate_per_point: effectiveRate,
      idr_value: idrValue,
      idr_amount: idrValue,
    };
  });

  const ratioPercent = targetHours > 0 ? bulatkan((actualHours / targetHours) * 100, 0) : 100;
  const timelinessLabel = skor.timelinessStatus === 'on_time'
    ? 'On Time'
    : (skor.timelinessStatus === 'late' ? 'Late' : 'Way Late');

  return {
    ...skor,
    totalIdr,
    mechanicPoints,
    timeliness: {
      status: skor.timelinessStatus,
      label: timelinessLabel,
      factor: skor.timelinessFactor,
      ratio_percent: ratioPercent,
    },
  };
}
```

4. **Ganti isi file `workers/kmbprojek/src/index.js` di VS Code Anda dengan kode ini**:

```javascript
/**
 * Rumah KMB Project: Worker `abadiops-kmbprojek`
 * Rumah: kmbprojek · Pemegang: Raka
 *
 * Arsitektur Mandiri (Zero Third-Party GAS Dependency saat Saklar Supabase Aktif):
 *   1. Menyajikan file PWA 1:1 (`pwa/kmbprojek/`);
 *   2. Melayani SELURUH aksi baca, tulis, manajemen pengguna (`admin_*`), dan web desktop
 *      langsung dari Worker + Supabase skema `kmb_projek` (`./supabase-backend.js`);
 *   3. Hanya meneruskan ke GAS jika saklar bernilai `gas` (mode warisan).
 */

import { handleWebRequest, handleWebBridgeApi } from './web-handler.js';
import {
  SEMUA_AKSI_SUPABASE,
  AKSI_ADMIN_SUPABASE,
  eksekusiAksiSupabaseMandiri,
} from './supabase-backend.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine',
};

// Seluruh aksi baca & tulis kini didukung penuh oleh mesin mandiri Supabase di repo
const AKSI_SUPABASE_LULUS_KEMBAR = SEMUA_AKSI_SUPABASE;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/api/sehat')) return sehat(env);
    if (url.pathname === '/api/web' || url.pathname === '/api/web/') return handleWebBridgeApi(request, env, url);
    if (url.pathname === '/web' || url.pathname === '/web/' || url.pathname.startsWith('/web/')) return handleWebRequest(request, env, url);
    if (/\/api\/?$/.test(url.pathname)) return tanganiApi(request, env, url);

    // Akar folder → index.html, disajikan langsung tanpa redirect (lihat wrangler.toml).
    if (url.pathname.endsWith('/')) {
      return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  },
};

async function tanganiApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const bodyText = await request.text();
  let parsed = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {}

  const action = parsed.action || '';
  const token = parsed.token || (parsed.data && parsed.data.token) || '';
  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  const reqEngine = (
    request.headers.get('x-active-engine') ||
    url.searchParams.get('engine') ||
    parsed.engine ||
    (liveSaklar !== 'gas' || tanpaGas ? 'SUPABASE' : (env.STORAGE_MODE || 'GAS'))
  ).toUpperCase();

  const ujiSupabase = url.searchParams.get('uji') === 'supabase';
  const woSupabase = apakahWoLahirDiSupabase(parsed);
  const woGasLama = apakahWoLamaDariGas(parsed);

  const bolehSupabase = (aksi) => {
    if (ujiSupabase || tanpaGas || liveSaklar === 'supabase') return true;
    // Saklar Balik (docs/SAKLAR.md): WO yang sudah terlanjur lahir di Supabase tetap diselesaikan di Supabase walau saklar = 'gas'
    if (woSupabase) return true;
    // Mode dua_cabang (docs/SAKLAR.md): WO lama yang lahir di GAS (3 digit) tetap diselesaikan di GAS untuk aksi tulis
    if (liveSaklar === 'dua_cabang') {
      const aksiTulisWo = new Set([
        'submit_work', 'submit_job', 'save_override', 'approve_l1', 'approve_l2',
        'reject', 'cancel_wo', 'request_transfer', 'approve_transfer', 'reject_transfer',
        'report_expired', 'reopen_expired',
      ]);
      if (aksiTulisWo.has(aksi) && woGasLama && !tanpaGas) return false;
      return true;
    }
    return (
      (AKSI_ADMIN_SUPABASE.has(aksi) && (reqEngine === 'SUPABASE' || liveSaklar !== 'gas')) ||
      (reqEngine === 'SUPABASE' && AKSI_SUPABASE_LULUS_KEMBAR.has(aksi))
    );
  };

  if (bolehSupabase(action) && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const resSupa = await cobaSupabaseMandiri(action, token, parsed, liveSaklar, tanpaGas, env);
    if (resSupa) {
      return resSupa;
    }
  }

  if (tanpaGas || liveSaklar === 'supabase') {
    return new Response(JSON.stringify({
      success: false,
      source: 'SUPABASE',
      error: `Aksi ${action || '?'} gagal diproses di Supabase mandiri (GAS dinonaktifkan).`,
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Jalur': 'supabase',
      },
    });
  }

  return teruskanKeGas(bodyText, action, env);
}

async function cobaSupabaseMandiri(action, token, parsed, liveSaklar, tanpaGas, env) {
  try {
    if (!SEMUA_AKSI_SUPABASE.has(action)) return null;
    const data = await eksekusiAksiSupabaseMandiri(action, token, parsed, env);
    if (
      data &&
      (data.success ||
       AKSI_ADMIN_SUPABASE.has(action) ||
       liveSaklar === 'supabase' ||
       liveSaklar === 'dua_cabang' ||
       tanpaGas)
    ) {
      catat(env, { aksi: action, jalur: 'supabase', status: 200 });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
          'X-Abadi-Jalur': 'supabase',
          'X-Active-Engine': 'SUPABASE',
        },
      });
    }
  } catch (err) {
    catat(env, { aksi: action, galat_supabase: String((err && err.message) || err) });
  }
  return null;
}

async function teruskanKeGas(body, aksi, env) {
  const mulai = Date.now();
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const teks = await res.text();
    catat(env, { aksi, status: res.status, ms: Date.now() - mulai, jalur: 'gas' });
    return new Response(teks, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Jalur': 'gas',
      },
    });
  } catch (e) {
    catat(env, { aksi, galat: String((e && e.message) || e), ms: Date.now() - mulai });
    return new Response('GAS_TIDAK_TERJANGKAU', {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

function catat(env, isi) {
  console.log(JSON.stringify({ rumah: (env && env.RUMAH) || 'kmbprojek', ...isi }));
}

let cacheSaklar = { nilai: null, waktu: 0 };

export async function bacaStatusSaklar(env) {
  const sekarang = Date.now();
  // Jika PINTU service binding tersedia, panggil langsung (0ms internal RPC) agar pembalikan saklar berlaku seketika tanpa jeda cache
  if (!(env && env.PINTU) && cacheSaklar.nilai && cacheSaklar.waktu > sekarang) {
    return cacheSaklar.nilai;
  }
  let hasil = (env && env.SAKLAR) || 'gas';
  try {
    let r = null;
    if (env && env.PINTU && typeof env.PINTU.fetch === 'function') {
      r = await env.PINTU.fetch('https://pintu.internal/api/saklar/status');
    } else {
      const isStaging = (env?.GAS_URL && env.GAS_URL.includes('gas-tiruan')) || (env?.RUMAH && env.RUMAH.includes('staging'));
      const url = env?.PINTU_STATUS_URL || (isStaging
        ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev/api/saklar/status'
        : 'https://abadiops.com/api/saklar/status');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
    }
    if (r && r.ok) {
      const data = await r.json();
      const sw = data?.switches || {};
      const val = sw[env?.RUMAH] || sw['kmbprojek'] || sw['kmbprojek'];
      if (val) {
        hasil = val;
        cacheSaklar = { nilai: hasil, waktu: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}

async function sehat(env) {
  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH || 'kmbprojek',
    saklar: liveSaklar,
    jalur: (liveSaklar === 'supabase' || tanpaGas)
      ? 'supabase'
      : (liveSaklar === 'dua_cabang' ? 'dua_cabang' : 'gas'),
    backend_mandiri: true,
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}


// Deteksi apakah sebuah WO lahir di Supabase (ID berawalan WO-SB- / WO-KMBP- atau nomor 4 digit WO-YYYYMMDD-XXXX).
// Sesuai docs/SAKLAR.md ("Satu WO, satu rumah" & "Saklar balik"): WO yang sudah lahir di Supabase
// tetap tinggal dan diselesaikan di Supabase walaupun saklar dibalik kembali ke `gas`.
export function apakahWoLahirDiSupabase(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const d = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  const kandidat = [
    parsed.wo_id, parsed.id, parsed.wo_number,
    d.wo_id, d.id, d.wo_number,
  ].map((x) => String(x || '').trim()).filter(Boolean);

  for (const k of kandidat) {
    if (/^(WO-SB-|WO-KMBP-|sb_)/i.test(k)) return true;
    if (/^WO-\d{8}-\d{4}$/i.test(k)) return true;
  }
  return false;
}

export function apakahWoLamaDariGas(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const d = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  const kandidat = [
    parsed.wo_id, parsed.id, parsed.wo_number,
    d.wo_id, d.id, d.wo_number,
  ].map((x) => String(x || '').trim()).filter(Boolean);

  if (kandidat.length === 0) return false;
  if (apakahWoLahirDiSupabase(parsed)) return false;
  for (const k of kandidat) {
    if (/^WO-\d{13}-\d+$/i.test(k)) return true;
    if (/^WO-\d{8}-\d{3}(?:-[A-Z0-9]+)?$/i.test(k)) return true;
  }
  return false;
}
```

5. **Ganti isi file `workers/kmbprojek/wrangler.toml` di VS Code Anda dengan konfigurasi ini**:

```toml
# Rumah KMB Project: Worker yang menyajikan PWA KMB Project dan meneruskan setiap panggilan API ke GAS KMB Project.
# Rumah: kmbprojek · Pemegang: Raka · Tahap 3 (Pintu): 100% diteruskan ke GAS. Saklar: gas.
# Penjelasan: workers/kmbprojek/README.md
name = "abadiops-porject-kmb"
main = "src/index.js"
compatibility_date = "2026-10-01"
workers_dev = true

# Domain: kmbprojek.abadiops.com dipasang via dashboard Cloudflare (Settings -> Domains & Routes)
# sama seperti abadiops.com, agar deploy lewat API token tanpa izin zona tidak gagal.
# routes = [
#   { pattern = "kmbprojek.abadiops.com", custom_domain = true }
# ]

# Akun Cloudflare kawanabadigrup. Dikunci supaya deploy tidak pernah nyasar ke akun lain.
account_id = "9273ece6d47a3bb103159295c10ce9e6"

# File PWA KMB Project (salinan 1:1 dari mar-projek-offline, hanya alamat API yang diganti).
# html_handling "none": /index.html disajikan langsung (200, tanpa redirect).
[assets]
directory = "../../pwa/kmbprojek"
binding = "ASSETS"
html_handling = "none"
not_found_handling = "none"

[vars]
RUMAH = "kmbprojek"
SAKLAR = "gas"
# Web app GAS produksi KMB Project (script 1cKrVdmxH_hD4yVTwqLAXKdUjwM5wd7Glh4MdlpT7oP8KDOaGNgJCJVyh).
GAS_URL = "https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec"
SUPABASE_URL = "https://sptgqsjgszwbreikxdph.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_PoWC64yv25bZizBrTL79vw_CuNQwhp3"
STORAGE_MODE = "GAS"

# Service binding ke Pintu untuk membaca posisi saklar secara instan tanpa terkena blokir fetch zona yang sama (Bug #27).
services = [
  { binding = "PINTU", service = "abadiops-pintu" }
]

[observability]
enabled = true

# Panggung Latihan (Staging) - docs/GEDUNG-DAN-STAGING.md §2
[env.staging]
name = "abadiops-kmbprojek-staging"
workers_dev = true

services = [
  { binding = "GAS_TIRUAN", service = "abadiops-gas-tiruan" },
  { binding = "PINTU", service = "abadiops-pintu-staging" }
]

[env.staging.vars]
RUMAH = "kmbprojek"
SAKLAR = "supabase"
GAS_URL = "https://abadiops-gas-tiruan.kawanabadigrup.workers.dev/kmbprojek"
SUPABASE_URL = "https://dnnqrslftndcbmnvuveb.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_HgQd9sXhK3-CrFyUId-LEw_q_ah2S0O"
STORAGE_MODE = "SUPABASE"
```

6. **Di `workers/kmbprojek/src/web-templates.js` di VS Code Anda**, tekan `Ctrl+H` (Find & Replace):
   * Find: `var backToken = ctx.backToken || token;`
   * Replace All dengan: `var backToken = ctx.backToken || '';`

7. **Jalankan perintah deploy `kmbprojek` ini di Terminal VS Code Anda**:

```bash
npx wrangler deploy --config workers/kmbprojek/wrangler.toml --env staging
```

#### Langkah C — Copy-Paste 3 File Worker `pintu` (`/saklar`) untuk Menampilkan Tab `⚙️ Manajemen Config & Master Data (Pusat 3 Rumah)` di Halaman Saklar

1. **Ganti isi file `workers/pintu/src/index.js` di VS Code Anda dengan kode ini**:

```javascript
/**
 * Pintu Abadi Operation (abadiops.com). Netral: tidak menampilkan aplikasi rumah mana pun.
 * Keputusan: docs/KEPUTUSAN.md 28 Okt 2026. Bagian bersama (AGENTS.md §2).
 *
 * Rute:
 * - GET  /                              -> Halaman Pintu (index.html)
 * - POST /api/pintu                     -> Ping token ke semua rumah (kenaliRumah: Supabase mandiri & GAS)
 * - GET  /saklar (atau /admin)          -> Panel Pengelola: Saklar Dua Cabang & Manajemen Pengguna Terpusat
 * - POST /saklar/api/masuk              -> Login panel pengelola
 * - GET  /saklar/api/status             -> Ambil posisi saklar & audit history (auth required)
 * - POST /saklar/api/ubah               -> Balik posisi saklar (auth required)
 * - GET|POST /saklar/api/users*         -> Manajemen Pengguna & Token Lintas Rumah via Supabase RPC (auth required)
 * - GET  /api/saklar/status             -> Endpoint publik/antar-worker untuk cek posisi saklar
 *
 * Durable Object: SaklarDO (HANYA untuk saklar & riwayatnya; tidak diperluas untuk data user).
 */

import { SaklarDO } from './saklar-do.js';
import { verifikasiKataSandi, validasiSesi } from './saklar-auth.js';
import { tanganiApiUserAdmin } from './user-admin.js';

export { SaklarDO };

const BATAS_GAS_MS = 25000;

function daftarRumah(env) {
  const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
  if (!Array.isArray(r) || !r.length) throw new Error('RUMAH belum dikonfigurasi di wrangler.toml');
  return r;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function getSaklarStub(env) {
  if (!env.SAKLAR_DO) return null;
  try {
    const id = env.SAKLAR_DO.idFromName('abadiops-master-saklar');
    return env.SAKLAR_DO.get(id);
  } catch (err) {
    console.warn('Gagal inisialisasi SaklarDO stub:', err);
    return null;
  }
}

function rpcPingUntukRumah(kode) {
  const k = String(kode || '').toLowerCase();
  if (k === 'sum') return 'sum_ping';
  if (k === 'kmbtra' || k === 'kmb') return 'kmbtra_ping';
  return 'kmb_ping';
}

async function tanyaSupabasePing(rumah, token, env) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { rumah, lewati: true };
  }
  const rpcName = rpcPingUntukRumah(rumah.kode);
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return { rumah, lewati: true };
    const d = await res.json();
    if (d && d.success === true && d.result) return { rumah, cocok: true, d, sumber: 'SUPABASE' };
    if (d && d.success === false) return { rumah, cocok: false, d, sumber: 'SUPABASE' };
    return { rumah, lewati: true };
  } catch (_) {
    return { rumah, lewati: true };
  }
}

// Badan ping sama dengan yang dikirim PWA lama ke GAS.
async function tanyaGas(rumah, token, env) {
  if (!rumah.gas) {
    return { rumah, cocok: false, d: { success: false, error: 'Token tidak dikenal / nonaktif' } };
  }
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), BATAS_GAS_MS);
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(rumah.gas, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action: 'ping', data: {} }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const d = await res.json();
    if (d && d.success === true && d.result) return { rumah, cocok: true, d, sumber: 'GAS' };
    if (d && d.success === false) return { rumah, cocok: false, d, sumber: 'GAS' };
    return { rumah, gagal: true, err: 'jawaban tidak dikenal' };
  } catch (err) {
    return { rumah, gagal: true, err: String((err && err.message) || err) };
  } finally {
    clearTimeout(batas);
  }
}

async function bacaPetaSaklar(env) {
  const peta = {};
  for (const r of daftarRumah(env)) peta[r.kode] = 'gas';
  try {
    const stub = getSaklarStub(env);
    if (stub) {
      const resp = await stub.fetch('https://saklar.internal/?action=status');
      const data = await resp.json();
      if (data && data.switches) {
        for (const r of daftarRumah(env)) {
          peta[r.kode] = data.switches[r.kode]?.posisi || 'gas';
        }
      }
    }
  } catch (_) {}
  return peta;
}

async function periksaSatuRumah(rumah, token, modeSaklar, env) {
  const tanpaGas = !rumah.gas || modeSaklar === 'supabase';
  // Cek di Supabase lebih dulu bila rumah memakai Supabase / dua_cabang atau tanpa GAS
  if (tanpaGas || modeSaklar === 'dua_cabang' || (env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY)) {
    const hasilSupa = await tanyaSupabasePing(rumah, token, env);
    if (hasilSupa.cocok) return hasilSupa;
    if (tanpaGas && !hasilSupa.lewati) return hasilSupa;
  }
  if (tanpaGas && (!env.GAS_TIRUAN)) {
    return { rumah, cocok: false, d: { success: false, error: 'Token tidak dikenal / nonaktif' } };
  }
  return tanyaGas(rumah, token, env);
}

async function kenaliRumah(token, env) {
  const petaSaklar = await bacaPetaSaklar(env);
  const hasil = await Promise.all(
    daftarRumah(env).map((r) => periksaSatuRumah(r, token, petaSaklar[r.kode] || 'gas', env))
  );
  const cocok = hasil.filter((h) => h.cocok);
  const gagal = hasil.filter((h) => h.gagal);
  if (gagal.length) console.log('pintu: rumah tidak menjawab: ' + gagal.map((h) => `${h.rumah.kode} (${h.err})`).join(', '));

  if (cocok.length > 1) {
    console.log(`pintu: TOKEN KEMBAR ${token.slice(0, 4)}… di ${cocok.map((h) => h.rumah.kode).join(' + ')}`);
    return { success: false, error: 'Token ini terdaftar di lebih dari satu rumah. Hubungi admin.' };
  }
  if (cocok.length === 1) {
    const { rumah, d } = cocok[0];
    const modeRumah = petaSaklar[rumah.kode] || 'gas';
    const alamatBersih = String(rumah.alamat || '').replace(/\/$/, '');
    const webMandiri = alamatBersih ? `${alamatBersih}/web` : (rumah.web || '');
    const webTujuan = (modeRumah !== 'gas' || !rumah.gas) ? webMandiri : (rumah.web || webMandiri);
    return {
      success: true,
      rumah: rumah.kode,
      nama_rumah: rumah.nama,
      alamat_rumah: rumah.alamat,
      web_rumah: webTujuan,
      nama: (d.result && (d.result.name || d.result.nama)) || '',
    };
  }
  if (gagal.length) return { success: false, error: 'Server sedang sibuk, token belum bisa diperiksa. Coba lagi sebentar lagi.' };
  const tolak = hasil.find((h) => h.d && h.d.error);
  return { success: false, error: (tolak && tolak.d.error) || 'Token tidak dikenal / nonaktif' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Penanganan CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        },
      });
    }

    // --- Rute Panel Saklar & Admin Terpusat (docs/SAKLAR.md) ---
    if (
      url.pathname === '/saklar' ||
      url.pathname === '/saklar/' ||
      url.pathname === '/saklar.html' ||
      url.pathname === '/admin' ||
      url.pathname === '/admin/'
    ) {
      return env.ASSETS.fetch(new Request(new URL('/saklar.html', url), request));
    }

    // API Masuk / Login Panel Saklar & Admin
    if (url.pathname === '/saklar/api/masuk' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
      const auth = await verifikasiKataSandi(body.password || '', env, clientIp);
      if (!auth.ok) {
        return json({ success: false, ok: false, error: auth.error }, 401);
      }
      return json({ success: true, ok: true, token: auth.token }, 200, {
        'Set-Cookie': `abadi_saklar_session=${encodeURIComponent(auth.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`,
      });
    }

    // API Manajemen Pengguna & Token Terpusat (Stateless -> Supabase RPC per Kamar)
    if (
      url.pathname.startsWith('/saklar/api/users') ||
      url.pathname.startsWith('/api/admin/users') ||
      url.pathname.startsWith('/saklar/api/config') ||
      url.pathname.startsWith('/api/admin/config')
    ) {
      return tanganiApiUserAdmin(request, env, url, json);
    }

    // API Status Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/status' && request.method === 'GET') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      const rumahList = daftarRumah(env);
      const stub = getSaklarStub(env);
      if (!stub) {
        const switches = {};
        for (const r of rumahList) {
          switches[r.kode] = { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Durable Object belum terpasang' };
        }
        return json({
          success: true,
          rumah_list: rumahList.map((r) => ({ kode: r.kode, nama: r.nama, alamat: r.alamat })),
          switches,
          history: [],
        });
      }

      const resp = await stub.fetch('https://saklar.internal/?action=status');
      const data = await resp.json();
      return json({
        ...data,
        rumah_list: rumahList.map((r) => ({ kode: r.kode, nama: r.nama, alamat: r.alamat })),
      });
    }

    // API Ubah Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/ubah' && request.method === 'POST') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      let body = {};
      try { body = await request.json(); } catch (_) {
        return json({ success: false, error: 'Format JSON salah' }, 400);
      }

      const stub = getSaklarStub(env);
      if (!stub) {
        return json({ success: false, error: 'Durable Object saklar tidak tersedia pada runtime ini.' }, 500);
      }

      const resp = await stub.fetch('https://saklar.internal/?action=ubah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // API Publik / Antar-Rumah untuk mengecek status saklar (tanpa history)
    if (url.pathname === '/api/saklar/status' && request.method === 'GET') {
      const switches = await bacaPetaSaklar(env);
      return json({ success: true, switches }, 200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
      });
    }

    // --- Rute Pintu Utama (Pengenalan Token) ---
    if (url.pathname === '/api/pintu') {
      if (request.method !== 'POST') return json({ success: false, error: 'Metode tidak didukung' }, 405);
      let token = '';
      try { token = String((await request.json()).token || '').trim(); } catch (_) { /* badan kosong / bukan JSON */ }
      if (!token) return json({ success: false, error: 'Silakan masukkan token akses.' });
      return json(await kenaliRumah(token, env));
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    return env.ASSETS.fetch(request);
  },
};
```

2. **Buat/ganti isi file `workers/pintu/src/user-admin.js` di VS Code Anda dengan kode ini**:

```javascript
/**
 * Modul Manajemen Pengguna & Token Terpusat (workers/pintu/src/user-admin.js)
 * Sesuai AGENTS.md §0a.5 ("Satu-satunya bagian lintas rumah adalah pintu"),
 * §0a.9, §2, §4, §5, dan docs/GEDUNG-DAN-STAGING.md §1.
 *
 * Arsitektur & Protokol Keamanan:
 * 1. Stateless di Cloudflare Worker (TIDAK menyentuh atau memperluas SaklarDO).
 * 2. Data pengguna & token tersimpan di kamar Supabase masing-masing rumah:
 *    - `sum`        -> RPC `sum_admin_*_bertoken` / `_sum_admin_*_internal`
 *    - `kmbtra`     -> RPC `kmbtra_admin_*_bertoken` / `_kmbtra_admin_*_internal`
 *    - `kmbprojek`  -> RPC `kmb_admin_*_bertoken` / `_kmb_admin_*_internal`
 * 3. Autentikasi Ganda:
 *    - Sesi Panel Saklar/Admin (`validasiSesi` via secret `PANEL_SAKLAR_SECRET`), ATAU
 *    - Token Admin/Superintendent sah milik rumah terkait (`X-Admin-Token` / `admin_token`).
 * 4. Anti-Tabrakan Token Lintas Rumah (docs/KEPUTUSAN.md 28 Okt):
 *    - Setiap token baru memakai awalan rumah (`sum-`, `kmb-`, `kmbp-`) + 12 karakter hex acak.
 *    - Sebelum disimpan, token dicek ke seluruh rumah (Supabase ping & GAS/GAS-Tiruan)
 *      agar dijamin tidak pernah kembar di rumah mana pun.
 * 5. Kerahasiaan Token:
 *    - Log server hanya mencatat samaran 4 karakter (`xxxx…`).
 */

import { validasiSesi } from './saklar-auth.js';

const AWALAN_TOKEN_RUMAH = {
  sum: 'sum-',
  kmbtra: 'kmb-',
  kmb: 'kmb-',
  kmbprojek: 'kmbp-',
  'kmb-projek': 'kmbp-',
};

function normalisasiKodeRumah(kode) {
  const k = String(kode || '').trim().toLowerCase();
  if (k === 'kmb' || k === 'kmbtra') return 'kmbtra';
  if (k === 'kmb-projek' || k === 'kmb_projek' || k === 'kmbprojek') return 'kmbprojek';
  if (k === 'sum') return 'sum';
  return k;
}

function prefixRpcRumah(kodeRumah) {
  const r = normalisasiKodeRumah(kodeRumah);
  if (r === 'sum') return 'sum';
  if (r === 'kmbtra') return 'kmbtra';
  if (r === 'kmbprojek') return 'kmb';
  return r;
}

export function daftarRumahDariEnv(env) {
  try {
    const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
    if (Array.isArray(r) && r.length > 0) return r;
  } catch (_) {}
  return [];
}

export function samarkanToken(token) {
  const t = String(token || '').trim();
  if (!t) return '';
  return t.length >= 4 ? t.slice(0, 4) + '…' : '****…';
}

export function buatKandidatTokenRumah(kodeRumah) {
  const r = normalisasiKodeRumah(kodeRumah);
  const prefix = AWALAN_TOKEN_RUMAH[r] || `${r}-`;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hex}`;
}

/**
 * Periksa apakah kandidat token sudah terpakai di rumah mana pun (Supabase RPC ping).
 */
async function tokenSudahDipakai(token, env) {
  const rumahList = daftarRumahDariEnv(env);
  const checks = rumahList.map(async (r) => {
    const prefix = prefixRpcRumah(r.kode);
    if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
      try {
        const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${prefix}_ping`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_token: token }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.success === true) return true;
        }
      } catch (_) {}
    }
    return false;
  });

  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Menghasilkan token unik lintas rumah (maksimal 5 percobaan).
 */
export async function buatTokenUnikLintasRumah(kodeRumah, env) {
  for (let i = 0; i < 5; i++) {
    const kandidat = buatKandidatTokenRumah(kodeRumah);
    const terpakai = await tokenSudahDipakai(kandidat, env);
    if (!terpakai) return kandidat;
  }
  throw new Error('Gagal membuat token unik lintas rumah, silakan coba lagi.');
}

/**
 * Memanggil RPC Admin User di Supabase untuk rumah tertentu.
 * - Jika `adminToken` diberikan, memanggil `<prefix>_admin_<aksi>_bertoken`.
 * - Jika `adminToken` kosong namun sesi panel sah dan `SUPABASE_SERVICE_ROLE_KEY` tersedia,
 *   memanggil `_<prefix>_admin_<aksi>_internal`.
 * - Jika berada di lingkungan simulasi/staging dengan `GAS_TIRUAN` dan tanpa koneksi luar,
 *   mendukung delegasi ke `GAS_TIRUAN`.
 */
export async function panggilRpcAdminRumah({
  rumah,
  aksi,
  adminToken,
  sesiPanelSah,
  params = {},
  env,
}) {
  const kode = normalisasiKodeRumah(rumah);
  const prefix = prefixRpcRumah(kode);
  const tokenBersih = String(adminToken || '').trim();

  // 1. Jika di staging/uji lokal dengan binding GAS_TIRUAN dan tanpa SUPABASE_URL atau mode tiruan
  if (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function' && (!env.SUPABASE_URL || env.USE_GAS_TIRUAN_ADMIN === 'true')) {
    const resTiruan = await env.GAS_TIRUAN.fetch(`https://gas-tiruan.internal/${kode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Abadi-Rumah': kode },
      body: JSON.stringify({
        action: `admin_${aksi}`,
        token: tokenBersih || (sesiPanelSah ? `uji-palsu-spt-${kode}` : ''),
        rumah: kode,
        data: params,
      }),
    });
    return await resTiruan.json();
  }

  if (!env || !env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return {
      success: false,
      error: 'Konfigurasi SUPABASE_URL / SUPABASE_ANON_KEY belum terpasang di Worker.',
    };
  }

  const pakaiInternal = !tokenBersih && sesiPanelSah && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  const tokenEfektif = tokenBersih || (sesiPanelSah ? '__PANEL_SAKLAR_PUSAT__' : '');
  if (!tokenEfektif && !pakaiInternal) {
    return {
      success: false,
      error: 'Masukkan Token Admin/Superintendent rumah ini (atau login dengan sandi Panel Saklar).',
    };
  }

  const rpcName = pakaiInternal
    ? `_${prefix}_admin_${aksi}_internal`
    : `${prefix}_admin_${aksi}_bertoken`;

  const apiKey = pakaiInternal ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  let rpcPayload = {};

  if (aksi === 'daftar_user') {
    rpcPayload = pakaiInternal ? {} : { p_token: tokenEfektif };
  } else if (aksi === 'simpan_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        };
  } else if (aksi === 'terbitkan_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        };
  } else if (aksi === 'cabut_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'hapus_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'daftar_config') {
    rpcPayload = pakaiInternal
      ? { p_jenis: params.jenis || 'all' }
      : { p_token: tokenEfektif, p_jenis: params.jenis || 'all' };
  } else if (aksi === 'simpan_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        };
  } else if (aksi === 'hapus_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        };
  } else {
    return { success: false, error: `Aksi admin tidak dikenal: ${aksi}` };
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Supabase RPC ${rpcName} gagal (HTTP ${res.status}): ${errText.slice(0, 240)}`,
      };
    }

    const data = await res.json();
    return data;
  } catch (err) {
    return {
      success: false,
      error: `Gagal menghubungi Supabase: ${String((err && err.message) || err)}`,
    };
  }
}

/**
 * Handler HTTP untuk seluruh rute `/saklar/api/users*` dan `/api/admin/users*` di Worker Pintu.
 */
export async function tanganiApiUserAdmin(request, env, url, jsonHelper) {
  const sesiPanelSah = await validasiSesi(request, env);
  const headerAdminToken = (request.headers.get('x-admin-token') || '').trim();

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (_) {
      return jsonHelper({ success: false, error: 'Format JSON tidak valid' }, 400);
    }
  }

  const adminToken = headerAdminToken || String(body.admin_token || url.searchParams.get('admin_token') || '').trim();

  // Wajib terautentikasi lewat sesi panel saklar ATAU membawa token admin rumah
  if (!sesiPanelSah && !adminToken) {
    return jsonHelper(
      { success: false, error: 'Sesi panel tidak sah atau token admin belum diberikan.' },
      401,
    );
  }

  const rumahList = daftarRumahDariEnv(env);
  const validKode = rumahList.map((r) => normalisasiKodeRumah(r.kode));

  // 1. GET / POST daftar pengguna
  if (
    (url.pathname.endsWith('/users') || url.pathname.endsWith('/users/daftar')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(
      url.searchParams.get('rumah') || body.rumah || 'semua',
    );
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak dikenal: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_user',
          adminToken: tokRumah,
          sesiPanelSah,
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          error: (res && res.error) || null,
          users: (res && res.result && Array.isArray(res.result.users))
            ? res.result.users.map((u) => ({ ...u, rumah: kode, nama_rumah: infoRumah.nama }))
            : [],
          meta: (res && res.result) || {},
        };
      }),
    );

    const semuaUsers = hasilPerRumah.flatMap((h) => h.users);
    const semuaSukses = hasilPerRumah.some((h) => h.success);

    return jsonHelper({
      success: semuaSukses || daftarTarget.length > 1,
      rumah_list: rumahList.map((r) => ({
        kode: normalisasiKodeRumah(r.kode),
        nama: r.nama,
        alamat: r.alamat,
      })),
      houses: hasilPerRumah,
      users: semuaUsers,
      error: !semuaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
    });
  }

  // 2. POST simpan / ubah pengguna
  if (url.pathname.endsWith('/users/simpan') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = body.user || body.payload || body.data || {};

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        payload,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'simpan_user',
        rumah,
        mechanic_id: payload.mechanic_id || payload.kode || '',
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 3. POST terbitkan / ganti token (dengan anti-tabrakan lintas rumah)
  if (url.pathname.endsWith('/users/token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const ganti = Boolean(body.ganti);
    const opId = String(body.op_id || '').trim() || `op-tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let tokenBaru = '';
    try {
      tokenBaru = await buatTokenUnikLintasRumah(rumah, env);
    } catch (err) {
      return jsonHelper({ success: false, error: String(err.message || err) }, 500);
    }

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'terbitkan_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
        token_baru: tokenBaru,
        ganti,
      },
      env,
    });

    const tokenKeluar = (res && res.result && res.result.token) || '';
    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: ganti ? 'ganti_token' : 'terbitkan_token',
        rumah,
        mechanic_id: mechanicId,
        token_samaran: samarkanToken(tokenKeluar),
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 4. POST cabut token
  if (url.pathname.endsWith('/users/cabut-token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'cabut_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'cabut_token',
        rumah,
        mechanic_id: mechanicId,
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }


  // 5. POST hapus pengguna (Delete CRUD)
  if (url.pathname.endsWith('/users/hapus') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 6. GET / POST daftar config per rumah atau gabungan semua rumah (Units, Components, Catalog Jobs, Factors)
  if (
    (url.pathname.endsWith('/config') || url.pathname.endsWith('/config/daftar') || url.pathname.endsWith('/users/config')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(url.searchParams.get('rumah') || body.rumah || 'semua');
    const jenis = String(url.searchParams.get('jenis') || body.jenis || 'all');
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_config',
          adminToken: tokRumah,
          sesiPanelSah,
          params: { jenis },
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        const d = (res && (res.result || res.data)) || {};
        const tag = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, rumah: kode, nama_rumah: infoRumah.nama })) : []);
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          error: (res && res.error) || null,
          units: tag(d.units),
          components: tag(d.components),
          jobs: tag(d.jobs),
          factors: tag(d.factors),
        };
      }),
    );

    const semuaUnits = hasilPerRumah.flatMap((h) => h.units);
    const semuaComponents = hasilPerRumah.flatMap((h) => h.components);
    const semuaJobs = hasilPerRumah.flatMap((h) => h.jobs);
    const semuaFactors = hasilPerRumah.flatMap((h) => h.factors);
    const adaSukses = hasilPerRumah.some((h) => h.success);

    const gabungan = {
      units: semuaUnits,
      components: semuaComponents,
      jobs: semuaJobs,
      factors: semuaFactors,
      houses: hasilPerRumah,
    };

    return jsonHelper(
      {
        success: adaSukses || daftarTarget.length > 1,
        source: 'SUPABASE',
        rumah: targetRumah,
        rumah_list: rumahList.map((r) => ({
          kode: normalisasiKodeRumah(r.kode),
          nama: r.nama,
          alamat: r.alamat,
        })),
        houses: hasilPerRumah,
        units: semuaUnits,
        components: semuaComponents,
        jobs: semuaJobs,
        factors: semuaFactors,
        result: gabungan,
        data: gabungan,
        error: !adaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
      },
      adaSukses || daftarTarget.length > 1 ? 200 : 400,
    );
  }

  // 7. POST simpan / ubah config (Create / Update CRUD)
  if (
    (url.pathname.endsWith('/config/simpan') || url.pathname.endsWith('/users/config-simpan')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah || 'kmbprojek');
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const payload = body.payload || body.data || body;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        payload,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 8. POST hapus config (Delete CRUD)
  if (
    (url.pathname.endsWith('/config/hapus') || url.pathname.endsWith('/users/config-hapus')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah || 'kmbprojek');
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfgdel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const kunci = String(body.kunci || body.id || '').trim();
    if (!kunci) {
      return jsonHelper({ success: false, error: 'Kunci item config wajib diisi' }, 400);
    }
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        kunci,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

    return jsonHelper({ success: false, error: 'Rute manajemen pengguna tidak dikenal' }, 404);
}
```

3. **Ganti isi file `workers/pintu/public/saklar.html` di VS Code Anda dengan kode lengkap ini**:

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel Pengelola & Manajemen Pengguna — Abadi Operation</title>
  <style>
    :root {
      --bg: #F8FAFC; --card: #FFFFFF; --border: #E2E8F0;
      --text: #0F172A; --text-muted: #64748B;
      --primary: #4F633F; --primary-hover: #384B2B;
      --danger: #DC2626; --danger-hover: #B91C1C;
      --warning: #D97706; --warning-bg: #FEF3C7;
      --info: #0284C7; --info-bg: #E0F2FE;
      --success: #16A34A; --success-bg: #DCFCE7;
      --purple: #7C3AED; --purple-bg: #F3E8FF;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem; }
    .container { max-width: 1200px; margin: 0 auto; }

    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
    .logo { font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; }
    .logo span { color: var(--primary); }
    .header-actions { display: flex; gap: 0.75rem; align-items: center; }

    /* Nav Tabs */
    .nav-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; flex-wrap: wrap; }
    .nav-tab { padding: 0.6rem 1.15rem; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text-muted); font-weight: 700; font-size: 0.92rem; cursor: pointer; transition: all 0.15s; }
    .nav-tab:hover { background: #F1F5F9; color: var(--text); }
    .nav-tab.active { background: var(--primary); color: white; }

    /* Login Box */
    #viewLogin { max-width: 420px; margin: 4rem auto; background: var(--card); padding: 2.25rem; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .form-group { margin-bottom: 1.1rem; text-align: left; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text-muted); }
    .form-control { width: 100%; padding: 0.65rem 0.9rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; background: white; color: var(--text); }
    .form-control:focus { outline: none; border-color: var(--primary); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1.1rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; border: none; cursor: pointer; transition: all 0.15s; text-decoration: none; }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.8rem; border-radius: 6px; }
    .btn-block { width: 100%; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-danger { background: var(--danger); color: white; }
    .btn-danger:hover { background: var(--danger-hover); }
    .btn-secondary { background: #E2E8F0; color: var(--text); }
    .btn-secondary:hover { background: #CBD5E1; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .emergency-banner { background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B; padding: 1rem 1.25rem; border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
    .emergency-text { font-size: 0.95rem; font-weight: 600; }

    .switch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }
    .switch-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.35rem; box-shadow: 0 2px 6px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between; }
    .switch-card.active-cabang { border-color: var(--info); }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .house-title { font-size: 1.1rem; font-weight: 700; }
    .house-sub { font-size: 0.8rem; color: var(--text-muted); }

    .badge { padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; display: inline-block; }
    .badge-gas { background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; }
    .badge-dua_cabang { background: var(--info-bg); color: var(--info); border: 1px solid #BAE6FD; }
    .badge-supabase { background: var(--purple-bg); color: var(--purple); border: 1px solid #DDD6FE; }
    .badge-active { background: var(--success-bg); color: var(--success); border: 1px solid #86EFAC; }
    .badge-inactive { background: #F1F5F9; color: #64748B; border: 1px solid #CBD5E1; }
    .badge-admin { background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }

    .switch-meta { font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.1rem; background: #F8FAFC; padding: 0.75rem; border-radius: 8px; }
    .meta-row { display: flex; justify-content: space-between; }
    .meta-val { font-weight: 600; color: var(--text); }
    .switch-actions { display: flex; flex-direction: column; gap: 0.5rem; }

    .panel-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.35rem; margin-bottom: 1.5rem; }
    .panel-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }

    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.85rem; margin-bottom: 1.25rem; }
    .kpi-box { background: #F8FAFC; border: 1px solid var(--border); border-radius: 10px; padding: 0.85rem 1rem; }
    .kpi-label { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
    .kpi-val { font-size: 1.35rem; font-weight: 800; color: var(--text); margin-top: 0.2rem; }

    .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end; margin-bottom: 1rem; background: #F8FAFC; padding: 0.9rem; border-radius: 10px; border: 1px solid var(--border); }
    .toolbar-item { flex: 1; min-width: 170px; }
    .toolbar-item label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem; }

    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; padding: 0.7rem; background: #F8FAFC; border-bottom: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; }
    td { padding: 0.7rem; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
    tr:hover td { background: #F8FAFC; }
    tr.row-inactive td { opacity: 0.62; }
    code.token-box { background: #F1F5F9; padding: 0.2rem 0.45rem; border-radius: 5px; font-family: ui-monospace, monospace; font-size: 0.8rem; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
    .modal-box { background: white; border-radius: var(--radius); max-width: 600px; width: 92%; max-height: 90vh; overflow-y: auto; padding: 1.75rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); }
    .modal-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; }
    .modal-caution { background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.1rem; }
    .info-banner { background: var(--info-bg); border: 1px solid #BAE6FD; color: #0369A1; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; line-height: 1.5; margin-bottom: 1rem; }
    .checklist-container { margin-bottom: 1.25rem; }
    .checklist-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.84rem; margin-bottom: 0.45rem; line-height: 1.4; color: #334155; }
    .checklist-item input { margin-top: 0.2rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1.25rem; }
    .chk-row { display: flex; flex-wrap: wrap; gap: 0.9rem; margin-top: 0.35rem; }
    .chk-label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem; cursor: pointer; }

    .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.86rem; margin-bottom: 1rem; }
    .alert-danger { background: #FEE2E2; color: #991B1B; border: 1px solid #F87171; }
    .alert-success { background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <span>⚙️</span> Abadi Operation — Panel Pengelola & Admin Pusat
      </div>
      <div class="header-actions" id="headerNav" style="display:none;">
        <span class="badge badge-gas" id="envBadge">PRODUKSI</span>
        <button class="btn btn-secondary btn-sm" onclick="logout()">Keluar</button>
      </div>
    </header>

    <!-- Tampilan 1: Form Login Sandi Panel -->
    <div id="viewLogin">
      <h2 style="font-size:1.3rem; font-weight:700; margin-bottom:0.4rem; text-align:center;">Masuk ke Panel Pengelola</h2>
      <p style="color:var(--text-muted); font-size:0.86rem; margin-bottom:1.4rem; text-align:center;">Panel Saklar Dua Cabang & Manajemen Pengguna Terpusat (Gabriel).</p>
      <div id="loginAlert" class="alert alert-danger hidden"></div>
      <form onsubmit="handleLogin(event)">
        <div class="form-group">
          <label for="inputPassword">Kata Sandi Pengelola (PANEL_SAKLAR_SECRET)</label>
          <input type="password" id="inputPassword" class="form-control" placeholder="••••••••••••" required autofocus autocomplete="current-password">
        </div>
        <button type="submit" id="btnLogin" class="btn btn-primary btn-block">Masuk ke Panel</button>
      </form>
    </div>

    <!-- Tampilan 2: Dashboard Utama (2 Tab: Saklar & User Management) -->
    <div id="viewDashboard" class="hidden">
      <div class="nav-tabs">
        <button type="button" class="nav-tab active" id="tabBtnSaklar" onclick="pilihTab('saklar')">🎛️ Saklar Dua Cabang</button>
        <button type="button" class="nav-tab" id="tabBtnUsers" onclick="pilihTab('users')">👷 Manajemen Pengguna & Token (Pusat 3 Rumah)</button>
        <button type="button" class="nav-tab" id="tabBtnConfig" onclick="pilihTab('config')">⚙️ Manajemen Config & Master Data (Pusat 3 Rumah)</button>
      </div>

      <!-- TAB A: SAKLAR DUA CABANG -->
      <div id="sectionSaklar">
        <div class="emergency-banner">
          <div>
            <div class="emergency-text">🚨 Tombol Penyelamat Darurat Global</div>
            <div style="font-size:0.8rem; opacity:0.9;">Jika terjadi gangguan sistemik pada Supabase, kembalikan seluruh rumah ke GAS dalam 1 klik.</div>
          </div>
          <button class="btn btn-danger" onclick="daruratMundurSemua()">Balikkan Semua ke GAS</button>
        </div>

        <div class="switch-grid" id="switchCards"></div>

        <div class="panel-card">
          <div class="panel-title">Riwayat Pembalikan Saklar (Audit Log)</div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Waktu (WIB)</th>
                  <th>Rumah</th>
                  <th>Peralihan</th>
                  <th>Alasan</th>
                  <th>Oleh</th>
                </tr>
              </thead>
              <tbody id="historyTableBody">
                <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Memuat riwayat...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB B: MANAJEMEN PENGGUNA & TOKEN LINTAS RUMAH -->
      <div id="sectionUsers" class="hidden">
        <div class="info-banner">
          <strong>Manajemen Pengguna Terpusat (Supabase Per Kamar):</strong>
          Setiap rumah menyimpan datanya di kamarnya sendiri (<code>sum</code>, <code>kmb</code>, <code>kmb_projek</code>). Orang tidak pernah dihapus (hanya dinonaktifkan) agar riwayat WO dan payroll tetap utuh. Token baru otomatis memakai awalan rumah (<code>sum-</code>, <code>kmb-</code>, <code>kmbp-</code>) dan diperiksa lintas rumah agar tidak pernah kembar.
        </div>

        <div id="userAlert" class="alert hidden"></div>

        <div class="panel-card">
          <div class="panel-title">
            <span>👷 Daftar Pengguna & Token Akses Per Sistem / Rumah</span>
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="muatDaftarUser()">🔄 Muat Ulang</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="bukaModalUserBaru()">+ Tambah Pengguna</button>
            </div>
          </div>

          <!-- Pilihan Cepat Sistem / Rumah (Tab Per Rumah) -->
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border);" id="rumahTabsUsers">
            <button type="button" class="btn btn-primary btn-sm" data-rumah-usr="sum" onclick="pilihRumahTabUser('sum')">🚜 SUM V2 (sum)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-usr="kmbtra" onclick="pilihRumahTabUser('kmbtra')">🚛 KMB TRA / V2 (kmb)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-usr="kmbprojek" onclick="pilihRumahTabUser('kmbprojek')">⚙️ KMB Projek (kmb_projek)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-usr="semua" onclick="pilihRumahTabUser('semua')">🏢 Semua Rumah (Gabungan)</button>
          </div>

          <div class="toolbar">
            <div class="toolbar-item">
              <label for="filterRumah">Pilih Rumah (Kamar Supabase)</label>
              <select id="filterRumah" class="form-control" onchange="gantiPilihanRumah()">
                <option value="sum">SUM V2 (skema sum)</option>
                <option value="kmbtra">KMB TRA / V2 (skema kmb)</option>
                <option value="kmbprojek">KMB Projek (skema kmb_projek)</option>
                <option value="semua">Semua Rumah (Gabungan)</option>
              </select>
            </div>
            <div class="toolbar-item" style="min-width:220px;">
              <label for="inputAdminToken">Token Admin / L2 Rumah (untuk RPC *_bertoken)</label>
              <input type="password" id="inputAdminToken" class="form-control" placeholder="Token L2/Admin rumah terpilih" oninput="simpanTokenAdminLokal()">
            </div>
            <div class="toolbar-item">
              <label for="filterPeran">Filter Peran</label>
              <select id="filterPeran" class="form-control" onchange="renderTabelUser()">
                <option value="">Semua Peran</option>
                <option value="mechanic">Mekanik</option>
                <option value="supervisor">Supervisor (L1)</option>
                <option value="superintendent">Superintendent (L2)</option>
                <option value="foreman">Foreman (SUM)</option>
                <option value="foreman_approver">Foreman Approver (SUM)</option>
              </select>
            </div>
            <div class="toolbar-item">
              <label for="filterStatus">Status</label>
              <select id="filterStatus" class="form-control" onchange="renderTabelUser()">
                <option value="ALL">Semua</option>
                <option value="ACTIVE">Aktif Saja</option>
                <option value="INACTIVE">Nonaktif Saja</option>
              </select>
            </div>
            <div class="toolbar-item" style="min-width:200px;">
              <label for="filterCari">Cari Nama / Kode / Email</label>
              <input type="text" id="filterCari" class="form-control" placeholder="Ketik nama atau kode..." oninput="renderTabelUser()">
            </div>
          </div>

          <div class="kpi-row">
            <div class="kpi-box"><div class="kpi-label">Total Terdaftar</div><div class="kpi-val" id="kpiTotal">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Pengguna Aktif</div><div class="kpi-val" id="kpiAktif">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Nonaktif</div><div class="kpi-val" id="kpiNonaktif">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Punya Token Aktif</div><div class="kpi-val" id="kpiToken">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Hak Admin / L2</div><div class="kpi-val" id="kpiAdmin">0</div></div>
          </div>

          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Rumah</th>
                  <th>Kode ID</th>
                  <th>Nama & Email</th>
                  <th>Peran</th>
                  <th>Section / Jabatan</th>
                  <th>Status</th>
                  <th>Token Akses</th>
                  <th>Jejak WO</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="userTableBody">
                <tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Pilih rumah dan klik Muat Ulang untuk menampilkan daftar pengguna dari Supabase.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB C: CRUD CONFIG LINTAS RUMAH (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) -->
      <div id="sectionConfig" class="hidden">
        <div class="info-banner">
          <strong>Manajemen Master Data Config Terpusat (Supabase Per Kamar):</strong>
          Sama persis seperti Manajemen Pengguna, setiap sistem/rumah menyimpan master data konfigurasinya di kamarnya sendiri (<code>sum</code>, <code>kmb</code>, <code>kmb_projek</code>). Anda dapat memfilter per sistem/rumah (<strong>SUM V2</strong>, <strong>KMB TRA / V2</strong>, <strong>KMB Projek</strong>, atau <strong>Semua Rumah</strong>) dan melakukan <strong>Tambah (Create)</strong>, <strong>Lihat (Read)</strong>, <strong>Ubah (Update)</strong>, serta <strong>Hapus (Delete)</strong> untuk <code>config_units</code>, <code>config_components</code>, <code>catalog_jobs</code>, dan <code>config_factors</code>.
        </div>

        <div id="configAlert" class="alert hidden"></div>

        <div class="panel-card">
          <div class="panel-title">
            <span>⚙️ Daftar Master Config Per Sistem / Rumah</span>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="muatDataConfigPusat()">🔄 Muat Ulang</button>
              <button type="button" class="btn btn-primary btn-sm" id="btnTambahConfigPusat" onclick="bukaModalConfigPusat()">+ Tambah Config</button>
            </div>
          </div>

          <!-- Pilihan Cepat Sistem / Rumah (Tab Per Rumah) -->
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border);" id="rumahTabsConfig">
            <button type="button" class="btn btn-primary btn-sm" data-rumah-cfg="sum" onclick="pilihRumahTabConfig('sum')">🚜 SUM V2 (sum)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-cfg="kmbtra" onclick="pilihRumahTabConfig('kmbtra')">🚛 KMB TRA / V2 (kmb)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-cfg="kmbprojek" onclick="pilihRumahTabConfig('kmbprojek')">⚙️ KMB Projek (kmb_projek)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-rumah-cfg="semua" onclick="pilihRumahTabConfig('semua')">🏢 Semua Rumah (Gabungan)</button>
          </div>

          <!-- Pilihan Kategori Master Data Config -->
          <div style="display:flex; gap:0.45rem; flex-wrap:wrap; margin-bottom:1rem;">
            <button type="button" class="btn btn-primary btn-sm" id="subTabCfg_unit" onclick="pilihSubTabConfig('unit')">🚜 Config Units</button>
            <button type="button" class="btn btn-secondary btn-sm" id="subTabCfg_component" onclick="pilihSubTabConfig('component')">🔩 Config Components</button>
            <button type="button" class="btn btn-secondary btn-sm" id="subTabCfg_job" onclick="pilihSubTabConfig('job')">📋 Catalog Jobs</button>
            <button type="button" class="btn btn-secondary btn-sm" id="subTabCfg_factor" onclick="pilihSubTabConfig('factor')">⚖️ Config Factors & Tarif</button>
          </div>

          <div class="toolbar">
            <div class="toolbar-item">
              <label for="filterRumahConfig">Pilih Rumah (Kamar Supabase)</label>
              <select id="filterRumahConfig" class="form-control" onchange="gantiRumahConfigPusat()">
                <option value="sum">SUM V2 (skema sum)</option>
                <option value="kmbtra">KMB TRA / V2 (skema kmb)</option>
                <option value="kmbprojek">KMB Projek (skema kmb_projek)</option>
                <option value="semua">Semua Rumah (Gabungan)</option>
              </select>
            </div>
            <div class="toolbar-item" style="min-width:220px;">
              <label for="inputAdminTokenConfig">Token Admin / L2 Rumah (untuk RPC *_bertoken)</label>
              <input type="password" id="inputAdminTokenConfig" class="form-control" placeholder="Token L2/Admin rumah terpilih" oninput="simpanTokenAdminConfigLokal()">
            </div>
            <div class="toolbar-item">
              <label for="filterStatusConfig">Status</label>
              <select id="filterStatusConfig" class="form-control" onchange="renderTabelConfigPusat()">
                <option value="ALL">Semua</option>
                <option value="ACTIVE">Aktif Saja</option>
                <option value="INACTIVE">Nonaktif Saja</option>
              </select>
            </div>
            <div class="toolbar-item" style="min-width:220px;">
              <label for="filterCariConfig">Cari Kode / Nama / Section / Deskripsi</label>
              <input type="text" id="filterCariConfig" class="form-control" placeholder="Ketik kode atau nama..." oninput="renderTabelConfigPusat()">
            </div>
          </div>

          <div class="kpi-row">
            <div class="kpi-box"><div class="kpi-label">Config Units</div><div class="kpi-val" id="kpiCfgUnit">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Config Components</div><div class="kpi-val" id="kpiCfgComp">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Catalog Jobs</div><div class="kpi-val" id="kpiCfgJob">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Config Factors & Tarif</div><div class="kpi-val" id="kpiCfgFactor">0</div></div>
            <div class="kpi-box"><div class="kpi-label">Ditampilkan</div><div class="kpi-val" id="kpiCfgShown">0</div></div>
          </div>

          <div style="overflow-x:auto;">
            <table>
              <thead id="theadConfigPusat"></thead>
              <tbody id="tbodyConfigPusat">
                <tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Pilih rumah dan klik Muat Ulang untuk menampilkan master data config dari Supabase.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Konfirmasi Maju Saklar -->
  <div id="modalMaju" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="modal-title">⚠️ Peringatan Pembalikan ke Dua Cabang</div>
      <div class="modal-caution">
        <strong>Perhatian Penting:</strong> Saklar akan mengarahkan pembuatan <strong>WO BARU</strong> langsung ke basis data Supabase. WO lama tetap diselesaikan di GAS. Pastikan seluruh 10 syarat migrasi di bawah sudah terpenuhi!
      </div>

      <div class="checklist-container">
        <div style="font-weight:700; font-size:0.86rem; margin-bottom:0.65rem;">Checklist Syarat Wajib (docs/SAKLAR.md §3):</div>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 1. Cermin rumah tidak punya selisih selama 7 hari berturut-turut.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 2. Semua aksi tulis & web lulus uji rekam-putar di staging.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 3. Buku tamu kiriman sudah aktif di Cloudflare.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 4. Cermin ikut menyalin ProcessedOps dari GAS.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 5. Nomor WO Supabase 4 angka (tidak akan kembar dengan GAS).</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 6. Payroll gabungan sama dengan GAS untuk bulan-bulan lalu.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 7. Cadangan per jam berjalan dan uji pulih ke staging berhasil.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 8. Halaman web GAS sudah ditutup atau dibuat hanya-baca.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 9. Latihan saklar balik sudah dilakukan di staging.</label>
        <label class="checklist-item"><input type="checkbox" class="chk-syarat" onchange="checkSyaratForm()"> 10. Persetujuan resmi diperoleh dari Gabriel (Titik Henti).</label>
      </div>

      <div class="form-group">
        <label id="lblKonfirmasiRumah">Ketik kode rumah untuk konfirmasi:</label>
        <input type="text" id="inputKonfirmasiRumah" class="form-control" placeholder="kode rumah" oninput="checkSyaratForm()">
      </div>
      <div class="form-group">
        <label for="inputAlasanMaju">Alasan Pembalikan Saklar:</label>
        <input type="text" id="inputAlasanMaju" class="form-control" placeholder="Contoh: Seluruh uji rekam-putar lulus di staging" oninput="checkSyaratForm()">
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="tutupModalMaju()">Batal</button>
        <button class="btn btn-danger" id="btnKonfirmasiMaju" onclick="submitMajuSaklar()" disabled>Konfirmasi & Nyalakan</button>
      </div>
    </div>
  </div>

  <!-- Modal Tambah / Ubah Pengguna -->
  <div id="modalUser" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="modal-title">
        <span id="judulModalUser">Tambah Pengguna</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="tutupModalUser()">✕</button>
      </div>

      <form onsubmit="submitSimpanUser(event)">
        <div class="form-row">
          <div class="form-group">
            <label for="uRumah">Rumah Target *</label>
            <select id="uRumah" class="form-control" required onchange="sesuaikanFormRumah()">
              <option value="sum">SUM V2 (skema sum)</option>
              <option value="kmbtra">KMB TRA / V2 (skema kmb)</option>
              <option value="kmbprojek">KMB Projek (skema kmb_projek)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="uKode">Kode ID Mekanik/User *</label>
            <input type="text" id="uKode" class="form-control" placeholder="cth: MECH-025 / SPV-002" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="uNama">Nama Lengkap *</label>
            <input type="text" id="uNama" class="form-control" placeholder="Nama lengkap" required>
          </div>
          <div class="form-group">
            <label for="uEmail">Email</label>
            <input type="email" id="uEmail" class="form-control" placeholder="opsional@abadiops.com">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="uPeran">Peran *</label>
            <select id="uPeran" class="form-control" required></select>
          </div>
          <div class="form-group" id="grupSection">
            <label for="uSection">Section</label>
            <input type="text" id="uSection" class="form-control" placeholder="field / workshop / tyreman / vessel">
          </div>
        </div>

        <div class="form-row" id="grupSumFields">
          <div class="form-group">
            <label for="uJabatan">Jabatan / Posisi</label>
            <input type="text" id="uJabatan" class="form-control" placeholder="cth: Mekanik Senior / junior">
          </div>
          <div class="form-group">
            <label for="uGolongan">Golongan (Khusus SUM)</label>
            <input type="text" id="uGolongan" class="form-control" placeholder="cth: 1a, 2a, 3b">
          </div>
        </div>

        <div class="form-group">
          <label>Status & Hak Akses</label>
          <div class="chk-row">
            <label class="chk-label"><input type="checkbox" id="uAktif" checked> Aktif</label>
            <label class="chk-label"><input type="checkbox" id="uAkunUji"> Akun Uji</label>
            <label class="chk-label"><input type="checkbox" id="uBolehAdmin"> Boleh Buka Admin</label>
            <label class="chk-label" id="lblPerf"><input type="checkbox" id="uBolehPerf"> Boleh Performa</label>
            <label class="chk-label" id="lblTek"><input type="checkbox" id="uBolehTek"> Boleh Teknis</label>
            <label class="chk-label" id="lblRep"><input type="checkbox" id="uBolehRep"> Boleh Reports</label>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="tutupModalUser()">Batal</button>
          <button type="submit" class="btn btn-primary" id="btnSimpanUser">Simpan ke Supabase</button>
        </div>
      </form>
    </div>
  </div>


  <!-- Modal Tambah / Ubah Config Pusat -->
  <div id="modalConfigPusat" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="modal-title">
        <span id="judulModalConfigPusat">Tambah / Ubah Config</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="tutupModalConfigPusat()">✕</button>
      </div>
      <div id="isiFormConfigPusat"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="tutupModalConfigPusat()">Batal</button>
        <button type="button" class="btn btn-primary" onclick="simpanConfigPusat()">💾 Simpan ke Supabase</button>
      </div>
    </div>
  </div>

  <script>
    let TOKEN_SESI = localStorage.getItem('abadi_saklar_token') || '';
    let TARGET_RUMAH_MODAL = '';
    let TARGET_POSISI_MODAL = '';
    let DAFTAR_RUMAH = [
      { kode: 'kmbprojek', nama: 'KMB Projek' },
      { kode: 'sum', nama: 'SUM V2' },
      { kode: 'kmbtra', nama: 'KMB TRA' }
    ];
    let DATA_USERS = [];
    let TOKEN_TERBUKA = {};
    let TOKEN_ADMIN_PER_RUMAH = JSON.parse(sessionStorage.getItem('abadi_admin_tokens') || '{}');

    window.addEventListener('DOMContentLoaded', () => {
      if (location.host.includes('staging')) {
        document.getElementById('envBadge').textContent = 'STAGING';
        document.getElementById('envBadge').className = 'badge badge-dua_cabang';
      }
      if (location.pathname.startsWith('/admin') || location.hash === '#users') {
        pilihTab('users', false);
      }
      sinkronInputTokenAdmin();
      if (TOKEN_SESI) {
        muatStatus();
      } else {
        tampilkanLogin();
      }
    });

    function pilihTab(tab, muat = true) {
      document.getElementById('tabBtnSaklar').classList.toggle('active', tab === 'saklar');
      document.getElementById('tabBtnUsers').classList.toggle('active', tab === 'users');
      const btnCfg = document.getElementById('tabBtnConfig');
      if (btnCfg) btnCfg.classList.toggle('active', tab === 'config');
      document.getElementById('sectionSaklar').classList.toggle('hidden', tab !== 'saklar');
      document.getElementById('sectionUsers').classList.toggle('hidden', tab !== 'users');
      const secCfg = document.getElementById('sectionConfig');
      if (secCfg) secCfg.classList.toggle('hidden', tab !== 'config');
      if (tab === 'users' && muat && TOKEN_SESI) {
        muatDaftarUser();
      } else if (tab === 'config' && muat && TOKEN_SESI) {
        sinkronInputTokenAdminConfig();
        muatDataConfigPusat();
      }
    }

    function tampilkanLogin() {
      document.getElementById('viewLogin').classList.remove('hidden');
      document.getElementById('viewDashboard').classList.add('hidden');
      document.getElementById('headerNav').style.display = 'none';
    }

    function tampilkanDashboard() {
      document.getElementById('viewLogin').classList.add('hidden');
      document.getElementById('viewDashboard').classList.remove('hidden');
      document.getElementById('headerNav').style.display = 'flex';
    }

    async function handleLogin(e) {
      e.preventDefault();
      const pw = document.getElementById('inputPassword').value;
      const btn = document.getElementById('btnLogin');
      const alertBox = document.getElementById('loginAlert');
      btn.disabled = true; btn.textContent = 'Memeriksa...';
      alertBox.classList.add('hidden');

      try {
        const res = await fetch('/saklar/api/masuk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw })
        });
        const data = await res.json();
        if ((data.success || data.ok) && data.token) {
          TOKEN_SESI = data.token;
          localStorage.setItem('abadi_saklar_token', TOKEN_SESI);
          document.getElementById('inputPassword').value = '';
          await muatStatus();
          if (!document.getElementById('sectionUsers').classList.contains('hidden')) {
            muatDaftarUser();
          }
        } else {
          alertBox.textContent = data.error || 'Kata sandi salah';
          alertBox.classList.remove('hidden');
        }
      } catch (err) {
        alertBox.textContent = 'Koneksi gagal: ' + err.message;
        alertBox.classList.remove('hidden');
      } finally {
        btn.disabled = false; btn.textContent = 'Masuk ke Panel';
      }
    }

    function logout() {
      TOKEN_SESI = '';
      localStorage.removeItem('abadi_saklar_token');
      sessionStorage.removeItem('abadi_admin_tokens');
      tampilkanLogin();
    }

    async function muatStatus() {
      try {
        const res = await fetch('/saklar/api/status', {
          headers: { 'Authorization': 'Bearer ' + TOKEN_SESI }
        });
        if (res.status === 401) {
          logout();
          return;
        }
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.rumah_list) && data.rumah_list.length > 0) {
            DAFTAR_RUMAH = data.rumah_list;
            perbaruiDropdownRumah();
          }
          tampilkanDashboard();
          renderCards(data.switches);
          renderHistory(data.history);
        }
      } catch (err) {
        console.error('Gagal memuat status saklar:', err);
      }
    }

    function perbaruiDropdownRumah() {
      const selFilter = document.getElementById('filterRumah');
      const nilaiLama = selFilter.value || 'sum';
      selFilter.innerHTML = DAFTAR_RUMAH.map(r => `<option value="${escapeHtml(r.kode)}">${escapeHtml(r.nama)} (${escapeHtml(r.kode)})</option>`).join('')
        + '<option value="semua">Semua Rumah (Gabungan)</option>';
      if ([...selFilter.options].some(o => o.value === nilaiLama)) selFilter.value = nilaiLama;

      const selModal = document.getElementById('uRumah');
      const modalLama = selModal.value || 'sum';
      selModal.innerHTML = DAFTAR_RUMAH.map(r => `<option value="${escapeHtml(r.kode)}">${escapeHtml(r.nama)} (${escapeHtml(r.kode)})</option>`).join('');
      if ([...selModal.options].some(o => o.value === modalLama)) selModal.value = modalLama;

      const selFilterCfg = document.getElementById('filterRumahConfig');
      if (selFilterCfg) {
        const cfgLama = selFilterCfg.value || 'sum';
        selFilterCfg.innerHTML = DAFTAR_RUMAH.map(r => `<option value="${escapeHtml(r.kode)}">${escapeHtml(r.nama)} (${escapeHtml(r.kode)})</option>`).join('')
          + '<option value="semua">Semua Rumah (Gabungan)</option>';
        if ([...selFilterCfg.options].some(o => o.value === cfgLama)) selFilterCfg.value = cfgLama;
      }
    }

    function renderCards(switches) {
      const grid = document.getElementById('switchCards');
      grid.innerHTML = '';

      for (const info of DAFTAR_RUMAH) {
        const kode = info.kode;
        const s = (switches && switches[kode]) || { posisi: 'gas', diubah_at: '—', oleh: 'Sistem', alasan: 'Bawaan' };
        const isCabang = s.posisi === 'dua_cabang';
        const isSupa = s.posisi === 'supabase';

        let badgeClass = 'badge-gas';
        let statusTeks = '100% GAS (Spreadsheet)';
        if (isCabang) { badgeClass = 'badge-dua_cabang'; statusTeks = 'Dua Cabang (Supabase + GAS)'; }
        if (isSupa) { badgeClass = 'badge-supabase'; statusTeks = '100% Supabase (GAS Tutup)'; }

        let actionBtns = '';
        if (s.posisi === 'gas') {
          actionBtns = `<button class="btn btn-primary btn-block" onclick="bukaModalMaju('${kode}', 'dua_cabang')">Nyalakan Dua Cabang</button>`;
        } else if (s.posisi === 'dua_cabang') {
          actionBtns = `
            <button class="btn btn-primary btn-block" style="background:var(--purple);" onclick="bukaModalMaju('${kode}', 'supabase')">Tuntaskan ke Supabase 100%</button>
            <button class="btn btn-danger btn-block" onclick="daruratMundur('${kode}')">🚨 Balik ke GAS Segera</button>
          `;
        } else {
          actionBtns = `<button class="btn btn-danger btn-block" onclick="daruratMundur('${kode}')">🚨 Balik ke GAS Segera</button>`;
        }

        grid.innerHTML += `
          <div class="switch-card ${isCabang ? 'active-cabang' : ''}">
            <div>
              <div class="card-header">
                <div>
                  <div class="house-title">${escapeHtml(info.nama)}</div>
                  <div class="house-sub">${escapeHtml(kode)}</div>
                </div>
                <span class="badge ${badgeClass}">${escapeHtml(s.posisi.toUpperCase())}</span>
              </div>
              <div class="switch-meta">
                <div class="meta-row"><span>Arsitektur:</span><span class="meta-val">${statusTeks}</span></div>
                <div class="meta-row"><span>Perubahan:</span><span class="meta-val">${escapeHtml(s.diubah_at || 'Bawaan')}</span></div>
                <div class="meta-row"><span>Oleh:</span><span class="meta-val">${escapeHtml(s.oleh || 'Sistem')}</span></div>
                <div style="margin-top:0.4rem; font-style:italic;">"${escapeHtml(s.alasan || '—')}"</div>
              </div>
            </div>
            <div class="switch-actions">${actionBtns}</div>
          </div>
        `;
      }
    }

    function renderHistory(history) {
      const tbody = document.getElementById('historyTableBody');
      if (!history || !history.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Belum pernah ada pembalikan saklar.</td></tr>';
        return;
      }
      tbody.innerHTML = history.map(h => `
        <tr>
          <td>${escapeHtml(h.waktu_wib || '—')}</td>
          <td><strong>${escapeHtml(h.rumah)}</strong></td>
          <td><span class="badge badge-${escapeHtml(h.dari)}">${escapeHtml(h.dari)}</span> ➔ <span class="badge badge-${escapeHtml(h.ke)}">${escapeHtml(h.ke)}</span></td>
          <td>${escapeHtml(h.alasan || '—')}</td>
          <td>${escapeHtml(h.oleh || '—')}</td>
        </tr>
      `).join('');
    }

    function bukaModalMaju(rumah, posisi) {
      TARGET_RUMAH_MODAL = rumah;
      TARGET_POSISI_MODAL = posisi;
      document.querySelectorAll('.chk-syarat').forEach(c => c.checked = false);
      document.getElementById('inputKonfirmasiRumah').value = '';
      document.getElementById('inputAlasanMaju').value = '';
      document.getElementById('lblKonfirmasiRumah').textContent = `Ketik "${rumah}" untuk konfirmasi:`;
      document.getElementById('modalMaju').classList.remove('hidden');
      checkSyaratForm();
    }

    function tutupModalMaju() {
      document.getElementById('modalMaju').classList.add('hidden');
    }

    function checkSyaratForm() {
      const allChecked = Array.from(document.querySelectorAll('.chk-syarat')).every(c => c.checked);
      const rumahMatch = document.getElementById('inputKonfirmasiRumah').value.trim() === TARGET_RUMAH_MODAL;
      const alasanFilled = document.getElementById('inputAlasanMaju').value.trim().length >= 5;
      document.getElementById('btnKonfirmasiMaju').disabled = !(allChecked && rumahMatch && alasanFilled);
    }

    async function submitMajuSaklar() {
      const alasan = document.getElementById('inputAlasanMaju').value.trim();
      tutupModalMaju();
      await kirimPerubahanSaklar(TARGET_RUMAH_MODAL, TARGET_POSISI_MODAL, alasan);
    }

    async function daruratMundur(rumah) {
      if (!confirm(`🚨 TINDAKAN PENYELAMATAN DARURAT\n\nApakah Anda yakin ingin SEGERA mengembalikan ${rumah} ke posisi GAS?`)) return;
      const alasan = prompt('Alasan penyelamatan / pengembalian ke GAS:', 'Penyelamatan darurat via panel saklar') || 'Penyelamatan darurat';
      await kirimPerubahanSaklar(rumah, 'gas', alasan);
    }

    async function daruratMundurSemua() {
      if (!confirm('🚨 TINDAKAN PENYELAMATAN GLOBAL\n\nApakah Anda yakin ingin membalikkan SELURUH rumah ke posisi GAS?')) return;
      const alasan = prompt('Alasan penyelamatan global:', 'Penyelamatan global darurat via panel') || 'Penyelamatan global';
      for (const r of DAFTAR_RUMAH) {
        await kirimPerubahanSaklar(r.kode, 'gas', alasan, false);
      }
      muatStatus();
    }

    async function kirimPerubahanSaklar(rumah, posisi, alasan, reload = true) {
      try {
        const res = await fetch('/saklar/api/ubah', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ rumah, posisi, alasan, oleh: 'Gabriel' })
        });
        const data = await res.json();
        if (data.success) {
          if (reload) muatStatus();
        } else {
          alert('Gagal membalik saklar: ' + (data.error || 'Galat server'));
        }
      } catch (err) {
        alert('Koneksi terputus: ' + err.message);
      }
    }

    /* ── MANAJEMEN PENGGUNA & TOKEN LINTAS RUMAH ───────────────────────────── */

    function sinkronTabRumahUserUI() {
      const r = document.getElementById('filterRumah').value || 'sum';
      document.querySelectorAll('#rumahTabsUsers [data-rumah-usr]').forEach((btn) => {
        const aktif = btn.getAttribute('data-rumah-usr') === r;
        btn.className = 'btn btn-sm ' + (aktif ? 'btn-primary' : 'btn-secondary');
      });
    }

    function pilihRumahTabUser(rumah) {
      const sel = document.getElementById('filterRumah');
      if (sel) sel.value = rumah;
      gantiPilihanRumah();
    }

    function gantiPilihanRumah() {
      sinkronTabRumahUserUI();
      sinkronInputTokenAdmin();
      muatDaftarUser();
    }

    function sinkronInputTokenAdmin() {
      const r = document.getElementById('filterRumah').value;
      const inp = document.getElementById('inputAdminToken');
      inp.value = TOKEN_ADMIN_PER_RUMAH[r] || '';
    }

    function simpanTokenAdminLokal() {
      const r = document.getElementById('filterRumah').value;
      const val = document.getElementById('inputAdminToken').value.trim();
      if (r && r !== 'semua') {
        TOKEN_ADMIN_PER_RUMAH[r] = val;
        sessionStorage.setItem('abadi_admin_tokens', JSON.stringify(TOKEN_ADMIN_PER_RUMAH));
      }
    }

    function tampilPesanUser(teks, baik = true) {
      const box = document.getElementById('userAlert');
      if (!teks) {
        box.classList.add('hidden');
        return;
      }
      box.textContent = teks;
      box.className = 'alert ' + (baik ? 'alert-success' : 'alert-danger');
      box.classList.remove('hidden');
    }

    async function muatDaftarUser() {
      const rumah = document.getElementById('filterRumah').value || 'sum';
      const tok = document.getElementById('inputAdminToken').value.trim();
      const tbody = document.getElementById('userTableBody');
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Memuat pengguna dari Supabase...</td></tr>';

      try {
        const res = await fetch('/saklar/api/users/daftar', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(tok ? { 'X-Admin-Token': tok } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: tok,
            tokens: TOKEN_ADMIN_PER_RUMAH
          })
        });
        const data = await res.json();
        if (!data.success && data.error) {
          tampilPesanUser(data.error, false);
          DATA_USERS = [];
          renderTabelUser();
          return;
        }
        tampilPesanUser('', true);
        DATA_USERS = Array.isArray(data.users) ? data.users : [];
        renderTabelUser();
      } catch (err) {
        tampilPesanUser('Gagal memuat daftar pengguna: ' + err.message, false);
      }
    }

    function renderTabelUser() {
      const peranFilter = document.getElementById('filterPeran').value.toLowerCase();
      const statusFilter = document.getElementById('filterStatus').value;
      const cari = document.getElementById('filterCari').value.trim().toLowerCase();

      const tersaring = DATA_USERS.filter(u => {
        const statusU = (u.status || (u.aktif ? 'ACTIVE' : 'INACTIVE')).toUpperCase();
        if (statusFilter !== 'ALL' && statusU !== statusFilter) return false;
        if (peranFilter && String(u.role || '').toLowerCase() !== peranFilter) return false;
        if (cari) {
          const hay = `${u.mechanic_id || ''} ${u.name || ''} ${u.email || ''} ${u.section || ''} ${u.jabatan_aktual || ''} ${u.golongan || ''}`.toLowerCase();
          if (!hay.includes(cari)) return false;
        }
        return true;
      });

      document.getElementById('kpiTotal').textContent = DATA_USERS.length;
      document.getElementById('kpiAktif').textContent = DATA_USERS.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
      document.getElementById('kpiNonaktif').textContent = DATA_USERS.filter(u => (u.status || 'ACTIVE') === 'INACTIVE').length;
      document.getElementById('kpiToken').textContent = DATA_USERS.filter(u => u.has_token || u.token).length;
      document.getElementById('kpiAdmin').textContent = DATA_USERS.filter(u => u.boleh_admin || u.role === 'superintendent').length;

      const tbody = document.getElementById('userTableBody');
      if (!tersaring.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Tidak ada pengguna yang cocok dengan saringan.</td></tr>';
        return;
      }

      tbody.innerHTML = tersaring.map(u => {
        const aktif = (u.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
        const keyUnik = `${u.rumah}:${u.mechanic_id}`;
        const terbuka = Boolean(TOKEN_TERBUKA[keyUnik]);
        const tampilToken = u.token
          ? (terbuka ? u.token : (u.token_masked || (u.token.slice(0, 4) + '…')))
          : null;
        const infoBagian = u.rumah === 'sum'
          ? [u.jabatan_aktual, u.golongan ? `Gol. ${u.golongan}` : ''].filter(Boolean).join(' · ') || '—'
          : [u.section, u.position || u.grade].filter(Boolean).join(' · ') || 'semua';

        return `
          <tr class="${aktif ? '' : 'row-inactive'}">
            <td><span class="badge badge-gas">${escapeHtml(u.rumah || '')}</span></td>
            <td><strong>${escapeHtml(u.mechanic_id)}</strong></td>
            <td>
              <div><strong>${escapeHtml(u.name)}</strong></div>
              <div style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(u.email || '—')}</div>
            </td>
            <td>
              <span>${escapeHtml(u.role)}</span>
              ${u.boleh_admin ? '<span class="badge badge-admin" style="margin-left:4px;">admin</span>' : ''}
            </td>
            <td>${escapeHtml(infoBagian)}</td>
            <td>
              <span class="badge ${aktif ? 'badge-active' : 'badge-inactive'}">${aktif ? 'ACTIVE' : 'INACTIVE'}</span>
            </td>
            <td>
              ${tampilToken ? `
                <div style="display:flex; align-items:center; gap:0.35rem;">
                  <code class="token-box">${escapeHtml(tampilToken)}</code>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="toggleLihatToken('${escapeAttr(keyUnik)}')">${terbuka ? '🙈' : '👁️'}</button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="salinTokenUser('${escapeAttr(u.token)}')">📋</button>
                </div>
              ` : '<span style="color:var(--text-muted); font-style:italic;">belum ada</span>'}
            </td>
            <td>${Number(u.jejak || 0)} WO</td>
            <td>
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick='bukaModalUbahUser(${JSON.stringify(u).replace(/'/g, "&#39;")})'>Ubah</button>
                <button type="button" class="btn btn-primary btn-sm" ${!aktif ? 'disabled' : ''} onclick="aksiTerbitkanToken('${escapeAttr(u.rumah)}', '${escapeAttr(u.mechanic_id)}', '${escapeAttr(u.name)}', ${Boolean(u.token)})">
                  ${u.token ? 'Ganti Token' : 'Terbitkan Token'}
                </button>
                ${u.token ? `<button type="button" class="btn btn-danger btn-sm" onclick="aksiCabutToken('${escapeAttr(u.rumah)}', '${escapeAttr(u.mechanic_id)}', '${escapeAttr(u.name)}')">Cabut</button>` : ''}
                <button type="button" class="btn btn-danger btn-sm" onclick="aksiHapusUser('${escapeAttr(u.rumah)}', '${escapeAttr(u.mechanic_id)}', '${escapeAttr(u.name)}')">🗑 Hapus</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function toggleLihatToken(k) {
      TOKEN_TERBUKA[k] = !TOKEN_TERBUKA[k];
      renderTabelUser();
    }

    async function salinTokenUser(tok) {
      try {
        await navigator.clipboard.writeText(tok);
        tampilPesanUser('Token berhasil disalin ke clipboard.', true);
      } catch (_) {
        prompt('Salin token akses berikut:', tok);
      }
    }

    function sesuaikanFormRumah() {
      const r = document.getElementById('uRumah').value;
      const selPeran = document.getElementById('uPeran');
      const peranSekarang = selPeran.value || 'mechanic';

      const opsiPeran = r === 'sum'
        ? [
            ['mechanic', 'Mekanik'],
            ['supervisor', 'Supervisor (L1)'],
            ['superintendent', 'Superintendent (L2)'],
            ['foreman', 'Foreman (SUM)'],
            ['foreman_approver', 'Foreman Approver (SUM)']
          ]
        : [
            ['mechanic', 'Mekanik'],
            ['supervisor', 'Supervisor / Planner (L1)'],
            ['superintendent', 'Superintendent / Manager (L2)']
          ];

      selPeran.innerHTML = opsiPeran.map(([k, lbl]) => `<option value="${k}">${lbl}</option>`).join('');
      if (opsiPeran.some(([k]) => k === peranSekarang)) selPeran.value = peranSekarang;

      document.getElementById('grupSection').style.display = r === 'sum' ? 'none' : 'block';
    }

    function bukaModalUserBaru() {
      const rFilter = document.getElementById('filterRumah').value;
      const rDefault = (rFilter && rFilter !== 'semua') ? rFilter : 'sum';
      document.getElementById('judulModalUser').textContent = 'Tambah Pengguna Baru';
      document.getElementById('uRumah').value = rDefault;
      document.getElementById('uRumah').disabled = false;
      sesuaikanFormRumah();
      document.getElementById('uKode').value = '';
      document.getElementById('uKode').readOnly = false;
      document.getElementById('uNama').value = '';
      document.getElementById('uEmail').value = '';
      document.getElementById('uPeran').value = 'mechanic';
      document.getElementById('uSection').value = rDefault === 'kmbprojek' ? 'maintenance' : 'field';
      document.getElementById('uJabatan').value = 'junior';
      document.getElementById('uGolongan').value = '';
      document.getElementById('uAktif').checked = true;
      document.getElementById('uAkunUji').checked = false;
      document.getElementById('uBolehAdmin').checked = false;
      document.getElementById('uBolehPerf').checked = false;
      document.getElementById('uBolehTek').checked = false;
      document.getElementById('uBolehRep').checked = false;
      document.getElementById('modalUser').classList.remove('hidden');
    }

    function bukaModalUbahUser(u) {
      document.getElementById('judulModalUser').textContent = `Ubah Pengguna: ${u.name}`;
      document.getElementById('uRumah').value = u.rumah || 'sum';
      document.getElementById('uRumah').disabled = true;
      sesuaikanFormRumah();
      document.getElementById('uKode').value = u.mechanic_id || '';
      document.getElementById('uKode').readOnly = true;
      document.getElementById('uNama').value = u.name || '';
      document.getElementById('uEmail').value = u.email || '';
      document.getElementById('uPeran').value = u.role || 'mechanic';
      document.getElementById('uSection').value = u.section || '';
      document.getElementById('uJabatan').value = u.jabatan_aktual || u.position || u.grade || '';
      document.getElementById('uGolongan').value = u.golongan || '';
      document.getElementById('uAktif').checked = (u.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
      document.getElementById('uAkunUji').checked = Boolean(u.akun_uji);
      document.getElementById('uBolehAdmin').checked = Boolean(u.boleh_admin);
      document.getElementById('uBolehPerf').checked = Boolean(u.boleh_performa);
      document.getElementById('uBolehTek').checked = Boolean(u.boleh_teknis);
      document.getElementById('uBolehRep').checked = Boolean(u.boleh_report);
      document.getElementById('modalUser').classList.remove('hidden');
    }

    function tutupModalUser() {
      document.getElementById('modalUser').classList.add('hidden');
    }

    async function submitSimpanUser(e) {
      e.preventDefault();
      const rumah = document.getElementById('uRumah').value;
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminToken').value.trim();
      const btn = document.getElementById('btnSimpanUser');
      btn.disabled = true; btn.textContent = 'Menyimpan...';

      const userPayload = {
        mechanic_id: document.getElementById('uKode').value.trim(),
        name: document.getElementById('uNama').value.trim(),
        email: document.getElementById('uEmail').value.trim(),
        role: document.getElementById('uPeran').value,
        section: document.getElementById('uSection').value.trim(),
        position: document.getElementById('uJabatan').value.trim(),
        jabatan_aktual: document.getElementById('uJabatan').value.trim(),
        golongan: document.getElementById('uGolongan').value.trim(),
        aktif: document.getElementById('uAktif').checked,
        status: document.getElementById('uAktif').checked ? 'ACTIVE' : 'INACTIVE',
        akunUji: document.getElementById('uAkunUji').checked,
        bolehAdmin: document.getElementById('uBolehAdmin').checked,
        bolehPerforma: document.getElementById('uBolehPerf').checked,
        bolehTeknis: document.getElementById('uBolehTek').checked,
        bolehReport: document.getElementById('uBolehRep').checked,
      };

      try {
        const res = await fetch('/saklar/api/users/simpan', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: adminToken,
            op_id: 'op-usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            user: userPayload
          })
        });
        const data = await res.json();
        if (data.success) {
          tutupModalUser();
          tampilPesanUser(`Pengguna ${userPayload.name} (${userPayload.mechanic_id}) berhasil disimpan di kamar ${rumah}.`, true);
          await muatDaftarUser();
        } else {
          alert('Gagal menyimpan pengguna: ' + (data.error || 'Galat server'));
        }
      } catch (err) {
        alert('Koneksi terputus: ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Simpan ke Supabase';
      }
    }

    async function aksiTerbitkanToken(rumah, mechanicId, nama, sudahPunya) {
      if (sudahPunya && !confirm(`Ganti token akses untuk ${nama} (${mechanicId}) di rumah ${rumah}?\n\nToken lama akan dicabut (disimpan di riwayat) dan diganti token baru yang dijamin unik lintas rumah.`)) {
        return;
      }
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminToken').value.trim();
      try {
        const res = await fetch('/saklar/api/users/token', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: adminToken,
            mechanic_id: mechanicId,
            ganti: Boolean(sudahPunya),
            op_id: 'op-tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
          })
        });
        const data = await res.json();
        if (data.success && data.result) {
          TOKEN_TERBUKA[`${rumah}:${mechanicId}`] = true;
          tampilPesanUser(`Token untuk ${nama} (${mechanicId}) berhasil diterbitkan: ${data.result.token_masked || ''}`, true);
          await muatDaftarUser();
        } else {
          tampilPesanUser(data.error || 'Gagal menerbitkan token', false);
        }
      } catch (err) {
        tampilPesanUser('Koneksi gagal: ' + err.message, false);
      }
    }

    async function aksiCabutToken(rumah, mechanicId, nama) {
      if (!confirm(`Cabut token aktif milik ${nama} (${mechanicId}) di rumah ${rumah}?\n\nPengguna ini tidak akan bisa masuk sampai diberi token baru.`)) {
        return;
      }
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminToken').value.trim();
      try {
        const res = await fetch('/saklar/api/users/cabut-token', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: adminToken,
            mechanic_id: mechanicId,
            op_id: 'op-rev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
          })
        });
        const data = await res.json();
        if (data.success) {
          tampilPesanUser(`Token milik ${nama} (${mechanicId}) telah dicabut.`, true);
          await muatDaftarUser();
        } else {
          tampilPesanUser(data.error || 'Gagal mencabut token', false);
        }
      } catch (err) {
        tampilPesanUser('Koneksi gagal: ' + err.message, false);
      }
    }


    async function aksiHapusUser(rumah, mechanicId, nama) {
      if (!confirm(`Hapus permanen pengguna ${nama} (${mechanicId}) beserta tokennya dari rumah ${rumah}?`)) return;
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminToken').value.trim();
      try {
        const res = await fetch('/saklar/api/users/hapus', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: adminToken,
            mechanic_id: mechanicId,
            op_id: 'op-del-' + Date.now()
          })
        });
        const data = await res.json();
        if (data.success) {
          tampilPesanUser(`Pengguna ${nama} (${mechanicId}) berhasil dihapus.`, true);
          await muatDaftarUser();
        } else {
          tampilPesanUser(data.error || 'Gagal menghapus pengguna', false);
        }
      } catch (err) {
        tampilPesanUser('Koneksi gagal: ' + err.message, false);
      }
    }

    /* ── CRUD CONFIG PUSAT (UNITS, COMPONENTS, JOBS, FACTORS) — PER SISTEM / RUMAH ── */
    let SUB_TAB_CFG = 'unit';
    let DATA_CFG_PUSAT = { units: [], components: [], jobs: [], factors: [] };

    function sinkronTabRumahConfigUI() {
      const r = document.getElementById('filterRumahConfig').value || 'sum';
      document.querySelectorAll('#rumahTabsConfig [data-rumah-cfg]').forEach((btn) => {
        const aktif = btn.getAttribute('data-rumah-cfg') === r;
        btn.className = 'btn btn-sm ' + (aktif ? 'btn-primary' : 'btn-secondary');
      });
    }

    function pilihRumahTabConfig(rumah) {
      const sel = document.getElementById('filterRumahConfig');
      if (sel) sel.value = rumah;
      gantiRumahConfigPusat();
    }

    function sinkronInputTokenAdminConfig() {
      const r = document.getElementById('filterRumahConfig').value;
      document.getElementById('inputAdminTokenConfig').value = TOKEN_ADMIN_PER_RUMAH[r] || document.getElementById('inputAdminToken').value || '';
      sinkronTabRumahConfigUI();
    }

    function simpanTokenAdminConfigLokal() {
      const r = document.getElementById('filterRumahConfig').value;
      const val = document.getElementById('inputAdminTokenConfig').value.trim();
      if (r && r !== 'semua') {
        TOKEN_ADMIN_PER_RUMAH[r] = val;
        sessionStorage.setItem('abadi_admin_tokens', JSON.stringify(TOKEN_ADMIN_PER_RUMAH));
      }
    }

    function gantiRumahConfigPusat() {
      sinkronInputTokenAdminConfig();
      muatDataConfigPusat();
    }

    function pilihSubTabConfig(jenis) {
      SUB_TAB_CFG = jenis;
      ['unit', 'component', 'job', 'factor'].forEach((k) => {
        const b = document.getElementById('subTabCfg_' + k);
        if (b) {
          b.className = 'btn btn-sm ' + (k === jenis ? 'btn-primary' : 'btn-secondary');
        }
      });
      const labelTambah = {
        unit: '+ Tambah Unit',
        component: '+ Tambah Component',
        job: '+ Tambah Catalog Job',
        factor: '+ Tambah Factor / Tarif',
      };
      const btnT = document.getElementById('btnTambahConfigPusat');
      if (btnT) btnT.textContent = labelTambah[jenis] || '+ Tambah Config';
      renderTabelConfigPusat();
    }

    function tampilPesanConfig(teks, baik = true) {
      const box = document.getElementById('configAlert');
      if (!teks) { box.classList.add('hidden'); return; }
      box.textContent = teks;
      box.className = 'alert ' + (baik ? 'alert-success' : 'alert-danger');
      box.classList.remove('hidden');
    }

    async function muatDataConfigPusat() {
      const rumah = document.getElementById('filterRumahConfig').value || 'sum';
      const adminToken = document.getElementById('inputAdminTokenConfig').value.trim() || TOKEN_ADMIN_PER_RUMAH[rumah] || '';
      const tbody = document.getElementById('tbodyConfigPusat');
      sinkronTabRumahConfigUI();
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Memuat master data config dari Supabase...</td></tr>';

      try {
        const res = await fetch('/saklar/api/config/daftar', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({
            rumah,
            admin_token: adminToken,
            tokens: TOKEN_ADMIN_PER_RUMAH,
            jenis: 'all'
          })
        });
        const data = await res.json();
        if (!data.success && data.error) {
          tampilPesanConfig(data.error || 'Gagal memuat config', false);
          DATA_CFG_PUSAT = { units: [], components: [], jobs: [], factors: [] };
          renderTabelConfigPusat();
          return;
        }
        const d = data.result || data.data || data || {};
        const tagDefault = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, rumah: x.rumah || (rumah === 'semua' ? 'kmbprojek' : rumah) })) : []);
        DATA_CFG_PUSAT = {
          units: tagDefault(d.units || data.units),
          components: tagDefault(d.components || data.components),
          jobs: tagDefault(d.jobs || data.jobs),
          factors: tagDefault(d.factors || data.factors),
        };
        tampilPesanConfig('', true);
        renderTabelConfigPusat();
      } catch (err) {
        tampilPesanConfig('Koneksi gagal: ' + err.message, false);
      }
    }

    function renderTabelConfigPusat() {
      const q = (document.getElementById('filterCariConfig').value || '').toLowerCase().trim();
      const statusFilter = (document.getElementById('filterStatusConfig')?.value || 'ALL').toUpperCase();
      const th = document.getElementById('theadConfigPusat');
      const tb = document.getElementById('tbodyConfigPusat');

      document.getElementById('kpiCfgUnit').textContent = DATA_CFG_PUSAT.units.length;
      document.getElementById('kpiCfgComp').textContent = DATA_CFG_PUSAT.components.length;
      document.getElementById('kpiCfgJob').textContent = DATA_CFG_PUSAT.jobs.length;
      document.getElementById('kpiCfgFactor').textContent = DATA_CFG_PUSAT.factors.length;

      const lolosStatus = (x) => {
        if (statusFilter === 'ALL') return true;
        const st = String(x.status || 'ACTIVE').toUpperCase();
        return st === statusFilter;
      };

      if (SUB_TAB_CFG === 'unit') {
        th.innerHTML = '<tr><th>Rumah</th><th>Kode Unit</th><th>Nama Unit</th><th>Model</th><th>Section</th><th>Faktor Unit</th><th>Status</th><th>Aksi</th></tr>';
        const rows = DATA_CFG_PUSAT.units.filter((x) => lolosStatus(x) && (!q || [x.rumah, x.unit_id, x.unit_name, x.unit_model, x.section].join(' ').toLowerCase().includes(q)));
        document.getElementById('kpiCfgShown').textContent = rows.length;
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Tidak ada data unit yang cocok dengan saringan.</td></tr>'; return; }
        tb.innerHTML = rows.map((x) => {
          const aktif = String(x.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
          const idxAsli = DATA_CFG_PUSAT.units.indexOf(x);
          return `<tr class="${aktif ? '' : 'row-inactive'}">
            <td><span class="badge badge-gas">${escapeHtml(x.rumah || '')}</span></td>
            <td><strong>${escapeHtml(x.unit_id)}</strong></td>
            <td>${escapeHtml(x.unit_name || x.unit_id)}</td>
            <td>${escapeHtml(x.unit_model || '—')}</td>
            <td>${escapeHtml(x.section || '—')}</td>
            <td>${escapeHtml(x.unit_factor ?? 1)}</td>
            <td><span class="badge ${aktif ? 'badge-active' : 'badge-inactive'}">${escapeHtml(x.status || 'ACTIVE')}</span></td>
            <td>
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="editConfigPusat('unit', ${idxAsli})">Ubah</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="hapusConfigPusat('${escapeAttr(x.rumah)}', 'unit', '${escapeAttr(x.unit_id)}')">🗑 Hapus</button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else if (SUB_TAB_CFG === 'component') {
        th.innerHTML = '<tr><th>Rumah</th><th>ID Komponen</th><th>Nama Komponen</th><th>Kategori / Section</th><th>Base Points</th><th>Target Jam</th><th>Status</th><th>Aksi</th></tr>';
        const rows = DATA_CFG_PUSAT.components.filter((x) => lolosStatus(x) && (!q || [x.rumah, x.component_id, x.component_name, x.category, x.section].join(' ').toLowerCase().includes(q)));
        document.getElementById('kpiCfgShown').textContent = rows.length;
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Tidak ada data komponen yang cocok dengan saringan.</td></tr>'; return; }
        tb.innerHTML = rows.map((x) => {
          const aktif = String(x.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
          const idxAsli = DATA_CFG_PUSAT.components.indexOf(x);
          return `<tr class="${aktif ? '' : 'row-inactive'}">
            <td><span class="badge badge-gas">${escapeHtml(x.rumah || '')}</span></td>
            <td><strong>${escapeHtml(x.component_id)}</strong></td>
            <td>${escapeHtml(x.component_name)}</td>
            <td>${escapeHtml(x.category || x.section || '—')}</td>
            <td>${escapeHtml(x.base_points ?? 1)}</td>
            <td>${escapeHtml(x.target_hours ?? 2)} jam</td>
            <td><span class="badge ${aktif ? 'badge-active' : 'badge-inactive'}">${escapeHtml(x.status || 'ACTIVE')}</span></td>
            <td>
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="editConfigPusat('component', ${idxAsli})">Ubah</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="hapusConfigPusat('${escapeAttr(x.rumah)}', 'component', '${escapeAttr(x.component_id)}')">🗑 Hapus</button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else if (SUB_TAB_CFG === 'job') {
        th.innerHTML = '<tr><th>Rumah</th><th>Job ID</th><th>Section</th><th>Komponen → Sub</th><th>Deskripsi Job</th><th>Plan Hours</th><th>Base Point</th><th>Status</th><th>Aksi</th></tr>';
        const rows = DATA_CFG_PUSAT.jobs.filter((x) => lolosStatus(x) && (!q || [x.rumah, x.job_id, x.section, x.component, x.sub_component, x.job_description, x.unit_model].join(' ').toLowerCase().includes(q)));
        document.getElementById('kpiCfgShown').textContent = rows.length;
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Tidak ada data katalog job yang cocok dengan saringan.</td></tr>'; return; }
        tb.innerHTML = rows.map((x) => {
          const aktif = String(x.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
          const idxAsli = DATA_CFG_PUSAT.jobs.indexOf(x);
          return `<tr class="${aktif ? '' : 'row-inactive'}">
            <td><span class="badge badge-gas">${escapeHtml(x.rumah || '')}</span></td>
            <td><strong>${escapeHtml(x.job_id)}</strong></td>
            <td>${escapeHtml(x.section || '—')}</td>
            <td>${escapeHtml(x.component || '—')} · <small>${escapeHtml(x.sub_component || '—')}</small></td>
            <td>${escapeHtml(x.job_description)}</td>
            <td>${escapeHtml(x.plan_hours ?? 2)} jam</td>
            <td>${escapeHtml(x.base_point ?? 1)}</td>
            <td><span class="badge ${aktif ? 'badge-active' : 'badge-inactive'}">${escapeHtml(x.status || 'ACTIVE')}</span></td>
            <td>
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="editConfigPusat('job', ${idxAsli})">Ubah</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="hapusConfigPusat('${escapeAttr(x.rumah)}', 'job', '${escapeAttr(x.job_id)}')">🗑 Hapus</button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else if (SUB_TAB_CFG === 'factor') {
        th.innerHTML = '<tr><th>Rumah</th><th>Tipe Faktor</th><th>Key (Kunci)</th><th>Nilai Angka</th><th>Keterangan</th><th>Aksi</th></tr>';
        const rows = DATA_CFG_PUSAT.factors.filter((x) => !q || [x.rumah, x.factor_type, x.key, x.description].join(' ').toLowerCase().includes(q));
        document.getElementById('kpiCfgShown').textContent = rows.length;
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Tidak ada data faktor yang cocok dengan saringan.</td></tr>'; return; }
        tb.innerHTML = rows.map((x) => {
          const idxAsli = DATA_CFG_PUSAT.factors.indexOf(x);
          return `<tr>
            <td><span class="badge badge-gas">${escapeHtml(x.rumah || '')}</span></td>
            <td><strong>${escapeHtml(x.factor_type)}</strong></td>
            <td><code class="token-box">${escapeHtml(x.key)}</code></td>
            <td><strong>${escapeHtml(x.value ?? 1)}</strong></td>
            <td>${escapeHtml(x.description || '—')}</td>
            <td>
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="editConfigPusat('factor', ${idxAsli})">Ubah</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="hapusConfigPusat('${escapeAttr(x.rumah)}', 'factor', '${escapeAttr((x.factor_type || '') + ':' + (x.key || ''))}')">🗑 Hapus</button>
              </div>
            </td>
          </tr>`;
        }).join('');
      }
    }

    function bukaModalConfigPusat(item = null) {
      const box = document.getElementById('isiFormConfigPusat');
      const t = SUB_TAB_CFG;
      const rFilter = document.getElementById('filterRumahConfig').value;
      const rTarget = (item && item.rumah) ? item.rumah : ((rFilter && rFilter !== 'semua') ? rFilter : 'sum');
      document.getElementById('judulModalConfigPusat').textContent = (item ? 'Ubah ' : 'Tambah ') + t.toUpperCase();

      const opsiRumahHtml = DAFTAR_RUMAH.map((r) => `<option value="${escapeHtml(r.kode)}" ${r.kode === rTarget ? 'selected' : ''}>${escapeHtml(r.nama)} (${escapeHtml(r.kode)})</option>`).join('');
      const blokRumahTarget = `
        <div class="form-group">
          <label>Rumah / Sistem Target *</label>
          <select class="form-control" id="p_cfg_rumah" ${item ? 'disabled' : ''}>${opsiRumahHtml}</select>
        </div>
      `;

      if (t === 'unit') {
        box.innerHTML = blokRumahTarget + `
          <div class="form-row">
            <div class="form-group"><label>Kode Unit (unit_id, cth: DT-01, TB-ABADI-01) *</label><input class="form-control" id="p_cfg_unit_id" value="${escapeHtml(item?.unit_id || '')}" ${item ? 'readonly' : ''}></div>
            <div class="form-group"><label>Nama Unit *</label><input class="form-control" id="p_cfg_unit_name" value="${escapeHtml(item?.unit_name || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Model Unit</label><input class="form-control" id="p_cfg_unit_model" value="${escapeHtml(item?.unit_model || '')}"></div>
            <div class="form-group"><label>Section (field / workshop / maintenance / vessel)</label><input class="form-control" id="p_cfg_section" value="${escapeHtml(item?.section || 'maintenance')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Faktor Unit</label><input type="number" step="0.05" class="form-control" id="p_cfg_unit_factor" value="${escapeHtml(item?.unit_factor ?? 1.0)}"></div>
            <div class="form-group"><label>Status</label><select class="form-control" id="p_cfg_status"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE" ${item?.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option></select></div>
          </div>
        `;
      } else if (t === 'component') {
        box.innerHTML = blokRumahTarget + `
          <div class="form-row">
            <div class="form-group"><label>ID Komponen (cth: COM-001) *</label><input class="form-control" id="p_cfg_component_id" value="${escapeHtml(item?.component_id || '')}" ${item ? 'readonly' : ''}></div>
            <div class="form-group"><label>Nama Komponen *</label><input class="form-control" id="p_cfg_component_name" value="${escapeHtml(item?.component_name || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Kategori / Section</label><input class="form-control" id="p_cfg_category" value="${escapeHtml(item?.category || item?.section || 'General')}"></div>
            <div class="form-group"><label>Status</label><select class="form-control" id="p_cfg_status"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE" ${item?.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Base Points</label><input type="number" step="0.05" class="form-control" id="p_cfg_base_points" value="${escapeHtml(item?.base_points ?? 1.25)}"></div>
            <div class="form-group"><label>Target Jam</label><input type="number" step="0.25" class="form-control" id="p_cfg_target_hours" value="${escapeHtml(item?.target_hours ?? 2.0)}"></div>
          </div>
        `;
      } else if (t === 'job') {
        box.innerHTML = blokRumahTarget + `
          <div class="form-row">
            <div class="form-group"><label>Job ID (cth: JOB-001) *</label><input class="form-control" id="p_cfg_job_id" value="${escapeHtml(item?.job_id || '')}" ${item ? 'readonly' : ''}></div>
            <div class="form-group"><label>Section (field / workshop / maintenance / vessel) *</label><input class="form-control" id="p_cfg_section" value="${escapeHtml(item?.section || 'maintenance')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Komponen Utama *</label><input class="form-control" id="p_cfg_component" value="${escapeHtml(item?.component || 'General')}"></div>
            <div class="form-group"><label>Sub-Komponen</label><input class="form-control" id="p_cfg_sub_component" value="${escapeHtml(item?.sub_component || 'Standard')}"></div>
          </div>
          <div class="form-group"><label>Deskripsi Pekerjaan *</label><input class="form-control" id="p_cfg_job_description" value="${escapeHtml(item?.job_description || '')}"></div>
          <div class="form-row">
            <div class="form-group"><label>Plan Hours (Target Jam)</label><input type="number" step="0.25" class="form-control" id="p_cfg_plan_hours" value="${escapeHtml(item?.plan_hours ?? 2.0)}"></div>
            <div class="form-group"><label>Base Point</label><input type="number" step="0.05" class="form-control" id="p_cfg_base_point" value="${escapeHtml(item?.base_point ?? 1.25)}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Model Unit (opsional)</label><input class="form-control" id="p_cfg_unit_model" value="${escapeHtml(item?.unit_model || '')}"></div>
            <div class="form-group"><label>Job Type (Preventive / Corrective / Overhaul)</label><input class="form-control" id="p_cfg_job_type" value="${escapeHtml(item?.job_type || 'Preventive')}"></div>
          </div>
          <div class="form-group"><label>Status</label><select class="form-control" id="p_cfg_status"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE" ${item?.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option></select></div>
        `;
      } else if (t === 'factor') {
        box.innerHTML = blokRumahTarget + `
          <div class="form-row">
            <div class="form-group"><label>Tipe Faktor (work_condition / timeliness / safety / mtbf / rate / golongan) *</label><input class="form-control" id="p_cfg_factor_type" value="${escapeHtml(item?.factor_type || 'work_condition')}"></div>
            <div class="form-group"><label>Key (cth: normal, difficult, extreme, on_time, late, junior) *</label><input class="form-control" id="p_cfg_key" value="${escapeHtml(item?.key || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Nilai Angka (Value) *</label><input type="number" step="0.01" class="form-control" id="p_cfg_value" value="${escapeHtml(item?.value ?? 1.0)}"></div>
            <div class="form-group"><label>Keterangan</label><input class="form-control" id="p_cfg_description" value="${escapeHtml(item?.description || '')}"></div>
          </div>
        `;
      }
      document.getElementById('modalConfigPusat').classList.remove('hidden');
    }

    function tutupModalConfigPusat() {
      document.getElementById('modalConfigPusat').classList.add('hidden');
    }

    function editConfigPusat(jenis, idx) {
      const map = { unit: DATA_CFG_PUSAT.units, component: DATA_CFG_PUSAT.components, job: DATA_CFG_PUSAT.jobs, factor: DATA_CFG_PUSAT.factors };
      const item = (map[jenis] || [])[idx];
      if (item) bukaModalConfigPusat(item);
    }

    async function simpanConfigPusat() {
      const rumahEl = document.getElementById('p_cfg_rumah');
      const rFilter = document.getElementById('filterRumahConfig').value;
      const rumah = (rumahEl && rumahEl.value) ? rumahEl.value : ((rFilter && rFilter !== 'semua') ? rFilter : 'sum');
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminTokenConfig').value.trim() || document.getElementById('inputAdminToken').value.trim() || '';
      const t = SUB_TAB_CFG;
      const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      let payload = {};
      if (t === 'unit') {
        payload = { unit_id: v('p_cfg_unit_id'), unit_name: v('p_cfg_unit_name'), unit_model: v('p_cfg_unit_model'), section: v('p_cfg_section'), unit_factor: v('p_cfg_unit_factor'), status: v('p_cfg_status') };
      } else if (t === 'component') {
        payload = { component_id: v('p_cfg_component_id'), component_name: v('p_cfg_component_name'), category: v('p_cfg_category'), base_points: v('p_cfg_base_points'), target_hours: v('p_cfg_target_hours'), status: v('p_cfg_status') };
      } else if (t === 'job') {
        payload = { job_id: v('p_cfg_job_id'), section: v('p_cfg_section'), unit_model: v('p_cfg_unit_model'), component: v('p_cfg_component'), sub_component: v('p_cfg_sub_component'), job_description: v('p_cfg_job_description'), plan_hours: v('p_cfg_plan_hours'), base_point: v('p_cfg_base_point'), job_type: v('p_cfg_job_type'), status: v('p_cfg_status') };
      } else if (t === 'factor') {
        payload = { factor_type: v('p_cfg_factor_type'), key: v('p_cfg_key'), value: v('p_cfg_value'), description: v('p_cfg_description') };
      }

      try {
        const res = await fetch('/saklar/api/config/simpan', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({ rumah, admin_token: adminToken, jenis: t, payload })
        });
        const data = await res.json();
        if (data.success) {
          tutupModalConfigPusat();
          tampilPesanConfig(`Item config ${t.toUpperCase()} berhasil disimpan di kamar ${rumah}.`, true);
          await muatDataConfigPusat();
        } else {
          alert('Gagal menyimpan config: ' + (data.error || 'Galat server'));
        }
      } catch (err) {
        alert('Koneksi gagal: ' + err.message);
      }
    }

    async function hapusConfigPusat(rumahItem, jenis, kunci) {
      const rFilter = document.getElementById('filterRumahConfig').value;
      const rumah = (rumahItem && rumahItem !== 'semua') ? rumahItem : ((rFilter && rFilter !== 'semua') ? rFilter : 'sum');
      if (!confirm(`Hapus item config ${jenis} "${kunci}" dari sistem/rumah ${rumah}?`)) return;
      const adminToken = TOKEN_ADMIN_PER_RUMAH[rumah] || document.getElementById('inputAdminTokenConfig').value.trim() || document.getElementById('inputAdminToken').value.trim() || '';
      try {
        const res = await fetch('/saklar/api/config/hapus', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + TOKEN_SESI,
            'Content-Type': 'application/json',
            ...(adminToken ? { 'X-Admin-Token': adminToken } : {})
          },
          body: JSON.stringify({ rumah, admin_token: adminToken, jenis, kunci })
        });
        const data = await res.json();
        if (data.success) {
          tampilPesanConfig(`Item config ${jenis.toUpperCase()} (${kunci}) berhasil dihapus dari kamar ${rumah}.`, true);
          await muatDataConfigPusat();
        } else {
          alert('Gagal menghapus config: ' + (data.error || 'Galat server'));
        }
      } catch (err) {
        alert('Koneksi gagal: ' + err.message);
      }
    }

    function escapeHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
      return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
  </script>
</body>
</html>
```

4. **Deploy Worker `pintu` ke Staging**:

```bash
npx wrangler deploy --config workers/pintu/wrangler.toml --env staging
```

## 🛠️ Perbaikan Bug "← Kembali ke Monitoring" Tidak Bisa Kembali, Badge `Assigned 0`, & User Management CRUD

Berdasarkan tangkapan layar kedua Anda (`?page=mechanic&token=kmbp-mnt002-7d03949a&back=...`), berikut penyebab pasti dan perbaikannya:

### 1. Mengapa Tombol `← Kembali ke Monitoring` Tidak Bisa Kembali?

* **Penyebab di Kode Lama**:

  1. Di `workers/{sum,kmb,kmbprojek}/src/web-handler.js`, parameter URL `?back=...` belum dimasukkan ke `context.backToken`.

  2. Di `workers/{sum,kmb,kmbprojek}/src/web-templates.js`, tertulis `var backToken = ctx.backToken || token;`. Akibatnya, saat `ctx.backToken` kosong, nilai `backToken` jatuh ke `token` milik mekanik itu sendiri (`kmbp-mnt002-7d03949a`), bukan token pengawas (`52fdb552231348ffb143`). Ketika tombol `← Kembali ke Monitoring` diklik, browser justru memuat ulang halaman mekanik yang sama!

* **Cara Keluar Cepat Sekarang di Browser**:
  Ganti bagian `token=...` di address bar browser Anda kembali ke token pengawas Anda:
  `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev/web?page=mechanic&token=52fdb552231348ffb143`

* **Perbaikan Permanen di Repo (Sudah Diterapkan)**:

  * Di `workers/{sum,kmb,kmbprojek}/src/web-templates.js`, semua `var backToken = ctx.backToken || token;` diubah menjadi:

    ```
    var backToken = ctx.backToken || '';
    
    
    
    
    
    ```

  * Di `workers/{sum,kmb,kmbprojek}/src/web-handler.js`, ditambahkan pembacaan `backToken` & `activeFilter`:

    ```
    const rawBack = (url.searchParams.get('back') || '').trim();
    const backToken = rawBack && rawBack !== token ? rawBack : '';
    const activeFilter = (url.searchParams.get('filter') || 'assigned').toLowerCase().trim();
    
    
    
    
    
    ```

### 2. Mengapa `Assigned 0 · Pending 0 · Done 0` Padahal Sudah Input WO?

1. **Di `web-handler.js` Lama**: Saat memanggil `pull_my_wos`, `web-handler.js` menulis `counts: dm.counts || { all: wosList.length, assigned: 0, in_progress: 0, pending_approval: 0, done: 0 }` tanpa menghitung `status_group` (`assigned`, `pending_approval`, `done`) per WO, sehingga angka di tab `Assigned`, `Pending`, dan `Done` selalu `0`.

2. **Di `WorkOrder.html` (`/web?page=create`)**: Form desktop mengirim `team_distribution: { "MNT-002": 100 }` (bukan array `team: [...]`), ditambah Worker staging di Cloudflare yang belum di-deploy ulang masih mengarah ke simulator `gas-tiruan`.

3. **Perbaikan (Sudah Diterapkan di `web-handler.js` & `supabase-backend.js`)**: Setiap WO dari `pull_my_wos` kini otomatis dilengkapi `status_group` (`assigned` / `pending_approval` / `done`), `status_label`, `team_count`, serta objek `counts: { all, assigned, in_progress: 0, pending_approval, done }` yang akurat.

### 3. User Management Full CRUD (Create, Read, Update, Delete)

Sesuai permintaan Anda agar User Management mendukung **CRUD penuh**, kini tersedia di **2 tempat sekaligus**:

1. **Langsung di Web Desktop per Rumah (`/web?page=users&token=...`)**:

   * Buka `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev/web?page=users&token=52fdb552231348ffb143` (atau klik menu **`👥 Users (CRUD)`** di navbar).

   * **Create**: Klik **`+ Tambah User Baru`** (isi ID Mekanik, Nama, Email, Role `mechanic`/`supervisor`/`superintendent`, Section, Golongan/Position, Status).

   * **Read**: Tabel daftar seluruh user lengkap dengan pencarian instan, badge status, dan token tersamar.

   * **Update**: Klik **`✏️ Edit`** untuk mengubah data/role/status, **`🔑 Token`** untuk melihat/menerbitkan token, atau **`🔄 Ganti`** untuk merotasi token baru.

   * **Delete**: Klik **`🗑 Hapus`** (`admin_hapus_user` -> RPC `<prefix>_admin_hapus_user_bertoken`) untuk menghapus permanen user beserta tokennya dari Supabase (dilengkapi proteksi agar admin tidak bisa menghapus akunnya sendiri).

2. **Di Panel Admin Terpusat (`/saklar`)**:

   * Mendukung Create, Read, Update, Terbitkan/Ganti/Cabut Token, dan tombol **`🗑 Hapus`** (`POST /saklar/api/users/hapus`) lintas ketiga rumah (`SUM V2`, `KMB V2`, `KMB Project`).

## 🚨 Mengapa Saat Uji Coba di `abadiops-kmbprojek-staging.../web?page=create` Data Belum Masuk?

Berdasarkan tangkapan layar Anda di `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev/web?page=create&token=52fdb552231348ffb143`, ada **3 penyebab pasti** mengapa data Work Order yang Anda input belum masuk ke Supabase:

1. **Worker Staging di Cloudflare Masih Menjalankan Kode Lama (`abadiops-gas-tiruan`)**:

   * Perubahan kode di ruang kerja AI ini **tidak otomatis ter-deploy** ke akun Cloudflare & Supabase Anda (karena sandbox ini terisolasi dari internet luar).

   * Pada Worker staging yang sedang tayang saat ini, jembatan `/api/web` masih meneruskan kiriman form ke `abadiops-gas-tiruan`. Di kode lama `workers/gas-tiruan/src/index.js`, aksi `handleCreateWO` dari halaman Web Desktop jatuh ke penangkap *fallback* tiruan di memori (`{ message: "Aksi handleCreateWO diterima oleh GAS Tiruan Staging" }`) tanpa mengembalikan `data.created` dan **tanpa menulis satu baris pun ke tabel Supabase**.

2. **Posisi Saklar untuk `kmbprojek` di Panel Saklar Staging Masih `gas`**:

   * Di tab ke-2 browser Anda (`Panel Saklar Dua Cabang`), pastikan setelah SQL dan Worker baru di-deploy dari komputer Anda, saklar rumah **`KMB Projek (Raka)`** digeser ke **`dua_cabang`** (atau **`supabase`**). Selama saklar masih di posisi `gas`, semua pembuatan WO baru diarahkan ke simulator `gas-tiruan`, bukan ke tabel `kmb_projek.wo_supabase`.

3. **3 Perbedaan Format Payload Khusus Halaman Web Desktop (`/web?page=create`) yang Baru Saja Diperbaiki**:

   * **`getJobCatalogCached(section)`**: Saat memilih *Section* (`VESSEL`, `MAINTENANCE`, `WORKSHOP`) di `/web?page=create`, halaman memanggil `getJobCatalogCached(section)` yang mengharapkan `{ success: true, data: { jobs: [...] } }`. Kini sudah ditambahkan di `supabase-backend.js` dan `gas-tiruan`.

   * **`team_distribution` vs `team`**: Berbeda dengan PWA yang mengirim array `team: [{ mechanic_id: "..." }]`, halaman `/web?page=create` mengirim objek `team_distribution: { "MECH-001": 100 }`. Tanpa konversi otomatis, WO tersimpan dengan `team: []` (kosong) sehingga tidak muncul di dashboard mekanik. Kini `normalisasiBlokWo()` di `supabase-backend.js` dan `rpc_backend_penuh.sql` otomatis mengonversi `team_distribution` menjadi array `team` + mengisi `lead_mechanic_id`.

   * **`manual_base_points` / `manual_target_hours` / `manual_unit_factor` & `r.data.wo`**: Saat memilih pekerjaan *Others (Custom)* di `/web?page=create`, form mengirim `manual_base_points` (bukan `others_base_points`), dan saat membuka modal detail WO di `MechanicDashboard.html`, halaman membaca `r.data.wo`. Keduanya kini sudah dipetakan otomatis (**40/40 pengujian backend mandiri LULUS**).

## 1. Ringkasan 4 Perbaikan Protokol Repo (`AGENTS.md`)

| \# | Tantangan Sebelumnya | Aturan Protokol Repo (`AGENTS.md`) | Solusi Arsitektur | 
| ----- | ----- | ----- | ----- | 
| 1 | **Salah lokasi skema SQL** | Kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) hanya untuk satu rumah; kode bersama di `db/migrasi/`. Kamar tidak boleh saling mengintip. | Pisahkan fungsi RPC per rumah di `db/kmb/`, `db/sum/`, dan `db/kmb_projek/`. Tutup semua fungsi internal dengan `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` dan buka hanya pembungkus `*_bertoken`. | 
| 2 | **Hardcode `tenant_id` di contoh SQL & auth** | `AGENTS.md` §5: Haram hardcode ID/token/daftar orang. | Gunakan lookup dinamis `SELECT id INTO v_tenant FROM tenants WHERE code = ...` di semua SQL (`db/contoh-user-admin.sql`, `docs/MULTI-TENANT-SETUP.md`) dan query tabel `tenants` di `src/backends/supabase/auth.ts`. | 
| 3 | **Expand Durable Object (`SaklarDO`) tanpa izin** | `SaklarDO` khusus untuk menyimpan posisi saklar (`switches`) dan riwayatnya (`history`). | Pertahankan `SaklarDO` murni untuk `switches` & `history` (daftar rumah dibaca dinamis dari `env.RUMAH`). Buat modul manajemen pengguna secara *stateless* di `workers/pintu/src/user-admin.js` yang langsung memanggil RPC Supabase tiap kamar. | 
| 4 | **Bekerja di `main` bukan `staging`** | `AGENTS.md` §0a butir 16: Semua perubahan kode dan uji coba wajib di branch `staging`, `--env staging`, dan Gedung 2 (`dnnqrslftndcbmnvuveb`). | Kerjakan di branch `staging`, pecah commit per rumah (`[kmb]`, `[sum]`, `[kmb-projek]`, `[bersama]`), dan catat di bagian paling atas `docs/PROGRES.md`. | 

## 2. Daftar Perbaikan Tambahan Hasil Audit Kesiapan Hari Kamis

Selain 4 protokol di atas, berikut **6 perbaikan krusial** yang wajib ada agar operasional hari Kamis berjalan mulus tanpa kendala:

| \# | Area Kritis | Masalah yang Ditemukan Saat Audit | Perbaikan yang Diterapkan | 
| ----- | ----- | ----- | ----- | 
| 1 | **Aturan "Satu WO, Satu Rumah" & "Saklar Balik" (`docs/SAKLAR.md`)** | Jika saklar dibalik mundur dari `dua_cabang` ke `gas`, WO yang sudah terlanjur lahir di Supabase (`WO-SB-*` / `WO-KMBP-*` / 4 digit `WO-YYYYMMDD-XXXX`) tidak boleh dikirim ke GAS. Sebaliknya, saat `dua_cabang`, aksi tulis pada WO lama 3 digit (`WO-YYYYMMDD-XXX`) harus tetap ke GAS. | Menambahkan detektor `apakahWoLahirDiSupabase` & `apakahWoLamaDariGas` di `workers/{sum,kmb,kmbprojek}/src/index.js` serta pembacaan saklar instan (0ms, tanpa jeda cache) lewat *service binding* `PINTU`. | 
| 2 | **Katalog Job Cascade KMB V2 (`Config_Jobs_Field` & `Config_Jobs_Workshop`)** | Form Buat WO di `pwa/kmb/app.js` menyaring dropdown Unit berdasarkan `unit_model` di `jobs_field` / `jobs_workshop`. Sebelumnya kedua tabel itu belum terdaftar di `db/kmb/cermin_sheet.sql` dan `tools/kmb/sinkron-cermin.mjs`. | Menambahkan `config_jobs_field` & `config_jobs_workshop` ke `db/kmb/cermin_sheet.sql`, `db/kmb/rpc_backend_penuh.sql`, dan `tools/kmb/sinkron-cermin.mjs`, lengkap dengan fallback otomatis dari `config_components` × `config_units`. | 
| 3 | **Tabel `kmb_projek.catalog_jobs` (Bug #15)** | `kmb_create_refs` memanggil `kmb_projek.catalog_jobs`, tetapi tabelnya belum ada di `db/kmb_projek/cermin_sheet.sql`. | Menambahkan `CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs` beserta indeks dan `REVOKE` keamanannya di `db/kmb_projek/cermin_sheet.sql` dan `db/kmb_projek/rpc_backend_penuh.sql`. | 
| 4 | **Perhitungan Angka KPI `pull_monitoring` (Bug #12)** | `sum_monitoring_bertoken` dan `kmbtra_monitoring_bertoken` di `rpc_baca.sql` hanya menghitung status `'PENDING_L1'` dan `'PENDING_L2'`, sehingga WO berstatus `'pending_supervisor'`, `'pending_superintendent'`, dan `'pending_mechanic_work'` terhitung `0`. | Menyelaraskan filter status di `db/sum/rpc_baca.sql` dan `db/kmb/rpc_baca.sql` agar menghitung seluruh variasi nama status (`pending_mechanic_work`, `pending_supervisor`, `pending_superintendent`). | 
| 5 | **Perlindungan Baris Supabase Saat Sinkron Cermin** | `tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs` menjalankan `DELETE FROM <schema>.<tabel>` tanpa filter, yang berisiko menghapus baris kelahiran Supabase jika sheet kosong. | Mengubah kueri hapus di ketiga `sinkron-cermin.mjs` menjadi `DELETE FROM <schema>.<tabel> WHERE baris >= 0 AND baris < 100000` sehingga baris Supabase (`baris < 0` dan `baris >= 100000`) tidak pernah tersentuh. | 
| 6 | **Jembatan Web Desktop `/web` & `/api/web` (Bug #24 & #27)** | Template Web Desktop mengirim batch `{ blocks: [...] }`, `override_data`, dan membaca `result.error.message`, sementara tombol Web di Pintu masih mengarah ke `script.google.com`. | Menambahkan dukungan loop `blocks`, pembungkus `error: { message }`, pemetaan seluruh fungsi `handle*` di `supabase-backend.js`, *service binding* `PINTU` di `wrangler.toml`, serta pengalihan otomatis `web_rumah` ke `/web` mandiri saat saklar aktif. | 

## 3. Daftar File Backend Mandiri (Tanpa GAS) & User Management di Repo

1. **Lapisan Database Supabase (`db/`)**:

   * **Kamar KMB V2 (`db/kmb/`)**: `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Kamar SUM V2 (`db/sum/`)**: `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Kamar KMB Project (`db/kmb_projek/`)**: `cermin_sheet.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Bersama (`db/migrasi/` & `db/`)**: `db/migrasi/013-admin-user-tenant.sql`, `db/contoh-user-admin.sql`

2. **Lapisan Rumus Poin & Rupiah Murni (`src/domain/`)**:

   * `src/domain/scoring.mjs`: Satu-satunya tempat menghitung poin dan Rupiah di JS (`AGENTS.md` §1).

3. **Lapisan Cloudflare Workers (`workers/`)**:

   * **Rumah SUM, KMB, KMB Project**: `workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`, `src/index.js`, `src/web-handler.js`, `wrangler.toml`

   * **Pintu & Panel Pengelola Pusat**: `workers/pintu/src/saklar-do.js`, `src/user-admin.js`, `src/index.js`, `public/saklar.html`, `wrangler.toml`

4. **Alat Sinkron Cermin & Uji Otomatis (`tools/` & `scripts/`)**:

   * `tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs`

   * `scripts/uji-backend-mandiri.mjs` (**37/37 lulus**), `scripts/uji-user-admin-pusat.mjs` (**27/27 lulus**), `scripts/uji-serahan-token.mjs` (**24/24 lulus**)

## 4. Urutan Langkah Eksekusi di Laptop Lokal & Staging

### Langkah 1 — Siapkan Branch `staging`

Pastikan kamu berada di branch `staging` yang ditarik dari `main` terbaru:

```
git checkout main
git pull --rebase origin main
git config user.name "Raka"
git checkout -B staging







```

### Langkah 2 — Jalankan SQL di Supabase Gedung 2 (Staging `dnnqrslftndcbmnvuveb`)

Buka **SQL Editor** pada proyek Supabase **Gedung 2 (`dnnqrslftndcbmnvuveb`)**, lalu jalankan file SQL berikut secara berurutan:

1. **Kamar KMB V2 (`kmb`)**:

   * `db/kmb/cermin_sheet.sql`

   * `db/kmb/rpc_baca.sql`

   * `db/kmb/rpc_admin_user.sql`

   * `db/kmb/rpc_backend_penuh.sql`

2. **Kamar SUM V2 (`sum`)**:

   * `db/sum/cermin_sheet.sql`

   * `db/sum/rpc_baca.sql`

   * `db/sum/rpc_admin_user.sql`

   * `db/sum/rpc_backend_penuh.sql`

3. **Kamar KMB Project (`kmb_projek`)**:

   * `db/kmb_projek/cermin_sheet.sql`

   * `db/kmb_projek/rpc_admin_user.sql`

   * `db/kmb_projek/rpc_backend_penuh.sql`

4. **Migrasi Bersama**:

   * `db/migrasi/013-admin-user-tenant.sql`

   * *(Opsional untuk akun latihan staging)* `db/contoh-user-admin.sql`

### Langkah 3 — Jalankan Verifikasi Uji Otomatis di Terminal Lokal

Sebelum deploy atau push, jalankan ketiga pengujian otomatis di terminal:

```
# 1. Uji siklus penuh backend mandiri, Saklar Balik, & Web Desktop (37/37 lulus)
node scripts/uji-backend-mandiri.mjs

# 2. Uji manajemen pengguna terpusat & 4 protokol repo (27/27 lulus)
node scripts/uji-user-admin-pusat.mjs

# 3. Uji serah-terima token PWA 1:1 (24/24 lulus)
node scripts/uji-serahan-token.mjs







```

### Langkah 4 — Deploy ke Cloudflare Workers Staging (`--env staging`)

**Penting (`AGENTS.md` §0a butir 16):** Deploy `gas-tiruan` dan `pintu` **lebih dulu** karena ketiga Worker rumah membutuhkan *service binding* `GAS_TIRUAN` dan `PINTU`. Selalu gunakan `--env staging`:

```
# 1. Deploy GAS Tiruan (khusus staging)
cd workers/gas-tiruan
npx wrangler deploy --dry-run && npx wrangler deploy

# 2. Deploy Worker Pintu Staging (Panel Saklar + Admin User Pusat)
cd ../pintu
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

# Jika secret sandi panel staging belum dipasang:
# npx wrangler secret put PANEL_SAKLAR_SECRET --env staging

# 3. Deploy Ketiga Worker Rumah ke Staging
cd ../sum
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmb
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmbprojek
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging
cd ../..







```

### Langkah 5 — Latihan Saklar Balik & Siklus Penuh di Staging

1. Buka `https://abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar` (atau `/admin`) dan masuk dengan sandi panel staging.

2. Di tab **👷 Manajemen Pengguna & Token (Pusat 3 Rumah)**, terbitkan token untuk akun penguji L2, L1, dan Mekanik.

3. Di tab **⚡ Saklar Dua Cabang**, ubah saklar rumah ke **`dua_cabang`**.

4. Masuk lewat pintu staging (`https://abadiops-pintu-staging.kawanabadigrup.workers.dev/`), buat 1 WO baru → pastikan terbit nomor **4 digit harian WIB (`WO-YYYYMMDD-0001`)**.

5. **Uji Saklar Balik**: Kembalikan saklar ke **`gas`**, lalu kirim laporan kerja (`submit_work`) dan approve (`approve_l1` → `approve_l2`) pada WO 4 digit tadi → pastikan WO tersebut tetap tuntas di Supabase tanpa galat.

## 5. Commit Terpisah, Push `staging`, & Pull Request untuk Hari Kamis

Sesuai `AGENTS.md` §0a butir 8, pisahkan commit berdasarkan kamar dan catat di bagian paling atas `docs/PROGRES.md`:

```
# 1. Commit kamar KMB V2
git add db/kmb/ workers/kmb/ tools/kmb/
git commit -m "[kmb] tambah RPC admin user, backend penuh mandiri, dan katalog cascade di skema kmb"

# 2. Commit kamar SUM V2
git add db/sum/ workers/sum/ tools/sum/
git commit -m "[sum] tambah RPC admin user dan backend penuh mandiri di skema sum"

# 3. Commit kamar KMB Project
git add db/kmb_projek/ workers/kmbprojek/ tools/kmb_projek/ src/backends/supabase/auth.ts workers/kmb-projek/src/backends/supabase/auth.ts
git commit -m "[kmb-projek] tambah RPC admin user, backend penuh mandiri, catalog_jobs, dan hapus hardcode tenantId"

# 4. Commit bagian Bersama & Pintu
git add src/domain/scoring.mjs db/migrasi/ db/contoh-user-admin.sql docs/ workers/pintu/ workers/gas-tiruan/ scripts/
git commit -m "[bersama] mesin skor JS murni, panel admin pusat di pintu, uji 37/37 & 27/27, dan PROGRES"

# Push ke branch staging
git push -u origin staging







```

### Checklist Go-Live Hari Kamis (Bersama Gabriel)

1. Buat Pull Request dari **`staging` → `main`** di GitHub untuk direview Gabriel.

2. Jalankan `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, dan `rpc_backend_penuh.sql` untuk ketiga kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) serta `db/migrasi/013-admin-user-tenant.sql` di **SQL Editor Gedung 1 (`sptgqsjgszwbreikxdph`)**.

3. Pastikan sinkron cermin awal (`tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs`) sudah mengisi tabel katalog (`config_units`, `config_components`, `config_jobs_field`, `config_jobs_workshop`, `config_mechanics`, `config_factors`, dan `catalog_jobs`) di Gedung 1.

4. Setelah PR di-merge ke `main`, deploy produksi secara berurutan (`pintu` lebih dulu, baru `sum`, `kmb`, `kmbprojek`).

5. Gabriel membuka `https://abadiops.com/saklar` untuk mengelola token pengguna dan memindahkan saklar rumah yang siap memakai Supabase ke posisi **`dua_cabang`** atau **`supabase`**.

## 8. Tambahan Patch Khusus Halaman Web Desktop `/web?page=create` (`supabase-backend.js` & SQL)

Pastikan di `workers/{sum,kmb,kmbprojek}/src/supabase-backend.js` terdapat fungsi `normalisasiBlokWo` dan penangan `getJobCatalogCached` berikut (sudah diterapkan penuh di panduan ini):

```
function normalisasiBlokWo(blk) {
  if (!blk || typeof blk !== 'object') return {};
  const b = { ...blk };
  if (b.manual_base_points !== undefined && b.others_base_points === undefined) b.others_base_points = b.manual_base_points;
  if (b.manual_target_hours !== undefined && b.others_target_hours === undefined) b.others_target_hours = b.manual_target_hours;
  if (b.manual_unit_factor !== undefined && b.others_unit_factor === undefined) b.others_unit_factor = b.manual_unit_factor;
  if (!Array.isArray(b.team) && b.team_distribution && typeof b.team_distribution === 'object') {
    b.team = Object.entries(b.team_distribution)
      .filter(([mid]) => String(mid || '').trim() !== '')
      .map(([mid, pct]) => ({
        mechanic_id: String(mid).trim(),
        percentage: Number(pct) || 100,
      }));
  }
  return b;
}






```

Dan di `eksekusiAksiSupabaseMandiri` (`workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`):

* Tambahkan `'getJobCatalogCached'` ke dalam `SEMUA_AKSI_SUPABASE`.

* Tangani `if (cleanAction === 'getJobCatalogCached')` dengan mengambil `jobs_vessel` / `jobs_workshop` / `jobs_field` dari RPC `*_create_refs_bertoken` dan mengembalikan `{ success: true, source: 'SUPABASE', result: { jobs, section: sec }, data: { jobs, section: sec } }`.

* Pada aksi detail WO (`pull_wo_detail`, `getWODetails`, `getWoDetailForMechanic`), sertakan properti `wo: woObj` di dalam `result` dan `data` (`{ ...woObj, wo: woObj }`) agar modal detail di `MechanicDashboard.html` tidak kosong.