-- ════════════════════════════════════════════════════════════════════════════
-- 002 — LABEL work_condition: Shift 1 / Shift 2 / Kondisi Ekstrim
-- ════════════════════════════════════════════════════════════════════════════
-- work_condition BUKAN tingkat kesulitan. Di seluruh layar KMB V2 ia dibaca
-- sebagai SHIFT (ApprovalService.js:1276-1278, Approval.html:743-745), dan
-- pengali 1,2 adalah premi shift malam.
--
-- Label lama ("Medan/cuaca menyulitkan") mengundang orang memilih Shift 2 untuk
-- pekerjaan berat di siang hari — kenaikan 20% dengan alasan yang salah.
--
-- Kunci tidak diganti; hanya labelnya. Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE factors SET description = 'Shift 1'
 WHERE factor_type = 'work_condition' AND factor_key = 'normal';

UPDATE factors SET description = 'Shift 2'
 WHERE factor_type = 'work_condition' AND factor_key = 'difficult';

UPDATE factors SET description = 'Kondisi Ekstrim'
 WHERE factor_type = 'work_condition' AND factor_key = 'extreme';
