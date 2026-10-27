# Progres

Entri terbaru selalu di **atas**. Setiap sesi kerja, baik oleh orang maupun AI, wajib menambah satu entri sebelum push.

Formatnya:

```
### YYYY-MM-DD · Nama (+ AI) · rumah
- Berubah: …
- Belum selesai / berikutnya: …
```

---

## Tugas terbuka

| Tugas | Rumah | Pemegang | Status |
|---|---|---|---|
| Konfirmasi region Supabase adalah Singapura | bersama | Gabriel + Raka | **selesai** (terkonfirmasi `ap-southeast-1` = Singapura) |
| Konfirmasi bahwa spreadsheet `1qHjfIUT…` milik SUM V2 (script `1k_A_KER…`) | sum | Gabriel + Raka | **selesai** (terkonfirmasi script `1k_A_KER…` di `MAR-SUM-v2`) |
| Pindahkan kode MARProject ke cabang arsip, lalu bentuk susunan tiga rumah | bersama | Gabriel + Raka | **arsip selesai** (`archive/marproject`), susunan tiga rumah disiapkan |
| Buat project Supabase untuk staging | bersama | Gabriel + Raka | menunggu pembuatan/koneksi project web console |
| Inventaris perilaku per aksi | setiap rumah | pemegang rumah | **kmb-projek selesai** (`docs/INVENTARIS-KMB-PROJEK.md`), kmb & sum menunggu Gabriel |

---

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
  - Membuat panduan integrasi lengkap untuk Gabriel di [`docs/CATATAN-GABRIEL.md`](file:///d:/marbaru/MARProject/docs/CATATAN-GABRIEL.md) mencakup arsitektur 3 rumah, alur login/token routing, panduan pembuatan skema cermin `kmb` & `sum`, sinkronisasi snapshot, uji kembar, dan protokol kerja harian.
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
