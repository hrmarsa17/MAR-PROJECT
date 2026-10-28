# Serah terima 29 Okt 2026 (final): Gabriel (+ Claude) → Raka

Untuk Raka dan AI-nya. Baca dari atas sampai bawah sebelum mulai. Rinciannya ada di `docs/PROGRES.md` (entri 28–29 Okt), `docs/KEPUTUSAN.md`, `docs/SAKLAR.md`, dan `docs/BUG-DICATAT.md` (#11–#18).

## 1. Sebelum menyentuh apa pun

- Jalankan `git pull --rebase`. Sejak 28 Okt masuk sekitar 40 commit, termasuk ke `worker.js`, `scripts/patched-app.js`, `scripts/built-index.html`, `pwa/`, dan `workers/`.
- Baca `AGENTS.md`, terutama §0a (koridor cara kerja) dan §5 (garis merah, termasuk **HARAM hardcode**). Pastikan AI-mu memuat `AGENTS.md` di awal setiap sesi. `GEMINI.md` sudah menunjuk ke sana; kalau Antigravity tidak membacanya otomatis, pasang `AGENTS.md` sebagai aturan workspace.
- **Push ke `main` = deploy produksi** `kmbprojek.abadiops.com` (Worker `project-mar`, Workers Builds), yang tayang sekitar 1–4 menit kemudian. Uji dulu dengan `wrangler dev`. Sesudah push, pantau sampai versi baru tayang.

## 2. Susunan sekarang (live dan diuji 29 Okt)

| Alamat | Isi | Worker | Kode | Deploy |
|---|---|---|---|---|
| `abadiops.com` | **Pintu netral** | `abadiops-pintu` | `workers/pintu/` | manual: `cd workers/pintu; npx wrangler deploy` |
| `kmbprojek.abadiops.com` | KMB Project (portal buatan Raka) | `project-mar` | `worker.js` di akar + salinan identik `workers/kmb-projek/worker.js` | **otomatis dari push ke `main`** |
| `sum.abadiops.com` | SUM V2 (salinan 1:1 PWA lama) | `abadiops-sum` | `workers/sum/`, `pwa/sum/` | manual |
| `kmbtra.abadiops.com` | KMB V2, PT KMB di site TRA (salinan 1:1 PWA lama) | `abadiops-kmb` | `workers/kmb/`, `pwa/kmb/` | manual |
| nanti: `kmbbupr.abadiops.com` | PT KMB di site BUPR | — | — | satu baris baru di `RUMAH`, `workers/pintu/wrangler.toml` |

**Alur masuk** (keputusan 29 Okt nomor 10):
1. Pengguna membuka `abadiops.com` dan mengisi token. Pintu mengeceknya ke GAS semua rumah sekaligus; token yang kembar ditolak.
2. Pengguna memilih **📱 Aplikasi** (`<rumah>.abadiops.com#token=`) atau **🖥️ Web** (alamat GAS rumah itu + `?token=`).
3. Dashboard langsung tampil. **Tidak ada lagi layar token di rumah mana pun**; layar token hanya muncul kalau token ditolak.

"Web" masih membuka `script.google.com`, karena halaman web GAS belum dipindah 1:1 (lihat §5).

**Catatan teknis**
- Tiap aplikasi rumah hanya mengenal token rumahnya sendiri, 1:1 dengan PWA lama. Mengenali rumah adalah tugas pintu.
- Worker `project-kmb` tidak punya domain dan tidak dipakai. `npx wrangler deploy` dari akar masuk ke sana, bukan ke produksi.
- Domain dipasang lewat dashboard. **Jangan menambah `routes` di `wrangler.toml` akar** tanpa mencantumkan semua domain Worker itu.
- `*.workers.dev` dicegat DNS sebagian provider internet. Selalu pakai `*.abadiops.com`.

## 3. Yang berubah 28–29 Okt (ringkas)

- **Token kembar** (pilihan C): 4 salinan akun uji KMB V2 dibuang dari KMB Project, yaitu dari bundel, sheet, dan cermin Supabase.
- **Pintu netral dan penamaan rumah:** `abadiops.com` hanya pintu; rumah `sum`, `kmbtra`, dan `kmbprojek`. Daftar rumah ada di konfigurasi pintu.
- **Isolasi:** Worker KMB Project hanya bicara dengan GAS KMB Project, baik untuk login maupun data. Rute dan pengecekan rumah lain sudah dibuang.
- **Gerbang tahap 4:** Supabase hanya melayani aksi yang ada di `AKSI_SUPABASE_LULUS_KEMBAR`, yang sekarang **kosong**. Semua aksi baca lewat GAS. `?uji=supabase` khusus untuk uji kembar (`scripts/uji-kembar-kmb-projek.mjs`).
- **RPC Supabase wajib token** (`db/kmb_projek/rpc_wajib_token.sql`, **sudah dijalankan**). Pembersihan token lama di cermin juga sudah dijalankan.
- **HARAM hardcode:**
  - Daftar mekanik dan token di portal dibuang (#16). `data.js` sekarang kosong, dan portal tidak lagi punya login offline.
  - Angka contoh palsu dan label "Live Supabase" yang tidak jujur dibuang (#17).
  - Token di skrip, uji, dan dokumen dipindah ke environment.
  - Alat token: `node scripts/buat-token-tiga-rumah.mjs` (buat) atau `--cek <token>`, yang bertanya langsung ke GAS semua rumah.
- **Pilihan Aplikasi/Web di pintu** (#10): `masukDariPintu` di kedua PWA, serta `masukDariPintu`, `tampilkanSesudahMasuk`, dan penanda `dari-pintu` di portal.
- **Sambungan tiap rumah dicek 29 Okt:**
  - KMB TRA dan SUM: data lewat aplikasi **sama persis** dengan GAS-nya, dan token rumah lain ditolak.
  - KMB Project: token rumah lain ditolak. Uji positif menunggu token uji (§6).
- **Skrip yang dipensiunkan:** `scripts/update-worker-engine.mjs`, karena menimpa seluruh blok `/api/gas`.
- **Insiden 28 Okt:** perubahan yang mengantar ke domain yang belum ada sempat tayang otomatis. Pelajarannya ada di `AGENTS.md` §0a butir 3.

## 4. Status per rumah terhadap rencana migrasi

Rencana yang mengikat (`docs/KEPUTUSAN.md`, `docs/SAKLAR.md`):
- Cermin GAS → Supabase berjalan terus, searah.
- Aksi baca pindah satu per satu setelah lulus uji kembar.
- Halaman web dipindah 1:1.
- Saklar dua cabang: WO lama menyelesaikan hidupnya di GAS sampai approved, WO baru lahir di Supabase.
- Cermin tetap jalan supaya data bulan lama bisa dilihat dan payroll lama bisa ditarik ulang.

| Tahap | SUM | KMB TRA | KMB Project |
|---|---|---|---|
| 2. Cermin terus-menerus | skema (`db/sum/cermin_sheet.sql`) dan alat (`tools/sum/sinkron-cermin.mjs`) siap, **belum jalan** (menunggu akun layanan Google) | **belum mulai** | ada di skema `kmb_projek`, tapi diisi manual dan berbeda dengan GAS (#12, #15) |
| 3. Pintu (aplikasi di Abadi, diteruskan ke GAS) | ✅ | ✅ | ✅ (portal, bukan salinan 1:1 PWA lama) |
| 4. Aksi baca pindah ke cermin | – | – | – (0 aksi lulus uji kembar) |
| Halaman web 1:1 (**wajib sebelum saklar**) | – | – | – |
| Panel saklar di `abadiops.com` | belum dibangun (sama untuk semua rumah) | | |
| 5. Saklar dua cabang | – | – | – |

## 5. Target selesai dan rencana berikutnya

**Target selesai** (keputusan Gabriel 29 Okt, rinciannya di `docs/SAKLAR.md`):
- Rencananya matang dan sudah **diuji langsung**: staging, uji kembar, uji rekam-putar, dan latihan saklar balik.
- **Aman, dengan rencana cadangan dan jaring pengaman.**
- Tinggal **menyalakan saklar**, yaitu tombol visual di `abadiops.com` di alamat yang sedikit tersembunyi dan dilindungi kata sandi, dengan peringatan saat dinyalakan.
- Saklar juga **penyelamat**: kalau dimatikan saat ada masalah, tidak ada data yang rusak atau hilang.
- Momen go-live: saklar dinyalakan, lalu operasi ditunggu dan dipantau.

**Urutan kerja:**
1. **KMB Project versi 1:1 dari PWA lama.** Pemindahan domainnya menunggu keputusan Gabriel nomor 11.
   - Sumbernya ada di laptop Gabriel: `MAR github/mar-projek-offline` (cache `mar-projek-v1`, API ke `AKfycbxh4086…`).
   - Buat `pwa/kmbprojek/` dan `workers/kmbprojek/` dengan resep yang sama seperti `pwa/kmb`, yaitu empat baris yang diubah (lihat `workers/kmb/README.md`).
   - Tambahkan `ambilTokenSerahan` dan `masukDariPintu` seperti di `pwa/kmb/app.js`, lalu uji di `wrangler dev`.
2. **Cermin untuk ketiga rumah (tahap 2).**
   - Gabriel membuat akun layanan Google (baca-saja) dan membagikan ketiga spreadsheet sebagai Viewer.
   - Bangun sinkron terjadwal (Cron Trigger Cloudflare tiap beberapa menit). Sinkron menyalin **setiap sheet dan setiap baris, termasuk bulan lama**, ke skema rumahnya (`sum`, `kmb`, `kmb_projek`). Arahnya searah, dengan desain cermin mentah seperti SUM (`nilai` + `data` jsonb). Aksi yang diteruskan ke GAS juga langsung menarik WO yang berubah ke cermin.
   - Laporan selisih harian. Lulus kalau selisihnya nol selama 7 hari.
   - Cermin KMB Project yang sekarang (#12, #15) diselaraskan atau diganti.
3. **Uji kembar per aksi baca**, lalu aksi yang lulus dipindah satu per satu (`AKSI_SUPABASE_LULUS_KEMBAR` untuk KMB Project, jalur setara di Worker rumah lain).
4. **Halaman web 1:1 per rumah** (SUM 7 halaman, KMB TRA, dan KMB Project), supaya "Web" tinggal di `<rumah>.abadiops.com`. Wajib sebelum saklar; halaman web GAS kemudian ditutup atau dibuat hanya-baca.
5. **Aksi tulis di Supabase** untuk WO baru, dengan uji rekam-putar di staging, buku tamu kiriman di Cloudflare, ID WO beda awalan, dan nomor WO yang tidak bisa kembar (menunggu keputusan nomor 1).
6. **Panel saklar di `abadiops.com`** sesuai `docs/SAKLAR.md`:
   - alamat tersembunyi, kata sandi sebagai *secret*;
   - kartu per rumah; peringatan dan daftar syarat saat maju;
   - mundur cepat sebagai penyelamat;
   - hanya bergantung pada Cloudflare; gagal membaca berarti posisi `gas`;
   - riwayat perubahan.
7. **Jaring pengaman:** Supabase Pro dengan cadangan harian, keputusan PITR atau cadangan per jam (keputusan nomor 5), staging (project Supabase kedua), dan latihan saklar balik di staging (nyala → mati → nyala, tanpa nomor kembar dan tanpa kiriman ganda).
8. **Go-live per rumah** setelah semua syarat di `docs/SAKLAR.md` tercentang dan Gabriel setuju: nyalakan saklar, pantau operasi, dan siap mematikannya. Posisi `supabase` dipasang setelah WO lama habis, lalu GAS dimatikan dan spreadsheet dikunci sebagai arsip.

## 6. Tugas kecil yang masih terbuka

- **Uji sambungan penuh KMB Project:** token uji SPV-001 baru (ada di Gabriel, jangan ditulis di repo) dimasukkan ke sheet `ApiTokens` KMB Project, lalu data lewat `kmbprojek.abadiops.com` dibandingkan dengan GAS.
- **Bug #18, sisa:** pilihan mode portal masih muncul kalau `kmbprojek.abadiops.com` dibuka langsung tanpa pintu. Buang pilihan itu, atau arahkan ke pintu.
- **Sisa kode di portal** yang sudah mati: `serahkanKeRumah`, `ALAMAT_APLIKASI_RUMAH`, dan blok antar di `loginWithToken`. Kode masuk dari pintu (`masukDariPintu`) **jangan** dibuang.
- **Bug #17, sisa:** angka "semua WO sepanjang waktu" yang 1:1 dengan web GAS butuh aksi API baru di GAS. Ini untuk sesudah migrasi.
- **`scripts/verify-sum-kmb-isolation.mjs`** menguji perilaku lama. Perbarui atau pensiunkan.
- **Worker `project-kmb`:** hapus, dan/atau samakan `name` di `wrangler.toml` akar dengan `project-mar`. Bicarakan dulu dengan Gabriel.
- **Pengecekan token kembar harian:** API GAS KMB Project punya aksi `list_tokens`. Cek siapa yang boleh memanggilnya. Pilihan lainnya akun layanan Google (langkah 2).

## 7. Jangan

- Jangan push perubahan yang bergantung pada domain, DNS, SQL, atau isi sheet sebelum hal itu terbukti ada.
- Jangan mengembalikan pengecekan rumah lain ke aplikasi rumah. Itu tugas pintu.
- Jangan menampilkan layar token lagi kepada pengguna yang datang dari pintu (keputusan nomor 10).
- Jangan menyalakan saklar, membangun jalur tulis ke Supabase untuk produksi, atau mengubah `STORAGE_MODE`/`BACKEND_DRIVER` tanpa persetujuan Gabriel.
- Jangan menulis token di kode, skrip, uji, dokumen, maupun pesan commit.
- Jangan memakai `sed -i` di Git Bash untuk file repo; pakai Node. Jangan menjalankan `scripts/update-worker-engine.mjs`.
- Jangan menyentuh rumus poin dan rupiah (`services/scoring.js`) tanpa Gabriel.
