# Layar 6 — Koreksi HM & Koreksi KM

> **Sumber:** `Hm.html` (276 baris) · `Km.html` (277) · `_KoreksiHm.js` (105) ·
> `_KoreksiKm.js` (86) · **`_Meter.js` (448) ← inti sesungguhnya**, di
> `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`, cabang
> `feature/token-auth-web`, HEAD `d806ee5`. Dibaca 15 Sep 2026. **Baca saja.**
>
> **Sasaran KMB Project:** `/koreksi/hm` dan `/koreksi/km`
> (`src/app/koreksi/hm/page.tsx`, `km/page.tsx` — keduanya masih penanda) +
> modul baru `src/domain/meter.ts`. Tabel sudah ada:
> `db/schema.sql:570-600`. **Dokumen ini kontrak porting, bukan pernyataan
> layarnya sudah dibangun.**

**Dua menu, satu mesin.** `_KoreksiHm.js` dan `_KoreksiKm.js` hanyalah pembungkus
tipis — delapan baris pemetaan nama masing-masing. Seluruh aturannya tinggal di
`_Meter.js`, sekali.

---

## 1. Kenapa layar ini ada

`_KoreksiHm.js:5-26` — kutip utuh, karena inilah seluruh alasan layar ini:

> Jam mesin tidak pernah berkurang. Itu bukan sekadar kebiasaan — ia sifat
> alatnya, dan karena itu boleh dijadikan aturan.
>
> **Dua bentuk kesalahan, dan yang kedua lebih berbahaya:**
>
> - **TERLALU KECIL** — ketahuan langsung, ditolak pagar, mekanik mengetik ulang.
> - **TERLALU BESAR** — **LOLOS pagar, karena ia memang lebih besar.**
>
> Yang kedua itu racun. Satu kali kepencet `999999` membuat angka itu jadi acuan
> tertinggi, dan sejak saat itu **setiap** bacaan sah berikutnya lebih kecil —
> lalu ikut ditolak pagar, dan yang sudah tercatat ikut dibuang perhitungan WH.
> **Satu salah pencet meracuni riwayat HM unit itu selamanya.**
>
> Karena itu koreksi **tidak cukup** berupa “tambah bacaan baru”. Ia harus bisa
> **memperbaiki bacaan tertentu** — dan itulah bentuk alat ini.

Kenapa dipagari di pintu masuk, bukan dibiarkan lalu diperiksa (`:8-14`):

> Rancangan pertama membiarkan angka apa pun masuk dengan alasan “panel jam bisa
> diganti”. Itu menukar satu kejadian langka dengan kesalahan harian: HM dipakai
> menghitung umur tyre **dan** MTBF unit, dan sekali angka ngawur masuk, ia ikut
> ke mana-mana **tanpa satu pun galat muncul**.

---

## 2. Susunan layar (`Hm.html:92-113`, `Km.html:92-113`)

Kedua halaman **identik strukturnya**:

```
navbar                                       Hm.html:60-90
.container
├── h1   "Koreksi HM"  /  "Koreksi KM"        :93
├── p.sub  paragraf penjelas                  :94-99
├── .kartu  →  label + select#selUnit         :101-110
└── #isi    diisi JS setelah unit dipilih     :112
```

Paragraf penjelas (`:94-99`) — **HM**:

> Jam mesin tidak pernah mundur, jadi angka yang mundur ditolak saat WO dibuat.
> Halaman ini untuk dua hal yang *tidak* tertangkap pagar itu: angka yang salah
> ketik ke atas — yang justru lolos karena lebih besar — dan panel jam yang
> benar-benar diganti.

Pemilih unit: `— pilih no lambung —`, lalu tiap unit sebagai
`{unit_name} ({unit_id})`. **`OTHERS` dan `WORKSHOP` dilewati** (`:105-106`) —
keduanya bukan unit sungguhan dan tak punya meter.

Tanpa unit terpilih, `#isi` kosong sama sekali. Setelah dipilih:
`Memuat riwayat…`.

---

## 3. Isi `#isi` — tiga kartu (`gambar()`, `:176-240`)

### 3a. Kartu “Acuan sekarang” (`:179-190`)

Kotak `.acuan` — latar `#f0f9ff`, border `#bae6fd`, teks `#075985`.

Ada acuan:
```
{nilai} — tercatat {d Mmm yyyy HH:MM} oleh {nama} · {wo_number}
WO berikutnya pada unit ini harus ber-HM sama atau lebih besar daripada angka ini.
```

Belum ada:
```
Belum ada bacaan HM untuk unit ini. Angka pertama yang masuk akan jadi acuannya.
```

Format jam (`:150-157`): `15 Sep 2026` lalu jam `08:30` berwarna `#94a3b8`.
Bulan pendek: `Jan Feb Mar Apr Mei Jun Jul Agt Sep Okt Nov Des`.

### 3b. Kartu “Panel jam diganti” (`:193-210`)

Paragraf:
> Sesudah dicatat, hitungan dimulai lagi dari angka baru — bacaan panel lama
> tidak lagi jadi acuan, dan jam kerja tidak dihitung menyeberangi titik ini.

Tiga isian + satu tombol:

| id | label | jenis | placeholder |
|---|---|---|---|
| `gpHm` / `gpKm` | `HM panel baru` | `number`, `step=any`, `min=0` | `cth: 0` |
| `gpAt` | `Berlaku sejak` | `text` | `2026-09-01 08:00` |
| `gpAlasan` | `Alasan` | `textarea rows=2` | `cth: panel jam rusak, diganti unit baru 1 Sep` |

Tombol `.btn.btn-utama` — `Catat penggantian`.

Riwayat penggantian di bawahnya bila ada (`:203-209`):
`Sudah tercatat: **0** sejak 1 Sep 2026 08:00 · **12500** sejak …`

### 3c. Kartu “Riwayat bacaan HM” (`:213-237`)

Kosong → `Belum ada bacaan HM untuk unit ini.` dan **berhenti di situ**
(dua kartu di atas tetap tampil).

Ada isi → kotak `.catatan` lebih dulu (latar `#fffbeb`, border `#fde68a`,
teks `#78350f`):

> **Yang bertanda MELOMPAT paling perlu diperiksa.** Angka yang kelewat besar
> lolos pagar justru karena ia lebih besar — lalu ia jadi acuan, dan setiap
> bacaan sah sesudahnya ikut tertolak. Satu salah pencet bisa meracuni seluruh
> riwayat unit ini.

Tabel, tujuh kolom:

| WO | Tanggal | Section | Oleh | HM (kanan) | tanda | tombol |
|---|---|---|---|---|---|---|

- Baris dapat kelas `mundur` atau `melompat`; `tr.melompat td` berlatar `#fef2f2`.
- Lencana `.tag.tag-melompat` = `#fecaca` / `#7f1d1d`.
- Kolom terakhir: tombol `.btn.btn-halus` berbunyi `Perbaiki`.
- **Terbaru di atas** (`_Meter.js:314` — `kumpul.reverse()`).

---

## 4. Dua tindakan

### 4a. `perbaiki(woId, woNo, hmLama)` (`Hm.html:242-258`)

Dua `prompt()` berurutan. Teksnya **bawa apa adanya** — keduanya menjelaskan
sesuatu yang tidak jelas dengan sendirinya:

```
HM baru untuk {woNo}

Sekarang: {hmLama}

Kosongkan sama sekali kalau angka yang benar tidak diketahui —
lebih baik hilang daripada salah.
```

```
Alasan koreksi (wajib, minimal 5 huruf).

Angka HM yang berubah tanpa sebab tertulis mustahil dijelaskan nanti.
```

Batal di salah satu prompt → tidak terjadi apa-apa. Sukses → `alert('Tersimpan.')`
lalu `muat()` ulang.

> **Di KMB Project ganti `prompt()` dengan modal.** Bukan karena `prompt` jelek,
> tapi karena kalimat keduanya panjang dan `prompt` memotongnya di sebagian
> peramban. **Teksnya tetap** — yang berubah wadahnya.

### 4b. `simpanPanel()` (`:260-273`)

Keempatnya wajib: unit, HM baru, tanggal berlaku, alasan.
Kurang satu → `Unit, HM baru, tanggal berlaku, dan alasan wajib diisi.`
Sukses → `alert('Penggantian panel tercatat.')` lalu `muat()`.

---

## 5. Mesinnya — `_Meter.js`

### 5a. Tabel keterangan (`:33-68`)

Yang membedakan HM dan KM **hanya isian tabel ini**:

| medan | `hm` | `km` |
|---|---|---|
| `kunci` (kolom di baris WO) | `hour_meter` | `kilometers` |
| `label` | `HM` | `KM` |
| `panjang` | `jam mesin` | `kilometer` |
| `satuan` | `jam` | `km` |
| `menu` | `Koreksi HM` | `Koreksi KM` |
| **`lompat`** | **2000** | **20000** |

Ambang lompat HM (`:45-47`):
> 2.000 jam ≈ tiga bulan kerja penuh. Lompatan sebesar itu dalam sekali catat
> bukan pemakaian, melainkan salah ketik.

Ambang lompat KM (`:60-66`) — **penulisnya sendiri menandainya sementara**:
> 20.000 km — **angka sementara**, dan saya menandainya begitu dengan sengaja.
> Untuk HM angkanya diturunkan dari jam kerja nyata; untuk KM saya belum punya
> data jarak tempuh harian unit KMB. Sesuaikan begitu terlihat pola sesungguhnya:
> ia hanya **menandai** yang janggal di layar koreksi, **tidak menolak apa pun**,
> jadi salah tebak di sini tak menghalangi siapa pun bekerja — ia cuma membuat
> penandanya kurang berguna.

**Di KMB Project taruh kedua ambang di tabel `settings`**, bukan konstanta kode.
Kunci: `meter_lompat_hm`, `meter_lompat_km`.

### 5b. `acuanMeterUnit(unitId, jenis)` (`:159-185`)

> Hanya bacaan **sesudah penggantian panel terakhir** yang dihitung. Kalau tidak,
> panel baru yang mulai dari nol akan selamanya ditolak karena kalah oleh angka
> panel lama. (`:150-155`)

Langkahnya:
1. Ambil penggantian panel terakhir unit ini → `sejakMs`, nilai dasar.
2. Pindai seluruh WO unit itu; lewati yang `created_at < sejakMs` (milik panel lama).
3. Ambil **yang terbesar**, bukan yang terbaru.

### 5c. `periksaMeterMasuk(unitId, nilai, jenis)` (`:213-230`)

| masukan | hasil |
|---|---|
| kosong / bukan angka | `{ok: true}` — **tidak ditolak** |
| `≤ 0` | `{ok: false}` — `{LABEL} harus lebih dari 0.` |
| belum ada acuan | `{ok: true}` |
| `≥ acuan` | `{ok: true}` |
| `< acuan` | `{ok: false}` + pesan di bawah |

```
{LABEL} tidak boleh mundur. Unit ini sudah tercatat {nilai} oleh {nama}.
Kalau panelnya memang diganti, minta L1/L2 mencatatnya lewat menu {Koreksi HM}.
```

> **Tidak menolak yang kosong** (`:210-211`): isian meter tetap opsional sampai
> Gabriel menyalakannya wajib. Yang ditolak hanya angka yang **mustahil**.
>
> Ini sejalan dengan `WorkOrder.html:1017-1021` — medan HM di Create WO sengaja
> **tidak** ditandai wajib, karena tanda bintang di sana menjanjikan pagar yang
> tak ada.

### 5d. Penandaan janggal (`riwayatMeterUnit`, `:287-300`)

Diurut menaik menurut waktu, lalu ditandai atas `tertinggi` yang berjalan:

```
b.nilai < tertinggi                    → 'mundur'    (ketahuan langsung)
b.nilai - tertinggi > cfg.lompat       → 'melompat'  (racun yang lolos pagar)
```

`tertinggi` hanya naik, tak pernah turun. Lalu `reverse()` — terbaru di atas.

Nama pengganti email diambil **sekali di akhir** (`:302-312`), bukan sekali per
baris.

### 5e. `koreksiMeterWo(...)` (`:321-369`)

| pagar | pesan |
|---|---|
| bukan L1/L2 | `{Koreksi HM} hanya untuk L1 dan L2.` |
| alasan < 5 huruf | `Alasan wajib diisi. Angka HM yang berubah tanpa sebab tertulis mustahil dijelaskan nanti.` |
| WO tak ada | `WO tidak ditemukan: {id}` |
| nilai baru ≤ 0 (dan bukan kosong) | `HM baru harus lebih dari 0, atau dikosongkan.` |

Lalu: **tulis ke baris WO itu sendiri**, dan catat jejaknya.

> Dua yang pertama menyunting baris WO-nya sendiri, supaya **sumber kebenarannya
> tetap satu**. Sheet ini hanya **jejaknya** — siapa mengubah apa, dari berapa ke
> berapa, kenapa. Tanpa jejak itu, angka yang berubah diam-diam mustahil
> dijelaskan kepada orang yang mempertanyakannya. (`_KoreksiHm.js:33-36`)

Jenis jejak: `perbaiki` bila ada nilai baru, `hapus` bila dikosongkan.

### 5f. `catatGantiPanelMeter(...)` (`:372-410`)

Pagar tambahan:
- tanggal wajib sah → `Tanggal & jam berlaku wajib diisi.`
- **tidak boleh di masa depan** (toleransi 1 jam, `:386`) →
  `Tanggal berlaku tidak boleh di masa depan.`
- nilai `< 0` ditolak; **`0` DIPERBOLEHKAN** (`:381`) — panel baru memang mulai
  dari nol.

Jejak jenis `ganti_panel`, `wo_id` kosong. Memo di-nol-kan (`:402`).

### 5g. `meterTerakhirPerUnit(jenis)` (`:420-447`)

Yang mengisi `HM_TERAKHIR` / `KM_TERAKHIR` di layar Create WO
(lihat [`02-CREATE-WO.md`](02-CREATE-WO.md) §3c).

> Yang diambil yang **paling besar**, bukan yang tanggalnya paling baru: meter
> tak pernah mundur, dan WO yang dibuat menyusul untuk pekerjaan kemarin tidak
> boleh menarik angka ini mundur. (`:413-417`)

---

## 6. Tiga salin-tempel yang tertinggal di sumber — **JANGAN ikut diport**

Ditemukan saat membaca, bukan dilaporkan siapa pun. Ketiganya di jalur KM:

1. **`Km.html:95`** — “**Jam mesin** tidak pernah mundur” di halaman *Koreksi KM*.
   Salinan dari `Hm.html:95` yang lupa diganti. Seharusnya *kilometer*.
2. **`Km.html:194`** — judul kartu “**Panel jam** diganti” di halaman KM.
   Seharusnya “Panel kilometer diganti”.
3. **`_Meter.js:361` dan `:404`** — `logAuditAction(AUDIT_ACTIONS.KOREKSI_HM, …)`
   dipakai **juga untuk KM**. Jenis meternya memang ikut di `details`
   (`{meter: c.label, …}`), jadi datanya tidak hilang — tapi menyaring audit log
   menurut aksi akan menyebut koreksi KM sebagai koreksi HM.

Ada juga divergensi kecil yang **bukan bug**: `Hm.html:181` membaca
`d.acuan.hm` sementara `Km.html:182` membaca `d.acuan.nilai`. Keduanya bekerja
karena `_bungkusAcuan` (`:187-204`) sengaja menerbitkan nilainya dua kali —
sekali sebagai `nilai`, sekali di bawah nama meternya — supaya layar HM lama
tidak perlu diubah sebaris pun. **Di KMB Project cukup `nilai`.**

---

## 7. Terjemahan ke KMB Project

### 7a. Pemetaan tabel

| KMB V2 | KMB Project |
|---|---|
| `WorkOrders.hour_meter` / `.kilometers` | `work_orders.hour_meter` / `.kilometers` |
| sheet `HmKoreksi` / `KmKoreksi`, `jenis='perbaiki'\|'hapus'` | `meter_corrections` |
| sheet yang sama, `jenis='ganti_panel'` | `meter_panel_changes` |
| — (tak ada di V2) | `meter_readings` |
| `METER.hm.lompat` / `.km.lompat` | `settings.meter_lompat_hm` / `_km` |
| `_bolehKoreksiMeter` | peran `supervisor` \| `superintendent` |

`odometer_type` sudah ada sebagai enum `('KM','HM')` (`db/schema.sql:30`).
`meter_panel_changes.reason` dan `meter_corrections.reason` sudah punya
`CHECK (length(reason) >= 5)` — pagar alasan **sudah di basis data**, bukan cuma
di aplikasi.

> **Keputusan yang perlu diambil: `meter_readings` ada di skema tapi tak ada
> padanannya di KMB V2.** Di V2 acuan dipindai dari kolom `hour_meter` seluruh
> WO setiap kali dibutuhkan — mahal, tapi sumber kebenarannya satu.
> Dengan `meter_readings` sebagai tabel terpisah, ada **dua** tempat yang harus
> sejalan, dan itu persis bentuk kesalahan yang dokumen ini berusaha cegah.
>
> **Saran:** `meter_readings` diisi sebagai **turunan** — satu baris ditulis di
> transaksi yang sama saat `hour_meter`/`kilometers` WO berubah (dibuat,
> dikoreksi, dikosongkan), dengan `work_order_id` yang menautkannya balik.
> Kalau keduanya berselisih, WO yang menang. Sertakan uji yang membuktikan itu.
> Alternatifnya: buang `meter_readings`, pindai `work_orders` seperti V2 —
> dengan index, ongkosnya tak lagi jadi alasan.

### 7b. Modul `src/domain/meter.ts`

Satu modul untuk kedua meter, meniru `_Meter.js` — **jangan dua berkas kembar**
(`_Meter.js:12-22`):

> Menyalinnya untuk KM berarti dua tempat yang harus diingat bersamaan setiap
> kali aturannya berubah — dan yang terlupa selalu yang lebih jarang dipakai.

```ts
export type JenisMeter = 'HM' | 'KM';

acuanUnit(unitId, jenis): Promise<Acuan | null>
periksaMasuk(unitId, nilai, jenis): Promise<{ok, pesan?, acuan?}>
riwayatUnit(unitId, jenis): Promise<{acuan, panel[], bacaan[]}>
meterTerakhirPerUnit(jenis): Promise<Record<number, {nilai, oleh, at}>>
```

Dua perintah lewat `runCommand` (`src/domain/runCommand.ts`):
`koreksi_meter_wo` dan `ganti_panel_meter`.

Acuan sebagai satu kueri:

```sql
WITH panel AS (
  SELECT changed_at, value_after
    FROM meter_panel_changes
   WHERE unit_id = $unit AND kind = $jenis
   ORDER BY changed_at DESC LIMIT 1
)
SELECT w.wo_number,
       CASE WHEN $jenis = 'HM' THEN w.hour_meter ELSE w.kilometers END AS nilai,
       w.created_at, m.name AS oleh
  FROM work_orders w
  JOIN mechanics m ON m.id = w.created_by
 WHERE w.unit_id = $unit
   AND coalesce(CASE WHEN $jenis='HM' THEN w.hour_meter ELSE w.kilometers END, 0) > 0
   AND w.created_at >= coalesce((SELECT changed_at FROM panel), '-infinity')
 ORDER BY nilai DESC          -- TERBESAR, bukan terbaru
 LIMIT 1
```

> `ORDER BY nilai DESC`, **bukan** `created_at DESC`. Ini satu-satunya baris di
> kueri ini yang mudah “dirapikan” jadi salah.

### 7c. Rantai meter tidak boleh disaring

`_PeriodePayroll.js:419-427` — penyaring ambang sengaja **tidak** dipasang di
dalam `readAllWorkOrdersBothSheets()`:

> Fungsi itu juga melayani riwayat HM/KM, deteksi WO kembar, dan pencarian WO per
> id — yang semuanya justru harus tetap melihat data lama. Menyaring di sana akan
> **memutus rantai meter** dan membuat WO kembar lama tak terdeteksi.

Di KMB Project: penyaring periode/scope milik layar Performa dan Reports.
`meter.ts` **tidak boleh memakainya**.

---

## 8. Daftar periksa selesai

Dicentang 16 Sep 2026.

- [x] Dua rute, **satu** modul `meter.ts` — jangan dua berkas kembar
- [x] `OTHERS` / `WORKSHOP` tidak muncul di pemilih unit
- [x] Acuan = nilai **terbesar sesudah panel terakhir**, bukan yang terbaru
- [x] Panel baru bernilai `0` diterima; tanggal masa depan ditolak (toleransi 1 jam)
- [x] Kosong **tidak** ditolak `periksaMasuk`; hanya yang mustahil
- [x] Penanda `mundur` & `melompat`, ambang dari `settings` bukan kode
- [x] Kotak peringatan MELOMPAT muncul di atas tabel
- [x] Alasan minimal 5 huruf — dipagari aplikasi **dan** `CHECK` basis data
- [x] Koreksi menulis ke `work_orders`, bukan ke tabel jejak
- [x] Jejak mencatat nilai lama **dan** baru + siapa + kenapa
- [x] Audit log KM tidak berlabel `KOREKSI_HM`
- [x] Teks KM tidak menyebut “jam mesin” / “panel jam”
- [x] `meter.ts` tidak memakai penyaring periode mana pun
- [x] `meterTerakhirPerUnit` memberi makan catatan kaki di Create WO
