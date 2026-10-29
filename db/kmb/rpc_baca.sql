-- ==============================================================================
-- FUNGSI RPC BACA SUPABASE UNTUK RUMAH KMB V2 / TRA (Skema `kmb`)
-- Sesuai Tahap 4: Aksi Baca Cermin Langsung dari kmb
-- Berdasarkan db/kmb/cermin_sheet.sql
-- ==============================================================================

-- 1. RPC kmbtra_ping: Resolusi token instan KMB V2
CREATE OR REPLACE FUNCTION public.kmbtra_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user record;
BEGIN
    SELECT t.data->>'token' as token,
           coalesce(m.data->>'role', 'mechanic') as role,
           coalesce(m.data->>'name', t.data->>'mechanic_id', '') as name,
           t.data->>'mechanic_id' as mechanic_id,
           coalesce(m.data->>'email', t.data->>'email', '') as email,
           coalesce(m.data->>'section', '') as section
      INTO v_user
      FROM kmb.api_tokens t
      LEFT JOIN kmb.config_mechanics m 
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
            'section', coalesce(v_user.section, ''),
            'tenant_code', 'KMB',
            'rumah', 'kmbtra'
        ),
        'source', 'SUPABASE'
    );
END;
$$;

-- 2. RPC kmbtra_create_refs: Katalog unit, komponen, mekanik KMB V2
CREATE OR REPLACE FUNCTION public.kmbtra_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_units json;
    v_comps json;
    v_mechs json;
    v_factors json;
BEGIN
    -- Units
    SELECT coalesce(json_agg(json_build_object(
        'unit_id', data->>'unit_id',
        'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
        'unit_factor', coalesce((data->>'unit_factor')::numeric, 1.0),
        'status', coalesce(data->>'status', 'ACTIVE')
    ) ORDER BY data->>'unit_id'), '[]'::json)
    INTO v_units
    FROM kmb.config_units
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
    FROM kmb.config_components
    WHERE data->>'status' IS NULL OR data->>'status' = 'ACTIVE';

    -- Mechanics
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', data->>'mechanic_id',
        'name', data->>'name',
        'email', coalesce(data->>'email', ''),
        'section', coalesce(data->>'section', '')
    ) ORDER BY data->>'name'), '[]'::json)
    INTO v_mechs
    FROM kmb.config_mechanics
    WHERE (data->>'status' IS NULL OR data->>'status' = 'ACTIVE')
      AND coalesce(data->>'role', 'mechanic') = 'mechanic';

    -- Factors
    SELECT coalesce(json_agg(json_build_object(
        'factor_type', coalesce(data->>'factor_type', data->>'type', ''),
        'key', data->>'key',
        'value', (data->>'value')::numeric
    )), '[]'::json)
    INTO v_factors
    FROM kmb.config_factors;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'units', v_units,
            'components', v_comps,
            'mechanics', v_mechs,
            'factors', v_factors,
            'work_conditions', json_build_array(
                json_build_object('key', 'normal', 'label', 'Normal (Shift 1)', 'factor', 1.0),
                json_build_object('key', 'difficult', 'label', 'Difficult (Shift 2)', 'factor', 1.1),
                json_build_object('key', 'extreme', 'label', 'Extreme', 'factor', 1.2)
            ),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 3. RPC kmbtra_monitoring_bertoken: KPI Monitoring Pengawas KMB V2
CREATE OR REPLACE FUNCTION public.kmbtra_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user record;
    v_total_mechs int;
    v_pending_work int;
    v_pending_l1 int;
    v_pending_l2 int;
    v_approved int;
    v_mechs json;
BEGIN
    -- Validasi token
    SELECT t.data->>'mechanic_id' as mechanic_id,
           coalesce(m.data->>'role', 'mechanic') as role
      INTO v_user
      FROM kmb.api_tokens t
      LEFT JOIN kmb.config_mechanics m 
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
      FROM kmb.config_mechanics
     WHERE (data->>'status' IS NULL OR data->>'status' = 'ACTIVE')
       AND coalesce(data->>'role', 'mechanic') = 'mechanic';

    -- Agregat status WO dari tabel cermin kmb.work_orders
    SELECT
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) IN ('OPEN', 'ACTIVE', 'ASSIGNED')), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'PENDING_L1'), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'PENDING_L2'), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'APPROVED'), 0)::int
      INTO v_pending_work, v_pending_l1, v_pending_l2, v_approved
      FROM kmb.work_orders;

    -- Ringkasan per mekanik
    WITH per_mech AS (
        SELECT m.data->>'mechanic_id' as mechanic_id,
               m.data->>'name' as name,
               coalesce(m.data->>'section', '') as section,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) IN ('OPEN', 'ACTIVE', 'ASSIGNED')), 0)::int as pending_work,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'PENDING_L1'), 0)::int as pending_l1,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'PENDING_L2'), 0)::int as pending_l2,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'APPROVED'), 0)::int as approved
          FROM kmb.config_mechanics m
          LEFT JOIN kmb.work_order_team t ON trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
          LEFT JOIN kmb.work_orders w ON trim(w.data->>'id') = trim(t.data->>'wo_id')
         WHERE (m.data->>'status' IS NULL OR m.data->>'status' = 'ACTIVE')
           AND coalesce(m.data->>'role', 'mechanic') = 'mechanic'
         GROUP BY m.data->>'mechanic_id', m.data->>'name', m.data->>'section'
    )
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', mechanic_id,
        'name', name,
        'section', section,
        'pending_work', pending_work,
        'pending_l1', pending_l1,
        'pending_l2', pending_l2,
        'approved', approved
    ) ORDER BY name), '[]'::json)
    INTO v_mechs
    FROM per_mech;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'overall', json_build_object(
                'mechanics', v_total_mechs,
                'pending_mechanic_work', v_pending_work,
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

