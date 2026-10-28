# Serah terima 29 Okt 2026: Gabriel (+ Claude) → Raka

Baca ini sebelum mulai. Rinciannya ada di `docs/PROGRES.md` (entri 28–29 Okt), `docs/KEPUTUSAN.md`, dan `docs/BUG-DICATAT.md` (#12–#16).

## 1. Sebelum menyentuh apa pun

- Jalankan `git pull --rebase`. Malam ini masuk sekitar 25 commit, termasuk ke `worker.js` dan `scripts/patched-app.js`.
- Baca `AGENTS.md`, terutama §0a (koridor cara kerja) dan §5 (garis merah, termasuk **HARAM hardcode**). Pastikan AI-mu memuat `AGENTS.md` di awal setiap sesi. `GEMINI.md` sudah menunjuk ke sana.
- **Push ke `main` = deploy produksi.** Worker `project-mar` (aplikasi KMB Project di `kmbprojek.abadiops.com`) ter-build otomatis dari GitHub setiap ada push, dan tayang sekitar 2–4 menit kemudian.

## 2. Susunan sekarang (live dan diuji di browser 29 Okt)

| Alamat | Isi | Worker | Kode | Cara deploy |
|---|---|---|---|---|
| `abadiops.com` | **Pintu netral**: isi token, dikenali di semua rumah, lalu diantar | `abadiops-pintu` | `workers/pintu/` | manual: `cd workers/pintu; npx wrangler deploy` |
| `kmbprojek.abadiops.com` | KMB Project (manpower panggilan proyek) | `project-mar` | `worker.js` di akar (+ salinan identik `workers/kmb-projek/worker.js`) | **otomatis dari push ke `main`** |
| `sum.abadiops.com` | SUM V2 | `abadiops-sum` | `workers/sum/`, `pwa/sum/` | manual |
| `kmbtra.abadiops.com` | KMB V2 (PT KMB di site TRA) | `abadiops-kmb` | `workers/kmb/`, `pwa/kmb/` | manual |
| nanti: `kmbbupr.abadiops.com` | PT KMB di site BUPR | — | — | satu baris baru di `RUMAH`, `workers/pintu/wrangler.toml` |

Catatan:
- Worker `project-kmb` tidak punya domain dan tidak dipakai. `npx wrangler deploy` dari akar repo justru masuk ke sana, karena `name` di `wrangler.toml` akar, dan tidak sampai ke produksi.
- Alamat `*.workers.dev` dicegat DNS sebagian provider internet. Selalu pakai `*.abadiops.com`.
- Domain `abadiops.com` dan `kmbprojek.abadiops.com` dipasang lewat dashboard. **Jangan menambah `routes` di `wrangler.toml` akar** tanpa mencantumkan `kmbprojek.abadiops.com`, karena wrangler bisa melepas domain yang tidak tercantum.

## 3. Yang berubah di rumahmu (KMB Project) malam ini

**Ditambah**
- Gerbang tahap 4 di `worker.js`: Supabase hanya melayani aksi yang ada di `AKSI_SUPABASE_LULUS_KEMBAR`, yang sekarang masih kosong. Semua aksi baca lewat GAS. `?uji=supabase` memaksa jalur Supabase, khusus untuk uji (bug #12).
- `scripts/uji-kembar-kmb-projek.mjs`: membandingkan jalur Supabase dengan GAS lewat Worker, dengan baris dicocokkan per kunci.
- `db/kmb_projek/hapus-salinan-token-uji.sql` dan `db/kmb_projek/rpc_wajib_token.sql`. Keduanya **sudah dijalankan** di Supabase dan diverifikasi. Keempat RPC baca lama tertutup untuk anon; pintu masuknya pembungkus `*_bertoken` (bug #13).
- Pembaca `#token=` di `checkAuth()`. Pintu mengantar pengguna ke sini dengan `#token=`.

**Diubah**
- Login KMB Project: **hanya ke GAS KMB Project**, 1:1 dengan PWA lama. Rumah lain dikenali pintu, bukan aplikasimu.
- Penerus data: hanya ke GAS KMB Project. Rute data ke GAS SUM dibuang (isolasi).
- Worker memanggil `kmb_create_refs_bertoken`, `kmb_monitoring_bertoken`, dan `kmb_my_wos_bertoken`. Identitas mekanik diambil dari token, seperti GAS.
- `scripts/sinkron-kmb-projek-cermin.mjs`: tidak lagi membuat token tiruan `kmb-<id>` (bug #14). Token uji SPV dibaca dari env `KMBP_UJI_SPV_TOKEN`.
- `db/kmb_projek/rpc_baca.sql`: GRANT keempat fungsi baca diganti REVOKE.

**Dibuang**
- 4 salinan token uji KMB V2 (`SUPT-001`, `SPV-001`, `MECH-003`, `TYRE-002`): dari `data.js` (`TOKENS` 28 → 24, `offline_token` SUPT-001), dari sheet `ApiTokens` (oleh Gabriel), dan dari cermin Supabase.
- Peran yang dikunci ke token di `patched-app.js`. Daftar token SUM di `worker.js` (`isKnownSumToken`) dan `patched-app.js` (`tenantCode`).
- `GAS_URLS.KMB_V2`, `GAS_FALLBACK_URLS.KMB_V2`, dan cadangan ping ke rumah lain.
- `scripts/sum-monitoring.json`, salinan 40 token dan nama mekanik SUM yang tidak dipakai.
- `scripts/update-worker-engine.mjs` dipensiunkan, karena menimpa seluruh blok `/api/gas`. Sekarang skrip itu langsung keluar dengan pesan.

**Di luar rumahmu, untuk diketahui**
- Pintu `workers/pintu/`. PWA SUM dan KMB V2 punya pembaca `#token=`. Alamat baru `sum.` dan `kmbtra.`.
- `scripts/buat-token-tiga-rumah.mjs`: membuat dan mengecek token ke semua rumah, dengan daftar rumah dibaca dari konfigurasi pintu.
- **Insiden 28 Okt:** commit yang mengantar ke domain yang belum ada tayang otomatis di produksi selama beberapa menit. Pelajarannya ada di `AGENTS.md` §0a butir 3.

## 4. Tugasmu, urut

1. **Token uji.** Setel env lokal `KMBP_UJI_SPV_TOKEN` (token uji SPV-001 baru) dan `SUM_UJI_TOKEN`. Minta nilainya ke Gabriel, dan jangan pernah menulisnya di repo. Token uji baru KMB Project **belum** dimasukkan ke sheet `ApiTokens`; minta Gabriel menambahkannya kalau kamu butuh akun uji.
2. **Bug #16: HAPUS** (keputusan Gabriel 29 Okt; tertanam di kode = hardcode = haram). Buang `DEFAULT_MECHANICS_LIST` di `patched-app.js` serta `TOKENS`/`MECHANICS` di `data.js`. Konsekuensinya diterima: tidak ada login offline, dan layar awal kosong sampai data GAS masuk. Uji di `wrangler dev` dulu; push langsung tayang.
3. **Buang sisa kode pengantaran** di portal: `serahkanKeRumah`, `ALAMAT_APLIKASI_RUMAH`, dan blok antar di `loginWithToken`. Kodenya sudah mati sejak 29 Okt.
4. **Bug #15.** Ambil definisi `kmb_projek.catalog_jobs` dari Supabase, masukkan ke `cermin_sheet.sql`, lalu isi lewat skrip sinkron.
5. **Bug #12.** Perbarui cermin terus-menerus, jalankan uji kembar per aksi, dan masukkan aksi yang lulus ke `AKSI_SUPABASE_LULUS_KEMBAR` satu per satu.
6. **`scripts/verify-sum-kmb-isolation.mjs`** menguji perilaku lama, saat Worker KMB Project masih melayani SUM. Perbarui atau pensiunkan.
7. **Worker `project-kmb`** tidak dipakai. Bicarakan dengan Gabriel: hapus, dan/atau samakan `name` di `wrangler.toml` akar dengan `project-mar`.

## 5. Jangan

- Jangan push perubahan yang bergantung pada domain, DNS, SQL, atau isi sheet sebelum hal itu terbukti ada.
- Jangan mengembalikan pengecekan rumah lain ke Worker KMB Project. Itu tugas pintu.
- Jangan menulis token di kode, skrip, uji, dokumen, maupun pesan commit. Cek bentrok token dengan `node scripts/buat-token-tiga-rumah.mjs --cek <token>`.
- Jangan memakai `sed -i` di Git Bash untuk file repo, karena seluruh akhiran baris file ikut berubah. Pakai Node.
