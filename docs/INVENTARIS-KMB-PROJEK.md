# Inventaris Perilaku Per Aksi — Rumah KMB Project (`kmb-projek`)

Dokumen ini adalah **kontrak inventaris resmi** untuk seluruh aksi backend, format data, pesan error, baris sheet, dan rumus perhitungan pada **Rumah KMB Project**, sesuai mandat Tahap 1 pada [`docs/KEPUTUSAN.md`](file:///d:/marbaru/MARProject/docs/KEPUTUSAN.md).

* **Kode Rumah**: `kmb-projek`
* **Pemegang**: Raka
* **Frontend**: `mar-projek-offline` (SPA / PWA di `abadiops.com`)
* **Backend GAS Live**: `https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec`
* **Spreadsheet ID**: `1lnJo74OShElGEhB…` *(KMB Project Master Sheet; ID lengkap di `MAR-PROJEK-KMB/CLAUDE.md`. Dikoreksi 28 Okt: ID yang tertulis sebelumnya tidak valid, hanya 33 karakter)*. Token dicek hanya di tab `ApiTokens` (`_resolveToken` di `ApiService.js`), dengan cache 30 menit
* **Backend Target**: Supabase skema `kmb_projek`

---

## 1. Ringkasan Aksi API

| # | Nama Aksi | Format Protokol | Kategori | Deskripsi |
|---|---|---|---|---|
| 1 | `ping` | JSON POST | Autentikasi | Cek validitas token & ambil profil |
| 2 | `pull_monitoring` | JSON POST | Baca | Data KPI & ringkasan tim mekanik |
| 3 | `pull_create_refs` | JSON POST | Baca | Katalog unit, komponen, dan tim |
| 4 | `pull_pending` | JSON POST | Baca | Antrean approval L1 & L2 |
| 5 | `pull_active` | JSON POST | Baca | Daftar WO sedang dikerjakan mekanik |
| 6 | `pull_approved` | JSON POST | Baca | Riwayat WO yang sudah disetujui |
| 7 | `pull_rejected` | JSON POST | Baca | Daftar WO ditolak & dibatalkan |
| 8 | `pull_my_wos` | JSON POST | Baca | Daftar WO milik mekanik (Assigned/Pending/Done) |
| 9 | `create_wo` | JSON POST | Tulis | Buat 1 atau banyak WO baru |
| 10 | `submit_work` | JSON POST | Tulis | Penyerahan kerja WO oleh mekanik |
| 11 | `request_transfer` | JSON POST | Tulis | Pengalihan penugasan WO ke rekan |
| 12 | `approve` | JSON POST | Tulis | Approval L1 (SPV) atau L2 (SPT) |
| 13 | `reject` | JSON POST | Tulis | Penolakan WO oleh SPV/SPT |
| 14 | `cancel` | JSON POST | Tulis | Pembatalan WO oleh pembuat/SPV |
| 15 | `dataDashboardTeknis` | Form-URLEncoded | Baca (Router) | Dashboard kondisi tyre & pareto |
| 16 | `riwayatHmUnit` | Form-URLEncoded | Baca (Router) | Riwayat pembacaan Hour Meter unit |
| 17 | `riwayatKmUnit` | Form-URLEncoded | Baca (Router) | Riwayat pembacaan Odometer unit |
| 18 | `koreksiHmWo` / `koreksiKmWo` | Form-URLEncoded | Tulis (Router) | Koreksi anomali angka meter pada WO |
| 19 | `gantiPanelHm` / `gantiPanelKm` | Form-URLEncoded | Tulis (Router) | Catat penggantian panel instrumen |
| 20 | `generate_payroll_report` | JSON POST | Hitung/Baca | Rekapitulasi payroll insentif |

---

## 2. Rincian Aksi & Kontrak Data

### Aksi 1: `ping` (Verifikasi Token & Profil)
* **Tujuan**: Validasi token pengguna saat aplikasi dibuka atau login.
* **Input**:
  ```json
  {
    "action": "ping",
    "token": "<token uji SPV KMB Project>"
  }
  ```
* **Output Berhasil (HTTP 200)**:
  ```json
  {
    "success": true,
    "result": {
      "mechanic_id": "SPV-001",
      "name": "Djarot",
      "role": "supervisor",
      "email": "spv-002@kmb.local",
      "section": "vessel,maintenance",
      "tenant_code": "KMB"
    }
  }
  ```
* **Output Gagal**:
  ```json
  {
    "success": false,
    "error": "Token tidak dikenal / nonaktif"
  }
  ```
* **Sheet Terlibat**: Sheet `ApiTokens` & Sheet `Config_Mechanics` (Hanya Baca).

---

### Aksi 2: `pull_monitoring`
* **Tujuan**: Mengambil ringkasan KPI untuk banner atas dan tabel seluruh mekanik.
* **Input**: `{ "action": "pull_monitoring", "token": "..." }`
* **Output Berhasil**:
  ```json
  {
    "success": true,
    "result": {
      "overall": {
        "mechanics": 20,
        "pending_mechanic_work": 7,
        "pending_l1": 3,
        "pending_l2": 21,
        "approved": 13,
        "periode": "26 Okt – 25 Nov 2026",
        "total_poin": 20.20
      },
      "mechanics": [
        {
          "id": "VES-012",
          "name": "Gusti Raka Pamungkas",
          "section": "vessel",
          "token": "97a4…",
          "pending_mechanic_work": 2,
          "pending_l1": 0,
          "pending_l2": 0,
          "approved": 0
        }
      ]
    }
  }
  ```
* **Sheet Terlibat**: Sheet `WorkOrders`, Sheet `Config_Mechanics`.

---

### Aksi 3: `pull_create_refs`
* **Tujuan**: Menyediakan daftar dropdown unit, katalog pekerjaan, dan mekanik pada form *Create WO*.
* **Output Berhasil**:
  * `units`: `[{ id, name, model, section, type, last_hm, last_km }]`
  * `components`: `[{ id, name, base_points, target_hours, section, std_mechanics }]`
  * `mechanics`: `[{ id, name, section, role }]`
  * `work_conditions`: `[{ key: 'normal', factor: 1.0 }, { key: 'difficult', factor: 1.1 }, { key: 'extreme', factor: 1.2 }]`
* **Sheet Terlibat**: Sheet `Config_Units`, Sheet `JobCatalog`, Sheet `Config_Mechanics`.

---

### Aksi 4–7: `pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`
* **Format Output Item WO**:
  ```json
  {
    "id": "WO-1792975278962-336",
    "wo_number": "WO-20261026-004",
    "status": "pending_l1",
    "section": "maintenance",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "component_name": "Testing And Adjusting - Tyre",
    "work_condition": "normal",
    "location": "workshop",
    "actual_hours": 0.3,
    "target_hours": 2,
    "final_points": 4.84,
    "final_idr": 12100,
    "team": [
      { "name": "Afid Irham", "mechanic_id": "MNT-003", "points": 4.84, "idr": 12100 }
    ],
    "created_by": "Djarot",
    "created_at": "2026-10-26T00:41:00.000Z"
  }
  ```

---

### Aksi 8: `pull_my_wos` (Alur Mandiri Mekanik)
* **Tujuan**: Mekanik melihat WO yang ditugaskan kepadanya tanpa melihat seluruh data rahasia.
* **Pengelompokan Tab**:
  1. `assigned`: Status `pending_mechanic_work`
  2. `pending_approval`: Status `pending_l1` atau `pending_l2`
  3. `done`: Status `approved` (pada periode berjalan)

---

### Aksi 9: `create_wo` (Pembuatan Work Order)
* **Penomoran**: Format `WO-YYYYMMDD-XXX` (3 digit acak/sekuensial harian).
* **Tiga Mode**:
  1. **Bebas**: Setiap joblist bebas memilih unit & pekerjaan.
  2. **1 Unit Banyak Job**: Unit dikunci untuk seluruh joblist.
  3. **1 Job Banyak Unit**: Pekerjaan dikunci untuk seluruh unit terpilih.
* **Payload Input**:
  ```json
  {
    "action": "create_wo",
    "token": "...",
    "op_id": "op-1793080000000-12345",
    "items": [
      {
        "unit_id": "XEVB42002 - ST",
        "component_name": "Testing And Adjusting - Tyre",
        "work_condition": "normal",
        "location": "workshop",
        "team": ["MNT-003", "MNT-008"],
        "is_others": false,
        "keterangan": "Pemeriksaan berkala"
      }
    ]
  }
  ```
* **Sheet yang Ditulis**: Menambah baris baru di sheet `WorkOrders`. Kolom `Status` diisi `pending_mechanic_work`.

---

### Aksi 10: `submit_work` (Lapor Pekerjaan Selesai)
* **Input**:
  ```json
  {
    "action": "submit_work",
    "token": "...",
    "wo_id": "WO-1792975278962-336",
    "actual_hours": 1.5,
    "notes": "Pekerjaan tuntas diganti part baru",
    "tyre_data": null,
    "safety_incident": false,
    "is_redo": false
  }
  ```
* **Perilaku**:
  * Status berubah dari `pending_mechanic_work` menjadi `pending_l1`.
  * Jam aktual (`actual_hours`) dan catatan teknis dicatat ke sheet `WorkOrders`.

---

### Aksi 12: `approve` (Persetujuan L1 & L2)
* **Alur Bertingkat**:
  * **L1 (Supervisor)**: Menyetujui pekerjaan teknis dan jam kerja. Status berubah dari `pending_l1` -> `pending_l2`.
  * **L2 (Superintendent)**: Menyetujui pembukuan poin & rupiah insentif. Status berubah dari `pending_l2` -> `approved`.
* **Rumus Hitungan Poin & Rupiah**:
  $$\text{Final Points} = \text{Base Points} \times \text{Work Condition Factor} \times \text{Timeliness Factor} \times \text{Safety Penalty}$$
  * *Faktor Kondisi*: Shift 1 (`1.0`), Shift 2 (`1.1`), Ekstrim (`1.2`)
  * *Faktor Timeliness*: Selesai $\le$ Target Jam $\rightarrow 1.0$; Selesai $> 100\% - 150\% \rightarrow 0.8$; Lebih lambat $\rightarrow 0.5$.
  * *Redo*: Jika dicentang Redo, pengurang poin berlaku sesuai kebijakan.
  * *Safety Incident*: Jika dicentang Safety Incident, nilai rupiah insentif = Rp 0.
  * *Rupiah per Mekanik*: $\text{Points Per Orang} \times \text{Tarif Rupiah (default Rp 2.500)}$.

---

### Aksi 13 & 14: `reject` & `cancel`
* **Reject**: Dilakukan oleh L1 atau L2. Wajib menyertakan `reason`. Status menjadi `rejected`.
* **Cancel**: Dilakukan jika WO keliru dibuat / dobel. Status menjadi `cancelled`.

---

### Aksi 15–19: Router Teknis & Meter (HM / KM)
* Menggunakan format `Content-Type: application/x-www-form-urlencoded` dengan field `action` dan `data` (JSON string).
* **`riwayatHmUnit` / `riwayatKmUnit`**: Membaca pembacaan meter dari histori WO untuk mendeteksi lonjakan anomali atau mundur.
* **`gantiPanelHm` / `gantiPanelKm`**: Mencatat penggantian odometer/hour meter baru ke sheet `MeterPanelChanges`.

---

### Aksi 20: `generate_payroll_report`
* **Input**:
  ```json
  {
    "action": "generate_payroll_report",
    "token": "...",
    "month": "2026-10",
    "section": "all"
  }
  ```
* **Aturan Periode Penggajian KMB**:
  * Rentang: **Tanggal 26 bulan lalu s/d tanggal 25 bulan terpilih**.
  * Contoh `2026-10`: 26 September 2026 s/d 25 Oktober 2026.
* **Output**: Ringkasan per mekanik (Total WO, Total Jam, Total Poin, Total Insentif Rupiah).

---

## 3. Pesan Error Standar (Huruf Demi Huruf)

Sesuai aturan `AGENTS.md` §1, pesan error berikut tidak boleh diubah susunan karakternya karena PWA mengenalinya lewat pencocokan teks:

1. `Token tidak dikenal / nonaktif` — Dikembalikan saat token salah atau dinonaktifkan.
2. `Anda tidak memiliki hak akses untuk tindakan ini` — Dikembalikan saat mekanik mencoba aksi supervisor.
3. `Work order tidak ditemukan atau status sudah berubah` — Dikembalikan saat terjadi *race condition* approval/submit.
4. `Alasan penolakan wajib diisi` — Dikembalikan saat reject tanpa keterangan.
5. `Nilai meter tidak boleh lebih kecil dari bacaan sebelumnya` — Pagar anti meter mundur saat pembuatan WO.

---

## 4. Status Inventarisasi

- [x] Seluruh 20 aksi terpetakan lengkap (Input, Output, Status Flow).
- [x] Rumus poin, faktor kondisi, dan rupiah didokumentasikan.
- [x] Batasan periode payroll (26 lalu s/d 25 berjalan) terdokumentasi.
- [x] Pesan error teks persis tercatat.
