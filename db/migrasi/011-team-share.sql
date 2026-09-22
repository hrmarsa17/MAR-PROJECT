-- Menambah dukungan pembagian poin (share) per mekanik.
-- Default 1.0 (poin penuh), agar kompatibel dengan KMB.
ALTER TABLE work_order_team ADD COLUMN share numeric(5,2) NOT NULL DEFAULT 1.0 CHECK (share >= 0 AND share <= 1.0);
