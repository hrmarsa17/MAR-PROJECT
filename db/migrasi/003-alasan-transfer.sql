-- ════════════════════════════════════════════════════════════════════════════
-- 003 — ALASAN KEPUTUSAN TRANSFER, supaya mekanik bisa membacanya
-- ════════════════════════════════════════════════════════════════════════════
-- Transfer yang DITOLAK menghanguskan jam sesi mekanik: ia bekerja tiga jam,
-- lalu tiga jam itu tidak dibayar. Sampai sekarang alasannya hanya masuk
-- `audit_logs`, yang tidak dilihat siapa pun di lapangan — persis keadaan yang
-- melahirkan pertanyaan "kenapa jam saya tidak dihitung", dan tak seorang pun
-- punya jawabannya tanpa membuka basis data.
--
-- KMB V2 juga begitu (`ApprovalService.js:1947`, alasan hanya ke audit). Ini
-- salah satu tempat yang sengaja TIDAK 1:1 — keputusan Gabriel 16 Sep 2026.
--
-- Kolomnya diisi saat menolak. Persetujuan tidak butuh alasan, jadi ia tetap
-- NULL di sana. Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE work_order_transfers
  ADD COLUMN IF NOT EXISTS decision_reason text;

COMMENT ON COLUMN work_order_transfers.decision_reason IS
  'Alasan L1 menolak transfer. DIBACA MEKANIK di kartu WO-nya — jam sesinya '
  'hangus karena keputusan ini, jadi ia berhak tahu sebabnya.';
