-- ==============================================================================
-- FUNGSI RPC BACA SUPABASE UNTUK RUMAH SUM V2 (Skema `sum`)
-- Sesuai Tahap 4: Aksi Baca Cermin Langsung dari sum
-- Berdasarkan db/sum/cermin_sheet.sql & docs/INVENTARIS-SUM.md
-- Diperbarui: 30 Okt 2026 (Perbaikan Bug #22: Wajib Token & Faktor Dinamis 1:1 GAS)
-- ==============================================================================

-- 1. RPC sum_ping: Resolusi token instan SUM V2
CREATE OR REPLACE FUNCTION public.sum_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
BEGIN
    SELECT t.data->>'token' as token,
           coalesce(m.data->>'role', 'mechanic') as role,
           coalesce(m.data->>'name', t.data->>'mechanic_id', '') as name,
           t.data->>'mechanic_id' as mechanic_id,
           coalesce(m.data->>'email', t.data->>'email', '') as email,
           coalesce(m.data->>'jabatan_aktual', '') as jabatan,
           coalesce(m.data->>'golongan', '') as golongan
      INTO v_user
      FROM sum.api_tokens t
      LEFT JOIN sum.config_mechanics m 
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
        OR trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_user.token IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'result', json_build_object(
            'mechanic_id', coalesce(v_user.mechanic_id, ''),
            'name', coalesce(v_user.name, ''),
            'role', coalesce(v_user.role, 'mechanic'),
            'email', coalesce(v_user.email, ''),
            'jabatan_aktual', coalesce(v_user.jabatan, ''),
            'golongan', coalesce(v_user.golongan, ''),
            'tenant_code', 'SUM',
            'rumah', 'sum'
        ),
        'source', 'SUPABASE'
    );
END;
$$;

-- 2. Fungsi Internal: Katalog unit, komponen, mekanik SUM V2 (Tidak boleh dipanggil langsung)
CREATE OR REPLACE FUNCTION public._sum_create_refs_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_units json;
    v_comps json;
    v_mechs json;
    v_factors json;
    v_f_normal numeric := 1.0;
    v_f_difficult numeric := 1.1;
    v_f_extreme numeric := 1.2;
BEGIN
    -- Units
    SELECT coalesce(json_agg(json_build_object(
        'unit_id', data->>'unit_id',
        'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
        'unit_factor', coalesce((data->>'unit_factor')::numeric, 1.0),
        'status', coalesce(data->>'status', 'ACTIVE')
    ) ORDER BY data->>'unit_id'), '[]'::json)
    INTO v_units
    FROM sum.config_units
    WHERE data->>'status' IS NULL OR data->>'status' = 'ACTIVE';

    -- Components
    SELECT coalesce(json_agg(json_build_object(
        'component_id', data->>'component_id',
        'component_name', data->>'component_name',
        'category', coalesce(data->>'category', ''),
        'base_point', coalesce((data->>'base_point')::numeric, 0),
        'target_hours', coalesce((data->>'target_hours')::numeric, 0),
        'status', coalesce(data->>'status', 'ACTIVE')
    ) ORDER BY data->>'component_name'), '[]'::json)
    INTO v_comps
    FROM sum.config_components
    WHERE data->>'status' IS NULL OR data->>'status' = 'ACTIVE';

    -- Mechanics (role = mechanic)
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', data->>'mechanic_id',
        'name', data->>'name',
        'email', coalesce(data->>'email', ''),
        'jabatan_aktual', coalesce(data->>'jabatan_aktual', ''),
        'golongan', coalesce(data->>'golongan', '')
    ) ORDER BY data->>'name'), '[]'::json)
    INTO v_mechs
    FROM sum.config_mechanics
    WHERE (data->>'status' IS NULL OR data->>'status' = 'ACTIVE')
      AND coalesce(data->>'role', 'mechanic') = 'mechanic';

    -- Factors
    SELECT coalesce(json_agg(json_build_object(
        'factor_type', coalesce(data->>'factor_type', data->>'type', ''),
        'key', data->>'key',
        'value', (data->>'value')::numeric
    )), '[]'::json)
    INTO v_factors
    FROM sum.config_factors;

    -- Work Conditions dinamis dari cermin config_factors (Bug #22, 1:1 GAS SUM getWorkConditionOptionsForView)
    SELECT coalesce((data->>'value')::numeric, 1.0) INTO v_f_normal
      FROM sum.config_factors
     WHERE (data->>'factor_type' = 'work_condition' OR data->>'type' = 'work_condition')
       AND (data->>'key' = 'normal' OR data->>'factor_key' = 'normal')
     LIMIT 1;

    SELECT coalesce((data->>'value')::numeric, 1.1) INTO v_f_difficult
      FROM sum.config_factors
     WHERE (data->>'factor_type' = 'work_condition' OR data->>'type' = 'work_condition')
       AND (data->>'key' = 'difficult' OR data->>'factor_key' = 'difficult')
     LIMIT 1;

    SELECT coalesce((data->>'value')::numeric, 1.2) INTO v_f_extreme
      FROM sum.config_factors
     WHERE (data->>'factor_type' = 'work_condition' OR data->>'type' = 'work_condition')
       AND (data->>'key' = 'extreme' OR data->>'factor_key' = 'extreme')
     LIMIT 1;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'units', v_units,
            'components', v_comps,
            'mechanics', v_mechs,
            'factors', v_factors,
            'work_conditions', json_build_array(
                json_build_object('key', 'normal', 'label', 'Normal', 'factor', coalesce(v_f_normal, 1.0)),
                json_build_object('key', 'difficult', 'label', 'Malam/Hujan', 'factor', coalesce(v_f_difficult, 1.1)),
                json_build_object('key', 'extreme', 'label', 'Resiko Tinggi', 'factor', coalesce(v_f_extreme, 1.2))
            ),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 2b. Pembungkus Bertoken Publik: sum_create_refs_bertoken (Wajib Token Sah, Bug #22)
CREATE OR REPLACE FUNCTION public.sum_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sum.api_tokens t
         WHERE trim(t.data->>'token') = btrim(coalesce(p_token, ''))
           AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    RETURN public._sum_create_refs_internal();
END;
$$;

-- Alias backward compatibility (diproteksi hanya untuk service_role)
CREATE OR REPLACE FUNCTION public.sum_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public._sum_create_refs_internal();
END;
$$;

-- 3. RPC sum_monitoring_bertoken: KPI Monitoring Pengawas SUM V2
CREATE OR REPLACE FUNCTION public.sum_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
    v_total_mechs int;
    v_pending_work int;
    v_expired int;
    v_pending_l1 int;
    v_pending_l2 int;
    v_approved int;
    v_mechs json;
BEGIN
    -- Validasi token
    SELECT t.data->>'mechanic_id' as mechanic_id,
           coalesce(m.data->>'role', 'mechanic') as role
      INTO v_user
      FROM sum.api_tokens t
      LEFT JOIN sum.config_mechanics m 
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
        OR trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_user.role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif');
    END IF;

    -- Hitung total mekanik aktif
    SELECT count(*)::int INTO v_total_mechs
      FROM sum.config_mechanics
     WHERE (data->>'status' IS NULL OR data->>'status' = 'ACTIVE')
       AND coalesce(data->>'role', 'mechanic') = 'mechanic';

    -- Agregat status WO dari tabel cermin sum.work_orders
    SELECT
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) IN ('OPEN', 'ACTIVE', 'ASSIGNED')), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'EXPIRED'), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'PENDING_L1'), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'PENDING_L2'), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'APPROVED'), 0)::int
      INTO v_pending_work, v_expired, v_pending_l1, v_pending_l2, v_approved
      FROM sum.work_orders;

    -- Ringkasan per mekanik
    WITH per_mech AS (
        SELECT m.data->>'mechanic_id' as mechanic_id,
               m.data->>'name' as name,
               coalesce(m.data->>'jabatan_aktual', '') as jabatan,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) IN ('OPEN', 'ACTIVE', 'ASSIGNED')), 0)::int as pending_work,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'EXPIRED'), 0)::int as expired,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'PENDING_L1'), 0)::int as pending_l1,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'PENDING_L2'), 0)::int as pending_l2,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'APPROVED'), 0)::int as approved
          FROM sum.config_mechanics m
          LEFT JOIN sum.work_order_team t ON trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
          LEFT JOIN sum.work_orders w ON trim(w.data->>'id') = trim(t.data->>'wo_id')
         WHERE (m.data->>'status' IS NULL OR m.data->>'status' = 'ACTIVE')
           AND coalesce(m.data->>'role', 'mechanic') = 'mechanic'
         GROUP BY m.data->>'mechanic_id', m.data->>'name', m.data->>'jabatan_aktual'
    )
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', mechanic_id,
        'name', name,
        'jabatan', jabatan,
        'pending_work', pending_work,
        'expired', expired,
        'pending_l1', pending_l1,
        'pending_l2', pending_l2,
        'approved', approved
    ) ORDER BY name), '[]'::json)
    INTO v_mechs
    FROM per_mech;

    -- Jika yang memanggil hanya mekanik biasa, sembunyikan daftar mekanik lain (privasi)
    IF lower(coalesce(v_user.role, 'mechanic')) = 'mechanic' THEN
        v_mechs := '[]'::json;
    END IF;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'overall', json_build_object(
                'mechanics', v_total_mechs,
                'pending_mechanic_work', v_pending_work,
                'expired', v_expired,
                'pending_l1', v_pending_l1,
                'pending_l2', v_pending_l2,
                'approved', v_approved
            ),
            'mechanics', v_mechs,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 4. RPC sum_my_wos_bertoken: Daftar WO spesifik mekanik pemegang token
CREATE OR REPLACE FUNCTION public.sum_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
    v_wos json;
BEGIN
    SELECT t.data->>'mechanic_id' as mechanic_id
      INTO v_user
      FROM sum.api_tokens t
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_user.mechanic_id IS NULL THEN
        RETURN json_build_object('success', false, 'result', '[]'::json, 'error', 'Token tidak dikenal / nonaktif');
    END IF;

    SELECT coalesce(json_agg(w.data ORDER BY w.data->>'created_at' DESC), '[]'::json)
      INTO v_wos
      FROM sum.work_orders w
      JOIN sum.work_order_team t ON trim(t.data->>'wo_id') = trim(w.data->>'id')
     WHERE trim(t.data->>'mechanic_id') = trim(v_user.mechanic_id);

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', v_wos,
        'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- Tutup fungsi tanpa token dari publik/anon, hanya buka fungsi bertoken.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._sum_create_refs_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sum_create_refs() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._sum_create_refs_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_create_refs() TO service_role;

GRANT EXECUTE ON FUNCTION public.sum_ping(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_create_refs_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_monitoring_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_my_wos_bertoken(text) TO anon, authenticated, service_role;
