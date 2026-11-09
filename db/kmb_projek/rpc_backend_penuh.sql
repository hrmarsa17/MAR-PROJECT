-- ==============================================================================
-- FUNGSI RPC BACKEND MANDIRI SUPABASE UNTUK RUMAH KMB PROJECT (Skema `kmb_projek`)
-- Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2, §5
-- Terisolasi di kamar kmb_projek: tidak menyentuh skema kmb atau sum.
-- ==============================================================================

-- 1. Helper internal identifikasi pengguna bertoken di skema kmb_projek
CREATE OR REPLACE FUNCTION kmb_projek._autentikasi_token(p_token text)
RETURNS TABLE (
    mechanic_id text,
    name text,
    role text,
    email text,
    section text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = kmb_projek, pg_temp
AS $$
DECLARE
    v_clean text := btrim(coalesce(p_token, ''));
BEGIN
    IF v_clean = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT coalesce(t.user_id, '') as mechanic_id,
           coalesce(t.name, m.name, t.user_id, '') as name,
           lower(coalesce(t.role, m.role, 'mechanic')) as role,
           coalesce(m.email, '') as email,
           coalesce(m.section, '') as section
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m ON t.user_id = m.mechanic_id
     WHERE btrim(coalesce(t.token, '')) = v_clean
       AND t.status = 'ACTIVE'
     LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION kmb_projek._autentikasi_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kmb_projek._autentikasi_token(text) TO service_role;

-- 2. Dispatcher utama backend mandiri kmb_projek
CREATE OR REPLACE FUNCTION public.kmb_eksekusi_aksi_bertoken(
    p_token text,
    p_aksi text,
    p_op_id text DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb,
    p_skor_js jsonb DEFAULT NULL
)
RETURNS jsonb
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
        RETURN jsonb_build_object(
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
        RETURN public.kmb_create_refs_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring' THEN
        RETURN public.kmb_monitoring_bertoken(p_token)::jsonb;

    ELSIF v_aksi = 'pull_monitoring_daftar' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.config_mechanics m;
        RETURN v_result;

    ELSIF v_aksi = 'pull_my_wos' THEN
        RETURN public.kmb_my_wos_bertoken(p_token)::jsonb;

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
            RETURN jsonb_build_object('success', false, 'error', 'Work Order tidak ditemukan', 'source', 'SUPABASE');
        END IF;
        RETURN v_result;

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
        RETURN v_result;

    ELSIF v_aksi = 'pull_active' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status IN ('ACTIVE', 'IN_PROGRESS', 'OPEN', 'assigned');
        RETURN v_result;

    ELSIF v_aksi = 'pull_approved' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status = 'APPROVED';
        RETURN v_result;

    ELSIF v_aksi = 'pull_rejected' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(coalesce(w.data, to_jsonb(w))), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.work_orders w
        WHERE w.status = 'REJECTED';
        RETURN v_result;

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
        RETURN v_result;

    ELSIF v_aksi = 'pull_transfers' THEN
        SELECT jsonb_build_object(
            'success', true,
            'result', coalesce(jsonb_agg(data), '[]'::jsonb),
            'source', 'SUPABASE'
        )
        INTO v_result
        FROM kmb_projek.transfer_requests;
        RETURN v_result;

    -- =========================================================================
    -- Aksi TULIS (WRITE ACTIONS)
    -- =========================================================================
    ELSIF v_aksi IN ('create_wo', 'buat_wo') THEN
        -- Penomoran WO 4 digit WIB: WO-YYYYMMDD-XXXX
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

        RETURN jsonb_build_object(
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

    ELSIF v_aksi IN ('submit_work', 'kirim_kerja') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'PENDING_L1',
               submitted_by = v_user.name,
               submitted_at = now(),
               points = coalesce((p_payload->>'points')::numeric, (p_payload->>'final_points')::numeric, points),
               idr_value = coalesce((p_payload->>'idr')::numeric, (p_payload->>'idr_value')::numeric, idr_value),
               data = coalesce(data, '{}'::jsonb) || p_payload || jsonb_build_object('status', 'PENDING_L1', 'submitted_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L1', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('save_override', 'override') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET data = coalesce(data, '{}'::jsonb) || jsonb_build_object('override', p_payload, 'override_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l1' THEN
        -- Validasi wewenang: Supervisor, Superintendent, Admin
        IF v_user.role NOT IN ('supervisor', 'superintendent', 'admin', 'manager') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: Tidak memiliki wewenang approval L1', 'source', 'SUPABASE');
        END IF;

        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'PENDING_L2',
               approved_l1_by = v_user.name,
               approved_l1_at = now(),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'PENDING_L2', 'approved_l1_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'PENDING_L2', 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_l2' THEN
        -- Validasi wewenang ketat: Supervisor (L1) DILARANG approval L2!
        IF v_user.role IN ('supervisor', 'mechanic') OR v_user.role NOT IN ('superintendent', 'admin', 'manager') THEN
            RETURN jsonb_build_object(
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
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'APPROVED', 'approved_l2_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'APPROVED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'REJECTED',
               rejected_by = v_user.name,
               rejected_reason = coalesce(p_payload->>'reason', p_payload->>'catatan', ''),
               rejected_at = now(),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'REJECTED', 'rejected_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'REJECTED', 'source', 'SUPABASE');

    ELSIF v_aksi IN ('cancel_wo', 'batalkan_wo') THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'CANCELED',
               cancelled_by = v_user.name,
               cancelled_at = now(),
               cancel_reason = coalesce(p_payload->>'reason', ''),
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'CANCELED', 'canceled_by', v_user.name)
         WHERE wo_number = v_wo_id OR id = v_wo_id;

        RETURN jsonb_build_object('success', true, 'wo_id', v_wo_id, 'status', 'CANCELED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'request_transfer' THEN
        INSERT INTO kmb_projek.transfer_requests (data)
        VALUES (p_payload || jsonb_build_object('status', 'PENDING', 'requested_by', v_user.name));
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'approve_transfer' THEN
        UPDATE kmb_projek.transfer_requests
           SET data = data || jsonb_build_object('status', 'APPROVED', 'approved_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'reject_transfer' THEN
        UPDATE kmb_projek.transfer_requests
           SET data = data || jsonb_build_object('status', 'REJECTED', 'rejected_by', v_user.name)
         WHERE data->>'wo_id' = (p_payload->>'wo_id');
        RETURN jsonb_build_object('success', true, 'source', 'SUPABASE');

    ELSIF v_aksi = 'report_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'EXPIRED',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'EXPIRED')
         WHERE wo_number = v_wo_id OR id = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'EXPIRED', 'source', 'SUPABASE');

    ELSIF v_aksi = 'reopen_expired' THEN
        v_wo_id := coalesce(p_payload->>'wo_id', p_payload->>'id', '');
        UPDATE kmb_projek.work_orders
           SET status = 'ACTIVE',
               data = coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'ACTIVE')
         WHERE wo_number = v_wo_id OR id = v_wo_id;
        RETURN jsonb_build_object('success', true, 'status', 'ACTIVE', 'source', 'SUPABASE');

    ELSIF v_aksi = 'save_push_sub' THEN
        INSERT INTO kmb_projek.push_subscriptions (token, data)
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

GRANT EXECUTE ON FUNCTION public.kmb_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION kmb_projek._wo_milik_mekanik(p_wo jsonb, p_mid text, p_mname text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_id   text := upper(btrim(coalesce(p_mid, '')));
  v_name text := upper(btrim(coalesce(p_mname, '')));
BEGIN
  IF v_id = '' AND v_name = '' THEN
    RETURN false;
  END IF;

  IF v_id <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_id
    OR upper(btrim(coalesce(p_wo->>'mechanic_id', ''))) = v_id
  ) THEN
    RETURN true;
  END IF;

  IF v_name <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_name
    OR upper(btrim(coalesce(p_wo->>'mechanic_name', ''))) = v_name
  ) THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_wo->'team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'effective_team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'effective_team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'team_distribution') = 'object' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(p_wo->'team_distribution') td
       WHERE (v_id <> '' AND upper(btrim(td.key)) = v_id)
          OR (v_name <> '' AND upper(btrim(td.key)) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_id <> '' AND coalesce(p_wo->>'mechanic_ids', '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(p_wo->>'mechanic_ids', '[,;]') s
       WHERE upper(btrim(s)) = v_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ==============================================================================
-- 1. RPC BACA LENGKAP KMB PROJECT (`ping`, `create_refs`, `monitoring`, `my_wos`, `wos_by_status`, `monitoring_daftar`, `wo_detail`, `konteks_skor`)
-- ==============================================================================

-- 1a. Ping Token
