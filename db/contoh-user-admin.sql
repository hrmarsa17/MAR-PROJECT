-- ==============================================================================
-- Data Contoh Pengguna Admin untuk Uji Staging Gedung 2 (dnnqrslftndcbmnvuveb)
-- Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §5
-- Bebas hardcode tenant_id: semua resolusi tenant dilakukan dinamis.
-- ==============================================================================

DO $$
DECLARE
    v_tenant_kmb smallint;
    v_tenant_sum smallint;
BEGIN
    -- Resolusi dinamis tenant_id dari tabel tenants jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        SELECT id INTO v_tenant_kmb FROM public.tenants WHERE code = 'KMB' LIMIT 1;
        SELECT id INTO v_tenant_sum FROM public.tenants WHERE code = 'SUM' LIMIT 1;
    END IF;

    -- Data contoh uji KMB Project di kmb_projek.api_tokens
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'baris') THEN
            INSERT INTO kmb_projek.api_tokens (baris, nilai, data, sinkron_at)
            VALUES (
                99991,
                jsonb_build_array('uji-spv-kmbprojek-admin', 'superintendent', 'SPV-901', 'Admin Supervisor KMBP', 'ACTIVE'),
                jsonb_build_object('token', 'uji-spv-kmbprojek-admin', 'role', 'superintendent', 'user_id', 'SPV-901', 'name', 'Admin Supervisor KMBP', 'status', 'ACTIVE'),
                now()
            )
            ON CONFLICT (baris) DO UPDATE SET data = EXCLUDED.data, sinkron_at = now();
        ELSE
            INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status)
            VALUES ('uji-spv-kmbprojek-admin', 'superintendent', 'SPV-901', 'Admin Supervisor KMBP', 'ACTIVE')
            ON CONFLICT (token) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name, status = EXCLUDED.status;
        END IF;
    END IF;

    -- Data contoh uji SUM di cermin sum.api_tokens
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'sum' AND table_name = 'api_tokens') THEN
        INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
        VALUES (
            99992,
            jsonb_build_array('uji-spv-sum-admin', 'SPV-902', 'admin.sum@abadiops.com', 'true'),
            jsonb_build_object('token', 'uji-spv-sum-admin', 'mechanic_id', 'SPV-902', 'email', 'admin.sum@abadiops.com', 'is_active', 'true', 'role', 'superintendent'),
            now()
        )
        ON CONFLICT (baris) DO UPDATE SET data = EXCLUDED.data, sinkron_at = now();
    END IF;

    -- Data contoh uji KMB TRA di cermin kmb.api_tokens
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'kmb' AND table_name = 'api_tokens') THEN
        INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
        VALUES (
            99993,
            jsonb_build_array('uji-spv-kmbtra-admin', 'superintendent', 'SPV-903', 'Admin Supervisor TRA', 'ACTIVE'),
            jsonb_build_object('token', 'uji-spv-kmbtra-admin', 'role', 'superintendent', 'user_id', 'SPV-903', 'name', 'Admin Supervisor TRA', 'status', 'ACTIVE'),
            now()
        )
        ON CONFLICT (baris) DO UPDATE SET data = EXCLUDED.data, sinkron_at = now();
    END IF;
END $$;
