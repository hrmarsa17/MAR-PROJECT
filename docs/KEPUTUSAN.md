# Keputusan

Daftar semua keputusan yang sudah diambil. Isi file ini mengikat.
Untuk mengubah sebuah keputusan, tanyakan dulu ke Gabriel, lalu perbarui file ini.
Keputusan bisnis dan angka uang ada di tangan **Gabriel**.

## Sudah diputuskan

| Tanggal | Keputusan | Alasan singkat |
|---|---|---|
| Okt 2026 | **Stack: Cloudflare Workers + Supabase (Postgres)**, bukan Vercel. | Worker bisa meneruskan ke GAS yang lambat (sekitar 20 detik) tanpa terputus, karena Cloudflare membatasi waktu CPU, bukan durasi. Tim juga sudah memakai Cloudflare. |
| Okt 2026 | Penyambung Worker ke Supabase memakai Hyperdrive, dengan **cache query dimatikan** dan **Smart Placement dinyalakan**. | Kalau cache menyala, approver bisa melihat antrean yang sudah basi. Smart Placement membuat Worker berjalan dekat dengan database di Singapura. |
| Okt 2026 | **Nama platform: Abadi Operation.** Alamatnya `abadiops.com`, sebutan sehari-harinya "Abadi". | Nama dibuat umum karena MAR hanya modul pertama. PA, MTBF, dan logistik akan menyusul. |
| 23 Okt 2026 | Domain `abadiops.com` dibeli di Hostinger (jatuh tempo 23 Okt 2027). Nameserver diarahkan ke Cloudflare (`duke`, `sharon`). | Dengan domain sendiri, alamat PWA jadi permanen. Hosting bisa diganti tanpa mekanik harus memasang ulang aplikasi. |
| Okt 2026 | **Satu alamat untuk semua pengguna.** Perusahaan, site, dan peran ditentukan oleh token. Tidak ada nama perusahaan di alamat. | Tidak perlu pindah alamat lagi setelah tahap penyatuan. |
| Okt 2026 | Staging berada di `staging.abadiops.com`. | Untuk uji tanpa menyentuh produksi. |
| Okt 2026 | Akun GitHub, Cloudflare, dan Supabase atas nama kawanabadigrup, dipakai bersama oleh Gabriel dan Raka. | Diterima. Penanda siapa yang mengerjakan dibuat lewat `git config user.name`, awalan pesan commit, dan `docs/PROGRES.md`. |
| Okt 2026 | Project Supabase: `sptgqsjgszwbreikxdph`. Region Singapura (**terkonfirmasi `ap-southeast-1`**). | Dekat dengan pengguna. Region tidak bisa diubah setelah project dibuat. |
| Okt 2026 | **Pindahkan dulu, perbaiki nanti.** Perilaku setiap sistem disalin persis, termasuk bug-nya. | Risiko terkecil untuk sistem yang dipakai menggaji orang. |
| Okt 2026 | **Tiga rumah**, yaitu KMB V2, KMB Project, dan SUM V2, masing-masing dengan frontend dan backend sendiri. Raka memegang KMB Project. Gabriel memegang KMB V2 dan SUM V2. | Isolasi: perubahan di satu rumah tidak bisa menimpa rumah lain. |
| Okt 2026 | Frontend setiap rumah adalah salinan 1:1 dari PWA lama rumah itu. | Mekanik tidak perlu belajar aplikasi baru. |
| Okt 2026 | Token lama milik pengguna dipertahankan persis. | Mekanik tidak perlu mengetik apa pun saat pindah. |
| 27 Okt 2026 | Repo tetap publik. Token dan data yang sudah ada di repo tetap dipakai dan tidak diganti. | Keputusan Gabriel, yang menjamin keamanannya. |
| Okt 2026 | **Model dua cabang dengan saklar per rumah** (lihat `docs/SAKLAR.md`). WO lama diselesaikan di GAS, WO baru lahir di Supabase. | Tidak ada WO yang dipindah di tengah jalan. |
| Okt 2026 | Data hanya mengalir satu arah, dari spreadsheet ke Supabase. | Dua buku yang sama-sama ditulisi adalah sumber selisih. |
| Okt 2026 | Riwayat payroll diimpor ke Supabase. File payroll yang sudah dibayar diimpor terpisah lalu dikunci. | Payroll bulan lalu harus bisa ditarik ulang tanpa angkanya berubah. |
| Okt 2026 | Bukti pembayaran (file ekspor payroll dan spreadsheet utama ketiga rumah) dipindahkan kepemilikannya ke akun Google kawanabadigrup. | Supaya bukti tidak ikut hilang kalau akun pribadi hilang. |
| 28 Okt 2026 | **Selama migrasi tetap dua link per rumah:** PWA untuk lapangan (offline-first, menu terbatas) dan halaman web untuk menu lengkap. Halaman web tetap di alamat GAS sampai dipindah 1:1, dan **wajib sudah dipindah sebelum saklar rumah itu dinyalakan**. | Menyatukan menu adalah perubahan perilaku, bukan pemindahan. Halaman web GAS menulis langsung ke spreadsheet, jadi tidak bisa melayani WO yang lahir di Supabase. |
| 28 Okt 2026 | **Login Zero-Select Tenant (Token Unik):** Halaman login (`/masuk`) tidak lagi menampilkan pilihan sistem/rumah (KMB / SUM / KMB Project). Token bersifat unik secara global. Backend Pintu otomatis mendeteksi rumah dari token di seluruh skema database. Setelah login, user memilih mode akses: **PWA (Offline-First)** atau **Web Normal (Live/GAS)**. | Menyederhanakan UX login mekanik. Menghindari kesalahan input sistem manual. |
| 28 Okt 2026 | **Satu pintu memakai token yang sudah ada** di ketiga rumah, tanpa mengganti token pengguna (keputusan Gabriel). Aturan pintu: token dicari di ketiga rumah. Cocok di **tepat satu** rumah: masuk. Tidak cocok: tolak dengan pesan yang sama seperti sekarang ("Token tidak dikenal / nonaktif"). Cocok di **lebih dari satu** rumah: **jangan menebak**, tanyakan rumahnya atau tolak dan minta hubungi admin. | Token acak tidak mungkin kembar karena kebetulan, tapi bisa kembar karena disalin. Cek 28 Okt menemukan 4 token kembar KMB V2 ↔ KMB Project, yang diselesaikan dengan pilihan C (lihat baris "Token kembar" di bawah). |
| 28 Okt 2026 | **Token baru tidak boleh bertabrakan dengan token rumah mana pun.** Token yang dibuat sistem baru memakai awalan rumah (`kmb-`, `kmbp-`, `sum-`) ditambah karakter acak, dan dicek ke daftar token ketiga rumah sebelum disimpan. Selama migrasi, token baru masih dibuat oleh GAS masing-masing rumah dalam format lama (hex 20 karakter), jadi pengamannya adalah aturan pintu di atas plus **pengecekan token kembar otomatis setiap hari** yang mengirim peringatan. | Mencegah satu token masuk ke dua rumah. Awalan juga membuat pintu bisa tahu rumahnya tanpa mencari. |
| 28 Okt 2026 | **Universal Login Gate & Netralisasi Portal:** File `scripts/built-index.html` dan `scripts/patched-app.js` dinetralkan: judul portal menjadi "MAR PORTAL GATE", label database & engine switch disembunyikan, teks tombol masuk menjadi "Masuk ke Aplikasi". State `currentSystem` dan penyimpanan `mar_current_system` diubah dinamis dari respon server (tidak hardcode KMB). Resolusi token (`bacaPingSupabase` dan `identitasDariTokenSupabase`) memeriksa skema `public`, `sum`, dan `kmb_projek` secara transparan. | Menjamin portal gate dapat digunakan oleh semua tenant (KMB, SUM, KMB Project) tanpa bias tampilan dan tanpa kegagalan autentikasi token. |
| 28 Okt 2026 | **Token kembar KMB V2 ↔ KMB Project diselesaikan dengan pilihan C** (keputusan Gabriel, 28 Okt malam). Keempat salinan akun uji KMB V2 (`SUPT-001`, `SPV-001`, `MECH-003`, `TYRE-002`) dihapus dari KMB Project: dari data.js di `worker.js` (`TOKENS` 28 → 24, `offline_token` SUPT-001), dari peran yang dikunci ke token di `scripts/patched-app.js`, dari skrip, uji, dan dokumen, serta dari cermin Supabase (`db/kmb_projek/hapus-salinan-token-uji.sql`). KMB V2 tidak disentuh karena akun uji itu memang miliknya. Tiga akun uji yang juga ada di spreadsheet KMB Project (`SUPT-001`, `SPV-001`, `MECH-003`) diberi token baru langsung di sheet ApiTokens. Token baru **tidak** ditulis di repo. Skrip yang butuh token uji supervisor membacanya dari environment `KMBP_UJI_SPV_TOKEN`. | Keempatnya akun uji, bukan pengguna sungguhan. Jadi tidak ada mekanik yang perlu mengetik token baru, dan pintu zero-select tidak perlu menebak. |
| 28 Okt 2026 | **Pintu mengenali rumah dari token, lalu mengantar pengguna ke aplikasi rumahnya sendiri** (keputusan Gabriel, 28 Okt malam; menyelesaikan bug #11). Token dicek ke GAS ketiga rumah sekaligus.<br>• **Cocok di tepat satu rumah: masuk.** Pengguna KMB Project tetap di portal `abadiops.com`. Pengguna SUM V2 diantar ke `abadiops-sum`, pengguna KMB V2 ke `abadiops-kmb`. Token ikut terbawa lewat `#token=`, dan PWA rumah itu memprosesnya seperti token yang diketik.<br>• **Cocok di lebih dari satu rumah: ditolak** dengan pesan "Token ini terdaftar di lebih dari satu rumah. Hubungi admin."<br>• **Belum cocok di mana pun, tapi ada rumah yang tidak menjawab:** "Server sedang sibuk", supaya mekanik tidak mengira tokennya rusak.<br>• Selain ping, Worker KMB Project hanya meneruskan ke GAS KMB Project. | Sejalan dengan "tiap rumah punya frontend sendiri, 1:1": pengguna SUM tidak lagi melihat form milik KMB Project. Ongkosnya, login menunggu GAS yang paling lambat (5–12 detik saat diuji 28 Okt malam), dan itu hanya terjadi saat login. |
| 28 Okt 2026 | **HARAM hardcode** (keputusan Gabriel). Token, daftar token, peran, data mekanik, dan data lain yang hidup di spreadsheet atau database tidak boleh ditulis sebagai nilai tetap di kode, skrip, uji, bundle, atau dokumen. Data dibaca dari sumbernya (GAS, Supabase, environment). Token baru dibuat dan dicek langsung ke ketiga rumah dengan `scripts/buat-token-tiga-rumah.mjs`. Rinciannya ada di `AGENTS.md` §5. | Token terus bertambah, jadi daftar di kode pasti basi. Kejadian 28 Okt: token uji yang ditulis di bundel dan kode KMB Project berujung pada 4 token kembar dan peran yang dikunci ke token. |
| 28 Okt 2026 | **Alamat aplikasi rumah: `sum.abadiops.com` (SUM V2) dan `kmb.abadiops.com` (KMB V2)** (keputusan Gabriel, pilihan A). Dipasang sebagai Custom Domain Worker lewat `wrangler.toml`. `*.workers.dev` tetap aktif sementara untuk perangkat uji. Pintu mengantar pengguna ke alamat ini; link yang dibagikan ke semua orang tetap `abadiops.com`. | DNS sebagian provider internet mencegat `*.workers.dev` (temuan 28 Okt malam), sedangkan domain sendiri tidak. Nama rumah di subdomain dipilih karena jelas. Ini pengecualian dari "tidak ada nama perusahaan di alamat", yang tetap berlaku untuk alamat pintu. |
| 28 Okt 2026 | **`abadiops.com` hanya pintu yang netral; tiap rumah punya alamat `<perusahaan><tugas/site>.abadiops.com`** (keputusan Gabriel, 28 Okt malam). Keputusan ini menggantikan usulan `projekkmb` dan `kmb`.<br>• `sum.abadiops.com`: SUM V2.<br>• `kmbtra.abadiops.com`: KMB V2, yaitu PT KMB di site TRA.<br>• `kmbprojek.abadiops.com`: KMB Project, yaitu PT KMB untuk manpower panggilan proyek.<br>• Rumah berikutnya sesudah migrasi: `kmbbupr.abadiops.com`, PT KMB di site BUPR.<br>Pintu adalah Worker `abadiops-pintu` (`workers/pintu/`). Ia hanya mengenali rumah dari token (ping ke semua GAS sekaligus, jangan menebak), lalu mengantar pengguna dengan `#token=`. Daftar rumah ada di `workers/pintu/wrangler.toml` (konfigurasi), jadi menambah rumah cukup menambah satu baris. | Pintu terpisah dari aplikasi rumah mana pun, sehingga rumah-rumah setara dan rumah baru tinggal ditambahkan. Portal KMB Project awalnya dijadikan pintu karena konsep ini belum ada. |

## Tahapan per rumah

0. **Fondasi:** repo, aturan, project Supabase dan staging, CI.
1. **Inventaris:** untuk setiap aksi dan halaman web dicatat input, pesan, field JSON, baris yang ditulis, dan rumus.
2. **Cermin:** sheet disalin ke skema rumah dan terus diperbarui. Lulus kalau selisihnya nol selama 7 hari.
3. **Pintu:** Worker meneruskan 100% permintaan ke GAS. PWA pindah ke `abadiops.com`, dengan tombol serah-terima token.
4. **Aksi baca pindah** satu per satu, masing-masing lulus uji kembar.
5. **Saklar dua cabang** dinyalakan, setelah semua aksi tulis lulus uji rekam-putar.
6. **GAS dimatikan.** Spreadsheet dikunci sebagai arsip hanya-baca.

## Setelah ketiga rumah selesai pindah

1. Bug dibereskan per rumah, dimulai dari SUM V2.
2. Penyatuan pelan-pelan, satu perilaku per kali, dijaga oleh uji patokan ketiga rumah.
3. **Satu aplikasi offline-first dengan menu lengkap untuk semua peran**, menggantikan dua link (PWA lapangan dan halaman web). Ide Gabriel, 28 Okt 2026.
4. Modul baru masuk: PA, MTBF, dan logistik.

## Belum diputuskan (menunggu Gabriel)

1. **Penambal nomor WO kembar saat saklar dibalik.** Pilihannya:
   - **A.** WO yang lahir di Supabase memakai 4 angka (`WO-YYYYMMDD-XXXX`).
   - **B.** Perubahan kecil di GAS, supaya penjaga nomornya ikut membaca nomor yang sudah dipakai Supabase.
   - **C.** Saklar hanya boleh dibalik saat ganti hari, jam 00.00 WIB.
2. **Batas "sama persis".** Usulan: kelambatan GAS, batas waktu 6 menit, antrean kunci, pesan "server ramai", dan jeda cache token tidak ikut ditiru.
3. **Frontend dipakai ulang atau dibangun ulang.** Pilihannya: file PWA lama dipakai apa adanya, atau dibangun ulang secara 1:1 lalu dibandingkan berdampingan.
4. **Batas waktu WO lama** selama posisi dua cabang. Usulan: 14 hari.
5. **Pemulihan data:** PITR Supabase (sekitar $100/bulan) atau cadangan per jam.
6. **GitHub Pro** (sekitar $4/bulan), supaya PR yang ujinya gagal tidak bisa digabung.
7. **MARProject lama di Vercel** (`mar-application.vercel.app`): dibekukan? Kalau ya, pemantau tiap jamnya juga harus dimatikan.
8. ~~4 token kembar KMB V2 ↔ KMB Project~~ **Sudah diputuskan 28 Okt malam: pilihan C** (lihat baris "Token kembar" di tabel atas). Nomor ini dibiarkan supaya rujukan lama tetap nyambung. Dasarnya: keempat token dibandingkan utuh (20 karakter), sama persis, dan keempatnya akun uji KMB V2 ("L2 Test", "L1 Test", "Test Mechanic Field 1", "Test Mechanic tyre 1"), bukan pengguna sungguhan.
9. ~~Alamat aplikasi SUM V2 dan KMB V2~~ **Sudah diputuskan 28 Okt malam: pilihan A**, yaitu `sum.abadiops.com` dan `kmb.abadiops.com` (lihat tabel atas).
