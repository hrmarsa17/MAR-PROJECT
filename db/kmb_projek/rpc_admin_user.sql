-- ==============================================================================
-- FUNGSI RPC ADMIN USER & TOKEN UNTUK RUMAH KMB PROJECT (Skema `kmb_projek`)
-- Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §2, §5
-- Terisolasi di kamar kmb_projek: tidak menyentuh skema kmb atau sum.
-- ==============================================================================

-- 1. Helper internal pengecekan admin KMB Project (Hanya service_role)
-- Support struktur flat (token, role, status) dan JSONB (data->>'token')
CREATE OR REPLACE FUNCTION kmb_projek._cek_is_admin(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = kmb_projek, pg_temp
AS $$
DECLARE
    v_role text;
    v_clean text := btrim(coalesce(p_token, ''));
    v_has_data boolean;
BEGIN
    IF v_clean = '' THEN
        RETURN false;
    END IF;

    -- Cek apakah tabel pakai kolom data JSONB atau struktur flat
    SELECT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data')
      INTO v_has_data;

    IF v_has_data THEN
        -- Struktur JSONB
        SELECT lower(coalesce(t.data->>'role', 'mechanic'))
          INTO v_role
          FROM kmb_projek.api_tokens t
         WHERE btrim(coalesce(t.data->>'token', '')) = v_clean
           AND (t.data->>'status' = 'ACTIVE' OR t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
         LIMIT 1;
    ELSE
        -- Struktur flat
        SELECT lower(coalesce(t.role, 'mechanic'))
          INTO v_role
          FROM kmb_projek.api_tokens t
         WHERE btrim(coalesce(t.token, '')) = v_clean
           AND (t.status = 'ACTIVE' OR t.status IS NULL)
         LIMIT 1;
    END IF;

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_role IN ('superintendent', 'supervisor', 'admin', 'manager', 'l1', 'l2');
END;
$$;

REVOKE EXECUTE ON FUNCTION kmb_projek._cek_is_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kmb_projek._cek_is_admin(text) TO service_role;

-- 2. RPC public.kmb_admin_daftar_user_bertoken
-- Support struktur flat dan JSONB
CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_users json;
    v_has_data boolean;
BEGIN
    IF NOT kmb_projek._cek_is_admin(p_token) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data')
      INTO v_has_data;

    IF v_has_data THEN
        SELECT coalesce(json_agg(u), '[]'::json)
          INTO v_users
          FROM (
            SELECT coalesce(t.data->>'user_id', m.data->>'mechanic_id', '') AS user_id,
                   coalesce(m.data->>'name', t.data->>'name', '') AS name,
                   coalesce(t.data->>'role', m.data->>'role', 'mechanic') AS role,
                   coalesce(m.data->>'section', '') AS section,
                   coalesce(m.data->>'email', t.data->>'email', '') AS email,
                   coalesce(t.data->>'token', m.data->>'token', '') AS token,
                   coalesce(t.data->>'status', 'ACTIVE') AS status,
                   'kmbprojek' AS rumah
              FROM kmb_projek.api_tokens t
              FULL OUTER JOIN kmb_projek.config_mechanics m
                ON btrim(coalesce(t.data->>'user_id', '')) = btrim(coalesce(m.data->>'mechanic_id', ''))
             WHERE coalesce(t.data->>'token', m.data->>'token', '') <> ''
             ORDER BY coalesce(m.data->>'name', t.data->>'name', '') ASC
          ) u;
    ELSE
        SELECT coalesce(json_agg(u), '[]'::json)
          INTO v_users
          FROM (
            SELECT coalesce(t.user_id, m.mechanic_id, '') AS user_id,
                   coalesce(m.name, t.name, '') AS name,
                   coalesce(t.role, m.role, 'mechanic') AS role,
                   coalesce(m.section, '') AS section,
                   coalesce(m.email, '') AS email,
                   coalesce(t.token, m.token, '') AS token,
                   coalesce(t.status, 'ACTIVE') AS status,
                   'kmbprojek' AS rumah
              FROM kmb_projek.api_tokens t
              FULL OUTER JOIN kmb_projek.config_mechanics m
                ON btrim(coalesce(t.user_id, '')) = btrim(coalesce(m.mechanic_id, ''))
             WHERE coalesce(t.token, m.token, '') <> ''
             ORDER BY coalesce(m.name, t.name, '') ASC
          ) u;
    END IF;

    RETURN json_build_object(
        'success', true,
        'result', v_users,
        'rumah', 'kmbprojek',
        'source', 'SUPABASE'
    );
END;
$$;

-- 3. RPC public.kmb_admin_simpan_user_bertoken
-- Support struktur flat dan JSONB
CREATE OR REPLACE FUNCTION public.kmb_admin_simpan_user_bertoken(p_token text, p_user jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_uid text := btrim(coalesce(p_user->>'user_id', ''));
    v_name text := btrim(coalesce(p_user->>'name', ''));
    v_token text := btrim(coalesce(p_user->>'token', ''));
    v_role text := lower(btrim(coalesce(p_user->>'role', 'mechanic')));
    v_email text := btrim(coalesce(p_user->>'email', ''));
    v_section text := btrim(coalesce(p_user->>'section', 'maintenance'));
    v_status text := upper(btrim(coalesce(p_user->>'status', 'ACTIVE')));
    v_has_data boolean;
BEGIN
    IF NOT kmb_projek._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_uid = '' OR v_name = '' OR v_token = '' THEN
        RETURN json_build_object('success', false, 'error', 'user_id, name, dan token wajib diisi');
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data')
      INTO v_has_data;

    IF v_has_data THEN
        INSERT INTO kmb_projek.api_tokens (baris, nilai, data, sinkron_at)
        VALUES (
            (SELECT coalesce(max(baris), 0) + 1 FROM kmb_projek.api_tokens),
            jsonb_build_array(v_token, v_role, v_uid, v_name, v_status),
            jsonb_build_object('token', v_token, 'role', v_role, 'user_id', v_uid, 'name', v_name, 'status', v_status),
            now()
        )
        ON CONFLICT (token) DO UPDATE SET
            role = EXCLUDED.role,
            user_id = EXCLUDED.user_id,
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            sinkron_at = now();

        INSERT INTO kmb_projek.config_mechanics (baris, nilai, data, sinkron_at)
        VALUES (
            (SELECT coalesce(max(baris), 0) + 1 FROM kmb_projek.config_mechanics),
            jsonb_build_array(v_uid, v_name, v_section, v_token, v_email, v_role, v_status),
            jsonb_build_object('mechanic_id', v_uid, 'name', v_name, 'section', v_section, 'token', v_token, 'email', v_email, 'role', v_role, 'status', v_status),
            now()
        )
        ON CONFLICT (mechanic_id) DO UPDATE SET
            name = EXCLUDED.name,
            section = EXCLUDED.section,
            token = EXCLUDED.token,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            sinkron_at = now();
    ELSE
        INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
        VALUES (v_token, v_role, v_uid, v_name, v_status, now())
        ON CONFLICT (token) DO UPDATE SET
            role = EXCLUDED.role,
            user_id = EXCLUDED.user_id,
            name = EXCLUDED.name,
            status = EXCLUDED.status;

        INSERT INTO kmb_projek.config_mechanics (mechanic_id, name, section, token, email, role, status, created_at)
        VALUES (v_uid, v_name, v_section, v_token, v_email, v_role, v_status, now())
        ON CONFLICT (mechanic_id) DO UPDATE SET
            name = EXCLUDED.name,
            section = EXCLUDED.section,
            token = EXCLUDED.token,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            status = EXCLUDED.status;
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Pengguna berhasil disimpan di KMB Project',
        'result', jsonb_build_object('user_id', v_uid, 'name', v_name, 'token', v_token, 'role', v_role)
    );
END;
$$;

-- 4. RPC public.kmb_admin_set_token_status_bertoken
-- Support struktur flat dan JSONB
CREATE OR REPLACE FUNCTION public.kmb_admin_set_token_status_bertoken(p_token text, p_target_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_target text := btrim(coalesce(p_target_token, ''));
    v_st text := upper(btrim(coalesce(p_status, 'ACTIVE')));
    v_has_data boolean;
BEGIN
    IF NOT kmb_projek._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_target = '' THEN
        RETURN json_build_object('success', false, 'error', 'Target token wajib diisi');
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data')
      INTO v_has_data;

    IF v_has_data THEN
        UPDATE kmb_projek.api_tokens
           SET data = jsonb_set(data, '{status}', to_jsonb(v_st)),
               sinkron_at = now()
         WHERE btrim(coalesce(data->>'token', '')) = v_target;
    ELSE
        UPDATE kmb_projek.api_tokens
           SET status = v_st
         WHERE btrim(coalesce(token, '')) = v_target;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Status token KMB Project berhasil diperbarui ke ' || v_st);
END;
$$;

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
