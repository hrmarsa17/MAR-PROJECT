# Spesifikasi Layar — KMB V2 → KMB Project

Berkas di folder ini adalah **kontrak porting per layar**: apa yang ada di layar
KMB V2, kelas CSS dan teks persisnya, dari mana angkanya, dan bagaimana ia
diterjemahkan ke Postgres + Next.js. Semuanya berjejak `file:baris` ke sumber.

**Tujuannya satu:** Gabriel tidak perlu menjelaskan satu pun menu. Kodenya ada.

---

## 1. Kenapa folder ini ada

Layar pertama yang saya bangun (Approval, Create WO) dibuat dari **screenshot**,
padahal sumbernya ada di komputer yang sama. Hasilnya: pemilih tim jadi deretan
tombol, padahal di sumber ia **dropdown berbaris**; dan saya menyebut hasilnya
“1:1” sementara Performa, Reports, Teknis, dan Koreksi HM/KM masih penanda
kosong. Gabriel yang menemukan keduanya.

Metode yang benar, dan yang dipakai di seluruh folder ini:

> Untuk tiap layar: baca `<Layar>.html` untuk **bentuknya**, `<Layanan>.js` untuk
> **angkanya**, lalu port apa adanya. Yang butuh keputusan Gabriel hanya hal yang
> memang **baru** — warna merah, token yang di-hash. Sisanya sudah ada jawabannya
> di repo.

Sumber: `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`, cabang
`feature/token-auth-web`. **BACA SAJA, JANGAN DISENTUH.** Itu sistem yang sedang
membayar orang setiap bulan.

---

## 2. Isi folder

| # | Layar | Berkas | Keadaan |
|---|---|---|---|
| 1 | Dashboard Performa | [`01-PERFORMA.md`](01-PERFORMA.md) | ✅ lengkap |
| 2 | Create Work Order | [`02-CREATE-WO.md`](02-CREATE-WO.md) | ✅ lengkap |
| 3 | Monitoring | [`03-MONITORING.md`](03-MONITORING.md) | ✅ lengkap |
| 3b | Detail Tyre | `03b-DETAIL-TYRE.md` | ⬜ belum ditulis |
| 4 | Approvals | `04-APPROVALS.md` | ⬜ belum ditulis |
| 5 | Teknis | `05-TEKNIS.md` | ⬜ belum ditulis |
| 6 | Koreksi HM & KM | `06-KOREKSI-HM-KM.md` | ⬜ belum ditulis |
| 7 | Reports | `07-REPORTS.md` | ⬜ belum ditulis |

Urutan nomor mengikuti urutan menu di navbar (`Main.html:267-275`), bukan urutan
kepentingan.

---

## 3. Bentuk tiap berkas spek

Ikuti susunan yang sama supaya bisa dibaca berdampingan:

1. **Kepala** — sumber `file` + sasaran di KMB Project
2. **Susunan layar** — pohon blok dengan nomor baris
3. **Per blok** — markup, kelas, teks persis, dari mana isinya
4. **Kontrak backend** — fungsi, definisi angka, saringan berurutan
5. **Terjemahan** — tabel kolom KMB V2 → KMB Project + sketsa SQL
6. **Jebakan yang harus dibawa** — komentar sumber yang merekam kecelakaan nyata
7. **Yang sudah tidak perlu ditiru**
8. **Daftar periksa selesai**

**Aturan menulis:** kalau komentar di sumber menjelaskan *kenapa* sesuatu
berbentuk begitu, **kutip alasannya**, jangan cuma bentuknya. Komentar-komentar
itu adalah catatan kecelakaan; membuang alasannya berarti mengundang kecelakaan
yang sama.

---

## 4. Peta sumber untuk layar yang belum ditulis

Sudah dipetakan — tinggal dibaca dan ditulis.

### 3b. Detail Tyre

| berkas | baris | isi |
|---|---|---|
| `MechanicDashboard.html` | 597-670 | markup 3 bentuk form |
| | 1086-1300 | `tyreReset` · `tyreMuat` · `tyreGambar` · `tyreKumpulkan` |
| `_DetailTyre.js` | seluruh (1.081) | `siapkanFormTyre`, nilai Before, penyimpanan |

Tiga bentuk, **jenisnya ditentukan SERVER** bukan ditebak layar (`:597-601`) —
kalau layar yang memutuskan, web dan PWA bisa berbeda pendapat tentang WO yang
sama:

- **Inspeksi** — tabel 10 posisi × (Pressure / RTD / Suhu) × (Before / After).
  Before terisi sendiri dari catatan terakhir unit, berlatar abu-abu karena bukan
  mekanik yang mengetiknya.
- **Remove / Instal** — satu kesatuan per posisi; pilih posisi dulu, lalu isi
  keduanya.
- **Repair** — tanpa kolom posisi (bannya sudah turun lewat Remove/Instal);
  asal-usulnya terlacak dari nomor seri. Medan: Serial No · Merk · Pattern · Size.

**Seluruhnya opsional** (`:603-605`) — tombol Kirim tidak pernah menunggu satu
pun medan di sini; gerbangnya tetap Start & End Time. Mekanik yang sinyalnya
hilang di lapangan harus tetap bisa melaporkan kerjanya.

Semua data datang dari **satu panggilan** (`:1086-1091`) — form ini dibuka di
lapangan dengan sinyal seadanya, dan layar yang terisi separuh lebih
membingungkan daripada layar yang belum terisi sama sekali.

Skema KMB Project sudah siap: `job_detail_forms`, `option_lists`,
`option_values`, `job_detail_fields`, `work_order_detail_values`
(`db/schema.sql:608-671`); tiga form + 10 posisi sudah ada di `db/seed.sql`.

### 4. Approvals — **paling kritis, kerjakan lebih dulu**

| berkas | baris | isi |
|---|---|---|
| `Approval.html` | 197 | `fmtJam` — **wajib identik** dengan `formatJamMenit` di 3 layar lain |
| | 219 | judul per `currentView` |
| | 267-590 | kisi kartu WO + tombol aksi |
| | 521 | `trTarget_*` — pilihan berganda penerima transfer |
| | 595-655 | bagian Approved + pencarian |
| | 715-727 | **modal Cancel** + kotak bahaya |
| | 729-800 | **modal Edit Override** ← yang masih `disabled` di KMB Project |
| `ApprovalService.js` | seluruh (2.044) | keputusan, penerbitan poin, transfer |

Lima tampilan (`currentView`): `pending` `✅ WO Approval` · `active` `⏳ WO Aktif`
· `transfer` `🔁 Transfer WO` · `rejected` `❌ Ditolak / Dibatalkan` ·
(bawaan) `🏆 WO Approved`.

Kotak bahaya pembatalan (`:719`) — teksnya bawa apa adanya:
> 🚨 **PERHATIAN!** WO ini sudah **FULLY APPROVED** dan poin sudah terdistribusi
> ke mechanic. Membatalkan WO ini akan **otomatis me-nol-kan poin** semua
> mechanic dalam WO ini. Tindakan ini **tidak bisa di-undo**.

Isi modal Edit Override (`:735-790`): Base Points (+ “Original:”) · Target Hours
**dua kotak jam + menit** (bukan desimal) · Work Condition (+ “Saat ini: … —
mengubahnya mengubah poin.”) · Team Composition yang bisa ditambah · picker
Mulai/Selesai + kotak Durasi + `modalOvPartialHint` · Judgment 500 karakter
dengan penghitung + `modalJudgmentSource` · Unit Factor **readonly** · riwayat
override (`modalOvLogSection`).

> `modalOvPartialHint` adalah pagar terhadap luka nyata: **override waktu tidak
> boleh menimpa `partial_hours`** (jam dari shift sebelumnya). Sudah dijaga di
> `src/domain/nilaiEfektif.ts` — layarnya yang belum.

### 5. Teknis

| berkas | baris | isi |
|---|---|---|
| `Teknis.html` | 146-186 | dua “dunia” (Tyre / Field) + 6 tab |
| `_DashboardTeknis.js` | 703 | angka tyre |
| `_DashboardField.js` | 511 | PA / MTBF / MTTR + tetapan shift |

Enam tab dunia Tyre: `Kondisi Tyre Kini` · `Problem` · `Remove / Instal` ·
`Repair per Tyre` · `Life Time` · `Riwayat per Unit`.
Ada tombol `Lihat dengan data contoh` + `#spandukDemo` (**ungu** — warna yang di
sistem ini hanya dipakai untuk angka yang bukan kenyataan final).

> **PA / MTBF / MTTR tetap BULAN KALENDER**, bukan periode gaji
> (`_PeriodePayroll.js:22-31`). Ketiganya milik kontrak klien (MOHH 744 jam),
> dan laporan PA klien berjudul “PERIODE JUNI 2026”. `_DashboardField.js`
> sengaja **tidak** memanggil `_PeriodePayroll.gs`. Jangan “dirapikan”.
>
> `FIELD_SHIFT_MULAI_PAGI` / `_MALAM` di berkas ini adalah **satu-satunya**
> sumber jam shift — papan harian di Performa meminjamnya.

Akses layar ini lewat penanda per-orang `mechanics.may_view_technical`, bukan
peran.

### 6. Koreksi HM & KM

| berkas | baris | isi |
|---|---|---|
| `Hm.html` | 93-112 | judul, `#selUnit`, `#isi` |
| | 176-240 | gambar riwayat + form ganti panel |
| | 242-270 | `perbaiki(woId, woNo, hmLama)` · `simpanPanel()` |
| `Km.html` | 277 | kembaran KM |
| `_KoreksiHm.js` / `_KoreksiKm.js` | 105 / 86 | sisi server |

Dua layar kembar. Form ganti panel: `HM panel baru` · `Berlaku sejak`
(`2026-09-01 08:00`) · alasan (`cth: panel jam rusak, diganti unit baru 1 Sep`).

Skema sudah siap: `meter_readings`, `meter_panel_changes`, `meter_corrections`
(`db/schema.sql:570-607`).

> Rantai meter **tidak boleh disaring** oleh penyaring tampilan apa pun
> (`_PeriodePayroll.js:419-427`): menyaring di sana memutus rantai meter dan
> membuat WO kembar lama tak terdeteksi.

### 7. Reports

| berkas | baris | isi |
|---|---|---|
| `Reports.html` | 131-270 | seluruh layar (satu kartu) |
| `PayrollService.js` | 607 | perakitan Excel |

Satu kartu `📥 Export Payroll Excel`:
- dua tombol saklar: **Bulan** (`#btnToggleMonth`, aktif) ⇄ **Rentang** (`#btnToggleRange`)
- `#selSection` — penyaring section
- panel Bulan: `#selMonth` + `#selYear`; panel Rentang: dua `input[type=date]`
- `#btnExport` → `#errorBox` atau `#resultBox`
- hasil: 3 statistik (`#statMechanics` 👷 · `#statWos` 📋 · `#statIdr` 💰),
  `#resultPeriod`, `#boxDikecualikan` (akun uji), tombol `#btnDownload`

**Wajib**: angka diambil dari **nilai beku** — `mechanic_points.points` dan
`idr_value` (kolom GENERATED), **bukan** dihitung ulang dari katalog atau rate
saat ini. Ini luka KMB V2 yang paling mahal: dashboard memakai `idr_value`
tersimpan sementara payroll menghitung ulang dengan rate sekarang, jadi dua layar
tak pernah cocok kalau rate pernah berubah (`db/schema.sql:500-504`).

Ada alat pembanding di sumber yang layak diport sebagai uji:
`cocokkanPapanDenganPayroll()` di `_PeriodePayroll.js:604-717` — membuktikan
papan peringkat dan export payroll menghasilkan rupiah yang sama.

---

## 5. Hal yang berlaku di SEMUA layar

### Navbar
Delapan menu, urutan & syarat tampil ada di [`01-PERFORMA.md` §10](01-PERFORMA.md).
Syaratnya **per-orang** (`may_view_*`), bukan peran — kecuali Approvals dan
Koreksi HM/KM yang memang per peran.

### Nama, bukan email
Semua layar menampilkan **nama**, tak pernah alamat email
(memori `tanpa-email-di-layar`).

### Satu rumus jam
`formatJamMenit(h)` muncul di empat tempat dengan isi identik:
`Main.html:563-572` · `WorkOrder.html:460-468` · `MechanicDashboard.html:729` ·
`Approval.html:197`. Di KMB Project ia **satu fungsi** di `src/lib/format.ts`.
Satu pekerjaan tidak boleh tampil sebagai dua angka berbeda di dua layar.

### Jangan menelan galat jadi daftar kosong
`src/domain/kueri.ts:10-13`. Approver pernah melihat “tidak ada WO aktif” padahal
ada 36, karena satu variabel salah ketik melempar dan galatnya ditelan. **Layar
kosong yang tampak normal lebih berbahaya daripada pesan galat.**

### Putus sambungan ≠ gagal
Kalimatnya sudah baku di dua tempat (`MechanicDashboard.html:826`, `:1074`).
Bawa apa adanya; jangan disederhanakan.

### Warna
Biru `#2563EB` → merah `#DC2626`; aktif-navbar amber `#fef3c7`/`#b45309` →
turunan merah. **Ungu tetap ungu** — di sistem ini ia hanya dipakai untuk angka
yang bukan kenyataan final (spanduk perkiraan di papan harian, spanduk demo di
Teknis). Hijau `#059669` tetap untuk rupiah.

---

## 6. Keputusan yang masih menunggu Gabriel

1. **Token di Monitoring.** Di KMB Project token disimpan ter-hash ⇒ tak bisa
   ditampilkan lagi, hanya bisa diterbitkan ulang. Di KMB V2 ia tampil telanjang,
   dan usaha menutupinya pernah di-*revert* (`77dd7e8`). Perubahan alur nyata.
2. **Approve vs Reject** harus bisa dibedakan sekilas di layar?
3. Apakah rasio `base_points ÷ plan_hours` aturan resmi atau kebetulan?
4. Peran **foreman** (ada di SUM, tidak di KMB) — ikut atau tidak?
5. Multi-tenant sungguhan, atau satu tenant selamanya?
6. Web KMB V2 **tidak responsif** di beberapa layar — ditiru, atau diperbaiki?
