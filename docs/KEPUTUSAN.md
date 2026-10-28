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
