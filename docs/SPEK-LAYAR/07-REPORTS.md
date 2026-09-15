# Layar 7 — Reports

> **Sumber:** `Reports.html` (476 baris), `PayrollService.js` (607 baris),
> `_PeriodePayroll.js`, `ArchiveService.js`, `_PenandaUji.js`, `_AksesLayar.js`
> dan `Theme.js` di
> `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`.
> Dibaca pada 15 Sep 2026, cabang `feature/token-auth-web`, HEAD `d806ee5`.
> **Baca saja; tidak menjalankan export atau mengubah sistem sumber.**
>
> **Sasaran KMB Project:** `/reports`, `src/app/reports/page.tsx` (masih
> `BelumDibangun`), layanan kueri payroll dan pembuat XLSX **belum ada**.
> `src/app/api/data/route.ts:15-36` belum mempunyai jenis bacaan payroll.
> Dokumen ini kontrak porting, bukan pernyataan bahwa layarnya sudah selesai.

Rute sumber `?page=reports`, dipasang oleh `Router.js:1178-1188`. Semua rujukan
berkas tanpa awalan `src/` atau `db/` di bawah menunjuk repo sumber; `src/` dan
`db/` menunjuk KMB Project. Sketsa SQL dan nama layanan baru adalah **usulan**.

**Tiga koreksi terhadap ringkasan lama:** statistik hasil tidak memiliki emoji
mekanik/WO/rupiah; Detail WO saat ini berisi **23 kolom**; `total_wos` menghitung
**keikutsertaan mekanik pada WO**, sehingga satu WO dengan tiga penerima poin
terhitung tiga. Acuan: `Reports.html:229-240`, `PayrollService.js:267-290,459-465`.

---

## 1. Susunan layar

```text
nav.navbar                                            Reports.html:108-127
div.container (max-width 900px)                         :129-269
├─ .page-header                                        :130-133
│  ├─ h1.page-title       📊 Reports
│  └─ p.page-subtitle     Export data insentif mekanik untuk kebutuhan payroll
└─ .card                                               :135-268
   ├─ .card-title         📥 Export Payroll Excel
   ├─ .card-subtitle      penjelasan dua sheet           :137-141
   ├─ .filter-toggle                                   :144-151
   │  ├─ #btnToggleMonth.filter-toggle-btn.active
   │  └─ #btnToggleRange.filter-toggle-btn
   ├─ .form-group → #selSection.form-select             :154-159
   ├─ #panelMonth.panel.active                         :162-197
   │  ├─ penjelasan cut-off 16 → 15
   │  └─ .form-row → #selMonth + #selYear
   ├─ #panelRange.panel                                :200-211
   │  └─ .form-row → #inputStartDate + #inputEndDate
   ├─ #btnExport.btn-export                            :214-216
   ├─ #errorBox.error-box                              :219
   └─ #resultBox.result-box                            :222-267
      ├─ .result-header → ✅ + judul + #resultPeriod
      └─ .result-body
         ├─ .result-stats → tiga .result-stat
         │  ├─ #statMechanics.result-stat-value / Mekanik
         │  ├─ #statWos.result-stat-value / WO Selesai
         │  └─ #statIdr.result-stat-value / Total IDR
         ├─ #boxDikecualikan.excl-box → ⚠️ + #exclNama   :248-256
         └─ .result-actions → #btnDownload             :261-265
```

Navbar mengikuti urutan bersama di [`01-PERFORMA.md`](01-PERFORMA.md), Reports
aktif. Nama pengguna, bukan email. Sumber masih mempunyai fallback email
(`Reports.html:125`); target menampilkan `Identitas.nama`, sesuai keputusan
lintas layar. L1 tanpa badge, L2 `Manager`, sisanya `Mechanic`
(`Reports.html:121-125`).

### Ukuran dan CSS yang benar-benar berlaku

`Reports.html:29-103` adalah CSS lokal, tetapi `getThemeCSS()` disuntikkan
**sesudahnya** (`:105`). `Theme.js:12-14,23-70` memakai `!important`; menyalin
warna oranye lokal saja bukan reproduksi layar aktual.

| Komponen | Geometri / perilaku sumber |
|---|---|
| `.container` | lebar maksimum 900px; margin auto; padding `0 2rem 2rem` |
| `.page-title`, `.page-subtitle` | 2.5rem/700 dan 1.125rem; kepala margin bawah 2rem |
| `.card` | padding 2rem, margin bawah 1.5rem, radius 16px; tema memberi border 1px `--border` dan shadow `0 4px 12px rgba(0,0,0,.05)` |
| `.filter-toggle` | flex, gap 0, margin bawah 1.5rem, border 2px, radius 10px, overflow hidden |
| `.filter-toggle-btn` | masing-masing flex 1; padding `.75rem 1rem`; 0.9rem/600; aktif lokal `#b45309`/putih; selector ini tidak ditimpa Theme |
| `.form-row` | grid dua kolom sama, gap 1rem, margin bawah 1.25rem |
| `.form-group`, `.form-label` | kolom flex, gap .5rem; label .85rem/600 |
| `.form-select`, `.form-input-date` | padding `.7rem .875rem`, 0.95rem; tema menimpa border menjadi 1px `#D1D5DB`, radius 10px, focus ring |
| `.panel` / `.panel.active` | `display:none` / `block` |
| `.btn-export` | lebar 100%, padding 1rem, 1.1rem/700, flex tengah; tema primary menimpa gradient lokal |
| `.result-box` / `.show` | tersembunyi / block; margin atas 1.5rem; radius 12px; overflow hidden |
| `.result-header`, `.result-body` | padding `1rem 1.25rem` / `1.25rem`; header `#d1fae5`; body `#f0fdf4`, border 2px `#86efac` tanpa border atas |
| `.result-stats` | grid tiga kolom, gap 1rem, margin bawah 1.25rem |
| `.result-stat` | tengah, padding .75rem, putih, radius 8px, border 1px `#bbf7d0`; angka 1.4rem/700 `#065f46`, label .75rem |
| `.excl-box` | tampil sebagai flex; amber `#fffbeb` / `#fde68a` / `#78350f`, radius 8px, .82rem, line-height 1.5 |
| `.result-actions`, `.btn-result` | flex gap .75rem; tombol flex 1, padding `.75rem 1rem`, .9rem/600; `.btn-download` memakai primary tema |
| `.error-box` | margin atas 1.5rem; padding `1rem 1.25rem`; merah lembut, border 2px `#fca5a5`, radius 10px; `.show` membuka |
| `.spinner-inline` | 18×18px; border 3px; putar 0.8 detik linear tanpa henti |

Pada lebar ≤600px: container padding horizontal 1rem, judul 2rem, form dan
statistik satu kolom, aksi vertikal (`Reports.html:96-103`). Pertahankan ini;
Reports sudah mempunyai aturan mobile yang nyata.

Port primary biru `#2563EB` ke merah tema target. Amber pada saklar terpilih
dan kotak pengecualian mempunyai fungsi tersendiri; jangan diganti massal hanya
karena nilai heksanya muncul juga pada CSS tombol lama. Hijau hasil tetap
hijau. Spreadsheet dibuat oleh `PayrollService`, **tidak** menerima CSS Theme;
warna workbook sumber dijabarkan di §4.

## 2. Isi setiap blok dan interaksi

### 2.1 Kartu, saklar, dan section

Teks `.card-subtitle` persis (`Reports.html:138-140`):

> Generate laporan insentif dalam format Excel (.xlsx) dengan 2 sheet:
> **Sheet 1** — Ringkasan per mekanik (Nama, Total Poin, Total IDR) |
> **Sheet 2** — Detail per WO

Tombol saklar: `📅 Pilih Bulan & Tahun` dan `📆 Rentang Tanggal`. Label section:
`Pilih Section`. `initSections()` (`:283-316`) mengisi:

| Scope server | Opsi, berurutan |
|---|---|
| kosong / HO | `Semua Section` (`all`), `Field`, `Tyreman`, `Workshop` |
| lebih dari satu section | `Semua Section (Field, Tyreman)` sesuai urutan scope, lalu tiap section scope |
| satu section | section itu saja; tidak ada opsi `all` |

Opsi pertama otomatis terpilih. `all` berarti **seluruh section yang diizinkan
untuk penonton**, bukan menghapus scope server. Data section target dinamis;
`db/seed.sql:16-23` justru berurutan Tyreman → Field → Workshop. Jangan memakai
urutan seed itu tanpa sadar lalu menyebut picker Reports 1:1.

### 2.2 Panel Bulan

Awalnya aktif (`currentFilterType='month'`, `Reports.html:272`). Label:
`Bulan penutup`, `Tahun`. Januari–Desember bernilai 1–12 (`:178-189`), tahun
saat ini sampai tiga tahun sebelumnya menurun (`:318-327`). Pilihan awal bulan
adalah **bulan kalender saat layar dibuka**, bukan hasil
`periodePayrollSaatIni()`; setelah tanggal 16, ini dapat berbeda dari periode
berjalan di Performa (`:328-330`, `_PeriodePayroll.js:75-80`).

Teks panel (`Reports.html:170-172`):

> **Periode gaji: tanggal 16 sampai 15 bulan berikutnya.**
> Bulan yang Anda pilih adalah bulan **penutup** — memilih
> *September* berarti **16 Agustus – 15 September**.

Kotak penjelasan lokal: latar `#EFF6FF`, border 1px `#BFDBFE`, radius 8px,
padding `10px 12px`, margin bawah 1rem, .85rem, line-height 1.5 (`:168-169`).

### 2.3 Panel Rentang

`input[type=date]#inputStartDate`: `Dari Tanggal`;
`#inputEndDate`: `Sampai Tanggal`. Default **awal–akhir bulan kalender** saat
ini, bukan 16–15 (`Reports.html:331-336`). Tanggal sama sah. Mengganti saklar
hanya mengganti kelas `active`, mempertahankan isian, lalu menyembunyikan hasil
dan galat (`:346-353`). Mengubah section/tanggal sendiri belum menghapus hasil
lama dalam sumber; hasil selalu membawa label periode hasil generate terakhir.

### 2.4 Generate, galat, dan hasil

`#btnExport`: `📥 Generate & Download Excel`. Saat klik, hasil/galat lama ditutup,
tombol disabled, isi diganti spinner dan `Membuat laporan...`
(`Reports.html:369-374`). Tidak otomatis mengunduh saat sukses: sumber
menyiapkan **tombol Download kedua**, meskipun judul aksi menyebut Download.

| Keadaan | Pesan setelah awalan `❌ ` |
|---|---|
| bulan/tahun kosong | `Pilih bulan dan tahun terlebih dahulu.` |
| tanggal kosong | `Isi tanggal awal dan akhir.` |
| awal > akhir | `Tanggal awal harus sebelum tanggal akhir.` |
| server mengatakan tidak ada WO | `Tidak ada data WO approved pada periode ini.` |
| galat server terstruktur | pesan server; fallback `Unknown error` |
| kegagalan RPC | `System error: {message}` |
| pembentukan unduhan gagal | `Gagal menyiapkan berkas: {message}` |

Rujukan `:358-362,379-423,464-465`. Semua jalur penyelesaian mengembalikan
tombol aktif dan teks awal (`:469-473`). Error menggunakan `textContent`, tidak
menyisipkan pesan server sebagai HTML. Target harus membedakan hasil kosong
yang sah dari kegagalan kueri (`src/domain/kueri.ts:10-13`).

Sukses (`Reports.html:393-409`):

- `.result-header-text`: `Laporan berhasil dibuat!`; `#resultPeriod` dari server.
- `#statMechanics` = jumlah mekanik dengan baris poin positif yang lolos.
- `#statWos` = jumlah baris mekanik–WO yang lolos, **bukan distinct WO**.
- `#statIdr` = total rupiah, `Rp ` + pembulatan integer + pemisah ribuan titik
  (`formatIdr`, `:365-367`). Nilai awal ketiga statistik `-`.
- `#boxDikecualikan` hanya tampil bila `dikecualikan.baris > 0`. Judul:
  `Tidak ikut dihitung — akun uji.`. Isi `#exclNama`:
  `{Nama (ID), Nama (ID)} — {N} baris poin.`.
- Petunjuk sumber: `Kalau ada nama mekanik sungguhan di situ, jangan pakai
  berkas ini. Perbaiki dulu penandanya (lihatPenandaUji di _PenandaUji.gs).`
  Target tidak mempunyai editor GAS atau layar pengelolaan penanda. **Usulan
  teks pengganti:** `Kalau ada nama mekanik sungguhan di situ, jangan pakai
  berkas ini. Minta pengelola memperbaiki penanda akun uji, lalu buat ulang
  laporan.`; jangan membuat tautan ke menu yang belum ada.
- Tombol `.btn-result.btn-download`: `⬇️ Download Excel`.

Sumber menyiapkan `file_b64` lalu mengubahnya menjadi Blob XLSX saat Download
diklik; object URL dicabut 60 detik kemudian. Jika base64 kosong, tautan menuju
Drive (`Reports.html:426-466`). Kontrak hasil dan pengganti transport ada di §5.

## 3. Kontrak backend: urutan saringan dan definisi angka

Fungsi sumber:

```js
generatePayrollReport(filterType, year, month, startDateStr,
                      endDateStr, sectionFilter, token)
```

### 3.1 Gerbang akses: ada ketidaksesuaian nyata

`PayrollService.js:17-20` menerapkan token lalu mengizinkan **L1/L2 saja**.
Menu/halaman sudah mengikuti penanda per-orang, termasuk memberi akses mekanik
(`Router.js:131-140`, `_AksesLayar.js:86-95,104-117`). Akibatnya akun mechanic
dengan penanda report dapat membuka layar tetapi ditolak saat export. Sebaliknya
layanan sumber tidak mengulang pemeriksaan penanda report milik L1/L2.

Target `/reports` mengecek `aku.bolehLihat.report` (`src/app/reports/page.tsx:7-10`),
tetapi `src/lib/auth.ts:92-97` memaksa L2 selalu boleh; sumber bisa mencabut
penanda L2 secara eksplisit. Jangan menyamakan gerbang-gerbang itu dalam spek.
**Usulan kontrak target:** pemeriksaan hak report yang sama pada halaman, kueri,
dan unduhan, plus tenant dan scope. Keputusan apakah L2 dapat dicabut aksesnya
dan apakah mekanik berpenanda boleh export harus diselesaikan sebelum endpoint
payroll dibuka. Identitas berasal dari sesi terverifikasi, bukan field pemohon.

### 3.2 Saringan sumber, berurutan

1. **Validasi periode** (`PayrollService.js:22-49`). `month` memerlukan tahun
   dan bulan, kemudian memanggil `periodePayrollBerakhir`; selain `month`
   diperlakukan sebagai rentang. Target memvalidasi enum `month|range`, bulan
   1–12, dan tanggal kalender sah pada server juga.
2. **Sumber approved** adalah union arsip lalu sheet aktif, dedup `id`, hanya
   status `approved` (`ArchiveService.js:483-508`). Tidak membatasi arsip ke
   beberapa bulan terakhir untuk export periode lama.
3. **Ambang data pilot:** buang WO dengan `submitted_at`, atau `created_at`
   bila submit kosong, sebelum **16 Agustus 2026 00:00 Asia/Jakarta**. Bila
   keduanya tidak sah, jangan sembunyikan lewat ambang ini
   (`_PeriodePayroll.js:373-416`, `ArchiveService.js:492-498`). Ini aturan
   terpisah dari periode approval, bukan mengubah periode menjadi tanggal submit.
4. **Periode penghasilan:** pakai `superintendent_approved_at`, fallback
   `created_at`; tanggal harus masuk rentang. Bukan `submitted_at`, bukan
   `MechanicPoints.awarded_at` (`PayrollService.js:60-75`).
5. **Scope penonton**, kemudian **section pilihan**, keduanya terhadap
   `wo.section` (`:77-82`). Section mekanik tidak menggantikan section WO.
6. Jika **tidak ada WO approved** lolos, `PAYROLL_NO_DATA`. Ini diperiksa
   **sebelum** membaca poin (`:85-86`).
7. Ambil MechanicPoints untuk ID WO yang lolos dan **`points > 0`**, lalu
   saring **baris poin** akun uji berdasarkan penonton (`:92-120`). Rekan
   sungguhan pada WO campuran tetap ikut dan menerima poin penuh.
8. Enrich nama, jabatan, detail WO, dan breakdown snapshot. Jangan menyaring
   mekanik/katalog historis karena sudah tidak aktif: `loadMechanics()` membaca
   seluruh master (`ConfigService.js:237-243`).
9. Detail satu baris per pasangan mekanik–WO; urut nama naik lalu nomor WO
   naik. Ringkasan satu baris per mekanik; urut total poin turun; hitungan dan
   total dibangun dari detail yang sama (`PayrollService.js:264-290`).

Konsekuensi penting: WO dengan poin nol (misalnya insiden) hilang dari detail
payroll. Tidak ada filter safety terpisah. Ada styling safety nol di builder,
tetapi kasus normal safety nol sudah tersaring oleh `points > 0`. Jangan
menghapus filter itu hanya untuk membuat sorotan merah terlihat. Jika ada WO
approved tetapi seluruh poin nol/akun uji, sumber tetap menghasilkan workbook
kosong dan statistik nol; ini berbeda dari `PAYROLL_NO_DATA`.

### 3.3 Tanggal dan zona waktu

Sumber GAS memakai `Asia/Jakarta` (`appsscript.json:2`), sama dengan tenant
target (`db/seed.sql:9`). September 2026 =
`[2026-08-16 00:00+07, 2026-09-16 00:00+07)`. Januari melintasi tahun.
Label aktual memakai `_BLN_PENDEK` (`_PeriodePayroll.js:45-46,101-106`):
`16 Agt – 15 Sep 2026`, bukan judul bulan tunggal. Jangan menyamakan kata
`Agustus` pada penjelasan UI dengan singkatan label hasil.

Helper bulan sumber berakhir pada `23:59:59.999`, sedangkan rentang manual
berakhir `23:59:59.000` (`_PeriodePayroll.js:61`, `PayrollService.js:45`).
**Usulan perbaikan port:** kedua mode memakai batas akhir eksklusif tengah
malam sesudah tanggal akhir, agar pecahan detik terakhir tidak terbuang. Gunakan
zona tenant secara eksplisit; jam lokal proses Next.js/UTC bukan zona bisnis.

### 3.4 Nilai beku: perbedaan yang disengaja dari sumber

Sumber mengambil `mp.points`, tetapi menghitung ulang rupiah sebagai
`points * getRateForMechanic(id)` (`PayrollService.js:156-163`). Target sudah
memutuskan memperbaikinya (`db/schema.sql:489-504`,
`src/app/reports/page.tsx:21`):

```text
poin detail        = mechanic_points.points
rupiah detail      = mechanic_points.idr_value
tarif historis     = mechanic_points.idr_per_point
breakdown penilaian= scoring_snapshots.*
total mekanik      = SUM(nilai detail yang lolos untuk mekanik itu)
total laporan      = SUM(total mekanik) = SUM(detail)
```

`idr_value` GENERATED = `round(points * idr_per_point, 0)` per pasangan WO dan
mekanik. Jumlahkan nilai tersimpan itu. Jangan memakai rate katalog saat ini,
mengulang `hitungSkor`, atau memanggil `nilaiEfektif()` saat export. Saat L2,
target telah menulis snapshot dan rate beku bersama
(`src/domain/approval.ts:158-188`).

**Pembulatan:** sumber membulatkan IDR tiap sel detail tetapi totalnya
membulatkan jumlah hasil perkalian mentah (`PayrollService.js:268-290,424,441,509`).
Keduanya dapat berselisih beberapa rupiah. Target memakai jumlah IDR beku yang
sudah bulat per baris, sesuai skema. Poin dan jam ditampilkan maksimum dua
desimal mengikuti workbook; hitung total dari nilai numeric penuh, bukan dari
teks sel yang sudah dipotong. Contoh rate berubah: 2 poin × Rp2.500 dan 2 poin
× Rp3.500 tetap membayar **Rp12.000**, walau tarif sekarang Rp4.500.

### 3.5 Akun uji sadar penonton

Sumber terkini mengizinkan akun uji melihat **semua baris uji**, bukan hanya
dirinya. Gerbangnya `penontonLihatUji(email)` melalui penanda/pola email,
**bukan peran** (`_PenandaUji.js:255-284`). Untuk penonton sungguhan semua
baris poin uji tetap dibuang. `dikecualikan.baris` hanya menghitung baris uji
dengan poin positif dalam periode/scope; `nama` unik per mekanik dengan ID
(`PayrollService.js:108-119,362-381`).

Target punya `mechanics.is_test_account`, belum mempunyai pengecualian
penonton pada jalur report, bahkan identitas sesi belum memuat flag ini
(`db/schema.sql:83`, `src/lib/auth.ts:17-31`). **Terjemahan yang diusulkan:**
gunakan flag DB pemohon terverifikasi untuk padanan gerbang penonton, bukan
hardcode alamat email atau boolean kiriman klien. Mode ini perlu keputusan
sebelum implementasi karena label skema target mengatakan akun uji dikecualikan.

Ada celah sumber: bila penguji export, larangan memakai berkas untuk pembayaran
hanya muncul di **log** (`PayrollService.js:115-118`); `dikecualikan` nol dan
UI bisa terlihat sukses bersih. **Usulan yang belum ada:** spanduk dan penanda
workbook `DATA UJI — JANGAN DIPAKAI UNTUK PEMBAYARAN` pada export penguji.
Jangan menganggap kotak akun yang dikecualikan sudah menutup kasus ini.

## 4. Kontrak Excel: tepat dua worksheet

Sumber `_buildSummarySheet` dan `_buildDetailSheet`,
`PayrollService.js:395-557`. Format **XLSX**, MIME
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
Nama sumber `Payroll_{periodLabel dengan setiap karakter non-alfanumerik
diganti _}.xlsx` (`:294,378`). Filter section tidak masuk nama atau judul
sumber; dua export section berbeda bisa mempunyai nama sama.

### 4.1 Sheet `Ringkasan`

| Baris | Isi / format |
|---|---|
| 1 | A1:H1 merge, `LAPORAN PAYROLL INSENTIF MEKANIK`, 14pt bold putih, latar `#f59e0b`, tengah |
| 2 | A2 `Periode: {period}`, italic, `#b45309` |
| 3 | A3 `Dibuat: {tanggal dan jam generate}`, italic abu-abu |
| 4 | A4 `Rate per poin: bervariasi per jabatan (lihat kolom Rate/Poin)` |
| 5 | kosong |
| 6 | header 8 kolom, bold putih amber, tengah, border |
| 7.. | mekanik urut total poin turun, zebra `#f8fafc` / putih |
| 7+N | baris TOTAL, amber putih bold; B `TOTAL`, E jumlah WO, F jumlah poin, H jumlah rupiah |

Header, isi sumber, dan lebar kolom piksel (`PayrollService.js:408,422-447`):

| Kolom | Header persis | Isi sumber | Lebar |
|---|---|---|---:|
| A | `No` | nomor urut 1..N | 40 |
| B | `Nama Mekanik` | nama mekanik / ID bila master tidak ditemukan | 200 |
| C | `Jabatan` | **position**, fallback `-` | 120 |
| D | `Mechanic ID` | ID bisnis mekanik | 140 |
| E | `Total WO Selesai` | jumlah baris poin positif mekanik | 120 |
| F | `Total Poin` | total poin, round 2; format `#,##0.##` | 110 |
| G | `Rate/Poin` | **tarif saat generate**; integer, format `"Rp "#,##0` | 100 |
| H | `Total IDR (Rp)` | sumber round total mentah; target jumlah `idr_value`, format rupiah | 160 |

Freeze **enam** baris. Sel angka harus angka Excel, bukan string `Rp ...`.

**Ketidaksesuaian Jabatan:** detail memakai **grade** berdasarkan keputusan
Gabriel, tetapi ringkasan masih `position`. Jangan menulis bahwa sumber sudah
konsisten. Rekomendasi port: `grade` pada keduanya; perlu dicatat sebagai
penyelarasan perilaku (`PayrollService.js:165-178,265,422`).

**Rate/Poin historis campuran:** satu orang dapat memiliki lebih dari satu
`mp.idr_per_point` dalam periode. Satu rate terkini akan menyesatkan. Usulan
tanpa menambah sheet: jika hanya satu nilai, tampilkan nilai historis itu; bila
lebih dari satu, sel `Bervariasi` dan catatan sel berisi tarif historis yang
terpakai. Jangan menghitung tarif rata-rata lalu memakainya untuk bayar.
Teks A4 dan petunjuk harus disesuaikan jika usulan ini diterima. Workbook sumber
belum mempunyai solusi ini; keputusan tampilan masih terbuka.

### 4.2 Sheet `Detail WO`

`PayrollService.js:451-465,504-510`: A1 berisi
`DETAIL WO PER MEKANIK — {period}`, 12pt bold putih amber tengah. Sumber merge
**A1:AA1**, walau data aktual hanya A:W (23 kolom); ini sisa ukuran lama,
bukan bukti ada 27 kolom. A2 `Dibuat: {generatedAt}`. A3:

> Formula: Base Pts × Unit × Kondisi × Waktu × Safety × Redo = WO Poin → Poin Mekanik

Baris 4 kosong, header baris **5**, data mulai **6**; freeze lima baris.
Tidak ada baris grand total detail dalam sumber.

| # | Header persis | Isi sumber → kontrak target | Lebar px |
|---:|---|---|---:|
| 1 | `No` | urutan detail 1..N | 35 |
| 2 | `Nama Mekanik` | nama / kode mekanik | 150 |
| 3 | `Jabatan` | `grade`, fallback `-` | 110 |
| 4 | `Tgl Submit` | `wo.submitted_at`, tanggal Indonesia / `-` | 110 |
| 5 | `Tgl Approved` | approval L2 di WO, fallback approval log | 110 |
| 6 | `WO Number` | `wo_number`, fallback ID | 120 |
| 7 | `Unit` | ID/kode bisnis unit, **bukan** PK integer atau nama unit | 100 |
| 8 | `sub_component (field dan ws) - component name (tyreman)` | cascade: sub-component; tyre: component name; manual: `Others` | 220 |
| 9 | `job_description (field dan ws) - category (tyreman)` | cascade: job description; tyre: category; manual: deskripsi / `Custom Job` | 220 |
| 10 | `Kondisi` | normal→`Ringan`, difficult→`Sedang`, extreme→`Berat`, lainnya literal / `-` | 85 |
| 11 | `Lokasi` | huruf pertama kapital / `-` | 80 |
| 12 | `Start` | waktu HH:mm dari WO / `-` | 60 |
| 13 | `End` | waktu HH:mm dari WO / `-` | 60 |
| 14 | `Actual Hours` | sumber `wo.actual_hours`; target snapshot jam efektif yang dinilai | 85 |
| 15 | `Base Pts` | snapshot `base_points` | 70 |
| 16 | `×Unit` | snapshot `unit_factor` | 55 |
| 17 | `×Kondisi` | snapshot `work_condition_factor` | 65 |
| 18 | `×Waktu` | snapshot `timeliness_factor` | 60 |
| 19 | `×Safety` | snapshot `safety_factor` (nol harus tetap nol) | 60 |
| 20 | `×Redo` | snapshot `mtbf_factor` — label ini bukan pengali tambahan | 60 |
| 21 | `WO Poin` | snapshot `final_score` → `final_points` | 75 |
| 22 | `Poin Mekanik` | `mp.points`, penuh per orang, tidak dibagi anggota | 90 |
| 23 | `IDR (Rp)` | sumber round(points×rate kini) → **`mp.idr_value`** | 120 |

`Actual Hours` target memakai snapshot untuk menjelaskan pengali waktu yang
benar-benar dinilai. Start/End asli dan jam efektif setelah override/transfer
bisa berbeda; `scoring_snapshots` belum menyimpan timestamp efektif
(`db/schema.sql:472-484`). Jangan mengklaim keduanya pasti saling mengurang
menjadi angka jam yang sama. Kebutuhan menampilkan Start/End override sebagai
riwayat final merupakan keputusan/model data terpisah.

Tidak ada kolom Golongan, jenis part, HM, KM, ataupun checkbox safety dalam
header terkini, walau beberapa nilainya masih dirakit pada objek detail
(`PayrollService.js:212,245,251-252`). Jangan memulihkan kolom itu dari komentar
versi lama di awal berkas.

**Format:** No..End amber `#f59e0b`; Actual Hours `#4b5563`; Base Pts..×Redo
`#ad1457`; WO Poin..IDR `#b45309`. Header putih/bold/tengah/border. Zebra per
**nama mekanik**, bukan setiap WO: berganti `#f9fafb` / `#f0f9ff`, mekanik
pertama mulai `#f9fafb` (`PayrollService.js:480-515`). Jam, Base Pts, dan dua
kolom poin `#,##0.##`; Unit/Kondisi/Waktu/Redo `0.00`; Safety `0.0`; IDR
`"Rp "#,##0`. Jika Safety = 0, sel ×Safety dan WO Poin merah lembut, teks
`#991b1b`, bold (`:523-535`). Lebar/format harus dicari dari nama kolom,
bukan angka posisi yang tersebar. Library XLSX yang memakai satuan karakter
memerlukan konversi lebar dan verifikasi visual, bukan menempel nilai px.

## 5. Terjemahan data dan sketsa layanan target

### 5.1 Peta yang sudah ada dan celah skema

| KMB V2 | KMB Project | Batas penerjemahan |
|---|---|---|
| `Config_Mechanics.mechanic_id/name` | `mechanics.mechanic_code/name` | PK integer untuk join; kode bisnis untuk Excel |
| `position`, `grade` | `pay_rates.position` lewat `pay_rate_id`; `mechanics.grade` | position bukan label grade, rate kini tidak dipakai menghitung export |
| scope berkoma | `mechanic_sections` | tidak ada baris = semua section (`db/schema.sql:94-103`) |
| `wo.section` | `work_orders.section_id` → `sections.code/name` | filter sesuai section WO; verifikasi poin mempunyai section yang sama |
| `WorkOrders` + arsip | `work_orders` | satu tabel, index approved (`db/schema.sql:349-356`) |
| `superintendent_approved_at` | `approved_l2_at` | fallback impor `created_at` ditandai, bukan dibuat diam-diam |
| `Approvals.approved_at` | `approvals.decided_at` | hanya stage superintendent/approve; pilih putaran sesuai WO, jangan join banyak baris menggandakan poin |
| `MechanicPoints.points/idr_value` | `mechanic_points.points/idr_value` | uang frozen; PK pasangan menjamin satu penerima satu WO |
| rate lookup kini | `mechanic_points.idr_per_point` | snapshot per pasangan, bisa campur dalam satu periode |
| `ScoringSnapshots.final_score` | `scoring_snapshots.final_points` | FK WO satu snapshot; faktor dan actual hours beku |
| cascade sub_component | `jobs.sub_component_id` → `job_sub_components.name` | tidak mengambil label dari job_description untuk kedua kolom |
| tyre component_name | kandidat `jobs.job_description` untuk flat | cocokkan isi migrasi; field `component_name` tidak ada pada jobs flat |
| tyre `category` | **belum ada padanan** | `jobs.job_type` bukan category; jangan menebaknya |
| `COM-OTHERS`, `others_description` | `work_orders.is_manual/manual_description` | manual didahulukan dari katalog |
| `wo.unit_id` teks | `units.unit_code` | workshop tanpa unit target NULL; sumber kadang `WORKSHOP`; tampilan perlu mapping impor eksplisit |
| `MAR_MULAI_BERLAKU` | **helper/setelan belum ada** | tabel `settings` tersedia (`db/schema.sql:234-239`), tetapi key/tanggal belum dibenihkan |
| aturan akun uji berdasarkan pola | `mechanics.is_test_account` | perlu klasifikasi migrasi dan keputusan pengecualian penonton |

Nama/grade/uraian katalog tidak dibekukan di skema target. Ini sama-sama bisa
berubah saat master diubah; jaminan frozen saat ini berlaku untuk angka uang
dan faktor, bukan seluruh tulisan pada workbook historis.

### 5.2 Kontrak kueri yang diusulkan, belum diimplementasikan

Nama kerja: `kueriPayroll(aku, filter)` menghasilkan satu himpunan data konsisten
untuk statistik dan kedua sheet. Klien hanya mengirim:

```ts
type FilterPayroll =
  | { mode: 'month'; tahun: number; bulan: number; section: string | 'all' }
  | { mode: 'range'; mulai: string; akhir: string; section: string | 'all' };
```

Server memutuskan tenant, hak report, scope, zona waktu, ambang migrasi dan hak
melihat akun uji. Jangan menerima `tenantId`, `includeTest`, atau rate dari
browser. Bacaan murni tidak memerlukan `op_id` (`src/app/api/data/route.ts:8`).
Jika kelak ada pencatatan arsip atau aksi tulis bisnis, ikuti
`jalankanPerintah`; spesifikasi ini tidak menambah jalur tulis.

Sketsa berikut memakai kolom target nyata. Parameter `:...` adalah notasi
dokumen, **bukan** sintaks siap tempel untuk library `postgres`. `:ambang_pilot`
dan `:boleh_data_uji` sengaja parameter server karena keputusan migrasi/mode
uji belum diterapkan. Untuk port data KMB, ambang sumber 16 Agu 2026 harus
dipertahankan. Helper batas periode dipakai bersama Performa.

```sql
WITH wo_lolos AS (
  SELECT w.*, s.code::text AS section_code
  FROM work_orders w
  JOIN sections s ON s.id = w.section_id AND s.tenant_id = w.tenant_id
  WHERE w.tenant_id = :tenant_id
    AND w.status = 'approved'
    AND coalesce(w.submitted_at, w.created_at) >= :ambang_pilot::timestamptz
    AND coalesce(w.approved_l2_at, w.created_at) >= :mulai::timestamptz
    AND coalesce(w.approved_l2_at, w.created_at) < :akhir_eksklusif::timestamptz
    AND (
      NOT EXISTS (
        SELECT 1 FROM mechanic_sections ms WHERE ms.mechanic_id = :actor_id
      )
      OR EXISTS (
        SELECT 1 FROM mechanic_sections ms
        WHERE ms.mechanic_id = :actor_id AND ms.section = s.code
      )
    )
    AND (:section = 'all' OR s.code = :section)
), calon AS (
  SELECT w.id AS work_order_id, w.wo_number, w.section_id,
         w.submitted_at, w.approved_l2_at, w.created_at,
         w.start_time, w.end_time, w.work_condition, w.location,
         w.is_manual, w.manual_description, w.job_id, w.unit_id,
         p.mechanic_id, p.section_id AS point_section_id,
         p.points, p.idr_per_point, p.idr_value,
         m.mechanic_code, m.name, m.grade, m.is_test_account
  FROM wo_lolos w
  JOIN mechanic_points p ON p.work_order_id = w.id
  JOIN mechanics m ON m.id = p.mechanic_id AND m.tenant_id = :tenant_id
  WHERE p.points > 0
)
SELECT c.*,
       c.is_test_account AND NOT :boleh_data_uji AS dikecualikan,
       sn.work_order_id IS NULL AS snapshot_hilang,
       sn.base_points, sn.actual_hours AS actual_hours_dinilai,
       sn.unit_factor, sn.work_condition_factor, sn.timeliness_factor,
       sn.safety_factor, sn.mtbf_factor, sn.final_points AS wo_points
FROM calon c
LEFT JOIN scoring_snapshots sn ON sn.work_order_id = c.work_order_id;
```

`LEFT JOIN` snapshot sengaja menjaga baris uang tetap terlihat jika data rusak;
validasi lalu **laporkan snapshot hilang**, jangan menghilangkannya dengan
inner join atau menyulap semua faktor menjadi 1. Tenant/scope sudah dicek
sebelum join uang. Data baru memakai `approved_l2_at` dan snapshot wajib
secara kontrak; data impor dengan fallback perlu laporan pengecualian.

Dari hasil **satu bacaan konsisten** ini, pisahkan dikecualikan untuk nama dan
jumlah, gunakan sisanya untuk detail. Contoh agregasi atas relasi konseptual
`baris_dibayar` (hasil tadi setelah pengecualian; **bukan tabel yang sudah ada**):

```sql
SELECT mechanic_id, mechanic_code, name, grade,
       count(*) AS total_wos,
       sum(points) AS total_points,
       sum(idr_value) AS total_idr,
       array_agg(DISTINCT idr_per_point ORDER BY idr_per_point) AS rates
FROM baris_dibayar
GROUP BY mechanic_id, mechanic_code, name, grade
ORDER BY total_points DESC, name, mechanic_id;
```

Urutan tambahan nama/ID membuat seri deterministik; sumber hanya menjamin
total poin menurun. Jangan menggabungkan berdasarkan nama saja. Hitung jumlah
`wo_lolos` terpisah dalam snapshot bacaan yang sama untuk membedakan galat
tanpa WO dari workbook nol setelah saringan poin. Seluruh kebutuhan statistik
dan workbook bisa dirakit sekali dalam transaksi read-only/snapshot, bukan
dua generate terpisah yang bisa berbeda saat ada approval masuk.

Padanan payload sumber (`PayrollService.js:377-381`):

```ts
{
  filename, period,
  summary: { total_mechanics, total_wos, total_points, total_idr },
  dikecualikan: { baris, nama },
  // Sumber saja: url, download_url, file_b64.
  // Usulan target: unduhan terautentikasi untuk hasil yang sama.
}
```

**Usulan transport:** hasil XLSX dari server Node dikirim sebagai bytes/Blob
atau unduhan berumur pendek yang tetap memeriksa sesi dan hak report.
Tombol Download mengunduh hasil generate yang sama, bukan menjalankan kueri
baru diam-diam. Jangan memakai URL publik atau mengandalkan autentikasi Google
Drive. Pemilihan library/penyimpanan sementara belum dibuat; `package.json`
saat penulisan belum memuat pembuat XLSX. Header file `Content-Disposition`
memakai nama yang disanitasi; sel teks nama/uraian dipasang sebagai string
Excel, tidak dieksekusi sebagai formula ketika diawali `=`.

## 6. Jebakan yang harus dibawa beserta alasannya

1. **Bulan penutup harus dijelaskan.**
   `Reports.html:163-167`: “yang membandingkan hasilnya dengan bulan kalender
   akan mengira laporannya kehilangan setengah data.” Karena itu penjelasan
   cut-off ada sebelum picker, bukan hanya dalam bantuan tersembunyi.
2. **Satu fungsi periode.** `PayrollService.js:31-34`: “satu yang terlewat
   akan memberi angka yang berbeda tapi sama-sama masuk akal, dan tak ada yang
   tahu mana yang benar.” Jangan buat helper bulan tersendiri untuk export.
3. **Approval memicu penghasilan, fallback lama disengaja.**
   `PayrollService.js:66-70`: “WO-nya tidak boleh HILANG dari penggajian —
   lebih baik jatuh di bulan yang kurang tepat daripada tidak terbayar sama
   sekali.” Jangan menghapus fallback data impor tanpa audit kelengkapan.
4. **Pengecualian terlihat pada saat keputusan uang.**
   `PayrollService.js:362-369`: “orang itu berhenti dibayar TANPA satu pun
   galat muncul. Log tidak menolong: tak ada yang membaca Log.” Nama yang
   dibuang harus tampak. `Reports.html:75-76`: “Amber, bukan hijau: ia berdiri
   di dalam kotak ‘berhasil’ dan justru harus memutus rasa selesai itu sebentar.”
5. **Grade bukan kunci rate.** `PayrollService.js:168-175`: “Salah ketik di
   sini mengubah UANG, dan diam-diam”. Kolom display grade tidak boleh
   menjadi bahan lookup rate. Inkonsistensi summary tetap tercatat di §4.1.
6. **Indeks kolom dari header.** `PayrollService.js:468-477`: “yang meleset
   TIDAK MENIMBULKAN GALAT: ia cuma menaruh format rupiah di kolom jam kerja,
   atau mewarnai kolom yang salah”. Satu registry kolom untuk header, isi,
   format, warna, lebar, dan merge span.
7. **Rupiah beku dan pembatalan.** `db/schema.sql:500-504`: “payroll menghitung
   ulang dengan rate SAAT INI” dan “rupiah hantu” adalah dua luka yang ditutup
   kolom GENERATED. Jangan menambah salinan formula export yang membuka lagi.
8. **Uji rekonsiliasi perlu memeriksa hasil export sebenarnya.**
   `_PeriodePayroll.js:583-600` mencatat tanggal papan `awarded_at` berbeda
   dari tanggal payroll `superintendent_approved_at`, terutama dekat cut-off.
   Alat `cocokkanPapanDenganPayroll()` berguna untuk set baris/periode, tetapi
   **kedua sisinya menjumlahkan `mp.idr_value`** (`:650-660`); alat ini tidak
   memanggil builder payroll atau perkalian live-rate `PayrollService.js:163`.
   Jadi hasil COCOK alat lama **tidak membuktikan** XLSX sumber membayar angka
   sama jika rate berubah. Port uji harus membaca keluaran workbook sebenarnya.

## 7. Yang sudah tidak perlu ditiru

- Spreadsheet sementara, `DriveApp.addViewer`, folder `Payroll_V2_KMB`, token
  OAuth skrip, base64 9 MiB dan fallback tautan Drive
  (`PayrollService.js:307-358,587-607`). Alasan historisnya: “bagi Drive pemegang
  token adalah anonim” (`:313-317`). Kebutuhannya unduhan sah tanpa akun Google
  tertentu; solusi target bytes/unduhan sesi berbeda.
- Tautan `Buka di Google Sheets` sudah dihapus sumber karena berakhir dengan
  `Anda memerlukan izin` (`Reports.html:257-260`); jangan menghidupkannya lagi.
- `google.script.run`, scriptlet, URL deployment tetap, `PAGE_TOKEN` pada
  tautan navbar, dan `target=_top` (`Reports.html:271-281,390-423`). Gunakan
  sesi dan routing target, tanpa token mentah di URL.
- Dua sheet database aktif/arsip dan pemindaian penuh GAS. Target satu tabel
  berindex. Tetap bawa hasil dedup, cakupan historis, dan ambang pilot.
- Batas performa `setValue` per sel. Sumber sudah beralih batch karena
  “±6.800 panggilan API” pada 200 WO (`PayrollService.js:489-490`); target
  membangun worksheet dari array dan kueri bulk, bukan N+1 lookup tiap WO.
- Merge A1:AA1 yang tertinggal setelah penghapusan kolom; target merge sampai
  kolom terakhir registry (W untuk kontrak 23 kolom), sebagai koreksi layout.
- Fallback snapshot nol/satu dari sumber (`PayrollService.js:226-233`).
  `snap.safety_factor || 1` bahkan mengubah numeric 0 menjadi 1; di target
  gunakan numeric/null check dan snapshot tersimpan, laporkan data yang hilang.

## 8. Daftar periksa selesai

**Kelengkapan dokumen sesi ini:** seluruh UI, perilaku sumber, data uang,
workbook, mapping, usulan query, dan celah di atas sudah ditelusuri. Kotak di
bawah adalah syarat **implementasi nanti**, bukan pekerjaan yang diklaim selesai.

### UI dan hasil

- [ ] Satu kartu, urutan blok/teks/ID/class, breakpoint 600px, dan tema efektif.
- [ ] Dua mode filter; default kalender sumber dibedakan dari periode berjalan.
- [ ] Picker scope hanya menawarkan section yang sah; `all` tetap berscope.
- [ ] Loading, validasi, hasil, galat, retry, dan tombol download kedua bekerja.
- [ ] Kotak pengecualian menampilkan nama+ID dan jumlah baris; tersembunyi saat nihil.
- [ ] Tidak ada email di layar, tautan editor GAS, atau tautan Drive yang menolak token.

### Angka dan workbook

- [ ] Satu dataset menjadi statistik, Ringkasan, Detail WO, dan bytes unduhan.
- [ ] Uji tim tiga orang: satu WO → tiga detail, tiga total keikutsertaan,
  poin penuh setiap orang; WO campuran akun uji tetap membayar anggota sungguhan.
- [ ] Uji periode 15/16, Januari lintas tahun, rentang satu hari, pecahan detik,
  data pilot, fallback impor, dan zona Asia/Jakarta.
- [ ] Uji scope multi-section, pilihan section luar scope, dan tenant lain di
  kueri maupun endpoint download; tidak hanya menyembunyikan opsi UI.
- [ ] Uji perubahan rate/katalog setelah approval: rupiah tidak berubah dan
  dua rate historis dalam periode tetap menjumlahkan nilai beku yang benar.
- [ ] Uji batal approved: points dan rupiah nol, tidak masuk payroll.
- [ ] Uji tanpa WO berbeda dari ada WO tetapi seluruh poin nol/dikecualikan.
- [ ] XLSX tepat dua sheet, header 8/23 kolom, urutan/filter identik, freeze 6/5,
  tipe angka/string benar, format rupiah tidak bergeser, lebar dan merge diverifikasi.
- [ ] Total IDR layar = total Ringkasan = jumlah Detail WO = jumlah IDR beku
  per mekanik; rekonsiliasi dengan Performa membaca hasil export sungguhan.
- [ ] Snapshot hilang/section tidak cocok dilaporkan, tidak ditelan menjadi nol.

### Celah yang perlu ditutup sebelum port dinyatakan 1:1

| Celah | Keputusan atau pekerjaan berikutnya |
|---|---|
| hak per-orang vs gerbang L1/L2; L2 selalu boleh target | sepakati satu matriks akses, lalu terapkan di data dan unduhan |
| akun uji boleh export semua data uji di sumber baru | putuskan padanan flag target dan penanda jelas pada hasil/berkas uji |
| Rate/Poin campuran; Jabatan summary position vs detail grade | sepakati presentasi historis dan penyelarasan grade, tanpa mengubah uang beku |
| tyre category belum ada padanan | tetapkan field/mapping migrasi; jangan mengganti dengan job_type |
| ambang pilot belum ada pada target | buat helper/config bersama sesuai tanggal sumber untuk data migrasi |
| default bulan vs periode berjalan; label WO Selesai ambigu | pertahankan perilaku/label yang didokumentasikan sampai ada keputusan perubahan |
| tanggal/jam efektif override tidak dibekukan lengkap | sepakati tampilan actual hours snapshot dan timestamps sumber; jangan menjanjikan rekonstruksi yang belum tersedia |
| library XLSX dan transport belum ada | pilih implementasi, verifikasi workbook dan unduhan terautentikasi |

