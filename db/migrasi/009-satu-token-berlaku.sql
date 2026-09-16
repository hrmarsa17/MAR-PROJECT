-- ════════════════════════════════════════════════════════════════════════════
-- 009 — SATU TOKEN BERLAKU PER ORANG, DITEGAKKAN BASIS DATA
-- ════════════════════════════════════════════════════════════════════════════
-- Ketahuan 16 Sep 2026, dari pertanyaan Gabriel: "kenapa token ini terus
-- berganti, dan apakah itu akan terjadi saat sudah jalan?"
--
-- Jawaban atas pertanyaan itu ternyata bukan "tidak" begitu saja. Tidak ada
-- kode yang mengganti token sendiri — `expires_at` tidak pernah ditulis siapa
-- pun, jadi token tidak punya umur — tetapi ADA tiga hal yang membuatnya
-- TERLIHAT berganti dari lapangan, dan yang ketiga ini akarnya:
--
--   Tidak ada apa pun yang mencegah satu orang punya BANYAK token berlaku
--   sekaligus.
--
-- Skrip uji menyisipkan token lewat SQL langsung tanpa mencabut yang lama, dan
-- basis data pengembangan sampai hari ini menyimpan 8 token berlaku untuk satu
-- mekanik, 7 untuk yang lain. Akibatnya:
--
--   • "token mana yang benar" tidak punya jawaban — semuanya benar;
--   • layar yang menampilkan "token terbaru" bisa menampilkan yang BERBEDA dari
--     yang sudah dihafal orangnya, dan itu terbaca persis seperti sistem yang
--     berubah sendiri;
--   • token yang dikira sudah dicabut ternyata masih bisa dipakai masuk.
--
-- Index ini membuat keadaan itu MUSTAHIL, bukan sekadar tidak dianjurkan.
-- Menerbitkan token baru karena itu wajib mencabut yang lama lebih dulu — dan
-- itu memang yang seharusnya terjadi.
--
-- Dicabut, BUKAN dihapus: catatan siapa pernah memegang token apa dan sampai
-- kapan harus tetap bisa dibaca. Pertanyaan "kenapa token saya berubah" tidak
-- bisa dijawab kalau barisnya lenyap.
--
-- ⚠️ Gagal kalau masih ada yang punya lebih dari satu token berlaku. Rapikan
-- dulu:  npx tsx scripts/rapikan-token.ts
--
-- Aman diulang.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_satu_berlaku_idx
  ON api_tokens (mechanic_id)
  WHERE is_active AND revoked_at IS NULL;

COMMENT ON INDEX api_tokens_satu_berlaku_idx IS
  'Satu token berlaku per orang. Menerbitkan yang baru wajib mencabut yang lama '
  'lebih dulu; baris lama tetap disimpan sebagai riwayat.';

COMMENT ON COLUMN api_tokens.expires_at IS
  'Umur token. TIDAK ADA kode yang mengisinya — token KMB tidak kedaluwarsa '
  'dengan sendirinya, dan itu disengaja: mekanik lapangan tidak boleh tiba-tiba '
  'terkunci di tengah shift. Kalau kelak diisi, alur "token saya berhenti '
  'bekerja" harus punya jawaban lebih dulu.';
