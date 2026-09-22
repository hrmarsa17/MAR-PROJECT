# 📋 Catatan & Rencana Perbaikan Bug & Refactoring — MARProject

> Dokumen ini memuat daftar inventarisasi bug, celah keamanan multi-tenant, potensi race condition, dan optimasi performa yang telah dianalisis pada sistem MARProject.
> Gunakan dokumen ini sebagai panduan kerja dan checklist perbaikan.

---

## 🔴 1. Prioritas Tinggi (Race Condition, Keamanan & Integritas Bisnis)

### [x] 1.1 Race Condition pada Permintaan Transfer (`src/domain/transfer.ts`)
- **Lokasi:** `src/domain/transfer.ts` (baris 104–131)
- **Status:** Selesai diperbaiki (kueri tim dipindahkan setelah status direbut & dikunci).

---

### [x] 1.2 Validasi Keanggotaan Tim & Multi-Tenant pada Pembuatan WO (`src/domain/workOrder.ts`)
- **Lokasi:** `src/domain/workOrder.ts` (baris 158–164)
- **Status:** Selesai diperbaiki (validasi tenant_id dan is_active ditambahkan sebelum insert).

---

### [x] 1.3 Pengecekan Otorisasi Cakupan Section pada Approval (`src/domain/approval.ts`)
- **Lokasi:** `src/domain/approval.ts` (`approveL1`, `approveL2`, `tolakWo`, `kembalikanWo`)
- **Status:** Selesai diperbaiki (pastikanBolehSection dipanggil di semua titik keputusan approval).

---

### [ ] 1.4 Optimasi Penomoran Batch WO (`src/domain/workOrder.ts`)
- **Lokasi:** `src/domain/workOrder.ts` (baris 130–133)
- **Masalah:**
  Saat membuat banyak WO sekaligus dalam satu grup (`m.blok`), fungsi `next_wo_number()` dipanggil terpisah di setiap iterasi loop.
- **Dampak:**
  Bila terjadi benturan konkurensi di loop yang panjang, nomor WO berpotensi menghasilkan *gap* atau waktu eksekusi batch meningkat.
- **Rencana Perbaikan:**
  Ambil blok nomor sekaligus dari sequence/counter database di awal atau pastikan transaksi membungkus penghitung dengan isolasi ketat.

---

## 🟡 2. Prioritas Sedang (Performa, Error Resilience & Zona Waktu)

### [x] 2.1 Eliminasi N+1 Query Tarif Mekanik (`src/domain/nilaiEfektif.ts`)
- **Lokasi:** `src/domain/nilaiEfektif.ts` (baris 111–126)
- **Status:** Selesai diperbaiki (disederhanakan menjadi single query berbasis array ANY).

---

### [x] 2.2 Penanganan Audit Sesi Asinkron (`src/lib/auth.ts`)
- **Lokasi:** `src/lib/auth.ts` (baris 85)
- **Status:** Selesai diperbaiki (ditambahkan .catch(() => {}) agar tidak memicu unhandled rejection).

---

### [ ] 2.3 Resiliensi Error Parser `bigint` (`src/lib/db.ts`)
- **Lokasi:** `src/lib/db.ts` (baris 159–168)
- **Masalah:**
  Parser `bigint` melempar `throw new Error(...)` langsung di tingkat driver database jika angka melebihi batas `Number.isSafeInteger`.
- **Dampak:**
  Aplikasi berhenti total dan melempar *crash* yang tidak ramah ke pengguna jika data besar/tidak terduga masuk.
- **Rencana Perbaikan:**
  Beri penanganan yang aman (misal konversi ke BigInt/string jika di luar safe integer) atau tangani dengan pesan error yang tertangkap di layer domain.

---

### [ ] 2.4 Penyelarasan Zona Waktu Operasional Lapangan (WIB vs Serverless UTC) (`src/domain/kueriPerforma.ts` & `src/domain/shift.ts`)
- **Lokasi:** `src/domain/kueriPerforma.ts` (`woTerbaru:205-207`) & `src/domain/shift.ts`
- **Masalah:**
  Kueri "Work Order Terbaru" menggunakan `new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0)`. Di Vercel (UTC), jam 06:00 UTC adalah 13:00 WIB.
- **Dampak:**
  Pekerjaan shift 1 lapangan (pagi hari 06:00–12:59 WIB) dianggap tanggal kemarin oleh server Vercel, sehingga tabel "Work Order Terbaru" di dashboard tampak kosong.
- **Rencana Perbaikan:**
  Pastikan perhitungan jam shift dikonversi eksplisit ke zona waktu operasional tambang/lapangan (`Asia/Jakarta` / UTC+7).

---

## 🟢 3. Prioritas Rendah (Validasi Input & DX / Testing)

### [x] 3.1 Pembatasan Ukuran Array Zod Payload (`src/app/api/perintah/route.ts`)
- **Lokasi:** `src/app/api/perintah/route.ts` (skema `Blok`)
- **Status:** Selesai diperbaiki (ditambahkan .max(50) pada teamMechanicIds).

---

### [ ] 3.2 Penanganan Null/Undefined pada `angka()` (`src/lib/db.ts`)
- **Lokasi:** `src/lib/db.ts` (baris 189–196)
- **Masalah:**
  Fungsi `angka()` langsung melempar error saat menerima `null`/`undefined`. Di beberapa kolom opsional, pemanggil seharusnya diarahkan memakai `angkaAtau(nilai, default)`.
- **Rencana Perbaikan:**
  Pastikan seluruh pemanggil kolom yang berpotensi `null` di domain logic menggunakan `angkaAtau()` secara konsisten.

---

### [x] 3.3 Pesan Error Menyesatkan pada Validasi Tim di Override (`src/domain/override.ts`)
- **Lokasi:** `src/domain/override.ts` (baris 165–171)
- **Status:** Selesai diperbaiki (validasi bilangan bulat positif dipisah sebelum Set).

---

### [x] 3.4 Mocking Database pada Unit Test Kesehatan (`tests/sehat.test.ts`)
- **Lokasi:** `tests/sehat.test.ts` (baris 59–66)
- **Status:** Selesai diperbaiki (mock kueri sql ditambahkan sehingga test selalu stabil).

---

## 🚀 4. Integrasi Multi-Tenant PT SUM & PT KMB
- **Status:** Selesai diterapkan & diverifikasi.
- **Fitur & Perbaikan:**
  - Migrasi 011: Dukungan kolom `share` pada `work_order_team`.
  - Migrasi 012: Pendaftaran tenant `SUM` di tabel `tenants`.
  - Master Data & Dummy SUM: 94 Jobs/Komponen (`COM-001` s/d `COM-094`), 4 Unit, 2 Sections, 5 Akun Pengguna/Mekanik.
  - UI Navbar: Menampilkan lencana dan identitas PT (`PT KMB` vs `PT SUM`) tepat di bawah judul *Mechanic Activity Report*.
  - Pemisahan isolasi tenant penuh di lapisan basis data & otentikasi sesi token.

