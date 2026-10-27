-- ==============================================================================
-- FUNGSI RPC BACA CEPAT SUPABASE (Sub-20ms) UNTUK CLOUDFLARE WORKER & PORTAL
-- Sesuai Tahap 4: Aksi Baca Cermin Langsung dari kmb_projek
-- ==============================================================================

-- 1. RPC kmb_ping: Resolusi token instan
CREATE OR REPLACE FUNCTION public.kmb_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user record;
BEGIN
    SELECT t.token, t.role, t.name, t.user_id as mechanic_id, m.email, m.section
      INTO v_user
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m ON t.user_id = m.mechanic_id
     WHERE t.token = trim(p_token)
       AND t.status = 'ACTIVE'
     LIMIT 1;

    IF v_user.token IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
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
            'tenant_code', 'KMB'
        ),
        'source', 'SUPABASE'
    );
END;
$$;

-- 2. RPC kmb_create_refs: Katalog unit, job/komponen, mekanik
CREATE OR REPLACE FUNCTION public.kmb_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_units json;
    v_mechs json;
    v_comps json;
    v_jobs_field json;
    v_jobs_workshop json;
    v_jobs_vessel json;
    v_factors json;
BEGIN
    -- Units
    SELECT json_agg(json_build_object(
        'unit_id', u.unit_code,
        'unit_name', u.unit_code,
        'unit_type', coalesce(u.section, 'OTHERS'),
        'unit_model', coalesce(u.model, ''),
        'unit_scope', json_build_array(coalesce(u.section, 'all')),
        'unit_factor', 1
    ) ORDER BY u.unit_code)
    INTO v_units
    FROM kmb_projek.config_units u
    WHERE u.status = 'ACTIVE';

    -- Mechanics
    SELECT json_agg(json_build_object(
        'mechanic_id', m.mechanic_id,
        'mechanic_name', m.name,
        'section', m.section,
        'position', coalesce(m.golongan, 'senior')
    ) ORDER BY m.mechanic_id)
    INTO v_mechs
    FROM kmb_projek.config_mechanics m
    WHERE m.role = 'mechanic' AND m.status = 'ACTIVE';

    -- Components
    SELECT json_agg(json_build_object(
        'component_no', c.component_id,
        'component_name', c.name,
        'target_hours', 4
    ) ORDER BY c.component_id)
    INTO v_comps
    FROM kmb_projek.config_components c
    WHERE c.status = 'ACTIVE';

    -- Jobs per section
    SELECT coalesce(json_agg(json_build_object(
        'job_code', c.component_id,
        'job_name', c.name,
        'target_hours', 4
    )), '[]'::json)
    INTO v_jobs_field
    FROM kmb_projek.config_components c
    WHERE c.status = 'ACTIVE' AND (c.section = 'field' OR c.section IS NULL);

    SELECT coalesce(json_agg(json_build_object(
        'job_code', c.component_id,
        'job_name', c.name,
        'target_hours', 4
    )), '[]'::json)
    INTO v_jobs_workshop
    FROM kmb_projek.config_components c
    WHERE c.status = 'ACTIVE' AND c.section = 'workshop';

    SELECT coalesce(json_agg(json_build_object(
        'job_code', c.component_id,
        'job_name', c.name,
        'target_hours', 4
    )), '[]'::json)
    INTO v_jobs_vessel
    FROM kmb_projek.config_components c
    WHERE c.status = 'ACTIVE' AND c.section = 'vessel';

    -- Factors
    SELECT coalesce(json_agg(json_build_object(
        'type', f.factor_type,
        'key', f.key,
        'value', f.value
    )), '[]'::json)
    INTO v_factors
    FROM kmb_projek.config_factors f;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'refs', json_build_object(
                'sections', json_build_array('maintenance', 'vessel', 'field', 'workshop'),
                'units', coalesce(v_units, '[]'::json),
                'mechanics', coalesce(v_mechs, '[]'::json),
                'components', coalesce(v_comps, '[]'::json),
                'jobs_field', v_jobs_field,
                'jobs_workshop', v_jobs_workshop,
                'jobs_vessel', v_jobs_vessel,
                'factors', v_factors,
                'work_conditions', json_build_array('NORMAL', 'OVERTIME', 'EMERGENCY')
            ),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 3. RPC kmb_monitoring: Ringkasan monitoring mekanik
CREATE OR REPLACE FUNCTION public.kmb_monitoring()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_mechs json;
    v_total int;
    v_p_work int;
    v_p_l1 int;
    v_p_l2 int;
    v_app int;
BEGIN
    WITH mech_counts AS (
        SELECT m.mechanic_id as id,
               m.name,
               m.section,
               coalesce(t.token, '') as token,
               (t.token IS NOT NULL) as has_token,
               ''::text as uji,
               coalesce(count(w.wo_number) filter (where w.status = 'assigned'), 0)::int as pending_mechanic_work,
               coalesce(count(w.wo_number) filter (where w.status = 'pending_supervisor'), 0)::int as pending_l1,
               coalesce(count(w.wo_number) filter (where w.status = 'pending_superintendent'), 0)::int as pending_l2,
               coalesce(count(w.wo_number) filter (where w.status = 'approved'), 0)::int as approved
        FROM kmb_projek.config_mechanics m
        LEFT JOIN kmb_projek.api_tokens t ON t.user_id = m.mechanic_id
        LEFT JOIN kmb_projek.work_orders w ON w.lead_mechanic_id = m.mechanic_id
        WHERE m.role = 'mechanic'
        GROUP BY m.mechanic_id, m.name, m.section, t.token
    )
    SELECT json_agg(json_build_object(
        'id', id,
        'name', name,
        'section', section,
        'token', token,
        'has_token', has_token,
        'uji', uji,
        'pending_mechanic_work', pending_mechanic_work,
        'pending_l1', pending_l1,
        'pending_l2', pending_l2,
        'approved', approved
    ) ORDER BY id),
    count(*)::int,
    coalesce(sum(pending_mechanic_work), 0)::int,
    coalesce(sum(pending_l1), 0)::int,
    coalesce(sum(pending_l2), 0)::int,
    coalesce(sum(approved), 0)::int
    INTO v_mechs, v_total, v_p_work, v_p_l1, v_p_l2, v_app
    FROM mech_counts;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'overall', json_build_object(
                'total_mechanics', coalesce(v_total, 0),
                'pending_mechanic_work', coalesce(v_p_work, 0),
                'pending_l1', coalesce(v_p_l1, 0),
                'pending_l2', coalesce(v_p_l2, 0),
                'approved', coalesce(v_app, 0)
            ),
            'mechanics', coalesce(v_mechs, '[]'::json),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 4. RPC kmb_my_wos: Daftar WO mekanik
CREATE OR REPLACE FUNCTION public.kmb_my_wos(p_mechanic_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wos json;
BEGIN
    SELECT coalesce(json_agg(json_build_object(
        'wo_number', w.wo_number,
        'date', w.date::text,
        'shift', coalesce(w.shift, '1'),
        'unit_code', w.unit_code,
        'component', w.component,
        'activity', w.activity,
        'duration_hours', coalesce(w.duration_hours, 0),
        'status', w.status,
        'points', coalesce(w.points, 0)
    ) ORDER BY w.created_at DESC), '[]'::json)
    INTO v_wos
    FROM kmb_projek.work_orders w
    WHERE w.lead_mechanic_id = p_mechanic_id
       OR w.created_by = p_mechanic_id;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'wos', v_wos,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 5. RPC kmb_wos_by_status: Daftar kartu approval & monitoring
CREATE OR REPLACE FUNCTION public.kmb_wos_by_status(p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wos json;
BEGIN
    SELECT coalesce(json_agg(json_build_object(
        'wo_number', w.wo_number,
        'date', w.date::text,
        'shift', coalesce(w.shift, '1'),
        'unit_code', w.unit_code,
        'component', w.component,
        'activity', w.activity,
        'duration_hours', coalesce(w.duration_hours, 0),
        'status', w.status,
        'points', coalesce(w.points, 0),
        'lead_mechanic_id', w.lead_mechanic_id
    ) ORDER BY w.created_at DESC), '[]'::json)
    INTO v_wos
    FROM kmb_projek.work_orders w
    WHERE (
        (p_status = 'pending' AND w.status IN ('pending_supervisor', 'pending_superintendent')) OR
        (p_status = 'active' AND w.status IN ('assigned', 'in_progress', 'draft')) OR
        (p_status = 'approved' AND w.status = 'approved') OR
        (p_status = 'rejected' AND w.status = 'rejected') OR
        (w.status = p_status)
    );

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'wos', v_wos,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- Beri hak eksekusi ke anon dan authenticated
GRANT EXECUTE ON FUNCTION public.kmb_ping(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_create_refs() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status(text) TO anon, authenticated, service_role;

