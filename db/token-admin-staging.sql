-- Token admin uji untuk staging (HANYA UNTUK STAGING, jangan di produksi)
-- Role: supervisor / superintendent (bisa akses user management)
-- Token: uji-spv-admin-master
-- Email: admin.staging@abadiops.com

-- KMB Project
INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
VALUES ('uji-spv-admin-master', 'supervisor', 'UJI-ADM-001', 'Uji Supervisor Staging', 'ACTIVE', now())
ON CONFLICT (token) DO NOTHING;

INSERT INTO kmb_projek.config_mechanics (mechanic_id, name, section, token, email, role, status, created_at)
VALUES ('UJI-ADM-001', 'Uji Supervisor Staging', 'maintenance', 'uji-spv-admin-master', 'admin.staging@abadiops.com', 'supervisor', 'ACTIVE', now())
ON CONFLICT (mechanic_id) DO NOTHING;

-- SUM
INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
VALUES (
  999,
  '["uji-spv-admin-master", "SUPT-001", "admin.staging@abadiops.com", "true"]'::jsonb,
  jsonb_build_object(
    'token', 'uji-spv-admin-master',
    'role', 'superintendent',
    'mechanic_id', 'SUPT-001',
    'email', 'admin.staging@abadiops.com',
    'is_active', true
  ),
  now()
)
ON CONFLICT DO NOTHING;

-- KMB TRA
INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
VALUES (
  999,
  '["uji-spv-admin-master", "SUPT-001", "admin.staging@abadiops.com", "true"]'::jsonb,
  jsonb_build_object(
    'token', 'uji-spv-admin-master',
    'role', 'superintendent',
    'mechanic_id', 'SUPT-001',
    'email', 'admin.staging@abadiops.com',
    'is_active', true
  ),
  now()
)
ON CONFLICT DO NOTHING;
