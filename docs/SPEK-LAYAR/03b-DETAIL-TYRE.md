# Layar 3b — Detail Tyre

> **Sumber:** `MechanicDashboard.html`, `_DetailTyre.js`, `MechanicService.js`,
> `Router.js`, dan `ApiService.js` di `MAR-project`, cabang
> `feature/token-auth-web`, commit `d806ee5`. Dibaca 15 Sep 2026; **baca saja**.
>
> **Sasaran KMB Project:** bagian modal kerja di `/monitoring`, kueri detail
> bersama daftar WO, serta perintah kirim kerja dan simpan detail. **Belum
> diimplementasikan.** Kerangka tabel ada di `db/schema.sql:608-663`; benih form
> di `db/seed.sql:78-137` masih kurang beberapa medan dan pengikatan pilihan.

Ini **bagian modal Monitoring**, bukan menu tambahan. Lihat
[`03-MONITORING.md`](03-MONITORING.md) untuk timer, picker, dan pengiriman kerja;
[`05-TEKNIS.md`](05-TEKNIS.md) untuk pemakaian catatan ini di dashboard.

**Dua batas yang mengikat porting:** data teknis tidak mengubah poin/rupiah;
kegagalan detail ban tidak boleh menghilangkan atau menggagalkan jam kerja,
status, dan tim (`_DetailTyre.js:5-8,63-89`).

---

## 1. Susunan layar

```text
modal kerja Monitoring
  Work Order Details
  Isi Jam Kerja
  #tyreSection.modal-section                         MechanicDashboard.html:607-670
    h3 Detail Tyre — boleh dikosongkan               :608
    salah SATU:
      #tyreInspeksi                                 :617-641
        .tyre-hint + #tyreBeforeKosong
        .tyre-scroll > table#tyreInspTbl.tyre-tbl
          thead dua baris + tbody#tyreInspBody
      #tyreRemove                                   :644-655
        .tyre-hint
        #tyreRemoveBlocks > .tyre-blok per posisi
        select#tyrePosPilih + tombol + Tambah posisi
      #tyreRepair                                   :658-669
        .tyre-hint
        .tyre-grid4 > Serial No / Merk / Pattern / Size
  kaki modal milik Monitoring: Cancel / Transfer / Kirim
```

Ketiga form awalnya `display:none`. Jenis datang dari **server**, bukan nama
job yang ditebak browser (`MechanicDashboard.html:597-605,1115-1135`). Tidak ada
jenis → seluruh bagian tidak muncul; bukan tiga tab yang dipilih mekanik.

### Saklar sumber dan sasaran berbeda

Pada commit yang dibaca, `Constants.js:234-239` menetapkan `MODE_SEDERHANA = true`.
Artinya tiga form lengkap di sumber **sedang ditidurkan**, bukan tidak pernah
dibangun. Ketiga pintunya dijaga: baca form mengembalikan `jenis:null`, daftar
WO tidak membaca sheet tyre, dan tulis menolak detail dari PWA lama
(`_DetailTyre.js:512-518,771-777,827-832`).

Target menggantinya dengan `job_detail_forms.is_enabled` dan
`jobs.detail_form_id`. Ketiga form di seed berstatus `true`, tetapi itu
**belum membuktikan** ada job terhubung atau form sudah berjalan. Saklar harus
berlaku di server untuk baca **dan** tulis; menyembunyikan UI saja tidak cukup.

---

## 2. Per blok: bentuk, teks, dan interaksi

### A. Inspeksi

Sumber: `MechanicDashboard.html:617-640,1144-1177`.

Teks petunjuk:

> Kolom **Before** terisi sendiri dari catatan terakhir unit ini.
> Bertanah abu-abu karena bukan Anda yang mengetiknya.

Tambahan `#tyreBeforeKosong`:

> Sebagian tertulis “belum ada” — unit ini memang belum pernah tercatat di posisi itu.

| Kolom | Isi dan perilaku |
|---|---|
| `Pos` | 1 sampai `pilihan.jumlah_pos`; sumber 10, target `position_count` |
| `Pressure` | `Before` baca saja, `After` input angka |
| `RTD` | `Before` baca saja dengan penanda kritis bersyarat, `After` input angka |
| `Suhu` | `Before` baca saja, `After` input angka |

Header dua tingkat, **urutan Pressure → RTD → Suhu**. Input After memakai
`type="number" step="any" inputmode="decimal"`, tanpa `required`. Nilai lama
WO ini mengisi After; `0` dipertahankan oleh `_num()`, bukan diganti kosong.
Before kosong tampil `belum ada`, **bukan 0**; ia `<div>`, bukan input readonly.

`rtd_kritis > 0` dan `0 < RTD <= rtd_kritis` → `.tyre-rtd-kritis`.
Tanpa ambang, jangan mengarang angka kritis. Sumber tidak menandai RTD nol;
ini perlu dicatat sebagai perilaku aktual, bukan diam-diam diganti `<=` saja.
Penanda diterapkan pada **Before RTD**, bukan semua input After.

Detail kecil yang mudah keliru: `#tyreBeforeKosong` di kode dipicu oleh
**Pressure Before** kosong di salah satu posisi, bukan oleh setiap medan
kosong (`:1165,1177`). Teks petunjuk lebih luas daripada pemeriksaannya.

### B. Remove / Instal

Sumber: `MechanicDashboard.html:644-654,1188-1254`.

> Remove & Instal adalah **satu kesatuan per posisi** — ban yang turun
> dan ban yang naik di lubang yang sama. Pilih posisinya dulu, lalu isi keduanya.

Dropdown `#tyrePosPilih` berisi `Posisi 1` sampai `Posisi N`; tombol
`+ Tambah posisi` menambahkan `.tyre-blok[data-pos]`. Posisi yang sama ditolak
dengan `Posisi N sudah ada di daftar.`. Blok yang pernah disimpan muncul
kembali otomatis, sehingga WO yang dikembalikan approver tidak perlu diketik
ulang (`:1194-1198`).

Di kepala blok: `Posisi N` dan tombol `✕ hapus` dengan title
`Hapus posisi ini`. Lalu dua subjudul dan medan **dalam urutan ini**:

| Subjudul | Label | Kunci payload | Bentuk |
|---|---|---|---|
| `Ban yang DILEPAS` | Serial No | `remove_sn` | input teks |
| | Merk | `remove_merk` | input teks |
| | Pattern | `remove_pattern` | input teks |
| | Size | `remove_size` | input teks |
| | Problem | `remove_problem` | dropdown `pilihan.problem` |
| | Remarks | `remove_remarks` | dropdown `pilihan.remarks` |
| `Ban yang DIPASANG` | Serial No | `instal_sn` | input teks |
| | Merk | `instal_merk` | input teks |
| | Pattern | `instal_pattern` | input teks |
| | Size | `instal_size` | input teks |
| | Tyre | `instal_tyre` | dropdown `pilihan.kondisi` |
| | Inner | `instal_inner` | dropdown `pilihan.kondisi` |
| | Flap | `instal_flap` | dropdown `pilihan.kondisi` |
| | Lokasi breakdown | `lokasi_breakdown` | input teks |

Pilihan awal dropdown adalah `—` dengan value kosong (`:1180-1184`). Tidak ada
kewajiban mengisi pasangan ban sekaligus: seluruh medan tetap opsional.
Menghapus blok di browser **belum sama dengan menghapus detail tersimpan**;
lihat ketidaksesuaian sumber di §6.

### C. Repair

Sumber: `MechanicDashboard.html:658-667,1257-1263`.

> Tanpa kolom posisi — ban yang direpair sudah turun dari unit lewat
> Remove/Instal. Asal-usulnya tetap terlacak dari nomor serinya.

| Label | ID | Kunci | Placeholder |
|---|---|---|---|
| Serial No | `repSn` | `sn` | `cth: BS-77398120` |
| Merk | `repMerk` | `merk` | `cth: Bridgestone` |
| Pattern | `repPattern` | `pattern` | `cth: VSDL` |
| Size | `repSize` | `size` | `cth: 18.00R33` |

Satu objek per WO, **tanpa posisi dan tanpa tombol tambah**. Empat nilai lama
diisikan kembali saat modal dibuka.

### D. CSS yang menentukan bentuk

Sumber: `MechanicDashboard.html:213-240`.

| Kelas | Bentuk penting |
|---|---|
| `.tyre-hint` | latar `#f0f9ff`, border `#bae6fd`, teks `#075985` |
| `.tyre-scroll` | `overflow-x:auto`, tabel dapat digeser horizontal |
| `.tyre-tbl` | lebar 100%, minimum 520px, font 13px, border collapse |
| `.tyre-tbl th.sub` | uppercase, font 10px; Before/After tetap dua subkolom |
| `.tyre-ro` / `.kosong` | abu-abu; kosong miring, 11px |
| `.tyre-rtd-kritis` | latar `#fed7d7`, teks `#822727`, tebal |
| `.tyre-grid4` | `repeat(auto-fit,minmax(150px,1fr))`, gap 10px |
| `.tyre-blok` | border `#e2e8f0`, radius 10px, padding 12px |
| `.tyre-blok-hapus` | tanpa latar/border, redup; hover merah |

Pemetaan warna tema mengikuti `00-INDEKS.md` §5. Jangan menambah kotak HM/KM
di sini: nilainya diisi saat **Create WO**, bukan saat detail ban
(`MechanicDashboard.html:1123-1127`).

---

## 3. Kontrak backend dan bentuk data

### A. Data siap bersama daftar WO

Komentar `MechanicDashboard.html:1086-1091` masih menyebut satu panggilan
`siapkanFormTyre`. Implementasi **aktual** `tyreMuat()` tidak memanggil server:
`wo.tyre` dan `initialData.tyre_pilihan` sudah dibawa bersama daftar WO
(`:696,1107-1128`; `MechanicService.js:107-111`; `ApiService.js:187-209`).

Kontrak porting: muat metadata pilihan **sekali** di tingkat daftar; tempelkan
jenis, Before, dan isian per WO. Membuka kartu langsung menggambar form.
Endpoint pembaca satu WO boleh tersedia sebagai cadangan, dengan hasil yang
sama; jangan memperkenalkan tiga permintaan untuk pilihan/Before/isian.

```js
{
  tyre_pilihan: {
    problem: [], remarks: [], kondisi: [], jumlah_pos: 10,
    rtd_kritis: 0, target_life_km: 0
  },
  work_orders: [{
    // atribut WO lain...
    tyre: {
      jenis: 'inspeksi', // atau remove_instal / repair
      before: { '1': { pressure: 98, rtd: null, suhu: null, dicatat_at: '...' } },
      isian: { inspeksi: [], remove_instal: [], repair: null }
    }
  }]
}
```

Nama envelope daftar di atas ilustratif; tiga isi `tyre` mengikuti
`_DetailTyre.js:923-930`. Endpoint tunggal `siapkanFormTyre()` juga mengembalikan
`pilihan` dan `unit_id` (`:771-800`). Akses target wajib memeriksa tenant,
keanggotaan tim atau scope approver; mengetahui nomor WO bukan izin membaca
riwayat unit. Tabel detail belum punya RLS sendiri (`db/schema.sql:714-715`).

### B. Menentukan jenis

Sumber `jenisFormTyre()` (`_DetailTyre.js:693-758`):

1. Kode `job_id`, kalau tidak ada `component_id`.
2. Cari pemetaan config `tyre_form_inspeksi`, `tyre_form_remove_instal`,
   `tyre_form_repair`, dalam urutan itu.
3. Jika **satu saja** pemetaan sudah diatur, kode yang tidak cocok → tidak ada
   form. Jangan menyelundupkan kode yang sengaja dikecualikan lewat tebakan.
4. Hanya jika seluruh pemetaan kosong, tebak nama: inspection/inspeksi →
   inspeksi; assembly/disassembly/remove/instal → remove_instal; repair → repair.

Target memakai FK `jobs.detail_form_id`; tidak perlu menebak nama. Satu job
maksimal satu form, dan server memeriksa `is_enabled`. Ini perbedaan teknis
yang sudah dipilih arsitektur, bukan alasan membuat dropdown pemilih form baru.

### C. Before adalah After WO lain yang terakhir

`_DetailTyre.js:641-668,790-799,867-927`:

- Pilih **catatan inspeksi terbaru per unit + posisi**, menurut `dicatat_at`.
- Kecualikan WO yang sedang dibuka. Kalau terbaru miliknya sendiri, gunakan
  yang kedua; membuka ulang form tidak boleh membuat After sendiri jadi Before.
- Ambil Pressure/RTD/Suhu **After dari catatan yang sama**. Field kosong di
  catatan terbaru tetap null; jangan mencari tiap field ke WO lama yang berbeda.
- Nilai lama WO ini adalah **isian After**, terpisah dari sumber Before.
- Sumber tidak menyaring catatan ini menjadi approved-only atau periode gaji.

Peringatan sumber: “Nol adalah angka, dan angka yang salah lebih buruk daripada
kekosongan yang jujur.” (`_DetailTyre.js:592-595`). **Null bukan nol.**

### D. Payload pengiriman

`tyreKumpulkan()` (`MechanicDashboard.html:1266-1310`) mengembalikan salah satu:

```js
{ inspeksi: [{ pos: 1, pressure_after: '101', rtd_after: '15', suhu_after: '32' }] }
{ remove_instal: [{ pos: 2, remove_sn: 'SN-lama', instal_sn: 'SN-baru' }] }
{ repair: { sn: 'SN-lama', merk: '...', pattern: '...', size: '...' } }
// null jika form tidak siap, tidak ada jenis, atau seluruh isian kosong
```

Payload modal dikirim sebagai `detail_tyre` bersama jam kerja
(`MechanicDashboard.html:1079`; `Router.js:645-650`; `ApiService.js:593-601`).
**Before tidak dikirim oleh form web aktual**: collector hanya membaca input
After. Jangan mengklaim Before sudah dibekukan oleh sumber hanya karena sheet
menyediakan kolomnya. Target perlu mendefinisikan kapan `value_before` dicap;
untuk bentuk layar yang sama, Before tetap dihitung server saat membaca.

Metadata `wo_id`, `unit_id`, KM, waktu pencatatan, dan pencatat berasal dari
server. Pengirim tidak boleh memilih ulang unit atau mengubah KM lewat detail.
Sumber membuat satu catatan inspeksi/remove per posisi berisi nilai, dan satu
catatan Repair per WO (`_DetailTyre.js:512-573`).

### E. Penyimpanan tidak boleh menggagalkan jam kerja

Sumber melakukan flush jam kerja **sebelum** menyimpan detail, menangkap
kegagalan detail, dan tetap mengembalikan keberhasilan kerja
(`MechanicService.js:493-565`). Kiriman terlambat ketika WO sudah masuk L1/L2
atau approved tetap boleh menyimpan detail teknis, tetapi tidak menulis ulang
jam (`:400-428`). Ini dibutuhkan untuk antrean HP yang baru tiba setelah
laporan kerja lebih dulu masuk.

**Kontrak target:** hasil inti kirim kerja harus sudah committed beserta
`processed_ops` sebelum penulisan detail opsional dimulai. Menangkap exception
SQL detail di transaksi utama saja tidak cukup: transaksi bisa sudah aborted;
savepoint pun tidak menyelamatkan core bila koneksi mati sebelum commit.

Rancangan lanjutan yang perlu diimplementasikan, **belum ada di kode**:

1. Perintah kirim kerja lewat `jalankanPerintah` menyimpan jam/status/tim dan
   struknya dalam satu transaksi inti.
2. Detail diproses sesudahnya lewat **perintah teknis tersendiri**, tetap lewat
   `jalankanPerintah`, dengan `op_id` stabil yang berbeda dari operasi inti.
   Tidak ada penulisan langsung di luar pintu perintah.
3. Percobaan ulang inti yang mengembalikan struk lama tidak boleh membuang
   antrean detail yang belum berhasil. Pembaruan detail baru memakai ID operasi
   baru; retry muatan yang sama memakai ID yang sama.
4. Hasil inti sukses tetap sukses bila detail gagal; status detail dicatat
   terpisah dan dapat dicoba ulang tanpa mengirim jam lagi. Jangan menjawab
   seolah seluruh detail tersimpan bila yang tersimpan hanya jam kerja.

Antrean detail persisten dan format hasil parsial belum tersedia. Ini
kebutuhan implementasi, bukan klaim bahwa `runCommand.ts` saat ini sudah
menangani dua tahap tersebut. Jika penanganannya diubah kelak, buktikan bahwa
putus proses di antara kedua tahap tidak bisa menghapus jam yang sudah diakui.

---

## 4. Terjemahan ke Postgres

### Kolom dan konfigurasi

| KMB V2 | KMB Project | Catatan |
|---|---|---|
| Tiga sheet detail | `job_detail_forms` + `work_order_detail_values` | tiga bentuk, satu penyimpanan field |
| `wo_id` | `work_order_id` | FK ke WO; ID numerik |
| `pos` 1..10 | `position` 1..`position_count` | Repair memakai 0 |
| `pressure_before/after`, `rtd_*`, `suhu_*` | `field_key` + `value_before/after` | satu baris per medan per posisi |
| Medan Remove/Instal dan Repair | `field_key` + `value_after` | `value_before` null untuk medan tanpa pasangan |
| `dicatat_at`, `dicatat_oleh` | `recorded_at`, `recorded_by` | identitas server; layar menampilkan nama |
| `unit_id` salinan di sheet | join `work_orders.unit_id` | tidak ada kolom unit di tabel detail |
| `km` salinan di sheet | `work_orders.kilometers` / snapshot yang dirancang | belum ada snapshot KM pada detail |
| `tyre_form_*` | `jobs.detail_form_id` | tidak memakai pencocokan string |
| `tyre_problem/remarks/kondisi` | `option_lists` + `option_values` | urutan dari `sort_order`, aktif dari `is_active` |
| `TYRE_JUMLAH_POS` | `job_detail_forms.position_count` | data, bukan angka di banyak file |
| `MODE_SEDERHANA` | `job_detail_forms.is_enabled` | guard baca dan tulis |
| `tyre_rtd_kritis`, `tyre_target_life_km` | `settings.setting_key/setting_value` | nilai belum disetujui → tidak ada penandaan/perkiraan |

Benih saat ini kurang **lima medan**: `remove_remarks`, `instal_tyre`,
`instal_inner`, `instal_flap`, `lokasi_breakdown`. `remove_problem` sudah enum
tetapi belum terikat `option_list_id`; daftar `option_values` belum diisi.
Judul seed seperti `SN dilepas` juga bukan label UI `Serial No` pada subblok.
**Jangan menganggap render generik atas seed saat ini sudah menghasilkan 1:1.**

Pilihan bawaan sumber (`_DetailTyre.js:134-137`) adalah Problem: Side wall cut,
Impact material, Run flat, Tread cut, Separasi; Remarks: Scrap, Repair, Rotasi,
Stok; kondisi: Baru, Repair, Bekas. Config sumber mengalahkan bawaan. Nilai
config live tidak dibaca dalam sesi dokumentasi ini; daftar kode tersebut
bukan bukti isi operasional terkini. Ambang RTD dan target umur sengaja tanpa
angka bawaan (`:175-194`; `db/seed.sql:92-93`).

Tabel detail punya PK gabungan, tetapi **belum** memiliki FK komposit
`(form_id,field_key)`, validasi rentang posisi, validasi tipe nilai teks, atau
guard form/WO satu tenant. Pemeriksaan server dan/atau migrasi constraint masih
diperlukan. Form tidak boleh menerima jenis berbeda hanya karena payload
menyebut nama field yang dikenal.

### Sketsa kueri Before — belum diimplementasikan

Jalankan setelah WO pembaca dan unitnya lolos otorisasi. Untuk banyak WO,
batch-kan unit dan posisi; jangan satu query per kotak input.

```sql
-- $1 tenant, $2 unit yang diotorisasi, $3 WO yang sedang dibuka
WITH catatan AS (
  SELECT v.work_order_id, v.form_id, v.position,
         max(v.recorded_at) AS dicatat_at
  FROM work_order_detail_values v
  JOIN work_orders w ON w.id = v.work_order_id
  JOIN job_detail_forms f ON f.id = v.form_id
  WHERE w.tenant_id = $1 AND f.tenant_id = $1
    AND w.unit_id = $2 AND w.id <> $3
    AND f.code = 'tyre_inspeksi'
  GROUP BY v.work_order_id, v.form_id, v.position
), terakhir AS (
  SELECT DISTINCT ON (position) *
  FROM catatan
  ORDER BY position, dicatat_at DESC, work_order_id DESC
)
SELECT t.position, t.dicatat_at, v.field_key, v.value_after
FROM terakhir t
JOIN work_order_detail_values v
  ON v.work_order_id = t.work_order_id
 AND v.form_id = t.form_id AND v.position = t.position;
```

Pilih **catatan WO+posisi dahulu**, baru medannya. `DISTINCT ON` langsung per
field bisa mencampur tiga waktu berbeda menjadi satu Before palsu. Penulisan
semua field dalam satu posisi memakai waktu yang sama; field yang dikosongkan
pada posisi yang dikirim harus dinormalisasi, supaya nilai lama tidak tertinggal.
Pemecah seri `work_order_id` di atas adalah detail target yang deterministik;
sumber memilih catatan pertama yang ditemui untuk waktu sama.

```sql
-- Di dalam perintah teknis tersendiri, setelah validasi dan normalisasi.
INSERT INTO work_order_detail_values
  (work_order_id, form_id, position, field_key, value_before, value_after, recorded_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (work_order_id, form_id, position, field_key)
DO UPDATE SET value_before = EXCLUDED.value_before,
              value_after = EXCLUDED.value_after,
              recorded_at = now(), recorded_by = EXCLUDED.recorded_by;
```

PK mencegah penumpukan detail, sedangkan `op_id` mencegah eksekusi ulang
operasi. Keduanya perlu. Null untuk field yang dikosongkan bukan izin untuk
menghapus seluruh posisi yang tidak disertakan dalam payload.

---

## 5. Jebakan yang harus dibawa beserta alasannya

- **Jam lebih dulu.** “YANG TIDAK BOLEH DIKORBANKAN: start_time · end_time ·
  status · tim” (`_DetailTyre.js:70-75`). Data teknis tidak menjadi syarat
  tombol Kirim atau keberhasilan transaksi inti.
- **Tidak delete lalu insert.** Penulisan kedua menimpa identitas yang sama;
  penghapusan lewat nomor baris pernah menghilangkan empat WO pada 6–7 Agu
  (`_DetailTyre.js:17-25`).
- **Tidak N+1.** Sepuluh pembacaan dan kunci global demi satu WO inspeksi
  pernah membuat semua pengirim/approver ikut mengantre
  (`_DetailTyre.js:414-439,632-637,810-821`).
- **KM bukan HM.** “jam tidak bisa diubah menjadi kilometer tanpa mengarang
  laju yang tak seorang pun mengukurnya” (`_DetailTyre.js:37-46`). Jangan
  memigrasikan angka HM lama dengan mengganti nama kolom menjadi KM.
- **Before bukan isian sendiri.** Kecualikan WO yang dibuka; jika tidak,
  After sendiri muncul sebagai Before dan selisihnya nol
  (`_DetailTyre.js:790-793`).
- **Jenis diputuskan server.** Kalau browser/PWA menebak sendiri, satu WO
  bisa mendapat dua bentuk berbeda (`MechanicDashboard.html:597-601`).

---

## 6. Ketidaksesuaian sumber dan yang tidak perlu ditiru

1. **Retry masih mengirim HM sebagai KM.** Submit normal memakai
   `wo.kilometers` (`MechanicService.js:493-500`), tetapi cabang
   already-submitted masih memakai `wo.hour_meter` (`:424`). Port harus selalu
   mengambil KM WO; jangan menyalin cacat ini ke retry. Tidak diperbaiki di
   repo sumber pada sesi ini.
2. **Hapus di layar tidak menghapus data lama.** `✕ hapus` hanya membuang DOM
   (`MechanicDashboard.html:1243`); backend hanya upsert baris yang disertakan
   (`_DetailTyre.js:447-488,543-573`). Seluruh posisi dikosongkan atau Repair
   dikosongkan → collector tidak mengirimnya → data lama tetap ada. Sebaliknya,
   field kosong pada baris yang masih dikirim memang menimpa field lama menjadi
   kosong (`:441-443`). Semantik penghapusan posisi tersimpan harus ditentukan
   sebelum dinyatakan selesai; jangan menambahkan delete implisit.
3. **Before belum snapshot web.** Kolom penyimpanan ada, tetapi collector web
   tidak mengirim Before dan renderer menghitungnya ulang. Kebutuhan pembekuan
   Before untuk audit harus dinyatakan terpisah dari meniru tampilan sekarang.
4. **KM nol menjadi kosong di sumber** karena `parseFloat(km) || ''`
   (`_DetailTyre.js:537`). Target memakai null check agar nol tetap nol.
5. **Batas 3.000 baris bukan batas umur data.** Sumber membaca ekor sheet untuk
   mengendalikan biaya (`_DetailTyre.js:937-993`); itu bisa menyembunyikan unit
   lama. Target memakai kueri berindeks, tidak memotong riwayat berdasarkan
   jumlah baris global. Bila ingin batas kesegaran, definisikan sebagai aturan
   tersendiri dan tampilkan tanggal catatan; jangan mengarang batas waktu.
6. Tidak perlu duplikasi `unit_id/km` hanya untuk menghindari join Sheets,
   `SpreadsheetApp.flush`, nomor baris fisik, atau script lock global. Namun
   keputusan **snapshot KM versus pembacaan meter terkoreksi** untuk riwayat
   teknis tetap perlu dirancang bersama Koreksi KM dan Life Time; join saja
   belum menjawab bagaimana angka historis berubah setelah koreksi.
7. Tidak meniru `catch → []` sebagai keberhasilan. Form tidak tersedia akibat
   galat harus dapat dibedakan dari WO yang memang tidak punya detail, sambil
   tetap membolehkan pengiriman jam kerja.

---

## 7. Daftar periksa implementasi

Dicentang 16 Sep 2026. Yang masih kosong adalah keputusan yang memang belum
diambil manusia, bukan pekerjaan yang terlewat.

- [x] Satu jenis dari server; form mati tidak dibaca/ditulis termasuk payload lama.
- [x] Metadata ikut daftar WO; membuka modal tidak memerlukan permintaan per field.
- [x] Inspeksi 10 posisi dari config; Before abu-abu, null `belum ada`, nol tetap nol.
- [x] Before dari catatan terbaru WO lain per posisi; tidak mencampur waktu per field.
- [x] After dan blok posisi lama kembali saat WO dikembalikan lalu dibuka ulang.
- [x] Remove/Instal memuat seluruh 14 medan; posisi ganda ditolak; Repair tanpa posisi.
- [x] Lengkapi lima field seed, relasi option list, nilai pilihan, dan mapping job.
- [x] Tenant/scope/tim, jenis form, field, tipe, dan rentang posisi dijaga server.
- [x] Jam/status/tim + struk inti committed sebelum detail; uji kegagalan detail
      dan proses mati membuktikan jam tetap tersimpan.
- [x] Retry detail idempoten, termasuk detail terlambat sesudah laporan kerja masuk.
- [x] Retry dan submit normal menggunakan **KM** WO; nol tidak hilang.
- [ ] Sepakati semantik hapus posisi/Repair tersimpan serta snapshot Before/KM;
      jangan menyamarkan keterbatasan sumber sebagai perilaku final.
- [ ] Rekonsiliasi catatan detail dengan dashboard Teknis dan koreksi meter;
      detail teknis tidak mengubah poin atau rupiah.
