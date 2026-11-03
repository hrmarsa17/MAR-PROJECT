-- ════════════════════════════════════════════════════════════════════════════
-- 013 — ADMIN USER & MULTI-TENANT ALIGNMENT
-- Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §2, §5
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Pastikan tenant ketiga rumah terdaftar di tabel tenants (jika tabel ada)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        INSERT INTO public.tenants (code, name)
        VALUES 
            ('KMB', 'KMB V2 / TRA'),
            ('SUM', 'SUM V2'),
            ('KMBPROJEK', 'KMB Project')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

-- 2. Pastikan indeks pencarian token cepat di skema masing-masing
DO $$
BEGIN
    -- kmb
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'kmb') THEN
        CREATE INDEX IF NOT EXISTS kmb_api_tokens_token_idx ON kmb.api_tokens ((data->>'token'));
        CREATE INDEX IF NOT EXISTS kmb_api_tokens_role_idx  ON kmb.api_tokens ((data->>'role'));
    END IF;

    -- sum
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'sum') THEN
        CREATE INDEX IF NOT EXISTS sum_api_tokens_token_idx ON sum.api_tokens ((data->>'token'));
        CREATE INDEX IF NOT EXISTS sum_api_tokens_role_idx  ON sum.api_tokens ((data->>'role'));
    END IF;

    -- kmb_projek
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'kmb_projek') THEN
        CREATE INDEX IF NOT EXISTS kmbp_api_tokens_token_idx ON kmb_projek.api_tokens ((data->>'token'));
        CREATE INDEX IF NOT EXISTS kmbp_api_tokens_role_idx  ON kmb_projek.api_tokens ((data->>'role'));
    END IF;
END $$;
