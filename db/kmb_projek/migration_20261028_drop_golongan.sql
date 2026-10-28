-- Migration: Drop golongan column from config_mechanics & update kmb_create_refs RPC
-- Bug #6 Fix: Isolasi rumah - hapus sistem penilaian golongan (milik SUM) dari KMB Project
-- Berlaku: 28 Okt 2026

-- 1. Drop kolom golongan dari tabel cermin
ALTER TABLE kmb_projek.config_mechanics
DROP COLUMN IF EXISTS golongan;

-- 2. Update RPC kmb_create_refs agar tidak membaca kolom golongan / position
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

    -- Mechanics (Murni tanpa kolom golongan / position, 100% identik GAS KMB Project)
    SELECT json_agg(json_build_object(
        'mechanic_id', m.mechanic_id,
        'mechanic_name', m.name,
        'section', m.section
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

    -- Jobs per section (1:1 GAS format from catalog_jobs)
    SELECT coalesce(json_agg(json_build_object(
        'job_id', j.job_id,
        'unit_model', j.unit_model,
        'component', j.component,
        'sub_component', j.sub_component,
        'job_description', j.job_description,
        'plan_hours', j.plan_hours,
        'base_point', j.base_point,
        'job_type', j.job_type
    ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::json)
    INTO v_jobs_field
    FROM kmb_projek.catalog_jobs j
    WHERE j.section = 'maintenance' AND j.status = 'ACTIVE';

    SELECT '[]'::json INTO v_jobs_workshop;

    SELECT coalesce(json_agg(json_build_object(
        'job_id', j.job_id,
        'unit_model', j.unit_model,
        'component', j.component,
        'sub_component', j.sub_component,
        'job_description', j.job_description,
        'plan_hours', j.plan_hours,
        'base_point', j.base_point,
        'job_type', j.job_type
    ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::json)
    INTO v_jobs_vessel
    FROM kmb_projek.catalog_jobs j
    WHERE j.section = 'vessel' AND j.status = 'ACTIVE';

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
                'sections', json_build_array('vessel', 'maintenance'),
                'units', coalesce(v_units, '[]'::json),
                'mechanics', coalesce(v_mechs, '[]'::json),
                'components', coalesce(v_comps, '[]'::json),
                'jobs_field', v_jobs_field,
                'jobs_workshop', v_jobs_workshop,
                'jobs_vessel', v_jobs_vessel,
                'factors', v_factors,
                'work_conditions', json_build_array(
                    json_build_object('key', 'normal', 'label', 'Shift 1', 'factor', 1),
                    json_build_object('key', 'difficult', 'label', 'Shift 2', 'factor', 1.1),
                    json_build_object('key', 'extreme', 'label', 'Kondisi Ekstrim', 'factor', 1.2)
                )
            ),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

