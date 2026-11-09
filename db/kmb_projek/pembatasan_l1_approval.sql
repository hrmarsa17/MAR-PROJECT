-- ==============================================================================
-- PEMBATASAN ROLE APPROVAL KMB PROJECT (L1 & L2)
-- Sesuai arahan: L1 (Supervisor) hanya bisa approve L1 dan hanya bisa melihat data L1.
-- Dilarang melihat data L2 dan dilarang approve L2.
-- Berlaku untuk Supabase Gedung 2 Staging (skema kmb_projek) dan Produksi.
-- ==============================================================================

-- 1. Perbarui kmb_wos_by_status_bertoken untuk menyaring WO berdasarkan role pemanggil
CREATE OR REPLACE FUNCTION public.kmb_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_user record;
    v_wos json;
BEGIN
    SELECT t.token, coalesce(t.role, 'mechanic') as role, t.name, t.user_id as mechanic_id
      INTO v_user
      FROM kmb_projek.api_tokens t
     WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
     LIMIT 1;

    IF v_user.token IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    SELECT coalesce(json_agg(json_build_object(
        'id', coalesce(w.data->>'id', w.wo_number),
        'wo_id', coalesce(w.data->>'id', w.wo_number),
        'wo_number', w.wo_number,
        'date', w.date::text,
        'shift', coalesce(w.shift, '1'),
        'unit_code', w.unit_code,
        'unit_id', w.unit_code,
        'component', w.component,
        'component_name', w.component,
        'activity', w.activity,
        'duration_hours', coalesce(w.duration_hours, 0),
        'status', w.status,
        'points', coalesce(w.points, 0),
        'lead_mechanic_id', w.lead_mechanic_id,
        'created_at', w.created_at,
        'created_at_str', to_char(w.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
        'data', w.data
    ) ORDER BY w.created_at DESC), '[]'::json)
    INTO v_wos
    FROM kmb_projek.work_orders w
    WHERE (
        (p_status = 'pending' AND (
            (v_user.role = 'supervisor' AND w.status IN ('pending_supervisor', 'pending_l1', 'PENDING_L1')) OR
            (v_user.role = 'superintendent' AND w.status IN ('pending_superintendent', 'pending_l2', 'PENDING_L2')) OR
            (v_user.role NOT IN ('supervisor', 'superintendent') AND (w.status LIKE 'PENDING%' OR w.status IN ('pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2')))
        )) OR
        (p_status = 'active' AND w.status IN ('assigned', 'in_progress', 'draft', 'ACTIVE', 'IN_PROGRESS', 'OPEN')) OR
        (p_status = 'approved' AND w.status IN ('approved', 'APPROVED')) OR
        (p_status = 'rejected' AND w.status IN ('rejected', 'REJECTED')) OR
        (w.status = p_status)
    );

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'wos', v_wos,
            p_status, v_wos,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;

-- 2. Perbarui dispatcher kmb_eksekusi_aksi_bertoken untuk membatasi eksekusi aksi approval
CREATE OR REPLACE FUNCTION public.kmb_eksekusi_aksi_bertoken(
    p_token text,
    p_aksi text,
    p_op_id text DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb,
    p_skor_js jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_user record;
    v_aksi text := lower(btrim(coalesce(p_aksi, '')));
    v_today_str text;
    v_next_seq integer;
    v_wo_number text;
    v_wo_id text;
    v_result jsonb;
BEGIN
    -- Autentikasi token
    SELECT * INTO v_user FROM kmb_projek._autentikasi_token(p_token);
    IF v_user.mechanic_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    -- Pastikan tabel dan kolom jsonb data tersedia secara idempoten
    ALTER TABLE kmb_projek.work_orders ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS kmb_projek.transfer_requests (
        id bigserial PRIMARY KEY,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS kmb_projek.push_subscriptions (
        id bigserial PRIMARY KEY,
        token text,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        dibuat_at timestamptz NOT NULL DEFAULT now()
    );

    -- =========================================================================
    -- Aksi BACA (READ ACTIONS)
    -- =========================================================================
    IF v_aksi = 'ping' THEN
        RETURN json_build_object(
            'success', true,
            'result', json_build_object(
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
        RETURN public.kmb_create_refs_bertoken(p_token);

    ELSIF v_aksi = 'pull_monitoring' THEN
        RETURN public.kmb_monitoring_bertoken(p_token);

    ELSIF v_aksi = 'pull_monitoring_daftar' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(jsonb_build_object(
                'id', m.mechanic_id,
                'mechanic_id', m.mechanic_id,
                'name', m.name,
                'section', m.section,
                'role', m.role,
                'status', m.status
            )), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.config_mechanics m;
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_my_wos' THEN
        RETURN public.kmb_my_wos_bertoken(p_token);

    ELSIF v_aksi = 'pull_wo_detail' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(w.data, to_jsonb(w)),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.wo_number = v_wo_id OR w.id = v_wo_id
        LIMIT 1;

        IF v_result IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Work Order tidak ditemukan', 'source', 'SUPABASE');
        END IF;
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_pending' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', jsonb_build_object(
                'pending_l1', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))) FILTER (WHERE w.status IN ('PENDING_L1', 'pending_supervisor', 'pending_l1')), '[]'::jsonb),
                'pending_l2', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))) FILTER (WHERE w.status IN ('PENDING_L2', 'pending_superintendent', 'pending_l2')), '[]'::jsonb),
                'pending', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))) FILTER (
                    WHERE (
                        (v_user.role = 'supervisor' AND w.status IN ('PENDING_L1', 'pending_supervisor', 'pending_l1'))
                        OR (v_user.role = 'superintendent' AND w.status IN ('PENDING_L2', 'pending_superintendent', 'pending_l2'))
                        OR (v_user.role NOT IN ('supervisor', 'superintendent') AND (w.status LIKE 'PENDING%' OR w.status IN ('pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2')))
                    )
                ), '[]'::jsonb)
            ),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status LIKE 'PENDING%' OR w.status IN ('pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2');
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_active' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status IN ('ACTIVE', 'IN_PROGRESS', 'OPEN', 'assigned');
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_approved' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status = 'APPROVED';
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_rejected' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status = 'REJECTED';
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_cancelable' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE (w.created_by = v_user.name OR w.lead_mechanic_id = v_user.mechanic_id OR v_user.role IN ('supervisor', 'superintendent', 'admin'))
          AND w.status NOT IN ('APPROVED', 'CANCELED');
        RETURN v_result::json;

    ELSIF v_aksi = 'pull_transfers' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.transfer_requests;
        RETURN v_result::json;

    -- =========================================================================
    -- Aksi TULIS (WRITE ACTIONS)
    -- =========================================================================
    ELSIF v_aksi IN ('create_wo', 'buat_wo') THEN
        v_today_str := to_char((now() AT TIME ZONE 'Asia/Jakarta'), 'YYYYMMDD');
        SELECT coalesce(max(nullif(regexp_replace(wo_number, '^.*-', ''), '')), '0000')::int + 1
          INTO v_next_seq
          FROM kmb_projek.work_orders
         WHERE wo_number LIKE 'WO-' || v_today_str || '-%';

        v_wo_number := 'WO-' || v_today_str || '-' || lpad(coalesce(v_next_seq, 1)::text, 4, '0');

        INSERT INTO kmb_projek.work_orders (
            id, wo_number, date, shift, unit_code, component, activity,
            duration_hours, job_type, section, lead_mechanic_id, status,
            created_by, created_at, source, data
        ) VALUES (
            v_wo_number,
            v_wo_number,
            (now() AT TIME ZONE 'Asia/Jakarta')::date,
            coalesce(p_payload->>'shift', '1'),
            coalesce(p_payload->>'unit_code', p_payload->>'unit_id', 'UNKNOWN'),
            coalesce(p_payload->>'component', p_payload->>'component_name', 'UNKNOWN'),
            coalesce(p_payload->>'activity', p_payload->>'job_description', 'UNKNOWN'),
            coalesce((p_payload->>'duration_hours')::numeric, (p_payload->>'actual_hours')::numeric, 0),
            coalesce(p_payload->>'job_type', 'maintenance'),
            coalesce(p_payload->>'section', v_user.section, 'maintenance'),
            coalesce(nullif(p_payload->>'lead_mechanic_id', ''), v_user.mechanic_id),
            coalesce(
                nullif(p_payload->>'status', ''),
                CASE
                    WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL
                      OR (jsonb_typeof(p_payload->'team') = 'array' AND jsonb_array_length(p_payload->'team') > 0)
                      OR jsonb_typeof(p_payload->'team_distribution') = 'object'
                    THEN 'assigned'
                    ELSE 'PENDING_L1'
                END
            ),
            v_user.name,
            now(),
            'SUPABASE',
            p_payload || jsonb_build_object(
                'id', v_wo_number,
                'wo_id', v_wo_number,
                'wo_number', v_wo_number,
                'lead_mechanic_id', coalesce(nullif(p_payload->>'lead_mechanic_id', ''), v_user.mechanic_id),
                'status', coalesce(
                    nullif(p_payload->>'status', ''),
                    CASE
                        WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL
                          OR jsonb_typeof(p_payload->'team') = 'array'
                        THEN 'assigned'
                        ELSE 'PENDING_L1'
                    END
                ),
                'status_group', CASE
                    WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL
                      OR jsonb_typeof(p_payload->'team') = 'array'
                    THEN 'assigned'
                    ELSE 'pending_approval'
                END,
                'created_by', v_user.name,
                'source', 'SUPABASE'
            )
        );

        RETURN json_build_object(
            'success', true,
            'result', jsonb_build_object(
                'id', v_wo_number,
                'wo_id', v_wo_number,
                'wo_number', v_wo_number,
                'status', coalesce(
                    nullif(p_payload->>'status', ''),
                    CASE
                        WHEN nullif(p_payload->>'lead_mechanic_id', '') IS NOT NULL
                          OR jsonb_typeof(p_payload->'team') = 'array'
                        THEN 'assigned'
                        ELSE 'PENDING_L1'
                    END
                )
            ),
            'wo_number', v_wo_number,
            'source', 'SUPABASE'
        );

    ELSIF v_aksi IN ('submit_work', 'submit_job') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'PENDING_L1',
               submitted_by = v_user.name,
               submitted_at = now(),
               actual_hours = coalesce((p_payload->>'actual_hours')::numeric, actual_hours),
               data = coalesce(data, '{}'::jsonb) || p_payload || jsonb_build_object('status', 'PENDING_L1', 'submitted_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L1', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('save_override', 'override') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET data = coalesce(data, '{}'::jsonb) || jsonb_build_object('override', p_payload, 'override_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l1' THEN
        -- Validasi wewenang: Supervisor, Superintendent, Admin
        IF v_user.role NOT IN ('supervisor', 'superintendent', 'admin', 'manager') THEN
            RETURN json_build_object('success', false, 'error', 'Akses ditolak: Tidak memiliki wewenang approval L1', 'source', 'SUPABASE');
        END IF;

        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'PENDING_L2',
               approved_l1_by = v_user.name,
               approved_l1_at = now(),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'PENDING_L2', 'approved_l1_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L2', 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l2' THEN
        -- Validasi wewenang ketat: Supervisor (L1) DILARANG approval L2!
        IF v_user.role IN ('supervisor', 'mechanic') OR v_user.role NOT IN ('superintendent', 'admin', 'manager') THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2',
                'source', 'SUPABASE'
            );
        END IF;

        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'APPROVED',
               approved_l2_by = v_user.name,
               approved_l2_at = now(),
               points = coalesce((p_skor_js->>'points')::numeric, points),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'APPROVED', 'approved_l2_by', v_user.name, 'skor_js', p_skor_js)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'APPROVED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'REJECTED',
               rejected_by = v_user.name,
               rejected_reason = coalesce(p_payload->>'reason', p_payload->>'catatan', ''),
               rejected_at = now(),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'REJECTED', 'rejected_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'REJECTED', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('cancel_wo', 'batalkan_wo') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'CANCELED',
               cancelled_by = v_user.name,
               cancelled_at = now(),
               cancel_reason = coalesce(p_payload->>'reason', ''),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'CANCELED', 'canceled_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'CANCELED', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('kembalikan', 'kembalikan_ke_mekanik') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'assigned',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'assigned', 'dikembalikan_oleh', v_user.name, 'alasan_kembali', coalesce(p_payload->>'catatan', p_payload->>'reason', ''))
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'assigned', 'source', 'SUPABASE');

    ELSIF v_aksi = 'request_transfer' THEN
        INSERT INTO kmb_projek.transfer_requests (data)
        VALUES (p_payload || jsonb_build_object('requested_by', v_user.name, 'requested_at', now()));
        RETURN json_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_transfer' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'assigned',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('transfer_approved_by', v_user.name, 'transfer_approved_at', now())
         WHERE wo_number = v_wo_id OR id = v_wo_id;
        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject_transfer' THEN
        RETURN json_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'report_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'EXPIRED',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'EXPIRED', 'expired_at', now())
         WHERE wo_number = v_wo_id OR id = v_wo_id;
        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'EXPIRED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reopen_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'assigned',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'assigned', 'reopened_by', v_user.name, 'reopened_at', now())
         WHERE wo_number = v_wo_id OR id = v_wo_id;
        RETURN json_build_object('success', true, 'wo_id', v_wo_id, 'status', 'assigned', 'source', 'SUPABASE');

    ELSIF v_aksi = 'save_push_sub' THEN
        INSERT INTO kmb_projek.push_subscriptions (token, data)
        VALUES (p_token, p_payload);
        RETURN json_build_object('success', true, 'source', 'SUPABASE');

    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Aksi ' || p_aksi || ' tidak dikenal di backend Supabase',
            'source', 'SUPABASE'
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmb_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;
