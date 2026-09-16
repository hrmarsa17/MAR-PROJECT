-- ════════════════════════════════════════════════════════════════════════════
-- 006 — PENANDA ADMIN
-- ════════════════════════════════════════════════════════════════════════════
-- Di KMB V2 tidak ada penanda seperti ini, karena tidak perlu: siapa pun yang
-- bisa membuka spreadsheet-nya bisa mengubah apa saja di dalamnya. Spreadsheet
-- ITULAH menu adminnya.
--
-- Begitu spreadsheet hilang, hak itu harus dinyatakan. Keputusan Gabriel
-- 16 Sep 2026: penanda TERSENDIRI, bukan otomatis melekat pada peran L2.
-- Sebabnya sederhana — menyetujui WO dan mengubah tarif rupiah per poin adalah
-- dua kewenangan yang berbeda, dan yang satu tidak seharusnya membawa yang
-- lain. Dengan penanda sendiri, hak admin bisa dicabut tanpa mencabut hak
-- approval, dan sebaliknya.
--
-- Mati secara bawaan untuk SEMUA ORANG. Yang menyalakannya pertama kali harus
-- lewat SQL — itu disengaja: pintu yang bisa membuka dirinya sendiri bukan
-- pintu.
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE mechanics
  ADD COLUMN IF NOT EXISTS may_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mechanics.may_admin IS
  'Boleh membuka menu Admin: orang, token, katalog, faktor, tarif, setelan. '
  'Terpisah dari peran — L2 tidak otomatis mendapatkannya.';
