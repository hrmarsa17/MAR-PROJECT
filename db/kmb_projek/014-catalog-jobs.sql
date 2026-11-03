-- ==============================================================================
-- Migrasi: Tabel Catalog Jobs untuk Rumah KMB Project (kmb_projek)
-- Sesuai rpc_baca.sql, 007-kode-job-per-section.sql & AGENTS.md §2
-- Catatan: job_id tidak unik global, melainkan unik per section (vessel vs maintenance)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs (
    job_id TEXT NOT NULL,
    unit_model TEXT,
    component TEXT,
    sub_component TEXT,
    job_description TEXT,
    plan_hours NUMERIC DEFAULT 0,
    base_point NUMERIC DEFAULT 0,
    job_type TEXT DEFAULT 'breakdown',
    section TEXT NOT NULL, -- 'vessel', 'maintenance', 'workshop'
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (section, job_id)
);

CREATE INDEX IF NOT EXISTS idx_kmbp_catalog_section ON kmb_projek.catalog_jobs(section, status);
CREATE INDEX IF NOT EXISTS idx_kmbp_catalog_model ON kmb_projek.catalog_jobs(unit_model);

GRANT SELECT ON kmb_projek.catalog_jobs TO service_role;
