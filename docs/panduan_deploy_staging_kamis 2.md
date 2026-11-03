# Panduan Eksekusi Staging, Backend Mandiri Supabase (Tanpa GAS), & PR Menuju Hari Kamis

Dokumen ini memandu langkah demi langkah penerapan **Backend Mandiri Penuh Tanpa Pihak Ketiga (GAS)** serta **Manajemen Pengguna & Token Terpusat (Admin Panel Gabriel)** dari branch `staging` hingga siap dipakai pada hari Kamis untuk rumah yang mengaktifkan jalur Supabase.

## 1. Ringkasan Arsitektur Backend Mandiri & Penyelesaian 4 Pelanggaran Protokol Repo

| # | Komponen / Tantangan | Implementasi di Dalam Repo (Sesuai `AGENTS.md`) | File Terkait |
|---|---|---|---|
| 1 | **Backend Mandiri Tanpa Pihak Ketiga (GAS)** | Seluruh aksi baca (`ping`, `pull_create_refs`, `pull_monitoring`, `pull_monitoring_daftar`, `pull_wo_detail`, `pull_my_wos`, `pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`, `pull_cancelable`, `pull_transfers`) dan aksi tulis (`create_wo` 4-digit WIB, `submit_work`, `save_override`, `approve_l1`, `approve_l2`, `reject`, `cancel_wo`, `request_transfer`, `approve_transfer`, `reject_transfer`, `report_expired`, `reopen_expired`, `save_push_sub`, serta jembatan `/web` & `/api/web`) dieksekusi langsung oleh Cloudflare Worker + RPC Supabase per kamar tanpa memanggil `script.google.com`. | `src/domain/scoring.mjs`, `workers/{sum,kmb,kmbprojek}/src/supabase-backend.js`, `db/{sum,kmb,kmb_projek}/rpc_backend_penuh.sql` |
| 2 | **Salah lokasi skema (harus per rumah / bersama)** | Dipisah ketat per kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) dan migrasi bersama (`db/migrasi/`). Kamar tidak saling mengintip; semua fungsi internal di-`REVOKE` dari `PUBLIC, anon, authenticated`. | `db/kmb/rpc_admin_user.sql`, `db/sum/rpc_admin_user.sql`, `db/kmb_projek/rpc_admin_user.sql`, `db/migrasi/013-admin-user-tenant.sql` |
| 3 | **Hardcode `tenant_id` di contoh SQL & kode** | Dihapus total. Semua SQL memakai resolusi dinamis `SELECT id INTO v_tenant FROM tenants WHERE code = ...`, dan fallback auth di TypeScript memakai kueri dinamis ke tabel `tenants`. | `db/contoh-user-admin.sql`, `docs/MULTI-TENANT-SETUP.md`, `src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts` |
| 4 | **Expand Durable Object (`SaklarDO`) tanpa izin** | `SaklarDO` tetap murni hanya menyimpan `switches` & `history` saklar (`tag = "v1"`). Daftar rumah dibaca dinamis dari `env.RUMAH` (perbaikan Bug #26). Manajemen pengguna dibangun stateless di `workers/pintu/src/user-admin.js`. | `workers/pintu/src/saklar-do.js`, `workers/pintu/src/user-admin.js`, `workers/pintu/wrangler.toml` |
| 5 | **Bekerja di `main` bukan `staging`** | Seluruh perubahan dikemas dalam 4 commit terpisah (`[kmb]`, `[sum]`, `[kmb-projek]`, `[bersama]`) di branch `staging` dengan konfigurasi `[env.staging]` yang mengarah ke Gedung 2 (`dnnqrslftndcbmnvuveb`). | `abadiops-staging-user-management.patch`, `docs/PROGRES.md` |

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
1. `[kmb] tambah RPC admin user & backend penuh mandiri di skema kmb serta worker`
2. `[sum] tambah RPC admin user & backend penuh mandiri di skema sum serta worker`
3. `[kmb-projek] tambah RPC admin user & backend penuh mandiri kmb_projek serta hapus hardcode tenantId`
4. `[bersama] mesin skor JS murni, panel admin pusat di pintu, uji 24/24 & 27/27, dan PROGRES`

## 3. Langkah 2 — Verifikasi Uji Otomatis Lokal Sebelum Push

Pastikan seluruh pemeriksaan sintaks dan ketiga suite uji otomatis lulus 100%:

```bash
node scripts/uji-backend-mandiri.mjs
# Harus mencetak: Hasil Uji Backend Mandiri Supabase: 24/24 LULUS

node scripts/uji-user-admin-pusat.mjs
# Harus mencetak: Hasil Uji Manajemen Pengguna & Protokol: 27/27 LULUS

node scripts/uji-serahan-token.mjs
# Harus mencetak: 24/24 lulus
```

## 4. Langkah 3 — Pasang Skema SQL di Gedung 2 (Staging `dnnqrslftndcbmnvuveb`)

Sesuai `AGENTS.md` §0a butir 16 dan `docs/GEDUNG-DAN-STAGING.md` §1, jalankan terlebih dahulu di **SQL Editor Gedung 2 (`dnnqrslftndcbmnvuveb`)**:

1. **Kamar KMB V2 (`kmb`)**:
   - Jalankan `db/kmb/rpc_admin_user.sql`
   - Jalankan `db/kmb/rpc_backend_penuh.sql`
2. **Kamar SUM V2 (`sum`)**:
   - Jalankan `db/sum/rpc_admin_user.sql`
   - Jalankan `db/sum/rpc_backend_penuh.sql`
3. **Kamar KMB Project (`kmb_projek`)**:
   - Jalankan `db/kmb_projek/rpc_admin_user.sql`
   - Jalankan `db/kmb_projek/rpc_backend_penuh.sql`
4. **Migrasi Bersama**:
   - Jalankan `db/migrasi/013-admin-user-tenant.sql`
   - *(Opsional untuk data uji awal staging)* Jalankan `db/contoh-user-admin.sql`

Verifikasi keamanan RPC dari luar (tanpa token harus ditolak):

```sql
-- Harus mengembalikan {"success":false,"error":"Token tidak dikenal / nonaktif","source":"SUPABASE"}
SELECT public.sum_admin_daftar_user_bertoken('token-tidak-dikenal');
SELECT public.sum_eksekusi_aksi_bertoken('token-tidak-dikenal', 'create_wo', 'op-1', '{}'::jsonb, NULL);
SELECT public.kmbtra_eksekusi_aksi_bertoken('token-tidak-dikenal', 'create_wo', 'op-1', '{}'::jsonb, NULL);
SELECT public.kmb_eksekusi_aksi_bertoken('token-tidak-dikenal', 'create_wo', 'op-1', '{}'::jsonb, NULL);
```

## 5. Langkah 4 — Deploy ke Cloudflare Workers Staging (`--env staging`)

**PENTING (`AGENTS.md` §0a butir 16):** Selalu sertakan `--env staging` (kecuali untuk `workers/gas-tiruan` yang memang khusus staging). Jangan menjalankan `npx wrangler deploy` tanpa `--env staging`.

```bash
# 1. Deploy GAS Tiruan (khusus staging)
cd workers/gas-tiruan
npx wrangler deploy --dry-run && npx wrangler deploy

# 2. Deploy Ketiga Worker Rumah (dengan Backend Mandiri Supabase) ke Staging
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

## 6. Langkah 5 — Push Branch `staging` & Buat Pull Request untuk Hari Kamis

```bash
git push -u origin staging
```

Buka GitHub `kawanabadigrup/abadiops` dan buat Pull Request dari **`staging` → `main`** untuk direview Gabriel:
- **Judul PR**: `[bersama] Backend Mandiri Penuh Supabase (Tanpa GAS) + Panel Manajemen Pengguna & Token Terpusat`
- **Checklist Saat Go-Live Hari Kamis (Oleh Gabriel)**:
  1. Jalankan `rpc_admin_user.sql` dan `rpc_backend_penuh.sql` untuk masing-masing kamar (`db/kmb/`, `db/sum/`, `db/kmb_projek/`) di **SQL Editor Gedung 1 (`sptgqsjgszwbreikxdph`)**.
  2. Merge PR `staging` ke `main` dan deploy `workers/pintu`, `workers/sum`, `workers/kmb`, serta `workers/kmbprojek`.
  3. Buka `https://abadiops.com/saklar` (atau `https://abadiops.com/admin`):
     - Tab **⚡ Saklar Dua Cabang**: Ubah saklar rumah yang siap ke `dua_cabang` atau `supabase` (seluruh aksi baca, tulis, dan web desktop langsung dilayani oleh Worker + Supabase tanpa GAS).
     - Tab **👷 Manajemen Pengguna & Token (Pusat 3 Rumah)**: Kelola pengguna dan terbitkan token akses rumah yang memakai Supabase.