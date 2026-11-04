# Panduan Lengkap Persiapan & Eksekusi Menuju Hari Kamis (Supabase Mandiri + User Management)

Dokumen ini adalah panduan kerja lengkap langkah demi langkah untuk menyiapkan **Backend Mandiri Supabase (Tanpa Pihak Ketiga GAS)** dan **Manajemen Pengguna & Token Terpusat (Full CRUD)** dari branch `staging` hingga siap dipakai pada hari Kamis.

## 🚨 Solusi Tuntas: Mengapa WO Tidak Masuk ke Mekanik `ra` (`token=kmbp-fkh2jc65`) & Cara Memperbaikinya Sekarang

Berdasarkan tangkapan layar Anda di `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev/web?page=mechanic&token=kmbp-fkh2jc65&back=52fdb552231348ffb143` (tampil `MECHANIC ra` dengan `Assigned 0 · Pending 0 · Done 0` / `No work orders`), ada **3 penyebab teknis pasti** yang kini sudah diperbaiki tuntas di kode di bawah:

1. **Jembatan `/api/web` di Staging Masih Mengarah ke `abadiops-gas-tiruan` Saat `SAKLAR = "gas"`**:
   * Di konfigurasi lama `workers/kmbprojek/wrangler.toml`, bagian `[env.staging.vars]` masih berisi `SAKLAR = "gas"` dan `STORAGE_MODE = "GAS"`.
   * Akibatnya, saat Anda menekan **Create Work Order** di `/web?page=create`, fungsi `handleWebBridgeApi` (`/api/web`) meneruskan pembuatan WO ke `abadiops-gas-tiruan` (simulator memori yang hanya mengembalikan struk sukses palsu **tanpa menulis ke tabel Supabase**).
   * **Perbaikan**: Di `workers/kmbprojek/src/web-handler.js` dan `workers/kmbprojek/wrangler.toml` terbaru di bawah ini, jalur `/web` dan `/api/web` kini **100% selalu membaca dan menulis langsung ke Supabase** begitu `SUPABASE_URL` tersedia (tidak pernah lagi dibelokkan ke `gas-tiruan` meskipun saklar belum digeser).

2. **Perbedaan Huruf Besar/Kecil ID Mekanik (`ra` vs `RA`) di SQL `kmb_my_wos_bertoken` & `kmb_monitoring`**:
   * Akun mekanik Anda terdaftar di token dengan ID huruf kecil **`ra`** (`token=kmbp-fkh2jc65`), sedangkan fungsi simpan user dan dropdown form menormalisasi ID menjadi huruf besar **`RA`**.
   * Pada kueri SQL sebelumnya, pencocokan `trim(el->>'mechanic_id') = v_mid` bersifat *case-sensitive* (`'RA' = 'ra'` menghasilkan `false`), sehingga WO milik `RA` tidak muncul saat dibuka dengan token `ra`.
   * **Perbaikan**: Fungsi helper baru `kmb_projek._wo_milik_mekanik(wo, v_mid, v_mname)` di SQL bawah kini mencocokkan ID maupun nama mekanik secara **case-insensitive (`upper(btrim(...))`)** di seluruh kolom (`lead_mechanic_id`, `team`, `effective_team`, `team_distribution`, dan `mechanic_ids`).

3. **Fungsi `kmb_monitoring_bertoken` & `kmb_create_refs_bertoken` Kini Disatukan di `rpc_backend_penuh.sql`**:
   * Sebelumnya `kmb_monitoring()` masih memakai versi lama `rpc_baca.sql` yang hanya menghitung baris di tabel `kmb_projek.work_orders` (`status = 'assigned'`) dan mengabaikan tabel `kmb_projek.wo_supabase`. Kini seluruh fungsi baca (`kmb_ping`, `kmb_create_refs_bertoken`, `kmb_monitoring_bertoken`, `kmb_my_wos_bertoken`, `kmb_wos_by_status_bertoken`) dan fungsi tulis (`kmb_eksekusi_aksi_bertoken`) sudah diperbarui menjadi satu kesatuan di Langkah A di bawah.

### ⚡ 2 Langkah Copy-Paste Agar WO Langsung Masuk ke Mekanik `ra` (`kmbp-fkh2jc65`)

#### Langkah A — Copy-Paste & Run SQL Ini di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`)

Buka **Supabase Dashboard Staging (`dnnqrslftndcbmnvuveb`) → SQL Editor → New Query**, tempel seluruh blok SQL di bawah ini (sudah mencakup `rpc_backend_penuh.sql` + `rpc_admin_user.sql` + perbaikan pencocokan `ra`/`RA`), lalu klik **Run**:

```sql
-- ==============================================================================
-- BACKEND PENUH MANDIRI SUPABASE (BACA + TULIS + DESKTOP WEB) — SKEMA `kmb_projek`
-- Rumah: kmbprojek · Pemegang: Raka · Tanpa Ketergantungan Pihak Ketiga (GAS)
-- Sesuai AGENTS.md §0a, §1, §2, §5, docs/KEPUTUSAN.md, & docs/SAKLAR.md
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

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
  -- 1. Kembalikan semua WO dari wo_supabase lebih dulu
  RETURN QUERY SELECT s.data FROM kmb_projek.wo_supabase s;

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
       WHERE NOT EXISTS (
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
       WHERE NOT EXISTS (
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
    'unit_name', u.unit_code,
    'unit_type', coalesce(u.section, 'OTHERS'),
    'unit_model', coalesce(u.model, ''),
    'unit_scope', jsonb_build_array(coalesce(u.section, 'all')),
    'unit_factor', 1
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
    'base_points', 1.25,
    'target_hours', 4
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

  -- Jobs Vessel
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
  WHERE lower(btrim(coalesce(j.section, ''))) = 'vessel'
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  IF jsonb_array_length(v_jobs_vessel) = 0 THEN
    v_jobs_vessel := v_jobs_field;
  END IF;
  v_jobs_workshop := v_jobs_field;

  -- Factors
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'type', f.factor_type,
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
      jsonb_build_object('key', 'normal', 'label', 'Shift 1', 'factor', 1),
      jsonb_build_object('key', 'difficult', 'label', 'Shift 2', 'factor', 1.1),
      jsonb_build_object('key', 'extreme', 'label', 'Kondisi Ekstrim', 'factor', 1.2)
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

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'wo', v_wo,
      'factors', v_factors,
      'base_settings', '[]'::jsonb,
      'mechanics', '[]'::jsonb
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
  v_fp         numeric := 0;
  v_total_idr  numeric := 0;
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

      v_bp := coalesce(nullif(v_blk->>'others_base_points', '')::numeric, nullif(v_blk->>'manual_base_points', '')::numeric, nullif(v_blk->>'base_points', '')::numeric, null);
      v_th := coalesce(nullif(v_blk->>'others_target_hours', '')::numeric, nullif(v_blk->>'manual_target_hours', '')::numeric, nullif(v_blk->>'target_hours', '')::numeric, null);
      v_uf := coalesce(nullif(v_blk->>'others_unit_factor', '')::numeric, nullif(v_blk->>'manual_unit_factor', '')::numeric, nullif(v_blk->>'unit_factor', '')::numeric, 1.0);

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

      IF coalesce(v_comp_name, '') = '' AND v_is_rel THEN
        BEGIN
          SELECT coalesce(name, v_comp_id) INTO v_comp_name
            FROM kmb_projek.config_components
           WHERE btrim(component_id) = v_comp_id
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
        'unit_name', v_unit_id,
        'unit_factor', v_uf,
        'unit', jsonb_build_object(
          'unit_id', v_unit_id,
          'unit_name', v_unit_id,
          'unit_factor', v_uf
        ),
        'base_points', v_bp,
        'target_hours', v_th,
        'effective_base_points', v_bp,
        'effective_target_hours', v_th,
        'work_condition', coalesce(v_blk->>'work_condition', 'normal'),
        'location', coalesce(v_blk->>'location', 'workshop'),
        'keterangan', coalesce(v_blk->>'keterangan', v_blk->>'notes', ''),
        'wo_group_id', coalesce(v_blk->>'wo_group_id', ''),
        'wo_group_mode', coalesce(v_blk->>'wo_group_mode', ''),
        'lead_mechanic_id', v_lead_id,
        'team', v_team,
        'effective_team', v_team,
        'team_names', v_team_names,
        'team_count', GREATEST(jsonb_array_length(v_team), 1),
        'created_by', v_actor_id,
        'created_by_name', v_actor_name,
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

  IF v_wo IS NULL AND v_aksi NOT IN ('riwayatHmUnit', 'riwayatKmUnit', 'gantiPanelHm', 'gantiPanelKm', 'dataDashboardTeknis', 'dataDashboardField', 'loadJobsCatalog', 'generatePayrollReport', 'generateReport') THEN
    RETURN json_build_object('success', false, 'error', 'Work order ' || v_wo_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF v_wo IS NOT NULL THEN
    v_wo_id  := v_wo->>'id';
    v_wo_num := v_wo->>'wo_number';
  END IF;

  -- C. SUBMIT WORK
  IF v_aksi IN ('submit_work', 'submit_job', 'submitMechanicWork', 'handleSubmitMechanicWork', 'submitWO', 'kirim_kerja') THEN
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
      'submitted_by', v_actor_id,
      'submitted_by_name', v_actor_name,
      'submitted_at', v_now_iso,
      'submitted_at_str', v_tgl_str
    );

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
    IF p_payload ? 'base_points' AND p_payload->>'base_points' IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object('base_points', (p_payload->>'base_points')::numeric, 'effective_base_points', (p_payload->>'base_points')::numeric);
    END IF;
    IF p_payload ? 'target_hours' AND p_payload->>'target_hours' IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object('target_hours', (p_payload->>'target_hours')::numeric, 'effective_target_hours', (p_payload->>'target_hours')::numeric);
    END IF;
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'status', v_wo->>'status'));
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- E. APPROVE L1
  IF v_aksi IN ('approve_l1', 'supervisorApprove', 'handleSupervisorApprove') THEN
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_superintendent',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Approval L2',
      'l1_by', v_actor_id,
      'l1_name', v_actor_name,
      'l1_at', v_now_iso
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

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_superintendent'));
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
      'l2_by', v_actor_id,
      'l2_name', v_actor_name,
      'l2_at', v_now_iso,
      'disahkan_at_str', v_tgl_str,
      'final_points', v_fp,
      'points', v_fp,
      'final_idr', v_total_idr,
      'idr_value', v_total_idr
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

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'approved', 'final_points', v_fp, 'final_idr', v_total_idr));
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- G. REJECT / CANCEL / TRANSFER / EXPIRED
  IF v_aksi IN ('reject', 'supervisorReject', 'superintendentReject', 'handleSupervisorReject', 'handleSuperintendentReject', 'kembalikan', 'handleKembalikanKeMekanik') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'rejection_reason', 'Ditolak'));
    v_wo := v_wo || jsonb_build_object(
      'status', CASE WHEN v_aksi IN ('kembalikan', 'handleKembalikanKeMekanik') THEN 'pending_mechanic_work' ELSE 'rejected' END,
      'rejection_reason', v_reason,
      'rejected_by_name', v_actor_name,
      'rejected_at', v_now_iso
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'status', v_wo->>'status'));
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('cancel_wo', 'cancel', 'cancelWO', 'handleCancelWO', 'batal_wo') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', 'Dibatalkan'));
    v_wo := v_wo || jsonb_build_object('status', 'cancelled', 'cancel_reason', v_reason, 'cancelled_by', v_actor_id, 'cancelled_at', v_now_iso, 'final_points', 0, 'final_idr', 0);
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'cancelled', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'cancelled', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'status', 'cancelled'));
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('request_transfer', 'handleRequestTransfer', 'approve_transfer', 'handleApproveTransfer', 'reject_transfer', 'handleRejectTransfer', 'report_expired', 'reopen_expired') THEN
    v_wo := v_wo || jsonb_build_object(
      'status', CASE WHEN v_aksi IN ('request_transfer', 'handleRequestTransfer') THEN 'pending_transfer' ELSE 'pending_mechanic_work' END,
      'transfer_status', CASE WHEN v_aksi IN ('request_transfer', 'handleRequestTransfer') THEN 'pending' WHEN v_aksi IN ('approve_transfer', 'handleApproveTransfer') THEN 'approved' ELSE 'rejected' END
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', jsonb_build_object('wo_id', v_wo_id, 'status', v_wo->>'status'));
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('action', v_aksi));
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
      LEFT JOIN kmb_projek.config_mechanics m ON trim(t.user_id) = trim(m.mechanic_id)
     WHERE trim(t.token) = v_clean
       AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
     LIMIT 1;
  END IF;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
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

  DELETE FROM kmb_projek.mechanic_tokens WHERE upper(trim(mechanic_id)) = v_target_id;
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

```

#### Langkah B — Copy-Paste File Worker di VS Code Anda Lalu Jalankan `wrangler deploy`

1. **Ganti isi file `workers/kmbprojek/src/web-handler.js` di VS Code Anda dengan kode lengkap ini** (sudah mengunci `/web` & `/api/web` langsung ke Supabase tanpa lewat `gas-tiruan`, memperbaiki `Error 1101` di `approvals`, memperbaiki tombol `← Kembali ke Monitoring`, dan menambahkan halaman `/web?page=users` CRUD):

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
  const sg = w.status_group || (
    ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
      ? 'pending_approval'
      : (st === 'approved' ? 'done' : 'assigned')
  );
  const sl = w.status_label || (
    sg === 'done' ? 'Approved' : (sg === 'pending_approval' ? 'Menunggu Approval' : 'Perlu Diisi Mekanik')
  );
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
    team_count: w.team_count || team.length || 1,
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

  if (page === 'users' || page === 'user' || page === 'admin') {
    return new Response(renderHalamanCrudUserWeb(env.RUMAH || 'kmbprojek', token, user), {
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
    if (['create', 'workorder'].includes(page)) {
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

      context.pendingApprovals = (dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(lengkapiObjekWoWeb);
      context.pendingTransfers = (dp.transfers || []).map(lengkapiObjekWoWeb);
      context.activeWos = (da.active || da.wos || (Array.isArray(da) ? da : [])).map(lengkapiObjekWoWeb);
      context.approvedWos = (dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(lengkapiObjekWoWeb);
      context.rejectedWos = (dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(lengkapiObjekWoWeb);
      context.allMechanics = dref.mechanics || [];
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const [myWos, mon] = await Promise.all([
        panggilAksiInternal('pull_my_wos', token, {}, env),
        panggilAksiInternal('pull_monitoring', token, {}, env),
      ]);
      const dm = ekstrakIsi(myWos);
      const dmon = ekstrakIsi(mon);
      const rawWosList = dm.wos || (Array.isArray(dm) ? dm : []);
      const enrichedWos = rawWosList.map(lengkapiObjekWoWeb).map((w) => {
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
      const computedCounts = dm.counts || {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      const filteredWos = ['assigned', 'pending_approval', 'done'].includes(activeFilter)
        ? enrichedWos.filter((w) => w.status_group === activeFilter)
        : enrichedWos;
      context.initialData = {
        wos: filteredWos,
        counts: computedCounts,
        viewing_as: context.viewAsMechanicId || null,
        mechanic: user,
      };
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);
      context.monitoringData = {
        overall: (dmon && dmon.overall) || {
          mechanics: mechsArr.length,
          pending_mechanic_work: mechsArr.reduce((a, m) => a + (Number(m.pending_mechanic_work) || 0), 0),
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
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const dmon = ekstrakIsi(mon);
      const ov = dmon.overall || {};
      context.dashboardData = {
        stats: dmon.stats || {
          totalWOs: (ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0) + (ov.approved || 0),
          approved: ov.approved || 0,
          pending: (ov.pending_mechanic_work || 0) + (ov.pending_l1 || 0) + (ov.pending_l2 || 0),
          totalPoints: ov.total_points || 0,
        },
        recentWOs: (dmon.recentWOs || []).map(lengkapiObjekWoWeb),
        charts: dmon.charts || { pointsTrend: { labels: [], data: [] } },
      };
    }
  } catch (err) {
    console.error('Error saat mempersiapkan context halaman web:', err);
  }

  const html = renderWebPage(page, context);
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


function renderHalamanCrudUserWeb(rumah, token, user) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manajemen User (CRUD) - ${esc(rumah.toUpperCase())}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #0F172A; padding: 20px; }
    .container { max-width: 1180px; margin: 0 auto; }
    .navbar { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .nav-brand { font-weight: 700; margin-right: 12px; }
    .nav-link { text-decoration: none; color: #475569; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .nav-link.active { background: #F1F4EE; color: #384B2B; font-weight: 700; }
    .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    h1 { font-size: 22px; margin-bottom: 6px; }
    .sub { color: #64748B; font-size: 13.5px; margin-bottom: 16px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; margin-bottom: 14px; }
    input, select { padding: 9px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 14px; }
    .btn { padding: 9px 14px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
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
    .modal-box { background: #fff; border-radius: 14px; max-width: 480px; width: 100%; padding: 22px; }
    .form-group { margin-bottom: 12px; display: flex; flex-direction: column; gap: 5px; }
    .form-group label { font-size: 12.5px; font-weight: 600; color: #334155; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="navbar">
      <div class="nav-brand">⚙️ MAR (${esc(rumah.toUpperCase())})</div>
      <a href="/web?page=dashboard&token=${encodeURIComponent(token)}" class="nav-link">Dashboard</a>
      <a href="/web?page=create&token=${encodeURIComponent(token)}" class="nav-link">Create WO</a>
      <a href="/web?page=mechanic&token=${encodeURIComponent(token)}" class="nav-link">Monitoring</a>
      <a href="/web?page=approvals&token=${encodeURIComponent(token)}" class="nav-link">Approvals</a>
      <a href="/web?page=users&token=${encodeURIComponent(token)}" class="nav-link active">👥 Users (CRUD)</a>
      <span style="margin-left:auto;font-size:13px;color:#475569;font-weight:600;">${esc(user.mechanic_name || user.name || user.mechanic_id)}</span>
    </nav>

    <div class="card">
      <h1>👥 Manajemen Pengguna & Token (CRUD)</h1>
      <p class="sub">Tambah (Create), Lihat (Read), Ubah Role/Data & Ganti Token (Update), atau Hapus Pengguna (Delete) langsung di Supabase.</p>
      <div class="toolbar">
        <input type="search" id="cari" placeholder="🔍 Cari ID, nama, role, section..." oninput="renderTabel()" style="min-width:260px;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="muatUsers()">🔄 Muat Ulang</button>
          <button class="btn btn-primary" onclick="bukaModal()">+ Tambah User Baru</button>
        </div>
      </div>
      <div id="pesanStatus" style="margin-bottom:10px;font-size:13px;color:#0369A1;display:none;"></div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nama</th>
              <th>Role</th>
              <th>Section / Golongan</th>
              <th>Status</th>
              <th>Token</th>
              <th>Aksi CRUD</th>
            </tr>
          </thead>
          <tbody id="tbodyUsers">
            <tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">Memuat daftar pengguna...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="modal" id="modalUser">
    <div class="modal-box">
      <h3 id="judulModal" style="margin-bottom:14px;">Tambah / Edit User</h3>
      <div class="form-group">
        <label>Kode / ID Mekanik (contoh: MNT-015, SPV-003)</label>
        <input type="text" id="fId" placeholder="MNT-015">
      </div>
      <div class="form-group">
        <label>Nama Lengkap</label>
        <input type="text" id="fNama" placeholder="Nama lengkap">
      </div>
      <div class="form-group">
        <label>Email (opsional)</label>
        <input type="email" id="fEmail" placeholder="nama@abadiops.com">
      </div>
      <div class="form-group">
        <label>Role</label>
        <select id="fRole">
          <option value="mechanic">mechanic (Mekanik)</option>
          <option value="supervisor">supervisor (L1 Approver / Planner)</option>
          <option value="superintendent">superintendent (L2 Approver / Admin)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Section (maintenance / vessel / workshop / field)</label>
        <input type="text" id="fSection" placeholder="maintenance">
      </div>
      <div class="form-group">
        <label>Position / Golongan</label>
        <input type="text" id="fGolongan" placeholder="junior / senior / 2a / 3a">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="fStatus">
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="tutupModal()">Batal</button>
        <button class="btn btn-primary" onclick="simpanUser()">💾 Simpan</button>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    let DAFTAR = [];

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

    function tutupModal() {
      document.getElementById('modalUser').classList.remove('show');
    }

    function editUser(id) {
      const u = DAFTAR.find((x) => x.mechanic_id === id);
      if (u) bukaModal(u);
    }

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
      if (!r || !r.success) {
        alert('Gagal menyimpan user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error'));
        return;
      }
      tutupModal();
      await muatUsers();
    }

    async function kelolaToken(id, ganti) {
      if (ganti && !confirm('Ganti token untuk ' + id + '? Token lama akan dicabut.')) return;
      const r = await panggilApi('admin_terbitkan_token', { mechanic_id: id, ganti: Boolean(ganti) });
      if (!r || !r.success) {
        alert('Gagal: ' + ((r && (r.error?.message || r.error)) || 'Unknown error'));
        return;
      }
      const tok = (r.result && r.result.token) || (r.data && r.data.token) || '';
      prompt('Token untuk ' + id + ' (Salin):', tok);
      await muatUsers();
    }

    async function hapusUser(id) {
      if (!confirm('Hapus permanen user ' + id + ' beserta tokennya?')) return;
      const r = await panggilApi('admin_hapus_user', { mechanic_id: id });
      if (!r || !r.success) {
        alert('Gagal menghapus user: ' + ((r && (r.error?.message || r.error)) || 'Unknown error'));
        return;
      }
      await muatUsers();
    }

    muatUsers();
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
  const sg = w.status_group || (
    ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
      ? 'pending_approval'
      : (st === 'approved' ? 'done' : 'assigned')
  );
  const sl = w.status_label || (
    sg === 'done' ? 'Approved' : (sg === 'pending_approval' ? 'Menunggu Approval' : 'Perlu Diisi Mekanik')
  );
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
    team_count: w.team_count || team.length || 1,
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
    if (sec === 'vessel' && Array.isArray(refs.jobs_vessel)) {
      jobs = refs.jobs_vessel;
    } else if (sec === 'workshop' && Array.isArray(refs.jobs_workshop)) {
      jobs = refs.jobs_workshop;
    } else if ((sec === 'maintenance' || sec === 'field') && Array.isArray(refs.jobs_field)) {
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
  if (['pull_wo_detail', 'handleMonitoringDetail', 'handleMonitoringDetailWo', 'getMonitoringDetailWo', 'getWODetails', 'getWoDetailForMechanic'].includes(cleanAction)) {
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
      const wos = (Array.isArray(d.result) ? d.result : (d.result.wos || d.result[st] || [])).map(lengkapiWoObj);
      d.result = {
        ...(typeof d.result === 'object' && !Array.isArray(d.result) ? d.result : {}),
        wos,
        [st]: wos,
      };
      if (!d.data) d.data = d.result;
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

  // 9. Aksi Dashboard Teknis, Riwayat Meter, Cek Kiriman, & Payroll Report (Web Desktop)
  if (['cekStatusKiriman', 'handleCekKiriman'].includes(cleanAction)) {
    return {
      success: true,
      source: 'SUPABASE',
      kiriman: 'TIDAK_ADA',
      result: { created: [], failed: [] },
      data: { created: [], failed: [] },
    };
  }
  if (['dataDashboardTeknis', 'handleDataDashboardTeknis', 'dataDashboardField', 'handleDataDashboardField'].includes(cleanAction)) {
    const refs = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const units = (refs && refs.result && (refs.result.units || (refs.result.refs && refs.result.refs.units))) || [];
    return {
      success: true,
      source: 'SUPABASE',
      result: { units, summary: { total_units: units.length } },
      data: { units, summary: { total_units: units.length } },
    };
  }
  if (['riwayatHmUnit', 'handleRiwayatHmUnit', 'riwayatKmUnit', 'handleRiwayatKmUnit'].includes(cleanAction)) {
    const unitId = String(dataObj.unit_id || dataObj.unit_code || '').trim();
    const approved = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
      p_token: cleanToken,
      p_status: 'approved',
    }, env);
    const wos = ((approved && approved.result && approved.result.wos) || []).filter(
      (w) => !unitId || String(w.unit_id || w.unit_code) === unitId
    );
    return {
      success: true,
      source: 'SUPABASE',
      result: wos,
      data: wos,
    };
  }
  if (['generatePayrollReport', 'handleGeneratePayrollReport', 'generateReport'].includes(cleanAction)) {
    const approved = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
      p_token: cleanToken,
      p_status: 'approved',
    }, env);
    const wos = (approved && approved.result && approved.result.wos) || [];
    return {
      success: true,
      source: 'SUPABASE',
      result: { wos, total_wo: wos.length, generated_at: new Date().toISOString() },
      data: { wos, total_wo: wos.length, generated_at: new Date().toISOString() },
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
    const created = [];
    const failed = [];
    for (let i = 0; i < dataObj.blocks.length; i++) {
      const blk = normalisasiBlokWo(dataObj.blocks[i] || {});
      const subRes = await panggilRpcSupabase(`${RPC_PREFIX}_eksekusi_aksi_bertoken`, {
        p_token: cleanToken,
        p_aksi: 'create_wo',
        p_op_id: `${kirimanId}-${i + 1}`,
        p_payload: blk,
        p_skor_js: null,
      }, env);
      if (subRes && subRes.success && subRes.result) {
        created.push({
          ...subRes.result,
          component_name: blk.component_name || blk.others_description || blk.component_id || blk.job_id || 'Pekerjaan',
          unit_id: blk.unit_id || 'WORKSHOP',
        });
      } else {
        failed.push({ index: i, error: (subRes && subRes.error) || 'Gagal membuat baris WO' });
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

3. **Buat file `src/domain/scoring.mjs` di VS Code Anda dengan kode ini** (dipakai oleh `supabase-backend.js`):

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

5. **Ganti isi file `workers/kmbprojek/wrangler.toml` di VS Code Anda dengan konfigurasi ini** (sudah mengaktifkan `SAKLAR = "supabase"`, `STORAGE_MODE = "SUPABASE"`, dan Service Binding `PINTU` di `[env.staging]`):

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

7. **Jalankan perintah deploy ini di Terminal VS Code Anda**:

```bash
npx wrangler deploy --config workers/kmbprojek/wrangler.toml --env staging
```

Setelah Langkah A (Run SQL di Supabase) dan Langkah B (Deploy Worker di VS Code) dijalankan, coba buat 1 WO baru untuk mekanik `ra` di `/web?page=create&token=52fdb552231348ffb143`, lalu buka kembali `/web?page=mechanic&token=kmbp-fkh2jc65&back=52fdb552231348ffb143` — WO tersebut akan langsung muncul di tab **Assigned** dan siap diisi jam mulai/selesainya oleh mekanik `ra`!

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