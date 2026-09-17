-- ════════════════════════════════════════════════════════════════════════════
-- RIWAYAT PENERAPAN — apa yang pernah benar-benar tayang, dan sejak kapan
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── KENAPA TABEL INI ADA ────────────────────────────────────────────────────
-- Pada 17 Sep 2026 repo ini mulai dikerjakan berdua. Orang kedua mendorong
-- perubahan lalu tidak punya satu pun cara memastikan perubahannya terbit:
-- keanggotaan Vercel berbayar, jadi dasbor Deployments tertutup untuknya.
--
-- `/api/sehat` sudah menyebut commit yang SEDANG tayang, tapi itu hanya
-- menjawab satu pertanyaan. Yang tidak terjawab: apa saja yang sudah pernah
-- masuk, dari siapa, dan sejak jam berapa. Pertanyaan itu muncul justru saat
-- keadaan buruk — "sejak kapan layar ini rusak, dan penerapan mana yang
-- merusaknya" — dan saat itu tidak ada yang sempat membuka dasbor.
--
-- GitHub menyimpan riwayat commit, tapi commit yang ada di GitHub BELUM TENTU
-- tayang: ia bisa masih dibangun, bisa gagal dibangun, bisa tertahan. Yang
-- membedakan "sudah di-push" dari "sudah masuk produksi" hanya baris di sini.
--
-- ── KENAPA TIDAK PAKAI audit_logs ───────────────────────────────────────────
-- `audit_logs` mencatat perbuatan ORANG terhadap data — tiap baris punya
-- `actor_id` yang menunjuk seorang mekanik. Penerapan tidak punya pelaku di
-- dalam sistem: yang menerbitkan adalah Vercel, dipicu oleh commit. Memaksanya
-- masuk ke sana berarti mengarang actor_id, dan sesudah itu tidak ada lagi cara
-- membedakan mana yang benar-benar dilakukan orang.
--
-- ── KENAPA TANPA tenant_id ──────────────────────────────────────────────────
-- Ini satu-satunya tabel di skema yang sengaja TIDAK bertenant, dan itu bukan
-- kelalaian. Penerapan adalah sifat mesinnya, bukan milik KMB atau SUM: satu
-- penerapan melayani semua tenant sekaligus. Memberinya tenant_id akan
-- menyiratkan tiap tenant bisa tayang di versi berbeda, dan itu tidak benar.
-- Saat SUM V2 masuk, tabel ini tetap satu.

CREATE TABLE IF NOT EXISTS deployments (
  commit_sha text PRIMARY KEY,
  pesan      text,
  penulis    text,
  cabang     text,
  tayang_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE deployments IS
  'Penerapan yang benar-benar pernah melayani permintaan. Diisi aplikasi '
  'sendiri saat pertama kali dijalankan pada sebuah commit, bukan oleh migrasi '
  'maupun manusia.';

COMMENT ON COLUMN deployments.tayang_at IS
  'Saat penerapan ini MELAYANI permintaan pertamanya — bukan saat commit '
  'dibuat, dan bukan saat Vercel selesai membangun. Selisihnya bisa beberapa '
  'menit, dan yang menentukan bagi orang yang sedang memakai adalah yang ini.';

COMMENT ON COLUMN deployments.commit_sha IS
  'Tujuh huruf pertama VERCEL_GIT_COMMIT_SHA. Kunci utama, supaya penulisan '
  'berulang dari beberapa instans serverless sekaligus cukup diabaikan dengan '
  'ON CONFLICT DO NOTHING.';

CREATE INDEX IF NOT EXISTS deployments_tayang_idx ON deployments (tayang_at DESC);
