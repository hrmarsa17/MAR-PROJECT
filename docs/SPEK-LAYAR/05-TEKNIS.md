# Layar 5 — Dashboard Teknis

> **Sumber:** `Teknis.html` + `_DashboardTeknis.js` + `_DashboardField.js`,
> dibantu `_DetailTyre.js`, `_Meter.js`, `_PeriodePayroll.js`, di
> `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`. **Baca saja.**
>
> **Sasaran:** `/teknis`, `src/app/teknis/page.tsx`; usulan modul
> `src/domain/kueriTeknis.ts`, `src/domain/teknisField.ts`, `src/domain/teknisTyre.ts`.
> Ketiga modul itu **belum ada**. Halaman sekarang hanya penanda dengan gerbang
> akses (`src/app/teknis/page.tsx:7-23`). Spek ini bukan klaim layar sudah dibangun.

Nomor baris sumber diperiksa 15 Sep 2026. Kontrak aktual dan ketidaksesuaian
komentar/kode dibedakan di §6; perbaikannya belum diimplementasikan.

## 1. Susunan layar

```text
navbar                                       Teknis.html:127-143
.container (max-width:1200px)
├── .page-title: Dashboard Teknis             :146
├── .page-sub                                :151
├── .baris-dunia                              :153-159
│   ├── .dunia → #dTyre.on | #dField
│   └── #btnDemo.tab
├── #spandukDemo                              :161
├── #duniaTyre                                :163-183
│   ├── #statRow.stat-row
│   ├── #grafikTren
│   ├── .tabs → enam tombol
│   └── #p-kondisi / problem / riwayat / repair / life / unit
└── #duniaField (awal display:none)            :185
    ├── .demo-banner (jika contoh)            :356-360
    ├── .stat-row → enam kartu                :362-369
    ├── .catatan rumus + periode              :371-375
    ├── .kartu: Masih tercatat rusak          :377-387
    ├── .kartu: Per unit                      :389-414
    ├── .kartu: Komponen paling sering jadi sebab :416-422
    └── .catatan dasar MTBF                   :424-433
```

Subjudul persis: **“Keadaan alat, bukan kinerja orang. Tidak ada poin maupun
rupiah di layar ini.”** Alasan sumber: ketika poin masuk, pencatatan berubah
menjadi usaha terlihat bagus (`_DashboardTeknis.js:9-12`). Jangan menambahkan
leaderboard, nama mekanik sebagai penilaian, atau rupiah ke halaman ini.

### Akses dan pemisah dunia

- Navbar dan endpoint memakai penanda per-orang `may_view_technical`, **bukan
  hanya L1/L2**. Handler sumber memeriksa lagi walaupun halaman sudah dijaga:
  `_DashboardTeknis.js:689-703`, `_DashboardField.js:503-511`.
- Penolakan: `Anda tidak berhak membuka Dashboard Teknis.`
- Dunia awal `tyre`; tombol **Tyre** dan **Field**, kelas terpilih `.on`.
  Enam tab di bawah hanya milik Tyre. Komentar `Teknis.html:92-98` menjelaskan
  pemisah ini mencegah sepuluh tab berebut tempat; saklar contoh duduk di
  sebelahnya karena mengubah seluruh isi layar.
- Tyre satu permintaan; Field baru diminta ketika dipilih. Berpindah tab atau
  unit tidak memanggil server lagi (`Teknis.html:289-325,810-818`).
- Navbar tetap urutan bersama di [01-PERFORMA.md](01-PERFORMA.md). Sumber
  menyebut dashboard ini hanya web, alat “duduk-dan-menimbang”, berbeda dengan
  form Detail Tyre lapangan (`_DashboardTeknis.js:14-16`).

### Kelas dan angka ukuran

`Teknis.html:25-122`: `.container` padding `0 2rem 3rem`; `.page-title` `2rem`;
`.stat-row` grid `repeat(auto-fit,minmax(150px,1fr))`, gap `.9rem`;
`.stat` radius `12px`, padding `.9rem 1rem`; `.stat-num` `1.5rem/800`;
`.tab` radius `9px`, padding `.6rem 1.1rem`; `.tab.active` latar `#1f2937`, putih.
`.panel` radius `14px`, padding `1.1rem 1.25rem`, hanya `.active` terlihat.
Tabel `.scroll` bergulir horizontal, `min-width:560px`; `.num` rata kanan.
`.kritis td` `#fef2f2`, `.kritis .rtd` `#991b1b/800`.
`.bar-row` grid `minmax(120px,1fr) 3fr 44px`; batang tinggi `16px`, radius `5px`,
angka selalu di sebelah kanan (`:59-65`: “Angka di sebelah batang selalu lebih
terbaca daripada batang tanpa angka.”). ≤640px padding sisi jadi `1rem`, judul
`1.5rem`. Ikuti tema merah bersama; warna kritis, amber peringatan, hijau PA
baik, dan ungu demo mempertahankan maknanya.

## 2. Per blok — Tyre

### Ringkasan, demo, tren

Lima kartu berurutan (`Teknis.html:500-503`): **Unit tercatat**, **Posisi tyre**,
**Baris inspeksi**, **Remove/Instal**, **Repair**. Dua pertama menghitung unit
dan pasangan unit-posisi yang memiliki inspeksi; bukan jumlah seluruh master
unit. Tiga terakhir jumlah baris detail yang dibaca, **bukan jumlah WO**.

Saklar berbunyi **Lihat dengan data contoh** ketika mati dan **Kembali ke data
sungguhan** ketika menyala; `.active` mengikuti mode (`:463-485`). Kedua cache
Tyre/Field dibuang sekaligus. Banner berasal dari `data.demo` (`:490-498`),
ungu `.demo-banner` (`#f5f3ff`, border `2px solid #c4b5fd`, teks `#5b21b6`).
Teks utama **⚠️ INI DATA CONTOH — BUKAN KENYATAAN.** Tyre menjelaskan data
dirakit di memori, nama unit nyata tetapi angka tidak, tanpa baris tersimpan;
Field memakai tanda `-` dan menjelaskan angka dicontoh dari laporan PA Juli.
**Bawaan demo sumber bertentangan dengan kalimat reload; lihat §6.**

Grafik (`:529-593`) **Pergerakan {N} minggu terakhir**, subjudul rentang Mg 1
sampai Mg N `(minggu berjalan)`. SVG `viewBox 0 0 720 200`, tinggi `200`.
Seri **Inspeksi** `#94a3b8`, **Remove/Instal** `#0ea5e9`, **Problem** `#ef4444`;
legenda dan tooltip titik mencantumkan angka. Sumbu Y mulai **nol**, maksimum
kelipatan 5 dengan minimum 5. Komentar `:529-532`: sumbu terpotong dapat membuat
kenaikan tiga persen terlihat dua kali lipat. Data kurang dari dua ember →
grafik tidak digambar. Repair dihitung backend tetapi tidak diplot.

### Enam tab, teks dan urutan kolom

| Tab / `data-tab` | Isi persis dan perilaku | Sumber `Teknis.html` |
|---|---|---|
| **Kondisi Tyre Kini** / `kondisi` | `Unit · Pos · RTD kini · Jejak RTD · Umur pakai · Sisa KM · Perkiraan ganti · Pressure · Tercatat`; RTD terendah dulu, null terakhir; `.kritis` bila ambang terpenuhi | `:619-662` |
| **Problem** / `problem` | `Menurut jenis problem`, lalu `Menurut posisi ban`; batang beserta angka; label posisi `Posisi {N}` | `:677-688` |
| **Remove / Instal** / `riwayat` | `Tanggal · Unit · Pos · SN dilepas · Problem · Remarks · SN dipasang · Lokasi`; tanggal terbaru dulu | `:690-708` |
| **Repair per Tyre** / `repair` | Peringatan kualitas SN, lalu `Serial No · Merk / Pattern · Size · Jumlah repair · Repair terakhir`; jumlah menurun | `:710-732` |
| **Life Time** / `life` | Kartu rata-rata, jumlah tyre selesai, sasaran, rasio; dua grafik rata-rata; tabel `Serial No · Merk / Pattern · Size · Umur pakai · Hari · Problem · Dilepas` | `:734-808` |
| **Riwayat per Unit** / `unit` | Dropdown `No lambung / unit`, keadaan tiap posisi, lalu riwayat remove/instal unit itu | `:810-908` |

Tab awal `.tab.active` dan `.panel.active` = `kondisi` (`:168-182`).
Dalam Kondisi: null umur → `KM belum diisi`; sisa null → `–`; sisa ≤0 →
`lewat {abs(sisa_km)}` merah; tanggal kosong → `perlu 2 catatan`. Umur tampil
`{life_km} KM · hari ke-{umur_hari}`. “Tercatat” memakai tanggal **dan jam**,
karena satu posisi dapat dicatat berkali-kali sehari (`:264-274`). Jejak RTD
SVG `82×22`, merah jika kritis, kurang dari dua titik → `-`; seluruh titik
menunjukkan aus mendadak yang tak tampak dari rata-rata (`:595-616`).

Catatan Kondisi wajib menjelaskan rumus umur/sisa/tanggal dan alasan KM
(`:649-660`): RTD hanya berubah ketika diukur; pengukuran yang terlupa tidak
boleh membuat ramalan seolah ban berhenti aus. Laju memakai tyre/unit sendiri,
bukan rata-rata armada. Tutup dengan **“ramalan, bukan janji”**.

Life Time (`:754-807`) menampilkan **Rata-rata umur pakai**, **Tyre selesai
umurnya**, **Umur sasaran**, dan jika sasaran >0 **Rata-rata thd sasaran**.
Grafik **Rata-rata umur pakai menurut merk / pattern**, **Menurut posisi**;
label menyertakan jumlah sampel `(N)`. Subjudul **“Angka dalam kurung = berapa
tyre yang jadi dasarnya. Satu tyre bukan bukti.”** Tabel **Tyre yang sudah
selesai umurnya** diurut umur terpanjang dulu; hijau jika ≥sasaran. Hanya
pembuangan final masuk, bukan setiap pelepasan untuk rotasi/repair (§4).

Riwayat per Unit: daftar berasal dari gabungan `kondisi` dan `riwayat`, unik
per unit, label diurut alfabet; default item pertama, pilihan dipertahankan
selama masih valid (`:821-843`). **Keadaan tiap posisi** berkolom `Pos · SN
terpasang · RTD · Jejak RTD · Umur pakai · Perkiraan ganti · Tercatat`; posisi
urut angka. **Riwayat Remove / Instal unit ini** berkolom seperti tab riwayat
tanpa Unit, tetapi tanggal dengan jam. Semua penyaringan lokal, tanpa RPC.

### Keadaan kosong dan peringatan

| Keadaan | Teks yang dibawa |
|---|---|
| Belum ada inspeksi | `Belum ada catatan inspeksi` / `Layar ini terisi begitu mekanik mulai mengisi Detail Tyre saat mengirim WO.` |
| Belum ada remove/instal | `Belum ada Remove / Instal` / `Terisi saat mekanik mengisi form Remove/Instal.` |
| Belum ada repair | `Belum ada repair tercatat` / `Terisi saat mekanik mengisi form Repair.` |
| Belum ada life selesai | `Belum ada tyre yang selesai umurnya` / `Terisi begitu ada tyre yang dipasang lalu dilepas dengan KM tercatat di keduanya.` |
| Belum ada unit | `Belum ada unit tercatat` / `Terisi begitu ada WO tyre yang dikirim mekanik.` |
| Pindai terbatas | `Yang dipindai hanya {batas_pindai} baris terakhir.`; jelaskan tidak ada di layar berarti tidak ada dalam rentang pindai |
| RTD belum ditentukan | `Ambang RTD kritis belum ditentukan`; tiada warna merah **tidak berarti aman** |
| Umur sasaran belum ditentukan | `Umur sasaran belum ditentukan`; umur tercapai tetap diukur tanpa pembanding |

Sumber `Teknis.html:505-515,619-624,690-719,745-765,836-840`.
Nilai pengukuran kosong harus `–`, bukan 0 (`:249-256`). Peringatan Repair
`📏 Baca angka ini sebagai petunjuk, bukan angka pasti.` menjelaskan SN ketikan
bebas dan risiko satu riwayat pecah; teks penuh `:712-716`.

## 3. Per blok — Field

Enam kartu: **PA rata-rata · Unit tercatat · Kejadian BD · Total downtime ·
MTTR · MTBF** (`Teknis.html:362-369`). Jam di kartu bersufiks ` j`; PA satu
angka desimal persen. Data nyata tanpa kejadian menghasilkan nol jumlah dan
`-` untuk rasio yang tidak dapat dihitung, bukan kegagalan yang disamarkan.

Catatan utama menampilkan **PA = (MOHH − Total BD) ÷ MOHH**, `MOHH {N} jam =
{hari} hari × 24`, kategori **UB0** dikerjakan, **UB1** menunggu mekanik,
**SB0** perawatan terjadwal, serta **Periode: {nama bulan tahun}** (`:371-375`).
Tidak ada picker periode di markup saat ini; server menerima `bulan`, UI hanya
mengirim token+demo. Jangan menambahkan filter periode gaji.

Kartu **Masih tercatat rusak** hanya bila `terbuka` berisi. Subjudul
**“Selama belum ditutup, jamnya terus bertambah dan PA-nya terus turun.”**
Baris amber `.terbuka-row` berisi unit, `sejak {tanggal}`, `{N} WO` atau
`belum ada WO`, dan `{jam} jam`. Data dihitung ulang ketika dimuat; sumber
tidak punya timer penyegaran otomatis (`:377-387`).

Tabel **Per unit**: `Unit · Equipment · UB0 · UB1 · SB0 · Total BD · Freq ·
MTTR · MTBF · PA · Target` (`:389-414`). PA terendah dulu; terbuka → titik
merah + `.kritis`; UB1 >0 ditebalkan. PA memenuhi target → `.pa-baik`
`#15803d`, lainnya `.pa-buruk` `#991b1b`. Target kosong `-`; sumber tetap
memberi kelas buruk saat target kosong, jangan menyimpulkan gagal target.

MTBF (`:327-350`) wajib menyertakan `{hm_bacaan} bacaan · {hm_liputan}%`,
`{hm_dibuang} dibuang` bila ada, `~` untuk `sebagian`, tooltip penjelasan mutu.
Jika null: **HM belum cukup** saat bacaan <2, **HM terlalu jarang** saat
`tipis`, selain itu **HM belum ada**. Angka dengan dasar dua bacaan tidak boleh
terlihat sama meyakinkan dengan tiga puluh bacaan.

Pareto **Komponen paling sering jadi sebab** memakai batang dan angka; label
menyebut jumlah kejadian, bukan jam. **Definisi loop aktual per WO berbeda
dengan label ini** (§6). Catatan akhir menyebut HM dari semua section termasuk
tyreman, sedangkan pekerjaannya tidak menghitung downtime; sejak tyreman
merekam KM, hanya WO yang benar-benar mempunyai **hour_meter** yang menyumbang.
UB2/UB3/UB4/BA belum dihitung (`:424-433`, `_DashboardField.js:337-351`).

## 4. Kontrak backend dan definisi angka

### 4a. Tyre: `dataDashboardTeknis(opsi)`

`_DashboardTeknis.js:35-279` membaca satu kali masing-masing sheet
`WoDetailTyreInspeksi`, `WoDetailTyreRemoveInstal`, `WoDetailTyreRepair` melalui
`_bacaEkorTyre`. Tidak ada filter approved, section, atau periode gaji.
`tyre_baris_dipindai` default 3000, minimum konfigurasi sah 200; rentang adalah
**ekor fisik sheet**, bukan tanggal terbaru (`_DetailTyre.js:945-993`).
`dipindai_sebagian` saat ini hanya diperiksa terhadap sheet inspeksi.
`tyre_rtd_kritis` dan `tyre_target_life_km` harus positif; kosong/tidak sah →0
bermakna belum ditentukan (`_DetailTyre.js:185-194`).

Urutan perhitungan:

1. Ambil KM maksimum per unit dari **seluruh WO**, lalu maksimum dari semua
   detail sebagai cadangan (`_DashboardTeknis.js:72-100`). Alasan: kiriman HP
   terlambat tidak boleh memundurkan acuan; data tyre saja dapat basi ketika
   unit lama hanya menerima WO field. Batas panel belum diterapkan di jalur
   ini, sehingga harus ditangani dalam kontrak target (§6).
2. Pemasangan terakhir per `(unit,pos)` dengan `instal_sn` terisi, berdasarkan
   `dicatat_at`; current source tidak menghapusnya ketika muncul remove-only
   (`:102-114`). Kondisi berasal dari catatan inspeksi terbaru di posisi yang
   sama; mengambil **After** RTD/pressure/suhu, tanpa fallback ke Before.
   Titik RTD mencakup seluruh catatan numerik bertanggal (`:125-139`).
3. `umur_hari = floor((now − waktu_pasang)/86400000)` atau null.
   `life_km = round(km_kini − km_pasang)` jika keduanya tersedia dan tidak mundur;
   `sisa = round(target − life_km)`;
   `persen_life = round(life_km × 100 / target)` (`:159-193`).
   Bila umur_hari >0, life_km >0, sisa >0:
   `sisa_hari = floor(sisa / (life_km/umur_hari))` dan tanggal = now+sisa_hari.
   Sisa ≤0 → `sudah lewat sasaran`; tanpa bukti → null/teks kosong.
   `parseFloat(g.km)||null` saat memasang menganggap nol hilang di sumber.
4. `kritis = rtd_kritis>0 && rtd!=null && rtd<=rtd_kritis`; urut RTD menaik,
   null terakhir. `laju_mm_hari` tambahan hanya bila dua RTD turun dan beda
   waktu ≥0,5 hari; ini **bukan dasar ramalan tanggal** (`:151-154,195-220`).
5. Problem: trim tepi `remove_problem`, yang kosong diabaikan, hitung jenis dan
   posisi lalu urut jumlah menurun (`:222-232`). Riwayat semua remove/instal
   urut waktu menurun. Repair dikelompok **SN setelah trim tepi**, case tetap
   dibedakan, metadata tidak kosong dari catatan terbaru; jangan melakukan
   normalisasi huruf otomatis (`:234-275`).

**Life selesai** `_hitungLifeSelesai` (`:282-407`): urut remove/instal waktu
menaik; pelihara pemasangan per unit-posisi dan akumulasi per SN. Pelepasan
harus cocok SN dengan pemasangan di posisi itu, memiliki kedua KM, dan
KM lepas ≥KM pasang. Tambah `round(KM lepas−KM pasang)` dan jumlah hari per
potongan. Remarks berisi `rotasi` atau `repair` (case-insensitive) → simpan
akumulasi, **belum selesai**. Selain itu → terbitkan satu umur final, hapus
akumulasi SN. Kemudian proses pemasangan pada baris yang sama. Tanpa pasangan
diabaikan, bukan ditaksir. Hasil urut KM turun; rata-rata global, merk+pattern,
dan **posisi pelepasan final** dibulatkan ke KM utuh; sertakan jumlah sampel.

> “Rancangan pertama menghitung per unit+posisi, jadi tiap rotasi membuat
> umurnya kembali dari nol” (`_DashboardTeknis.js:300-302`). Akumulasi per SN
> sepanjang rotasi wajib dipertahankan; satu selisih terakhir merusak analisis
> pembelian. Current Kondisi memakai umur pemasangan terakhir, berbeda dengan
> umur seumur-hidup di tab Life Time.

**Mingguan** `_emberMingguan` (`:410-459`): default 4, clamp 2–26, blok tujuh
hari mundur dari now (bukan Senin–Minggu), urut terlama→terbaru, batas
`timestamp > mulai && timestamp <= akhir`. Hitung **baris**, problem jika
remove_problem truthy; whitespace-only dihitung di sini tetapi terbuang di
tab Problem. Repair dikembalikan walaupun tidak diplot.

### 4b. Field: bulan, kejadian, shift

**PA, MTBF, MTTR tetap BULAN KALENDER.** `_periodeBulan` menghasilkan
`[tanggal 1 00:00, tanggal 1 bulan berikutnya 00:00)`, MOHH dari jumlah jam
kalender penuh, bukan elapsed month-to-date (`_DashboardField.js:92-104`).
Juli 31×24=744; September 30×24=720. Kutipan alasan
`_PeriodePayroll.js:23-28`: **“ketiganya milik kontrak dengan klien, bukan
milik payroll”**; menggesernya ke 16–15 membuat angka berbeda dengan klien.
Komentar menyebut “JUNI” bersama 744; itu tidak mengubah hitungan kalender:
**Juni 30 hari =720**, jadi jangan hardcode 744 untuk semua bulan.

Tetapan tunggal **DAY 06:00–18:00**, **NIGHT 18:00–06:00**
(`_DashboardField.js:46-47`); papan harian Performa meminjamnya
(`DashboardService.js:510-513`). Target gunakan satu modul shift bersama
(usulan `src/domain/shift.ts`); tanggal/jam eksplisit zona operasional
Asia/Jakarta, jangan bergantung zona proses server.

`_rakitKejadian` (`_DashboardField.js:113-160`):

1. Seluruh WO aktif+arsip. Buang unit kosong/OTHERS/WORKSHOP, section tyreman,
   status rejected/cancelled. **Tidak** mensyaratkan approved.
2. Jenis default breakdown; `job_type` katalog mengandung `prevent` → preventive.
   Preventive wajib start+end; down=start dan rfu=end, sebab downtime-nya jam
   kerja dan tidak mempunyai masa menunggu/SB1 (`:132-139`).
3. Kelompok kejadian = `(unit_id, unit_down_at)`; preventive memakai start.
   RFU = waktu RFU terbesar dalam kelompok. Daftar pekerjaan berisi hanya
   WO dengan start dan end. Tipe kelompok mengambil WO pertama.
4. Pilih kejadian yang **mulai** di bulan (`:286-317`). Jam dihitung **utuh
   sampai RFU**, atau now bila masih terbuka, sekalipun melewati bulan.
   Ini keputusan sumber, bukan interval downtime yang dipotong di batas bulan.
   Kejadian bulan lalu yang masih terbuka tidak masuk kelompok bulan sekarang.

`_potongPerShift` dan `_golongkanShift` (`:60-90,163-183`): pecah rentang pada
06:00,18:00,dan juga 00:00 dalam implementasi aktual; kedua potongan 18–00
dan 00–06 berlabel NIGHT. Setiap potongan yang disentuh WO preventive → SB0,
kalau ada WO lain → UB0, tanpa WO → UB1. **Seluruh jam potongan diberi satu
kategori**, bukan hanya menit overlap WO. Contoh kejadian 06–18 dengan WO
10–11 menghasilkan UB0=12 jam, bukan UB0=1/UB1=11. Ujung rentang dihitung
pecahan tanpa pembulatan ke shift penuh. Pagar loop 400 **potongan**, dengan
pemisah tengah malam aktual dapat mencapai 3 potongan per hari; komentar
“±200 hari” hanya cocok bila dua potongan per hari. Pagar lama dapat memotong
kejadian sangat panjang diam-diam; target harus melaporkan keterbatasan.

### 4c. WH, mutu HM, rasio

`_DashboardField.js:319-355`: baca `hour_meter >0` dengan waktu `created_at`
dari semua WO untuk unit yang punya kejadian; semua section/status dan luar
bulan ikut. KM tidak boleh dikonversi atau dimasukkan ke WH.

`_whPeriode` (`:185-267`): urut waktu menaik, buang bacaan lebih kecil dari
maksimum sebelumnya; jumlah buangan dilaporkan. <2 bacaan bersih → WH null.
Estimasi HM pada batas bulan: interpolasi linear jika diapit dua bacaan;
di luar cakupan jepit pada bacaan ujung, **tidak mengekstrapolasi**.
WH = `max(0, HM(akhir)−HM(mulai))`, dibulatkan 1 desimal. Liputan = panjang
irisan rentang bacaan dan bulan / panjang bulan. `lengkap` hanya bila kedua
batas berada di dalam rentang bacaan (equality ujung dianggap luar oleh kode);
selain itu liputan ≥0,6 → `sebagian`; <0,6 → `tipis`. UI masih menyebut
“direntangkan”, tetapi kode melakukan penjepitan, bukan proyeksi satu bulan.

| Angka | Rumus dan pembulatan aktual (`:367-404`) |
|---|---|
| Total BD | UB0+UB1+SB0; unit 2 desimal, ringkas 1 desimal |
| Kejadian/Freq | Sekali tiap kelompok kejadian, **termasuk preventive dan terbuka** |
| PA unit | `(MOHH−total_bd)/MOHH`, 4 desimal; tidak dijepit ke 0–1 |
| MTTR unit | total_bd/freq, 2 desimal; tanpa freq null |
| MTBF unit | WH/freq, 2 desimal, hanya WH non-null dan mutu bukan `tipis` |
| PA ringkas | `(MOHH×jumlah_unit−total_BD)/(MOHH×jumlah_unit)`; hanya unit dengan kejadian |
| MTTR ringkas | total_BD/total_freq |
| MTBF ringkas | jumlah WH yang layak / **semua freq**, termasuk unit tanpa WH layak; total WH nol →null |

Target PA (`:49-58`) dari `pa_target_{equipment_lowercase_spasi_jadi_underscore}`,
lalu `pa_target_default`; nilai >1 dibagi 100, 0<n≤1 dipakai langsung, lainnya
0 (belum ditentukan). Tidak ada clamp maksimum dalam sumber.
Pareto (`:312-316,406-419`) bertambah **per WO dalam kejadian** berdasarkan
job_id, lalu component_id, lalu `(tanpa kode)`; nama komponen dari katalog,
urut jumlah menurun. Total bukan distinct kejadian per komponen.

## 5. Terjemahan ke KMB Project

### Tabel pemetaan dan kekurangan skema

| KMB V2 | KMB Project / keadaan terverifikasi |
|---|---|
| `Config_Mechanics.may_view_technical` | `mechanics.may_view_technical` (`db/schema.sql:86`) |
| `unit_id`, `unit_name` | `units.id`, `unit_code`, `unit_name`; `is_virtual` mengganti sentinel (`:136-151`) |
| `Config_Units.unit_type` / equipment | **Belum ada padanan pasti**. `model_type` adalah model seperti TLD93A, `unit_models` kelas joblist; jangan otomatis menyamakan equipment |
| WO section, job | `sections.code`, `jobs.job_type` + `job_components`; `work_orders.section_id/job_id` |
| `unit_down_at`, `unit_rfu_at` | **Belum ada kolom/tabel pengganti dalam skema sekarang**. Wajib tersedia sebelum Field nyata; usulan tambah dua timestamptz pada WO, mengikuti kelompok sumber |
| start/end, created_at, meter | `work_orders.start_time/end_time/created_at/hour_meter/kilometers` (`:300-321`) |
| 3 sheet tyre | `job_detail_forms` + `work_order_detail_values`, pivot per WO/form/pos; lihat [03b-DETAIL-TYRE.md](03b-DETAIL-TYRE.md) |
| `dicatat_at`, `dicatat_oleh` | `work_order_detail_values.recorded_at/recorded_by` (`:653-662`), konsisten satu waktu per kiriman |
| Detail tyre `km` | **Tidak ada snapshot km khusus pada EAV**. Gunakan bacaan KM WO yang sudah dikoreksi dalam kontrak target; jangan fallback ke HM |
| setting tyre/PA | tabel `settings` (`:234`); nilai perlu disediakan/ditentukan, jangan menganggap seed sudah berisi |
| koreksi/panel | `meter_readings`, `meter_panel_changes`, `meter_corrections` (`:570-600`); rincian [06-KOREKSI-HM-KM.md](06-KOREKSI-HM-KM.md) |

Seed detail belum memuat seluruh field yang diperlukan (khususnya
`remove_remarks` untuk membedakan rotasi/repair dari akhir umur); daftar gap
ada di 03b. **Tanpa field itu, Life Time tidak boleh diklaim lengkap.**

### Sketsa kueri — usulan, belum endpoint/SQL produksi

Semua batas tenant ditegakkan lewat WO/unit/form; tabel detail dan meter tidak
memiliki tenant_id sendiri. Jangan menerapkan cut-off payroll/go-live pada
rantai KM/HM. Sumber akses Teknis tidak menyaring section setelah gerbang layar;
menambahkan scope baru adalah perubahan cakupan, bukan port diam-diam.

```sql
-- Contoh pivot inspeksi. Dijalankan sesudah autentikasi + hak Teknis.
-- Ini hanya pembentuk baris, belum menghitung current/life/semua metrik.
SELECT w.id AS wo_id, w.unit_id, d.position AS pos,
       max(d.recorded_at) AS dicatat_at, w.kilometers AS km,
       max(d.value_after) FILTER (WHERE d.field_key = 'rtd') AS rtd_after,
       max(d.value_after) FILTER (WHERE d.field_key = 'pressure') AS pressure_after,
       max(d.value_after) FILTER (WHERE d.field_key = 'suhu') AS suhu_after
FROM work_order_detail_values d
JOIN work_orders w ON w.id = d.work_order_id
JOIN job_detail_forms f ON f.id = d.form_id
WHERE w.tenant_id = $1 AND f.tenant_id = $1 AND f.code = 'tyre_inspeksi'
GROUP BY w.id, w.unit_id, w.kilometers, d.position;
```

Kode form harus mengikuti seed aktual (verifikasi `code` sebelum menjalankan
contoh). Nilai EAV masih teks: parsing numerik wajib membedakan null dari nol
dan menolak isian invalid, bukan `max(text)` untuk menentukan RTD terbaru.
Lakukan grouping terbaru di lapisan berikutnya, urut `dicatat_at, wo_id` untuk
tie yang stabil. SQL di atas tidak membuat field yang belum tersimpan.

```sql
-- Usulan setelah migrasi down/rfu dan pemetaan equipment selesai.
-- Ambil semua kejadian kandidat; jangan membuang bulan lalu di lapisan bacaan HM.
SELECT w.*, s.code AS section_code, j.job_type
FROM work_orders w
JOIN sections s ON s.id = w.section_id
LEFT JOIN jobs j ON j.id = w.job_id
JOIN units u ON u.id = w.unit_id
WHERE w.tenant_id = $1 AND u.tenant_id = $1
  AND NOT u.is_virtual AND s.code <> 'tyreman'
  AND w.status NOT IN ('rejected', 'cancelled');
-- Kelompokkan unit+down, lalu pilih down >= bulan_mulai AND down < bulan_akhir.
-- Jam kejadian tetap sampai rfu/now, tidak dipotong ke bulan_akhir.
```

Satu bentuk respons untuk nyata/demo: Tyre minimal `demo, kondisi, problem,
riwayat, repair, mingguan, life, ringkas, rtd_kritis, target_life_km,
dipindai_sebagian`; Field `demo, periode, mohh, hari, unit, pareto, terbuka,
ringkas`. Usulan GET `jenis=teknis_tyre|teknis_field`; jenis tersebut **belum
terdaftar** di `src/app/api/data/route.ts:15-36`. Setiap respons membawa mode
dan waktu perhitungan; hasil request yang sudah tertinggal akibat ganti dunia/
mode tidak boleh menimpa mode terkini. Demo dirakit di memori, tanpa seed atau
penulisan DB. Galat dibawa ke layar, tidak diubah menjadi statistik kosong.

## 6. Jebakan, komentar kecelakaan, dan selisih nyata

| Masalah aktual | Bukti dan tindak lanjut port |
|---|---|
| Demo menyala saat buka, banner menjanjikan reload mematikan | `Teknis.html:232-243` keputusan peragaan `MODE_DEMO=true`; `:456-458,497` sisa klaim lama. Catat fase demo sebagai konfigurasi eksplisit dan selaraskan teks dengan perilaku; jangan menganggap permintaan demo sudah berakhir |
| Cache beda dunia memberi data nyata di bawah saklar contoh | Komentar `:474-479`: “Layar yang setengah contoh setengah nyata lebih berbahaya…”; invalidasi **kedua** cache dan cek mode respons. Field saat ini menyalin mode global ketika respons tiba (`:320`), rawan balapan |
| `sisa_hm` vs `sisa_km` | `_DashboardTeknis.js:205` mengirim `sisa_hm`; `Teknis.html:641-643` membaca `sisa_km`. Target gunakan satu DTO `sisa_km`; ini perbaikan kontrak terbukti, bukan konversi unit |
| Panel reset belum mengalir ke seluruh statistik | `_Meter.js:159-184` acuan input sudah membaca panel, tetapi `:420-446` KM terakhir tidak; `_DashboardField.js:218-266` WH tidak; fallback tyre `:92-100` dapat menghidupkan kembali angka panel lama. Segmentasikan meter menurut panel sebelum hitung delta; belum boleh menjanjikan dashboard sudah aman reset |
| Nilai di WO sudah dikoreksi, snapshot detail lama belum | `_Meter.js:346-358` hanya memperbaiki WO; `_DashboardTeknis.js:92-100` masih mengambil maksimum snapshot tyre. Target gunakan satu bacaan efektif dan propagasi koreksi yang jelas, lihat 06 |
| Pareto label kejadian, loop per WO | `_DashboardField.js:312-316` vs `Teknis.html:418-419`. Pertahankan fakta ini di uji pembanding; pemilihan distinct kejadian atau perubahan label perlu keputusan sebelum mengubah arti angka |
| Angka PA bisa negatif, PA rata-rata bukan seluruh armada | Periode menampung downtime utuh kejadian yang mulai di bulan, tanpa union overlap (`:286-317,373-404`); unit tanpa kejadian tidak masuk. Tidak boleh diam-diam clamp atau menyebut fleet-wide availability |
| Sisa copy HM/KM dan status ban | `_DashboardTeknis.js:162` komentar “jam mesin” tetapi variabel KM; `Teknis.html:747-749` masih menyebut KM saat submit; `_KoreksiKm.js:15-23` menyatakan kini saat create. Kondisi memilih pemasangan terakhir tanpa menghapus remove-only (`:107-114`), sehingga “terpasang” belum membuktikan benar-benar masih terpasang |
| SN “apa adanya” ternyata trim tepi | `_DashboardTeknis.js:251-258,338,369`: trim whitespace luar dilakukan, case dan whitespace internal tetap. Dokumen/implementasi jangan menjanjikan normalisasi nol atau menyamakan semua variasi |

WH sumber mengecilkan hasil saat bacaan jarang; alasan perbaikan dari min/max
di dalam bulan tercatat `_DashboardField.js:189-208`: satu bacaan membuat WH
nol, bacaan bulan lalu hilang, separuh awal bulan hilang. **Bawa mutu bacaan
bersama angka**, bukan hanya algoritmanya. Ketidaksesuaian di atas dicatat untuk
penyelesaian saat implementasi; sesi spek tidak mengubah bisnis/DB.

## 7. Yang sudah tidak perlu ditiru

- URL GAS `/exec` harfiah, token DOM, workaround `&token` yang menjadi satu
  nilai `page` (`Teknis.html:129-133,191-230`): target memakai rute+sesi lokal.
  Bawa prinsip autentikasi setiap endpoint, bukan URL deployment sumber.
- Batas ekor sheet 3000 dan full-scan berulang bukan kebutuhan Postgres.
  Pakai index dan kueri terarah; bila tetap pagination/limit, nyatakan cakupan,
  jangan menampilkan “semua” setelah truncation. Analisis life memerlukan
  riwayat pasangan yang lengkap.
- Catch yang mengembalikan data kosong (`_DashboardField.js:283-284`,
  `_DetailTyre.js:990-992`) bertentangan dengan invarian target. Bedakan belum
  ada data, konfigurasi belum ada, dan galat akses/DB.
- SVG boleh tetap langsung dan mandiri: alasannya grafik CDN yang gagal muat
  meninggalkan lubang kosong saat presentasi (`Teknis.html:79-81`). Tidak ada
  keharusan menambah pustaka grafik.
- Satu `work_orders` menggantikan sheet aktif+arsip. Cut-off tampilan payroll
  tidak ditempel ke pembaca universal (`_PeriodePayroll.js:419-427`).

## 8. Daftar periksa selesai saat membangun

- [ ] Hak per-orang diperiksa di halaman dan semua GET, tenant tidak bocor.
- [ ] Dua dunia, posisi saklar, enam tab, tabel, angka, tooltip dan keadaan kosong identik kontrak.
- [ ] Mode demo eksplisit, banner selalu sesuai respons, kedua cache invalid, pergantian cepat tidak mencampur data; tidak ada penulisan DB.
- [ ] Mapping equipment, down/rfu, seluruh field detail termasuk remarks, dan sumber KM efektif tersedia.
- [ ] Tyre: RTD After/null/0/ambang, sisa_km DTO, terlambat dari HP, remove-only, SN beda case, dan ketiadaan target teruji.
- [ ] Life: pasang→rotasi lintas unit→repair→pasang→buang menjumlah semua potongan, tanpa menghitung rotasi sebagai umur final.
- [ ] Grafik tujuh-hari bergulir, batas `(mulai,akhir]`, jumlah baris per posisi, sumbu Y nol.
- [ ] Bulan 28/29/30/31 hari, lintas tahun dan zona waktu eksplisit; tidak memakai periode gaji 16–15.
- [ ] Shift 06/18, pemisah tengah malam sumber, ujung pecahan, WO overlap, preventive, kejadian terbuka/lintas bulan, dan pagar kejadian panjang punya hasil terjelaskan.
- [ ] WH: bacaan sebelum/sesudah bulan, satu bacaan, nol, mundur, liputan 59,9%/60%, equality batas, serta reset panel.
- [ ] Rasio ringkas mengikuti penyebut kontrak; keputusan Pareto dan PA tanpa target/negatif dicatat sebelum angka dipresentasikan sebagai final.
- [ ] Galat DB tampak sebagai galat; data contoh dan nyata tidak disimpan bercampur.
