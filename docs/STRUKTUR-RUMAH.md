# Struktur Tiga Rumah — Pemetaan File

Dokumen ini mencatat pemisahan kode per rumah berdasarkan AGENTS.md §6 dan KEPUTUSAN.md.

## Ringkas

| Rumah | Folder | Pemegang | Status | GAS URL | DB Skema |
|---|---|---|---|---|---|
| **KMB V2** | `workers/kmb/` | Gabriel | Pending | KMB GAS | `db/kmb/` |
| **KMB Project** | `workers/kmb-projek/` | Raka | **Mulai** | KMB Project GAS | `db/kmb_projek/` |
| **SUM V2** | `workers/sum/` | Gabriel | Pending | SUM GAS | `db/sum/` |

---

## File Mana Milik Siapa

### Root Level (Shared / Perlu Pisah)

| File | KMB | KMB-Projek | SUM | Catatan |
|---|---|---|---|---|
| `worker.js` | — | **✓** | — | Hanya KMB Project sekarang |
| `wrangler.toml` | — | **✓** | — | Hanya KMB Project, nanti perlu multi-worker config |
| `package.json` | **Shared** | **Shared** | **Shared** | Mungkin perlu workspace monorepo |
| `tsconfig.json` | **Shared** | **Shared** | **Shared** | Shared build config |

### `src/` — Perlu Dipisah

#### `src/app/` (Next.js Frontend)

| Folder | KMB | KMB-Projek | SUM | Catatan |
|---|---|---|---|---|
| `src/app/masuk/` | — | **✓** | — | Login gate universal, tapi skema token beda |
| `src/app/monitoring/` | — | **✓** | — | Dashboard monitoring |
| `src/app/approval/` | — | **✓** | — | Approval workflows |
| `src/app/lapangan/` | — | **✓** | — | Field mechanic UI |
| `src/app/performa/`, `teknis/`, `reports/` | — | **✓** | — | Analytics & reporting |
| `src/app/admin/`, `koreksi/` | — | **✓** | — | Admin pages |
| `src/app/wo/` | — | **✓** | — | Work Order management |
| `src/app/antrean/` | — | **✓** | — | Queue/antrian |
| `src/app/penerapan/` | — | **✓** | — | Implementation pages |

#### `src/app/api/` (Backend Routes)

| Route | KMB | KMB-Projek | SUM | Catatan |
|---|---|---|---|---|
| `/api/masuk/route.ts` | — | **✓** | — | Token resolution → tenant ID |
| `/api/gas/route.ts` | — | **✓** | — | Proxy ke GAS (KMB Project) |
| `/api/katalog/route.ts` | — | **✓** | — | Return unit/job/mechanic catalog |
| `/api/laporan/route.ts` | — | **✓** | — | Report generation |
| `/api/perintah/route.ts` | — | **✓** | — | Create/update WO |
| `/api/data/` | — | **✓** | — | Data read endpoints |
| `/api/sehat/route.ts` | — | **✓** | — | Health check |
| `_bantu.ts` | **Shared** | **Shared** | **Shared** | Helper utils (bisa di `src/lib/`) |

#### `src/backends/` (Driver Interface)

| File | KMB | KMB-Projek | SUM | Status |
|---|---|---|---|---|
| `src/backends/appscript/` | — | **✓** | — | KMB Project GAS integration |
| `src/backends/supabase/` | — | **✓** | — | KMB Project Supabase integration |
| Nanti: `src/backends/kmb/` | **✓** | — | — | KMB V2 (Gabriel) |
| Nanti: `src/backends/sum/` | — | — | **✓** | SUM V2 (Gabriel) |

#### `src/lib/` (Shared Utils)

| File | Shared? | Catatan |
|---|---|---|
| `auth.ts` | **Shared** | Token resolution, tapi `identitasDariToken()` tahu tentang 3 rumah |
| `backendConfig.ts` | **Shared** | BACKEND_DRIVER setting, tapi routing per rumah via tenant ID |
| `tenantRouter.ts` | **Shared** | Tenant routing logic |
| Lainnya | **Shared** | DB conn, utils, types, dll |

#### `src/domain/` (Domain Models)

| File | Shared? | Catatan |
|---|---|---|
| Semua | **Shared** | Interface & type untuk WO, Mechanic, Unit, dll — sama untuk ketiga rumah |

#### `src/pwa/` (PWA Utilities)

| File | Shared? | Catatan |
|---|---|---|
| Semua | **Shared** | TypeScript utilities (bandingPratinjau, kirim, etc.) |

### `db/` — Skema Per Rumah

| Folder | KMB | KMB-Projek | SUM | Status |
|---|---|---|---|---|
| `db/kmb/` | **✓** | — | — | Pending (Gabriel) |
| `db/kmb_projek/` | — | **✓** | — | ✓ Sudah ada (`cermin_sheet.sql`, `rpc_baca.sql`) |
| `db/sum/` | — | — | **✓** | Pending (Gabriel) |
| `db/migrasi/` | **Shared** | **Shared** | **Shared** | Migration scripts |

### `pwa/` — PWA Lama (Salinan 1:1)

| Folder | KMB | KMB-Projek | SUM | Catatan |
|---|---|---|---|---|
| `pwa/kmb/` | **✓** | — | — | Salinan PWA KMB v2 lama |
| `pwa/kmb-projek/` | — | **✓** | — | Salinan PWA KMB Project lama |
| `pwa/sum/` | — | — | **✓** | Salinan PWA SUM lama |

---

## Rencana Pemisahan (Per Tahap)

### Tahap 1: KMB Project (Raka) — **MULAI SEKARANG**
1. Pindahkan `worker.js` → `workers/kmb-projek/worker.js`
2. Pindahkan seluruh `src/app/` → `workers/kmb-projek/src/app/`
3. Pindahkan `src/backends/` → `workers/kmb-projek/src/backends/`
4. Pindahkan `src/app/api/` → `workers/kmb-projek/src/app/api/`
5. **Shared** (`src/lib/`, `src/domain/`, `src/pwa/`, `db/migrasi/`) tetap di root, di-import dengan path relatif `../../src/lib/` dll.
6. Buat `workers/kmb-projek/wrangler.toml` spesifik.
7. Buat `workers/kmb-projek/package.json` atau reuse root `package.json` jika monorepo.

### Tahap 2: KMB V2 (Gabriel)
1. Buat `db/kmb/` dengan skema cermin KMB V2.
2. Buat `workers/kmb/` dengan backend GAS & Supabase untuk KMB V2.
3. Pindahkan PWA KMB v2 lama ke `pwa/kmb/`.

### Tahap 3: SUM V2 (Gabriel)
1. Buat `db/sum/` dengan skema cermin SUM V2.
2. Buat `workers/sum/` dengan backend GAS & Supabase untuk SUM V2.
3. Pindahkan PWA SUM lama ke `pwa/sum/`.

---

## Catatan Penting

- **Token Resolusi Tetap Shared**: File `src/lib/auth.ts` tahu tentang ketiga rumah. Semua route dimulai dari sini untuk tahu tenant mana.
- **Backend Driver Shared**: `src/backends/` interface tetap shared, tapi implementasi per rumah dipindah ke folder rumah masing-masing.
- **DB Schema Unique**: Setiap rumah punya tabel & kolom spesifik, jadi schema harus di-copy & dimodif per rumah.
- **Monorepo Strategy**: Jika pakai root `package.json` + `wrangler.toml` shared, gunakan workspace config atau build script yang smart tentang folder rumah.

---

*Dokumen ini diperbarui saat ada perubahan struktur atau keputusan pembagian file.*
