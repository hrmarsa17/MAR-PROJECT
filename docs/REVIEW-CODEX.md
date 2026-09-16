# Penugasan Review — untuk Codex

> **Peran Anda di sini: pengawas, bukan pembangun.**
>
> Tugas Anda **memeriksa dan memperbaiki** apa yang sudah dikerjakan — bukan
> menambah layar baru, bukan memulai bagian yang belum dimulai. Kalau menemukan
> sesuatu yang belum dikerjakan, **catat saja**; jangan membangunnya.
>
> Yang dicari: **cacat terhadap tujuan awal**, terutama di jalur uang.
>
> Ditulis 15 Sep 2026. 27 commit sejak `847d9e2`, ±10.500 baris kode & SQL.

---

## 1. Tujuan awal, sebagai alat ukur

Ini yang diminta Gabriel di awal, dan inilah tolok ukur setiap temuan Anda:

1. **KMB Project = KMB V2 tanpa GAS.** Proses bisnis dan cascade joblist sama;
   unit & joblist berbeda dan akan disetorkan Gabriel **setelah sistem jadi**.
2. **UI/UX 1:1**, warna dasar merah. Kutipan persisnya:
   *"semuanya harus 1:1 karena orang lapangan sudah familiar dengan ui ux ini,
   saya tidak mau training dari 0 lagi."*
3. **Tidak ada WO hilang, tidak ada yang kurang bayar.** Ini kalimat kunci.
4. Offline-first (PWA) + versi web yang lebih lengkap.
5. `base_points` akan terus disesuaikan → **snapshot wajib**.

Sumber acuan: `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`, cabang
`feature/token-auth-web`. **BACA SAJA.** Itu sistem yang sedang membayar orang.

---

## 2. Cara menjalankan

```bash
cd "C:\Users\gabri\OneDrive\1\Resurgam\KMBProject"

# Basis data dev di port 5433 — BUKAN 5432 (itu milik Gabriel, jangan disentuh)
Start-Process 'C:\Program Files\PostgreSQL\18\bin\postgres.exe' `
  -ArgumentList '-D','C:\Users\gabri\AppData\Local\kmbproject-pg','-p','5433' -WindowStyle Hidden

npm run dev            # http://localhost:3000
npm run orang          # daftar akun + TOKEN untuk masuk
npm test               # 56 uji unit & integrasi

npm run uji:wo             # 13 · buat WO lewat HTTP
npm run uji:override       # 23 · override
npm run uji:alur-override  # 15 · override -> approve
npm run uji:payroll        # 23 · export payroll

npm run db:contoh      # isi ulang WO contoh (npm test MENGHAPUSNYA)
npm run db:katalog     # isi ulang unit & joblist CONTOH
npm run token:rapikan  # sisakan satu token aktif per orang
```

⚠️ `npm test` memakai basis data yang sama dan mengosongkan tabel transaksi.
Sesudahnya layar tampak kosong — itu bukan bug. Jalankan `db:contoh`.

⚠️ Jangan `next build` saat `next dev` hidup. Keduanya memakai `.next` yang
sama, dan halaman mulai gagal `Cannot find module './611.js'` — terlihat persis
seperti bug kode.

---

## 3. Yang sudah dikerjakan — ini cakupan review Anda

### 3a. Fondasi

| Berkas | Isi |
|---|---|
| `db/schema.sql` | 37 tabel. Nomor WO dari sequence, `processed_ops`, trigger transisi status, `idr_value` GENERATED |
| `db/migrasi/001` | token ter-hash → terbaca |
| `db/migrasi/002` | label work_condition → Shift 1 / Shift 2 / Kondisi Ekstrim |
| `src/domain/scoring.ts` | rumus poin murni, 16 uji |
| `src/domain/runCommand.ts` | **satu pintu** semua penulisan: advisory lock → tanda terima → jalankan → tulis tanda terima, satu transaksi |
| `src/domain/periode.ts` | periode gaji 16→15, **28 uji** termasuk sambungan 1 milidetik |
| `src/domain/shift.ts` | shift 06–18 / 18–06, satu tempat |
| `src/lib/db.ts` | bigint→number dengan penjaga, **tanpa alamat bawaan** |

### 3b. Layar

| Layar | Keadaan | Berkas utama |
|---|---|---|
| Masuk | ✅ | `src/app/masuk/` |
| **Performa** | ✅ penuh | `src/app/performa/`, `src/domain/kueriPerforma.ts` |
| **Create WO** | ✅ penuh | `src/app/wo/baru/`, `src/domain/workOrder.ts` |
| **Monitoring** | 🟡 selector saja | `src/app/monitoring/`, `src/domain/kueriMonitoring.ts` |
| **Approvals** | ✅ termasuk Edit Override | `src/app/approval/`, `src/domain/override.ts` |
| **Reports** | ✅ | `src/app/reports/`, `kueriPayroll.ts`, `excelPayroll.ts` |
| Teknis, Koreksi HM/KM | ⬜ penanda | — |

### 3c. Spesifikasi porting

`docs/SPEK-LAYAR/` — delapan berkas, kontrak per layar berjejak `file:baris` ke
sumber. **Empat di antaranya Anda yang tulis** (03b, 04, 05, 07). Pakai itu
sebagai daftar periksa: mana yang sudah benar-benar terbangun, mana yang
diklaim tapi tidak.

---

## 4. Di mana kemungkinan besar ada cacat

Ini bukan daftar bug yang sudah diketahui — ini tempat yang **belum pernah
diperiksa orang kedua**. Urut dari yang paling mahal bila salah.

### 4.1 Jalur uang

- **`src/domain/approval.ts` — `approveL2`.** Titik tempat poin & rupiah
  terbit. Belum pernah direview siapa pun. Periksa: snapshot ditulis di
  transaksi yang sama? `idr_per_point` benar-benar dari tarif orang itu?
  Anggota tim yang tarifnya hilang berhenti nyaring atau dibayar diam-diam?
- **`src/domain/override.ts` — `nilaiPembanding`.** Aturan "apa yang dianggap
  berubah" sudah SEKALI salah dan ditemukan ujinya sendiri. Bentuk sekarang
  menukar satu kasus langka (L1 menyatakan ulang angka L2) demi kasus harian.
  **Tolong nilai ulang pertukaran itu** — saya yang memutuskannya sendirian.
- **`src/domain/kueriPayroll.ts`.** Batas periode dihitung Postgres lewat
  `make_date(...) AT TIME ZONE tz`. Periksa batas atasnya: apakah WO yang
  disahkan tepat pukul 23:59:59.9 tanggal 15 masuk? Apakah yang pukul 00:00:00
  tanggal 16 TIDAK masuk?
- **`scoring_snapshots` vs detail payroll.** Kolom `Actual Hours` di sheet
  Detail memakai `ss.actual_hours`. Apakah itu selalu jam yang benar-benar
  dinilai, termasuk sesudah override waktu dan transfer?

### 4.2 Tidak ada WO hilang

- **`kueriApproval.ts` — penyaring tab.** WO berstatus `pending_transfer`
  muncul di tab Transfer. Adakah status yang TIDAK muncul di tab mana pun?
  Buat daftar lengkap `wo_status` lalu petakan ke lima tab; yang tak terpetakan
  adalah WO yang hilang dari pandangan semua orang.
- **Scope section.** `sectionYangBoleh()` mengembalikan `null` = boleh semua.
  Periksa setiap pemanggilnya: adakah yang memperlakukan `null` sebagai
  "tidak boleh apa-apa"?
- **`wo_kembar_dicurigai`.** View-nya ada di skema. Apakah ada layar yang
  benar-benar menampilkannya? Kalau tidak, WO kembar tak terdeteksi siapa pun.

### 4.3 Klaim 1:1

Ini yang paling mungkin saya langgar tanpa sadar, karena setiap penyimpangan
terasa masuk akal saat dibuat. **Periksa terhadap sumber, bukan terhadap
penjelasan saya.**

Penyimpangan yang saya SADARI dan tulis alasannya — nilai apakah alasannya
cukup:

| Penyimpangan | Alasan yang saya tulis |
|---|---|
| Grafik tren SVG, bukan Chart.js | PWA harus terbuka tanpa sinyal |
| Label "Approved (semua waktu)" → "Approved" + periode | Label sumber berbohong; angkanya periode berjalan |
| Bawaan rentang Reports = periode gaji, bukan bulan kalender | Bawaan kalender menghasilkan berkas yang bukan periode gaji tanpa tanda |
| Jabatan `grade` di kedua sheet payroll | Sumber tidak konsisten; `position` kunci tarif, tak boleh tampil |
| Penjaga status di `saveOverride` | Sumber tidak punya; WO approved bisa diubah diam-diam |
| Gembok di kotak read-only | Kotak abu-abu tanpa tanda terbaca sebagai rusak |

Yang perlu Anda cari: penyimpangan yang **tidak** saya sadari. Terutama di
Performa dan Create WO, yang saya bangun paling awal.

### 4.4 Hal yang saya sendiri catat sebagai belum tuntas

- `Monitoring` baru separuh: daftar WO mekanik, tab Assigned/Pending/Done,
  live timer, pengelompokan borongan, kirim kerja — semua belum ada.
  **Jangan bangun.** Cukup pastikan yang setengah jadi tidak menyesatkan.
- Tombol "Buka →" (impersonate) dan "Reset token" belum berfungsi.
- Transfer WO: tabel & status ada, perintahnya belum.
- `meter_readings` ada di skema tapi belum jelas siapa yang mengisinya —
  lihat catatan di `docs/SPEK-LAYAR/06-KOREKSI-HM-KM.md` §7c.

---

## 5. Kesalahan saya yang sudah ketahuan — pola, bukan daftar

Disebutkan bukan untuk kelengkapan, tapi karena **polanya mungkin masih ada di
tempat yang belum diperiksa**:

1. **Membangun dari screenshot, bukan dari sumber.** Pemilih tim jadi deretan
   tombol padahal sumbernya dropdown. Gabriel yang menemukannya.
2. **Memutuskan sendiri hal yang bukan keputusan porting.** Token saya buat
   ter-hash, dan itu mematikan fungsi utama layar Monitoring. Dibatalkan
   Gabriel.
3. **Menyimpulkan dari pencarian yang terlalu sempit.** Saya menulis di kode
   bahwa KMB V2 tak menutup modal saat tirai diklik — saya hanya mencari
   atribut `onclick` sebaris, sementara sumbernya memakai `addEventListener`.
4. **Menerjemahkan label secara harfiah.** `work_condition` saya beri label
   "Medan/cuaca menyulitkan"; sebenarnya itu **Shift 2**, dan ×1,2 adalah premi
   shift malam. Label saya mengundang orang menaikkan bayaran 20% dengan alasan
   yang salah.
5. **Pembersihan yang gagal diam-diam.** Uji override menghapus token lewat
   `id = ANY($1::bigint[])` yang tak pernah cocok; token uji menumpuk dan
   menutupi token Gabriel.

**Kalau Anda menemukan pola yang sama di tempat lain, itu temuan yang paling
berharga dari review ini.**

---

## 6. Cara melaporkan

Untuk tiap temuan, sebutkan:

1. **Berkas dan baris** di KMB Project
2. **Baris sumber** di MAR-project yang membuktikannya (kalau soal 1:1)
3. **Akibatnya bagi orang**, bukan bagi kode — "mekanik X tidak dibayar untuk
   WO Y" lebih berguna daripada "kondisi balapan di baris 88"
4. **Apakah Anda sudah memperbaikinya** atau hanya mencatatnya

Kalau memperbaiki jalur uang, **tambahkan ujinya** di `scripts/uji-*.ts` yang
sudah ada. Pola yang dipakai di sana: satu pemeriksaan satu baris, namanya
menyebut perilaku yang dijaga, bukan nama fungsinya.

Commit lebih sering daripada terasa perlu — yang tidak ter-commit tidak ikut
berpindah tangan saat giliran bertukar lagi.

---

## 7. Yang TIDAK perlu Anda periksa

- Bagian yang belum dimulai: Teknis, Koreksi HM/KM, Detail Tyre, PWA.
  Speknya sudah ada; membangunnya bukan tugas review ini.
- Gaya penulisan komentar. Kalau isinya benar, biarkan.
- `db/katalog-contoh.sql` — itu data mainan berlabel CONTOH, bukan data KMB.

Satu hal yang boleh Anda usulkan tapi jangan lakukan sendiri: mengganti
keputusan yang sudah Gabriel ambil (token terbaca, Total Poin 1:1, label
shift). Kalau menurut Anda keliru, tulis alasannya dan biarkan ia yang
memutuskan.
