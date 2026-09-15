# PETA LENGKAP KMB V2 — dasar pembangunan KMB Project

> Disusun 15 Sep 2026 dari pembacaan kode `MAR-project@feature/token-auth-web`,
> PWA `mar-offline@6b013dd`, `CLAUDE.md`/`AGENTS.md`, `KMB-V2-HANDOFF.md`,
> `KMB-V3-BRIEF.md`, dan 207 commit.
>
> **Aturan dokumen ini:** setiap klaim berjejak `file:baris`. Bila dokumen ini
> bertentangan dengan kode aktual, **kode aktual yang benar**. Hal yang tidak
> terbukti ditandai `BELUM PASTI`.

---

## 0. APA YANG SEDANG DIBANGUN

**KMB Project** = produk baru, bukan port GAS.

| | KMB V2 (sekarang) | KMB Project (dibangun) |
|---|---|---|
| Proses bisnis | — | **sama** |
| Cara memilih job (cascade) | — | **sama** |
| Unit | 60 unit, 8 model | **berbeda** — diisi pemilik produk |
| Daftar job | 1.399 job | **sama + tambahan** — diisi pemilik produk |
| Backend | Google Apps Script | Node/TypeScript |
| Basis data | Google Sheets (19 sheet) | PostgreSQL |
| Aplikasi HP | PWA terpisah, logika kembar | PWA, **satu logika** dengan web |
| Web | GAS HTML | Web penuh, **lebih lengkap dari PWA** |

Dua kalimat yang mengikat seluruh rancangan:

1. **Tidak boleh ada WO hilang.**
2. **Tidak boleh ada mekanik kurang bayar atau dibayar dua kali.**

Semua keputusan teknis di dokumen ini tunduk pada dua kalimat itu.

---

## 1. PERAN & HAK

Hanya **tiga** peran (`Constants.js:269-295`). Tidak ada admin/HR sebagai peran.

```js
var ROLES = { MECHANIC:'mechanic', SUPERVISOR:'supervisor', SUPERINTENDENT:'superintendent' };
var APPROVER_ROLES      = [SUPERVISOR, SUPERINTENDENT];
var WO_CREATOR_ROLES    = [MECHANIC, SUPERVISOR, SUPERINTENDENT];   // mekanik boleh sejak 3 Agu 2026
var OTHERS_CREATOR_ROLES= [SUPERVISOR, SUPERINTENDENT];             // WO Others TIDAK untuk mekanik
```

Label layar: `supervisor` = **L1 (Planner/PIC Lapangan)**, `superintendent` = **L2 (Manager)** (`Constants.js:150-151`).

### Matriks peran × aksi

| Aksi | Mekanik | L1 | L2 |
|---|:---:|:---:|:---:|
| Buat WO dari katalog | ✅ | ✅ | ✅ |
| Buat WO **Others** (ketik poin sendiri) | ❌ | ✅ | ✅ |
| Kerjakan / timer / submit | ✅ | ✅ | ✅ |
| Minta transfer WO | ✅ | ✅ | ✅ |
| Setujui transfer | ❌ | ✅ | ✅ |
| Approve L1 | ❌ | ✅ | ✅ |
| Approve L2 (poin terbit) | ❌ | ❌ | ✅ |
| Kembalikan ke mekanik | ❌ | ✅ | ✅ |
| Override poin/jam/tim/unit/kondisi | ❌ | ✅ | ✅ |
| Batalkan WO approved (nol-kan poin) | ❌ | ❌ | ✅ |
| Koreksi HM/KM | ❌ | ✅ | ✅ |
| Ekspor payroll | ❌ | ⚠️ | ✅ |
| Dashboard performa / teknis | ⚠️ | ⚠️ | ✅ |

⚠️ = ditentukan penanda per-orang di `Config_Mechanics` (`boleh_lihat_performa`, `boleh_lihat_teknis`, `boleh_lihat_report`), `_AksesLayar.js:34-95`.

> **Celah yang jangan diwarisi.** Halaman `reports` dibatasi L2, tetapi RPC
> `generatePayrollReport` sendiri menerima L1 (`PayrollService.js:19`). Gerbang
> layar bukan gerbang data. Di produk baru: **otorisasi ditegakkan di lapisan
> data, bukan di lapisan halaman.**

### Scope section per orang

`Config_Mechanics.section` boleh berkoma (`"tyreman,field"`). `userScopeAllows` (`Auth.js:473-490`) lolos bila **salah satu** cocok. **Kosong = lihat semua.**

> Bug nyata: dulu dibandingkan sebagai string utuh, jadi orang ber-section ganda
> hilang dari Monitoring, daftar approval, dan seluruh dropdown — di 25 tempat,
> 7 berkas (`Auth.js:478-483`, commit `6ea5458`). **Di produk baru: relasi
> `mechanic_sections`, bukan string koma.**

---

## 2. SIKLUS HIDUP WORK ORDER

### Status (`Constants.js:92-111`)

Aktif: `pending_mechanic_work` · `in_progress` · `pending_supervisor` · `pending_superintendent` · `pending_transfer` · `approved` · `rejected`
Mati: `created`, `wait_mtbf` (Workflow A), `others_pending_supervisor`

> ⚠️ **`cancelled` tidak terdaftar di `WO_STATUS` maupun `STATUS_TRANSITIONS`.**
> `cancelWorkOrder` menulisnya lewat `updateRow` mentah, jadi mesin status buta
> terhadapnya. Di produk baru: **status adalah enum database; tidak ada nilai
> yang bisa masuk tanpa lewat mesin transisi.**

### Alur normal

```
                    ┌──────────────── kembalikan ke mekanik (putaran+1) ─────────┐
                    ▼                                                            │
 [buat] ──▶ pending_mechanic_work ──▶ in_progress ──▶ pending_supervisor ──▶ pending_superintendent ──▶ approved
                    │                     │                   │                        │                  │
                    │                     └──▶ pending_transfer                     rejected           (arsip)
                    │                              │                                                      │
                    └──────────────────────────────┘                                              cancelled (poin di-nol-kan)
```

Transfer menyimpan jam sesi berjalan ke `partial_hours`, WO kembali ke mekanik penerima, dan jam final = `sesi terakhir + partial_hours` (`MechanicService.js:379-392`).

### WO Group — dua arah (`Constants.js:986-991`)

- mode `unit` → 1 unit, banyak job
- mode `job` → 1 job, banyak unit
- kosong → WO tunggal

Anti-kembar dalam grup ditegakkan **di server** (`cekKembarDalamGrup`, `WorkOrderService.js:1190+`), bukan hanya di form.

---

## 3. ANTI-WO-GANDA — bagian terpenting dokumen ini

KMB V2 sudah kena WO ganda **empat kali dengan empat sebab berbeda**. Produk baru harus menutup keempatnya secara struktural, bukan dengan tambalan.

### Sebab 1 — ruang nomor terlalu sempit

```js
function generateWoNumber() {
  return 'WO-' + formatDate(now,'YYYYMMDD') + '-' + padZero3(now.getTime() % 1000);
}
```
`Utils.js:166-171`. **1.000 slot per hari** untuk ~100 WO/hari. Tabrakan bukan kemungkinan, melainkan kepastian statistik.

**Kejadian:** 6 Agu 2026 — 3 pasang WO berbeda bernomor sama, **semuanya sudah dibayar**.
**Tambalan GAS:** `_nomorWoUnik()` baca seluruh WorkOrders+Archive, retry 50×, lalu perlebar akhiran acak (`WorkOrderService.js:1421-1449`).
**Kejadian lanjutan:** 14 Sep 2026 — dua **grup** berjarak 11 detik dapat pangkal nomor sama (`ApiService.js:663-687`).

→ **KMB Project: `wo_number` dari sequence database per tenant per hari, plus `UNIQUE(tenant_id, wo_number)`.** Tidak ada scan-lalu-retry.

### Sebab 2 — dua pengirim, satu antrean

PWA dan service worker mengosongkan outbox yang **sama** tanpa saling mengunci. `op_id` berbeda (dua enqueue), jadi dedup tidak menolong; keduanya membaca WorkOrders sebelum salah satu menulis.

**Kejadian:** `WO-20260804-229-C` tercipta dua kali, 4 Agu 2026 (`ApiService.js:632-644`).

→ **KMB Project: satu pengosong antrean pada satu waktu (Web Locks API), dan `UNIQUE(idempotency_key)` di database sebagai jaring terakhir.**

### Sebab 3 — 502 di jalur pulang

HTTP 502 tidak membedakan "server tak terima" dari "server sudah menulis semua, jawabannya yang putus". Dari layar keduanya identik.

**Kejadian acuan (SUM, 12 Agu 2026):** 17 WO borongan **masuk semua**, jawaban putus, pembuat klik ulang → **17 WO kembar bernomor berbeda**. Tidak ada pemeriksaan harian yang bisa mendeteksinya — dua WO utuh bukan duplikat menurut definisi apa pun.

**Tambalan GAS:** "Buku Kiriman" `_KirimanWeb.js` — 4 keadaan (baru/sedang/selesai/terputus), struk disimpan **sebelum** dikirim balik.

→ **KMB Project: idempotency key wajib untuk setiap tulis, disimpan dalam transaksi yang sama dengan efeknya. `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`.** Klien yang mengulang mendapat struk lama, bukan WO kedua.

### Sebab 4 — pencarian dedup yang salah alat

`TextFinder` mencocokkan **teks yang tampil**, bukan nilai. `op_id` panjang bisa tampil `1,7555E+15` di Sheets dan tak pernah ketemu (`ApiService.js:1006-1111`).

→ **KMB Project: `op_id` kolom `text` ber-`UNIQUE INDEX`. Pencarian `WHERE op_id = $1`.** Kelas bug ini lenyap.

### Deteksi kembar yang tetap dibutuhkan

Kembar bernomor **berbeda** tidak terlihat oleh constraint mana pun. `_DeteksiKembar.js:1-58`: kembar = unit sama + job sama + jam mulai berdekatan (bawaan 30 menit), **menandai, tidak memblokir** — karena kerja ulang yang sah harus tetap bisa lewat.

→ **Wariskan apa adanya**, sebagai peringatan di layar approval, bukan constraint.

---

## 4. JALUR UANG

### Rumus poin (`ScoringService.js:119-120`)

```
FINAL = base_points × unit_factor × work_condition × timeliness × safety × mtbf
IDR   = FINAL × rate_<position mekanik>
```
Dibulatkan `roundTo(finalPoints, 2)`.

| Faktor | Sumber | Default bila hilang |
|---|---|---|
| `base_points` | `Config_Jobs_*.base_point` (job) / `Config_Components.base_points` (tyreman) | **error**, bukan diam-diam |
| `unit_factor` | `Config_Units.unit_factor` | `1.0` + `Log.warn` (`Constants.js:352`) |
| `work_condition` | `Config_Factors` | `1.0` |
| `timeliness` | rasio `actual/target`: ≤100% on_time · 101-150% late · >150% way_late | `1.0/0.8/0.5` |
| `safety` | `no_incident=1.0`, `incident=0.0` | — |
| `mtbf` | `mtbf_redo_status` — **pilihan approver**, bukan hitungan | `1.0` |

> **`safety=incident` menol-kan SELURUH WO**, untuk semua anggota tim sekaligus.

> **MTBF bukan hitungan.** Fungsi `calculateMtbf`/`isRedoJob` hanya dipanggil dari
> `finishWorkOrder()` (Workflow A, mati). Jalur hidup membaca `mtbf_redo_status`
> yang dipilih approver — `first_time` (1.2) vs `redo` (0.8), rentang 50%, tanpa
> pembanding riwayat apa pun (`ScoringService.js:110-116`).

### Poin PENUH per anggota

`Utils.js:193-230` — `percentage` wajib **100**, nilai lain **ditolak keras**.

```
total poin dibayar = final_points × jumlah anggota tim
```

Menambah anggota **tidak** memecah kue — ia menggandakan pengeluaran. Konsekuensi langsung: setiap penambahan anggota lewat override/transfer adalah keputusan uang.

### Rate per jabatan — jebakan senyap paling mahal

```js
var rate = getSetting('rate_' + position);
return (typeof rate === 'number' && rate > 0) ? rate : defaultRate;
```
`ConfigService.js:511-525`. Rate nyata: `rate_junior=2500`, `rate_senior=3500`, `rate_advisor=4500`.

**Bila `position` tidak cocok kunci mana pun → jatuh ke `points_to_idr_multiplier = 50000`** (`Constants.js:346`) — **11-20× lipat**, tanpa error, tanpa log. Perangkap tersering: spasi. `"Tyreman Senior"` → mencari `rate_tyreman senior`, sementara kuncinya `rate_tyreman_senior` (`AuditKolom.js:320-334`).

→ **KMB Project: `position` adalah foreign key ke tabel `pay_rates`. `NOT NULL`. Tidak ada fallback senyap yang mungkin secara skema.**

### Snapshot — riwayat dibekukan

Saat approve L2, hasil hitung dibekukan dua kali: `WorkOrders.final_points` dan satu baris `ScoringSnapshots` lengkap (`ScoringService.js:365-405`). Payroll membaca **snapshot**, bukan katalog (`PayrollService.js:225-233`).

→ Mengubah katalog **tidak** mengubah riwayat WO yang sudah approved. Pertahankan.

### ⚠️ Dashboard dan Payroll bisa beda rupiah

| Layar | Sumber rupiah |
|---|---|
| Dashboard/leaderboard | `MechanicPoints.idr_value` — **rate saat award** (`DashboardService.js:755`) |
| Ekspor payroll | `points × getRateForMechanic()` — **rate saat ekspor** (`PayrollService.js:162-163`) |

Ubah rate di antara approve dan ekspor → dua layar tidak akan pernah cocok untuk WO lama, tanpa ada yang memberi tahu. Ini akar episode 9 Sep 2026 (−Rp 17,6 jt).

→ **KMB Project: satu sumber. `idr_value` sebagai generated column dari poin × rate yang tersimpan di baris itu.** Rekonsiliasi bukan tugas manusia.

### Idempotensi award (yang sudah benar, pertahankan maknanya)

`awardPointsToMechanics` (`ScoringService.js:513-533`) membaca segar `MechanicPoints` per `wo_id`; bila sudah ada baris → **no-op**, di dalam kunci L2 yang sama dengan penulisan status.

Ditambah **mode lanjutan** (`ApprovalService.js:263-269`): kalau status sudah `approved` tetapi poin belum tertulis (eksekusi mati di tengah karena batas 6 menit), approve kedua **melanjutkan**, bukan menolak.

→ **KMB Project: satu transaksi database.** `UPDATE ... WHERE status='pending_superintendent' RETURNING` + insert poin + insert snapshot, semuanya all-or-nothing. "Mode lanjutan" tidak perlu ada karena keadaan setengah jadi tidak mungkin ada.

---

## 5. KATALOG, UNIT, SECTION

### Tiga bentuk pemilihan, dipilih oleh radio Section

```
 TYREMAN            FIELD                    WORKSHOP
 unit               unit                     (tanpa unit)
 └ component        └ unit_model             └ unit_model
   (COM-xxx)          └ component               └ component
   2 level              └ sub_component            └ sub_component
                          └ job                       └ job
                        5 level                     4 level
```

| Sheet | Kolom |
|---|---|
| `Config_Jobs_Field` / `Config_Jobs_Workshop` | `job_id, unit_model, component, sub_component, job_description, plan_hours, base_point, job_type, is_active` |
| `Config_Components` (tyreman) | `component_no, component_name, category, base_points, target_hours, default_team_size, notes` |
| `Config_Units` | `unit_id, unit_name, unit_type, unit_model, unit_factor, is_active, brand, type, odometer_type, mtbf_eligible, unit_scope, notes` |

Volume KMB V2: 1.209 job field + 190 job workshop + 6 component tyreman, 60 unit.

> **Jebakan penamaan.** `base_point`/`plan_hours` (job) vs `base_points`/`target_hours` (component) — dua nama untuk konsep sama, memaksa `calculateScore` bercabang (`ScoringService.js:55-71`). **Produk baru: satu nama.**

> **Section sebuah job = sheet asalnya, bukan kolom** (`JobCatalogService.js:8`).
> Akibatnya `getJobRecord` harus memindai dua sheet dan punya aturan presedensi
> bila `job_id` bentrok. **Produk baru: satu tabel, kolom `section`, `job_code` UNIQUE.**

> **Yang menyaring job adalah `unit_model`, bukan `unit_type`.** 34 unit hauler dari
> 2 tipe mesin berbeda berbagi satu joblist. `unit_model` = kelas joblist,
> `unit_type` = spesifikasi.

### Dua kegagalan senyap yang wajib dihapus

1. **Satu spasi di ujung `unit_model`** membuat seluruh model itu lenyap dari dropdown — tanpa galat. Kejadian 10 Sep 2026 saat menambah Compressor, Welding Machine, Pompa Tambang (`WorkOrder.html:1247-1254`, commit `cca20b7`).
2. **Unit yang belum punya baris joblist tidak muncul sama sekali** di section field (`_PeriksaModelJob.js:11-19`).

→ **KMB Project:** `unit_model` adalah foreign key (tidak ada pencocokan teks), dan unit tanpa joblist **tetap tampil dengan keterangan "belum punya joblist"** — bukan hilang. Ini penting karena pemilik produk akan mengisi unit & job baru sendiri.

### Jalur "Others"

Hidup: `component_id = 'COM-OTHERS'`. Pembuat (L1/L2 saja) mengetik `description`, `base_points`, `target_hours`, `unit_factor` — **langsung masuk jalur uang** (`WorkOrderService.js:113-166`).

Nilainya menumpang kolom `override_base_points_supervisor` (`WorkOrderService.js:266-273`) — itulah sebabnya badge "SPV override" dulu muncul di setiap WO Others (`ApiService.js:376-389`).

→ **KMB Project: kolom sendiri (`manual_base_points`, …), bukan menumpang kolom override.**

Mati: `OthersJobService.js` + sheet `OthersJobRequests` — nol pemanggil klien. Alur "mekanik mengajukan job di luar katalog" **belum pernah ada**. Bila diinginkan, itu fitur baru.

---

## 6. OFFLINE-FIRST — yang wajib diwarisi & yang wajib diperbaiki

PWA KMB (`mar_v2`, dua store: `kv` + `outbox` ber-keyPath `op_id`).

### Yang sudah benar dan wajib dipertahankan

| Prinsip | Bukti |
|---|---|
| `op_id` lahir saat **enqueue**, tak pernah berubah walau di-retry | `app.js:531`, `2464-2468` |
| Kirim **serial FIFO** urut `created_at` lalu `seq` — menjamin override mendarat sebelum approve | `app.js:841-851` |
| Server mencatat dedup **hanya saat sukses**, supaya "Coba lagi" benar-benar dieksekusi ulang | `ApiService.js:821-826` |
| Entri dibuang **hanya atas bukti positif** — "tidak ketemu di daftar" bukan bukti | `app.js:718-720` |
| Hanya **satu timer** boleh berjalan (dua timer = jam dobel = rupiah salah) | `app.js:173-187` |
| Reset timer wajib mengosongkan **juga** isian manual | `MechanicDashboard.html:1385-1400` |
| Menghapus cache aset **tidak** menyentuh IndexedDB — antrean tidak boleh ikut hilang | `app.js:108-112` |
| Picker 24 jam sendiri, tidak pernah `datetime-local` (locale HP memunculkan AM/PM → meleset 12 jam di jalur uang) | `DateTime24.html:1-105` |

### Yang rusak dan jangan diulang

| # | Cacat | Bukti |
|---|---|---|
| 1 | **Logout menghapus antrean permanen** | `app.js:991-993` |
| 2 | Tidak ada `navigator.storage.persist()` — browser boleh membuang antrean | grep nihil |
| 3 | Entri `done` **tak pernah dihapus**, tumbuh selamanya | `app.js:803, 2497` |
| 4 | Umur entri tak dibatasi, sementara dedup server hanya 15 hari → entri tua di-retry = **dieksekusi ulang** | `ApiService.js:1437` |
| 5 | **SW tidak menyortir antrean** → override bisa mendarat setelah approve | `sw.js:70` vs `app.js:847` |
| 6 | Tulis-balik `put` objek utuh tanpa compare-and-set → SW dan halaman saling menimpa status | `app.js:879` & `sw.js:82` |
| 7 | `API_URL` ditulis di **dua** berkas | `app.js:6`, `sw.js:25` |
| 8 | Cache-first untuk `app.js`/`index.html` → kode lama bisa bertahan tanpa batas (SUM sudah network-first) | `sw.js:225-243` |
| 9 | **Tidak ada `handleTokenRejected`** — token dicabut = aplikasi lumpuh senyap, pengguna tak pernah dikembalikan ke login | `app.js:547-551` |
| 10 | Antrean **tanpa pemilik** — enqueue oleh A bisa terkirim dengan token B | `app.js:858` |
| 11 | Token mekanik **tampil & tersimpan** di HP approver | `app.js:2663-2667` |
| 12 | SW membuka IndexedDB tanpa `onupgradeneeded` → bisa membuat DB kosong tanpa store, aplikasi mati permanen | `sw.js:28` |
| 13 | Boot tanpa `.catch` → layar kosong tanpa pesan | `app.js:3351` |
| 14 | Rekonsiliasi buta terhadap `create_wo` (tanpa `wo_id`) → kartu merah abadi, "buang lalu buat ulang" = WO kembar | `app.js:736` |
| 15 | iOS tanpa Background Sync: antrean **hanya** terkirim saat aplikasi dibuka | `app.js:633-639` |

### Invarian offline KMB Project (dapat diuji)

1. Aksi yang sudah masuk antrean tidak hilang walau aplikasi ditutup paksa atau HP restart.
2. Penyimpanan diminta persisten; kegagalannya **ditampilkan**, bukan didiamkan.
3. **Logout tidak menghapus antrean yang belum terkirim.** Tahan logout, atau kirim dulu.
4. `op_id` lahir sekali, tak pernah berubah, dari konteks mana pun.
5. Umur maksimum entri **lebih pendek** daripada retensi dedup server.
6. Urutan kirim sama persis di halaman dan di service worker.
7. Hanya satu pengosong antrean berjalan pada satu waktu (Web Locks).
8. Setiap entri menyimpan identitas pembuatnya; entri A tak pernah terkirim atas nama B.
9. Token ditolak → kembali ke layar login **dengan antrean utuh**.
10. Berkas inti network-first: perangkat online tak mungkin menjalankan kode lama lebih dari satu muat.
11. Satu sumber kebenaran untuk URL API dan nomor versi.
12. Angka jalur uang yang akan terkirim selalu terbaca di layar **sebelum** konfirmasi.

---

## 7. KATALOG INSIDEN → PERSYARATAN DESAIN

Ringkasan 35 insiden terdokumentasi. Kolom kanan adalah **persyaratan KMB Project**.

| Gejala | Akar | Persyaratan produk baru |
|---|---|---|
| 2 WO lenyap (6-7 Agu) | nomor baris dari cache; approve L2 memindahkan baris, tulisan mendarat di baris tetangga | Tidak ada "nomor baris". `UPDATE … WHERE id=$1`. |
| Cascade KMB musnah (27 Jul) | `clasp push` dari salinan bergalur SUM menimpa seluruh project | Migrasi destruktif terpisah dari kode aplikasi, connection string per lingkungan |
| 3 pasang WO bernomor sama, semua dibayar | ruang nomor 1.000/hari | sequence database |
| WO grup tercipta 2× | halaman & SW mem-flush bersamaan | idempotency key + kunci lintas konteks |
| 17 WO kembar (502) | 502 tidak membedakan arah putus | struk idempoten disimpan sebelum balasan dikirim |
| Rate cadangan 50.000 dipakai diam-diam | `rate_<position>` tak ketemu → fallback senyap | FK + `NOT NULL`, tidak ada fallback |
| Orang ber-section ganda hilang dari semua layar | string koma dibandingkan utuh | relasi many-to-many |
| Dropdown kosong tanpa galat | spasi di ujung `unit_model` | foreign key, bukan cocok teks |
| Jam tersimpan meleset 12 jam | `datetime-local` ikut locale HP | picker 24 jam sendiri, `timestamptz` UTC |
| `work_condition` hilang senyap walau server bilang berhasil | daftar putih field disalin manual, lupa ditambah | satu skema validasi dipakai web **dan** API |
| "Tidak ada WO aktif" padahal ada 36 | `catch → return []` menelan galat jadi layar kosong | kegagalan wajib tampil sebagai kegagalan |
| Rupiah hantu setelah cancel | `points` di-nol-kan, `idr_value` tidak | kolom turunan (generated), bukan dua kolom disinkron manual |
| Badge "SPV override" di setiap WO Others | nilai isian awal menumpang kolom override | kolom terpisah |
| Dua approver bersamaan | check-then-act tanpa kunci | compare-and-swap satu statement |
| Pembersihan gagal tiap malam | hapus baris satu-satu vs batas 6 menit | satu statement `DELETE … WHERE created_at < …` |
| Pustaka vendor mematikan **seluruh** GAS | jsrsasign memakai `window` di top-level | isolasi proses per-request |
| Header WorkOrders vs Archive harus identik manual | dua tabel paralel | satu tabel + kolom status (atau partisi) |

### Isu yang masih terbuka di KMB V2

- Payroll 21 kolom × cluster — rekan menyatakan selesai, **belum diverifikasi independen**
- Rate per jabatan **per section** — belum ada
- Peran **foreman** (buat & submit, tanpa hak approve) — belum dibangun
- Notifikasi WhatsApp — ditunda
- Web GAS belum mobile-responsive
- Fungsi kembar global (`calculateFinalPoints`, `distributePointsToTeam`, `formatNumber`, `truncate`) — sengaja belum dihapus
- Berkas bertanda `(hapus)` masih ada
- Rekonsiliasi workbook simulasi manajemen vs `Config_Jobs` — menunggu keputusan
- **Paket tyreman**: sudah **terbangun penuh** (`_DetailTyre.js`, 50 KB, 8 commit) lalu **ditidurkan** `MODE_SEDERHANA=true` 7 Sep 2026 karena orang site belum siap — bukan karena alasan teknis

---

## 8. FITUR WEB vs PWA

### Hanya ada di Web (inti "web lebih lengkap")

1. **Dashboard Performa** — kartu statistik, leaderboard bulanan, leaderboard **harian per shift** (06-18 / 18-06) dipecah Tyreman vs Field, tren poin 3 periode gaji, ringkas tenaga kerja per jabatan
2. **Monitoring approver** — statistik pipeline, token per mekanik, **impersonate** ("Buka →")
3. **Dashboard Teknis (Tyre)** — kondisi ban per posisi, RTD kritis, problem per jenis/posisi, riwayat remove/instal, repair per SN, life time per merk, riwayat per unit
4. **Dashboard Field** — PA, MTTR, MTBF per unit dari selisih hour-meter, breakdown UB0/UB1/SB0, pareto downtime
5. **Ekspor Payroll Excel** — 2 sheet (Ringkasan + Detail WO 23 kolom)
6. **Koreksi HM / Koreksi KM** — termasuk pencatatan ganti panel
7. Tema terpusat (`Theme.js`) — PWA menyalinnya manual, berisiko tidak sinkron

### Hanya ada di PWA (web tertinggal — perbaiki di produk baru)

- **Override ganti unit**: backend mendukung penuh (`ApprovalService.js:1132-1153`), PWA mengeksposnya (`app.js:2238-2241`), **modal web tidak punya field-nya sama sekali**.

### Definisi angka yang wajib persis

- Periode gaji **16 → 15**, bukan kalender (`DashboardService.js:939-942`)
- **Total WO** = semua WO tanpa batas waktu, termasuk cancelled/rejected
- **Approved & Total Poin** = periode berjalan, dikunci `superintendent_approved_at`
- **Pending** = tidak dibatasi periode (tunggakan lama tetap terlihat)
- **Leaderboard bulanan** urut `total_points` desc, dikunci `awarded_at`
- **Leaderboard harian** dikunci `submitted_at` (bukan `awarded_at`, supaya tidak menampilkan aktivitas approver), poin WO belum approve dihitung ulang dan **ditandai taksiran**
- **Avg Completion** = rata-rata jam aktual per WO approved, bukan rasio terhadap target

---

## 9. YANG HARUS DIPUTUSKAN PEMILIK PRODUK

Tidak satu pun bisa disimpulkan dari kode.

| # | Keputusan | Kenapa perlu sekarang |
|---|---|---|
| 1 | **Unit & joblist baru** — daftar unit, model, dan job tambahan | Menentukan isi katalog; strukturnya sudah siap menampung |
| 2 | **Asal rasio poin.** Di KMB V2, `base_point / plan_hours` hanya pernah bernilai 2,0 · 2,5 · 3,0 pada 1.399 baris — pola sempurna, tapi **tidak tertulis di kolom mana pun**. Apakah ini aturan resmi? | Bila ya, poin dihitung dari jam × tingkat kesulitan, dan mengubah kebijakan = satu baris, bukan 1.209 sel |
| 3 | **Tyreman** ikut sejak awal atau tidak | Paketnya lengkap dan berfungsi, hanya ditidurkan |
| 4 | **Rate per jabatan per section** | Terdaftar sebagai kebutuhan yang belum ada di V2 |
| 5 | **Peran foreman** | Belum pernah dibangun |
| 6 | **Mekanik boleh mengajukan job di luar katalog?** | Alur ini **tidak pernah hidup** di V2 — fitur baru, bukan port |
| 7 | **Format `wo_number`** dipertahankan (`WO-YYYYMMDD-XXX`) atau diganti yang dijamin unik | Nomor lama sudah beredar di laporan |
| 8 | **Multi-tenant** (KMB + SUM + plant lain satu basis data) atau satu basis data per plant | Menentukan `tenant_id` di setiap tabel sejak baris pertama |
| 9 | **Token**: tetap statis per orang, atau di-hash + bisa dirotasi | Berdampak ke layar Monitoring yang sekarang memamerkan token |
| 10 | **MTBF**: tetap pilihan approver, atau dihitung dari riwayat | Sekarang rentang 50% tanpa pembanding apa pun |

---

## 10. RUJUKAN BERKAS

| Subsistem | Berkas kunci |
|---|---|
| Siklus WO & anti-ganda | `WorkOrderService.js`, `ApiService.js`, `_KirimanWeb.js`, `_DeteksiKembar.js`, `Constants.js` |
| Approval & peran | `ApprovalService.js`, `Auth.js`, `_AksesLayar.js`, `TokenAdmin.js` |
| Jalur uang | `ScoringService.js`, `ConfigService.js`, `PayrollService.js`, `AuditKolom.js` |
| Katalog | `JobCatalogService.js`, `WorkOrder.html`, `_PeriksaModelJob.js` |
| Tyreman | `_DetailTyre.js`, `_DashboardTeknis.js` |
| Dashboard | `DashboardService.js`, `_DashboardField.js`, `Main.html` |
| Meter | `_Meter.js`, `_KoreksiHm.js`, `Hm.html`, `Km.html` |
| Offline | `mar-offline/app.js`, `mar-offline/sw.js` |
| Penjaga | `AuditWriteGuard.js`, `PerfCache.js`, `Sheets.js`, `_PenjagaOtomatis.js` |

**Kode mati — jangan diport:** `PointsCalculation.js` (nol pemanggil hidup, rumus usang), `OthersJobService.js`, `MtbfService.js` jalur otomatis, `superintendentOverrideAll()`, kolom `work_condition_factor_used`/`timeliness_factor_used`, `is_lead` (tak pernah bernilai true).
