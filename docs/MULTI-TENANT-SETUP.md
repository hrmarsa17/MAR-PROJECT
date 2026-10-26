# PANDUAN: MENAMBAH TENANT BARU (MULTI-TENANT BY TOKEN)

Aplikasi MAR menggunakan satu basis kode dan satu database untuk banyak sistem (KMB, SUM, dll). Pengguna login via token unik → sistem mengenali tenant → data terisolasi per tenant.

---

## 1. KONSEP MULTI-TENANT

### Arsitektur

```
┌─────────────────────────────────────────┐
│        Satu Aplikasi Next.js            │
│        Satu Database PostgreSQL         │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    ┌───▼──┐      ┌──▼──┐
    │ KMB  │      │ SUM  │
    │(id=1)│      │(id=2)│
    └──────┘      └──────┘
```

### Token & Identitas

- **Format Token**: `{tenant_code}-{random}` (misal: `kmb-a1b2c3def`, `sum-x9y8z7ijk`)
- **Penyimpanan**: Tabel `api_tokens` menyimpan token **terbaca** (tidak di-hash), terikat ke `mechanics` dan `tenants`
- **Resolusi**: Login → `identitasDariToken()` → ambil `tenant_id`, `tenant_code`, `mechanic_id` → routing ke halaman sesuai peran

### Isolasi Data

Setiap tabel utama memiliki kolom `tenant_id` yang referensi ke tabel `tenants`:
- `work_orders(tenant_id)`
- `mechanics(tenant_id)`
- `units(tenant_id)`
- `jobs(tenant_id)`
- `pay_rates(tenant_id)`
- dll

Query selalu menyertakan filter `WHERE tenant_id = ...` untuk memastikan data tidak tercampur.

---

## 2. LANGKAH-LANGKAH MENAMBAH TENANT BARU

### Langkah 1: Tambah Record di Tabel `tenants`

Jalankan SQL di database PostgreSQL:

```sql
INSERT INTO tenants (code, name, timezone)
VALUES ('GARA', 'GARA — Garage Management', 'Asia/Jakarta');
```

**Catatan:**
- `code`: Kode unik tenant (uppercase), dipakai di token prefix dan routing
- `name`: Nama display di UI (bisa berisi spasi dan karakter khusus)
- `timezone`: Zona waktu untuk laporan dan perhitungan shift

Verifikasi dengan:
```sql
SELECT id, code, name FROM tenants WHERE code = 'GARA';
```

Catat `id` yang diterbitkan (misal id=3). Ini akan dipakai di langkah seed data.

### Langkah 2: Seed Data Konfigurasi Tenant

Setiap tenant membutuhkan data awal yang terisolasi. Buat file SQL baru atau gunakan script contoh.

#### Template Minimal Seed Data

```sql
-- Declare variable untuk tenant_id yang baru dibuat
DO $$
DECLARE
  v_tenant smallint;
  v_field  smallint;
  v_ws     smallint;
  v_tyre   smallint;
  v_tarif_junior integer;
  v_tarif_senior integer;
BEGIN

  -- 1. Ambil tenant_id yang baru dibuat
  SELECT id INTO v_tenant FROM tenants WHERE code = 'GARA';

  -- 2. Buat sections (pyraman WO: field, workshop, tyreman)
  INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
  VALUES
    (v_tenant, 'field',    'Field',    'cascade', true,  1),
    (v_tenant, 'workshop', 'Workshop', 'cascade', false, 2),
    (v_tenant, 'tyreman',  'Tyreman',  'flat',    true,  3)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Ambil ID section
  SELECT id INTO v_field FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_ws    FROM sections WHERE tenant_id = v_tenant AND code = 'workshop';
  SELECT id INTO v_tyre  FROM sections WHERE tenant_id = v_tenant AND code = 'tyreman';

  -- 3. Buat pay rates (tarif per jabatan)
  INSERT INTO pay_rates (tenant_id, position, label, idr_per_point, section)
  VALUES
    (v_tenant, 'junior',  'Junior',  2500.00, NULL),
    (v_tenant, 'senior',  'Senior',  3500.00, NULL),
    (v_tenant, 'advisor', 'Advisor', 4500.00, NULL)
  ON CONFLICT (tenant_id, position, section) DO NOTHING;

  SELECT id INTO v_tarif_junior FROM pay_rates 
    WHERE tenant_id = v_tenant AND position = 'junior' LIMIT 1;
  SELECT id INTO v_tarif_senior FROM pay_rates 
    WHERE tenant_id = v_tenant AND position = 'senior' LIMIT 1;

  -- 4. Buat factors (pengali shift, keselamatan, ketepatan waktu)
  INSERT INTO factors (tenant_id, factor_type, factor_key, factor_value, description)
  VALUES
    (v_tenant, 'work_condition', 'normal',      1.0, 'Shift 1'),
    (v_tenant, 'work_condition', 'difficult',   1.2, 'Shift 2'),
    (v_tenant, 'work_condition', 'extreme',     1.5, 'Kondisi Ekstrim'),
    (v_tenant, 'timeliness',     'on_time',     1.0, 'Selesai dalam target jam'),
    (v_tenant, 'timeliness',     'late',        0.8, 'Lewat target sampai 150%'),
    (v_tenant, 'timeliness',     'way_late',    0.5, 'Lewat 150% target'),
    (v_tenant, 'safety',         'no_incident', 1.0, 'Tanpa insiden'),
    (v_tenant, 'safety',         'incident',    0.0, 'Ada insiden — SELURUH WO jadi nol'),
    (v_tenant, 'mtbf',           'first_time',  1.2, 'Perbaikan pertama'),
    (v_tenant, 'mtbf',           'redo',        0.8, 'Kerja ulang')
  ON CONFLICT (tenant_id, factor_type, factor_key) DO NOTHING;

  -- 5. Buat difficulty tiers
  INSERT INTO difficulty_tiers (tenant_id, code, name, multiplier)
  VALUES
    (v_tenant, 'standard', 'Standar',  2.0),
    (v_tenant, 'complex',  'Kompleks', 2.5),
    (v_tenant, 'overhaul', 'Overhaul', 3.0)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 6. Buat unit dummy (minimal 1 unit untuk testing)
  INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, is_active)
  VALUES
    (v_tenant, 'GARA-001', 'Unit Test GARA', 1.0, true),
    (v_tenant, 'GARA-002', 'Unit Workshop', 1.0, true)
  ON CONFLICT (tenant_id, unit_code) DO NOTHING;

  -- 7. Buat mekanik dummy (untuk testing login)
  INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, is_active)
  VALUES
    (v_tenant, 'GARA-M001', 'Mekanik Test', 'mech1@gara.local', 'mechanic', v_tarif_junior, true),
    (v_tenant, 'GARA-L1',   'Supervisor Test', 'l1@gara.local',  'supervisor', v_tarif_senior, true),
    (v_tenant, 'GARA-L2',   'Superintendent Test', 'l2@gara.local', 'superintendent', v_tarif_senior, true)
  ON CONFLICT (tenant_id, mechanic_code) DO NOTHING;

  -- 8. Buat setelan tenant
  INSERT INTO settings (tenant_id, setting_key, setting_value, description)
  VALUES
    (v_tenant, 'periode_payroll_mulai', '16',  'Periode gaji dimulai tanggal ini, berakhir tanggal 15'),
    (v_tenant, 'shift1_mulai',          '06',  'Shift 1 mulai jam (leaderboard harian)'),
    (v_tenant, 'shift2_mulai',          '18',  'Shift 2 mulai jam'),
    (v_tenant, 'ambang_kembar_menit',   '30',  'Selisih jam mulai yang dicurigai kembar'),
    (v_tenant, 'retensi_struk_hari',    '30',  'Umur processed_ops sebelum dipangkas'),
    (v_tenant, 'umur_antrean_hari',     '20',  'Umur maksimum entri outbox di HP')
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  RAISE NOTICE 'Tenant GARA (id=%) seed data created', v_tenant;
END $$;
```

**Referensi lengkap:**
- KMB: lihat `db/seed.sql` (minimal + job catalog lengkap)
- SUM: lihat `db/dummy-sum.sql` (lengkap dengan 10 posisi ban, meter, detail forms)

### Langkah 3: Daftarkan Tenant di App Code

Edit file `src/lib/tenantRouter.ts`:

```typescript
const TENANT_CONFIGS: Record<string, TenantConfig> = {
  KMB: {
    code: 'KMB',
    name: 'KMB — Mechanic Activity Report',
    homePath: '/monitoring',
    isActive: true,
  },
  SUM: {
    code: 'SUM',
    name: 'SUM — Service Unit Management',
    homePath: '/monitoring',
    isActive: true,
  },
  GARA: {
    code: 'GARA',
    name: 'GARA — Garage Management',
    homePath: '/monitoring',
    isActive: true,
  },
};
```

Jalankan build untuk memastikan tidak ada error TypeScript:

```bash
npm run typecheck
```

### Langkah 4: Generate Token untuk Mekanik Baru

#### Opsi A: Menggunakan Script (Recommended)

```bash
npx tsx scripts/buat-token.ts GARA-M001
```

Output:
```
  Mekanik Test  (mechanic)
  TOKEN: gara-a1b2c3d4e

  Token lama orang ini dicabut. Yang ini bisa dibaca lagi kapan saja
  di layar Monitoring — mekanik yang lupa tak perlu token baru.
```

#### Opsi B: Manual INSERT ke Database

```sql
INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
SELECT t.id, m.id, 'gara-manualtoken123', true
  FROM tenants t
  JOIN mechanics m ON m.tenant_id = t.id
 WHERE t.code = 'GARA' AND m.mechanic_code = 'GARA-M001';
```

Verifikasi:
```sql
SELECT token, is_active FROM api_tokens 
 WHERE token LIKE 'gara-%' LIMIT 1;
```

### Langkah 5: Testing & Verifikasi

#### Test 1: Login & Routing

1. Buka aplikasi: `http://localhost:3000` (dev) atau URL produksi
2. Masuk dengan token contoh: `gara-a1b2c3d4e`
3. Verifikasi:
   - Halaman awal sesuai peran (mekanik → `/monitoring`, supervisor/superintendent → `/approval`)
   - Nama tenant terlihat di UI (jika ada penanda)

#### Test 2: Data Isolation

Login dengan token tenant GARA, periksa apakah:
- WO, unit, mekanik, job hanya menampilkan data tenant GARA
- Tidak ada data KMB atau SUM yang bocor

Query manual di database untuk verifikasi isolasi:

```sql
-- Cek work orders per tenant
SELECT wo.id, wo.wo_number, t.code as tenant
  FROM work_orders wo
  JOIN tenants t ON t.id = wo.tenant_id
 WHERE t.code IN ('GARA', 'KMB', 'SUM')
 LIMIT 10;

-- Cek mechanics per tenant
SELECT m.mechanic_code, t.code as tenant
  FROM mechanics m
  JOIN tenants t ON t.id = m.tenant_id
 WHERE t.code IN ('GARA', 'KMB', 'SUM')
 ORDER BY t.code;
```

#### Test 3: Token Resolution (Supabase Backend)

Jika menggunakan `BACKEND_DRIVER=supabase`, verifikasi query di `src/backends/supabase/auth.ts` bekerja:

```sql
SELECT t.mechanic_id, t.tenant_id, tn.code::text AS tenant_code, m.name, m.role::text
  FROM api_tokens t
  JOIN mechanics m ON m.id = t.mechanic_id
  JOIN tenants tn ON tn.id = t.tenant_id
 WHERE t.token = 'gara-a1b2c3d4e'
   AND t.is_active
   AND t.revoked_at IS NULL
   AND (t.expires_at IS NULL OR t.expires_at > now())
   AND m.is_active;
```

Harus mengembalikan tepat 1 baris dengan data tenant GARA.

---

## 3. STRUKTUR DATA PER TENANT

Tabel-tabel yang **WAJIB** memiliki data per tenant:

| Tabel | Deskripsi | Contoh GARA |
|---|---|---|
| `tenants` | Tenant master | 1 baris: GARA |
| `sections` | Kategori WO (field, workshop, tyreman) | 3 baris min |
| `pay_rates` | Tarif per jabatan | 3 baris min (junior, senior, advisor) |
| `factors` | Pengali poin (shift, safety, timeliness, mtbf) | 10 baris min |
| `difficulty_tiers` | Tingkat kesulitan job | 3 baris min (standard, complex, overhaul) |
| `units` | Unit/alat kerja | Min 1 baris dummy |
| `mechanics` | Pengguna sistem | Min 3 baris (mekanik, L1, L2) |
| `api_tokens` | Token login | Min 1 baris per mekanik |
| `settings` | Konfigurasi tenant | Min 6 baris |
| `job_detail_forms` | Struktur form detail (ban, dll) | 3 baris (inspeksi, remove/instal, repair) |
| `jobs` | Katalog pekerjaan | Min 5 baris per section |

Tabel **OPSIONAL** (bisa kosong awalnya):
- `work_orders` — diisi saat pengguna membuat WO
- `work_order_team` — diisi otomatis saat tim ditambah ke WO
- `approvals` — diisi otomatis saat approval
- `mechanic_points` — diisi otomatis saat WO approved
- Tabel audit & history lainnya

---

## 4. PERBEDAAN KMB VS SUM (CONTOH KONKRET)

| Aspek | KMB | SUM |
|---|---|---|
| **Tenant ID** | 1 | 2 |
| **Sections** | field, workshop, tyreman | field, workshop, tyreman |
| **Work Condition Factor** | 1.0 (normal), 1.2 (difficult), 1.5 (extreme) | 1.0, 1.1, 1.2 (lebih halus) |
| **Unit Odometer** | HM (Hour Meter) | KM + HM (dual) |
| **Ban/Tyre Detail Form** | 3 fields (pressure, RTD, temp) | 3 + 9 fields (include remove/instal detail) |
| **Dashboard Teknis** | Ada (10 posisi ban) | Ada (10 posisi ban) |
| **Catalog Jobs** | ~1400 job KMB V2 | Customized untuk SUM |

**Kesimpulan:** Data isolated per tenant memungkinkan mereka punya configurasi, tarif, dan job catalog BERBEDA tanpa perlu branch/fork aplikasi.

---

## 5. TROUBLESHOOT

### Error: "Token tidak dikenal atau tidak berlaku"

**Penyebab:**
1. Token belum dibuat di tabel `api_tokens`
2. Mekanik `is_active = false`
3. Token di-revoke (`revoked_at` bukan NULL)
4. Token sudah expired (`expires_at < now()`)

**Solusi:**
```sql
SELECT token, is_active, revoked_at, expires_at 
  FROM api_tokens 
 WHERE token = 'gara-xxx';

-- Jika perlu reaktifkan
UPDATE api_tokens SET is_active = true, revoked_at = NULL 
 WHERE token = 'gara-xxx';

-- Cek mekanik
SELECT id, is_active FROM mechanics 
 WHERE mechanic_code = 'GARA-M001';
```

### Error: "Data tidak cocok / kosong"

**Penyebab:**
- Seed data belum dijalankan
- `tenant_id` salah saat insert
- Foreign key conflict

**Solusi:**
```sql
-- Cek berapa banyak data per tenant
SELECT t.code, COUNT(s.id) as sections, COUNT(pr.id) as rates, COUNT(m.id) as mechanics
  FROM tenants t
  LEFT JOIN sections s ON s.tenant_id = t.id
  LEFT JOIN pay_rates pr ON pr.tenant_id = t.id
  LEFT JOIN mechanics m ON m.tenant_id = t.id
 WHERE t.code IN ('GARA', 'KMB', 'SUM')
 GROUP BY t.code;
```

### Token Lama Masih Bisa Login

**Penyebab:** Gunakan script `buat-token.ts` yang otomatis mencabut token lama.

**Solusi Manual:**
```sql
-- Cabut semua token lama mekanik
UPDATE api_tokens SET is_active = false, revoked_at = now()
 WHERE mechanic_id = (SELECT id FROM mechanics WHERE mechanic_code = 'GARA-M001')
   AND token != 'gara-tokenbaruterbaru';
```

### Data Tercampur Antara Tenant

**Penyebab:** Query lupa filter `tenant_id`.

**Solusi:**
- Gunakan helper function atau ORM (Drizzle) yang otomatis menambah filter
- Selalu include `WHERE tenant_id = ...` di setiap query
- Periksa `src/lib/dataLayer.ts` untuk reference query pattern yang benar

---

## 6. REFERENSI FILE

| File | Fungsi |
|---|---|
| `src/lib/tenantRouter.ts` | Routing tenant → home path |
| `src/lib/auth.ts` | Fungsi `buatToken()`, `identitasDariToken()` |
| `src/backends/supabase/auth.ts` | Resolve token ke identitas (Supabase) |
| `src/backends/appscript/auth.ts` | Resolve token ke identitas (Apps Script) |
| `scripts/buat-token.ts` | Generate token untuk mekanik |
| `db/seed.sql` | Template seed data KMB |
| `db/dummy-sum.sql` | Template seed data SUM |
| `db/schema.sql` | Skema database lengkap |

---

## 7. CHECKLIST MENAMBAH TENANT BARU

- [ ] INSERT ke tabel `tenants`
- [ ] Jalankan seed SQL (sections, pay_rates, factors, mechanics, units, jobs)
- [ ] Daftarkan di `TENANT_CONFIGS` (tenantRouter.ts)
- [ ] Jalankan `npm run typecheck` (pastikan build OK)
- [ ] Generate token via `npm run token <mechanic_code>`
- [ ] Test login dengan token baru
- [ ] Verifikasi routing ke home path benar
- [ ] Verifikasi data tidak tercampur dengan tenant lain
- [ ] (Opsional) Jalankan `npm test` untuk integration tests

Done! Tenant baru siap dipakai.
