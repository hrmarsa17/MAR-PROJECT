-- ==============================================================================
-- Skema Cermin Google Sheets — Rumah KMB Project (kmb_projek)
-- Sesuai Tahap 2: Cermin pada docs/KEPUTUSAN.md & AGENTS.md §2
-- Kolom & tipe diselaraskan 1:1 dengan Spreadsheet 1lnJo74O_C-R6kKz9g8jP_e-q2Wc4p9sM
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

-- 1. ApiTokens (Cermin sheet ApiTokens)
CREATE TABLE IF NOT EXISTS kmb_projek.api_tokens (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'mechanic',
    user_id TEXT,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Config_Mechanics (Cermin sheet Config_Mechanics)
CREATE TABLE IF NOT EXISTS kmb_projek.config_mechanics (
    mechanic_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT NOT NULL,
    token TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'mechanic',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Config_Units (Cermin sheet Config_Units)
CREATE TABLE IF NOT EXISTS kmb_projek.config_units (
    unit_code TEXT PRIMARY KEY,
    model TEXT,
    section TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    current_hm NUMERIC DEFAULT 0,
    current_km NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Config_Components (Cermin sheet Config_Components)
CREATE TABLE IF NOT EXISTS kmb_projek.config_components (
    component_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- 5. Config_Factors (Cermin sheet Config_Factors)
CREATE TABLE IF NOT EXISTS kmb_projek.config_factors (
    id SERIAL PRIMARY KEY,
    factor_type TEXT NOT NULL,
    key TEXT NOT NULL,
    value NUMERIC NOT NULL,
    description TEXT,
    UNIQUE (factor_type, key)
);

-- 6. WorkOrders (Cermin sheet WorkOrders)
CREATE TABLE IF NOT EXISTS kmb_projek.work_orders (
    id TEXT PRIMARY KEY,
    wo_number TEXT UNIQUE NOT NULL,
    date DATE NOT NULL,
    shift TEXT,
    unit_code TEXT NOT NULL,
    component TEXT NOT NULL,
    activity TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_hours NUMERIC DEFAULT 0,
    job_type TEXT,
    section TEXT,
    lead_mechanic_id TEXT,
    mechanic_ids TEXT,
    status TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ,
    approved_l1_by TEXT,
    approved_l1_at TIMESTAMPTZ,
    approved_l2_by TEXT,
    approved_l2_at TIMESTAMPTZ,
    rejected_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_reason TEXT,
    cancelled_by TEXT,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    points NUMERIC DEFAULT 0,
    idr_value NUMERIC DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'GAS', -- 'GAS' atau 'SUPABASE'
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk pencarian cepat status & mekanik
CREATE INDEX IF NOT EXISTS idx_kmb_projek_wo_status ON kmb_projek.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_kmb_projek_wo_date ON kmb_projek.work_orders(date);
CREATE INDEX IF NOT EXISTS idx_kmb_projek_wo_unit ON kmb_projek.work_orders(unit_code);

-- 7. WorkOrders_Archive (Cermin sheet WorkOrders_Archive)
CREATE TABLE IF NOT EXISTS kmb_projek.work_orders_archive (
    id TEXT PRIMARY KEY,
    wo_number TEXT UNIQUE NOT NULL,
    date DATE NOT NULL,
    shift TEXT,
    unit_code TEXT NOT NULL,
    component TEXT NOT NULL,
    activity TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_hours NUMERIC DEFAULT 0,
    job_type TEXT,
    section TEXT,
    lead_mechanic_id TEXT,
    mechanic_ids TEXT,
    status TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ,
    approved_l1_by TEXT,
    approved_l1_at TIMESTAMPTZ,
    approved_l2_by TEXT,
    approved_l2_at TIMESTAMPTZ,
    rejected_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_reason TEXT,
    cancelled_by TEXT,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    points NUMERIC DEFAULT 0,
    idr_value NUMERIC DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'GAS',
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kmb_projek_archive_status ON kmb_projek.work_orders_archive(status);
CREATE INDEX IF NOT EXISTS idx_kmb_projek_archive_date ON kmb_projek.work_orders_archive(date);

-- 8. ProcessedOps (Cermin sheet ProcessedOps - Idempotency Guard)
CREATE TABLE IF NOT EXISTS kmb_projek.processed_ops (
    op_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    token TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    result_json JSONB
);

-- 9. MechanicPoints (Cermin sheet MechanicPoints)
CREATE TABLE IF NOT EXISTS kmb_projek.mechanic_points (
    id SERIAL PRIMARY KEY,
    mechanic_id TEXT NOT NULL,
    wo_number TEXT NOT NULL,
    date DATE NOT NULL,
    points NUMERIC DEFAULT 0,
    idr_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kmb_projek_points_mechanic ON kmb_projek.mechanic_points(mechanic_id, date);

-- 10. PushSubs (Cermin sheet PushSubs)
CREATE TABLE IF NOT EXISTS kmb_projek.push_subs (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    subscription_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
