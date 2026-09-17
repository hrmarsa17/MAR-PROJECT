# SERAH TERIMA — KMB Project

> Untuk siapa pun yang melanjutkan: Codex, Claude, atau Gabriel sendiri.
>
> Sumber kebenaran adalah **repo ini** (`git log`, kode, uji). Dokumen ini hanya
> menambal yang tidak tertulis di kode: keputusan, alasannya, dan jebakan yang
> sudah memakan waktu sekali supaya tidak memakannya dua kali.
>
> Terakhir diperbarui: 15 Sep 2026.

---

## 1. POLA KERJA

Gabriel memakai **Claude Code dan Codex bergantian secara native**, berpindah
saat salah satunya kena batas pemakaian. Perpindahan lewat perkakas di
`C:\Users\gabri\.claude\handoff\`, dijalankan **dari dalam repo yang sedang
dikerjakan**:

```powershell
handoff-claude    # Claude kena limit  -> membuka Codex
handoff-codex     # Codex kena limit   -> membuka Claude
```

Penamaan mengikuti **asal**, bukan tujuan. Berkas hasilnya sengaja ditaruh di
luar repo mana pun agar tidak ikut ter-commit.

Konsekuensi yang penting untuk cara bekerja di sini:

- **Commit lebih sering daripada terasa perlu.** Yang tidak ter-commit tidak
  ikut berpindah tangan.
- **Tulis alasan di kode, bukan di chat.** Komentar "kenapa" adalah satu-satunya
  hal yang selamat melewati pergantian sesi.
- **Jangan tinggalkan pekerjaan setengah jadi tanpa catatan** di dokumen ini.

---

## 2. KEADAAN SEKARANG

| | |
|---|---|
| Lokasi | `C:\Users\gabri\OneDrive\1\Resurgam\MARProject` |
| Git | lokal saja, **belum ada remote** |
| Uji unit & integrasi | 56 lulus (`npm test`) |
| Uji asap HTTP | buat-WO 13 · override 23 · alur override→approve 15 · payroll 23 |
| Galat tipe | 0 |

### Sudah jadi

| Bagian | Keterangan |
|---|---|
| Skema Postgres | 37 tabel, `db/schema.sql`; migrasi di `db/migrasi/` |
| Benih + data contoh | `db/seed.sql`, `db/contoh.sql`, `db/katalog-contoh.sql` |
| Lapisan bisnis | buat WO, approve L1/L2, reject, kembalikan, batal, **override** |
| Idempotensi | `op_id` + `processed_ops` dalam satu transaksi |
| Periode & shift | `src/domain/periode.ts` (16→15), `src/domain/shift.ts` (06–18 / 18–06) |
| **Dashboard Performa** | penuh: 4 kartu, tabel WO, 3 papan, tren SVG, Quick Stats |
| **Create WO** | model pembuatan, blok Joblist #N, penguncian grup, preview, struk |
| **Monitoring** | kartu mekanik + token utuh + pipeline per orang |
| **Approvals** | 5 tab, kartu, aksi, **modal Edit Override** |
| **Reports** | export payroll XLSX 2 sheet dari nilai beku |
| Design system | merah dari `Theme.js`, plus lapisan gerak |

### Belum jadi

| Bagian | Catatan |
|---|---|
| Monitoring — daftar WO mekanik | tab Assigned/Pending/Done, live timer, borongan, kirim kerja |
| Transfer WO | tabel & status ada, perintahnya belum |
| Detail Tyre | skema ada; spek di `03b-DETAIL-TYRE.md` |
| Teknis | penanda; PA/MTBF/MTTR **tetap bulan kalender** |
| Koreksi HM/KM | penanda; spek lengkap di `06-KOREKSI-HM-KM.md` |
| Reset token & impersonate | tombol ada, belum berfungsi |
| PWA offline | belum dimulai |

---

## 3. CARA MENJALANKAN

```bash
cd "C:\Users\gabri\OneDrive\1\Resurgam\MARProject"
npm install
npm run dev          # http://localhost:3000
npm test             # 56 uji
npm run typecheck

npm run orang          # daftar akun + TOKEN untuk masuk
npm run db:contoh      # isi ulang WO contoh (uji menghapusnya)
npm run db:katalog     # isi ulang unit & joblist CONTOH
npm run token:rapikan  # sisakan satu token aktif per orang

npm run uji:wo             # 13 pemeriksaan buat-WO lewat HTTP
npm run uji:override       # 23 pemeriksaan override
npm run uji:alur-override  # 15 pemeriksaan override -> approve
npm run uji:payroll        # 23 pemeriksaan export payroll
```

### Basis data pengembangan

**Bukan** Postgres di port 5432 (itu milik Gabriel, terkunci kata sandi dan
jangan disentuh). Yang dipakai proyek ini instans terpisah di **port 5433**:

```powershell
# nyalakan (lepas dari shell, kalau tidak ia ikut mati saat shell ditutup)
Start-Process 'C:\Program Files\PostgreSQL\18\bin\postgres.exe' `
  -ArgumentList '-D','C:\Users\gabri\AppData\Local\kmbproject-pg','-p','5433' `
  -WindowStyle Hidden
```

Sambungan dibaca dari `.env` (tidak ikut git):
`postgres://postgres@127.0.0.1:5433/mar_project`

Membangun ulang dari nol:

```bash
psql -U postgres -h 127.0.0.1 -p 5433 -d postgres -c "DROP DATABASE IF EXISTS mar_project;" -c "CREATE DATABASE mar_project;"
psql -U postgres -h 127.0.0.1 -p 5433 -d mar_project -v ON_ERROR_STOP=1 -f db/schema.sql -f db/seed.sql
npx vitest run                       # membuat mekanik & katalog uji
psql ... -f db/contoh.sql            # 14 WO contoh
npx tsx scripts/buat-token.ts UJI-L2 # token untuk masuk — HANYA dev (porta 5433)
```

`buat-token.ts` menolak berjalan kecuali `DATABASE_URL` menunjuk porta 5433. Ia
mencabut token orang lalu menerbitkan yang baru dengan `UPDATE`/`INSERT`
langsung — tanpa baris di `audit_logs`. Di produksi, penggantian token dilakukan
lewat **Admin → Orang & Token → Ganti token**, yang tercatat siapa penekannya.

**Token tidak pernah berganti sendiri.** Tidak ada kedaluwarsa, tidak ada rotasi
berkala, dan menekan "Terbitkan token" dua kali mengembalikan token yang SAMA —
`terbitkanToken()` hanya mencabut yang lama bila diminta tegas dengan
`ganti: true`. Dijaga oleh `scripts/uji-token.ts` dan `tests/penjagaSkrip.test.ts`.

### Membaca basis data hidup dari laptop — `--jauh`

Lupa token sendiri, atau ingin memeriksa keadaan produksi:

```bash
copy .env.jauh.example .env.jauh   # SEKALI saja
notepad .env.jauh                  # isi DATABASE_URL dari Vercel

npm run orang   -- --jauh          # daftar orang + token (read-only)
npm run periksa -- --jauh          # periksa keadaan (read-only)
```

Jangan menempelkan alamat berisi sandi ke baris perintah. PowerShell menyimpan
tiap barisnya di `%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`,
berkas teks biasa yang tidak pernah kedaluwarsa. `.env.jauh` tidak ikut git.

`--jauh` **tidak** membuka kunci apa pun: penjaga memeriksa isi `DATABASE_URL`,
bukan dari mana ia datang. `buat-token.ts --jauh` tetap ditolak — ia masih
menuntut `--izinkan-luar` juga.

---

## 4. JEBAKAN YANG SUDAH MEMAKAN WAKTU

Empat ini semuanya sudah terjadi. Jangan ulangi.

**1. Jangan `next build` saat `next dev` hidup.** Keduanya memakai `.next` yang
sama; build produksi menimpa potongan kode yang sedang dipegang server dev, dan
halaman mulai gagal dengan `Cannot find module './611.js'`. Terlihat seperti bug
kode, padahal bukan. Obatnya: matikan dev, `rm -rf .next`, nyalakan lagi.

**2. Menghentikan tugas latar tidak selalu mematikan servernya.** Prosesnya bisa
selamat dan tetap memegang port. Periksa dengan `Get-NetTCPConnection -LocalPort
<port>` lalu `Stop-Process -Id <pid> -Force`.

**3. `bigint` Postgres tiba sebagai string.** Ini melahirkan kebohongan tipe yang
TypeScript tidak bisa lihat: sebuah fungsi boleh menyatakan mengembalikan
`{ id: number }` sementara isinya `"5"`. Sudah ditutup di `src/lib/db.ts` —
int8 diurai jadi number dan melempar nyaring bila melampaui batas aman.
**Kalau menambah tipe kustom lain, jangan tulis ulang tipe `Tx` secara manual**;
ia menyimpulkan sendiri dari instansnya.

**4. Data Postgres jangan di OneDrive.** Sinkronisasi latar menyentuh berkas yang
sedang ditulis mesin basis data. Karena itu ia di `AppData\Local`.

---

## 5. KEPUTUSAN YANG SUDAH DIAMBIL (jangan diputar balik tanpa alasan baru)

| Keputusan | Alasan |
|---|---|
| **UI 1:1 dengan KMB V2** | Orang lapangan sudah hafal. Gabriel eksplisit: *"saya tidak mau training dari 0 lagi."* Urutan menu dan posisi tombol TIDAK boleh digeser walau terasa bisa lebih logis |
| **Warna dasar merah** | Permintaan Gabriel. Hue saja yang berubah; radius, bayangan, jarak, tipografi dipertahankan angka demi angka dari `Theme.js` |
| **Approve merah utama, Reject maroon** | Begitu utama jadi merah, Approve dan Reject bertabrakan. Reject dibuat lebih gelap supaya terbaca lebih berat. **Belum dikonfirmasi Gabriel di layar** |
| **Amber = "terpilih"** | Di KMB V2 amber punya peran sendiri (tab aktif, kartu pilihan, Kembalikan), bukan sisa tema lama |
| **Token disimpan TERBACA** | Diputuskan Gabriel 15 Sep 2026, membatalkan hash yang sempat dipasang. Layar Monitoring ADA untuk membacakan token kembali kepada mekanik yang lupa; hash mematikan fungsi itu. Yang menjaganya gerbang peran + scope, bukan hash. **Jangan di-hash lagi tanpa keputusan baru** |
| **base_points bisa disunting terus** | Gabriel: akan disesuaikan seiring sistem berjalan. Karena itu snapshot wajib — menyesuaikan katalog besok tidak boleh menggeser rupiah yang sudah dibayar |
| **Joblist & unit disetorkan belakangan** | Katalog dibangun generik. Jangan menunggu datanya |
| **Detail tyre disiapkan sejak awal** | Permintaan Gabriel. Strukturnya sudah ada di skema, bisa dinyalakan lewat data |
| **Satu alamat untuk semua penulisan** | `POST /api/perintah` dengan `{aksi, data, op_id}` — bentuk yang sama dengan antrean offline PWA nanti |
| **Semua penulisan lewat `jalankanPerintah`** | Tidak ada jalur tulis lain, termasuk untuk aksi yang terasa ringan |

---

## 6. INVARIAN YANG TIDAK BOLEH RUSAK

Kalau sebuah perubahan melanggar salah satu ini, perubahannya yang salah.

1. Status berubah dan poin terbit **dalam satu transaksi**, atau tidak sama sekali.
2. Satu `(wo_id, mechanic_id)` hanya boleh punya **satu** baris poin.
3. `op_id` yang sama, dikirim berapa kali pun, **satu** eksekusi.
4. Nomor WO dari sequence basis data — **tidak pernah** dari timestamp.
5. Tarif dibekukan per baris poin. Mengubah tarif **tidak** menggeser rupiah yang sudah terbit.
6. Mengubah katalog **tidak** mengubah riwayat yang sudah disetujui.
7. Membatalkan WO menol-kan poin **dan** rupiah sekaligus (`idr_value` kolom turunan).
8. Mekanik tidak bisa ada tanpa tarif (FK `NOT NULL`, tanpa nilai cadangan).
9. Transisi status ilegal ditolak trigger, bukan diperiksa kode.
10. Kegagalan **tidak** diringkas jadi daftar kosong. Layar kosong yang tampak normal lebih berbahaya daripada pesan galat.

Semuanya punya uji di `tests/integrasi/invarian.test.ts`. **Jalankan `npm test`
sebelum dan sesudah menyentuh jalur uang.**

---

## 7. LANGKAH BERIKUTNYA, BERURUT

> **BACA `docs/SPEK-LAYAR/00-INDEKS.md` LEBIH DULU.** Folder itu berisi kontrak
> porting per layar: markup, kelas CSS, teks persis, definisi angka, dan
> terjemahan kolomnya — semuanya berjejak `file:baris` ke sumber KMB V2.
> **Jangan membangun layar dari screenshot.** Saya melakukannya sekali dan
> hasilnya salah bentuk (pemilih tim jadi deretan tombol, padahal di sumber ia
> dropdown berbaris); Gabriel yang menemukannya, bukan saya.

### 7a. Selesaikan dulu speknya (4 layar tersisa)

Peta sumber lengkap — berkas, rentang baris, dan apa isinya — sudah ada di
`docs/SPEK-LAYAR/00-INDEKS.md` §4. Tinggal dibaca dan ditulis, tanpa menebak:

1. `04-APPROVALS.md` ← `Approval.html` + `ApprovalService.js` — **paling kritis**
2. `07-REPORTS.md` ← `Reports.html` + `PayrollService.js` — jalur uang
3. `03b-DETAIL-TYRE.md` ← `MechanicDashboard.html:597-670,1086-1300` + `_DetailTyre.js`
4. `05-TEKNIS.md` dan `06-KOREKSI-HM-KM.md`

Bentuk berkasnya dan aturan menulisnya ada di `00-INDEKS.md` §3. Aturan pokok:
**kalau komentar sumber menjelaskan _kenapa_ sesuatu berbentuk begitu, kutip
alasannya** — komentar itu catatan kecelakaan, dan membuang alasannya mengundang
kecelakaan yang sama.

### 7b. Lalu bangun, berurut

1. **Create WO 1:1** — daftar periksanya di `docs/SPEK-LAYAR/02-CREATE-WO.md` §6.
   Yang belum: `.grup-bar` 3 kartu Model pembuatan, penguncian acuan grup, blok
   Joblist #N tambah-kurang, panel Preview (L2 saja), medan HM/KM + catatan kaki,
   checkbox Others, Location 2 kartu, struk hasil + nomor kiriman.
   *(Team Composition sudah benar — dropdown berbaris.)*
2. **Modal Edit Override** — isi lengkapnya di `00-INDEKS.md` §4 bagian Approvals.
   Perintah `save_override` belum ada. **Ingat: `partial_hours` transfer tidak
   boleh tertimpa picker** (sudah dijaga `src/domain/nilaiEfektif.ts`).
3. ~~`src/domain/periode.ts`~~ — **SELESAI** (`a964003`). 28 uji, termasuk batas
   tanggal 15/16 dan sambungan antar periode yang harus tepat 1 milidetik.
   Ada juga `src/domain/shift.ts` — jam shift 06–18 / 18–06, **satu tempat**,
   dipakai bersama papan harian dan (nanti) Dashboard Teknis.
4. ~~**Performa**~~ — **SELESAI** (`7b7bd91`). `src/app/performa/` +
   `src/domain/kueriPerforma.ts`. Grafik digambar SVG di server, bukan Chart.js
   dari CDN — alasannya di `TrenSvg.tsx`.
   **Satu hal menunggu jawaban Gabriel**, tercatat di `kueriPerforma.ts` pada
   medan `totalPoin`: kartu "Total Poin" menjumlah poin per WO sementara papan
   di bawahnya menjumlah poin per orang, dan karena model poin penuh keduanya
   memang berbeda. Ditiru 1:1 dari KMB V2 — jangan diubah tanpa keputusannya.
5. ~~**Reports**~~ — **SELESAI**. `src/app/reports/` +
   `src/domain/kueriPayroll.ts` + `src/domain/excelPayroll.ts` +
   `GET /api/laporan`. Dua worksheet bergaya penuh lewat exceljs.
   Dibuktikan `npm run uji:payroll` (23 pemeriksaan) — yang terpenting:
   **menaikkan seluruh tarif dua kali lipat TIDAK menggeser total laporan
   satu rupiah pun.** Itu luka KMB V2 yang paling mahal.
6. **Monitoring** lengkap — spek di `03-MONITORING.md`. Transfer WO, live timer,
   pengelompokan borongan.
7. Koreksi HM/KM, Teknis.
8. **PWA offline** — invariannya di `docs/PETA-KMB-V2.md` §6.

---

## 8. YANG MENUNGGU JAWABAN GABRIEL

1. Apakah **Approve vs Reject** masih terbedakan di layar setelah keduanya merah?
2. Apakah **token yang tidak lagi bisa dilihat** mengganggu alur kerja? (Kalau ya: ganti jadi "terbitkan ulang lalu tampilkan sekali")
3. Apakah rasio `base_points ÷ plan_hours` (selalu 2,0 / 2,5 / 3,0 di seluruh 1.399 baris KMB V2) memang aturan resmi?
4. Peran **foreman** — belum pernah ada di KMB V2.
5. **Multi-tenant**: satu basis data untuk beberapa plant, atau terpisah? (`tenant_id` sudah ada di semua tabel)
6. Web KMB V2 belum mobile-responsive — ditiru apa adanya, atau diperbaiki?

---

## 8b. GILIRAN CODEX: REVIEW, BUKAN BANGUN

Kalau Anda Codex dan Gabriel menyerahkan giliran untuk **memeriksa**, bukan
melanjutkan: baca `docs/REVIEW-CODEX.md`. Di situ ada cakupan review, tempat
yang paling mungkin bercacat, dan lima pola kesalahan yang sudah ketahuan —
yang mungkin masih ada di tempat yang belum diperiksa.

---

## 9. BACAAN WAJIB SEBELUM MENYENTUH JALUR UANG

- `docs/SPEK-LAYAR/00-INDEKS.md` — kontrak porting per layar; **baca ini sebelum menyentuh layar mana pun**
- `docs/PETA-KMB-V2.md` — peta 8 subsistem KMB V2 + 35 insiden, berjejak `file:baris`
- `docs/ARSITEKTUR.md` — bentuk target dan alasan tiap pilihan
- `src/domain/scoring.ts` — rumus poin & rupiah, fungsi murni
- `src/domain/runCommand.ts` — satu pintu penulisan

Kode sumber KMB V2 ada di `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`
(cabang `feature/token-auth-web`) — **baca saja, jangan disentuh.** Itu sistem
yang sedang membayar orang setiap bulan.
