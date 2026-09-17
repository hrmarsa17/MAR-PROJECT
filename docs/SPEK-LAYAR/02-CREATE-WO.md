# Layar 2 — Create Work Order

> **Sumber:** `WorkOrder.html` (2.105 baris) + `WorkOrderService.js` +
> `JobCatalogService.js` di `MAR-project`, cabang `feature/token-auth-web`.
> **Baca saja.**
>
> **Sasaran KMB Project:** `src/app/wo/baru/FormWo.tsx` (sudah ada, belum lengkap)
> + `src/domain/workOrder.ts` + `src/domain/kueri.ts:katalog()`.

Layar paling rumit di sistem. Ia melahirkan WO — dan hampir semua kecelakaan uang
di KMB V2 bermula atau bisa dicegah di sini.

**Catatan penting:** seluruh formulir **dibangun oleh JavaScript**, bukan HTML
statis. `buildBlockHtml(id)` di `:988-1163` adalah sumber kebenaran susunan satu
blok joblist. Baca fungsi itu, bukan screenshot.

---

## 1. Susunan halaman

```
navbar                                        WorkOrder.html:363-377
.page-header                                  :380-383
  h1  "Create Work Order 📝"
  p   "Tambahkan satu atau beberapa pekerjaan sekaligus. Setiap blok di
       bawah akan terbit sebagai 1 work order dengan nomor sendiri."
.form-container > form#createWOForm           :385-412
  ├── .grup-bar          Model pembuatan      :387-402
  ├── #blocksContainer   blok joblist         :404
  ├── button#addBlock    "+ Add Joblist"      :406
  └── .form-actions      Cancel · Create WO   :408-411
#loadingOverlay                               :2083-2088
#successModal (struk)                         :2091-2104
```

---

## 2. `.grup-bar` — Model pembuatan (`:387-402`)

Label `Model pembuatan`, lalu **tiga kartu radio** `name="grupMode"`:

| value | judul kartu | baris kecil |
|---|---|---|
| `` (kosong, **checked**) | `📄 Bebas` | `tiap joblist berdiri sendiri` |
| `unit` | `🚜 1 unit · banyak job` | `unit dikunci` |
| `job` | `🔧 1 job · banyak unit` | `job dikunci` |

Di bawahnya `<p class="grup-hint" id="grupHint">` yang **berubah isinya**
(`:638-643`):

- Bebas → `Bebas: setiap joblist boleh unit dan job berbeda, terbit sebagai WO terpisah tanpa ikatan grup.`
- unit → `Satu unit dikerjakan beberapa job. Unit joblist #1 jadi acuan dan dikunci untuk semua joblist; job tiap baris harus berbeda.`
- job → `Satu job dikerjakan di beberapa unit. Job joblist #1 jadi acuan dan dikunci untuk semua joblist; unit tiap baris harus berbeda.`

Lalu tombol `#btnSemuaUnit.btn.btn-outline.btn-semua-unit` berlabel
`🌐 Tampilkan semua unit` ⇄ `🔽 Sembunyikan unit global` (`:1818-1822`).

Lalu `.grup-ringkas#grupRingkas`, tersembunyi saat mode Bebas (`:800-830`):

```
Unit acuan  |  (nama unit) atau "(belum dipilih)"
Jumlah baris|  N joblist
Manpower    |  N orang · M penugasan        ← "· M penugasan" hanya bila M ≠ N
```

Manpower dihitung sebagai **orang berbeda** di seluruh grup (`:812-814`) — satu
mekanik yang muncul di tiga baris tetap satu orang yang harus disiapkan.

### Aturan grup yang wajib ikut

- **Grup hanya untuk `tyreman` dan `field`** (`:620-625`). Workshop tak punya
  unit, jadi tak ada sumbu kedua untuk divariasikan. Menolak di depan lebih baik
  daripada gagal saat kirim.
- Pindah ke Workshop saat mode grup menyala → mode **otomatis kembali ke Bebas**
  + notifikasi `Mode grup dimatikan — Workshop tidak punya unit untuk divariasikan.`
  (`:1434-1441`)
- **Acuan dikunci begitu ada ≥2 baris** (`:738-772`). Mengubah acuan menuntut
  hapus joblist lain dulu — itu yang membuat ikatan grup terasa nyata.
  - mode `unit` → kunci semua pemilih unit, tampilkan `.tanda-unit`
  - mode `job` → kunci component-select + seluruh cascade, tampilkan `.tanda-job`
  - **radio Section selalu ikut terkunci**: grup lintas-section tidak sebanding
- Teks tanda kunci: `🔒 Unit dikunci oleh grup — hapus joblist lain untuk mengubah`
  (dan versi Job-nya).
- `setKunci()` (`:774-790`) menyimpan `data-dis-asli` sebelum mengunci — kolom
  cascade bisa `disabled` karena sebab lain (induknya belum dipilih), dan membuka
  kunci tak boleh ikut mengaktifkannya.
- **Buka semua dulu, lalu kunci yang perlu** (`:757-759`) — mengunci selektif per
  mode meninggalkan kolom terkunci saat mode berganti. Bug ini sudah kena sekali
  di PWA.
- Blok baru langsung mewarisi acuan dari joblist #1 (`:1480-1483`).
- Turun ke 1 baris = grup bubar, acuan terbuka lagi (`:1494-1496`).

### Sinkronisasi acuan (`sinkronAcuanGrup`, `:649-677`)

Hanya blok **#1** yang boleh jadi sumber (`:658-660`) — perubahan di blok lain
tidak boleh menyeret seluruh grup. Section blok lain dipaksa ikut acuan.

Mode `job`: `salinJobKe()` (`:692-729`) memasang ulang component → sub → job di
blok tujuan setelah cascade-nya dibangun ulang mengikuti unitnya. **Job dicocokkan
lewat TEKS, bukan `job_id`** (`:722-723`) — `job_id` berbeda per `unit_model`
walau pekerjaannya sama persis. Kalau tak ketemu → `jobTakCocok()`: unit
dikosongkan + notifikasi `Job acuan tidak tersedia untuk {unit} — pilih unit lain.`
**Tolak terang-terangan, jangan diam-diam mengosongkan pilihan** — itu yang bikin
orang mengira formnya rusak.

---

## 3. Satu blok joblist — `buildBlockHtml(id)` (`:988-1163`)

Urutan elemen di dalam `.wo-block`, **tepat seperti ini**:

```
1  .block-header         "Joblist #N"  +  tombol ×
2  .others-banner        tersembunyi
3  Section               radio kartu
4  HM/KM Unit            (kondisional — lihat §3c)
5  Keterangan untuk Mekanik   textarea
6  .others-check-row     checkbox "Job manual (Others)"  (L1/L2 saja)
7  .cascade-group        Unit · Model · Component · Sub · Job
8  .form-row.tyreman-group    Joblist · Unit · Job Description
9  .others-manual-section     Base Points · Target Hours · Unit Factor
10 .form-row             Location (2 kartu)  ·  Work Condition
11 .component-preview    Preview 5 baris     (L2 saja)
12 .form-section.team-section  Team Composition
```

### 3a. Header blok

`.block-title` = `Joblist #N`, dinomori ulang oleh `renumberBlocks()`
(`:1500-1508`). Tombol `.remove-block` (`×`) **disembunyikan saat hanya ada 1
blok**. Menghapus blok terakhir ditolak: `Minimal 1 joblist.`

### 3b. Section (`sectionRadiosHtml`, `:977-986`)

Radio kartu, label dengan ikon:

| value | label |
|---|---|
| `tyreman` | `🛢️ Tyreman` |
| `field` | `🚜 Field` |
| `workshop` | `🏭 Workshop` |

Yang ditampilkan hanya section dalam `ALLOWED_SECTIONS` = `userScope` atau, bila
kosong, ketiganya (`:454-455`). **Yang pertama otomatis `checked`.**

### 3c. Medan HM/KM — dirender bersyarat (`:1004-1027`)

> **Keputusan Gabriel 11 Sep 2026: TIDAK DIRENDER, bukan `display:none`.**
>
> `kilometers` pernah **terhapus pada setiap kiriman** karena medannya
> disembunyikan secara tampilan sementara kodenya tetap membaca lalu menuliskan
> nilai kosongnya. Medan yang tidak ada tidak bisa salah dibaca —
> `querySelector` mengembalikan `null`, dan nilai kosong memang tak pernah
> dikirim.

Dikendalikan `TAMPIL_METER` (`Constants.gs: TAMPILKAN_METER_BUAT_WO`).
Di KMB Project: baris `settings` dengan kunci `tampilkan_meter_buat_wo`.

**Tidak ditandai wajib** (`:1017-1021`): server memang tidak pernah menuntutnya,
jadi tanda bintang di sini menjanjikan pagar yang tak ada. Mekanik yang tak sempat
melihat panelnya tetap harus bisa membuat WO.

Label & satuan **berganti mengikuti section** (`meterBlok`, `:902-914`):

| section | label | kunci kirim | placeholder | hint |
|---|---|---|---|---|
| `tyreman` | `KM` | `kilometers` | `cth: 84200` | `(kilometer saat pekerjaan ini dimulai — opsional)` |
| lainnya | `HM` | `hour_meter` | `cth: 12450` | `(hour meter saat pekerjaan ini dimulai — opsional)` |

Bukan pilihan tampilan belaka — angkanya masuk ke kolom yang berbeda dan
menopang perhitungan yang berbeda (umur tyre vs WH/MTBF unit).

**Catatan kaki `.hm-kaki`** (`hmKakiUpdate`, `:916-958`) — tiga keadaan:

| keadaan | kelas | teks |
|---|---|---|
| tak terikat unit (Others/Workshop/belum pilih) | `hm-kaki-bebas` | `Pekerjaan ini tidak terikat satu unit — tidak ada {HM\|KM} sebelumnya untuk dibandingkan. Isi angka apa adanya.` |
| unit belum pernah tercatat | `hm-kaki-bebas` | `Belum pernah ada {HM\|KM} tercatat untuk unit ini. Angka yang Anda isi jadi yang pertama.` |
| ada riwayat | `hm-kaki-ada` | `{HM\|KM} terakhir tercatat: **{nilai}** — {oleh}, {d Mmm yyyy}` |

> **Ini CATATAN, bukan pagar** (`:893-897`). Unit bisa berganti panel jam, dan
> menolak angka yang “mundur” akan menghalangi orang mencatat kenyataan. Manusia
> yang menilai.

Label, hint, dan placeholder diperbarui **di satu fungsi** (`:921-924`) — kalau
di titik berbeda, cepat atau lambat labelnya berbunyi HM sementara catatan
kakinya menyebut KM, dan yang mengisi tak punya cara tahu mana yang benar.

### 3d. Keterangan untuk Mekanik (`:1029-1032`)

```html
<label>Keterangan untuk Mekanik <span class="section-hint">(opsional)</span></label>
<textarea class="form-control keterangan-input" rows="2"
          placeholder="cth: unit parkir di pit 3, koordinasi dgn operator dulu"></textarea>
```

Dikirim sebagai `block.keterangan` hanya bila tidak kosong (`:1658-1659`).

### 3e. Checkbox Others (`:1034-1041`)

Dirender **hanya bila `BOLEH_OTHERS`** = peran ≠ `mechanic` (`:426-429`):

> Mekanik boleh membuat WO, tapi **tidak** yang bertipe Others — di sana pembuat
> mengetik `base_points` & `target_hours` sendiri, dan itu jalur uang. Ini hanya
> menyembunyikan; **penegakan sesungguhnya ada di `createWorkOrder` (server)**.

Teks: `📝 Job manual (Others) — di luar katalog`, di dalam `.section-card.others-check-card`.

Spanduk saat aktif (`:995-997`):
`⚠️ **Others Mode:** custom job — isi semua field manual.`

`onOthersToggle()` (`:1382-1402`) mengatur tampilan; perhatikan semua rujukan ke
`.others-check` **aman-null** karena baris ini tidak dirender untuk mekanik
(`:1350`).

### 3f. Cascade (`.cascade-group`, `:1043-1072`)

Dua baris, lima kontrol:

| kelas | label | keadaan awal |
|---|---|---|
| `.cas-unit` | `Unit *` | aktif, `-- Select Unit --` |
| `.cas-model` | `Model Rebuild *` | **tersembunyi**, `-- Select Model --` |
| `.cas-component` | `Component *` | `disabled`, `-- Component --` |
| `.cas-sub` | `Sub Component *` | `disabled`, `-- Sub Component --` |
| `.cas-job` | `Job *` | `disabled`, `-- Job --` |

Plus `.cas-loading` = `⏳ Memuat katalog job...`

**Field vs Workshop** (`:1367-1370`):
- `field` → `.cas-unit-group` tampil, `.cas-model-group` sembunyi. Model diambil
  dari `data-model` unit terpilih.
- `workshop` → sebaliknya. Tak ada unit; model dipilih langsung.

Location juga otomatis mengikuti section (`:1371-1373`), **tetap bisa diubah manual**.

#### Penyaringan unit di jalur field (`populateCascadeRoot`, `:1240-1269`)

```js
validModels = { semua unit_model yang punya job di katalog field }
unit tampil bila:  _isUnitOthers(u)  ATAU  validModels[trim(lower(u.unit_model))]
```

> **`.trim()` di KEDUA sisi.** Sisi unit sudah dipangkas sejak awal, sisi job
> dulu tidak — jadi **satu spasi** di ujung sel `unit_model` di `Config_Jobs_Field`
> membuat seluruh unit model itu lenyap dari dropdown, **tanpa galat dan tanpa
> pesan**. Ditemukan 10 Sep 2026, persis saat nama model baru diketik tangan.
> (`:1247-1253`)
>
> **Di KMB Project luka ini sudah ditutup di skema:** `unit_models` adalah tabel
> dengan `code citext`, dan `jobs.unit_model_id` / `units.unit_model_id` adalah
> foreign key. Tak ada lagi pencocokan string. Jangan kembalikan pola lama.

Unit ber-scope `others` **selalu lolos** (`:1244-1246`) — menyaringnya membuat
jalan pintas ke job manual tidak pernah terjangkau dari field, section terbesar.

#### Rantai cascade

| pemicu | fungsi | isi berikutnya |
|---|---|---|
| unit / model berubah | `onCascadeModelOrUnit` `:1289-1303` | `component` distinct dari job yang `unit_model` cocok |
| component berubah | `onCascadeComponent` `:1305-1317` | `sub_component` distinct |
| sub berubah | `onCascadeSub` `:1319-1340` | daftar `job` |

Opsi job (`:1332-1334`):
```
value = job_id
data-base-points = base_point
data-plan-hours  = plan_hours
teks = job_description  + (L2 saja: " (X jam · Y pts)")
```

`resetCascadeFrom(blockEl, level)` (`:1271-1279`) mengosongkan dari level tertentu
ke bawah dan selalu memanggil `updatePreview`.

**Katalog dimuat malas per section** (`loadCatalog`, `:1174-1206`), di-cache di
`CATALOG = {field, workshop}` dengan penjaga `CATALOG_LOADING` supaya dua blok
tidak memanggil server dua kali. Saat katalog akhirnya tiba, acuan grup
**dipasang ulang** (`:1190-1195`) — tanpa ini baris ke-2 dst tampak kosong.

### 3g. Baris tyreman (`.tyreman-group`, `:1074-1090`)

Picker **datar**, bukan cascade:

| kelas | label |
|---|---|
| `.component-select` | `Joblist *` |
| `.unit-select` | `Unit *` |
| `.others-desc` | `Job Description *` (tersembunyi, muncul saat Others) |

Opsi joblist (`componentOptionsHtml`, `:476-488`):
```
value = component_no
data-base-points, data-target-hours
teks = "(COM-001) Nama Komponen"
COM-OTHERS DILEWATI — jalurnya lewat checkbox, bukan lewat daftar
```

Placeholder: `-- Select Joblist --`.

### 3h. Others manual (`:1092-1110`)

Tiga input angka, muncul bersama:

| kelas | label | min | step | placeholder |
|---|---|---|---|---|
| `.manual-base-points` | `Base Points *` | 0.1 | 0.1 | `e.g. 3.0` |
| `.manual-target-hours` | `Target Hours *` | 0.01 | any | `e.g. 4.0` |
| `.manual-unit-factor` | `Unit Factor *` | 0.1 | 0.01 | `e.g. 1.0` |

Hint unit factor: `Pengali kesulitan (mis. 1.0 standar, 1.2 kompleks)`

### 3i. Location + Work Condition (`:1112-1134`)

**Location** = dua kartu radio `name="location_{id}"`:

| value | ikon | judul | sub |
|---|---|---|---|
| `workshop` (**checked**) | 🏭 | `Workshop` | `Di dalam bengkel` |
| `field` | 🚜 | `Field` | `Di lokasi lapangan` |

> **Selektornya WAJIB `input[name^="location_"]`** (`:1642-1645`). Dulu
> selektornya `input[type="radio"]` polos, yang **juga menjaring radio Section**
> (dirender lebih dulu) — jadi location selalu terisi nilai section, dan blok
> tyreman terkirim `location='tyreman'`, nilai yang tidak sah.
>
> Di React masalah ini hilang dengan sendirinya (state terpisah, bukan query DOM).
> Dicatat supaya tak ada yang "menyederhanakan" jadi query DOM lagi.

**Work Condition** = `.wc-select` (`wcOptionsHtml`, `:856-864`):
```
value = key,  data-factor = factor
teks  = "{label} (×{factor})"
placeholder = "-- Select Work Condition --"
```

### 3j. Preview (`.component-preview`, `:1136-1149`) — L2 SAJA

Dirender hanya bila `BOLEH_LIHAT_POIN` = peran `superintendent` (`:430-435`):

> Angka poin & target jam hanya untuk L2. Mekanik dan L1 memilih pekerjaan
> berdasarkan **apa** yang dikerjakan, bukan berapa nilainya — menampilkan poin
> saat membuat WO mengundang pemilihan job berdasarkan bayarannya.
>
> `data-base-points` & `data-plan-hours` **tetap dikirim** (dipakai saat submit);
> yang disembunyikan hanya yang terbaca mata.

Judul `Preview`, lima baris `.preview-item`:

| label | isi |
|---|---|
| `Base Points:` | `basePoints.toFixed(2)` |
| `Target Hours:` | `formatJamMenit(targetHours)` atau `-` |
| `Unit Factor:` | `1.00x` / `1.00x (Workshop)` / `1.20x (Manual)` |
| `Work Condition:` | `{label} (1.00x)` |
| `Estimated Points:` | `(base × unit × wc).toFixed(2) + ' points'` |

`updatePreview()` (`:1524-1596`) — sumber angka per keadaan:

| keadaan | base / target | unit factor |
|---|---|---|
| Others | dari 3 input manual | dari `.manual-unit-factor`, tampil `Nx (Manual)` |
| `workshop` | `data-*` opsi `.cas-job` | **selalu 1.0**, tampil `1.00x (Workshop)` |
| `field` | `data-*` opsi `.cas-job` | `data-factor` opsi `.cas-unit` |
| `tyreman` | `data-*` opsi `.component-select` | `data-factor` opsi `.unit-select` |

Estimated Points hanya terisi bila **ketiganya** ada (`wcFactor !== null &&
unitFactor > 0 && basePoints > 0`); kalau tidak `-` dengan kelas `.preview-muted`.
Terisi → `.preview-highlight`.

**Semua rujukan `.preview-*` WAJIB aman-null** (`:1136-1138`, `:1577-1579`) —
blok ini tidak ada untuk mekanik & L1.

`formatJamMenit(h)` (`:460-468`) — **rumus yang sama persis** dengan Quick Stats
di Performa dan `fmtJam` di Approval. Satu pekerjaan tidak boleh tampil sebagai
dua angka berbeda di tiga layar.

### 3k. Team Composition (`:1151-1162`) — SUDAH DIBANGUN

```html
<label class="form-label">Team Composition <span class="required">*</span>
  <span class="section-hint">(tiap mekanik dapat poin penuh)</span></label>
<div class="team-builder">
  <div class="team-members"></div>
  <button class="btn btn-outline btn-sm add-team-member">+ Add Team Member</button>
  <label class="show-all-mech-row"><input type="checkbox" class="show-all-mech">
    🔓 Tampilkan mekanik semua section</label>
  <div class="team-summary" style="display:none;">…</div>
</div>
```

Satu baris = `<select class="form-control mechanic-select">` + tombol
`.btn-icon.btn-danger.remove-member` (`×`) (`addTeamMember`, `:1599-1612`).
Satu baris ditambahkan otomatis saat blok dibuat, bila `MECHANICS.length > 0`
(`:1477`).

`.team-summary` **selalu tersembunyi** (`updateTeamSummary`, `:1614-1618`):
model poin penuh, tidak ada porsi. Elemennya dibiarkan ada tapi mati. **Di KMB
Project jangan dibawa sama sekali.**

Penyaringan mekanik (`mechanicOptionsHtml`, `:866-891`):
- placeholder `-- Select Mechanic --`
- mekanik **tanpa section selalu tampil**
- `showAll` menampilkan semua, dengan tanda `[section]` di belakang nama bagi yang
  tak cocok
- KMB V2 menyimpan section sebagai string berkoma dan dulu membandingkannya
  sebagai **string utuh** — mekanik ber-section ganda tak pernah cocok dan
  dropdown-nya kosong. Di KMB Project ini sudah jadi tabel `mechanic_sections`.

---

## 4. Alur kirim (`:1623-1787`)

### 4a. Validasi per blok, berurutan

| syarat | pesan |
|---|---|
| tyreman non-Others tanpa joblist | `Joblist #N: pilih joblist` |
| work condition kosong | `Joblist #N: pilih work condition` |
| Others tanpa deskripsi | `Joblist #N: isi deskripsi job (Others)` |
| Others `base ≤ 0` | `Joblist #N: Base Points harus > 0` |
| Others `target ≤ 0` | `Joblist #N: Target Hours harus > 0` |
| Others `factor ≤ 0` | `Joblist #N: Unit Factor harus > 0` |
| field tanpa unit | `Joblist #N: pilih unit` |
| field tanpa job | `Joblist #N: pilih job dari katalog` |
| workshop tanpa job | `Joblist #N: pilih job dari katalog` |
| tyreman tanpa unit | `Joblist #N: pilih unit` |
| mekanik dipilih dua kali | `Joblist #N: mekanik duplikat` |
| tim kosong | `Joblist #N: tambah minimal 1 mekanik` |
| tak ada blok | `Tambah minimal 1 joblist` |
| mode grup < 2 blok | `Mode grup butuh minimal 2 joblist — tambah joblist, atau pilih mode Bebas.` |
| baris kembar dalam grup | `Joblist #N: {job\|unit} ini sudah ada di grup (sama dengan joblist #M).` |

`cekKembarKlien()` (`:837-854`) memeriksa di klien **hanya supaya orang tahu lebih
awal** — server tetap memeriksa ulang (`createWorkOrdersBatch → cekKembarDalamGrup`).

### 4b. Bentuk muatan

```js
block = {
  work_condition, location, section,
  [hour_meter | kilometers],   // kunci dari meterBlok(); hanya bila diisi
  keterangan,                  // hanya bila diisi
  component_id,                // tyreman, atau 'COM-OTHERS'
  others_description, manual_base_points, manual_target_hours, manual_unit_factor,
  unit_id, job_id,
  team_distribution: { [mechanic_id]: 100 },   // SELALU 100
  wo_group_mode                // dikirim di SEMUA blok bila mode aktif
}
```

`team_distribution` selalu `100` per orang (`:1692-1700`). `wo_group_id`
diterbitkan **server** bila kosong; mode dikirim di semua blok supaya tidak
bergantung pada urutan (`:1718-1723`).

### 4c. Idempotensi — bagian yang paling penting (`:1727-1734`, `:1828-1840`)

> HTTP 502 adalah kegagalan **gerbang**, dan gerbang berdiri di dua arah. Putus
> saat **berangkat** berarti server tak pernah menerima; putus saat **pulang**
> berarti server sudah menulis **semuanya**. Dari layar keduanya terlihat persis
> sama — jadi layar ini **tidak boleh mengaku tahu**.

```js
KIRIMAN_KEY = 'mar_kiriman_wo'
_kirimanBaru()  →  'KRM-' + Date.now() + '-' + 6 digit acak
```

Nomor kiriman dibuat **sekali per submit**, disimpan di `localStorage`, dan baru
dibuang setelah hasilnya **pasti**. Membuat nomor baru tiap percobaan mematikan
kunci idempotensinya. Bertahan melewati refresh karena sesudah sambungan putus
orang refleks menekan refresh (`:1730-1731`).

**Empat cabang jawaban server** (`:1738-1753`):

| medan jawaban | tindakan layar |
|---|---|
| `sedang_berjalan` | spanduk: `Kiriman ini masih diproses server. JANGAN isi formulir baru.` |
| `terputus` | spanduk + daftar WO yang **benar-benar** masuk |
| `sudah_pernah` | notifikasi sukses + **struk lama**, nol WO baru |
| normal | struk dari `created` + `failed` |

`withFailureHandler` (`:1775-1785`) **bukan** “gagal”:
```
Sambungan terputus sebelum jawaban server sampai. WO Anda MUNGKIN sudah terbuat.
JANGAN isi formulir baru — tekan Cek status di bawah.
```

**Spanduk `#kirimanSpanduk`** (`:1979-1998`): border `2px #f59e0b`, latar
`#fffbeb`, teks `#78350f`, judul `⚠️ Kiriman belum dipastikan`, tombol
`🔄 Cek status` (`#b45309`), dan nomor kirimannya ditulis. Tombolnya **aman
ditekan berkali-kali** — itulah gunanya nomor kiriman.

`cekStatusKiriman` (`:2001-2042`) **read-only**, empat keadaan: `selesai` ·
`terputus` · `tidak_ada` · lainnya.

Saat halaman dimuat, kalau `localStorage` masih menyimpan kiriman yang belum
pasti, spanduknya **dimunculkan otomatis** (`:2071-2078`):
```
Kiriman terakhir Anda (N baris) belum dipastikan hasilnya.
Tekan Cek status sebelum membuat WO baru.
```

### 4d. Struk hasil (`#successModal`, `:2091-2104`, `:1872-1951`)

> Sebelumnya layar ini cuma menampilkan deretan badge bernomor. Nomornya benar,
> tapi pembuat WO tetap harus **menebak** baris mana jadi apa — dan saat sebagian
> gagal, ia tak punya cara tahu **sisa mana** yang perlu diulang. (`:1841-1847`)

```
.struk-box
  .struk-head   #strukJudul  +  #strukSub
  .struk-list   #strukList    ← .struk-item[.bad] > .ic + .tx > .no + .sub
  .struk-note   #strukNote
  .struk-foot   "+ Buat Lagi" (ghost)  ·  "Lihat Monitoring →" (primary)
```

| keadaan | judul | sub |
|---|---|---|
| semua berhasil | `✅ N WO berhasil dibuat` | `Semua nomor di bawah sudah tersimpan di sistem.` |
| sebagian gagal | `⚠️ N dari M WO masuk` | `Yang bernomor di bawah SUDAH tersimpan dan tidak perlu diulang.` |
| `sudah_pernah` | (sama) | `Kiriman ini sudah pernah masuk sebelumnya. Tidak ada WO yang dibuat dua kali.` |

Baris gagal: ikon `❌`, judul `GAGAL — Joblist #N`, sub `{label} — {error}`.

Catatan merah saat ada yang gagal (`:1942-1946`):
```
Buat ulang HANYA blok yang bertanda ❌. Jangan ulangi semuanya —
yang sudah bernomor akan terbit dua kali.
```

> **SUKSES SEBAGIAN BUKAN GAGAL TOTAL** (`:1760-1763`, `:1939-1941`). Batch
> menjawab `success:false` begitu **satu** blok gagal. Dulu cabang ini dianggap
> gagal total, jadi WO yang **sudah terbit** tidak pernah ditampilkan dan orang
> membuatnya lagi — jadi dobel.

**Label baris diterjemahkan DI SERVER** (`_ringkasBlok`), bukan dikumpulkan dari
DOM (`:1854-1862`): percobaan pertama menebak struktur kartu lewat selector,
tebakannya meleset, dan struknya berakhir menampilkan `COM-001 · UNIT-016` —
kode yang tak berarti apa-apa bagi pembacanya.

### 4e. Overlay muat (`:2083-2088`)

`.wo-overlay` + `.spinner-arc` + teks `Menyimpan Work Order...`

---

## 5. Data yang disuntikkan ke halaman (`:443-455`)

| variabel | isi | KMB Project |
|---|---|---|
| `components` | joblist tyreman | `katalog().jobs` section tyreman |
| `UNITS` | semua unit + `unit_factor`, `unit_model`, `unit_scope` | `katalog().units` |
| `WORK_CONDITIONS` | `{key, label, factor}` | `factors WHERE factor_type='work_condition'` |
| `MECHANICS` | `{mechanic_id, mechanic_name, section}` | `katalog().mekanik` — **sudah ada `sections[]` + `jabatan`** |
| `TAMPIL_METER` | boolean | `settings.tampilkan_meter_buat_wo` |
| `HM_TERAKHIR` | `{unit_id: {nilai, oleh, at}}` | `meter_readings` terbaru per unit, `type='HM'` |
| `KM_TERAKHIR` | idem | idem, `type='KM'` |
| `USER_SCOPE` | `null` = semua | `sectionYangBoleh()` di `src/domain/kueri.ts:33-38` |
| `BOLEH_OTHERS` | peran ≠ mechanic | `aku.peran !== 'mechanic'` |
| `BOLEH_LIHAT_POIN` | peran = superintendent | `aku.peran === 'superintendent'` |

`katalog()` di `src/domain/kueri.ts:123-168` sudah menyembunyikan `base_points`
dari non-L2 (`:143`). **Itu pola yang benar — disaring di server, bukan di CSS.**

---

## 6. Yang harus dikerjakan di KMB Project

`FormWo.tsx` sudah punya: cascade 4 tingkat, Team Composition dropdown, section
radio. **Yang belum:**

- [ ] `.grup-bar` — 3 kartu Model pembuatan + hint dinamis + `#grupRingkas`
- [ ] Penguncian acuan grup (`data-terkunci`, tanda 🔒, radio section ikut terkunci)
- [ ] `sinkronAcuanGrup` + `salinJobKe` (cocokkan job lewat **teks**)
- [ ] Blok Joblist #N yang bisa ditambah & dihapus + `renumberBlocks`
- [ ] Tombol `🌐 Tampilkan semua unit` (global, memengaruhi semua blok)
- [ ] Medan HM/KM + catatan kaki 3 keadaan + label berganti per section
- [ ] Textarea `Keterangan untuk Mekanik`
- [ ] Checkbox `Job manual (Others)` + spanduk + 3 input manual
- [ ] Location 2 kartu radio (bukan dropdown)
- [ ] Panel Preview 5 baris (L2 saja)
- [ ] `cekKembarKlien` sebelum kirim
- [ ] Nomor kiriman di `localStorage` + spanduk pemulihan + tombol Cek status
- [ ] Struk hasil dengan `✅`/`❌` per baris + catatan “ulangi hanya yang ❌”
- [ ] Endpoint `GET /api/kiriman/{op_id}` (read-only) untuk Cek status

### Pemetaan ke sisi server yang sudah ada

`op_id` KMB Project **menggantikan** `kiriman_id` — perannya identik, dan
`processed_ops` sudah jadi tanda terimanya (`db/schema.sql:516+`). Gerbangnya
sudah dibangun di `src/domain/runCommand.ts`: advisory lock → periksa tanda
terima → jalankan → tulis tanda terima, semuanya dalam satu `sql.begin`.

Yang **belum ada**: endpoint baca untuk “Cek status”. Bentuknya:

```
GET /api/kiriman/{op_id}
→ { keadaan: 'selesai'|'terputus'|'tidak_ada'|'sedang_berjalan',
    pesan: string,
    struk?: { created: [{wo_number, label}], failed: [...] },
    kenyataan?: { wo: [{wo_number, unit_id, status}] } }
```

`selesai` = ada baris di `processed_ops`. `tidak_ada` = tidak ada, **dan** tidak
ada WO dengan `op_id` itu → aman dibuat ulang. `terputus` = ada WO tapi tanda
terima belum tertulis (mestinya mustahil karena keduanya satu transaksi — tapi
endpoint ini justru yang membuktikannya).

### Kolom KMB V2 → KMB Project

| KMB V2 | KMB Project |
|---|---|
| `component_id = 'COM-OTHERS'` | `work_orders.is_manual = true` |
| `others_description` | `manual_description` |
| `manual_base_points/target_hours/unit_factor` | nama sama, **kolom sendiri** |
| `team_distribution: {id: 100}` | `work_order_team` tanpa kolom persen |
| `kiriman_id` | `op_id` + `processed_ops` |
| `wo_group_id` (diterbitkan server) | `work_orders.wo_group_id uuid` |
| `wo_group_mode` | `work_orders.wo_group_mode` CHECK `('unit','job')` |

> `manual_*` diberi **kolom sendiri**, tidak menumpang kolom override
> (`db/schema.sql:287-289`) — di KMB V2 ia menumpang, sehingga badge “SPV
> override” muncul di setiap WO Others padahal tak seorang pun meng-override.

---

## 7. Yang sudah tidak perlu ditiru

- `updateTeamSummary` + `.team-summary` + `total-percentage` — mati sejak model
  poin penuh.
- `setKunci`/`data-dis-asli` — di React, `disabled` adalah turunan state, bukan
  atribut yang harus dipulihkan.
- Pencocokan `unit_model` sebagai string — sudah jadi foreign key.
- Selektor `input[type="radio"]` polos — sumber bug location/section.
- `refreshMechanicSelects` yang menulis ulang `innerHTML` lalu memulihkan nilai
  (`:965-975`) — React mempertahankan nilai tanpa akal-akalan itu.

## 8. Daftar periksa selesai

- [ ] Tiga model pembuatan, hint berubah, grup ditolak untuk Workshop
- [ ] Acuan terkunci saat ≥2 baris, section ikut terkunci, tanda 🔒 muncul
- [ ] Job acuan dicocokkan lewat **teks**, unit ditolak terang-terangan bila tak cocok
- [ ] Preview hanya untuk L2; `base_points` tak pernah dikirim ke non-L2
- [ ] Others hanya untuk L1/L2 — **dan ditolak server**, bukan cuma disembunyikan
- [ ] HM/KM: tidak dirender saat mati, label & kolom tujuan ikut section
- [ ] `op_id` lahir sekali, bertahan di `localStorage`, spanduk pulih saat refresh
- [ ] Sebagian berhasil tampil sebagai struk, bukan “gagal”
- [ ] `formatJamMenit` identik dengan Performa & Approval
