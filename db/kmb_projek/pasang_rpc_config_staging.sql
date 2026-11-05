-- ==============================================================================
-- PASANG RPC MASTER CONFIG & USER ADMIN PUSAT (3 RUMAH: SUM, KMB TRA, KMB PROJEK)
-- Database: Supabase Staging (dnnqrslftndcbmnvuveb)
-- ==============================================================================

-- 1. PASTIKAN TIGA SKEMA TERSEDIA
CREATE SCHEMA IF NOT EXISTS kmb_projek;
CREATE SCHEMA IF NOT EXISTS sum;
CREATE SCHEMA IF NOT EXISTS kmb;

-- 2. TABEL CONFIG & MASTER DATA RUMAH KMB PROJEK (Relasional)
CREATE TABLE IF NOT EXISTS kmb_projek.config_units (
    unit_code TEXT PRIMARY KEY,
    unit_name TEXT,
    model TEXT,
    section TEXT DEFAULT 'field',
    unit_factor NUMERIC DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb_projek.config_components (
    component_id TEXT PRIMARY KEY,
    component_name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    base_points NUMERIC DEFAULT 1.0,
    target_hours NUMERIC DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs (
    job_id TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'maintenance',
    unit_model TEXT,
    component TEXT NOT NULL,
    sub_component TEXT,
    job_description TEXT NOT NULL,
    plan_hours NUMERIC DEFAULT 2.0,
    base_point NUMERIC DEFAULT 1.0,
    job_type TEXT DEFAULT 'Preventive',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (section, job_id)
);

CREATE TABLE IF NOT EXISTS kmb_projek.config_factors (
    factor_type TEXT NOT NULL,
    key TEXT NOT NULL,
    value NUMERIC NOT NULL DEFAULT 1.0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (factor_type, key)
);

CREATE TABLE IF NOT EXISTS kmb_projek.api_tokens (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'mechanic',
    user_id TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb_projek.config_mechanics (
    mechanic_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'mechanic',
    section TEXT DEFAULT 'field',
    email TEXT,
    jabatan_aktual TEXT,
    golongan TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABEL CONFIG & MASTER DATA RUMAH SUM V2 (Cermin JSONB)
CREATE TABLE IF NOT EXISTS sum.config_units (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sum.config_components (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sum.config_factors (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sum.api_tokens (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sum.config_mechanics (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABEL CONFIG & MASTER DATA RUMAH KMB TRA (Cermin JSONB)
CREATE TABLE IF NOT EXISTS kmb.config_units (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb.config_components (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb.config_factors (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb.api_tokens (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kmb.config_mechanics (
    baris INT PRIMARY KEY,
    nilai JSONB DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sinkron_at TIMESTAMPTZ DEFAULT NOW()
);

-- REVOKE AKSES LANGSUNG KE TABEL DARI ANON & AUTHENTICATED
REVOKE ALL ON ALL TABLES IN SCHEMA sum FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA kmb FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA kmb_projek FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA sum TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA kmb TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA kmb_projek TO postgres, service_role;

-- ==============================================================================
-- 5. VALIDASI ADMIN TOKEN PUSAT & SESI PANEL
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
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object('ok', true, 'mechanic_id', 'GABRIEL-PANEL', 'name', 'Panel Saklar Pusat', 'role', 'admin');
  END IF;

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role
    INTO v_user
    FROM sum.api_tokens t
    LEFT JOIN sum.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
   LIMIT 1;

  IF v_user.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  RETURN jsonb_build_object('ok', true, 'mechanic_id', v_user.mechanic_id, 'name', v_user.name, 'role', v_user.role);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmbtra_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object('ok', true, 'mechanic_id', 'GABRIEL-PANEL', 'name', 'Panel Saklar Pusat', 'role', 'admin');
  END IF;

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role
    INTO v_user
    FROM kmb.api_tokens t
    LEFT JOIN kmb.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
   LIMIT 1;

  IF v_user.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  RETURN jsonb_build_object('ok', true, 'mechanic_id', v_user.mechanic_id, 'name', v_user.name, 'role', v_user.role);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmb_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  IF v_clean = '__PANEL_SAKLAR_PUSAT__' THEN
    RETURN jsonb_build_object('ok', true, 'mechanic_id', 'GABRIEL-PANEL', 'name', 'Panel Saklar Pusat', 'role', 'admin');
  END IF;

  SELECT t.token,
         coalesce(nullif(trim(m.mechanic_id), ''), trim(t.user_id), '') AS mechanic_id,
         coalesce(nullif(trim(m.name), ''), trim(t.name), trim(t.user_id), '') AS name,
         lower(coalesce(nullif(trim(m.role), ''), trim(t.role), 'mechanic')) AS role
    INTO v_user
    FROM kmb_projek.api_tokens t
    LEFT JOIN kmb_projek.config_mechanics m
      ON (nullif(trim(t.user_id), '') IS NOT NULL AND trim(t.user_id) = trim(m.mechanic_id))
   WHERE trim(t.token) = v_clean
     AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
   LIMIT 1;

  IF v_user.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  RETURN jsonb_build_object('ok', true, 'mechanic_id', v_user.mechanic_id, 'name', v_user.name, 'role', v_user.role);
END;
$$;

-- ==============================================================================
-- 6. RPC DAFTAR, SIMPAN, HAPUS CONFIG UNTUK RUMAH SUM V2
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
    'unit_code', coalesce(data->>'unit_code', data->>'unit_id', ''),
    'unit_name', coalesce(data->>'unit_name', data->>'name', ''),
    'model', coalesce(data->>'model', data->>'unit_model', ''),
    'section', coalesce(data->>'section', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', data->>'factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', data->>'unit_code', '')), '[]'::jsonb)
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
    'result', jsonb_build_object('rumah', 'sum', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors),
    'data', jsonb_build_object('rumah', 'sum', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors)
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
  v_auth  jsonb := public._sum_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Kode Unit wajib diisi'); END IF;
    v_obj := jsonb_build_object('unit_id', v_id, 'unit_code', v_id, 'unit_name', coalesce(p_payload->>'unit_name', v_id), 'model', coalesce(p_payload->>'model', ''), 'section', coalesce(p_payload->>'section', 'field'), 'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0), 'status', upper(coalesce(p_payload->>'status', 'ACTIVE')));
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
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'ID Komponen wajib diisi'); END IF;
    v_obj := jsonb_build_object('component_id', v_id, 'component_no', v_id, 'component_name', coalesce(p_payload->>'component_name', v_id), 'category', coalesce(p_payload->>'category', 'General'), 'section', coalesce(p_payload->>'section', 'General'), 'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0), 'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0), 'status', upper(coalesce(p_payload->>'status', 'ACTIVE')));
    SELECT baris INTO v_baris FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_id := coalesce(p_payload->>'key', p_payload->>'factor_key', '');
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Key factor wajib diisi'); END IF;
    v_obj := jsonb_build_object('factor_type', coalesce(p_payload->>'factor_type', 'work_condition'), 'key', v_id, 'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0), 'description', coalesce(p_payload->>'description', ''));
    SELECT baris INTO v_baris FROM sum.config_factors WHERE upper(btrim(coalesce(data->>'key', ''))) = upper(v_id) LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_id));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
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
  v_auth  jsonb := public._sum_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci text := upper(btrim(coalesce(p_kunci, '')));
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM sum.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'kunci', v_kunci));
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'kunci', v_kunci));
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM sum.config_factors WHERE upper(btrim(coalesce(data->>'factor_type', '') || ':' || coalesce(data->>'key', ''))) = v_kunci OR upper(btrim(coalesce(data->>'key', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'kunci', v_kunci));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
END;
$$;

-- ==============================================================================
-- 7. RPC DAFTAR, SIMPAN, HAPUS CONFIG UNTUK RUMAH KMB TRA
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
    'unit_code', coalesce(data->>'unit_code', data->>'unit_id', ''),
    'unit_name', coalesce(data->>'unit_name', data->>'name', ''),
    'model', coalesce(data->>'model', data->>'unit_model', ''),
    'section', coalesce(data->>'section', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', data->>'factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', data->>'unit_code', '')), '[]'::jsonb)
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

  v_jobs := v_comps;

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
    'result', jsonb_build_object('rumah', 'kmbtra', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors),
    'data', jsonb_build_object('rumah', 'kmbtra', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors)
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
  v_auth  jsonb := public._kmbtra_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Kode Unit wajib diisi'); END IF;
    v_obj := jsonb_build_object('unit_id', v_id, 'unit_code', v_id, 'unit_name', coalesce(p_payload->>'unit_name', v_id), 'model', coalesce(p_payload->>'model', ''), 'section', coalesce(p_payload->>'section', 'field'), 'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0), 'status', upper(coalesce(p_payload->>'status', 'ACTIVE')));
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
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'ID Komponen wajib diisi'); END IF;
    v_obj := jsonb_build_object('component_id', v_id, 'component_no', v_id, 'component_name', coalesce(p_payload->>'component_name', v_id), 'category', coalesce(p_payload->>'category', 'General'), 'section', coalesce(p_payload->>'section', 'General'), 'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0), 'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0), 'status', upper(coalesce(p_payload->>'status', 'ACTIVE')));
    SELECT baris INTO v_baris FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_id := coalesce(p_payload->>'key', p_payload->>'factor_key', '');
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Key factor wajib diisi'); END IF;
    v_obj := jsonb_build_object('factor_type', coalesce(p_payload->>'factor_type', 'work_condition'), 'key', v_id, 'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0), 'description', coalesce(p_payload->>'description', ''));
    SELECT baris INTO v_baris FROM kmb.config_factors WHERE upper(btrim(coalesce(data->>'key', ''))) = upper(v_id) LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_id));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
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
  v_auth  jsonb := public._kmbtra_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci text := upper(btrim(coalesce(p_kunci, '')));
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'kunci', v_kunci));
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'kunci', v_kunci));
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb.config_factors WHERE upper(btrim(coalesce(data->>'factor_type', '') || ':' || coalesce(data->>'key', ''))) = v_kunci OR upper(btrim(coalesce(data->>'key', ''))) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'kunci', v_kunci));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
END;
$$;

-- ==============================================================================
-- 8. RPC DAFTAR, SIMPAN, HAPUS CONFIG UNTUK RUMAH KMB PROJEK
-- ==============================================================================

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
    'unit_id', coalesce(u.unit_code, ''),
    'unit_code', coalesce(u.unit_code, ''),
    'unit_name', coalesce(u.unit_name, u.unit_code, ''),
    'model', coalesce(u.model, ''),
    'section', coalesce(u.section, 'field'),
    'unit_factor', coalesce(u.unit_factor, 1.0),
    'status', upper(coalesce(u.status, 'ACTIVE'))
  ) ORDER BY u.unit_code), '[]'::jsonb)
  INTO v_units
  FROM kmb_projek.config_units u;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', coalesce(c.component_id, ''),
    'component_no', coalesce(c.component_id, ''),
    'component_name', coalesce(c.component_name, c.component_id, ''),
    'category', coalesce(c.category, 'General'),
    'section', coalesce(c.category, 'General'),
    'base_points', coalesce(c.base_points, 1.0),
    'target_hours', coalesce(c.target_hours, 1.0),
    'status', upper(coalesce(c.status, 'ACTIVE'))
  ) ORDER BY c.component_id), '[]'::jsonb)
  INTO v_comps
  FROM kmb_projek.config_components c;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', coalesce(j.job_id, ''),
    'section', coalesce(j.section, 'maintenance'),
    'unit_model', coalesce(j.unit_model, 'All'),
    'component', coalesce(j.component, ''),
    'sub_component', coalesce(j.sub_component, ''),
    'job_description', coalesce(j.job_description, ''),
    'plan_hours', coalesce(j.plan_hours, 1.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive'),
    'status', upper(coalesce(j.status, 'ACTIVE'))
  ) ORDER BY j.section, j.job_id), '[]'::jsonb)
  INTO v_jobs
  FROM kmb_projek.catalog_jobs j;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', coalesce(f.factor_type, 'factor') || ':' || coalesce(f.key, ''),
    'factor_type', coalesce(f.factor_type, 'work_condition'),
    'key', coalesce(f.key, ''),
    'value', coalesce(f.value, 1.0),
    'description', coalesce(f.description, '')
  ) ORDER BY f.factor_type, f.key), '[]'::jsonb)
  INTO v_factors
  FROM kmb_projek.config_factors f;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbprojek',
    'result', jsonb_build_object('rumah', 'kmbprojek', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors),
    'data', jsonb_build_object('rumah', 'kmbprojek', 'units', v_units, 'components', v_comps, 'jobs', v_jobs, 'factors', v_factors)
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
  v_auth  jsonb := public._kmb_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Kode Unit wajib diisi'); END IF;
    INSERT INTO kmb_projek.config_units (unit_code, unit_name, model, section, unit_factor, status, created_at)
    VALUES (v_id, coalesce(p_payload->>'unit_name', v_id), coalesce(p_payload->>'model', ''), coalesce(p_payload->>'section', 'field'), coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0), upper(coalesce(p_payload->>'status', 'ACTIVE')), now())
    ON CONFLICT (unit_code) DO UPDATE
    SET unit_name = EXCLUDED.unit_name, model = EXCLUDED.model, section = EXCLUDED.section, unit_factor = EXCLUDED.unit_factor, status = EXCLUDED.status;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'ID Komponen wajib diisi'); END IF;
    INSERT INTO kmb_projek.config_components (component_id, component_name, category, base_points, target_hours, status, created_at)
    VALUES (v_id, coalesce(p_payload->>'component_name', v_id), coalesce(p_payload->>'category', 'General'), coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0), coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0), upper(coalesce(p_payload->>'status', 'ACTIVE')), now())
    ON CONFLICT (component_id) DO UPDATE
    SET component_name = EXCLUDED.component_name, category = EXCLUDED.category, base_points = EXCLUDED.base_points, target_hours = EXCLUDED.target_hours, status = EXCLUDED.status;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Job ID wajib diisi'); END IF;
    INSERT INTO kmb_projek.catalog_jobs (job_id, section, unit_model, component, sub_component, job_description, plan_hours, base_point, job_type, status, created_at)
    VALUES (v_id, coalesce(p_payload->>'section', 'maintenance'), coalesce(p_payload->>'unit_model', 'All'), coalesce(p_payload->>'component', ''), coalesce(p_payload->>'sub_component', ''), coalesce(p_payload->>'job_description', ''), coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0), coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0), coalesce(p_payload->>'job_type', 'Preventive'), upper(coalesce(p_payload->>'status', 'ACTIVE')), now())
    ON CONFLICT (section, job_id) DO UPDATE
    SET unit_model = EXCLUDED.unit_model, component = EXCLUDED.component, sub_component = EXCLUDED.sub_component, job_description = EXCLUDED.job_description, plan_hours = EXCLUDED.plan_hours, base_point = EXCLUDED.base_point, job_type = EXCLUDED.job_type, status = EXCLUDED.status;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_id := coalesce(p_payload->>'key', p_payload->>'factor_key', '');
    IF v_id = '' THEN RETURN json_build_object('success', false, 'error', 'Key factor wajib diisi'); END IF;
    INSERT INTO kmb_projek.config_factors (factor_type, key, value, description, created_at)
    VALUES (coalesce(p_payload->>'factor_type', 'work_condition'), v_id, coalesce(nullif(p_payload->>'value', '')::numeric, 1.0), coalesce(p_payload->>'description', ''), now())
    ON CONFLICT (factor_type, key) DO UPDATE
    SET value = EXCLUDED.value, description = EXCLUDED.description;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_id));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
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
  v_auth  jsonb := public._kmb_validasi_admin_token(p_token);
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci text := upper(btrim(coalesce(p_kunci, '')));
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb_projek.config_units WHERE upper(btrim(unit_code)) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'kunci', v_kunci));
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb_projek.config_components WHERE upper(btrim(component_id)) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'kunci', v_kunci));
  ELSIF v_jenis IN ('job', 'jobs') THEN
    DELETE FROM kmb_projek.catalog_jobs WHERE upper(btrim(job_id)) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'kunci', v_kunci));
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb_projek.config_factors WHERE upper(btrim(factor_type || ':' || key)) = v_kunci OR upper(btrim(key)) = v_kunci;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'kunci', v_kunci));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak didukung: ' || v_jenis);
END;
$$;

-- ==============================================================================
-- 9. USER ADMIN RPC ALIASES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sum_admin_daftar_users_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.sum_admin_daftar_user_bertoken(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_users_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.kmbtra_admin_daftar_user_bertoken(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_users_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.kmb_admin_daftar_user_bertoken(p_token);
END;
$$;

-- ==============================================================================
-- 10. GRANTS UNTUK RPC
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_users_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_users_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_users_bertoken(text) TO anon, authenticated, service_role;
