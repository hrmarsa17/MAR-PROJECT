-- ==============================================================================
-- FUNGSI RPC ADMIN USER & TOKEN UNTUK RUMAH KMB V2 / TRA (Skema `kmb`)
-- Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §2, §5
-- Terisolasi di kamar kmb: tidak menyentuh skema sum atau kmb_projek.
-- ==============================================================================

-- 1. Helper internal pengecekan admin KMB (Hanya service_role)
-- Support struktur flat (token, role, status) dan JSONB (data->>'token')
CREATE OR REPLACE FUNCTION kmb._cek_is_admin(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = kmb, pg_temp
AS $$
DECLARE
    v_role text;
    v_clean text := btrim(coalesce(p_token, ''));
    v_has_data boolean;
BEGIN
    IF v_clean = '' THEN
        RETURN false;
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'kmb' AND table_name = 'api_tokens' AND column_name = 'data')
      INTO v_has_data;

    IF v_has_data THEN
        SELECT lower(coalesce(t.data->>'role', 'mechanic'))
          INTO v_role
          FROM kmb.api_tokens t
         WHERE btrim(coalesce(t.data->>'token', '')) = v_clean
           AND (t.data->>'status' = 'ACTIVE' OR t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
         LIMIT 1;
    ELSE
        SELECT lower(coalesce(t.role, 'mechanic'))
          INTO v_role
          FROM kmb.api_tokens t
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

REVOKE EXECUTE ON FUNCTION kmb._cek_is_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kmb._cek_is_admin(text) TO service_role;

-- 2. RPC public.kmbtra_admin_daftar_user_bertoken
CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb, pg_temp
AS $$
DECLARE
    v_users json;
BEGIN
    IF NOT kmb._cek_is_admin(p_token) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

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
               'kmb' AS rumah
          FROM kmb.api_tokens t
          FULL OUTER JOIN kmb.config_mechanics m
            ON btrim(coalesce(t.data->>'user_id', '')) = btrim(coalesce(m.data->>'mechanic_id', ''))
         WHERE coalesce(t.data->>'token', m.data->>'token', '') <> ''
         ORDER BY coalesce(m.data->>'name', t.data->>'name', '') ASC
      ) u;

    RETURN json_build_object(
        'success', true,
        'result', v_users,
        'rumah', 'kmbtra',
        'source', 'SUPABASE'
    );
END;
$$;

-- 3. RPC public.kmbtra_admin_simpan_user_bertoken
CREATE OR REPLACE FUNCTION public.kmbtra_admin_simpan_user_bertoken(p_token text, p_user jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb, pg_temp
AS $$
DECLARE
    v_uid text := btrim(coalesce(p_user->>'user_id', ''));
    v_name text := btrim(coalesce(p_user->>'name', ''));
    v_token text := btrim(coalesce(p_user->>'token', ''));
    v_role text := lower(btrim(coalesce(p_user->>'role', 'mechanic')));
    v_email text := btrim(coalesce(p_user->>'email', ''));
    v_section text := btrim(coalesce(p_user->>'section', 'workshop'));
    v_status text := upper(btrim(coalesce(p_user->>'status', 'ACTIVE')));
    v_baris int;
BEGIN
    IF NOT kmb._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_uid = '' OR v_name = '' OR v_token = '' THEN
        RETURN json_build_object('success', false, 'error', 'user_id, name, dan token wajib diisi');
    END IF;

    -- Simpan ke cermin kmb.api_tokens
    SELECT coalesce(max(baris), 0) + 1 INTO v_baris FROM kmb.api_tokens;
    INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
    VALUES (
        v_baris,
        jsonb_build_array(v_token, v_role, v_uid, v_name, v_status),
        jsonb_build_object('token', v_token, 'role', v_role, 'user_id', v_uid, 'name', v_name, 'status', v_status),
        now()
    );

    -- Simpan / update ke cermin kmb.config_mechanics
    SELECT coalesce(max(baris), 0) + 1 INTO v_baris FROM kmb.config_mechanics;
    INSERT INTO kmb.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
        v_baris,
        jsonb_build_array(v_uid, v_name, v_section, v_token, v_email, v_role, v_status),
        jsonb_build_object('mechanic_id', v_uid, 'name', v_name, 'section', v_section, 'token', v_token, 'email', v_email, 'role', v_role, 'status', v_status),
        now()
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Pengguna berhasil disimpan di KMB',
        'result', jsonb_build_object('user_id', v_uid, 'name', v_name, 'token', v_token, 'role', v_role)
    );
END;
$$;

-- 4. RPC public.kmbtra_admin_set_token_status_bertoken
CREATE OR REPLACE FUNCTION public.kmbtra_admin_set_token_status_bertoken(p_token text, p_target_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb, pg_temp
AS $$
DECLARE
    v_target text := btrim(coalesce(p_target_token, ''));
    v_st text := upper(btrim(coalesce(p_status, 'ACTIVE')));
BEGIN
    IF NOT kmb._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_target = '' THEN
        RETURN json_build_object('success', false, 'error', 'Target token wajib diisi');
    END IF;

    UPDATE kmb.api_tokens
       SET data = jsonb_set(data, '{status}', to_jsonb(v_st)),
           sinkron_at = now()
     WHERE btrim(coalesce(data->>'token', '')) = v_target;

    RETURN json_build_object('success', true, 'message', 'Status token KMB berhasil diperbarui ke ' || v_st);
END;
$$;
