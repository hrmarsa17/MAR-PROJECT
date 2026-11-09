-- ==============================================================================
-- FUNGSI RPC BACKEND MANDIRI SUPABASE UNTUK RUMAH KMB V2 / TRA (Skema `kmb`)
-- Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2, §5
-- Terisolasi di kamar kmb: tidak menyentuh skema sum atau kmb_projek.
-- ==============================================================================

-- 1. Helper internal identifikasi pengguna bertoken di skema kmb
CREATE OR REPLACE FUNCTION kmb._autentikasi_token(p_token text)
RETURNS TABLE (
    mechanic_id text,
    name text,
    role text,
    email text,
    section text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = kmb, pg_temp
AS $$
DECLARE
    v_clean text := btrim(coalesce(p_token, ''));
BEGIN
    IF v_clean = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT coalesce(t.data->>'mechanic_id', t.data->>'user_id', m.data->>'mechanic_id', '') as mechanic_id,
           coalesce(m.data->>'mechanic_name', m.data->>'name', t.data->>'name', t.data->>'mechanic_id', '') as name,
           lower(coalesce(m.data->>'role', t.data->>'role', 'mechanic')) as role,
           coalesce(m.data->>'email', t.data->>'email', '') as email,
           coalesce(m.data->>'section', t.data->>'section', '') as section
      FROM kmb.api_tokens t
      LEFT JOIN kmb.config_mechanics m
        ON lower(btrim(coalesce(t.data->>'email', ''))) = lower(btrim(coalesce(m.data->>'email', '')))
        OR btrim(coalesce(t.data->>'mechanic_id', '')) = btrim(coalesce(m.data->>'mechanic_id', ''))
     WHERE btrim(coalesce(t.data->>'token', '')) = v_clean
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false' OR t.data->>'status' = 'ACTIVE')
     LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION kmb._autentikasi_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kmb._autentikasi_token(text) TO service_role;

-- 2. Dispatcher utama backend mandiri kmb
CREATE OR REPLACE FUNCTION public.kmbtra_eksekusi_aksi_bertoken(
    p_token text,
    p_aksi text,
    p_op_id text DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb,
    p_extra jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb, pg_temp
AS $$
DECLARE
    v_user record;
    v_aksi text := lower(btrim(coalesce(p_aksi, '')));
    v_today_str text;
    v_next_seq integer;
    v_wo_number text;
    v_next_baris integer;
    v_new_data jsonb;
    v_team jsonb := '[]'::jsonb;
    v_wo_id text;
    v_result jsonb;
BEGIN
    -- Autentikasi token
    SELECT * INTO v_user FROM kmb._autentikasi_token(p_token);
    IF v_user.mechanic_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    -- Pastikan tabel penampung WO dan transfer tersedia secara idempoten
    CREATE TABLE IF NOT EXISTS kmb.work_orders (
        baris integer PRIMARY KEY,
        nilai jsonb NOT NULL DEFAULT '[]'::jsonb,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        disinkron_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS kmb.transfer_requests (
        id bigserial PRIMARY KEY,
        baris integer,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS kmb.push_subscriptions (
        id bigserial PRIMARY KEY,
        token text,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );

    -- =========================================================================
    -- Aksi BACA (READ ACTIONS)
    -- =========================================================================
    IF v_aksi = 'ping' THEN
        RETURN jsonb_build_object(
            'success', true,
            'result', jsonb_build_object(
                'mechanic_id', v_user.mechanic_id,
                'name', v_user.name,
                'role', v_user.role,
                'email', v_user.email,
                'section', v_user.section,
                'tenant_code', 'KMB'
            ),
            'source', 'SUPABASE'
        );

    ELSIF v_aksi = 'pull_create_refs' THEN
        RETURN public.kmbtra_create_refs_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring' THEN
        RETURN public.kmbtra_monitoring_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring_daftar' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.config_mechanics;
        RETURN v_result;

    ELSIF v_aksi = 'pull_my_wos' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', jsonb_build_object(
                'wos', coalesce(jsonb_agg(data), '[]'::jsonb)
            ),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE data->>'created_by' = v_user.name
           OR data->>'mechanic_id' = v_user.mechanic_id
           OR lower(trim(data->>'lead_mechanic_id')) = lower(trim(v_user.mechanic_id))
           OR EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'team') = 'array' THEN data->'team' ELSE '[]'::jsonb END) member
                WHERE lower(trim(coalesce(member->>'mechanic_id', member->>'id', member->>'user_id', ''))) = lower(trim(v_user.mechanic_id))
           );
        RETURN v_result;

    ELSIF v_aksi = 'pull_wo_detail' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        SELECT jsonb_build_object(
            'success', true,
            'result', data,
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id
        LIMIT 1;

        IF v_result IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Work Order tidak ditemukan', 'source', 'SUPABASE');
        END IF;
        RETURN v_result;

    ELSIF v_aksi = 'pull_pending' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', jsonb_build_object(
                'pending_l1', coalesce(jsonb_agg(data) FILTER (WHERE lower(data->>'status') IN ('pending_l1', 'pending_supervisor')), '[]'::jsonb),
                'pending_l2', coalesce(jsonb_agg(data) FILTER (WHERE lower(data->>'status') IN ('pending_l2', 'pending_superintendent')), '[]'::jsonb),
                'pending', coalesce(jsonb_agg(data) FILTER (WHERE lower(data->>'status') LIKE 'pending%'), '[]'::jsonb)
            ),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE lower(data->>'status') LIKE 'pending%';
        RETURN v_result;

    ELSIF v_aksi = 'pull_active' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE lower(data->>'status') IN ('active', 'in_progress', 'open', 'assigned', 'pending_mechanic_work');
        RETURN v_result;

    ELSIF v_aksi = 'pull_approved' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE lower(data->>'status') = 'approved';
        RETURN v_result;

    ELSIF v_aksi = 'pull_rejected' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE lower(data->>'status') IN ('rejected', 'cancelled', 'canceled');
        RETURN v_result;

    ELSIF v_aksi = 'pull_cancelable' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.work_orders
        WHERE (data->>'created_by' = v_user.name OR v_user.role IN ('supervisor', 'superintendent', 'admin'))
          AND data->>'status' NOT IN ('APPROVED', 'CANCELED');
        RETURN v_result;

    ELSIF v_aksi = 'pull_transfers' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb.transfer_requests;
        RETURN v_result;

    -- =========================================================================
    -- Aksi TULIS (WRITE ACTIONS)
    -- =========================================================================
    ELSIF v_aksi IN ('create_wo', 'buat_wo') THEN
        -- Penomoran WO 4 digit WIB: WO-YYYYMMDD-XXXX
        v_today_str := to_char((now() AT TIME ZONE 'Asia/Jakarta'), 'YYYYMMDD');
        SELECT coalesce(max(nullif(regexp_replace(data->>'wo_number', '^.*-', ''), '')), '0000')::int + 1
          INTO v_next_seq
          FROM kmb.work_orders
         WHERE data->>'wo_number' LIKE 'WO-' || v_today_str || '-%';

        v_wo_number := 'WO-' || v_today_str || '-' || lpad(coalesce(v_next_seq, 1)::text, 4, '0');

        SELECT coalesce(max(baris), 1) + 1 INTO v_next_baris FROM kmb.work_orders;

        IF jsonb_typeof(p_payload->'team') = 'array' AND jsonb_array_length(p_payload->'team') > 0 THEN
            v_team := p_payload->'team';
        ELSIF jsonb_typeof(p_payload->'team_distribution') = 'object' THEN
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'mechanic_id', btrim(td.key),
                'percentage', coalesce(nullif(td.value, '')::numeric, 100)
            )), '[]'::jsonb)
              INTO v_team
              FROM jsonb_each_text(p_payload->'team_distribution') td
             WHERE lower(btrim(td.key)) NOT IN ('', 'undefined', 'null');
        END IF;

        v_new_data := p_payload || jsonb_build_object(
            'id', v_wo_number,
            'wo_number', v_wo_number,
            'team', v_team,
            'lead_mechanic_id', coalesce(nullif(p_payload->>'lead_mechanic_id', ''), v_team->0->>'mechanic_id', v_user.mechanic_id),
            'status', coalesce(
                nullif(p_payload->>'status', ''),
                CASE WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL OR jsonb_array_length(v_team) > 0
                     THEN 'assigned' ELSE 'PENDING_L1' END
            ),
            'status_group', CASE
                WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL OR jsonb_array_length(v_team) > 0
                THEN 'assigned' ELSE 'pending_approval' END,
            'created_by', coalesce(p_payload->>'created_by', v_user.name),
            'created_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'source', 'SUPABASE'
        );

        INSERT INTO kmb.work_orders (baris, nilai, data, disinkron_at)
        VALUES (v_next_baris, '[]'::jsonb, v_new_data, now());

        RETURN jsonb_build_object(
            'success', true,
            'result', v_new_data,
            'wo_number', v_wo_number,
            'source', 'SUPABASE'
        );

    ELSIF v_aksi IN ('submit_work', 'kirim_kerja') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || p_payload || jsonb_build_object(
               'status', 'PENDING_L1',
               'submitted_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
               'submitted_by', v_user.name
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L1', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('save_override', 'override') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object(
               'override', p_payload,
               'override_by', v_user.name,
               'override_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l1' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object(
               'status', 'PENDING_L2',
               'approved_l1_by', v_user.name,
               'approved_l1_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L2', 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l2' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object(
               'status', 'APPROVED',
               'approved_l2_by', v_user.name,
               'approved_l2_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'APPROVED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object(
               'status', 'REJECTED',
               'rejected_by', v_user.name,
               'reject_reason', coalesce(p_payload->>'reason', p_payload->>'catatan', ''),
               'rejected_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'REJECTED', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('cancel_wo', 'batalkan_wo') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object(
               'status', 'CANCELED',
               'canceled_by', v_user.name,
               'canceled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'CANCELED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'request_transfer' THEN
        INSERT INTO kmb.transfer_requests (data)
        VALUES (p_payload || jsonb_build_object(
            'status', 'PENDING',
            'requested_by', v_user.name,
            'requested_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
        ));
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_transfer' THEN
        UPDATE kmb.transfer_requests
           SET data = data || jsonb_build_object('status', 'APPROVED', 'approved_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject_transfer' THEN
        UPDATE kmb.transfer_requests
           SET data = data || jsonb_build_object('status', 'REJECTED', 'rejected_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'report_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object('status', 'EXPIRED', 'expired_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'))
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'EXPIRED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reopen_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb.work_orders
           SET data = data || jsonb_build_object('status', 'ACTIVE', 'reopened_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'))
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'ACTIVE', 'source', 'SUPABASE');

    ELSIF v_aksi = 'save_push_sub' THEN
        INSERT INTO kmb.push_subscriptions (token, data)
        VALUES (p_token, p_payload);
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Aksi ' || p_aksi || ' tidak dikenal di backend Supabase',
            'source', 'SUPABASE'
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmbtra_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;
