# Panduan Eksekusi Staging, Migrasi SQL, & PR Menuju Hari Kamis

Dokumen ini memandu langkah demi langkah penerapan **Manajemen Pengguna & Token Terpusat (Admin Panel Gabriel)** dari branch `staging` hingga siap dipakai pada hari Kamis untuk rumah yang mengaktifkan jalur Supabase.

## 1. Ringkasan Penyelesaian 4 Pelanggaran Protokol Repo

| # | Tantangan Sebelumnya | Perbaikan Sesuai Protokol `AGENTS.md` | File Terkait |
|---|---|---|---|
| 1 | Salah lokasi skema (harus per rumah / bersama) | Dipisah per kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) dan migrasi bersama (`db/migrasi/`). Kamar tidak saling mengintip; semua fungsi internal di-`REVOKE` dari `anon`/`authenticated`. | `db/kmb/rpc_admin_user.sql`, `db/sum/rpc_admin_user.sql`, `db/kmb_projek/rpc_admin_user.sql`, `db/migrasi/013-admin-user-tenant.sql` |
| 2 | Hardcode `tenant_id` di contoh SQL & kode | Dihapus total. Semua SQL memakai resolusi dinamis `SELECT id INTO v_tenant FROM tenants WHERE code = ...`, dan fallback auth di TypeScript memakai kueri dinamis ke tabel `tenants`. | `db/contoh-user-admin.sql`, `docs/MULTI-TENANT-SETUP.md`, `src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts` |
| 3 | Expand Durable Object (`SaklarDO`) tanpa izin | `SaklarDO` tetap murni hanya menyimpan `switches` & `history` saklar (`tag = "v1"`). Daftar rumah dibaca dinamis dari `env.RUMAH` (perbaikan Bug #26). Manajemen pengguna dibangun stateless di `workers/pintu/src/user-admin.js`. | `workers/pintu/src/saklar-do.js`, `workers/pintu/src/user-admin.js`, `workers/pintu/wrangler.toml` |
| 4 | Bekerja di `main` bukan `staging` | Seluruh perubahan dikemas dalam 4 commit terpisah (`[kmb]`, `[sum]`, `[kmb-projek]`, `[bersama]`) di branch `staging` dengan konfigurasi `[env.staging]` yang mengarah ke Gedung 2 (`dnnqrslftndcbmnvuveb`) dan `abadiops-gas-tiruan`. | `abadiops-staging-user-management.patch`, `docs/PROGRES.md` |

## 2. Langkah 1 — Terapkan Commit ke Branch `staging` di Laptop Lokal

Jalankan perintah berikut di terminal (Git Bash / PowerShell) pada folder repositori lokal:

```bash
git checkout main
git pull --rebase origin main
git config user.name "Raka"

# Buat / pindah ke branch staging dari main terbaru
git checkout -B staging

# Terapkan 4 commit berurutan dari file patch (atau ekstrak zip di atas repo)
git am abadiops-staging-user-management.patch
```

Empat commit yang akan masuk ke branch `staging`:
1. `[kmb] tambah RPC manajemen pengguna bertoken di skema kmb dan rute worker`
2. `[sum] tambah RPC manajemen pengguna bertoken di skema sum dan rute worker`
3. `[kmb-projek] tambah RPC manajemen pengguna kmb_projek dan hapus hardcode tenantId`
4. `[bersama] panel manajemen pengguna terpusat di pintu, uji 27/27, dan catatan PROGRES`

## 3. Langkah 2 — Verifikasi Uji Otomatis Lokal Sebelum Push

Pastikan seluruh pemeriksaan sintaks dan uji otomatis lulus 100%:

```bash
node scripts/uji-user-admin-pusat.mjs
# Harus mencetak: Hasil Uji Manajemen Pengguna & Protokol: 27/27 LULUS

node scripts/uji-serahan-token.mjs
# Harus mencetak: 24/24 lulus

node --check workers/pintu/src/index.js
node --check workers/pintu/src/user-admin.js
node --check workers/pintu/src/saklar-do.js
node --check workers/sum/src/index.js
node --check workers/kmb/src/index.js
node --check workers/kmbprojek/src/index.js
node --check workers/gas-tiruan/src/index.js
```

## 4. Langkah 3 — Pasang Skema SQL di Gedung 2 (Staging `dnnqrslftndcbmnvuveb`)

Sesuai `AGENTS.md` §0a butir 16 dan `docs/GEDUNG-DAN-STAGING.md` §1, jalankan terlebih dahulu di **SQL Editor Gedung 2 (`dnnqrslftndcbmnvuveb`)**:

1. Jalankan `db/kmb/rpc_admin_user.sql`
2. Jalankan `db/sum/rpc_admin_user.sql`
3. Jalankan `db/kmb_projek/rpc_admin_user.sql`
4. Jalankan `db/migrasi/013-admin-user-tenant.sql`
5. *(Opsional untuk data uji awal staging)* Jalankan `db/contoh-user-admin.sql`

Verifikasi keamanan RPC dari luar (tanpa token harus ditolak, dengan token mekanik biasa harus ditolak):

```sql
-- Harus mengembalikan {"success":false,"error":"Token tidak dikenal / nonaktif","source":"SUPABASE"}
SELECT public.sum_admin_daftar_user_bertoken('token-tidak-dikenal');
SELECT public.kmbtra_admin_daftar_user_bertoken('token-tidak-dikenal');
SELECT public.kmb_admin_daftar_user_bertoken('token-tidak-dikenal');
```

## 5. Langkah 4 — Deploy ke Cloudflare Workers Staging (`--env staging`)

**PENTING (`AGENTS.md` §0a butir 16):** Selalu sertakan `--env staging` (kecuali untuk `workers/gas-tiruan` yang memang khusus staging). Jangan menjalankan `npx wrangler deploy` tanpa `--env staging`.

```bash
# 1. Deploy GAS Tiruan (khusus staging)
cd workers/gas-tiruan
npx wrangler deploy --dry-run && npx wrangler deploy

# 2. Deploy Ketiga Worker Rumah ke Staging
cd ../sum
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmb
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

cd ../kmbprojek
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging

# 3. Deploy Worker Pintu (Panel Saklar & Manajemen Pengguna Terpusat) ke Staging
cd ../pintu
npx wrangler deploy --env staging --dry-run && npx wrangler deploy --env staging
cd ../..
```

Jika secret kata sandi panel staging belum terpasang di `abadiops-pintu-staging`, pasang dengan:

```bash
cd workers/pintu
npx wrangler secret put PANEL_SAKLAR_SECRET --env staging
```

## 6. Langkah 5 — Push Branch `staging` & Buat Pull Request untuk Hari Kamis

```bash
git push -u origin staging
```

Buka GitHub `kawanabadigrup/abadiops` dan buat Pull Request dari **`staging` → `main`** untuk direview Gabriel:
* **Judul PR**: `[bersama] Manajemen Pengguna & Token Terpusat (Panel Admin Pintu + RPC Per Kamar Supabase)`
* **Checklist Saat Go-Live Hari Kamis (Oleh Gabriel)**:
  1. Jalankan `db/kmb/rpc_admin_user.sql`, `db/sum/rpc_admin_user.sql`, dan `db/kmb_projek/rpc_admin_user.sql` di **SQL Editor Gedung 1 (`sptgqsjgszwbreikxdph`)**.
  2. Merge PR `staging` ke `main` dan deploy `workers/pintu`, `workers/sum`, `workers/kmb`, serta `workers/kmbprojek`.
  3. Buka `https://abadiops.com/saklar` (atau `https://abadiops.com/admin`) → klik tab **👷 Manajemen Pengguna & Token (Pusat 3 Rumah)** untuk mengelola pengguna dan menerbitkan token akses rumah yang memakai Supabase.
