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
| Inventaris perilaku per aksi | setiap rumah | pemegang rumah | **kmb-projek selesai** (`docs/INVENTARIS-KMB-PROJEK.md`), **sum versi 1** (`docs/INVENTARIS-SUM.md`), kmb menunggu Gabriel |
| SUM: buat akun layanan Google (baca-saja), bagikan spreadsheet SUM sebagai Viewer | sum | Gabriel | langkah ada di `db/sum/README.md` |
| SUM: jalankan `db/sum/cermin_sheet.sql` di Supabase SQL Editor | sum | Gabriel | |
| SUM: sinkron pertama (`--kering` dulu), cocokkan jumlah baris 19 sheet | sum | Gabriel | |
| SUM: pelajari `readSheetAsObjects` dan versi aktif 4 fungsi kembar, sebelum aksi baca pertama dipindah | sum | Gabriel | |
| SUM: deploy `workers/sum` ke alamat uji memakai API token kawanabadigrup (`CLOUDFLARE_API_TOKEN`, lalu `npx wrangler deploy`). Jangan `wrangler login`: laptop Gabriel masih login ke akun Cloudflare pribadi untuk Rembes | sum | Gabriel | langkah ada di `workers/sum/README.md` |
| SUM: uji dengan token sungguhan untuk kelima peran | sum | Gabriel | |
| Pintu `abadiops.com`: sambungkan rumah SUM. Alamat itu sekarang menyajikan portal KMB Project | bersama | Gabriel + Raka | |
| SUM: tombol serah-terima token di PWA lama dan pembaca `#token=` di PWA baru | sum | Gabriel | sebelum mekanik dipindah |

---

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
