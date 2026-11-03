-- ==============================================================================
-- FUNGSI RPC ADMIN USER & TOKEN UNTUK RUMAH SUM V2 (Skema `sum`)
-- Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §2, §5
-- Terisolasi di kamar sum: tidak menyentuh skema kmb atau kmb_projek.
-- ==============================================================================

-- 1. Helper internal pengecekan admin SUM (Hanya service_role)
CREATE OR REPLACE FUNCTION sum._cek_is_admin(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
DECLARE
    v_role text;
    v_clean text := btrim(coalesce(p_token, ''));
BEGIN
    IF v_clean = '' THEN
        RETURN false;
    END IF;

    -- Cek dari tabel cermin api_tokens + config_mechanics
    SELECT lower(coalesce(m.data->>'role', t.data->>'role', 'mechanic'))
      INTO v_role
      FROM sum.api_tokens t
      LEFT JOIN sum.config_mechanics m 
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
        OR trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
     WHERE btrim(coalesce(t.data->>'token', '')) = v_clean
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_role IN ('superintendent', 'supervisor', 'admin', 'planner', 'foreman');
END;
$$;

REVOKE EXECUTE ON FUNCTION sum._cek_is_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sum._cek_is_admin(text) TO service_role;

-- 2. RPC public.sum_admin_daftar_user_bertoken
CREATE OR REPLACE FUNCTION public.sum_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sum, pg_temp
AS $$
DECLARE
    v_users json;
BEGIN
    IF NOT sum._cek_is_admin(p_token) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    SELECT coalesce(json_agg(u), '[]'::json)
      INTO v_users
      FROM (
        SELECT coalesce(t.data->>'mechanic_id', m.data->>'mechanic_id', '') AS user_id,
               coalesce(m.data->>'name', t.data->>'mechanic_id', '') AS name,
               coalesce(m.data->>'role', t.data->>'role', 'mechanic') AS role,
               coalesce(m.data->>'jabatan_aktual', '') AS jabatan,
               coalesce(m.data->>'golongan', '') AS golongan,
               coalesce(m.data->>'email', t.data->>'email', '') AS email,
               coalesce(t.data->>'token', '') AS token,
               CASE WHEN t.data->>'is_active' = 'false' THEN 'INACTIVE' ELSE 'ACTIVE' END AS status,
               'sum' AS rumah
          FROM sum.api_tokens t
          FULL OUTER JOIN sum.config_mechanics m
            ON btrim(coalesce(t.data->>'mechanic_id', '')) = btrim(coalesce(m.data->>'mechanic_id', ''))
         WHERE coalesce(t.data->>'token', '') <> ''
         ORDER BY coalesce(m.data->>'name', t.data->>'mechanic_id', '') ASC
      ) u;

    RETURN json_build_object(
        'success', true,
        'result', v_users,
        'rumah', 'sum',
        'source', 'SUPABASE'
    );
END;
$$;

-- 3. RPC public.sum_admin_simpan_user_bertoken
CREATE OR REPLACE FUNCTION public.sum_admin_simpan_user_bertoken(p_token text, p_user jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sum, pg_temp
AS $$
DECLARE
    v_uid text := btrim(coalesce(p_user->>'user_id', ''));
    v_name text := btrim(coalesce(p_user->>'name', ''));
    v_token text := btrim(coalesce(p_user->>'token', ''));
    v_role text := lower(btrim(coalesce(p_user->>'role', 'mechanic')));
    v_email text := btrim(coalesce(p_user->>'email', ''));
    v_status text := upper(btrim(coalesce(p_user->>'status', 'ACTIVE')));
    v_is_active text := CASE WHEN v_status = 'ACTIVE' THEN 'true' ELSE 'false' END;
    v_baris int;
BEGIN
    IF NOT sum._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_uid = '' OR v_name = '' OR v_token = '' THEN
        RETURN json_build_object('success', false, 'error', 'user_id, name, dan token wajib diisi');
    END IF;

    -- Simpan ke cermin sum.api_tokens
    SELECT coalesce(max(baris), 0) + 1 INTO v_baris FROM sum.api_tokens;
    INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
    VALUES (
        v_baris,
        jsonb_build_array(v_token, v_uid, v_email, v_is_active),
        jsonb_build_object('token', v_token, 'mechanic_id', v_uid, 'email', v_email, 'is_active', v_is_active),
        now()
    );

    -- Simpan ke cermin sum.config_mechanics
    SELECT coalesce(max(baris), 0) + 1 INTO v_baris FROM sum.config_mechanics;
    INSERT INTO sum.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
        v_baris,
        jsonb_build_array(v_uid, v_name, v_email, v_role, '', '', v_is_active),
        jsonb_build_object('mechanic_id', v_uid, 'name', v_name, 'email', v_email, 'role', v_role, 'is_active', v_is_active),
        now()
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Pengguna berhasil disimpan di SUM',
        'result', jsonb_build_object('user_id', v_uid, 'name', v_name, 'token', v_token, 'role', v_role)
    );
END;
$$;

-- 4. RPC public.sum_admin_set_token_status_bertoken
CREATE OR REPLACE FUNCTION public.sum_admin_set_token_status_bertoken(p_token text, p_target_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sum, pg_temp
AS $$
DECLARE
    v_target text := btrim(coalesce(p_target_token, ''));
    v_st text := upper(btrim(coalesce(p_status, 'ACTIVE')));
    v_is_active text := CASE WHEN v_st = 'ACTIVE' THEN 'true' ELSE 'false' END;
BEGIN
    IF NOT sum._cek_is_admin(p_token) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    IF v_target = '' THEN
        RETURN json_build_object('success', false, 'error', 'Target token wajib diisi');
    END IF;

    UPDATE sum.api_tokens
       SET data = jsonb_set(data, '{is_active}', to_jsonb(v_is_active)),
           sinkron_at = now()
     WHERE btrim(coalesce(data->>'token', '')) = v_target;

    RETURN json_build_object('success', true, 'message', 'Status token SUM berhasil diperbarui ke ' || v_st);
END;
$$;
