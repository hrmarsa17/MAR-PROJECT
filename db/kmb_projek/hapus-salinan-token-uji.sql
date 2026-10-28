-- ==============================================================================
-- PILIHAN C (28 Okt 2026): BERSIHKAN SALINAN 4 TOKEN AKUN UJI KMB V2 DARI CERMIN KMB PROJECT
-- Keputusan: docs/KEPUTUSAN.md nomor 8
-- ==============================================================================
--
-- Kenapa perlu: Worker KMB Project mengecek login (ping) ke kmb_projek.api_tokens
-- LEBIH DULU lewat RPC kmb_ping, baru ke GAS. Selama baris lama masih ada di sini,
-- token lama tetap bisa masuk KMB Project walau sheet ApiTokens sudah diganti.
--
-- Token mentah sengaja TIDAK ditulis (repo publik). Yang dicocokkan md5-nya:
--   SUPT-001  fc324aa22b158fead35190734535bb7b
--   SPV-001   96a2c14fb68ddcad0b7b184e0bc52cd4
--   MECH-003  d5e21af3786bb31c6d7835ef8770c2ce
--   TYRE-002  b551a2256c861ea437aaef5c8de0d3ee
--
-- Urutan: jalankan SESUDAH token ketiga akun diganti di spreadsheet KMB Project
-- dan SESUDAH sinkron ulang (scripts/sinkron-kmb-projek-cermin.mjs) memakai token
-- uji baru. Kalau sinkron dijalankan lagi sementara sheet belum bersih, baris lama
-- masuk lagi; jalankan ulang file ini.
--
-- Aman dijalankan berkali-kali. Hasilnya daftar baris yang diubah; "No rows"
-- berarti sudah bersih. kmb_projek.processed_ops tidak disentuh: itu catatan
-- riwayat, bukan tempat login.

WITH lama(sidik) AS (
    VALUES ('fc324aa22b158fead35190734535bb7b'),
           ('96a2c14fb68ddcad0b7b184e0bc52cd4'),
           ('d5e21af3786bb31c6d7835ef8770c2ce'),
           ('b551a2256c861ea437aaef5c8de0d3ee')
),
hapus_token AS (
    DELETE FROM kmb_projek.api_tokens t
     USING lama
     WHERE md5(btrim(t.token)) = lama.sidik
    RETURNING 'api_tokens: baris dihapus'::text AS perubahan, t.user_id AS akun, t.role
),
kosongkan_mekanik AS (
    UPDATE kmb_projek.config_mechanics m
       SET token = NULL
      FROM lama
     WHERE md5(btrim(m.token)) = lama.sidik
    RETURNING 'config_mechanics: token dikosongkan'::text, m.mechanic_id, m.role
)
SELECT * FROM hapus_token
UNION ALL
SELECT * FROM kosongkan_mekanik;
