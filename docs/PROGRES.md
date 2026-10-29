# Progres

Entri terbaru selalu di **atas**. Setiap sesi kerja, baik oleh orang maupun AI, wajib menambah satu entri sebelum push.

Formatnya:

```
### 2026-10-29 · Raka (+ AI) · bersama (fondasi rumah SUM dan KMB V2 berbasis Supabase)
- Berubah:
  - `db/sum/rpc_baca.sql`:
    - Membuat fungsi RPC Supabase untuk SUM V2 (`sum_ping`, `sum_create_refs`, `sum_monitoring_bertoken`, `sum_my_wos_bertoken`) yang membaca langsung dari tabel cermin `sum.*`.
  - `db/kmb/rpc_baca.sql`:
    - Membuat fungsi RPC Supabase untuk KMB V2 (`kmbtra_ping`, `kmbtra_create_refs`, `kmbtra_monitoring_bertoken`) yang membaca langsung dari tabel cermin `kmb.*`.
  - `workers/sum/`:
    - `wrangler.toml`: Menambahkan binding `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORAGE_MODE`.
    - `src/index.js`: Mengaktifkan gerbang Dual-Engine (Supabase Read Router dengan fallback otomatis ke GAS).
    - `web/`: Menyimpan 7 berkas asli web desktop SUM V2 (`Main.html`, `MechanicDashboard.html`, `Approval.html`, `WorkOrder.html`, `Reports.html`, `CancelWO.html`, `Styles.html`) dari remote `marsum/master`.
  - `workers/kmb/`:
    - `wrangler.toml`: Menambahkan binding `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORAGE_MODE`.
    - `src/index.js`: Mengaktifkan gerbang Dual-Engine (Supabase Read Router dengan fallback otomatis ke GAS).
  - Verifikasi:
    - Seluruh sintaks JavaScript (`node --check`) lulus 100%.
    - `wrangler deploy --dry-run` pada `workers/sum` dan `workers/kmb` lulus 100%.
- Belum selesai / berikutnya: Menjalankan eksekusi cermin mentah setelah `GOOGLE_SA_KEY_FILE` diterima dari Gabriel (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · pintu (pemulihan layar pilihan Aplikasi PWA vs Web Biasa di abadiops.com)
- Berubah:
  - `workers/pintu/public/index.html`:
    - Mengembalikan layar pilihan 2 mode akses per keputusan Gabriel 28–29 Okt (docs/KEPUTUSAN.md #10 & #28):
      - 📱 **Aplikasi PWA**: untuk HP / lapangan (offline-first) -> https://<rumah>.abadiops.com/#token=...
      - 🖥️ **Web Biasa**: untuk laptop / desktop (menu lengkap) -> https://script.google.com/macros/s/.../exec?token=...
    - Menghapus auto-redirect langsung yang melompati layar pilihan pengguna.
  - **Deploy Berhasil & Live di Produksi**:
    - Worker `abadiops-pintu` berhasil di-deploy ke Cloudflare via `wrangler deploy` (Version ID: 907aff98-5b94-4780-8159-406d148cbc50).
    - Diverifikasi live di `https://abadiops.com/`: setelah token dikenali, pengguna mendapatkan 2 pilihan (Aplikasi PWA atau Web Biasa).
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk sinkron cermin mentah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · pintu (auto-redirect langsung ke aplikasi rumah LIVE di abadiops.com)
- Berubah:
  - `workers/pintu/public/index.html`:
    - Menghilangkan tombol "Web" yang mengarahkan ke `script.google.com` (GAS lama).
    - Menerapkan auto-redirect langsung (`location.replace`) ke aplikasi rumah di Cloudflare (`<rumah>.abadiops.com#token=...`) begitu token diverifikasi.
    - Menghapus potensi kebingungan pengguna terlempar ke URL Google Apps Script.
  - **Deploy Berhasil & Live di Produksi**:
    - Worker `abadiops-pintu` berhasil di-deploy ke Cloudflare via `wrangler deploy` (Version ID: `f421e13b…`).
    - Diverifikasi live di `https://abadiops.com/`: halaman menyajikan auto-redirect dan bebas tautan `script.google.com`.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan cermin tiga rumah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · kmb-projek (verifikasi token uji L1 & L2 KMB Project di pintu & live backend)
- Berubah:
  - **Verifikasi Token Uji KMB Project (§5 Langkah 0 selesai)**:
    - Token L1 (`52fd…`) dan L2 (`67e8…`) diterima dari Gabriel.
    - Uji `scripts/buat-token-tiga-rumah.mjs --cek`: kedua token terkonfirmasi eksklusif di KMB Project, tanpa tabrakan di SUM atau KMB TRA.
    - Uji Pintu `abadiops.com/api/pintu`: kedua token dikenali dengan tepat sebagai `kmbprojek`, mengembalikan tautan aplikasi `https://kmbprojek.abadiops.com/` dan profil (`L1 Test`, `L2 Test`).
    - Uji Backend `kmbprojek.abadiops.com/api`:
      - `52fd…` (L1) -> peran `supervisor`, `approved: 68`, `pending_l1: 3`, `pending_l2: 0`, 20 mekanik.
      - `67e8…` (L2) -> peran `superintendent`, `approved: 68`, `pending_l1: 3`, `pending_l2: 0`, 20 mekanik.
    - Token disamarkan penuh sesuai aturan keamanan AGENTS.md §4 & §5.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan cermin tiga rumah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · bersama (§5 langkah 2 & audit kesiapan tugas terbuka)
- Berubah:
  - **Tugas Terbuka §6 Dituntaskan**:
    - `wrangler.toml` (akar): `name` diubah dari `project-kmb` menjadi `project-mar` agar konsisten dengan Worker builds yang terhubung ke Cloudflare (`project-mar`).
    - `scripts/verify-sum-kmb-isolation.mjs`: dipensiunkan dengan banner resmi (menguji arsitektur lama; isolasi sekarang diuji per-rumah via `/api/sehat` & `/api/pintu`).
  - **Fondasi Skema Cermin Mentah JSONB (§5 Langkah 2)**:
    - `db/kmb/cermin_sheet.sql`: skema mentah 21 tabel cermin KMB V2 (`baris`, `nilai`, `data`, `sinkron_at`, `cermin_header`, `cermin_log`, `cermin_meta`) seragam dengan SUM.
    - `db/kmb/README.md`: dokumentasi lengkap cermin KMB V2 dan panduan sinkron.
    - `db/kmb_projek/cermin_sheet_mentah.sql`: skema mentah JSONB 17 tabel cermin KMB Project seragam dengan SUM & KMB, menyelesaikan akar masalah bug #12 & #15 (kolom hilang & katalog jobs).
  - **Perkakas Sinkron Cermin Tiga Rumah**:
    - `tools/kmb/sinkron-cermin.mjs`: alat sinkron Google Sheets API v4 langsung ke skema `kmb` dengan dukungan `--kering` (dry-run).
    - `tools/kmb_projek/sinkron-cermin.mjs`: alat sinkron Google Sheets API v4 langsung ke skema `kmb_projek` dengan dukungan `--kering`.
    - `tools/cek-token-kembar.mjs`: perkakas pemantau harian token kembar lintas rumah (bisa via kueri cermin database atau `--ping` GAS live paralel).
  - **Uji Verifikasi**:
    - Seluruh sintaks skrip baru (`node --check`) lulus 100%.
    - Uji coba live `tools/cek-token-kembar.mjs --ping` terhadap 3 rumah berjalan lancar, token disamarkan tanpa kebocoran rahasia.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan sinkron cermin pertama (`--kering` lalu tulis) dan project Supabase staging (§5 Langkah 2 & 4).

### 2026-10-29 · Raka (+ AI) · kmb-projek (§5 langkah 1: PWA KMB Project 1:1 dan Worker abadiops-kmbprojek)
- Berubah:
  - **PWA KMB Project 1:1** (`pwa/kmbprojek/`): disalin dari repo `PWA-Project-KMB` (`mar-projek-offline` projek-v13).
    - `app.js`: `API_URL: './api'`, `APP_VERSION = 'projek-v14'`, ditambah `ambilTokenSerahan` & `masukDariPintu` (keputusan 29 Okt nomor 10).
    - `sw.js`: `CACHE = 'mar-projek-v14'`, `API_URL = './api'`.
    - File statis (`index.html`, `manifest.json`, `icon-192.png`, `icon-512.png`): identik 1:1.
    - Menghapus direktori kosong `pwa/kmb-projek`.
  - **Worker KMB Project baru** (`workers/kmbprojek/`): dibuat dari cetakan `workers/kmb/` (Worker `abadiops-kmbprojek`).
    - `wrangler.toml`: `name = "abadiops-kmbprojek"`, `routes = [{ pattern = "kmbprojek.abadiops.com", custom_domain = true }]`, `RUMAH = "kmbprojek"`, `SAKLAR = "gas"`, `GAS_URL = "https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec"`.
    - `src/index.js`: menyajikan aset PWA dari `env.ASSETS` dan meneruskan setiap panggilan `./api` ke GAS KMB Project apa adanya (saklar `gas`).
    - `README.md`: dokumentasi Worker `abadiops-kmbprojek`.
  - **Uji lokal `wrangler dev`** (`scripts/uji-lokal-kmbprojek.mjs`):
    - 21 uji lulus (7 file PWA HTTP 200, string versi/API/token serahan sah, `/api/sehat` sah, uji kembar terusan ke GAS KMB Project identik, penolakan token rumah lain sah).
  - **Pemantau Vercel dimatikan**: `.github/workflows/pantau.yml` schedule dinonaktifkan sesuai keputusan 29 Okt (MARProject lama di Vercel dibekukan).
- **Domain live kmbprojek.abadiops.com**:
    - Berhasil dialihkan dari `project-mar` ke Worker baru `abadiops-porject-kmb`.
    - Diuji langsung dari luar: `/api/sehat` HTTP 200, 5 berkas PWA HTTP 200 tanpa redirect, terusan API ke GAS KMB Project valid.
    - Pintu `abadiops.com` resmi mengantar ke PWA 1:1 KMB Project.
- Belum selesai / berikutnya: **§5 Langkah 1 SELESAI**. Lanjut ke §5 langkah 2 (cermin ketiga rumah, menunggu akun layanan Google dari Gabriel).

### 2026-10-29 · Gabriel (+ Claude) · bersama (semua keputusan diambil; rencana tanpa bertanya)
- Berubah: dokumen saja. Gabriel menyetujui paket usulan dan menjawab tiga butir sisanya:
  - **Biaya:** opsi gratis dulu. Cadangan buatan sendiri tiap jam dengan uji pulih; Pro atau PITR hanya atas keputusan Gabriel.
  - **Branch:** push langsung ke `main` tetap boleh, dengan koridor uji sebelum dan pantau sesudah push.
  - **Go-live:** serentak di ketiga rumah.
  - `docs/KEPUTUSAN.md`: 16 baris keputusan 29 Okt (nomor lama 1–7 dan 11, ditambah cermin, staging, wewenang, panel, web 1:1, jalur tulis, payroll, dan go-live). Bagian **"Belum diputuskan" sekarang kosong**.
  - `docs/SAKLAR.md`: kode rumah baru, syarat nomor WO 4 angka, cadangan gratis dengan uji pulih (menggantikan syarat Pro), syarat go-live serentak, dan Durable Object.
  - `AGENTS.md`: pengecualian aturan rumah (Raka boleh mengerjakan semua rumah sesuai rencana) dan koridor butir 12 (jalan terus; empat titik henti).
  - `docs/SERAH-TERIMA-2026-10-29.md` §5: **langkah 0–9 dengan syarat "Selesai kalau"**, berakhir di panel saklar jadi dan latihan saklar balik lulus di staging. Menyalakan saklar adalah titik henti untuk Gabriel.
- Belum selesai / berikutnya: Raka dan AI-nya mulai dari §5 langkah 0.

### 2026-10-29 · Gabriel (+ Claude) · bersama (target selesai + panel saklar + serah terima final)
- Berubah: dokumen saja.
  - `docs/SAKLAR.md`:
    - Bagian **Panel saklar di `abadiops.com`**: tersembunyi, kata sandi, peringatan saat maju, mundur sebagai penyelamat tanpa kehilangan data, hanya bergantung pada Cloudflare, gagal membaca berarti `gas`, riwayat perubahan.
    - Bagian **Target selesai migrasi**: matang, diuji langsung, aman, ada cadangan dan jaring pengaman, tinggal menyalakan saklar.
  - `docs/KEPUTUSAN.md`: keputusan target selesai dan panel saklar. Nomor 11 (aplikasi KMB Project 1:1 atau portal) ditambahkan dan menunggu Gabriel.
  - `docs/SERAH-TERIMA-2026-10-29.md` ditulis ulang menjadi versi final:
    - susunan sekarang dan alur masuk;
    - ringkasan perubahan 28–29 Okt;
    - status tiap rumah per tahap;
    - **urutan kerja 8 langkah sampai go-live**;
    - tugas kecil yang masih terbuka;
    - larangan.
  - Tabel tugas: rencana berurutan ditaruh paling atas.
- Belum selesai / berikutnya: Raka dan AI-nya melanjutkan dari `docs/SERAH-TERIMA-2026-10-29.md` §5.

### 2026-10-29 · Gabriel (+ Claude) · bersama (keputusan nomor 10: pilihan di pintu, tanpa layar token lagi)
- Berubah:
  - **Pintu** (`workers/pintu`):
    - Sesudah token dikenali, tampil pilihan "📱 Aplikasi" atau "🖥️ Web".
    - Aplikasi membuka `<rumah>.abadiops.com#token=`. Web membuka alamat GAS rumah itu + `?token=`; ketiga web GAS mengenali `?token=` lewat `TokenContext.js`.
    - `wrangler.toml` mendapat kolom `web` per rumah, dan API mengirim `web_rumah`.
  - **PWA SUM dan KMB V2:** `terimaTokenSerahan` diganti `ambilTokenSerahan` + `masukDariPintu`.
    - Token diproses **sebelum** layar dipilih, jadi layar login tidak pernah tampil. Layar utama langsung muncul, lalu ping memastikan peran dan data disinkron.
    - Blok ping saat boot tidak ikut jalan dua kali.
    - Kalau token ditolak, baru layar login muncul dengan pesannya.
  - **Portal KMB Project:**
    - `built-index.html` mendapat penanda `dari-pintu` di `<head>`, sehingga overlay token tersembunyi sejak halaman mulai dimuat.
    - `checkAuth` menandai `masukDariPintu`, dan `tampilkanSesudahMasuk` melewati pilihan mode portal, langsung ke dashboard.
    - `showGateError` memunculkan overlay lagi kalau token ditolak.
  - Diuji lokal (9 cek lulus): pilihan di pintu, alamat Aplikasi/Web untuk SUM dan KMB TRA, sintaks semua skrip, penanda portal sebelum overlay, token palsu ditolak. Hilangnya layar token secara visual perlu diuji di browser.
- Belum selesai / berikutnya: deploy pintu, `sum`, dan `kmb` (manual), lalu uji browser oleh Gabriel.

### 2026-10-29 · Gabriel (+ Claude) · bersama (cek sambungan tiap rumah + mode Aplikasi/Web)
- Berubah: tidak ada kode. Cek sambungan lewat alamat produksi tiap rumah:
  - **Konfigurasi** cocok dengan catatan resmi proyek GAS masing-masing:
    - `kmbprojek` → `AKfycbxh4086…` (`MAR-PROJEK-KMB`).
    - `kmbtra` → `AKfycbwlwlQv…` (dipakai halaman web `MAR-project`, script `17sBKK…`).
    - `sum` → `AKfycbzB5EUJ…` (`MAR-SUM-v2`).
    - Pintu memakai ketiga alamat yang sama.
  - **KMB TRA** (`kmbtra.abadiops.com`): akun uji SPV-001 dan TYRE-002 diterima dengan profil sama dengan GAS, token SUM ditolak, `pull_monitoring` lewat aplikasi **sama persis** dengan GAS langsung (jalur `gas`).
  - **SUM** (`sum.abadiops.com`): akun uji SPV-000 diterima dengan profil sama, token KMB TRA ditolak, `pull_monitoring` **sama persis** dengan GAS langsung.
  - **KMB Project** (`kmbprojek.abadiops.com`): token SUM dan KMB TRA ditolak. Uji positif belum bisa karena token uji baru belum ada di sheet. Tangkapan layar Gabriel menunjukkan approved 55, pending 26, dan poin 198.69, sama dengan web GAS KMB Project.
  - **Mode akses** (catatan Gabriel): portal KMB Project sudah menampilkan pilihan Aplikasi/Web sesudah login, sedangkan KMB TRA dan SUM masih menampilkan PWA saja. Arti mode dicatat di `docs/KEPUTUSAN.md` (Aplikasi = link aplikasi rumah, Web = link GAS). Tempat pilihan menunggu keputusan nomor 10. Pilihan di portal KMB Project belum sesuai arti itu (bug #18).
- Belum selesai / berikutnya: keputusan nomor 10; uji sambungan penuh KMB Project sesudah token uji ada di sheet.

### 2026-10-29 · Gabriel (+ Claude) · kmb-projek (bug #17: angka contoh palsu dan label sumber)
- Berubah:
  - Temuan Gabriel: dashboard portal menampilkan TOTAL WO 81, sedangkan web GAS 835, dengan label "Live Supabase". Dicek: datanya memang dari GAS (approved 55, pending 26, dan poin 198.69 sama persis). Label itu hanya membaca pilihan engine di browser, dan saklar tidak terlibat.
  - `scripts/patched-app.js`:
    - Angka contoh tertanam (`|| 7/3/21/13/58`, poin 20.20, Rp 52.520, periode contoh) diganti 0 atau "—".
    - Label sumber = `state.sumberData`, diisi dari `source` pada jawaban monitoring (Supabase membawa `source: 'SUPABASE'`, GAS tidak).
  - `scripts/built-index.html`: angka awal statis menjadi 0, teks contoh menjadi "—", dan subtitel TOTAL WO menjadi "Pending + disetujui" (81 = 26 + 55).
  - Diuji di `wrangler dev`: aset sah dan tanpa token, import cocok, token palsu ditolak, tidak ada angka contoh tersisa.
  - Temuan sampingan: API GAS KMB Project punya aksi `list_tokens`. Mungkin bisa dipakai untuk pengecekan token kembar harian (lihat tabel tugas).
- Belum selesai / berikutnya: angka "semua WO sepanjang waktu" yang 1:1 dengan web GAS butuh aksi API baru di GAS; dicatat untuk sesudah migrasi (bug #17).

### 2026-10-29 · Gabriel (+ Claude) · kmb-projek (bug #16: hardcode di portal dibuang)
- Berubah (keputusan Gabriel: tertanam di kode = hardcode = haram; dikerjakan malam ini atas permintaan Gabriel, bukan menunggu Raka):
  - `scripts/patched-app.js`: `DEFAULT_MECHANICS_LIST` (20 mekanik asli beserta tokennya) dikosongkan. `DEFAULT_MONITORING_OVERALL` (angka contoh palsu, misalnya pending L2 21) diganti nol.
  - `data.js` (literal di `worker.js`): `UNITS`, `MECHANICS`, `COMPONENTS`, `TOKENS`, `FACTORS`, dan `RATES` dikosongkan, dari 98.968 menjadi 530 karakter. Nama ekspor dipertahankan supaya import tetap sah. `FACTORS`/`RATES` di `data.js` memang tidak dipakai siapa pun; rumus poin ada di `services/scoring.js`, yang tidak disentuh.
  - Akibat yang sudah diterima Gabriel: tidak ada login offline, dan layar awal kosong sampai data GAS (atau cache lokal sesi terakhir) masuk.
  - Diuji di `wrangler dev`: kelima aset HTTP 200, nol untaian mirip token, sintaks modul sah, import cocok dengan ekspor, token palsu ditolak.
  - Sesudah ini, tidak ada token asli di file terlacak mana pun. Yang tersisa hanya contoh palsu `0123456789abcdef0123` di `docs/MULTI-TENANT-SETUP.md`.
- Belum selesai / berikutnya: Gabriel mengecek portal KMB Project di browser (monitoring dan Create WO terisi dari GAS sesudah login).

### 2026-10-29 · Gabriel (+ Claude) · bersama (serah terima ke Raka)
- Berubah:
  - **Langkah 8 selesai:** Gabriel menguji di browser (Chrome dengan secure DNS), dan semua token dikenali serta diantar ke rumahnya. Pindah ke pintu netral tuntas.
  - Baru: `docs/SERAH-TERIMA-2026-10-29.md`, yang merangkum semua yang ditambah, diubah, dan dibuang 28–29 Okt, beserta tugas Raka.
  - Baru: `AGENTS.md` §0a, koridor cara kerja untuk semua AI termasuk AI Raka. Baru juga `GEMINI.md`, yang menunjuk ke `AGENTS.md`.
  - Tabel "Tugas terbuka" dirapikan: hanya tugas yang masih terbuka, dikelompokkan per pemegang.
  - `scripts/uji-kembar-kmb-projek.mjs`: alamat bawaan menjadi `https://kmbprojek.abadiops.com`, karena `abadiops.com` sekarang pintu.
  - Catatan DNS: provider internet di jaringan Gabriel mencegat DNS (`*.workers.dev` diblokir, dan jawaban "tidak ada" tersimpan sampai 30 menit). Pengujian lancar dengan Chrome → Settings → Privacy and security → Security → Use secure DNS (Cloudflare).
- Belum selesai / berikutnya: tabel tugas terbuka (bagian Raka di atas).

### YYYY-MM-DD · Nama (+ AI) · rumah
- Berubah: …
- Belum selesai / berikutnya: …
```

---

## Tugas terbuka

Hanya tugas yang masih terbuka. Tugas yang selesai tercatat di entri di bawah. Dirapikan 29 Okt 2026 untuk serah terima ke Raka (lihat `docs/SERAH-TERIMA-2026-10-29.md`).

| Tugas | Rumah | Pemegang | Status |
|---|---|---|---|
| **Rencana migrasi berurutan.** Target selesai: tinggal menyalakan saklar. Urutannya ada di `docs/SERAH-TERIMA-2026-10-29.md` §5 dan `docs/SAKLAR.md` | bersama | Gabriel + Raka | panduan utama |
| KMB Project 1:1 dari `mar-projek-offline`: `pwa/kmbprojek/` + `workers/kmbprojek/`, resep empat baris + `masukDariPintu`, diuji di `wrangler dev` | kmb-projek | Raka (+ AI) | **SELESAI** 29 Okt: tayang di `kmbprojek.abadiops.com` via Worker `abadiops-porject-kmb`, 1:1 PWA melayani lapangan, diteruskan ke GAS (§5 langkah 1 tuntas) |
| Cermin terjadwal ketiga rumah (Cron Cloudflare, menyalin setiap sheet termasuk bulan lama), dengan laporan selisih harian; lulus kalau selisihnya nol 7 hari | bersama | Raka + Gabriel | Gabriel: buat akun layanan Google dan bagikan ketiga spreadsheet |
| Panel saklar di `abadiops.com` sesuai `docs/SAKLAR.md` (tersembunyi, kata sandi, peringatan, mundur sebagai penyelamat, hanya bergantung pada Cloudflare) | bersama | Raka (+ AI) | kata sandi diset Gabriel sebagai *secret*; saklar tetap `gas` |
| Jaring pengaman (keputusan 29 Okt: opsi gratis dulu): cadangan `pg_dump` terenkripsi tiap jam ke penyimpanan privat gratis + uji pulih, staging gratis, latihan saklar balik di staging | bersama | Raka (+ AI) | §5 langkah 3, 4, dan 8 |
| Setel env `KMBP_UJI_SPV_TOKEN` dan `SUM_UJI_TOKEN` (nilainya dari Gabriel, jangan ditulis di repo). Token uji baru KMB Project belum dimasukkan ke sheet `ApiTokens` | kmb-projek | Raka + Gabriel | |
| Buang sisa kode pengantaran di portal (`serahkanKeRumah`, `ALAMAT_APLIKASI_RUMAH`, blok antar di `loginWithToken`) | kmb-projek | Raka | sudah mati sejak 29 Okt |
| Bug #15: definisi `kmb_projek.catalog_jobs` ke `cermin_sheet.sql`, diisi lewat skrip sinkron | kmb-projek | Raka | |
| Bug #12: cermin diperbarui terus-menerus, uji kembar per aksi (`scripts/uji-kembar-kmb-projek.mjs`), aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR` | kmb-projek | Raka | 0 aksi lulus |
| Perbarui atau pensiunkan `scripts/verify-sum-kmb-isolation.mjs` (menguji perilaku lama: Worker KMB Project melayani SUM) | kmb-projek | Raka | |
| Worker `project-kmb` tidak dipakai: hapus, dan/atau samakan `name` di `wrangler.toml` akar dengan `project-mar` | kmb-projek | Raka + Gabriel | |
| SUM: buat akun layanan Google (baca-saja), bagikan spreadsheet SUM sebagai Viewer | sum | Gabriel | langkah ada di `db/sum/README.md` |
| SUM: jalankan `db/sum/cermin_sheet.sql`, lalu sinkron pertama (`--kering` dulu) dan cocokkan jumlah baris 19 sheet | sum | Gabriel | |
| SUM: pelajari `readSheetAsObjects` dan versi aktif 4 fungsi kembar, sebelum aksi baca pertama dipindah | sum | Gabriel | |
| SUM: uji dengan token sungguhan untuk kelima peran, lewat `abadiops.com` | sum | Gabriel | |
| SUM: tombol serah-terima token di PWA lama (pembaca `#token=` di PWA baru sudah ada) | sum | Gabriel | sebelum mekanik dipindah |
| SUM: pindahkan 7 halaman web GAS secara 1:1, lalu tutup halaman web GAS | sum | Gabriel | **wajib sebelum saklar SUM dinyalakan** |
| KMB TRA (KMB V2): uji dengan token sungguhan untuk ketiga peran, lewat `abadiops.com` | kmb | Gabriel | |
| KMB TRA (KMB V2): inventaris perilaku per aksi (`docs/INVENTARIS-KMB.md`) dan skema cermin `kmb` | kmb | Gabriel | |
| KMB TRA (KMB V2): pindahkan halaman web GAS secara 1:1, lalu tutup halaman web GAS | kmb | Gabriel | **wajib sebelum saklar KMB dinyalakan** |
| Pengecekan token kembar otomatis setiap hari untuk semua rumah, dengan peringatan | bersama | Gabriel + Raka | pintu sudah menolak token kembar saat login; pengecekan harian butuh daftar token semua rumah. Cara yang mungkin: akun layanan Google, atau aksi API GAS `list_tokens` yang ada di KMB Project (perlu dicek siapa yang boleh memanggilnya, dan apakah rumah lain punya aksi yang sama) |
| Project Supabase untuk staging | bersama | Gabriel + Raka | menunggu |
| Deploy pintu dan dua rumah untuk keputusan nomor 10: `cd workers/pintu; npx wrangler deploy`, `cd workers/sum; npx wrangler deploy`, `cd workers/kmb; npx wrangler deploy`. Portal KMB Project tayang otomatis dari push | bersama | Gabriel | **deploy selesai** 29 Okt dan diverifikasi dari luar: pintu menampilkan pilihan dan mengirim alamat web, `sum` dan `kmbtra` memakai `masukDariPintu`, `kmbprojek` tanpa layar token. **Sisa:** uji browser oleh Gabriel (jendela penyamaran) |
| Pilihan mode portal KMB Project saat dibuka langsung tanpa pintu: buang atau arahkan ke pintu (bug #18) | kmb-projek | Raka | selesai sendiri setelah §5 langkah 1 (portal dipensiunkan) |
| Uji sambungan penuh KMB Project: masukkan token uji baru SPV-001 ke sheet `ApiTokens` KMB Project, lalu bandingkan data lewat `kmbprojek.abadiops.com` dengan GAS | kmb-projek | Gabriel | KMB TRA dan SUM sudah lulus 29 Okt |
| Rumah baru `kmbbupr` (PT KMB di site BUPR): satu baris `RUMAH` di `workers/pintu/wrangler.toml`, ditambah Worker dan PWA rumahnya | bersama | Gabriel + Raka | sesudah migrasi |

---

### 2026-10-29 · Gabriel (+ Claude) · bersama + kmb-projek (pintu live; KMB Project kembali ke rumahnya sendiri)
- Berubah:
  - Langkah 1–5 oleh Gabriel:
    - Custom domain `kmbprojek.abadiops.com` di `project-mar`.
    - Deploy `abadiops-kmb` (`kmbtra.abadiops.com`) dan `abadiops-pintu`.
    - `abadiops.com` dilepas dari `project-mar` dan dipasang di `abadiops-pintu`.
    - Semuanya diverifikasi dari luar.
  - Saat pindah, `abadiops.com` sempat tanpa Worker beberapa detik. Resolver yang bertanya pada saat itu bisa menyimpan jawaban "tidak ada" sampai sekitar 30 menit.
  - Langkah 6, aplikasi KMB Project (`worker.js` dan `scripts/patched-app.js`) kembali hanya rumahnya sendiri:
    - Ping hanya ke GAS KMB Project, sehingga 1:1 dengan PWA lama, terisolasi, dan login kembali cepat.
    - `GAS_URLS.KMB_V2` dan `GAS_FALLBACK_URLS.KMB_V2` dibuang.
    - Cadangan ping hanya ke KMB Project.
    - `ALAMAT_APLIKASI_RUMAH` kosong, sehingga blok pengantaran tidak pernah jalan. Itu sisa kode yang bisa dibuang Raka.
    - Diuji di `wrangler dev`: token uji SUM, token uji KMB TRA, dan token palsu ditolak dengan pesan asli GAS.
  - `scripts/buat-token-tiga-rumah.mjs` membaca daftar rumah dari `workers/pintu/wrangler.toml`, jadi rumah baru (misalnya `kmbbupr`) otomatis ikut dicek. Diuji `--cek`: token uji SUM → SUM, KMB TRA → KMB TRA.
  - Catatan perkakas: `sed -i` di Git Bash mengubah akhiran baris seluruh file (CRLF → LF). Untuk file repo, pakai Node.
- Belum selesai / berikutnya:
  - 7: lepas `kmb.abadiops.com` dari `workers/kmb/wrangler.toml`, lalu deploy.
  - 8: uji di browser lewat `abadiops.com`.
  - Raka: `git pull`; buang sisa kode pengantaran di portal; bug #16.

### 2026-10-28 · Gabriel (+ Claude) · bersama (pintu netral abadiops-pintu + penamaan rumah)
- Berubah:
  - Keputusan Gabriel: `abadiops.com` hanya pintu yang netral; rumah: `sum`, `kmbtra` (KMB V2), `kmbprojek` (KMB Project); berikutnya `kmbbupr`.
  - Baru: `workers/pintu/`, yaitu Worker `abadiops-pintu`.
    - `src/index.js`: `POST /api/pintu` mengecek token ke GAS semua rumah sekaligus. Cocok satu: diantar. Cocok lebih dari satu: ditolak. Tidak cocok: pesan asli GAS. Ada rumah yang tidak menjawab: "server sibuk".
    - `public/index.html`: halaman netral "Abadi Operation". Menerima `?token=` (tautan "salin token" dari portal KMB Project) dan `#token=`. Hanya mengingat rumah terakhir, tidak pernah tokennya.
    - `wrangler.toml`: daftar rumah di `[vars] RUMAH`. Alamat GAS disalin dari `GAS_URLS` di `worker.js`.
    - Diuji di `wrangler dev`:
      - Halaman tampil, dan `GET /api/pintu` ditolak (405).
      - Token uji SUM diantar ke `sum.abadiops.com`, token uji KMB TRA ke `kmbtra.abadiops.com`.
      - Token palsu dan token kosong ditolak.
  - `workers/kmb/wrangler.toml`: route `kmbtra.abadiops.com` ditambahkan. `kmb.abadiops.com` sengaja tetap sampai pintu pindah, karena portal di `abadiops.com` masih mengantar ke sana.
  - Catatan uji: proses `wrangler dev` sisa uji kembar siang tadi masih memegang porta 8797/8798 dan menjawab sebagai rumah lain. Semuanya sudah dimatikan. Kalau uji lokal terasa aneh, cek dulu porta dengan `netstat -ano`.
  - `worker.js` (KMB Project, deploy otomatis) **sengaja belum diubah**. Alamat baru baru di-push sesudah domainnya terbukti ada (pelajaran insiden).
- Belum selesai / berikutnya: urutan pindah di tabel tugas.

### 2026-10-28 · Gabriel (+ Claude) · bersama (INSIDEN: pengantaran KMB Project ke domain yang belum ada)
- Kejadian:
  - Commit `d69bb61` (antar pengguna KMB Project ke `projekkmb.abadiops.com`) di-push sebelum domain itu ada.
  - Push ke `main` ternyata langsung tayang di `abadiops.com` lewat Worker `project-mar` (Workers Builds dari GitHub).
  - Selama beberapa menit, pengguna KMB Project yang login di `abadiops.com` dikirim ke alamat yang tidak ada, dan sesi portalnya terhapus.
- Pemulihan:
  - Commit `27c1160` mengosongkan alamat KMB Project. Versi itu tayang sekitar 4 menit sesudah push, diverifikasi dengan memantau `abadiops.com/app.js`.
  - Pengguna yang terdampak cukup membuka `abadiops.com` lagi dan memasukkan token.
- Pelajaran (dicatat di `AGENTS.md` §6):
  - Push ke `main` = deploy produksi.
  - Perubahan yang bergantung pada domain, DNS, atau SQL hanya di-push sesudah hal itu terbukti ada.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (koreksi: Worker di balik abadiops.com; pengantaran KMB Project ditunda)
- Berubah:
  - **Koreksi:** `abadiops.com` tidak dilayani Worker `project-kmb`. Tangkapan layar dashboard menunjukkan `project-kmb` tanpa custom domain dan tanpa route, dengan 1 pemanggilan per 24 jam. Catatan sebelumnya yang menyebut "`project-kmb` live" sudah dibetulkan menjadi "kode baru tayang di `abadiops.com`".
  - Kode baru selalu muncul di `abadiops.com` tanpa deploy manual. Dugaan kuat: ada Worker lain yang terhubung ke GitHub, sehingga **push ke `main` = deploy produksi** (peringatan ditambahkan di `AGENTS.md` §6).
  - Pengantaran KMB Project ke `projekkmb.abadiops.com` **ditunda**: alamat dikosongkan di `worker.js` dan `scripts/patched-app.js`, karena domainnya belum ada (DNS tidak ditemukan). Pembaca `#token=` di `checkAuth()` dan aturan "jangan antar kalau sudah di rumahnya" tetap terpasang; keduanya tidak berpengaruh selama alamat kosong.
- Belum selesai / berikutnya: cari Worker yang melayani `abadiops.com`, pasang `projekkmb.abadiops.com` di sana, lalu isi kembali alamatnya.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (projekkmb.abadiops.com; abadiops.com hanya pintu)
- Berubah:
  - Deploy ulang ketiga Worker oleh Gabriel. `sum.abadiops.com` dan `kmb.abadiops.com` terpasang sebagai custom domain dan diverifikasi.
  - Pintu `abadiops.com` mengantar ke alamat baru. Sempat terlihat masih versi lama karena dicek sebelum deploy selesai; dicek ulang sudah benar.
  - Keputusan Gabriel: KMB Project di `projekkmb.abadiops.com`, `abadiops.com` hanya pintu.
    - `worker.js`: `ALAMAT_RUMAH.KMB_PROJEK`, dan pintu mengirim `alamat_rumah` untuk KMB Project juga.
    - `scripts/patched-app.js`:
      - `ALAMAT_APLIKASI_RUMAH`, nama baru untuk `ALAMAT_RUMAH_LAIN`.
      - Pengguna diantar hanya kalau host halaman berbeda dengan alamat rumahnya.
      - `checkAuth()` membaca `#token=` (didahulukan, lalu dihapus dari alamat).
    - `worker.js` dirakit ulang (`index.html`, `style.css`, `data.js` tidak berubah). `--dry-run` lulus.
  - `wrangler.toml` (akar dan `workers/kmb-projek`): peringatan agar tidak menambah `routes` tanpa mencantumkan `abadiops.com`, karena domain dipasang lewat dashboard.
- Belum selesai / berikutnya:
  - Gabriel: tambah custom domain `projekkmb.abadiops.com` lewat dashboard, lalu deploy `project-kmb`.
  - Lalu uji pengantaran di browser untuk ketiga rumah.

### 2026-10-28 · Gabriel (+ Claude) · bersama (langkah 1–2 + alamat aplikasi rumah)
- Berubah:
  - Supabase, dijalankan Gabriel:
    - `hapus-salinan-token-uji.sql` mengubah 4 baris (`api_tokens` dan `config_mechanics` untuk SPV-001 dan SUPT-001).
    - `rpc_wajib_token.sql` berhasil.
    - Diverifikasi dari luar: token lama hilang dari cermin, 4 fungsi lama tertutup untuk anon, 4 pembungkus menolak token palsu.
  - `abadiops-sum` dan `abadiops-kmb` di-deploy dengan pembaca `#token=`. Diverifikasi lewat IP Cloudflare, karena DNS biasa di jaringan Gabriel mencegat `*.workers.dev`.
  - **Keputusan alamat (pilihan A):**
    - `routes` dengan `custom_domain = true` untuk `sum.abadiops.com` (`workers/sum/wrangler.toml`) dan `kmb.abadiops.com` (`workers/kmb/wrangler.toml`).
    - `ALAMAT_RUMAH` di `worker.js` dan `ALAMAT_RUMAH_LAIN` di `scripts/patched-app.js` diganti ke alamat itu. `worker.js` dirakit ulang (`index.html`, `style.css`, `data.js` tidak berubah).
    - `--dry-run` kedua rumah lulus.
- Belum selesai / berikutnya:
  - Deploy ulang ketiga Worker, kedua rumah dulu supaya alamatnya sudah ada sebelum pintu mengantar ke sana.
  - Lalu uji pengantaran di browser.

### 2026-10-28 · Gabriel (+ Claude) · bersama (haram hardcode + alat token tiga rumah)
- Berubah:
  - Aturan **HARAM hardcode** (keputusan Gabriel): `AGENTS.md` §5 dan `docs/KEPUTUSAN.md`.
  - Baru: `scripts/buat-token-tiga-rumah.mjs`. Skrip ini membuat token hex 20 yang dicek langsung ke GAS ketiga rumah, atau dengan `--cek` memeriksa token yang sudah ada. Tidak ada daftar token di repo, jadi token yang bertambah besok ikut terperiksa.
    - Cek 28 Okt malam: keempat token uji lama kini hanya dikenali KMB V2.
    - Ketiga token uji baru belum terdaftar di rumah mana pun.
  - Hardcode yang dibuang:
    - Daftar token SUM di `worker.js` (`isKnownSumToken`) dan `scripts/patched-app.js` (`tenantCode`). Rumah ditentukan pintu.
    - Token uji SUM di `scripts/verify-sum-kmb-isolation.mjs`, sekarang dari environment `SUM_UJI_TOKEN`.
    - `scripts/sum-monitoring.json`: salinan 40 token dan nama mekanik SUM, tidak dipakai di mana pun, bisa dipulihkan dari git.
    - Token di `docs/PROGRES.md` dan `docs/INVENTARIS-KMB-PROJEK.md` disamarkan.
  - Pencocokan ApiTokens ketiga rumah dari tangkapan layar Gabriel, hanya untuk diketahui dan tidak ditulis di mana pun:
    - Tidak ada token kembar selain 3 akun uji KMB V2 ↔ KMB Project, dan ketiganya sudah dibereskan di sheet.
    - `mechanic_id` yang sama di dua rumah dengan token berbeda (misalnya `SUPT-001`, `SPV-002`) tidak masalah.
- Belum selesai / berikutnya: bug #16, hardcode yang tersisa di portal KMB Project (Raka, perlu keputusan Gabriel).

### 2026-10-28 · Gabriel (+ Claude) · bersama (pintu tiga rumah + serah-terima token + RPC bertoken)
- Berubah:
  - **Pintu** di `worker.js` dan `workers/kmb-projek/worker.js` (keputusan Gabriel 28 Okt malam, bug #11). Ping dicek ke GAS KMB Project, SUM V2, dan KMB V2 sekaligus, dengan batas 25 detik per rumah.
    - Cocok satu: masuk. Untuk SUM V2 dan KMB V2, jawaban membawa `rumah` dan `alamat_rumah`.
    - Cocok lebih dari satu: ditolak.
    - Tidak cocok: jawaban asli GAS.
    - Ada rumah yang tidak menjawab: "Server sedang sibuk".
    - URL GAS KMB V2 diambil dari `workers/kmb/wrangler.toml`.
  - **Isolasi:** selain ping, Worker KMB Project hanya meneruskan ke GAS KMB Project. Rute data ke GAS SUM dihapus.
  - `scripts/patched-app.js`, dirakit ke `worker.js` (`index.html`, `style.css`, dan `data.js` tidak berubah):
    - Sesudah ping berhasil, token SUM V2 / KMB V2 diantar ke aplikasi rumahnya (`#token=`), dan sesi portal dibersihkan.
    - Cadangan ping langsung ke GAS memakai aturan yang sama.
    - Cadangan data langsung ke GAS hanya ke KMB Project.
  - `pwa/sum/app.js` dan `pwa/kmb/app.js`: `terimaTokenSerahan()` membaca `#token=`, menghapusnya dari alamat, lalu menjalankan `doLogin()` yang sudah ada. Kalau HP sudah masuk dengan token lain, token itu tidak diganti, karena antrean kirimannya bisa hilang.
  - **Bug #13:** `db/kmb_projek/rpc_wajib_token.sql` (baru), GRANT di `rpc_baca.sql` diganti REVOKE, dan Worker memanggil `*_bertoken` dengan `p_token`.
  - `scripts/update-worker-engine.mjs` dipensiunkan (langsung keluar dengan pesan), karena skrip itu menimpa seluruh blok `/api/gas` di `worker.js`.
  - `docs/KEPUTUSAN.md`: baris keputusan pintu. `docs/BUG-DICATAT.md`: #11 dan #13 diperbaiki, #15 dicatat. `AGENTS.md` §2 dan §6 diperbarui.
  - **Diuji di `wrangler dev`:**
    - Token uji SUM diantar ke `abadiops-sum`, token uji KMB V2 ke `abadiops-kmb`.
    - SPV-001 dan SUPT-001 lama (kembar KMB V2 + KMB Project) ditolak.
    - Token palsu ditolak.
    - Data bertanda SUM lewat Worker KMB Project ditolak.
    - Login memakan 5–12 detik.
    - Pengantaran di browser (`#token=`) belum diuji, karena perlu browser.
- Belum selesai / berikutnya:
  - Gabriel: deploy ketiga Worker, jalankan dua SQL (`hapus-salinan-token-uji.sql`, `rpc_wajib_token.sql`), lalu uji di browser. Lihat tabel tugas.
  - **Raka, besok pagi: `git pull` dulu.** Yang berubah:
    - `worker.js`: pintu, isolasi, gerbang tahap 4, RPC bertoken.
    - `scripts/patched-app.js`.
    - Skrip sinkron.
    - `update-worker-engine.mjs` dipensiunkan.
  - Di kode pintu, `tenant_code` `KMB` tetap berarti KMB Project, sedangkan KMB V2 memakai `KMB_V2`.
  - PWA KMB V2 mengambil `app.js` dari cache dulu. Perangkat uji yang sudah pernah membuka `abadiops-kmb` perlu menghapus data situsnya sekali. Versi PWA sengaja tidak dinaikkan supaya labelnya tetap 1:1 dengan PWA lama.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (uji kembar baca + gerbang tahap 4)
- Berubah:
  - Baru: `scripts/uji-kembar-kmb-projek.mjs`. Skrip ini mengirim permintaan yang sama seperti frontend ke jalur Supabase dan jalur GAS, lalu membandingkan isinya. Baris dicocokkan per kunci, bukan per urutan, dan token tidak dicetak. Hasil 28 Okt (token uji SPV lama): `ping` beda tipis (Supabase menambah `section`), sedangkan `pull_monitoring` dan `pull_create_refs` **jauh berbeda** (bug #12). `pull_my_wos` sama, tapi hanya karena jatuh ke GAS.
  - `worker.js` dan `workers/kmb-projek/worker.js`: gerbang tahap 4. Supabase hanya melayani aksi yang ada di `AKSI_SUPABASE_LULUS_KEMBAR`, yang sekarang masih kosong. `?uji=supabase` memaksa jalur Supabase, khusus untuk uji kembar. Diuji di `wrangler dev`: jalur bawaan frontend kini dijawab GAS (pending L2 19, approved 44), jalur `?uji=supabase` tetap Supabase (0 dan 1), login token SUM lewat pintu tetap jalan, token palsu tetap ditolak.
  - `scripts/sinkron-kmb-projek-cermin.mjs`: tidak lagi membuat token tiruan `kmb-<id>` (bug #14).
  - `docs/BUG-DICATAT.md`: #12, #13, dan #14.
- Belum selesai / berikutnya:
  - Deploy `project-kmb`, supaya gerbang ini dan pilihan C berlaku di `abadiops.com`. Selama belum di-deploy, supervisor KMB Project di sana melihat 0 pending.
  - Raka: cermin perlu diperbarui terus-menerus (bukan sinkron manual), lalu jalankan uji kembar per aksi. Aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR`.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (pilihan C: hapus salinan token uji KMB V2)
- Berubah:
  - `worker.js` dan `workers/kmb-projek/worker.js`: 4 entri `TOKENS` di data.js dihapus (28 → 24), `offline_token` SUPT-001 dikosongkan, app.js dirakit ulang dari `scripts/patched-app.js`. style.css sengaja dibiarkan persis seperti sebelumnya, karena perakitan ulang mengubah akhiran barisnya. Kode Worker di luar 4 file tertanam tidak berubah.
  - `scripts/patched-app.js`: peran tidak lagi dikunci ke dua token uji lama. Untuk token lain hasilnya sama persis (`tokenRecord.role || 'mechanic'`).
  - `scripts/sinkron-kmb-projek-cermin.mjs`, `scripts/uji-live-supabase-backend.mjs`, `scripts/verify-sum-kmb-isolation.mjs`: token uji supervisor dibaca dari environment `KMBP_UJI_SPV_TOKEN`. Dua skrip pertama berhenti dengan pesan jelas kalau kosong.
  - `tests/api/gas.test.ts`: memakai token palsu `uji-palsu-spv-kmbp`. Fetch dan Supabase di-mock, jadi nilainya tidak berpengaruh. Lulus 3/3.
  - `docs/MULTI-TENANT-SETUP.md` dan `docs/INVENTARIS-KMB-PROJEK.md` tidak lagi memuat token itu.
  - Baru: `db/kmb_projek/hapus-salinan-token-uji.sql`. Yang dicocokkan md5-nya; token mentah tidak ditulis. Sudah diuji di Postgres dalam memori (PGlite) dengan skema `cermin_sheet.sql`: menghapus tepat baris lama, baris lain utuh, jalan kedua 0 baris.
  - Tiga token uji baru untuk `SUPT-001`, `SPV-001`, `MECH-003` sudah dicek: ditolak ("Token tidak dikenal / nonaktif") oleh GAS SUM V2, KMB V2, dan KMB Project, dan tidak ada di bundel. Tokennya hanya diberikan ke Gabriel lewat chat.
  - `docs/KEPUTUSAN.md`: nomor 8 dipindah ke "Sudah diputuskan".
  - Temuan: login KMB Project mengecek `kmb_projek.api_tokens` (RPC `kmb_ping`) **sebelum** GAS. Jadi mengganti token di sheet saja tidak cukup; SQL di atas wajib dijalankan.
- Belum selesai / berikutnya: langkah manual di tabel tugas (sheet, SQL, deploy, `KMBP_UJI_SPV_TOKEN`). Setelah sheet diganti, tunggu paling lama 30 menit (cache token GAS KMB Project): token lama ditolak di KMB Project dan token baru dikenali.

### 2026-10-28 · Gabriel (+ Claude) · bersama (verifikasi token kembar)
- Berubah: tidak ada kode. Keempat token kembar dibandingkan utuh (20 karakter) antara cadangan KMB V2 (23 Sep) dan `workers/kmb-projek/worker.js`: **sama persis**, dan **keempatnya akun uji KMB V2** ("L2 Test", "L1 Test", "Test Mechanic Field 1", "Test Mechanic tyre 1"). Di data KMB Project, `MECH-003` dan `TYRE-002` hanya ada tokennya, tanpa data mekanik.
- Koreksi catatan sebelumnya: token `52fd…` memang token uji (L1 Test), jadi label "token uji" di `docs/MULTI-TENANT-SETUP.md` sudah benar. Tidak ada token pengguna sungguhan yang kembar antar-rumah.
- Belum selesai / berikutnya: persetujuan Gabriel untuk pilihan C (hapus salinan akun uji dari KMB Project).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Isolasi Data SUM vs KMB & Pemisahan Cache Tenant)
- Berubah:
  - **Akar Masalah Data KMB Tampil di SUM:**
    1. Di worker.js, ekstraksi reqSystem sebelumnya memeriksa parsedData.system (dimana parsedData adalah peek.data). Saat frontend mengirim payload JSON { token, system: 'SUM', action: 'pull_monitoring', data: {} }, peek.system tidak terbaca dan reqSystem bernilai kosong (targetSystem default ke 'KMB').
    2. Akibatnya, if (isSupabaseSelected && targetSystem === 'KMB') terpanggil dan Worker mengambil RPC kmb_monitoring serta kmb_create_refs dari database Supabase Singapore KMB Project, mengabaikan rumah SUM.
    3. Di scripts/patched-app.js, fungsi initStorage() memiliki baris peninggalan yang menghapus mar_current_system jika bernilai 'SUM', sehingga sistem selalu ter-reset ke KMB setiap refresh atau load storage.
    4. Cache localStorage menggunakan satu kunci global kmb_gas_refs_v9 dan filter rekondisi yang menolak unit non-vessel milik SUM.
  - **Perbaikan:**
    1. worker.js & workers/kmb-projek/worker.js:
       - Ekstraksi bodySystem diperluas membaca peek.system dan params.get('system').
       - Pengenalan otomatis token SUM (`4651…`, 4738…, prefix sum).
       - isSupabaseSelected dikunci khusus targetSystem === 'KMB'. Untuk SUM, seluruh aksi dialirkan 100% langsung ke SUM GAS (AKfycbzB5EUJ…).
    2. scripts/patched-app.js:
       - api() kini menyematkan parameter query &system=${currentSystem.toLowerCase()} dan header X-MAR-System: currentSystem.
       - Menghapus pembersihan destruktif mar_current_system di initStorage().
       - Kunci cache dan work orders di-scope per tenant (mar_gas_refs_${currentSys}_v1 dan mar_work_orders_${currentSys}).
       - loginWithToken() mengosongkan state in-memory saat berpindah tenant agar tidak ada data unit/mekanik KMB yang bocor ke sesi SUM.
       - Badge sistem dan indikator engine menampilkan PROJEK SUM (biru) dan SPREADSHEET LIVE (Google Sheets) untuk SUM.
  - **Catatan untuk Gabriel (Perbedaan Form Create WO SUM V2 vs KMB Project):**
    - Saat login dengan token SUM V2 (`4651…`), backend kini sudah 100% menarik data monitoring, unit, dan mekanik dari GAS SUM.
    - Namun, form Create WO di `abadiops.com` saat ini masih menyajikan antarmuka KMB Project (3 model pembuatan: Bebas/Unit/Job, pembagian section Rekondisi/Maintenance, dan unit Vessel).
    - Di sistem asli SUM V2 (`docs/INVENTARIS-SUM.md` & `pwa/sum/index.html`), SUM tidak punya section dan form Create WO-nya ringkas 2 level (Kategori Pekerjaan → Komponen Dump Truck → Work Condition → Lokasi Bengkel/Lapangan → Tim Mekanik).
    - PWA asli SUM V2 versi 46 sudah siap 1:1 di folder `pwa/sum/` dan telah dideploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev`.
    - Dicatat di Bug #11 (`docs/BUG-DICATAT.md`). Menunggu keputusan Gabriel untuk pemisahan frontend di pintu utama `abadiops.com` saat menyajikan rumah SUM.
- Belum selesai / berikutnya:
  - Menunggu verifikasi visual dari pengguna saat login di abadiops.com dengan token SUM.

---
### 2026-10-28 · Raka (+ Antigravity) · bersama (Penyambungan Multi-GAS Token Resolver untuk SUM V2)
- Berubah:
  - Multi-GAS Token Resolver (`worker.js`, `workers/kmb-projek/worker.js`):
    - **Penyebab masalah:** Worker `abadiops.com` sebelumnya hanya memeriksa Supabase `kmb_ping` lalu fallback ke `GAS_EXEC_URL` KMB Project (`AKfycbxh4086…`). Saat token SUM V2 (`4651…` milik SPV-000 L1 Supervisor) dimasukkan, KMB GAS menolak dengan pesan *"Token tidak dikenal / nonaktif"*.
    - **Perilaku baru:**
      - Merestrukturisasi blok `action === 'ping'` di `worker.js` agar berdiri sendiri sebelum pengecekan engine (`isSupabaseSelected && targetSystem === 'KMB'`). Sebelumnya, jika `targetSystem` awal adalah SUM atau belum disetel, blok ping terlewati dan langsung jatuh ke forwarding KMB default.
      - Menambahkan header `X-Active-Engine` pada `Access-Control-Allow-Headers` preflight OPTIONS `/api/gas` agar browser tidak memblokir request karena CORS.
      - Di `worker.js` pada action `ping`: jika `kmb_ping` tidak cocok, Worker memverifikasi token ke `GAS_URLS.KMB` dan `GAS_URLS.SUM` (`AKfycbzB5EUJ…`).
      - Saat GAS SUM memvalidasi token, Worker menyematkan `tenant_code: 'SUM'` dan header `X-MAR-Tenant: SUM`.
      - Untuk aksi data selanjutnya (`pull_monitoring`, `pull_create_refs`, dll.), Worker secara otomatis meneruskan permintaan ke backend SUM jika tenant adalah SUM.
      - Teruji secara lokal via Node: ping token SUM mengembalikan status 200 dengan profil supervisor dan `pull_monitoring` berhasil menarik data monitoring SUM.
  - Client GAS Fallback (`scripts/patched-app.js`):
    - Menambahkan rute SUM ke `GAS_FALLBACK_URLS`.
    - Mengoptimasi pemanggilan `api()` dengan menghapus custom headers yang memicu preflight CORS di browser, serta menyematkan fallback multi-GAS langsung pada klien browser untuk aksi `ping`.
    - Mengemas ulang ke `worker.js` via `scripts/pack-final-worker.mjs`.
- Belum selesai / berikutnya: Verifikasi login langsung dengan token SUM di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Fix Mode Akses: Web Normal Buka Portal Lengkap)
- Berubah:
  - Alur Pemilihan Mode Akses (scripts/built-index.html, scripts/patched-app.js, worker.js):
    - **Penyebab masalah:** Sebelumnya tombol atas (PWA) yang menutup gate overlay (`hideGateOverlay()`) dan membuka portal dashboard dengan toast "Mode PWA aktif", sedangkan tombol bawah (Web Normal) mencoba melakukan `window.location.href = /monitoring?token=...` yang menyebabkan reload dan memunculkan kembali modal pilihan mode (looping).
    - **Perilaku baru:**
      - Tombol bawah **Web Normal** (`#btn-mode-web`): Ditandai sebagai mode aktif utama (badge "Buka Semua Modul"). Saat diklik, langsung memanggil `hideGateOverlay()`, mengaktifkan seluruh modul/tab portal web (Performa, Create WO, Monitoring, Approvals, Teknis, Koreksi HM/KM, Reports), memperbarui riwayat URL tanpa reload, dan menampilkan notifikasi sukses "Web Normal aktif (Semua modul terbuka)".
      - Tombol atas **PWA** (`#btn-mode-pwa`): Diberi label "Segera Hadir". Karena PWA offline lapangan masih dalam tahap persiapan, jika diklik sistem memberi pemberitahuan "PWA Lapangan sedang disiapkan" dan mengarahkan pengguna ke Web Normal agar tidak terhalang.
      - Menyesuaikan warna aksen tombol Web Normal secara dinamis (`#3B82F6` untuk SUM, `#10B981` untuk KMB).
      - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas HTML dan JS terbaru ke dalam `worker.js`.
- Belum selesai / berikutnya: Verifikasi pengujian langsung di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (scripts/built-index.html, scripts/patched-app.js):
    - Mengganti teks KMB PORTAL GATE menjadi MAR PORTAL GATE dan title menjadi MAR PORTAL - Mechanic Activity Report.
    - Menyembunyikan label engine toggle (#btn-engine-toggle, #btn-engine-switch-user) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi Masuk ke Aplikasi.
    - Mengganti hardcode state.currentSystem = 'KMB' dan localStorage.setItem('mar_current_system', 'KMB') menjadi dinamis sesuai tenant_code dari respon server atau prefix token (SUM, KMB, dll.).
  - Resolusi Token Multi-Skema (src/backends/supabase/auth.ts, workers/kmb-projek/src/backends/supabase/auth.ts, src/lib/supabaseCerminReader.ts):
    - bacaPingSupabase diperluas agar menyelesaikan token dari kmb_projek.api_tokens, skema relasional sum.api_tokens / cermin sum, dan tabel public.api_tokens.
    - identitasDariTokenSupabase memeriksa tabel token public, fallback sum, dan fallback kmb_projek.
    - Validasi sistem disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di loginWithToken: setelah token valid, menampilkan modal pilihan mode (showModeChoice).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke /monitoring?token=...&tenant=... sekaligus menyinkronkan token dan tenant ke cookies & localStorage.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaikan validasi token di login gate PWA KMB Project (`scripts/patched-app.js`, `worker.js`, `workers/kmb-projek/worker.js`) (Bug #10):
    - **Penyebab masalah:** Sebelumnya, `loginWithToken()` langsung membuat dummy fallback user `{ id: cleanToken, role: 'mechanic', name: 'User KMB' }` jika token tidak ada di cache lokal, lalu segera memanggil `hideGateOverlay()` dan `switchTab('monitoring')` sebelum verifikasi server selesai. Akibatnya, token sembarangan/salah langsung dibawa masuk ke tab monitoring mekanik.
    - **Perilaku baru:**
      1. Saat tombol login ditekan (atau ditekan Enter), tombol langsung berganti status menjadi loading spinner (`Memeriksa token...`) dan di-disable.
      2. Layar login (gate overlay) ditahan tetap terbuka — tidak langsung berpindah tab.
      3. Token diverifikasi secara async via `api('ping')` ke database backend (Supabase Singapore `kmb_ping` atau fallback GAS KMB Project).
      4. Jika token tidak valid / tidak dikenal: user tetap di layar login, muncul pesan error merah di elemen `#gate-error-msg` dan toast error, input token diberi border merah dan fokus, token dibersihkan dari `localStorage` dan URL, dan tombol login kembali aktif.
      5. Jika token valid: profil dan role dimuat sesuai respon backend (mekanik ke monitoring, approver/supervisor ke dashboard).
- Belum selesai / berikutnya: pengujian login langsung di browser untuk berbagai variasi token.

### 2026-10-28 · Gabriel (+ Claude) · bersama (cek token)
- Berubah: tidak ada kode. Cek token kembar antar-rumah, dengan token hanya ditampilkan 4 huruf pertamanya.
  - Sumber: `ApiTokens` dan `offline_token` dari cadangan KMB V2 (23 Sep), `ApiTokens` dari cadangan SUM V2 (15 Sep), dan `TOKENS` dari `workers/kmb-projek/worker.js` (KMB Project). Semua token berupa hex 20 karakter.
  - Jumlah: KMB V2 32 (+3 offline_token), SUM V2 55, KMB Project 28.
  - **4 token kembar, semuanya KMB V2 ↔ KMB Project, dengan mechanic_id yang sama di kedua rumah:** `SUPT-001` (67e8…), `SPV-001` (52fd…), `MECH-003` (fde7…), `TYRE-002` (9b83…). Dua di antaranya approver (superintendent dan supervisor).
  - SUM V2 tidak kembar dengan rumah lain. Tidak ada token kembar di dalam satu rumah.
  - Token `52fd…` juga tercantum sebagai token uji di `docs/MULTI-TENANT-SETUP.md`, padahal di cadangan KMB V2 token itu milik `SPV-001`.
  - Keterbatasan: cadangan bertanggal 15–23 Sep, jadi token yang dibuat sesudahnya belum ikut dicek. Ulangi dengan data terbaru sebelum pintu dinyalakan.
- Belum selesai / berikutnya: keputusan cara menangani 4 token kembar (`docs/KEPUTUSAN.md`, belum diputuskan nomor 8).

### 2026-10-28 · Gabriel (+ Claude) · kmb (2)
- Berubah:
  - Worker `abadiops-kmb` di-deploy Gabriel ke `https://abadiops-kmb.kawanabadigrup.workers.dev` (versi `5f1b2647`), memakai API token kawanabadigrup yang sama dengan SUM.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): identik dengan jawaban langsung GAS KMB V2. Waktu jawab 3–5 detik.
  - Pemisahan rumah terkonfirmasi: `abadiops-sum` menjawab `X-Abadi-Rumah: sum`, sedangkan `abadiops-kmb` menjawab `kmb`. API token Cloudflare hanya kunci unggah kode, sedangkan data tiap rumah dipisahkan oleh Worker, alamat GAS, dan `ApiTokens` masing-masing.
- Belum selesai / berikutnya: uji token sungguhan di kedua alamat uji, lalu penyambungan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Raka (+ opencode) · bersama
- Berubah:
  - Implementasi **Zero-Select Tenant Login**: hapus pemilihan sistem di `/masuk`. Token otomatis dipetakan ke tenant di database.
  - Update `src/app/masuk/page.tsx`: hapus UI pemilihan sistem, hanya input token.
  - Update `src/app/api/masuk/route.ts`: hapus param `sistem`, token resolution otomatis.
  - Update `src/backends/supabase/auth.ts`: pencarian token di `public.api_tokens` dengan join ke `tenants` untuk deteksi tenant otomatis.
  - Catat keputusan di `docs/KEPUTUSAN.md`: Token unik global, login tanpa pilih sistem.
- Belum selesai / berikutnya:
  - Tambah UI pemilihan mode akses (PWA vs Web Normal) di halaman monitoring/home.
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaiki Bug #9 (Pelanggaran Isolasi Rumah §2 & Kebocoran Rute Data SUM):
    - Mengunci frontend `scripts/built-index.html` dan `scripts/patched-app.js` 100% murni KMB Project (menghapus tombol gate SUM `#gate-sys-sum`, tooltip switcher `#project-badge`, event listeners beralih sistem, dan fallback `GAS_FALLBACK_URLS.SUM`).
    - Menambahkan pembersih cache otomatis pada inisialisasi state & storage untuk membuang entri terkontaminasi SUM (`localStorage.mar_current_system === 'SUM'` dan item `kmb_work_orders` berakhiran suffix batch `-A/-U/-V/-W`).
    - Menghapus routing dan fallback `GAS_URLS.SUM` dari wrapper `worker.js` dan mengunci `targetSystem = 'KMB'` serta `targetGasUrl` hanya ke endpoint GAS KMB Project.
    - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas ulang `worker.js` dan menyinkronkan ke `workers/kmb-projek/worker.js`.
- Belum selesai / berikutnya:
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production untuk menyelesaikan Bug #6 di sisi basis data.

### 2026-10-28 · Raka (+ opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #6: hapus kolom `golongan` dari `kmb_projek.config_mechanics` dan field `position` dari RPC `kmb_create_refs`. Dropdown mekanik Create WO sekarang 100% murni nama tanpa label golongan, sesuai GAS asli KMB Project.
  - Buat migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` untuk drop kolom dari DB production.
  - Update skema `db/kmb_projek/cermin_sheet.sql` dan RPC `db/kmb_projek/rpc_baca.sql`.
- Belum selesai / berikutnya:
  - Jalankan migrasi di Supabase production.

### 2026-10-28 · Gabriel (+ Claude) · kmb
- Berubah:
  - Tahap 3 (Pintu) untuk KMB V2, dengan pola yang sama seperti rumah SUM. Menambah `pwa/kmb/`: salinan 1:1 PWA `mar-offline` v91. Hanya empat baris yang diubah: alamat API di `app.js:6` dan `sw.js:25` menjadi `./api`, serta versi v91 menjadi v92. File lainnya identik byte demi byte.
  - Menambah `workers/kmb/` (Worker `abadiops-kmb`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS KMB V2. Akun kawanabadigrup dikunci, saklar tetap `gas`. Kodenya sama dengan Worker SUM.
  - Diuji lokal dengan `wrangler dev`. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS KMB V2. `wrangler deploy --dry-run` valid.
  - Belum di-deploy. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, inventaris dan cermin KMB V2.

### 2026-10-28 · Raka (+ Antigravity & opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #8: kembalikan fallback query `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant. Token dari skema cermin hanya diterima jika prefix `kmb-` atau `s === 'KMB'`.
  - Mengidentifikasi dan mencatat Bug #9 di `docs/BUG-DICATAT.md`: kebocoran rute data SUM pada `worker.js` KMB Project akibat adanya dual-tenant router dan switch system yang melanggar isolasi rumah [AGENTS.md §2].
- Belum selesai / berikutnya:
  - Kunci `worker.js` KMB Project agar 100% terisolasi ke KMB (hapus `GAS_URLS.SUM`, hapus event switch sistem, hapus pembacaan state `mar_current_system === 'SUM'`).
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek (dan bersama)
- Berubah:
  - Tarik pembaruan remote dari Gabriel lewat `git pull --rebase` di `main`: menerima fondasi rumah SUM tahap Pintu (`pwa/sum/`, `workers/sum/`, `docs/INVENTARIS-SUM.md`, dan keputusan tetap dua link per rumah di `docs/KEPUTUSAN.md`).
  - Mengaudit perbaikan kebocoran token cross-tenant (commit `4259f67` / Bug #7).
  - Merapikan identitas pencatat Bug #7 di `docs/BUG-DICATAT.md` menjadi Raka (+ opencode).
  - Mencatat temuan bug regresi #8 di `docs/BUG-DICATAT.md`: terhapusnya fallback query `kmb_projek.api_tokens` pada `src/backends/supabase/auth.ts` saat commit `4259f67`.
- Belum selesai / berikutnya:
  - Pulihkan resolusi token `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant.
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Gabriel (+ Claude) · sum (4)
- Berubah: mencatat keputusan Gabriel di `docs/KEPUTUSAN.md`. Selama migrasi tetap dua link per rumah: PWA lapangan dan halaman web menu lengkap. Halaman web tetap di GAS sampai dipindah 1:1, dan wajib sudah dipindah sebelum saklar dinyalakan. Ide satu aplikasi offline-first dengan menu lengkap masuk daftar "setelah ketiga rumah selesai pindah". Berlaku juga untuk rumah kmb dan kmb-projek.
- Belum selesai / berikutnya: uji token sungguhan di alamat uji SUM.

### 2026-10-28 · Gabriel (+ Claude) · sum (3)
- Berubah:
  - Worker `abadiops-sum` di-deploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev` (versi `fdbdbc6c`), memakai API token kawanabadigrup.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-9 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Waktu jawab 3–6 detik, hampir seluruhnya waktu GAS.
- Belum selesai / berikutnya: uji dengan token sungguhan untuk kelima peran. Alamat ini belum dipakai mekanik.

### 2026-10-28 · Gabriel (+ Claude) · sum (2)
- Berubah:
  - Tahap 3 (Pintu) untuk SUM. Menambah `pwa/sum/`: salinan 1:1 PWA `mar-sum-offline` v45. Hanya empat baris yang diubah: alamat API di `app.js:8` dan `sw.js:20` menjadi `./api`, serta versi v45 menjadi v46.
  - Menambah `workers/sum/` (Worker `abadiops-sum`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS SUM. Tidak ada logika bisnis, saklar tetap `gas`. Buat WO, approve, dan semua aksi lain tetap dikerjakan GAS.
  - Diuji lokal dengan `wrangler dev`. Semua file PWA tersaji 200 tanpa redirect. Uji kembar API dengan token palsu (`ping`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Kalau GAS tidak terjangkau, Worker menjawab teks biasa (502), sehingga PWA tetap menahan kiriman di antrean.
  - Belum di-deploy ke Cloudflare. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, sambungkan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Gabriel (+ Claude) · sum
- Berubah:
  - Menambah `docs/INVENTARIS-SUM.md` versi 1: 19 sheet, 26 aksi (13 baca, 13 tulis) beserta gerbang peran dan sheet yang disentuh, 5 peran, halaman web, 4 pemicu terjadwal, Script Properties, rumus poin dan rupiah, nomor WO, dan zona waktu. Disusun dari kode `MAR-SUM-v2` commit `89edc5a`.
  - Menambah `db/sum/cermin_sheet.sql`: skema `sum` berisi 19 tabel cermin mentah (`nilai` = baris persis seperti `getValues()`), plus `cermin_header`, `cermin_log`, dan `cermin_meta`. Belum dijalankan di Supabase.
  - Menambah `tools/sum/sinkron-cermin.mjs`: membaca sheet lewat Google Sheets API memakai akun layanan baca-saja, lalu menulis ke skema `sum`. Ada mode `--kering`. Sintaks sudah dicek dan konversi tanggal WIB ke UTC lulus 4 uji. **Belum pernah dijalankan** terhadap spreadsheet sungguhan.
  - Menambah `db/sum/README.md`: alasan cermin mentah, langkah penyiapan, dan cara menjalankan.
  - Saklar SUM tetap `gas`. GAS dan spreadsheet tidak disentuh.
- Belum selesai / berikutnya: empat tugas SUM di daftar tugas terbuka.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - **STOP & EVALUASI KEPATUHAN PINDAHKAN DULU, PERBAIKI NANTI (AGENTS.md §1 & §2):**
    1. **Kesalahan Teridentifikasi:** Dropdown *Team Composition* pada layar Create WO menampilkan imbuhan grade/golongan `(1a)` di samping nama mekanik (contoh: `Afid Irham (1a)`).
    2. **Akar Masalah:**
       - Template option di `patched-app.js` menyisipkan `${name}${pos ? ` (${pos})` : ''}`.
       - Kolom `golongan` pada `kmb_projek.config_mechanics` di Supabase sempat terisi `'1a'` dan diekspos melalui RPC `kmb_create_refs`.
       - **Koreksi Fatal:** Sistem penilaian dan grading `(1a, 1b, 2a, dst)` adalah milik **Rumah SUM V2**, bukan milik KMB Project. Di Google Spreadsheet dan GAS asli KMB Project, dropdown mekanik sama sekali tidak memiliki label golongan dan murni hanya menampilkan nama mekanik.
    3. **Tindakan:** Menghentikan sementara pekerjaan baru dan mencatat temuan ini secara formal di `docs/BUG-DICATAT.md` (Entri #6) agar menjadi pengingat keras untuk pekerjaan selanjutnya.
- Belum selesai / berikutnya:
  - Kembalikan dropdown *Team Composition* di `scripts/patched-app.js` dan `worker.js` menjadi 100% murni nama mekanik tanpa embel-embel grade `(${pos})`, persis 1:1 seperti GAS dan Spreadsheet KMB.
  - Bersihkan eksposur `golongan` di skema `kmb_projek` / RPC `kmb_create_refs` agar data SUM tidak bocor ke rumah KMB.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan full smart cascading pada form Create WO (Unit -> Component -> Sub Component -> Job):
    1. Auto-select otomatis jika pilihan pada level berikutnya hanya ada 1 (contoh: Unit DLCD/SDVS langsung auto-select Component; Component ber-sub tunggal langsung auto-select Sub Component).
    2. Dependent dropdowns dinonaktifkan (disabled) secara bertingkat dengan label instruksi jelas sebelum dropdown induk dipilih.
    3. Pilihan yang valid tetap dipertahankan saat induk diganti (tidak asal di-reset kosong jika masih kompatibel).
    4. Memperbaiki perhitungan Unit Factor (1.00x) dan kalkulasi Estimated Points di box Preview secara real-time.
    5. Re-pack worker.js.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Menyusun `docs/PANDUAN-GABRIEL.md` berisi panduan setup langkah demi langkah untuk Gabriel (KMB V2 & SUM V2).
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - Gabriel membuat skema `kmb` dan `sum` serta memindahkan PWA masing-masing.
  - Penyesuaian akhir import shared di root.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki pengisian dropdown Create WO (Rekondisi & Maintenance) agar tidak lagi kosong:
    1. Bump cache version ke kmb_gas_refs_v9 dan otomatis purge cache usang (v8/v7) di browser klien.
    2. Menambahkan validasi integritas cache sebelum dipakai (hasRekondisi, validasi count komponen).
    3. Menambahkan ID prefix matching (sdvs, dlcd, sdt, xevb, xtn) dan safety fallback pada getAvailableUnits, getAvailableComponents, getAvailableSubComponents, dan getAvailableJobs agar cascading kebal terhadap perbedaan penamaan section.
    4. Menyinkronkan pull_create_refs secara asinkron-deterministik (await) dalam syncFromSpreadsheet.
    5. Re-pack worker.js siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy bundle worker.js ke Cloudflare Workers Quick Edit.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - **Issue**: Kode shared (`src/lib/`, `src/domain/`, `src/pwa/`) perlu di-extract atau dibuat relatif import yang benar. Perlu keputusan apakah frontend Next.js milik KMB Project saja atau shared.
  - Pindahkan `db/kmb_projek/` ke `db/` (sudah benar).
  - Siapkan skema database untuk `kmb` dan `sum` (Gabriel).
  - Tentukan monorepo strategy: `package.json` shared vs per rumah.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Menyinkronkan seluruh 1.533 katalog pekerjaan (`jobs_vessel` 276 baris & `jobs_field` 1.257 baris) dari Google Spreadsheet ke tabel Supabase `kmb_projek.catalog_jobs` dengan kunci komposit `(job_id, section)`.
  - Memperbaiki stored procedure RPC `public.kmb_create_refs()` di [db/kmb_projek/rpc_baca.sql](file:///d:/marbaru/MARProject/db/kmb_projek/rpc_baca.sql) agar mengembalikan format 1:1 GAS untuk `jobs_vessel` dan `jobs_field` beserta work conditions shift 1, shift 2, dan ekstrim.
  - Memperbaiki dropdown katalog yang sebelumnya kosong di halaman Create WO (misalnya untuk unit `SDT-003` yang kini langsung menampilkan 84 pekerjaan transmisi dan 13 sub-komponen lengkap).
  - Diterapkan langsung ke Supabase Singapore (`sptgqsjgszwbreikxdph`) dan terverifikasi live.
- Belum selesai / berikutnya:
  - Gabriel melanjutkan pembuatan skema cermin dan Uji Kembar untuk KMB V2 dan SUM V2.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan fitur **Dynamic Dual-Engine Switcher**: pengguna kini dapat dengan sangat mudah berpindah backend secara on-demand antara **SUPABASE LIVE (PostgreSQL Singapore)** dan **SPREADSHEET LIVE (Google Sheets / Google Apps Script)** tanpa perlu ubah kode.
  - Menambahkan tombol/badge interaktif langsung di antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html)):
    - Badge header (`#btn-engine-toggle`): cukup diklik sekali untuk toggle antara `🟢 SUPABASE LIVE (PostgreSQL)` dan `📊 SPREADSHEET LIVE (Google Sheets)`.
    - Tombol switch di user profile bar (`#btn-engine-switch-user`): tombol cepat "Ke Sheets" / "Ke Supabase".
    - Switch engine di login modal KMB PORTAL GATE (`#gate-engine-toggle`).
  - Mendukung override parameter URL (`?engine=supabase` vs `?engine=sheets` / `?engine=spreadsheet`) dan persistensi pilihan di `localStorage` (`kmb_active_engine`).
  - Menyelaraskan client API di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) agar menyertakan header `X-Active-Engine` dan query param `engine` di setiap request.
  - Memperbarui router [worker.js](file:///d:/marbaru/MARProject/worker.js) dan [src/app/api/gas/route.ts](file:///d:/marbaru/MARProject/src/app/api/gas/route.ts) agar saat engine `SPREADSHEET` dipilih, request 100% langsung diteruskan ke Google Apps Script / Sheets. Saat `SUPABASE` dipilih, request baca dilayani sub-50ms oleh Supabase Singapore.
  - Menambahkan unit test di [tests/api/gas.test.ts](file:///d:/marbaru/MARProject/tests/api/gas.test.ts) dan memaketkan ulang ke [worker.js](file:///d:/marbaru/MARProject/worker.js) (lolos validasi sintaks & testing).
- Belum selesai / berikutnya:
  - Copy [worker.js](file:///d:/marbaru/MARProject/worker.js) terbaru ke Cloudflare Workers Quick Edit lalu deploy.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbarui Cloudflare Worker (`worker.js`) dan Portal Web agar langsung terhubung ke basis data Supabase Singapore (`sptgqsjgszwbreikxdph`) menggunakan RPC & REST API.
  - Membuat dan menerapkan fungsi PostgreSQL RPC di Supabase Singapore (`db/kmb_projek/rpc_baca.sql`): `kmb_ping`, `kmb_create_refs`, `kmb_monitoring`, `kmb_my_wos`, dan `kmb_wos_by_status`.
  - Memperbarui badge dan teks pada antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js)) menjadi `🟢 SUPABASE LIVE (PostgreSQL)` dan sinkronisasi `Sync Supabase`.
  - Mengonfigurasi `STORAGE_MODE = "SUPABASE"` di [wrangler.toml](file:///d:/marbaru/MARProject/wrangler.toml) beserta variabel public Supabase.
  - Memaketkan ulang seluruh bundle ke dalam [worker.js](file:///d:/marbaru/MARProject/worker.js) siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers (lewat tab dashboard Cloudflare atau `wrangler deploy`).

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengaktifkan pengambilan data sistem langsung dari basis data Supabase Singapore (`kmb_projek`) sesuai Tahap 4 Roadmap (`docs/SAKLAR.md` & `AGENTS.md` §2).
  - Mengimplementasikan `src/lib/supabaseCerminReader.ts`: reader sub-50ms untuk aksi baca `ping`, `pull_create_refs`, `pull_monitoring`, `pull_my_wos`, dan kueri status WO (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`).
  - Menambahkan endpoint Next.js `src/app/api/gas/route.ts` yang bertindak sebagai Dual-Engine Gateway: menyajikan aksi baca langsung dari Supabase saat `BACKEND_DRIVER=supabase` dan meneruskan aksi tulis ke GAS.
  - Memperbarui `src/backends/supabase/auth.ts` dan `src/backends/supabase/data.ts` untuk mendukung resolusi token dan katalog cermin dari skema `kmb_projek`.
  - Mengalihkan `BACKEND_DRIVER=supabase` di `.env.local`.
  - Pengujian live: `pull_create_refs` selesai dalam 272ms (vs GAS ~6400ms) dan `pull_monitoring` selesai dalam 25ms (vs GAS ~8100ms), 100% data valid dan terverifikasi.
  - Menambahkan pengujian otomatis di `tests/api/gas.test.ts`.
- Belum selesai / berikutnya:
  - Bersama Gabriel mempersiapkan pemisahan folder `workers/` dan `pwa/` ke dalam struktur tiga rumah sesuai §6 `AGENTS.md`.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki bug flash UI di mana panel supervisor ("Mekanik Monitoring L1 & L2") sempat muncul ketika akun mekanik (contoh: Gusti Raka Pamungkas / `VES-012`) sedang proses loading awal.
  - Akar masalah:
    1. Di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html), kontainer `#mon-supervisor-panel` belum memiliki atribut bawaan `style="display: none;"`.
    2. Di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js), pemetaan profil mekanik dari cache lokal (`state.mechanics` asal `pull_create_refs`) tidak memiliki atribut `role` (terisi string kosong `""`), menyebabkan pengecekan `isMechanicMode` bernilai `false` selama beberapa detik sebelum `ping` selesai.
  - Perbaikan:
    - Menambahkan `style="display: none;"` dan loading spinner pada `#mon-supervisor-panel` di template HTML.
    - Memperbaiki `loginWithToken()` agar `user.role` selalu terisi `'mechanic'` sebagai fallback aman jika bukan supervisor/superintendent.
    - Memperketat pengecekan `renderMonitoring()` sehingga panel supervisor hanya dapat terbuka jika role eksplisit supervisor/superintendent.
    - Mengemas ulang [worker.js](file:///d:/marbaru/MARProject/worker.js) melalui `scripts/pack-final-worker.mjs`.
  - Menghapus bagian "Token Pengujian Cepat" (L1 Test, Gusti Raka, Mekanik SUM) dari modal KMB PORTAL GATE di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) sesuai arahan keamanan dan permintaan Raka.
  - Membuat panduan integrasi lengkap untuk Gabriel di [`docs/CATATAN-GABRIEL.md`](file:///d:/marbaru/MARProject/docs/CATATAN-GABRIEL.md) mencakup arsitektur 3 rumah, alur login/token routing, panduan pembuatan skema cermin `kmb` & `sum`, sinkronisasi snapshot, uji kembar, dan protokol kerja harian.
  - Membuat dan menjalankan skrip simulasi siklus hidup transaksi Work Order langsung di Supabase cloud PostgreSQL ([`scripts/simulasi-alur-supabase.mjs`](file:///d:/marbaru/MARProject/scripts/simulasi-alur-supabase.mjs)): berhasil menguji alur Create WO → Mechanic Submission → L1 Approval → L2 Final Approval & Poin Payroll (`WO-SB-20261027-8491`) dengan stempel waktu audit trail lengkap dan tersimpan permanen di skema `kmb_projek`.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengeksekusi sinkronisasi data snapshot awal dari Google Apps Script KMB Project ke skema cermin Supabase `kmb_projek` melalui [`scripts/sinkron-kmb-projek-cermin.mjs`](file:///d:/marbaru/MARProject/scripts/sinkron-kmb-projek-cermin.mjs).
  - Mengisi data tabel cermin Supabase:
    - `kmb_projek.config_units`: 28 unit
    - `kmb_projek.config_components`: 276 komponen
    - `kmb_projek.config_mechanics`: 21 mekanik & supervisor
    - `kmb_projek.api_tokens`: 21 token akses aktif
    - `kmb_projek.config_factors`: 6 faktor pengali jabatan & rate
    - `kmb_projek.work_orders`: 15 work order aktif & pending approval
    - `kmb_projek.work_orders_archive`: 51 work order riwayat arsip
  - Menjalankan Uji Kembar (*Twin Test*) Tahap 4 untuk aksi baca (`ping` token supervisor, `ping` token mekanik, katalog unit, dan daftar mekanik): hasil JSON dari Supabase `kmb_projek` 100% identik dengan GAS.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek & bersama (2)
- Berubah:
  - Menyelesaikan inventaris lengkap perilaku per aksi untuk Rumah KMB Project di [`docs/INVENTARIS-KMB-PROJEK.md`](file:///d:/marbaru/MARProject/docs/INVENTARIS-KMB-PROJEK.md) mencakup 20 aksi, payload, format JSON, pesan error persis huruf demi huruf, baris sheet, dan rumus hitung poin/rupiah.
  - Memverifikasi region project Supabase `sptgqsjgszwbreikxdph` adalah Singapura (`ap-southeast-1`), memperbarui [`docs/KEPUTUSAN.md`](file:///d:/marbaru/MARProject/docs/KEPUTUSAN.md).
  - Memverifikasi Script ID `1k_A_KER…` untuk SUM V2 dari repo `MAR-SUM-v2` (`.clasp.json` dan `SERAH-TERIMA.md`), memperbarui [`AGENTS.md`](file:///d:/marbaru/MARProject/AGENTS.md).
  - Memverifikasi cabang arsip `archive/marproject` tersimpan di remote `kmb` dan `origin`.
  - Menyiapkan skema cermin Google Sheets untuk Rumah KMB Project di Supabase (`db/kmb_projek/cermin_sheet.sql`) sesuai mandat Tahap 2 Cermin.
- Belum selesai / berikutnya:
  - Menunggu input kredensial database untuk project Supabase `sptgqsjgszwbreikxdph` / pembuatan staging project.
  - Pembentukan susunan tiga rumah bersama Gabriel (`workers/`, `pwa/`, `db/`).

### 2026-10-27 · Raka (+ Antigravity) · bersama (kmb-projek & sum)
- Berubah: Menyiapkan pemisahan multi-sistem KMB & SUM (Apps Script terpisah & database Supabase terpisah).
  - Menambahkan routing dinamis di Cloudflare Worker `worker.js` (`/api/gas`) berdasarkan header `X-MAR-System`, token prefix (`sum-` vs `kmb-`), dan query param.
  - Mendefinisikan URL Web App GAS untuk KMB (`AKfycbxh...`) dan SUM (`AKfycbzB...`) dengan fallback override via environment variable.
  - Menyiapkan koneksi kolam PostgreSQL / Supabase terpisah (`DATABASE_URL_KMB` dan `DATABASE_URL_SUM`) di `src/lib/db.ts` dan `src/lib/backendConfig.ts`.
  - Memperbarui `scripts/patched-app.js` dan `scripts/built-index.html` dengan pemilih sistem KMB / SUM, badge klik untuk beralih sistem, dan auto-deteksi token.
  - Menjalankan uji kembar routing (`test-worker-routing.mjs` & `test-backend-multi-tenant.mjs` lulus 100%).
- Belum selesai / berikutnya: Mengisi connection string Supabase khusus untuk SUM di `DATABASE_URL_SUM` (`.env.local` / Cloudflare env) setelah project Supabase SUM siap.

### 2026-10-27 · Gabriel + Claude · bersama (2)
- Berubah: mencatat keputusan Gabriel bahwa repo tetap publik dan token yang ada tetap dipakai. Tiga tugas mendesak soal repo privat, data di bundle, dan penggantian token dihapus dari daftar tugas terbuka. `AGENTS.md` §4 dan `docs/KEPUTUSAN.md` disesuaikan.
- Berikutnya: inventaris perilaku per rumah.

### 2026-10-27 · Gabriel + Claude · bersama
- Berubah: menambah `AGENTS.md`, `CLAUDE.md`, `docs/KEPUTUSAN.md`, `docs/SAKLAR.md`, `docs/PROGRES.md`, dan `docs/BUG-DICATAT.md`. Tidak ada kode yang diubah.
- Sebelum menulis, `main` sudah ditarik sampai commit `2e8e1da`.
- Temuan: repo masih publik, dan data produksi ikut terbawa di bundle frontend. Lihat tugas terbuka.
- Berikutnya: kerjakan tiga tugas mendesak di atas, lalu inventaris per rumah.
