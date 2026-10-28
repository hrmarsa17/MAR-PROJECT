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
| `kmbprojek.abadiops.com` | KMB Project (portal buatan Raka; diganti salinan 1:1 PWA lama di langkah 1 §5) | `project-mar` | `worker.js` di akar + salinan identik `workers/kmb-projek/worker.js` | **otomatis dari push ke `main`** |
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

## 5. Rencana kerja sampai panel saklar jadi (dijalankan tanpa bertanya)

**Semua keputusan sudah diambil** (`docs/KEPUTUSAN.md`, baris 29 Okt; bagian "Belum diputuskan" kosong). Kerjakan langkah di bawah berurutan. Pindah ke langkah berikutnya hanya kalau syarat **"Selesai kalau"** terpenuhi dan sudah dicatat di `docs/PROGRES.md`. Keputusan teknis kecil diambil sendiri dengan pilihan yang paling aman dan paling bisa dibalik (`AGENTS.md` §0a butir 12).

**Titik henti**, satu-satunya alasan bertanya ke Gabriel: pembayaran, **menyalakan** saklar di produksi, rumus poin/rupiah, dan menghapus data produksi.

**Target akhir rencana ini:** panel saklar jadi, dan latihan saklar balik lulus di staging. Saklar produksi tetap di posisi `gas`. Yang menyalakannya Gabriel, serentak untuk ketiga rumah (`docs/SAKLAR.md`, "Target selesai migrasi").

**0. Persiapan pagi.**
- Gabriel menyerahkan langsung, tidak lewat repo:
  - token uji SPV-001 baru KMB Project, yang dimasukkan dulu ke sheet `ApiTokens` KMB Project;
  - token uji SUM dan KMB TRA.
- Akun layanan Google baca-saja dibuat di akun Google kawanabadigrup. Kalau Raka punya akses, ia membuatnya sendiri; kalau tidak, Gabriel yang membuatnya. Ketiga spreadsheet dibagikan ke akun itu sebagai Viewer, dan satu folder Drive privat dibagikan sebagai Editor untuk cadangan.
- Raka membuat project Supabase kedua (gratis) untuk staging di akun bersama.
- Rahasia hanya disimpan di *secret* Cloudflare atau GitHub, atau di environment lokal.
- *Selesai kalau:* Raka memegang semua akses itu dan `node scripts/buat-token-tiga-rumah.mjs --cek <token SPV-001 baru>` menjawab "dipakai di: KMB Project".

**1. KMB Project versi 1:1 dari PWA lama** (keputusan: salinan `mar-projek-offline`, portal dipensiunkan).
- Salin `MAR github/mar-projek-offline` ke `pwa/kmbprojek/` dengan resep empat baris (`workers/kmb/README.md`), lalu tambahkan `ambilTokenSerahan` dan `masukDariPintu` persis seperti `pwa/kmb/app.js`.
- Buat `workers/kmbprojek/` dari salinan `workers/kmb/`, dengan `RUMAH="kmbprojek"` dan `GAS_URL` = GAS KMB Project (`AKfycbxh4086…`).
- Uji di `wrangler dev`: token SPV-001 diterima, token rumah lain ditolak, `pull_monitoring` sama persis dengan GAS.
- Pindahkan domain `kmbprojek.abadiops.com` dari `project-mar` ke Worker baru dengan urutan tanpa putus. Pintu tidak perlu diubah.
- *Selesai kalau:* `kmbprojek.abadiops.com` menyajikan PWA 1:1; masuk dari pintu tanpa layar token; data sama persis dengan GAS (cara cek seperti `docs/PROGRES.md` entri "cek sambungan tiap rumah").

**2. Cermin ketiga rumah.**
- Akun layanan menyalin **semua sheet dan semua baris, termasuk bulan lama**, ke skema `sum`, `kmb`, dan `kmb_projek`, searah, dengan format jsonb mentah seperti `db/sum/cermin_sheet.sql`.
- Sinkron penuh tiap 5 menit: Cron Cloudflare kalau muat dalam batas CPU gratis, kalau tidak GitHub Actions. Log tidak boleh memuat data atau rahasia.
- Laporan selisih harian.
- Cermin `kmb_projek` yang sekarang (#12, #15) diselaraskan dengan cermin ini atau diganti.
- *Selesai kalau:* sinkron berjalan terjadwal di ketiga rumah dan laporan selisih hari pertama nol. **Lulus** setelah 7 hari berturut-turut nol. Selama menunggu, lanjutkan ke langkah berikutnya.

**3. Cadangan per jam dan uji pulih.**
- `pg_dump` terenkripsi tiap jam ke folder Drive privat (atau R2 kalau bisa tanpa biaya), dengan kunci di *secret*.
- Pulihkan satu cadangan ke project staging, lalu cocokkan jumlah barisnya.
- *Selesai kalau:* cadangan tersimpan tiap jam dan uji pulih lulus.

**4. Staging lengkap.**
- Worker staging untuk pintu (`staging.abadiops.com`) dan tiap rumah (`staging-<rumah>.abadiops.com`) memakai Supabase staging.
- *Selesai kalau:* alur masuk lewat pintu staging sampai dashboard tiap rumah berjalan.

**5. Aksi baca pindah ke cermin.**
- Uji kembar per aksi baca per rumah. Aksi yang lulus dipindah satu per satu: `AKSI_SUPABASE_LULUS_KEMBAR`, atau gerbang yang sama di Worker rumah lain.
- *Selesai kalau:* semua aksi baca lulus uji kembar dan dilayani dari cermin, dengan GAS sebagai cadangan otomatis kalau Supabase gagal.

**6. Halaman web 1:1 per rumah**, di aplikasi rumah masing-masing: SUM 7 halaman, KMB TRA, dan KMB Project.
- Layar, field, dan pesannya identik dengan web GAS. Pilihan "Web" di pintu lalu diarahkan ke halaman ini, bukan ke `script.google.com`.
- *Selesai kalau:* setiap halaman lulus perbandingan berdampingan dengan web GAS, dan "Web" di pintu tidak lagi keluar dari `abadiops.com`.

**7. Jalur tulis WO baru di belakang saklar.**
- WO baru lahir di Supabase, dengan:
  - ID beda awalan;
  - nomor `WO-YYYYMMDD-XXXX` (4 angka);
  - buku tamu kiriman di Cloudflare;
  - `ProcessedOps` dicerminkan;
  - payroll gabungan (WO lama dari cermin + WO baru dari Supabase).
- Jalur ini hanya aktif kalau saklar rumah itu bukan `gas`.
- *Selesai kalau:* uji rekam-putar di staging lulus kolom per kolom, dan payroll gabungan sama dengan GAS untuk bulan-bulan lalu.

**8. Panel saklar di `abadiops.com`**, sesuai `docs/SAKLAR.md`:
- alamat tersembunyi dan kata sandi (Gabriel memasang *secret*-nya);
- Durable Object;
- peringatan dan daftar syarat saat maju;
- mundur cepat sebagai penyelamat;
- hanya bergantung pada Cloudflare;
- gagal membaca berarti `gas`;
- riwayat perubahan.

Bangun dan uji di staging dulu, lalu pasang di produksi **dengan semua rumah di posisi `gas`**. *Selesai kalau:* **latihan saklar balik di staging lulus**: nyala → mati → nyala, tanpa nomor kembar, tanpa kiriman ganda, dan tanpa data rusak atau hilang.

**9. Laporan kesiapan go-live.**
- Isi daftar syarat di `docs/SAKLAR.md` untuk ketiga rumah, dengan bukti setiap butir.
- **Berhenti di sini.** Gabriel yang menyalakan saklar, serentak, lalu operasi dipantau bersama.

## 6. Tugas kecil yang masih terbuka

- **Bug #18, sisa:** pilihan mode portal saat dibuka langsung. Selesai dengan sendirinya setelah langkah 1, karena portal dipensiunkan.
- **Sisa kode mati di portal** (`serahkanKeRumah`, `ALAMAT_APLIKASI_RUMAH`, blok antar di `loginWithToken`): selesai dengan sendirinya setelah langkah 1.
- **Bug #17, sisa:** angka "semua WO sepanjang waktu" 1:1 dengan web GAS. Ikut dikerjakan di langkah 6 (halaman web), dengan data dari cermin.
- **`scripts/verify-sum-kmb-isolation.mjs`** menguji perilaku lama. Pensiunkan, karena gantinya adalah cek sambungan tiap rumah.
- **Worker `project-kmb`** tidak dipakai. Hapus setelah langkah 1, dan samakan `name` di `wrangler.toml` akar dengan `project-mar` selama portal masih ada.
- **MARProject lama di Vercel:** dibekukan, dan matikan `.github/workflows/pantau.yml` (keputusan 29 Okt).
- **Pengecekan token kembar harian:** pakai daftar token dari cermin (langkah 2) untuk ketiga rumah, lalu kirim peringatan kalau ada yang kembar.

## 7. Jangan

- Jangan berhenti untuk bertanya di luar titik henti. Keputusan teknis kecil diambil sendiri dan dicatat.
- Jangan **menyalakan** saklar di produksi, membayar apa pun, mengubah rumus poin/rupiah, atau menghapus data produksi tanpa Gabriel.
- Jangan push perubahan yang bergantung pada domain, DNS, SQL, atau isi sheet sebelum hal itu terbukti ada.
- Jangan mengembalikan pengecekan rumah lain ke aplikasi rumah. Itu tugas pintu.
- Jangan menampilkan layar token lagi kepada pengguna yang datang dari pintu (keputusan nomor 10).
- Jangan menulis token, kata sandi, atau kunci di kode, skrip, uji, dokumen, log, maupun pesan commit.
- Jangan memakai `sed -i` di Git Bash untuk file repo; pakai Node. Jangan menjalankan `scripts/update-worker-engine.mjs`.
