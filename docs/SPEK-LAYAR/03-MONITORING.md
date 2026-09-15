# Layar 3 — Monitoring

> **Sumber:** `MechanicDashboard.html` (1.515 baris) + `MechanicService.js` +
> `_DetailTyre.js` di `MAR-project`. **Baca saja.**
>
> **Sasaran KMB Project:** `src/app/monitoring/page.tsx` (ada, sebagian) +
> `src/domain/kueriMonitoring.ts` (ada) + perintah `kirimKerja`, `transferWo`.

Rute `?page=mechanic`. **Satu berkas, DUA layar berbeda** — percabangannya di
`:366` / `:468`:

| penonton | yang muncul |
|---|---|
| supervisor / superintendent tanpa `?as=` / token mekanik | **Selector**: kisi kartu mekanik + statistik pipeline |
| mekanik, atau approver yang menekan “Buka →” | **Daftar WO** milik orang itu + modal kerja |

---

## A. SELECTOR — kisi mekanik (`:366-466`)

### Kepala (`:367-370`)

```
h1   📊 Monitoring Mekanik
p    Statistik pipeline & link akses per-mekanik (bertoken). Copy untuk
     mekanik yang lupa link, atau Buka untuk masuk atas nama mekanik.
```

### Empat kartu statistik (`.mon-stats`, `:371-376`)

| kelas | angka | label |
|---|---|---|
| — | `ov.mechanics` | `👷 Mekanik` |
| `.s-pmw` | `ov.pending_mechanic_work` | `📝 Perlu diisi` |
| `.s-l1` | `ov.pending_l1 + ov.pending_l2` | `⏳ Menunggu Approval` |
| `.s-appr` | `ov.approved` | `✅ Approved (semua waktu)` |

Perhatikan kartu ketiga **menjumlahkan L1 dan L2** — satu angka “menunggu
approval”, bukan dua.

### Pencarian (`:377-380`, `:455-465`)

`input#mechSearch.selector-search` + ikon `🔍`, placeholder
`Cari nama mekanik...`. Penyaringan **di klien** atas atribut `data-name`
(huruf kecil). Nol hasil → `#mechSearchEmpty`:
`Tidak ditemukan mekanik dengan nama tersebut.`

### Kartu mekanik (`.mon-card`, `:386-413`)

```
┌──────────────────────────────────────────┐
│ (A)  Nama Mekanik                        │   .mechanic-avatar = huruf pertama
│      MECH-001 · [tyreman] · [uji]        │   .sec-badge, .uji-badge
├──────────────────────────────────────────┤
│ 📝 3   ⏳ L1 2   ⏳ L2 1   ✅ 48         │   .cnt .c-pmw .c-l1 .c-l2 .c-appr
├──────────────────────────────────────────┤
│ [ token............ ] [📋 Copy Token] [Buka →] │
└──────────────────────────────────────────┘
```

`title` tiap penghitung: `Perlu diisi` · `Menunggu L1` · `Menunggu L2` · `Approved`.

`.uji-badge` muncul untuk akun uji, `title` =
`{alasan} — disembunyikan dari dropdown & tidak dihitung payroll/peringkat`.

Tanpa token (`:410-412`):
`⚠️ Belum ada token. Jalankan generateMissingTokens di editor GAS.`
→ di KMB Project: **`⚠️ Belum ada token. Terbitkan lewat Kelola Token.`**

Kisi kosong: `Belum ada mekanik dalam scope Anda.`

### Tiga tombol (`:421-454`)

- **Copy Token** — menyalin **token**, bukan URL. Sejak layar login token, yang
  dibagikan ke mekanik adalah tokennya (`:401-403`). URL penuh disimpan di
  `data-link` dan hanya dipakai tombol Buka.
  Umpan balik: teks tombol berubah jadi `✅ Tersalin` selama 1,5 detik.
  Ada jalur cadangan `document.execCommand('copy')` bila Clipboard API ditolak.
- **Buka →** (`openAs`, `:449-454`) — impersonate. Membawa token approver sebagai
  `&back=` supaya tampilan mekanik punya tombol kembali.
- `copyLink` (`:443-448`) disimpan hanya untuk kompatibilitas pemanggil lama.

> **Keputusan yang menunggu Gabriel.** Token di layar ini **terlihat telanjang**.
> Commit `77dd7e8` di `MAR-project` adalah *revert* dari “Tutup token di
> Monitoring supaya layarnya aman di-screenshot” — jadi menyembunyikannya
> pernah dicoba dan **dibatalkan**. Di KMB Project token disimpan **ter-hash**,
> sehingga menampilkannya kembali **mustahil** — yang bisa hanya menerbitkan
> token baru. Ini perubahan perilaku nyata: alur “mekanik lupa token → approver
> menyalinkan” berubah jadi “approver menerbitkan token baru”.
> **Tanya Gabriel sebelum membangun layar ini.**

### Sumber angkanya

Sudah ada di KMB Project: `src/domain/kueriMonitoring.ts` — hitungan pipeline
per mekanik dihitung dari keanggotaan tim, dan token hanya diberi *hint*.

```sql
-- per mekanik, dari keanggotaan tim (bukan dari created_by)
count(*) FILTER (WHERE w.status = 'pending_mechanic_work')   AS pending_mechanic_work
count(*) FILTER (WHERE w.status = 'pending_supervisor')      AS pending_l1
count(*) FILTER (WHERE w.status = 'pending_superintendent')  AS pending_l2
count(*) FILTER (WHERE w.status = 'approved')                AS approved
```

---

## B. DAFTAR WO MEKANIK (`:468-682`)

### Tombol kembali + spanduk impersonate

- `a.btn-back-to-self` `← Kembali ke Monitoring` — muncul bila ada `backToken`
  (`:474-479`). Warna `#EFF6FF` / `#1E40AF` / border `#BFDBFE`.
- `#impersonateBanner` (`:482-491`): ikon `👤`, judul `Viewing As`, nama orang
  yang sedang dilihat, tombol `← Kembali ke Pilih Mekanik`.

### Kepala + tab (`:493-507`)

```
h1  Monitoring
p   mekanik      → "Track and submit your assigned work"
    selain itu   → "Kelola work order mekanik ini"
```

**Tiga tab** `.filter-tab`, masing-masing dengan `.count`:

| `data-filter` | label | isi |
|---|---|---|
| `assigned` (**aktif**) | `Assigned` | `pending_mechanic_work`, `in_progress` |
| `pending_approval` | `Pending` | `pending_supervisor`, `pending_superintendent` |
| `done` | `Done` | `approved` |

> **Tab mengganti URL, bukan menyaring di klien** (`changeFilter`, `:977-981`).
> Akibatnya penting untuk §B.3: layar hanya memegang baris yang lolos tab itu.

### B.1 Pengelompokan borongan (`renderWOs`, `:835-916`)

Baris dikelompokkan per `wo_group_id`; yang tanpa grup jadi kelompok sendiri
(kunci `__solo__{id}`) sehingga tampilan WO tunggal **tidak berubah sama sekali**.

> ```js
> if (indeks[kunci] === undefined) { … }
> ```
> **`=== undefined`, BUKAN `!indeks[kunci]`** (`:849-851`) — indeks grup pertama
> adalah `0`, dan `!0` bernilai `true`, sehingga anggota berikutnya dipecah jadi
> grup baru. **Bug ini sudah kena sekali di PWA.**

**Kotak grup hanya digambar bila `G.id && G.baris.length > 1`** (`:879`):

```
┌ .grup-wrap ────────────────────────────────────────┐
│ .grup-head                                         │
│   📦 {judul}                  [1 Unit · Banyak Job]│
│   📍 🚜 Field · 👥 {tim}                            │
│   ✅ Selesai 2 dari 5 baris                        │
│ .grup-body → kartu-kartu bernomor 1..N             │
└────────────────────────────────────────────────────┘
```

- judul mode `job` → `{component_name} · {N} unit`
- judul mode `unit` → `{unit_name | 'Workshop'} · {N} job`
- tag → `1 Job · Banyak Unit` atau `1 Unit · Banyak Job`

> **`grup_total` & `grup_selesai` datang dari SERVER** (`:872-878`), dihitung
> atas **seluruh** borongan sebelum penyaringan tab. Dulu layar menghitung
> sendiri dari isi tab, sehingga borongan 5 baris yang 4-nya sudah pindah tab
> menampilkan “Selesai 0 dari 1 baris” — terbaca sebagai kemajuan borongan,
> padahal cuma menghitung isi tab yang sedang dibuka.

**Anggota borongan yang berdiri sendiri di sebuah tab** dapat lencana kecil di
kartunya, bukan kotak grup penuh (`:932-941`):
```
📦 Bagian borongan · 2 dari 5 baris selesai
```
> Tanpa ini, satu-satunya baris borongan yang tersisa di sebuah tab terlihat
> seperti WO lepas — dan mekanik tak tahu masih ada saudaranya di tab sebelah.

### B.2 Kartu WO (`woCardHtml`, `:922-964`)

```
┌ .wo-card[.incident-card] ──────────────────────────┐
│ [1] WO-20260915-0007          [status / ⚠️ Insiden]│
│ ⚠️ Safety Incident — Poin = 0        (bila insiden)│
│ 📦 Bagian borongan · …               (bila perlu)  │
│ {component_name}                                   │
│ ┌ .wo-details (grid) ────────────────────────────┐ │
│ │ Unit          │ Target Hours                   │ │
│ │ 👥 Tim (3) / 👥 Dikerjakan   (selebar penuh)   │ │
│ │ Location      │ Hour Meter   (bila ada)        │ │
│ │ Kilometer     │ Spare Part   (bila ada)        │ │
│ │ 📝 Keterangan                (selebar penuh)   │ │
│ └────────────────────────────────────────────────┘ │
│ [✍️ Isi Manual]  [📮 Kirim]      (tab assigned)    │
└────────────────────────────────────────────────────┘
```

- **Insiden** = `status_group === 'done'` **dan** `safety_incident` benar.
  Kartu dapat kelas `.incident-card`, status jadi `⚠️ Insiden`, plus
  `.incident-badge`: `⚠️ Safety Incident — Poin = 0`.
- Location: `field` → `🚜 Field`, selain itu `🏭 Workshop`.
- Spare part: `baru` → `🆕 Sparepart Baru`, `repair` → `🔧 Repair`,
  `kanibal` → `♻️ Kanibal`.
- Target Hours lewat `formatJamMenit()` — **rumus yang sama** dengan Performa,
  Create WO, dan Approval.

**Tim** (`timKerjaStr`, `:778-786`): diurut supaya **diri sendiri di depan**,
dan namanya ditebalkan warna `#b45309` dengan akhiran ` (Anda)`.

**Dua tombol, hanya di tab `assigned`** (`:953-962`). `event.stopPropagation()`
**wajib** — kartunya sendiri sudah `onclick`, tanpa itu menekan tombol ikut
membuka modal di belakangnya.

### B.3 Kirim langsung (`kirimLangsung`, `:788-833`)

Jalur cepat tanpa membuka form. Jamnya dari **timer** (localStorage, per WO).

- Timer `00:00:00` → **jangan diam-diam mengirim 0 jam**:
  ```
  ⏱️ Timer masih 00:00:00.
  Tekan ▶ Start dulu lewat ✍️ Isi Manual, atau isi jamnya manual di sana.
  ```
- Konfirmasi **wajib menyebut durasinya** — tak ada form untuk ditinjau lebih
  dulu, dan sekali terkirim WO berpindah ke meja L1:
  ```
  Kirim laporan kerja WO-…?
  Durasi: 2 jam 15 menit
  15/9/2026, 08.00.00 → 15/9/2026, 10.15.00
  Setelah terkirim, WO masuk ke meja L1 dan tidak bisa Anda ubah lagi.
  Perlu mengoreksi jam atau menambah keterangan? Pakai ✍️ Isi Manual.
  ```
- `timerClear(woId)` **baru dipanggil setelah kerja benar-benar terkirim**
  (`:817`) — bukan sebelum.

### B.4 Modal kerja (`:514-682`, `openWoDetail` `:982-1028`)

Kepala: `#modalWoId` = nomor WO, `#modalComponent` = nama komponen.

**Bagian 1 — Work Order Details** (`:521-529`): Unit · Target Hours · Status,
plus `📝 Keterangan Planner/PIC Lapangan` selebar penuh bila ada
(`white-space: pre-wrap`).

**Bagian 2 — Isi Jam Kerja** (`:530-595`), tampil hanya bila
`status_group ∈ {assigned, in_progress}`:

#### Live timer (`#timerPill`, `:533-549`)

Latar `#EFF6FF`, border `#BFDBFE`, radius 10px.
Judul kecil `⏱️ LIVE TIMER REKAM WAKTU`. Angka `24px`, `monospace`, `#1e40af`.

| tombol | warna | keadaan awal |
|---|---|---|
| `▶ Start` | `#10b981` | tampil |
| `⏸ Pause` | `#f59e0b` | sembunyi |
| `⏹ Finish & Isi Jam` | `#ef4444` | sembunyi |
| `↺ Reset` | garis luar `#d1d5db`, teks `#6b7280` | sembunyi |

> **Reset menghapus jam kerja → sengaja bergaya garis luar dan paling redup**
> (`:543-544`). Tindakan merusak tak boleh terlihat semenarik Start.

`#timerSummary` hijau (`#DCFCE7` / `#86EFAC` / `#166534`).
Keterangan kaki: `▶ mulai kerja · ⏸ jeda · ⏹ selesai. Durasi terhitung otomatis.
Memulai WO lain akan menjeda WO ini. Jam di bawah boleh Anda koreksi manual.`

> **Picker jam TETAP TERLIHAT dan boleh dikoreksi manual** (`:533-535`); timer
> hanya mengisinya. Di SUM V2 pickernya disembunyikan — KMB sengaja tidak.
> (Memori `kmb-v2-transfer-timer-decisions`.)

#### Picker 24 jam (`:551-561`)

`#slotStartTime` / `#slotEndTime` diisi JS dari `dtHtml()` — lihat
`DateTime24.html`.

> **Jam 00–23 dibuat sendiri** karena `datetime-local` mengikuti locale perangkat
> dan memunculkan AM/PM di ponsel ber-locale Inggris. Wajib ada bacaan durasi.
> (Memori `picker-waktu-24-jam`.)

#### Medan yang disembunyikan

`#hmWrap`, `#kmWrap`, `#partCategoryWrap` — **disembunyikan di SEMUA section**
sejak 1 Agu 2026 (`:1002-1007`), tapi **nilainya tetap dikosongkan** supaya tidak
ada nilai lama yang terkirim. Pilihan spare part: `Tanpa Part` · `🆕 Sparepart
Baru` · `🔧 Repair` · `♻️ Kanibal`.

#### Duration + transfer

`#durationPreview` muncul setelah kedua jam terisi (`validateTimes`, `:1034-1048`):
- `end <= start` → tombol Kirim mati, teks `⚠️ End time must be after start time`
  warna `#e53e3e`
- sah → `formatJamMenit((end-start)/3600000)`, warna `#2d3748`, tombol hidup
- **HM & KM tidak lagi jadi syarat tombol Kirim** (`:1045-1046`)

`#transferNoteWrap` — textarea opsional,
placeholder `cth: baut roda kiri belum kencang, tinggal torsi ulang`.

**Bagian 3 — Detail Tyre** (`:597-670`) → lihat **`03b-DETAIL-TYRE.md`**.

**Kaki modal** (`:672-680`): `Cancel` · `🔁 Transfer ke Shift Berikutnya`
(garis luar `#f6ad55` / teks `#c05621` — **bukan** oranye pekat, supaya tidak
lebih menonjol dari tombol utama) · `📮 Kirim` (primary, mulai `disabled`).

### B.5 Kirim dari modal (`submitWork`, `:1049-1084`)

Muatan:
```js
{ wo_id, start_time, end_time, hour_meter, kilometers, part_category,
  view_as, token, detail_tyre: tyreKumpulkan() }
```

Kegagalan jaringan **tidak boleh disebut “gagal”** (`:1073-1075`):
```
⚠️ Sambungan terputus sebelum jawaban server sampai.
Tindakan Anda MUNGKIN sudah tersimpan. JANGAN diulangi buta —
tekan Refresh dulu dan lihat keadaan sebenarnya.
```
Kalimat ini identik di `kirimLangsung` (`:826`). **Bawa apa adanya.**

---

## C. Yang harus dibangun di KMB Project

- [ ] Selector: 4 statistik, pencarian klien, kartu mekanik + penghitung 4 kolom
- [ ] **Putuskan dulu** perilaku token (hash ⇒ tak bisa disalin) — tanya Gabriel
- [ ] Impersonate: `?as=` + `?back=`, spanduk `Viewing As`
- [ ] Tiga tab dengan penghitung; tab mengganti rute
- [ ] Pengelompokan borongan + `grup_total`/`grup_selesai` **dari server**
- [ ] Lencana borongan untuk anggota yang berdiri sendiri di sebuah tab
- [ ] Kartu insiden (`safety_incident` ⇒ poin 0)
- [ ] Tim dengan diri sendiri di depan + `(Anda)`
- [ ] Live timer per WO di `localStorage`, jeda otomatis saat WO lain dimulai
- [ ] Picker 24 jam sendiri (jangan `datetime-local`)
- [ ] `📮 Kirim` langsung + konfirmasi menyebut durasi
- [ ] Transfer WO ke shift berikutnya (`work_order_transfers` sudah ada di skema)
- [ ] Pesan putus-sambungan apa adanya — jangan disederhanakan jadi “gagal”

### Catatan skema

`session_hours` vs `partial_hours` (`db/schema.sql:310-313`): `actual_hours`
adalah kolom **GENERATED** = `coalesce(session_hours,0) + partial_hours`.
Transfer menambah `partial_hours`; sesi terakhir mengisi `session_hours`.
**Override waktu tidak boleh menimpa `partial_hours`** — sudah dijaga di
`src/domain/nilaiEfektif.ts`.

Status `pending_transfer` sudah ada di mesin transisi (`db/schema.sql:368-376`).
