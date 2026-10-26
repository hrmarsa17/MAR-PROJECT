-- ============================================================================
-- MAR PROJECT - HYBRID MULTI-TENANT SCHEMA
-- Supports KMB, MAR, SUM and future tenants
-- ============================================================================
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TENANTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tenants (code, name) VALUES
    ('KMB', 'KMB — Mechanic Activity Report'),
    ('MAR', 'MAR — Mechanic Activity Report'),
    ('SUM', 'SUM — Service Unit Management')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. MECHANICS TABLE (Multi-tenant support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mechanics (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mechanic_id VARCHAR(50) UNIQUE NOT NULL,
    mechanic_name VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    role VARCHAR(50) NOT NULL,
    position VARCHAR(100),
    grade VARCHAR(50),
    section VARCHAR(100),
    keterangan TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    may_view_performance BOOLEAN DEFAULT FALSE,
    may_view_technical BOOLEAN DEFAULT FALSE,
    may_view_report BOOLEAN DEFAULT FALSE,
    may_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mechanics_tenant ON mechanics(tenant_id);
CREATE INDEX idx_mechanics_email ON mechanics(email);

-- ============================================================================
-- 3. API TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    mechanic_id INT NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_tokens_mechanic ON api_tokens(mechanic_id);
CREATE INDEX idx_api_tokens_token ON api_tokens(token);

-- ============================================================================
-- 4. CONFIG UNITS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_units (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id VARCHAR(50) NOT NULL,
    unit_name VARCHAR(100) NOT NULL,
    unit_type VARCHAR(50),
    unit_factor NUMERIC(5,2) DEFAULT 1.0,
    unit_scope VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, unit_id)
);

CREATE INDEX idx_config_units_tenant ON config_units(tenant_id);

-- ============================================================================
-- 5. CONFIG COMPONENTS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_components (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    component_no VARCHAR(50) NOT NULL,
    component_name VARCHAR(150) NOT NULL,
    category VARCHAR(50),
    section VARCHAR(50),
    base_points NUMERIC(10,2) DEFAULT 0,
    target_hours NUMERIC(6,2) DEFAULT 0,
    default_team_size INT DEFAULT 1,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, component_no)
);

CREATE INDEX idx_config_components_tenant ON config_components(tenant_id);

-- ============================================================================
-- 6. WORK ORDERS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_orders (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wo_number VARCHAR(50) UNIQUE NOT NULL,
    wo_group_id VARCHAR(64),
    section VARCHAR(50) DEFAULT 'vessel',
    component_id INT REFERENCES config_components(id),
    unit_id VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_mechanic_work',
    work_condition VARCHAR(30) DEFAULT 'normal',
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    actual_hours NUMERIC(6,2) DEFAULT 0,
    hour_meter VARCHAR(50),
    kilometers VARCHAR(50),
    safety_incident BOOLEAN DEFAULT FALSE,
    notes TEXT,
    keterangan TEXT,
    final_points NUMERIC(10,2) DEFAULT 0,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_wo_tenant ON work_orders(tenant_id);
CREATE INDEX idx_wo_status ON work_orders(status);
CREATE INDEX idx_wo_unit ON work_orders(unit_id);
CREATE INDEX idx_wo_created_at ON work_orders(created_at DESC);

-- ============================================================================
-- 7. WORK ORDER TEAM (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_order_team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wo_id VARCHAR(64) REFERENCES work_orders(id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mechanic_id INT REFERENCES mechanics(id),
    mechanic_external_id VARCHAR(50),
    percentage NUMERIC(5,2) DEFAULT 100.0,
    is_lead BOOLEAN DEFAULT FALSE,
    awarded_points NUMERIC(10,2) DEFAULT 0,
    awarded_idr NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_team_wo ON work_order_team(wo_id);
CREATE INDEX idx_team_mechanic ON work_order_team(mechanic_id);
CREATE INDEX idx_team_tenant ON work_order_team(tenant_id);

-- ============================================================================
-- 8. APPROVALS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wo_id VARCHAR(64) REFERENCES work_orders(id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL,
    decision VARCHAR(30) NOT NULL,
    approver_email VARCHAR(150) NOT NULL,
    notes TEXT,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    putaran INT DEFAULT 1
);

CREATE INDEX idx_approvals_wo ON approvals(wo_id);
CREATE INDEX idx_approvals_tenant ON approvals(tenant_id);

-- ============================================================================
-- 9. SCORING SNAPSHOTS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scoring_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wo_id VARCHAR(64) REFERENCES work_orders(id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    base_points NUMERIC(10,2) DEFAULT 0,
    unit_factor NUMERIC(5,2) DEFAULT 1.0,
    work_condition_factor NUMERIC(5,2) DEFAULT 1.0,
    timeliness_factor NUMERIC(5,2) DEFAULT 1.0,
    safety_factor NUMERIC(5,2) DEFAULT 1.0,
    mtbf_factor NUMERIC(5,2) DEFAULT 1.0,
    final_score NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_snapshots_wo ON scoring_snapshots(wo_id);
CREATE INDEX idx_snapshots_tenant ON scoring_snapshots(tenant_id);

-- ============================================================================
-- 10. AUDIT LOGS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mechanic_id INT REFERENCES mechanics(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(64),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_mechanic ON audit_logs(mechanic_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 11. MTBF TRACKING (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mtbf_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id VARCHAR(50) NOT NULL,
    last_wo_id VARCHAR(64),
    last_redo_at TIMESTAMP WITH TIME ZONE,
    current_mtbf_hours NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, unit_id)
);

CREATE INDEX idx_mtbf_tenant ON mtbf_tracking(tenant_id);

-- ============================================================================
-- 12. OTHERS JOB REQUESTS (Multi-tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS others_job_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wo_id VARCHAR(64) REFERENCES work_orders(id) ON DELETE CASCADE,
    description TEXT,
    base_points NUMERIC(10,2),
    target_hours NUMERIC(6,2),
    status VARCHAR(50) DEFAULT 'pending',
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_others_job_tenant ON others_job_requests(tenant_id);
CREATE INDEX idx_others_job_wo ON others_job_requests(wo_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtbf_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE others_job_requests ENABLE ROW LEVEL SECURITY;

-- Policies for tenants
CREATE POLICY "Tenants read all" ON tenants FOR SELECT USING (true);

-- Policies for mechanics (tenant isolation)
CREATE POLICY "Mechanics select own tenant" ON mechanics
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policies for api_tokens (tenant isolation)
CREATE POLICY "Tokens select own tenant" ON api_tokens
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policies for work_orders (tenant isolation)
CREATE POLICY "WO select own tenant" ON work_orders
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policies for approvals (tenant isolation)
CREATE POLICY "Approvals select own tenant" ON approvals
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active work orders per tenant
CREATE OR REPLACE VIEW active_work_orders_per_tenant AS
SELECT 
    t.code AS tenant_code,
    t.name AS tenant_name,
    COUNT(*) AS total_active,
    COUNT(*) FILTER (WHERE w.status = 'pending_mechanic_work') AS pending_mechanic,
    COUNT(*) FILTER (WHERE w.status = 'in_progress') AS in_progress,
    COUNT(*) FILTER (WHERE w.status = 'pending_supervisor') AS pending_supervisor,
    COUNT(*) FILTER (WHERE w.status = 'pending_superintendent') AS pending_superintendent,
    COUNT(*) FILTER (WHERE w.status = 'pending_transfer') AS pending_transfer
FROM tenants t
JOIN work_orders w ON w.tenant_id = t.id
WHERE w.status IN ('pending_mechanic_work', 'in_progress', 'pending_supervisor', 'pending_superintendent', 'pending_transfer')
GROUP BY t.id, t.code, t.name;

-- View: Mechanic performance per tenant
CREATE OR REPLACE VIEW mechanic_performance_per_tenant AS
SELECT 
    t.code AS tenant_code,
    m.mechanic_name,
    COUNT(w.id) AS total_wo,
    COALESCE(SUM(w.final_points), 0) AS total_points,
    COALESCE(SUM(w.final_points) * 50000, 0) AS total_idr
FROM tenants t
JOIN mechanics m ON m.tenant_id = t.id
LEFT JOIN work_order_team wot ON wot.mechanic_id = m.id
LEFT JOIN work_orders w ON w.id = wot.wo_id
GROUP BY t.id, t.code, m.mechanic_name;
