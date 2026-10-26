# Panduan Arsitektur & Setup Multi-Tenant (MAR Project)

Dokumen ini disusun sebagai **panduan utama bagi developer berikutnya** yang akan melanjutkan pengembangan MAR Project, khususnya dalam mengelola, menambah, dan mengembangkan sistem multi-tenant berbasis token.

---

## 1. Filosofi Desain: "Satu Token, Satu Identitas Lengkap"

Sistem MAR (Mechanic Activity Report) dirancang untuk melayani **berbagai tenant (perusahaan/plant/site)** dalam satu infrastruktur terpadu (misalnya: `KMB`, `SUM`, dan tenant lainnya di masa depan) tanpa membuat duplikasi kode aplikasi (*code branching*).

Kunci utama pemisahan tenant terletak pada **TOKEN AKSES**:

```
[ Pengguna Mengetik / Membuka Link dengan Token ]
                      │
                      ▼
            [ Evaluasi Token di Auth ]
                      │
   ┌──────────────────┴──────────────────┐
   ▼                                     ▼
[ Informasi Pengguna ]             [ Informasi Tenant ]
• mechanicId                        • tenantId
• nama                              • tenantCode ('KMB', 'SUM', dll)
• peran (mechanic/L1/L2)            • timezone ('Asia/Jakarta')
• izin menu (performa/teknis/dll)   • backend driver / target API URL
```

### Karakteristik Token:
1. **Zero-Friction UX**: Di lapangan, mekanik atau supervisor cukup mengetik token **satu kali** (atau membuka tautan `?token=<TOKEN>`). Tidak ada form registrasi manual, email konfirmasi, atau kata sandi rumit.
2. **Disimpan Plaintext (Sengaja)**: Sesuai arsitektur KMB V2, token **tidak di-hash** di database/sheet. Alasannya: layar *Monitoring* memiliki fitur bagi Supervisor/Superintendent untuk membacakan kembali token mekanik yang lupa di lapangan. Keamanan dijaga oleh pembatasan hak akses role, bukan oleh *one-way hash*.
3. **Format Token**:
   - Format Ber-Prefix: `<tenant_code>-<karakter_acak>` (contoh: `kmb-dnjasdians`, `sum-sdan3i12d`, `sum-maman0123`).
   - Format Legacy / Hex: 20 karakter hex (contoh: `52fdb552231348ffb14a`), dipetakan otomatis ke tenant default (`KMB`).

---

## 2. Dua Mode Backend (Hybrid Architecture)

MAR Project mendukung dua jenis *driver* backend yang dapat dipilih melalui variabel lingkungan `BACKEND_DRIVER`:

```
                    ┌─────────────────────────┐
                    │    Frontend / Worker    │
                    │  (Cloudflare / Next.js) │
                    └────────────┬────────────┘
                                 │
                   identitasDariToken(token)
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
[ Mode 1: Supabase / PostgreSQL ]             [ Mode 2: Google Apps Script ]
(BACKEND_DRIVER=supabase)                     (BACKEND_DRIVER=appscript)
• 1 Database Tunggal                          • Tiap Tenant Punya 1 Sheet
• Kolom `tenant_id` di tiap tabel             • Tiap Tenant Punya Web App URL
• Penegakan isolasi via Row-Level Security    • Di-route via prefix token / config
```

### Mode 1: PostgreSQL / Supabase
- Menggunakan skema relasional di [`db/schema.sql`](file:///d:/marbaru/MARProject/db/schema.sql).
- Tabel utama [`tenants`](file:///d:/marbaru/MARProject/db/schema.sql#L43-L49):
  ```sql
  CREATE TABLE tenants (
    id          smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    code        citext UNIQUE NOT NULL,          -- 'KMB', 'SUM'
    name        text NOT NULL,                   -- 'PT KMB Energi', 'PT SUM Jaya'
    timezone    text NOT NULL DEFAULT 'Asia/Jakarta',
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  ```
- **Prinsip Isolasi Data**:
  - Semua tabel operasional (`mechanics`, `sections`, `units`, `unit_models`, `pay_rates`, `work_orders`, `api_tokens`) **WAJIB** memiliki foreign key `tenant_id REFERENCES tenants(id)`.
  - Tidak ada query `SELECT`, `UPDATE`, atau `DELETE` transaksi yang boleh dijalankan tanpa klausa `WHERE tenant_id = :tenantId`.

### Mode 2: Google Apps Script (Google Sheets)
- Digunakan untuk integrasi langsung dengan spreadsheet operasional yang sudah berjalan di lapangan.
- Setiap tenant memiliki file Google Spreadsheet mandiri (beserta deployment Google Apps Script Web App masing-masing).
- Panggilan backend diarahkan ke URL Apps Script yang sesuai dengan tenant pengguna.

---

## 3. Alur Kerja Resolusi Token (Token Resolution Flow)

File rujukan implementasi:
- [`src/lib/auth.ts`](file:///d:/marbaru/MARProject/src/lib/auth.ts) — Pintu gerbang utama resolusi token
- [`src/backends/appscript/auth.ts`](file:///d:/marbaru/MARProject/src/backends/appscript/auth.ts) — Resolusi untuk backend Apps Script
- [`src/backends/supabase/auth.ts`](file:///d:/marbaru/MARProject/src/backends/supabase/auth.ts) — Resolusi untuk backend Supabase
- [`src/lib/backendConfig.ts`](file:///d:/marbaru/MARProject/src/lib/backendConfig.ts) — Konfigurasi routing URL dan driver

### Logika Resolusi Identitas:

```typescript
// Contoh logika di src/lib/auth.ts
export async function identitasDariToken(
  token: string | null | undefined,
  sistemAtauTx?: string | Tx,
): Promise<Identitas> {
  const sistem = typeof sistemAtauTx === 'string' ? sistemAtauTx : undefined;
  
  // 1. Jika sistem eksplisit KMB atau SUM, arahkan ke Google Apps Script
  if (sistem === 'KMB' || sistem === 'SUM') {
    return identitasDariTokenAppsScript(token, sistem);
  }

  // 2. Evaluasi berdasarkan driver backend aktif
  if (pakaiAppsScript()) {
    return identitasDariTokenAppsScript(token);
  }
  
  // 3. Fallback ke PostgreSQL / Supabase
  return identitasDariTokenSupabase(token);
}
```

### Hasil Resolusi Identitas (`Identitas` Interface):
```typescript
export interface Identitas {
  mechanicId: number;
  tenantId: number;
  tenantCode: string;               // 'KMB', 'SUM', dll.
  nama: string;
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  bolehLihat: {
    performa: boolean;
    teknis: boolean;
    report: boolean;
  };
  bolehAdmin: boolean;
}
```

---

## 4. Panduan Menambahkan Tenant Baru

Berikut adalah langkah-langkah praktis jika Anda ingin menambahkan tenant baru (misalnya: tenant **`ABC`** untuk **PT Antara Bangun Cipta**).

---

### Skenario A: Menambah Tenant pada Database PostgreSQL / Supabase

#### 1. Daftarkan Tenant Baru di Tabel `tenants`
```sql
INSERT INTO tenants (code, name, timezone)
VALUES ('ABC', 'PT Antara Bangun Cipta', 'Asia/Makassar')
RETURNING id;
-- Misalkan ID yang dihasilkan adalah 3
```

#### 2. Buat Tarif Poin (Pay Rates) Khusus Tenant Tersebut
```sql
INSERT INTO pay_rates (tenant_id, position, label, idr_per_point)
VALUES
  (3, 'junior', 'Mekanik Junior ABC', 2500.00),
  (3, 'senior', 'Mekanik Senior ABC', 3500.00),
  (3, 'advisor', 'Technical Advisor ABC', 5000.00);
```

#### 3. Daftarkan Section & Katalog Unit
```sql
-- Section
INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
VALUES
  (3, 'field', 'Field Maintenance ABC', 'cascade', true, 1),
  (3, 'workshop', 'Workshop ABC', 'cascade', false, 2),
  (3, 'tyreman', 'Tyre Team ABC', 'flat', true, 3);

-- Model & Unit
INSERT INTO unit_models (tenant_id, code, name, section_id)
VALUES (3, 'dt-volvo', 'Volvo FMX 440', 1);

INSERT INTO units (tenant_id, unit_code, unit_name, brand, model_type, unit_factor, odometer)
VALUES (3, 'ABC-DT01', 'DT-01', 'Volvo', 'FMX 440', 1.0, 'HM');
```

#### 4. Daftarkan User & Generate Token
Gunakan pola `<tenant_code>-<acak>` (misal `abc-...`):
```sql
-- Supervisor (L1)
INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report)
VALUES (3, 'ABC-SPV-01', 'Budi Santoso', 'supervisor', 2, true, true, true)
RETURNING id; -- Misal id = 101

INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
VALUES (3, 101, 'abc-spvbudi01', true);

-- Superintendent (L2)
INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id, may_view_performance, may_view_technical, may_view_report, may_admin)
VALUES (3, 'ABC-SPT-01', 'Hendra Wijaya', 'superintendent', 3, true, true, true, true)
RETURNING id; -- Misal id = 102

INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
VALUES (3, 102, 'abc-spathendra', true);

-- Mekanik
INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id)
VALUES (3, 'ABC-MCH-01', 'Agus Supriadi', 'mechanic', 1)
RETURNING id; -- Misal id = 103

INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
VALUES (3, 103, 'abc-agusmech1', true);
```

---

### Skenario B: Menambah Tenant pada Mode Google Sheets / Apps Script

Jika tenant baru menggunakan Google Sheets terpisah:

#### 1. Salin Template Spreadsheet MAR
1. Buat salinan dari Google Spreadsheet master MAR.
2. Pastikan sheet wajib tersedia:
   - `Config_Mechanics` (Daftar mekanik, role, perizinan)
   - `ApiTokens` (Kolom `token`, `mechanic_id`, `is_active`)
   - `Katalog_Unit` (Daftar unit dan model)
   - `Job_Catalog` (Katalog job dan komponen)
   - `Trans_WO` (Penyimpanan transaksi Work Order)

#### 2. Deploy Apps Script Web App
1. Buka menu **Extensions > Apps Script** pada spreadsheet baru.
2. Klik **Deploy > New Deployment**.
3. Pilih tipe **Web App**:
   - **Execute as**: `Me (email pembuat)`
   - **Who has access**: `Anyone` *(Wajib Anyone agar worker/server Next.js bisa memanggil endpoint via HTTP POST)*.
4. Salin URL Web App yang berawalan `https://script.google.com/macros/s/AKfycb.../exec`.

#### 3. Daftarkan URL di Konfigurasi Routing
Buka file [`src/lib/backendConfig.ts`](file:///d:/marbaru/MARProject/src/lib/backendConfig.ts) dan tambahkan mapping URL tenant baru:

```typescript
// src/lib/backendConfig.ts

export const APPSCRIPT_URL_KMB = 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';
export const APPSCRIPT_URL_SUM = 'https://script.google.com/macros/s/AKfycb.../exec'; // URL Apps Script SUM
export const APPSCRIPT_URL_ABC = 'https://script.google.com/macros/s/AKfycb.../exec'; // URL Apps Script ABC baru

export function dapatkanAppscriptUrl(token?: string | null): string {
  if (!token) return APPSCRIPT_URL_KMB;
  
  const tokenBersih = token.trim().toLowerCase();
  
  // Routing berdasarkan prefix token
  if (tokenBersih.startsWith('sum-') || tokenBersih.startsWith('sum')) {
    return APPSCRIPT_URL_SUM;
  }
  if (tokenBersih.startsWith('abc-') || tokenBersih.startsWith('abc')) {
    return APPSCRIPT_URL_ABC;
  }
  
  // Default tenant
  return APPSCRIPT_URL_KMB;
}
```

#### 4. Daftarkan Token di Sheet `ApiTokens` Tenant Tersebut
Tambahkan baris pada sheet `ApiTokens`:
- `token`: `abc-spvbudi01`
- `mechanic_id`: `101`
- `is_active`: `TRUE`

---

## 5. Integrasi Frontend & Cloudflare Worker

Dalam file [`worker.js`](file:///d:/marbaru/MARProject/worker.js) atau aplikasi SPA Next.js:

1. **Penerimaan Token dari Client**:
   Pengguna dapat mengakses via:
   - URL: `https://abadiops.com/?token=abc-spvbudi01`
   - Form Login Gate: Pengguna mengetik `abc-spvbudi01` di halaman `/masuk`.
2. **Ekstraksi State & Branding Dinamis**:
   Ketika `action: 'ping'` atau `/api/masuk` dipanggil:
   - Server mengembalikan `tenantCode` (misal: `ABC`).
   - Frontend dapat menyesuaikan logo, nama portal di navbar (`ABC PORTAL - Mechanic Activity Report`), serta menyaring daftar dropdown unit dan mekanik khusus tenant tersebut.
3. **Penyimpanan di Client**:
   - Token disimpan di `localStorage.getItem('mar_token')` dan cookie sesi `mar_token`.
   - Parameter `tenant` dapat disimpan di `localStorage.getItem('mar_tenant')` sebagai referensi UI.

---

## 6. Tujuh Aturan Emas Keamanan Multi-Tenant (Golden Rules)

Bagi developer yang menulis kode baru di repository ini, **wajib mematuhi 7 prinsip berikut**:

1. **JANGAN PERNAH Percaya `tenantId` dari Request Body / Frontend**
   - Frontend **tidak boleh** menentukan tenant sendiri dengan mengirim `{ tenant_id: 2 }`.
   - `tenantId` **HARUS SELALU** diekstrak di server melalui `identitasDariToken(token)`.
2. **Kueri Database Wajib Memfilter Tenant Sebelum `LIMIT` / `PAGINATION`**
   - Salah: `SELECT * FROM work_orders LIMIT 50` (Akan membocorkan WO tenant lain!).
   - Benar: `SELECT * FROM work_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`.
3. **Validasi Foreign Key Relasi Silang Tenant**
   - Saat membuat WO atau menetapkan tim mekanik, pastikan `unit_id`, `job_id`, dan `mechanic_id` yang dipilih benar-benar milik `tenant_id` yang sama. Jangan biarkan unit milik KMB dipilih di WO milik SUM.
4. **Isolasi Dropdown Form**
   - API pembuat WO (misal `/api/katalog` atau `pull_katalog`) hanya boleh mengembalikan unit, section, dan daftar mekanik yang memiliki `tenant_id` sesuai token pemanggil.
5. **Approval Berjenjang Tetap Dibatasi Tenant**
   - Supervisor L1 dari tenant SUM hanya boleh menyetujui WO yang berstatus `PENDING_L1` **dan** memiliki `tenant_id = SUM`.
   - Tidak boleh ada persetujuan lintas tenant dalam kondisi apa pun.
6. **Penanganan Zona Waktu Per Tenant**
   - Setiap tenant memiliki kolom `timezone` di tabel `tenants` (misal `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`).
   - Penghitungan cut-off shift, over-target jam kerja, dan laporan payroll wajib mengonversi timestamp UTC ke zona waktu tenant bersangkutan.
7. **Jaga Konsistensi Format Token**
   - Selalu gunakan konvensi `<tenant_code>-<karakter_acak>` untuk token baru.
   - Jangan izinkan dua tenant berbeda memiliki prefix yang bertabrakan.

---

## 7. Rujukan Data Uji Siap Pakai (Testing Tokens)

Berikut adalah daftar token uji yang sudah terdaftar di database dan spreadsheet untuk verifikasi multi-tenant:

| Tenant | Peran | Nama | Token Uji | File Rujukan Dummy |
|---|---|---|---|---|
| **KMB** | L1 (Supervisor) | Supv KMB | `52fdb552231348ffb14a` / `kmb-dnjasdians` | [`db/dummy-lengkap.sql`](file:///d:/marbaru/MARProject/db/dummy-lengkap.sql#L131) |
| **KMB** | L2 (Superintendent) | Supt KMB | `kmb-mgr1234567` | [`db/dummy-lengkap.sql`](file:///d:/marbaru/MARProject/db/dummy-lengkap.sql#L132) |
| **KMB** | Mekanik Field | Mekanik 1 KMB | `kmb-m1satu1234` | [`db/dummy-lengkap.sql`](file:///d:/marbaru/MARProject/db/dummy-lengkap.sql#L133) |
| **SUM** | L1 (Supervisor) | Maman (L1) | `sum-maman0123` | [`db/dummy-sum.sql`](file:///d:/marbaru/MARProject/db/dummy-sum.sql#L309) |
| **SUM** | L2 (Superintendent) | Pandu (L2) | `sum-sdan3i12d` | [`db/dummy-sum.sql`](file:///d:/marbaru/MARProject/db/dummy-sum.sql#L308) |
| **SUM** | Mekanik Field | Ahmad Fauzi | `sum-ahmad0123` | [`db/dummy-sum.sql`](file:///d:/marbaru/MARProject/db/dummy-sum.sql#L310) |
| **SUM** | Mekanik Tyre | Dani Pratama | `sum-dani01234` | [`db/dummy-sum.sql`](file:///d:/marbaru/MARProject/db/dummy-sum.sql#L313) |

---
*Dokumen ini dibuat secara otomatis untuk memastikan kesinambungan arsitektur MAR Project. Jika ada perubahan skema database atau penambahan driver baru, selalu perbarui dokumen ini bersamaan dengan migrasi SQL.*
