-- Menambahkan data tenant KMB dan SUM jika belum ada.
INSERT INTO tenants (code, name) 
VALUES ('KMB', 'KMB Project'), ('SUM', 'SUM Project')
ON CONFLICT (code) DO NOTHING;
