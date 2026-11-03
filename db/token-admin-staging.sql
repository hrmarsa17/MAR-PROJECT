-- Token admin uji untuk staging (HANYA UNTUK STAGING, jangan di produksi)
-- Role: supervisor (bisa akses user management)
-- Token: uji-spv-admin-master
-- Email: uji.spv.staging@example.com

INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
VALUES ('uji-spv-admin-master', 'supervisor', 'UJI-ADM-001', 'Uji Supervisor Staging', 'ACTIVE', now())
ON CONFLICT (token) DO NOTHING;

INSERT INTO kmb_projek.config_mechanics (mechanic_id, name, section, token, email, role, status, created_at)
VALUES ('UJI-ADM-001', 'Uji Supervisor Staging', 'maintenance', 'uji-spv-admin-master', 'uji.spv.staging@example.com', 'supervisor', 'ACTIVE', now())
ON CONFLICT (mechanic_id) DO NOTHING;
