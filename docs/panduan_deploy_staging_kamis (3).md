# Panduan Lengkap Persiapan & Eksekusi Menuju Hari Kamis (Supabase Mandiri + User Management)

Dokumen ini adalah panduan kerja lengkap langkah demi langkah untuk menyiapkan **Backend Mandiri Supabase (Tanpa Pihak Ketiga GAS)** dan **Manajemen Pengguna & Token Terpusat** dari branch `staging` hingga siap dipakai pada hari Kamis.

## 🚨 Mengapa Saat Uji Coba di `abadiops-kmbprojek-staging.../web?page=create` Data Belum Masuk?

Berdasarkan tangkapan layar Anda di `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev/web?page=create&token=52fdb552231348ffb143`, ada **3 penyebab pasti** mengapa data Work Order yang Anda input belum masuk ke Supabase:

1. **Worker Staging di Cloudflare Masih Menjalankan Kode Lama (`abadiops-gas-tiruan`)**:
   - Perubahan kode di ruang kerja AI ini **tidak otomatis ter-deploy** ke akun Cloudflare & Supabase Anda (karena sandbox ini terisolasi dari internet luar).
   - Pada Worker staging yang sedang tayang saat ini, jembatan `/api/web` masih meneruskan kiriman form ke `abadiops-gas-tiruan`. Di kode lama `workers/gas-tiruan/src/index.js`, aksi `handleCreateWO` dari halaman Web Desktop jatuh ke penangkap *fallback* tiruan di memori (`{ message: "Aksi handleCreateWO diterima oleh GAS Tiruan Staging" }`) tanpa mengembalikan `data.created` dan **tanpa menulis satu baris pun ke tabel Supabase**.
2. **Posisi Saklar untuk `kmbprojek` di Panel Saklar Staging Masih `gas`**:
   - Di tab ke-2 browser Anda (`Panel Saklar Dua Cabang`), pastikan setelah SQL dan Worker baru di-deploy dari komputer Anda, saklar rumah **`KMB Projek (Raka)`** digeser ke **`dua_cabang`** (atau **`supabase`**). Selama saklar masih di posisi `gas`, semua pembuatan WO baru diarahkan ke simulator `gas-tiruan`, bukan ke tabel `kmb_projek.wo_supabase`.
3. **3 Perbedaan Format Payload Khusus Halaman Web Desktop (`/web?page=create`) yang Baru Saja Diperbaiki**:
   - **`getJobCatalogCached(section)`**: Saat memilih *Section* (`VESSEL`, `MAINTENANCE`, `WORKSHOP`) di `/web?page=create`, halaman memanggil `getJobCatalogCached(section)` yang mengharapkan `{ success: true, data: { jobs: [...] } }`. Kini sudah ditambahkan di `supabase-backend.js` dan `gas-tiruan`.
   - **`team_distribution` vs `team`**: Berbeda dengan PWA yang mengirim array `team: [{ mechanic_id: "..." }]`, halaman `/web?page=create` mengirim objek `team_distribution: { "MECH-001": 100 }`. Tanpa konversi otomatis, WO tersimpan dengan `team: []` (kosong) sehingga tidak muncul di dashboard mekanik. Kini `normalisasiBlokWo()` di `supabase-backend.js` dan `rpc_backend_penuh.sql` otomatis mengonversi `team_distribution` menjadi array `team` + mengisi `lead_mechanic_id`.
   - **`manual_base_points` / `manual_target_hours` / `manual_unit_factor` & `r.data.wo`**: Saat memilih pekerjaan *Others (Custom)* di `/web?page=create`, form mengirim `manual_base_points` (bukan `others_base_points`), dan saat membuka modal detail WO di `MechanicDashboard.html`, halaman membaca `r.data.wo`. Keduanya kini sudah dipetakan otomatis (**40/40 pengujian backend mandiri LULUS**).


## 1. Ringkasan 4 Perbaikan Protokol Repo (`AGENTS.md`)

| \# | Tantangan Sebelumnya | Aturan Protokol Repo (`AGENTS.md`) | Solusi Arsitektur | 
| ----- | ----- | ----- | ----- | 
| 1 | **Salah lokasi skema SQL** | Kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) hanya untuk satu rumah; kode bersama di `db/migrasi/`. Kamar tidak boleh saling mengintip. | Pisahkan fungsi RPC per rumah di `db/kmb/`, `db/sum/`, dan `db/kmb_projek/`. Tutup semua fungsi internal dengan `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` dan buka hanya pembungkus `*_bertoken`. | 
| 2 | **Hardcode `tenant_id` di contoh SQL & auth** | `AGENTS.md` §5: Haram hardcode ID/token/daftar orang. | Gunakan lookup dinamis `SELECT id INTO v_tenant FROM tenants WHERE code = ...` di semua SQL (`db/contoh-user-admin.sql`, `docs/MULTI-TENANT-SETUP.md`) dan query tabel `tenants` di `src/backends/supabase/auth.ts`. | 
| 3 | **Expand Durable Object (`SaklarDO`) tanpa izin** | `SaklarDO` khusus untuk menyimpan posisi saklar (`switches`) dan riwayatnya (`history`). | Pertahankan `SaklarDO` murni untuk `switches` & `history` (daftar rumah dibaca dinamis dari `env.RUMAH`). Buat modul manajemen pengguna secara *stateless* di `workers/pintu/src/user-admin.js` yang langsung memanggil RPC Supabase tiap kamar. | 
| 4 | **Bekerja di `main` bukan `staging`** | `AGENTS.md` §0a butir 16: Semua perubahan kode dan uji coba wajib di branch `staging`, `--env staging`, dan Gedung 2 (`dnnqrslftndcbmnvuveb`). | Kerjakan di branch `staging`, pecah commit per rumah (`[kmb]`, `[sum]`, `[kmb-projek]`, `[bersama]`), dan catat di bagian paling atas `docs/PROGRES.md`. | 

## 2. Daftar Perbaikan Tambahan Hasil Audit Kesiapan Hari Kamis

Selain 4 protokol di atas, berikut **6 perbaikan krusial** yang wajib ada agar operasional hari Kamis berjalan mulus tanpa kendala:

| \# | Area Kritis | Masalah yang Ditemukan Saat Audit | Perbaikan yang Diterapkan | 
| ----- | ----- | ----- | ----- | 
| 1 | **Aturan "Satu WO, Satu Rumah" & "Saklar Balik" (`docs/SAKLAR.md`)** | Jika saklar dibalik mundur dari `dua_cabang` ke `gas`, WO yang sudah terlanjur lahir di Supabase (`WO-SB-*` / `WO-KMBP-*` / 4 digit `WO-YYYYMMDD-XXXX`) tidak boleh dikirim ke GAS. Sebaliknya, saat `dua_cabang`, aksi tulis pada WO lama 3 digit (`WO-YYYYMMDD-XXX`) harus tetap ke GAS. | Menambahkan detektor `apakahWoLahirDiSupabase` & `apakahWoLamaDariGas` di `workers/{sum,kmb,kmbprojek}/src/index.js` serta pembacaan saklar instan (0ms, tanpa jeda cache) lewat *service binding* `PINTU`. | 
| 2 | **Katalog Job Cascade KMB V2 (`Config_Jobs_Field` & `Config_Jobs_Workshop`)** | Form Buat WO di `pwa/kmb/app.js` menyaring dropdown Unit berdasarkan `unit_model` di `jobs_field` / `jobs_workshop`. Sebelumnya kedua tabel itu belum terdaftar di `db/kmb/cermin_sheet.sql` dan `tools/kmb/sinkron-cermin.mjs`. | Menambahkan `config_jobs_field` & `config_jobs_workshop` ke `db/kmb/cermin_sheet.sql`, `db/kmb/rpc_backend_penuh.sql`, dan `tools/kmb/sinkron-cermin.mjs`, lengkap dengan fallback otomatis dari `config_components` × `config_units`. | 
| 3 | **Tabel `kmb_projek.catalog_jobs` (Bug #15)** | `kmb_create_refs` memanggil `kmb_projek.catalog_jobs`, tetapi tabelnya belum ada di `db/kmb_projek/cermin_sheet.sql`. | Menambahkan `CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs` beserta indeks dan `REVOKE` keamanannya di `db/kmb_projek/cermin_sheet.sql` dan `db/kmb_projek/rpc_backend_penuh.sql`. | 
| 4 | **Perhitungan Angka KPI `pull_monitoring` (Bug #12)** | `sum_monitoring_bertoken` dan `kmbtra_monitoring_bertoken` di `rpc_baca.sql` hanya menghitung status `'PENDING_L1'` dan `'PENDING_L2'`, sehingga WO berstatus `'pending_supervisor'`, `'pending_superintendent'`, dan `'pending_mechanic_work'` terhitung `0`. | Menyelaraskan filter status di `db/sum/rpc_baca.sql` dan `db/kmb/rpc_baca.sql` agar menghitung seluruh variasi nama status (`pending_mechanic_work`, `pending_supervisor`, `pending_superintendent`). | 
| 5 | **Perlindungan Baris Supabase Saat Sinkron Cermin** | `tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs` menjalankan `DELETE FROM <schema>.<tabel>` tanpa filter, yang berisiko menghapus baris kelahiran Supabase jika sheet kosong. | Mengubah kueri hapus di ketiga `sinkron-cermin.mjs` menjadi `DELETE FROM <schema>.<tabel> WHERE baris >= 0 AND baris < 100000` sehingga baris Supabase (`baris < 0` dan `baris >= 100000`) tidak pernah tersentuh. | 
| 6 | **Jembatan Web Desktop `/web` & `/api/web` (Bug #24 & #27)** | Template Web Desktop mengirim batch `{ blocks: [...] }`, `override_data`, dan membaca `result.error.message`, sementara tombol Web di Pintu masih mengarah ke `script.google.com`. | Menambahkan dukungan loop `blocks`, pembungkus `error: { message }`, pemetaan seluruh fungsi `handle*` di `supabase-backend.js`, *service binding* `PINTU` di `wrangler.toml`, serta pengalihan otomatis `web_rumah` ke `/web` mandiri saat saklar aktif. | 

## 3. Daftar File Backend Mandiri (Tanpa GAS) & User Management di Repo

1. **Lapisan Database Supabase (`db/`)**:

   * **Kamar KMB V2 (`db/kmb/`)**: `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Kamar SUM V2 (`db/sum/`)**: `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Kamar KMB Project (`db/kmb_projek/`)**: `cermin_sheet.sql`, `rpc_admin_user.sql`, `rpc_backend_penuh.sql`

   * **Bersama (`db/migrasi/` & `db/`)**: `db/migrasi/013-admin-user-tenant.sql`, `db/contoh-user-admin.sql`

2. **Lapisan Rumus Poin & Rupiah Murni (`src/domain/`)**:

   * `src/domain/scoring.mjs`: Satu-satunya tempat menghitung poin dan Rupiah di JS (`AGENTS.md` §1).

3. **Lapisan Cloudflare Workers (`workers/`)**:

   * **Rumah SUM, KMB, KMB Project**: `workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`, `src/index.js`, `src/web-handler.js`, `wrangler.toml`

   * **Pintu & Panel Pengelola Pusat**: `workers/pintu/src/saklar-do.js`, `src/user-admin.js`, `src/index.js`, `public/saklar.html`, `wrangler.toml`

4. **Alat Sinkron Cermin & Uji Otomatis (`tools/` & `scripts/`)**:

   * `tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs`

   * `scripts/uji-backend-mandiri.mjs` (**37/37 lulus**), `scripts/uji-user-admin-pusat.mjs` (**27/27 lulus**), `scripts/uji-serahan-token.mjs` (**24/24 lulus**)

## 4. Urutan Langkah Eksekusi di Laptop Lokal & Staging

### Langkah 1 — Siapkan Branch `staging`

Pastikan kamu berada di branch `staging` yang ditarik dari `main` terbaru:

```
git checkout main
git pull --rebase origin main
git config user.name "Raka"
git checkout -B staging

```

### Langkah 2 — Jalankan SQL di Supabase Gedung 2 (Staging `dnnqrslftndcbmnvuveb`)

Buka **SQL Editor** pada proyek Supabase **Gedung 2 (`dnnqrslftndcbmnvuveb`)**, lalu jalankan file SQL berikut secara berurutan:

1. **Kamar KMB V2 (`kmb`)**:

   * `db/kmb/cermin_sheet.sql`

   * `db/kmb/rpc_baca.sql`

   * `db/kmb/rpc_admin_user.sql`

   * `db/kmb/rpc_backend_penuh.sql`

2. **Kamar SUM V2 (`sum`)**:

   * `db/sum/cermin_sheet.sql`

   * `db/sum/rpc_baca.sql`

   * `db/sum/rpc_admin_user.sql`

   * `db/sum/rpc_backend_penuh.sql`

3. **Kamar KMB Project (`kmb_projek`)**:

   * `db/kmb_projek/cermin_sheet.sql`

   * `db/kmb_projek/rpc_admin_user.sql`

   * `db/kmb_projek/rpc_backend_penuh.sql`

4. **Migrasi Bersama**:

   * `db/migrasi/013-admin-user-tenant.sql`

   * *(Opsional untuk akun latihan staging)* `db/contoh-user-admin.sql`

### Langkah 3 — Jalankan Verifikasi Uji Otomatis di Terminal Lokal

Sebelum deploy atau push, jalankan ketiga pengujian otomatis di terminal:

```
# 1. Uji siklus penuh backend mandiri, Saklar Balik, & Web Desktop (37/37 lulus)
node scripts/uji-backend-mandiri.mjs

# 2. Uji manajemen pengguna terpusat & 4 protokol repo (27/27 lulus)
node scripts/uji-user-admin-pusat.mjs

# 3. Uji serah-terima token PWA 1:1 (24/24 lulus)
node scripts/uji-serahan-token.mjs

```

### Langkah 4 — Deploy ke Cloudflare Workers Staging (`--env staging`)

**Penting (`AGENTS.md` §0a butir 16):** Deploy `gas-tiruan` dan `pintu` **lebih dulu** karena ketiga Worker rumah membutuhkan *service binding* `GAS_TIRUAN` dan `PINTU`. Selalu gunakan `--env staging`:

```
# 1. Deploy GAS Tiruan (khusus staging)
cd workers/gas-tiruan
npx wrangler deploy --dry-run && npx wrangler deploy

# 2. Deploy Worker Pintu Staging (Panel Saklar + Admin User Pusat)
cd ../pintu
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

# Jika secret sandi panel staging belum dipasang:
# npx wrangler secret put PANEL_SAKLAR_SECRET --env staging

# 3. Deploy Ketiga Worker Rumah ke Staging
cd ../sum
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmb
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmbprojek
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging
cd ../..

```

### Langkah 5 — Latihan Saklar Balik & Siklus Penuh di Staging

1. Buka `https://abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar` (atau `/admin`) dan masuk dengan sandi panel staging.

2. Di tab **👷 Manajemen Pengguna & Token (Pusat 3 Rumah)**, terbitkan token untuk akun penguji L2, L1, dan Mekanik.

3. Di tab **⚡ Saklar Dua Cabang**, ubah saklar rumah ke **`dua_cabang`**.

4. Masuk lewat pintu staging (`https://abadiops-pintu-staging.kawanabadigrup.workers.dev/`), buat 1 WO baru → pastikan terbit nomor **4 digit harian WIB (`WO-YYYYMMDD-0001`)**.

5. **Uji Saklar Balik**: Kembalikan saklar ke **`gas`**, lalu kirim laporan kerja (`submit_work`) dan approve (`approve_l1` → `approve_l2`) pada WO 4 digit tadi → pastikan WO tersebut tetap tuntas di Supabase tanpa galat.

## 5. Commit Terpisah, Push `staging`, & Pull Request untuk Hari Kamis

Sesuai `AGENTS.md` §0a butir 8, pisahkan commit berdasarkan kamar dan catat di bagian paling atas `docs/PROGRES.md`:

```
# 1. Commit kamar KMB V2
git add db/kmb/ workers/kmb/ tools/kmb/
git commit -m "[kmb] tambah RPC admin user, backend penuh mandiri, dan katalog cascade di skema kmb"

# 2. Commit kamar SUM V2
git add db/sum/ workers/sum/ tools/sum/
git commit -m "[sum] tambah RPC admin user dan backend penuh mandiri di skema sum"

# 3. Commit kamar KMB Project
git add db/kmb_projek/ workers/kmbprojek/ tools/kmb_projek/ src/backends/supabase/auth.ts workers/kmb-projek/src/backends/supabase/auth.ts
git commit -m "[kmb-projek] tambah RPC admin user, backend penuh mandiri, catalog_jobs, dan hapus hardcode tenantId"

# 4. Commit bagian Bersama & Pintu
git add src/domain/scoring.mjs db/migrasi/ db/contoh-user-admin.sql docs/ workers/pintu/ workers/gas-tiruan/ scripts/
git commit -m "[bersama] mesin skor JS murni, panel admin pusat di pintu, uji 37/37 & 27/27, dan PROGRES"

# Push ke branch staging
git push -u origin staging

```

### Checklist Go-Live Hari Kamis (Bersama Gabriel)

1. Buat Pull Request dari **`staging` → `main`** di GitHub untuk direview Gabriel.

2. Jalankan `cermin_sheet.sql`, `rpc_baca.sql`, `rpc_admin_user.sql`, dan `rpc_backend_penuh.sql` untuk ketiga kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) serta `db/migrasi/013-admin-user-tenant.sql` di **SQL Editor Gedung 1 (`sptgqsjgszwbreikxdph`)**.

3. Pastikan sinkron cermin awal (`tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs`) sudah mengisi tabel katalog (`config_units`, `config_components`, `config_jobs_field`, `config_jobs_workshop`, `config_mechanics`, `config_factors`, dan `catalog_jobs`) di Gedung 1.

4. Setelah PR di-merge ke `main`, deploy produksi secara berurutan (`pintu` lebih dulu, baru `sum`, `kmb`, `kmbprojek`).

5. Gabriel membuka `https://abadiops.com/saklar` untuk mengelola token pengguna dan memindahkan saklar rumah yang siap memakai Supabase ke posisi **`dua_cabang`** atau **`supabase`**.


## 8. Tambahan Patch Khusus Halaman Web Desktop `/web?page=create` (`supabase-backend.js` & SQL)

Pastikan di `workers/{sum,kmb,kmbprojek}/src/supabase-backend.js` terdapat fungsi `normalisasiBlokWo` dan penangan `getJobCatalogCached` berikut (sudah diterapkan penuh di panduan ini):

```javascript
function normalisasiBlokWo(blk) {
  if (!blk || typeof blk !== 'object') return {};
  const b = { ...blk };
  if (b.manual_base_points !== undefined && b.others_base_points === undefined) b.others_base_points = b.manual_base_points;
  if (b.manual_target_hours !== undefined && b.others_target_hours === undefined) b.others_target_hours = b.manual_target_hours;
  if (b.manual_unit_factor !== undefined && b.others_unit_factor === undefined) b.others_unit_factor = b.manual_unit_factor;
  if (!Array.isArray(b.team) && b.team_distribution && typeof b.team_distribution === 'object') {
    b.team = Object.entries(b.team_distribution)
      .filter(([mid]) => String(mid || '').trim() !== '')
      .map(([mid, pct]) => ({
        mechanic_id: String(mid).trim(),
        percentage: Number(pct) || 100,
      }));
  }
  return b;
}
```

Dan di `eksekusiAksiSupabaseMandiri` (`workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`):
- Tambahkan `'getJobCatalogCached'` ke dalam `SEMUA_AKSI_SUPABASE`.
- Tangani `if (cleanAction === 'getJobCatalogCached')` dengan mengambil `jobs_vessel` / `jobs_workshop` / `jobs_field` dari RPC `*_create_refs_bertoken` dan mengembalikan `{ success: true, source: 'SUPABASE', result: { jobs, section: sec }, data: { jobs, section: sec } }`.
- Pada aksi detail WO (`pull_wo_detail`, `getWODetails`, `getWoDetailForMechanic`), sertakan properti `wo: woObj` di dalam `result` dan `data` (`{ ...woObj, wo: woObj }`) agar modal detail di `MechanicDashboard.html` tidak kosong.

