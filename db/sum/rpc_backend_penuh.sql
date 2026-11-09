-- ==============================================================================
-- FUNGSI RPC BACKEND MANDIRI SUPABASE UNTUK RUMAH SUM V2 (Skema `sum`)
-- Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2, §5
-- Terisolasi di kamar sum: tidak menyentuh skema kmb atau kmb_projek.
-- ==============================================================================

-- 1. Helper internal identifikasi pengguna bertoken di skema sum
CREATE OR REPLACE FUNCTION sum._autentikasi_token(p_token text)
RETURNS TABLE (
    mechanic_id text,
    name text,
    role text,
    email text,
    section text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
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
           coalesce(m.data->>'section', 'field') as section
      FROM sum.api_tokens t
      LEFT JOIN sum.config_mechanics m
        ON lower(btrim(coalesce(t.data->>'email', ''))) = lower(btrim(coalesce(m.data->>'email', '')))
        OR btrim(coalesce(t.data->>'mechanic_id', '')) = btrim(coalesce(m.data->>'mechanic_id', ''))
     WHERE btrim(coalesce(t.data->>'token', '')) = v_clean
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false' OR t.data->>'status' = 'ACTIVE')
     LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION sum._autentikasi_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sum._autentikasi_token(text) TO service_role;

-- 2. Dispatcher utama backend mandiri sum
CREATE OR REPLACE FUNCTION public.sum_eksekusi_aksi_bertoken(
    p_token text,
    p_aksi text,
    p_op_id text DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb,
    p_extra jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sum, pg_temp
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
    v_comp_id text;
    v_comp_name text;
    v_unit_id text;
    v_unit_name text;
    v_bp numeric;
    v_th numeric;
    v_uf numeric;
    v_cat text;
BEGIN
    -- Autentikasi token
    SELECT * INTO v_user FROM sum._autentikasi_token(p_token);
    IF v_user.mechanic_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    -- Pastikan tabel penampung WO dan transfer tersedia secara idempoten
    CREATE TABLE IF NOT EXISTS sum.work_orders (
        baris integer PRIMARY KEY,
        nilai jsonb NOT NULL DEFAULT '[]'::jsonb,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        disinkron_at timestamptz NOT NULL DEFAULT now(),
        sinkron_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE sum.work_orders ADD COLUMN IF NOT EXISTS disinkron_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE sum.work_orders ADD COLUMN IF NOT EXISTS sinkron_at timestamptz NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS sum.transfer_requests (
        id bigserial PRIMARY KEY,
        baris integer,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE sum.transfer_requests ADD COLUMN IF NOT EXISTS dibuat_at timestamptz NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS sum.push_subscriptions (
        id bigserial PRIMARY KEY,
        token text,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE sum.push_subscriptions ADD COLUMN IF NOT EXISTS dibuat_at timestamptz NOT NULL DEFAULT now();

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
                'tenant_code', 'SUM'
            ),
            'source', 'SUPABASE'
        );

    ELSIF v_aksi = 'pull_create_refs' THEN
        RETURN public.sum_create_refs_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring' THEN
        RETURN public.sum_monitoring_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring_daftar' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.config_mechanics;
        RETURN v_result;

    ELSIF v_aksi = 'pull_my_wos' THEN
        WITH gabungan AS (
            SELECT data FROM sum.work_orders
            WHERE data->>'created_by' = v_user.name
               OR data->>'mechanic_id' = v_user.mechanic_id
               OR lower(trim(coalesce(data->>'lead_mechanic_id', ''))) = lower(trim(v_user.mechanic_id))
               OR public._kode_mekanik_kanonik(coalesce(data->>'lead_mechanic_id', data->>'mechanic_id', '')) = public._kode_mekanik_kanonik(v_user.mechanic_id)
               OR upper(trim(coalesce(data->>'lead_mechanic_name', data->>'mechanic_name', ''))) = upper(trim(v_user.name))
               OR EXISTS (
                   SELECT 1
                     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'team') = 'array' THEN data->'team' ELSE '[]'::jsonb END) member
                      WHERE lower(trim(coalesce(member->>'mechanic_id', member->>'id', member->>'user_id', ''))) = lower(trim(v_user.mechanic_id))
                         OR public._kode_mekanik_kanonik(coalesce(member->>'mechanic_id', member->>'id', member->>'user_id', '')) = public._kode_mekanik_kanonik(v_user.mechanic_id)
                         OR upper(trim(coalesce(member->>'mechanic_name', member->>'name', ''))) = upper(trim(v_user.name))
               )
               OR EXISTS (
                   SELECT 1
                     FROM sum.work_order_team tc
                    WHERE (tc.data->>'wo_id' = data->>'wo_number' OR tc.data->>'wo_id' = data->>'id' OR tc.nilai->>0 = data->>'wo_number' OR tc.nilai->>0 = data->>'id')
                      AND (
                        lower(trim(coalesce(tc.data->>'mechanic_id', tc.nilai->>1, ''))) = lower(trim(v_user.mechanic_id))
                        OR public._kode_mekanik_kanonik(coalesce(tc.data->>'mechanic_id', tc.nilai->>1, '')) = public._kode_mekanik_kanonik(v_user.mechanic_id)
                        OR upper(trim(coalesce(tc.data->>'mechanic_name', tc.nilai->>2, ''))) = upper(trim(v_user.name))
                      )
               )
            UNION ALL
            SELECT s.data FROM sum.wo_supabase s
             WHERE to_regclass('sum.wo_supabase') IS NOT NULL
               AND (
                 lower(trim(coalesce(s.data->>'lead_mechanic_id', ''))) = lower(trim(v_user.mechanic_id))
                 OR public._kode_mekanik_kanonik(coalesce(s.data->>'lead_mechanic_id', s.data->>'mechanic_id', '')) = public._kode_mekanik_kanonik(v_user.mechanic_id)
                 OR EXISTS (
                     SELECT 1
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'team') = 'array' THEN s.data->'team' ELSE '[]'::jsonb END) member
                      WHERE lower(trim(coalesce(member->>'mechanic_id', member->>'id', ''))) = lower(trim(v_user.mechanic_id))
                         OR public._kode_mekanik_kanonik(coalesce(member->>'mechanic_id', member->>'id', '')) = public._kode_mekanik_kanonik(v_user.mechanic_id)
                 )
               )
        )
        SELECT jsonb_build_object(
            'success', true,
            'result', jsonb_build_object(
                'wos', coalesce(jsonb_agg(data ORDER BY coalesce(data->>'created_at', '') DESC), '[]'::jsonb)
            ),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM gabungan;
        RETURN v_result;

    ELSIF v_aksi = 'pull_wo_detail' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        SELECT jsonb_build_object(
            'success', true,
            'result', data,
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.work_orders
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
        FROM sum.work_orders
        WHERE lower(data->>'status') LIKE 'pending%';
        RETURN v_result;

    ELSIF v_aksi = 'pull_active' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.work_orders
        WHERE lower(data->>'status') IN ('active', 'in_progress', 'open', 'assigned', 'pending_mechanic_work');
        RETURN v_result;

    ELSIF v_aksi = 'pull_approved' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.work_orders
        WHERE lower(data->>'status') = 'approved';
        RETURN v_result;

    ELSIF v_aksi = 'pull_rejected' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.work_orders
        WHERE lower(data->>'status') IN ('rejected', 'cancelled', 'canceled');
        RETURN v_result;

    ELSIF v_aksi = 'pull_cancelable' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM sum.work_orders
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
        FROM sum.transfer_requests;
        RETURN v_result;

    -- =========================================================================
    -- Aksi TULIS (WRITE ACTIONS)
    -- =========================================================================
    ELSIF v_aksi IN ('create_wo', 'buat_wo') THEN
        -- Penomoran WO 4 digit WIB: WO-YYYYMMDD-XXXX
        v_today_str := to_char((now() AT TIME ZONE 'Asia/Jakarta'), 'YYYYMMDD');
        SELECT coalesce(max(nullif(regexp_replace(data->>'wo_number', '^.*-', ''), '')), '0000')::int + 1
          INTO v_next_seq
          FROM sum.work_orders
         WHERE data->>'wo_number' LIKE 'WO-' || v_today_str || '-%';

        v_wo_number := 'WO-' || v_today_str || '-' || lpad(coalesce(v_next_seq, 1)::text, 4, '0');

        SELECT coalesce(max(baris), 1) + 1 INTO v_next_baris FROM sum.work_orders;

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

        -- Ekstrak id komponen & unit dari p_payload atau data
        v_comp_id := coalesce(nullif(p_payload->>'component_id', ''), nullif(p_payload->'data'->>'component_id', ''), nullif(p_payload->>'component_no', ''), '');
        v_comp_name := coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'component', ''), nullif(p_payload->>'activity', ''), nullif(p_payload->>'job_description', ''), '');
        IF v_comp_name = 'UNKNOWN' THEN v_comp_name := ''; END IF;

        v_unit_id := coalesce(nullif(p_payload->>'unit_id', ''), nullif(p_payload->>'unit_code', ''), nullif(p_payload->'data'->>'unit_id', ''), '');
        v_unit_name := coalesce(nullif(p_payload->>'unit_name', ''), nullif(p_payload->>'unit_code', ''), '');
        IF v_unit_name = 'UNKNOWN' THEN v_unit_name := ''; END IF;

        v_bp := coalesce(nullif(p_payload->>'base_points', '')::numeric, nullif(p_payload->>'base_point', '')::numeric, nullif(p_payload->>'others_base_points', '')::numeric, nullif(p_payload->>'manual_base_points', '')::numeric, null);
        v_th := coalesce(nullif(p_payload->>'target_hours', '')::numeric, nullif(p_payload->>'others_target_hours', '')::numeric, nullif(p_payload->>'manual_target_hours', '')::numeric, null);
        v_uf := coalesce(nullif(p_payload->>'unit_factor', '')::numeric, nullif(p_payload->>'others_unit_factor', '')::numeric, nullif(p_payload->>'manual_unit_factor', '')::numeric, null);

        -- Lengkapi unit dari sum.config_units jika unit_id ada
        IF v_unit_id <> '' AND v_unit_id <> 'WORKSHOP' AND v_unit_id <> 'OTHERS' THEN
            BEGIN
                SELECT coalesce(nullif(v_unit_name, ''), nullif(data->>'unit_name', ''), v_unit_id),
                       coalesce(v_uf, nullif(data->>'unit_factor', '')::numeric, 1.0)
                  INTO v_unit_name, v_uf
                  FROM sum.config_units
                 WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = upper(btrim(v_unit_id))
                 LIMIT 1;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END IF;
        v_unit_name := coalesce(nullif(v_unit_name, ''), v_unit_id, 'WORKSHOP');
        v_uf := coalesce(v_uf, 1.0);

        -- Lengkapi komponen dari sum.components jika component_id ada
        IF v_comp_id <> '' AND (v_comp_name = '' OR v_bp IS NULL OR v_bp = 0 OR v_th IS NULL OR v_th = 0) THEN
            BEGIN
                SELECT coalesce(nullif(v_comp_name, ''), nullif(data->>'component_name', ''), nullif(data->>'component', ''), data->>'activity', v_comp_id),
                       coalesce(v_bp, nullif(data->>'base_points', '')::numeric, nullif(data->>'base_point', '')::numeric, 1.0),
                       coalesce(v_th, nullif(data->>'target_hours', '')::numeric, 2.0),
                       coalesce(nullif(data->>'category', ''), 'General')
                  INTO v_comp_name, v_bp, v_th, v_cat
                  FROM sum.components
                 WHERE upper(btrim(coalesce(data->>'component_no', data->>'component_id', ''))) = upper(btrim(v_comp_id))
                 LIMIT 1;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END IF;

        IF v_comp_name = '' THEN
            v_comp_name := coalesce(nullif(p_payload->>'others_description', ''), nullif(p_payload->>'keterangan', ''), nullif(p_payload->'data'->>'keterangan', ''), v_comp_id, 'Pekerjaan');
        END IF;
        v_bp := coalesce(v_bp, 1.0);
        v_th := coalesce(v_th, 2.0);
        v_cat := coalesce(nullif(v_cat, ''), nullif(p_payload->>'category', ''), 'General');

        v_new_data := p_payload || jsonb_build_object(
            'id', v_wo_number,
            'wo_number', v_wo_number,
            'unit_id', coalesce(nullif(v_unit_id, ''), 'WORKSHOP'),
            'unit_code', coalesce(nullif(v_unit_id, ''), 'WORKSHOP'),
            'unit_name', v_unit_name,
            'unit_factor', v_uf,
            'component_id', coalesce(nullif(v_comp_id, ''), 'COM-001'),
            'component_no', coalesce(nullif(v_comp_id, ''), 'COM-001'),
            'component', v_comp_name,
            'component_name', v_comp_name,
            'activity', v_comp_name,
            'job_description', v_comp_name,
            'category', v_cat,
            'base_points', v_bp,
            'target_hours', v_th,
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

        INSERT INTO sum.work_orders (baris, nilai, data, disinkron_at, sinkron_at)
        VALUES (v_next_baris, '[]'::jsonb, v_new_data, now(), now());

        IF to_regclass('sum.work_order_team') IS NOT NULL AND jsonb_array_length(v_team) > 0 THEN
            INSERT INTO sum.work_order_team (baris, nilai, data, sinkron_at)
            SELECT (coalesce((SELECT max(baris) FROM sum.work_order_team), 0) + row_number() OVER())::int,
                   jsonb_build_array(v_wo_number, m->>'mechanic_id', m->>'percentage'),
                   jsonb_build_object('wo_id', v_wo_number, 'mechanic_id', m->>'mechanic_id', 'percentage', m->>'percentage'),
                   now()
              FROM jsonb_array_elements(v_team) m;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'result', v_new_data,
            'wo_number', v_wo_number,
            'source', 'SUPABASE'
        );

    ELSIF v_aksi IN ('submit_work', 'kirim_kerja') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || p_payload || jsonb_build_object(
               'status', 'PENDING_L1',
               'submitted_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
               'submitted_by', v_user.name
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L1', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('save_override', 'override') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object(
               'override', p_payload,
               'override_by', v_user.name,
               'override_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l1' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object(
               'status', 'PENDING_L2',
               'approved_l1_by', v_user.name,
               'approved_l1_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L2', 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l2' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object(
               'status', 'APPROVED',
               'approved_l2_by', v_user.name,
               'approved_l2_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'APPROVED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object(
               'status', 'REJECTED',
               'rejected_by', v_user.name,
               'reject_reason', coalesce(p_payload->>'reason', p_payload->>'catatan', ''),
               'rejected_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'REJECTED', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('cancel_wo', 'batalkan_wo') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object(
               'status', 'CANCELED',
               'canceled_by', v_user.name,
               'canceled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
           ),
           disinkron_at = now(),
           sinkron_at = now()
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'CANCELED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'request_transfer' THEN
        INSERT INTO sum.transfer_requests (data)
        VALUES (p_payload || jsonb_build_object(
            'status', 'PENDING',
            'requested_by', v_user.name,
            'requested_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
        ));
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_transfer' THEN
        UPDATE sum.transfer_requests
           SET data = data || jsonb_build_object('status', 'APPROVED', 'approved_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject_transfer' THEN
        UPDATE sum.transfer_requests
           SET data = data || jsonb_build_object('status', 'REJECTED', 'rejected_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'report_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object('status', 'EXPIRED', 'expired_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'))
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'EXPIRED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reopen_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE sum.work_orders
           SET data = data || jsonb_build_object('status', 'ACTIVE', 'reopened_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'))
         WHERE data->>'wo_number' = v_wo_id OR data->>'id' = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'ACTIVE', 'source', 'SUPABASE');

    ELSIF v_aksi = 'save_push_sub' THEN
        INSERT INTO sum.push_subscriptions (token, data)
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

-- 3. Helper gabungan seluruh WO SUM (untuk detail, monitoring, dll)
CREATE OR REPLACE FUNCTION sum._semua_wo_json_sum()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT s.data || jsonb_build_object(
             'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_number', coalesce(nullif(btrim(s.wo_number), ''), btrim(s.id)),
             'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
           )
      FROM sum.wo_supabase s
     WHERE nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
    UNION ALL
    SELECT w.data || jsonb_build_object(
             'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_number', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), ''), btrim(w.nilai->>0)),
             'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
             'unit_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'unit_id', 'unit_code'), ''), 'WORKSHOP'),
             'component_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_id', 'component_no'), ''), 'COM-001'),
             'component_name', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_name', 'others_description', 'activity', 'component_id'), ''), 'Pekerjaan'),
             'team', CASE
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               WHEN jsonb_typeof(w.data->'effective_team') = 'array' AND jsonb_array_length(w.data->'effective_team') > 0 THEN w.data->'effective_team'
               ELSE '[]'::jsonb
             END,
             'effective_team', CASE
               WHEN jsonb_typeof(w.data->'effective_team') = 'array' AND jsonb_array_length(w.data->'effective_team') > 0 THEN w.data->'effective_team'
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               ELSE '[]'::jsonb
             END
           )
      FROM sum.work_orders w
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
       AND NOT EXISTS (
         SELECT 1 FROM sum.wo_supabase s2
          WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
             OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
       );
END;
$$;

-- 4. Detail satu WO
CREATE OR REPLACE FUNCTION public.sum_wo_detail_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
DECLARE
    v_target text := upper(btrim(coalesce(p_wo_id, '')));
    v_wo jsonb;
    v_payload jsonb;
    v_user record;
BEGIN
    IF btrim(coalesce(p_token, '')) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    SELECT mechanic_id, name, role INTO v_user FROM sum._autentikasi_token(p_token);
    IF v_user.mechanic_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    SELECT wo INTO v_wo
      FROM sum._semua_wo_json_sum() AS wo
     WHERE upper(btrim(coalesce(wo->>'id', ''))) = v_target
        OR upper(btrim(coalesce(wo->>'wo_id', ''))) = v_target
        OR upper(btrim(coalesce(wo->>'wo_number', ''))) = v_target
     LIMIT 1;

    IF v_wo IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Work Order tidak ditemukan: ' || coalesce(p_wo_id, ''), 'source', 'SUPABASE');
    END IF;

    v_payload := v_wo || jsonb_build_object(
        'wo', v_wo,
        'work_conditions', jsonb_build_array(
            jsonb_build_object('key', 'normal', 'label', 'Normal', 'factor', 1.0),
            jsonb_build_object('key', 'difficult', 'label', 'Sulit', 'factor', 1.1),
            jsonb_build_object('key', 'extreme', 'label', 'Ekstrim', 'factor', 1.2)
        )
    );

    RETURN jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', v_payload, 'data', v_payload)::json;
END;
$$;

-- 5. Daftar WO milik mekanik
CREATE OR REPLACE FUNCTION public.sum_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
DECLARE
    v_clean text := btrim(coalesce(p_token, ''));
    v_mid   text := '';
    v_mid_canon text := '';
    v_mname text := '';
    v_memail text := '';
    v_wos jsonb := '[]'::jsonb;
    v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
    IF v_clean = '' THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    SELECT coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), nullif(btrim(nilai->>0), ''), v_mid),
           coalesce(nullif(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), ''), nullif(btrim(nilai->>1), ''), ''),
           coalesce(nullif(public._ambil_teks_jsonb(data, 'email'), ''), nullif(btrim(nilai->>2), ''), '')
      INTO v_mid_canon, v_mname, v_memail
      FROM sum.config_mechanics
     WHERE public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), nilai->>0, '')) = public._kode_mekanik_kanonik(v_mid)
        OR upper(btrim(coalesce(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), nilai->>1, ''))) = upper(v_mid)
        OR (v_mid LIKE '%@%' AND lower(btrim(coalesce(public._ambil_teks_jsonb(data, 'email'), nilai->>2, ''))) = lower(v_mid))
     LIMIT 1;

    v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid);

    WITH master_mekanik AS (
        SELECT DISTINCT ON (public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)))
               public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)) AS k_id,
               coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)) AS mechanic_id,
               coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)) AS name
          FROM sum.config_mechanics m
         WHERE coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '') <> ''
    ),
    tim_cermin AS (
        SELECT upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id', 'id'), ''), nullif(t.nilai->>0, ''), ''))) AS wo_key,
               jsonb_agg(jsonb_build_object(
                 'mechanic_id', coalesce(mm.mechanic_id, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), nullif(btrim(t.nilai->>1), ''), ''),
                 'mechanic_name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
                 'name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
                 'role_in_wo', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'role_in_wo', 'role'), ''), 'lead'),
                 'percentage', 100
               )) AS team_arr,
               jsonb_agg(coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id'), ''), nullif(btrim(t.nilai->>1), ''), '')) AS team_names_arr
          FROM sum.work_order_team t
          LEFT JOIN master_mekanik mm
            ON mm.k_id = public._kode_mekanik_kanonik(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), t.nilai->>1, ''))
         WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id'), t.nilai->>0, '')), '') IS NOT NULL
         GROUP BY 1
    ),
    gabungan_wo AS (
        SELECT s.data || jsonb_build_object(
                 'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
                 'wo_id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
                 'wo_number', coalesce(nullif(btrim(s.wo_number), ''), btrim(s.id)),
                 'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
               ) AS wo
          FROM sum.wo_supabase s
         WHERE to_regclass('sum.wo_supabase') IS NOT NULL
           AND nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
           AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
        UNION ALL
        SELECT w.data || jsonb_build_object(
                 'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
                 'wo_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
                 'wo_number', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), ''), btrim(w.nilai->>0)),
                 'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
                 'unit_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'unit_id', 'unit_code'), ''), 'WORKSHOP'),
                 'component_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_id', 'component_no'), ''), 'COM-001'),
                 'component_name', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_name', 'others_description', 'activity', 'component_id'), ''), 'Pekerjaan'),
                 'team', CASE
                   WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
                   WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
                   ELSE '[]'::jsonb
                 END,
                 'effective_team', CASE
                   WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
                   WHEN jsonb_typeof(w.data->'effective_team') = 'array' AND jsonb_array_length(w.data->'effective_team') > 0 THEN w.data->'effective_team'
                   WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
                   ELSE '[]'::jsonb
                 END,
                 'team_names', COALESCE(tc.team_names_arr, CASE WHEN jsonb_typeof(w.data->'team_names') = 'array' THEN w.data->'team_names' ELSE '[]'::jsonb END)
               ) AS wo
          FROM sum.work_orders w
          LEFT JOIN tim_cermin tc
            ON tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), w.nilai->>0, '')))
            OR tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number'), ''), w.nilai->>0, '')))
         WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
           AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
           AND NOT EXISTS (
             SELECT 1 FROM sum.wo_supabase s2
              WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
                 OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
           )
    ),
    milik_mekanik AS (
        SELECT wo FROM gabungan_wo
         WHERE sum._wo_milik_mekanik_sum(wo, v_mid_canon, v_mname, v_memail, v_mid)
    )
    SELECT coalesce(jsonb_agg(wo ORDER BY coalesce(wo->>'created_at', '') DESC), '[]'::jsonb)
      INTO v_wos
      FROM milik_mekanik;

    RETURN jsonb_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
        'data', jsonb_build_object('wos', v_wos)
    )::json;
END;
$$;

-- 6. WO berdasarkan status (untuk approvals, active, etc)
CREATE OR REPLACE FUNCTION public.sum_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
DECLARE
    v_req text := lower(btrim(coalesce(p_status, 'pending')));
    v_wos jsonb := '[]'::jsonb;
    v_transfers jsonb := '[]'::jsonb;
    v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
    IF btrim(coalesce(p_token, '')) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    WITH semua AS (
        SELECT wo FROM sum._semua_wo_json_sum() AS wo
    )
    SELECT coalesce(jsonb_agg(wo ORDER BY coalesce(wo->>'created_at', '') DESC) FILTER (
             WHERE (v_req = 'pending' AND (wo->>'status') IN ('pending_supervisor', 'pending_superintendent', 'pending_transfer'))
                OR (v_req = 'active' AND (wo->>'status') IN ('pending_mechanic_work', 'expired'))
                OR (v_req = 'approved' AND (wo->>'status') = 'approved')
                OR (v_req = 'rejected' AND (wo->>'status') IN ('rejected', 'cancelled'))
                OR (v_req NOT IN ('pending', 'active', 'approved', 'rejected') AND (wo->>'status') = v_req)
           ), '[]'::jsonb),
           coalesce(jsonb_agg(wo ORDER BY coalesce(wo->>'created_at', '') DESC) FILTER (
             WHERE (wo->>'status') = 'pending_transfer'
           ), '[]'::jsonb)
      INTO v_wos, v_transfers
      FROM semua;

    RETURN jsonb_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', jsonb_build_object(
            'wos', v_wos,
            'pending', CASE WHEN v_req = 'pending' THEN v_wos ELSE '[]'::jsonb END,
            'transfers', v_transfers,
            'active', CASE WHEN v_req = 'active' THEN v_wos ELSE '[]'::jsonb END,
            'approved', CASE WHEN v_req = 'approved' THEN v_wos ELSE '[]'::jsonb END,
            'rejected', CASE WHEN v_req = 'rejected' THEN v_wos ELSE '[]'::jsonb END,
            'pulled_at', v_pulled
        )
    )::json;
END;
$$;

-- 7. Konteks skor untuk approve L2
CREATE OR REPLACE FUNCTION public.sum_konteks_skor_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sum, pg_temp
AS $$
DECLARE
    v_target text := upper(btrim(coalesce(p_wo_id, '')));
    v_wo jsonb;
    v_factors jsonb := '[]'::jsonb;
    v_mechs jsonb := '[]'::jsonb;
BEGIN
    SELECT wo INTO v_wo FROM sum._semua_wo_json_sum() AS wo
     WHERE upper(btrim(coalesce(wo->>'id', ''))) = v_target
        OR upper(btrim(coalesce(wo->>'wo_number', ''))) = v_target
     LIMIT 1;
    IF v_wo IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Work order tidak ditemukan', 'source', 'SUPABASE');
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'factor_type', coalesce(public._ambil_teks_jsonb(data, 'factor_type', 'type'), nilai->>0, 'work_condition'),
      'type', coalesce(public._ambil_teks_jsonb(data, 'factor_type', 'type'), nilai->>0, 'work_condition'),
      'key', coalesce(public._ambil_teks_jsonb(data, 'key', 'factor_key'), nilai->>1, ''),
      'value', coalesce(nullif(regexp_replace(coalesce(public._ambil_teks_jsonb(data, 'value'), nilai->>2, '1.0'), '[^0-9.]', '', 'g'), '')::numeric, 1.0)
    )), '[]'::jsonb) INTO v_factors FROM sum.config_factors;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'mechanic_id', coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), btrim(nilai->>0)),
      'name', coalesce(nullif(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), ''), btrim(nilai->>1)),
      'golongan', coalesce(nullif(public._ambil_teks_jsonb(data, 'golongan'), ''), btrim(nilai->>5), ''),
      'jabatan_aktual', coalesce(nullif(public._ambil_teks_jsonb(data, 'jabatan_aktual'), ''), btrim(nilai->>4), '')
    )), '[]'::jsonb) INTO v_mechs FROM sum.config_mechanics;

    RETURN jsonb_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', jsonb_build_object('wo', v_wo, 'factors', v_factors, 'base_settings', '[]'::jsonb, 'mechanics', v_mechs)
    )::json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sum_wo_detail_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_my_wos_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_konteks_skor_bertoken(text, text) TO anon, authenticated, service_role;
