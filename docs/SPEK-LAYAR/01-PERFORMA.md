# Layar 1 — Dashboard Performa

> **Sumber:** `Main.html` (tampilan) + `DashboardService.js` (angka) di
> `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`, cabang
> `feature/token-auth-web`. **Baca saja.**
>
> **Sasaran KMB Project:** `src/app/performa/page.tsx` + `src/domain/kueriPerforma.ts`
> + `src/domain/periode.ts` (belum ada — lihat §7).

Rute KMB V2: `?page=dashboard`. Ini halaman yang dibuka pertama oleh semua orang,
dan satu-satunya yang menampilkan uang kepada mekanik.

---

## 1. Susunan layar, dari atas ke bawah

```
navbar                                   Main.html:264-284
container
├── .page-header                         :287-294
├── .stats-grid           4 kartu        :297-325
├── .content-grid-top     tabel WO       :328-391
├── .grid-papan           3 papan        :399-500
│   ├── Periode                          :402-440
│   ├── Harian — Field                   :452-499 (iterasi ke-1)
│   └── Harian — Tyreman                 :452-499 (iterasi ke-2)
├── .content-grid-bottom  2fr / 1fr      :502-577
│   ├── grafik tren                      :504-518
│   └── .right-sidebar → Quick Stats     :521-576
└── #wo-detail-modal      tersembunyi    :581-591
```

Grid: `.stats-grid` = `repeat(4,1fr)`; `.grid-papan` = `repeat(3,1fr)`;
`.content-grid-bottom` = `2fr 1fr`. Titik patah di `Main.html:230-257`:
≤1280px papan jadi 2 kolom, ≤1024px semua jadi 1 kolom + stats 2 kolom,
≤640px tabel WO berubah jadi kartu (`thead` disembunyikan).

---

## 2. Header halaman (`:287-294`)

Judul **berbeda per peran** — ini bukan hiasan, mekanik dan approver membuka
halaman yang sama:

| Peran | Judul |
|---|---|
| `mechanic` | `Welcome, {mechanic_name}! 👋` |
| `supervisor` | `Dashboard Performa — Planner/PIC Lapangan 📊` |
| `superintendent` | `Dashboard Performa 🎯` |

Subjudul: tanggal hari ini, `toLocaleDateString('id-ID', {weekday, year, month, day})`
→ “Senin, 15 September 2026”.

---

## 3. Empat kartu statistik (`:297-325`)

Urutan, ikon, label, dan subtitel **tepat seperti ini**:

| # | Ikon | Label | Nilai | Subtitel |
|---|---|---|---|---|
| 1 | 📊 | Total WO | `stats.totalWOs` | `Semua waktu & status` |
| 2 | ✅ | Approved | `stats.approved` | `Selesai & disetujui` |
| 3 | ⏳ | Pending | `stats.pending` | `Sedang berjalan` |
| 4 | 💰 | Total Poin | `stats.totalPoints` | `Terdistribusi` |

Subtitel kartu 1 menyebut “& status” dengan sengaja (`:302-305`): tanpa itu
orang yang melihat Total WO lebih besar dari Approved mengira sistemnya salah,
padahal batal & ditolak memang ikut dihitung di situ.

### Definisi angkanya — `getSupervisorStats` (`DashboardService.js:175-240`)

Superintendent memakai fungsi yang sama persis (`:242`).

Untuk tiap WO dalam scope section penonton:

- **`totalWOs`** — `++` untuk **setiap** WO, apa pun statusnya. `cancelled` dan
  `rejected` ikut. Keputusan Gabriel 15 Sep 2026 (`:202-210`). Sampai hari itu
  baris ini duduk di dalam blok `_bulanIni` bersama `approved++`, sehingga dua
  kartu berbeda selalu menampilkan angka yang sama.
- `cancelled` → `continue` (`:215`). Ia hanya dihitung sebagai pekerjaan yang
  pernah ada; tidak ikut poin maupun jam.
- **`approved`**, **`totalPoints`**, **`avgCompletion`** — hanya WO yang
  `_dashWoBulanIni()` = benar: **status `approved` DAN
  `superintendent_approved_at` di dalam periode gaji berjalan** (`:958-961`).
  - `totalPoints += wo.final_points`
  - jam: `actual_hours > 0` → akumulasi; `avgCompletion = round(total/n, 1)`
- **`pending`** — status ∈ {`pending_supervisor`, `pending_superintendent`,
  `pending_mechanic_work`}. **Sengaja TIDAK dibatasi periode** (`:193-195`):
  tunggakan bulan lalu justru yang paling perlu terlihat.
- **`thisMonth`** — `created_at >= periodePayrollSaatIni().mulai`. Perhatikan
  `:137-142`: dulu ini pakai tanggal 1 sementara metrik lain pakai periode gaji.
  Selama keduanya bulan kalender selisihnya tak terlihat; sejak cut-off bergeser,
  ia jadi dua angka “bulan ini” yang berbeda di satu layar.

### `getMechanicStats` (`:106-173`) — berbeda, dan bedanya penting

- `totalPoints` dijumlah dari **baris poin** (`mechanic_points`) milik orang itu,
  `points > 0`, `awarded_at` dalam periode — bukan dari `final_points` WO.
- `totalWOs` dan `approved` di jalur ini **selalu sama** (`:152-155` keduanya
  di dalam blok `_bulanIni`). Itu memang apa adanya di sumber; jangan “perbaiki”
  diam-diam — kalau mau diubah, itu keputusan Gabriel, bukan keputusan porting.
- `activeMechanics: 0` — Quick Stats “Mekanik Aktif” kosong untuk mekanik.

---

## 4. Tabel “Work Order Terbaru” (`:328-391`)

Header kartu: `📋 Work Order Terbaru`, di kanannya dua kontrol.

**Filter status** — `select#statusFilter.filter-select`, opsi persis:

| value | label |
|---|---|
| `all` | `🔍 Semua Status` |
| `active` | `Active` |
| `pending_supervisor` | `Level 1` |
| `pending_superintendent` | `Level 2` |
| `approved` | `Approved` |
| `rejected` | `Rejected` |

Penyaringan **di sisi klien** (`:664-684`) — menyembunyikan `<tr>`, tidak
memanggil server. `active` berarti status ∈ {`pending_mechanic_work`,
`in_progress`}.

**Tombol `+ Create WO`** (`a.btn-create`) hanya untuk `supervisor` /
`superintendent` (`:341-343`).

**Kolom tabel**, urutan tepat (`:350-359`):

`WO Number` · `Component` · `Mekanik` · `Status` · `Judgment` · `Created By` · `Tanggal`

`.table-responsive` tinggi maksimum 380px, `th` lengket (`position: sticky`).
Tiap baris `.clickable-row` → `openWoDetailsModal(wo.id)`.

**Peta badge status** (`:364-365`) — dipakai juga di modal:

| status | kelas badge | teks |
|---|---|---|
| `approved` | `badge-success` | `Approved` |
| `rejected` | `badge-danger` | `Rejected` |
| `cancelled` | `badge-danger` | `Cancelled` |
| `pending_supervisor` | `badge-warning` | `Level 1` |
| `pending_superintendent` | `badge-orange` | `Level 2` |
| lainnya | `badge-warning` | `Active` |

**Kolom Judgment** (`:366-375`): dipotong pada 40 karakter + `…`, awalan `🗒️`,
warna `#92400e`, teks penuh di `title=`. Kosong → `—` warna `#cbd5e1`.

**Kosong**: `📭` + “Belum ada work order. Buat WO pertama Anda!”

### `getRecentWOs(user, 50)` (`DashboardService.js:293-372`)

- **Jendela waktu**: hari ini 06:00 sampai **besok 18:00** (`:303-304`) — 36 jam,
  bukan 24. Itu apa adanya di sumber. Efeknya: WO yang dibuat shift malam tetap
  terlihat pagi berikutnya.
- Saring scope section, urut `created_at` menurun, ambil 50.
- `component_name` dirakit dari tiga kemungkinan (`:338-346`):
  - `component_id === 'COM-OTHERS'` → `'Others — ' + others_description`
  - ada `job_id` → `job_description + ' — ' + component + ' / ' + sub_component`
  - selain itu → nama komponen dari katalog
- `mechanics` = nama anggota tim digabung `', '`
- `created_by_name` = nama, **bukan email** (memori `tanpa-email-di-layar`)
- `judgment` + `judgment_source` dari `getEffectiveJudgment(wo)` — satu aturan
  dipakai bersama layar Approval, **jangan disalin ulang** (`:360-365`)

---

## 5. Tiga papan peringkat (`.grid-papan`, `:399-500`)

### 5a. Papan Periode (`:402-440`)

- Judul `🏆 Periode`, subjudul `{periodeLabel} · dihitung saat disetujui L2`
- `periodeLabel` = `periodePayrollSaatIni().label`, mis. `16 Agt – 15 Sep 2026`
- Rentangnya **ditulis**, bukan “Monthly” (`:404-405`): sejak cut-off 16→15,
  kata “bulan” membuat orang mengira 1–30 September.

Tiap baris (`.leaderboard-item`):

```
[rank]  [nama]                     [poin] poin
        [grade]                    Rp x.xxx.xxx
        [n] WO
```

- Rank: 🥇 🥈 🥉 untuk tiga teratas, lalu angka.
- `grade` — kosong → `—`.
- `{wo_count} WO` hanya ditampilkan **kalau `wo_count` ada isinya** (`:424`).
- Kosong: `🏆` + “Belum ada poin disahkan di periode ini”.

**YANG BESAR ADALAH POIN, BUKAN RUPIAH** (`:126-145`). Ini bukan selera:

> Papan diurutkan menurut **poin**. Sampai 9 Sep 2026 semua rate bernilai 1,
> jadi urutan poin dan urutan rupiah kebetulan sama. Sejak rate per jabatan
> menyala, keduanya berpisah — seorang junior bisa unggul poin tapi kalah
> rupiah dari seniornya. Papan yang terurut sempurna menurut poin akan tampak
> **acak** kalau yang dibaca mata lebih dulu adalah rupiahnya.

Maka: `.lb-poin` = 1.05rem, `font-weight:800`, warna teks utama, `tabular-nums`;
kata “poin” 0.72rem abu. `.mechanic-earnings` = 0.78rem, `#059669` (hijau).
Di ≤640px keduanya turun baris **bersama** sebagai satu blok (`:249-256`) —
kalau hanya rupiah yang dibungkus, ia kembali jadi angka paling menonjol.

Rupiah diformat dengan pemisah titik ribuan: `String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.')`.

#### `getLeaderboard(user, 100)` (`DashboardService.js:717-779`)

Sumber: baris `mechanic_points`. Saringan berurutan:

1. `points > 0`
2. bukan WO di bawah ambang mulai berlaku *(khas KMB V2 — lihat §8)*
3. `awarded_at` di dalam periode gaji berjalan
4. scope section dari `record.section` (section **baris poin**, bukan orangnya)
5. bukan akun uji

Lalu: `total_points += points`, `total_idr += record.idr_value` — **nilai
tersimpan, tidak dihitung ulang** (`:755`). Nama dan `grade` diambil dari peta
mekanik; `grade`, **bukan `position`** (`:766`) — `position` adalah kunci ke
rate dan tak boleh tampil di layar.

Urut `total_points` menurun, `rank = index + 1`, ambil 100.

### 5b & 5c. Dua papan harian (`:442-499`)

Iterasi atas `[field, tyreman]` — **Field dulu, Tyreman kedua** (`:450-451`).

- Judul: `🏆 Harian — {nama}`
- Subjudul: `{label} · {jumlah_wo} WO dikirim`
- Kalau `taksir`: spanduk ungu `.taksir` —
  `⚠️ **Sebagian masih perkiraan** — ada WO yang sudah dikirim tapi belum disetujui.`
  Ungu dipakai di sistem ini **hanya** untuk angka yang bukan kenyataan final
  (`:83-85`).
- Baris sama dengan papan periode, tapi `{wo_count} WO` **selalu** ditampilkan.
- Kosong: `🌙` + “Belum ada kiriman {nama} hari ini”. Dikatakan terang-terangan
  karena papan harian memang sering sepi, dan kartu kosong tanpa kalimat gampang
  dikira rusak (`:488-490`).

#### `getLeaderboardHarian(user, 10)` (`DashboardService.js:492-715`)

**Jendelanya satu SHIFT, bukan satu hari** (`:480-488`, keputusan Gabriel 8 Sep
2026). Sehari penuh mencampur dua shift, dan dua shift adalah dua **regu orang**
yang berbeda — regu malam akan selalu kalah di pagi hari hanya karena shiftnya
belum dimulai.

```
PAGI = 6, MALAM = 18       (dari FIELD_SHIFT_MULAI_PAGI / _MALAM — satu tempat)

jam < 6    → Shift 2 : kemarin 18:00  →  hari ini 06:00 (−1 ms)
jam < 18   → Shift 1 : hari ini 06:00 →  hari ini 18:00 (−1 ms)
selain itu → Shift 2 : hari ini 18:00 →  besok    06:00 (−1 ms)
```

Label (`:535-552`): `Shift 1 · 15 Sep 06:00 – 18:00`, atau bila menyeberang hari
`Shift 2 · 15 Sep 18:00 – 16 Sep 06:00`. Batas disimpan sebagai 1 ms sebelum
jam bulat supaya tak bertindih; **yang ditulis di layar jam bulatnya**
(17:59→18:00, 5:59→6:00, `:538-544`).

**Patokan `submitted_at`, bukan `awarded_at`** (`:457-468`) — alasan penuhnya
ada di komentar sumber dan wajib ikut ke KMB Project:

> Untuk papan harian, `awarded_at` merusak seluruh maknanya: hari tunggakan
> dibereskan → papan penuh orang yang bekerja tiga minggu lalu; hari tanpa
> approval → papan **kosong** padahal semua orang bekerja. Papan berbasis
> approval menampilkan kegiatan **approver**, bukan kegiatan mekanik.

Harganya: angkanya belum final. Untuk WO yang sudah dikirim tapi belum disahkan,
poin **dihitung di sini** lewat jalur skoring yang sama dengan approval
(`:621-636`), dan kartunya menyebut dirinya perkiraan lewat `taksir`.

Akumulasi dipisah per section **WO-nya**, bukan section orangnya (`:592-597`):
tyreman yang membantu WO field muncul di papan field untuk WO itu. Section
selain `tyreman` dilipat ke papan Field, dan **namanya ikut berubah** jadi
`Field & workshop` (`:684-709`) — supaya pekerjaannya tidak hilang diam-diam
dan judulnya tidak berbohong.

Tiap baris: `mechanic_name`, `grade`, `total_points` (bulat 2), `total_idr`
(`Math.round`), `wo_count`. Urut poin menurun, ambil 10.

> ⚠️ **Divergensi yang harus diputuskan.** `:642-643` membagi poin dengan
> `percentage / 100`. Di KMB V2 `percentage` selalu 100 (model poin penuh:
> setiap anggota menerima `final_points` utuh), jadi rumusnya menyusut jadi
> “poin penuh untuk semua anggota”. **KMB Project tidak punya kolom
> `percentage`** — port rumusnya sebagai poin penuh, jangan bawa kolomnya.

---

## 6. Grafik tren + Quick Stats (`:502-577`)

### Grafik (`:504-518`, `:604-646`)

Judul: `📈 Tren Poin — {jumlah_periode} Periode Terakhir`. Angkanya **dibaca dari
data**, bukan ditulis tangan (`:506-512`) — dulu judulnya “6 Bulan Terakhir”
sementara isinya ditentukan kode server, dan yang terlupa selalu judulnya.

Chart.js 3.9.1, `type: 'line'`:

| properti | nilai KMB V2 | KMB Project |
|---|---|---|
| `borderColor` | `#2563EB` | `#DC2626` |
| `backgroundColor` | `rgba(37,99,235,0.08)` | `rgba(220,38,38,0.08)` |
| `pointBackgroundColor` | `#2563EB` | `#DC2626` |
| `borderWidth` | 2.5 | sama |
| `fill` / `tension` | `true` / `0.4` | sama |
| `pointRadius` / hover | 4 / 6 | sama |
| `legend` | `display:false` | sama |
| tooltip label | `' ' + y + ' poin'` | sama |
| sumbu Y | `beginAtZero`, grid `#f1f5f9` | sama |
| sumbu X | grid `display:false` | sama |
| `maintainAspectRatio` | `false` | sama |

Canvas `max-height:280px`, kartu `min-height:250px`.

#### `getPointsTrendData` (`:794-850`)

`TREN_PERIODE = 3` periode **gaji** ke belakang (termasuk yang berjalan).
Kembalian: `{labels[], label_penuh[], jumlah_periode, data[]}`.
`labels` = `labelPendek` (mis. `16 Agt – 15 Sep`), `label_penuh` untuk tooltip.
Nilai = jumlah **poin** (bukan rupiah), dibulatkan 2, dikelompokkan menurut
`awarded_at`. Saringan sama dengan papan periode.

### Quick Stats (`:523-575`)

Tiga butir, urutan tepat:

1. **Mekanik Aktif** — angka besar `stats.activeMechanics`, lalu rincian per
   jabatan: nama · garis titik-titik · jumlah (`.qs-jabatan-*`). Kalau kosong:
   “Jabatan belum diisi di Config_Mechanics” → di KMB Project ganti jadi
   **“Jabatan belum diisi di master mekanik”**.
2. **Bulan Ini** — `{stats.thisMonth} WO`
3. **Rata-rata Waktu Kerja** — **jam & menit, bukan desimal** (`:558-572`):
   ```
   jam   = floor(avgCompletion)
   menit = round((avgCompletion - jam) * 60)
   menit === 60 → jam++, menit = 0
   "X jam Y menit" | "X jam" | "Y menit" | "0 menit"
   ```
   “0.1 jam” menuntut pembacanya mengalikan 60 di kepala; “6 menit” langsung
   terbaca. **Rumus yang sama dipakai `fmtJam` di layar Approval** — satu
   pekerjaan tidak boleh tampil sebagai dua angka berbeda di dua layar.

#### `_tenagaKerjaAktif(scope, email)` (`:257-286`)

Satu fungsi menghasilkan angka besar **dan** rinciannya, sengaja (`:245-251`):
kalau dihitung dua fungsi terpisah, suatu hari rinciannya tidak berjumlah sama
dengan angka di atasnya dan tak ada yang bisa menjelaskan kenapa.

Saringan: `is_active`, `role = 'mechanic'`, dalam scope, bukan akun uji.
Kelompok menurut **`grade`**; kosong → `(tanpa jabatan)` — **tetap dihitung**,
tidak dibuang diam-diam (`:269-272`). Urut jumlah menurun, nama sebagai pemutus
seri supaya urutannya tidak berpindah tiap muat ulang.

---

## 7. Yang harus dibangun di KMB Project

### 7a. `src/domain/periode.ts` — BELUM ADA, dan lima hal bergantung padanya

Port dari `_PeriodePayroll.js:42-125`. **Satu definisi, bukan lima salinan** —
alasannya di `:11-20`: selama aturannya “tanggal 1 sampai akhir bulan”, salinan
ganda tak pernah berselisih; begitu cut-off bergeser, satu salinan yang terlewat
menghasilkan angka yang **berbeda tapi masuk akal** di layar yang berbeda.

```ts
export const PAYROLL_CUTOFF_TANGGAL = 16;

export interface Periode {
  mulai: Date; akhir: Date;
  label: string;        // "16 Agt – 15 Sep 2026"
  labelPendek: string;  // "16 Agt – 15 Sep"   (+ " '27" bila lintas tahun)
  kunci: string;        // "2026-09"  (tahun-bulan PENUTUP)
}

periodeBerakhir(tahun, bulan): Periode   // bulan = bulan PENUTUP
periodeSaatIni(acuan?): Periode
periodeMundur(p, n): Periode
dalamPeriode(nilai, p): boolean
```

Aturan batas (`:75-81`): tanggal 1–15 masih milik periode yang dibuka bulan lalu;
tanggal ≥16 sudah masuk periode berikutnya.
- `akhir` = `new Date(th, bl-1, 15, 23,59,59,999)`
- `mulai` = `new Date(th, bl-2, 16, 0,0,0,0)`

Label (`:101-119`): tahun ditulis di sisi `mulai` **hanya** kalau periodenya
menyeberang tahun. `labelPendek` pakai **nama** bulan, bukan angka.

Simpan `PAYROLL_CUTOFF_TANGGAL` di tabel `settings`, bukan konstanta kode —
supaya bergesernya cut-off tidak butuh deploy.

**Wajib ada ujinya**, meniru `periksaPeriodePayroll()` (`:132-184`): uji tanggal
15, 16, 31, 1 dari dua sisi batas, lalu buktikan sambungan antar periode rapat
(`mulai[n] − akhir[n−1] === 1 ms`). Kesalahan pada aturan seperti ini selalu
tepat di tanggal 15 dan 16, tak pernah di tengah bulan.

**PA / MTBF / MTTR di layar Teknis TETAP bulan kalender** (`:22-31`) — ketiganya
milik kontrak klien (MOHH 744 jam), bukan milik payroll.

### 7b. `src/domain/kueriPerforma.ts`

Lima fungsi, satu per blok. Pola scope ikut `sectionYangBoleh()` yang sudah ada
di `src/domain/kueri.ts:33-38` — **tanpa baris `mechanic_sections` = boleh lihat
semua section**.

```ts
statistikRingkas(aku): Promise<Statistik>
woTerbaru(aku, batas = 50): Promise<BarisWoTerbaru[]>
papanPeriode(aku, batas = 100): Promise<BarisPapan[]>
papanHarian(aku, batas = 10): Promise<{label, shift, field, tyreman}>
trenPoin(aku, jumlahPeriode = 3): Promise<TrenPoin>
```

Sketsa SQL untuk papan periode — perhatikan `idr_value` **dibaca**, tidak
dihitung ulang:

```sql
SELECT m.id, m.name, coalesce(m.grade,'') AS grade,
       round(sum(p.points), 2)  AS total_points,
       round(sum(p.idr_value))  AS total_idr,
       count(*)                 AS wo_count
  FROM mechanic_points p
  JOIN mechanics m ON m.id = p.mechanic_id
  JOIN sections  s ON s.id = p.section_id
 WHERE p.points > 0
   AND p.awarded_at >= $mulai AND p.awarded_at <= $akhir
   AND m.is_test_account = false
   AND ($scope::text[] IS NULL OR s.code::text = ANY($scope::text[]))
 GROUP BY m.id, m.name, m.grade
 ORDER BY total_points DESC
 LIMIT $batas
```

Statistik ringkas — satu kueri, bukan empat:

```sql
SELECT count(*)                                              AS total_wo,
       count(*) FILTER (WHERE w.status = 'approved'
                          AND w.approved_l2_at BETWEEN $mulai AND $akhir) AS approved,
       count(*) FILTER (WHERE w.status IN ('pending_supervisor',
                                           'pending_superintendent',
                                           'pending_mechanic_work'))      AS pending,
       coalesce(sum(w.final_points) FILTER (WHERE w.status = 'approved'
                          AND w.approved_l2_at BETWEEN $mulai AND $akhir), 0) AS total_poin,
       count(*) FILTER (WHERE w.created_at >= $mulai)         AS bulan_ini,
       round(avg(w.actual_hours) FILTER (WHERE w.status = 'approved'
                          AND w.approved_l2_at BETWEEN $mulai AND $akhir
                          AND w.actual_hours > 0), 1)         AS rata_jam
  FROM work_orders w
  JOIN sections s ON s.id = w.section_id
 WHERE w.tenant_id = $tenant
   AND ($scope::text[] IS NULL OR s.code::text = ANY($scope::text[]))
```

Peta kolom KMB V2 → KMB Project:

| KMB V2 | KMB Project |
|---|---|
| `superintendent_approved_at` | `work_orders.approved_l2_at` |
| `mechanic_id` + `wo_id` | `mechanic_points (work_order_id, mechanic_id)` |
| `record.section` | `mechanic_points.section_id` → `sections.code` |
| `idr_value` (kolom biasa) | kolom **GENERATED** `round(points * idr_per_point, 0)` |
| `mech.grade` | `mechanics.grade` |
| `mech.position` | `pay_rates.position` — **tak pernah tampil** |
| `others_description` | `work_orders.manual_description` |
| `component_id = 'COM-OTHERS'` | `work_orders.is_manual = true` |

### 7c. Jangan ditiru

- **`recentActivity`** — dimatikan 1 Sep 2026 (`DashboardService.js:38-57`):
  17.712 baris dibaca, diurutkan (±½ juta `new Date()`), diambil 10, sisanya
  dibuang, dan **tak ada satu pun layar yang membacanya**. Jangan dibangun.
- **`getStatusDistributionData`** (`:852-866`) — dihitung, tidak pernah dipakai.
- **Menelan galat jadi daftar kosong.** Sudah dicatat di
  `src/domain/kueri.ts:10-13`; berlaku penuh di sini. Approver pernah melihat
  “tidak ada WO aktif” padahal ada 36.

---

## 8. Ambang mulai berlaku — khas KMB V2

`_PeriodePayroll.js:373-464`. `MAR_MULAI_BERLAKU = 16 Agu 2026`: WO yang
**dikirim** sebelum itu adalah data masa uji — tidak digaji, tidak boleh muncul
di layar mana pun. Persis 156 WO berada di celah ini.

**KMB Project tidak membutuhkannya** — sistemnya lahir bersih, tak ada data
pilot untuk disembunyikan. Yang dibawa adalah **pelajarannya** (`:396-401`):

> Disaring di lapisan query, bukan di tiap layar. Ada belasan tempat yang
> menampilkan WO. Menyaring satu per satu berarti setiap layar **baru** otomatis
> bocor, dan bocornya tak berbunyi — cuma ada angka yang lebih besar dari
> seharusnya.

Terjemahannya di KMB Project: penyaring periode dan scope tinggal di
`kueriPerforma.ts`/`kueri.ts`, tidak pernah di komponen React.

---

## 9. Modal detail WO (`:581-591`, `:687-839`)

Dipicu klik baris tabel. `.modal-overlay` gelap + `backdrop-filter: blur(4px)`;
`.modal-card` maks 650px / 85vh, animasi `modalFadeIn 0.2s`. Klik pada overlay
(bukan kartu) menutup (`:725-729`).

Judul `📄 Detail Work Order`. Isi `.modal-detail-grid` 2 kolom, delapan butir
berurutan:

`WO NUMBER` · `COMPONENT` · `MEKANIK / TEAM` · `STATUS` · `WORK CONDITION` ·
`LOCATION` · `CREATED BY` · `TANGGAL` · `ACTUAL HOURS`

- **WORK CONDITION** dengan titik warna (`:746-760`):
  `normal` → 🟢 RINGAN · `difficult` → 🟡 SEDANG · `extreme` → 🔴 BERAT ·
  lainnya → ⚪ + nilai huruf besar
- **LOCATION** huruf besar
- **TANGGAL** `d/m/yyyy`
- **ACTUAL HOURS** → `{n} jam`, atau `N/A`

Lalu dua blok selebar penuh, hanya kalau isinya ada:

- `🗒️ JUDGMENT APPROVER (L1|L2)` — warna `#92400e`, `white-space: pre-wrap`.
  Level dari `judgment_source` (`superintendent` → L2, `supervisor` → L1).
- `📝 KETERANGAN` — warna `#475569`, `white-space: pre-wrap`.

Di KMB Project ini cukup satu `GET /api/wo/{id}` yang memanggil
`rincianWo()` (`src/domain/kueri.ts:171-200`) — sudah ada.

---

## 10. Navbar (`:1-5`, `:264-284`) — berlaku untuk SEMUA layar

Menu mengikuti **penanda akses per-orang**, bukan peran (`:1-3`):

```
_akses = aksesLayarUntuk(user.email)   → {performa, teknis, report}
```

> Menu yang menawarkan layar yang akan menolak Anda membuat orang mengira
> sistemnya rusak. Dibaca **sekali** di sini, bukan per tautan.

| Menu | Syarat tampil | Kolom KMB Project |
|---|---|---|
| Performa | `_akses.performa` | `mechanics.may_view_performance` |
| Create WO | selalu | — |
| Monitoring | selalu | — |
| Approvals | peran `supervisor` \| `superintendent` | `mechanics.role` |
| Teknis | `_akses.teknis` | `mechanics.may_view_technical` |
| Koreksi HM | peran `supervisor` \| `superintendent` | `mechanics.role` |
| Koreksi KM | peran `supervisor` \| `superintendent` | `mechanics.role` |
| Reports | `_akses.report` | `mechanics.may_view_report` |

Baris identitas (`:277-283`):
- `mechanic` → `badge-blue` “Mechanic”
- `supervisor` → **tanpa badge**, sengaja (permintaan 10 Agu 2026, `:279`)
- `superintendent` → `badge-purple` “Manager”
- teks: `user.mechanic_name || user.email` — **nama, bukan email**

Tautan aktif: `.nav-link.active` — di KMB V2 `background:#fef3c7; color:#b45309`
(amber). Di KMB Project: turunan merah, `--primary-soft` / `--primary`.

---

## 11. Daftar periksa selesai

- [ ] `src/domain/periode.ts` + uji batas tanggal 15/16 dan sambungan 1 ms
- [ ] Empat kartu statistik, label & subtitel persis, `totalWOs` menghitung batal & ditolak
- [ ] `pending` **tidak** dibatasi periode
- [ ] Tabel WO 7 kolom + filter klien + jendela 36 jam
- [ ] Badge status 6 pemetaan benar
- [ ] Judgment dipotong 40 karakter, teks penuh di `title`
- [ ] Papan Periode: poin besar, rupiah kecil hijau, `grade` bukan `position`
- [ ] Dua papan harian, **Field dulu**, jendela shift bukan 24 jam
- [ ] Spanduk `taksir` ungu muncul saat ada WO belum disahkan
- [ ] Section selain tyreman dilipat ke Field **dan namanya berubah**
- [ ] Grafik 3 periode, merah, judul membaca `jumlah_periode` dari data
- [ ] Quick Stats: rincian jabatan berjumlah sama dengan angka besarnya
- [ ] Rata-rata waktu dalam jam & menit, rumus sama dengan layar Approval
- [ ] Modal detail 9 butir + judgment + keterangan
- [ ] Navbar 8 menu, syarat tampil per-orang, supervisor tanpa badge
