-- ════════════════════════════════════════════════════════════════════════════
-- 008 — LINGKUP UNIT: 'global' punya kolomnya sendiri
-- ════════════════════════════════════════════════════════════════════════════
-- Ketahuan 16 Sep 2026, saat menyiapkan pengaturan unit di menu Admin.
--
-- Di KMB V2 sebuah unit punya `unit_scope`, dan nilainya ada LIMA macam
-- (`ConfigService.js:162`, `WorkOrder.html:501-535`):
--
--   field / tyreman / workshop   dedicated — boleh dipilih section itu
--   "tyreman,field"              boleh DUA section sekaligus
--   global                       bukan pegangan harian (unit sewa). Masih boleh
--                                dipilih, tapi DISEMBUNYIKAN sampai diminta.
--   others                       bukan unit sungguhan; memilihnya mengalihkan
--                                blok ke job manual
--   (kosong)                     milik semua section
--
-- Skema kita punya tempat untuk empat di antaranya: `unit_sections` untuk daftar
-- section, `is_virtual` untuk 'others', dan "tanpa baris" untuk (kosong).
-- 'global' TIDAK punya tempat — ia ikut dipindahkan sebagai "tanpa baris".
--
-- Akibatnya 16 unit sewa berubah arti menjadi kebalikannya: dari "sembunyikan
-- sampai diminta" jadi "milik semua section". Di layar buat WO mereka berdiri
-- sejajar dengan alat pegangan harian.
--
-- Sebaran sebenarnya di backup KMB 15 Sep 2026 (103 unit):
--   field 36 · tyreman 35 · tyreman,field 15 · global 16 · others 1 · kosong 0
--
-- Tidak ada satu pun baris kosong — jadi sesudah ini, "tanpa baris
-- unit_sections DAN is_global = false" berarti data yang belum diisi, bukan
-- keadaan normal.
--
-- Nilainya dipulihkan dengan menjalankan ulang scripts/pindah-katalog-v2.ts,
-- yang membaca unit_scope dari lembar aslinya.
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE units ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN units.is_global IS
  'Unit sewa / bukan pegangan harian. Tetap boleh dipilih, tapi disembunyikan '
  'di layar buat WO sampai penggunanya menekan "Tampilkan semua unit". '
  'Setara unit_scope = ''global'' di KMB V2.';

COMMENT ON TABLE unit_sections IS
  'Section mana saja yang boleh memilih unit ini — setara unit_scope di KMB V2. '
  'Satu unit boleh milik beberapa section sekaligus (15 unit KMB ber-scope '
  '"tyreman,field"). TIDAK sama dengan section model unitnya: sebuah Hauler '
  'modelnya milik field, tapi tyreman yang mengurus bannya.';
