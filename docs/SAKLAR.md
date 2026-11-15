# Saklar migrasi per rumah

Setiap rumah (`kmbbupr`, `kmbprojek`, `kmbtra`, `sum`) punya satu saklar. Posisi bawaannya **`gas`**.

> **Rancangan 14 Nov 2026 (keputusan Gabriel)** menggantikan rancangan `dua_cabang` 29 Okt, yang menyelesaikan WO lama di GAS sambil melahirkan WO baru di Supabase. Alasannya ada di `docs/KEPUTUSAN.md` (14 Nov). Singkatnya, jalur Supabase menjalankan kode GAS asli di atas data yang sama, jadi WO yang sedang berjalan bisa langsung dilanjutkan tanpa GAS. Sebaliknya, dua penulis pada sheet yang sama merusak cermin per baris.

## Dua tonggak

1. **Tonggak 1, mulai mirroring** (berjalan sejak 13 Nov):
   - GAS satu-satunya penulis.
   - Spreadsheet disalin ke Supabase Gedung 1 tiap jam.
   - Selisih diperiksa penuh tiap malam (`.github/workflows/cermin.yml`; hasilnya di `<skema>.cermin_meta` dan `<skema>.cermin_log`).
2. **Tonggak 2, mulai migrasi** (tombol per rumah di panel):
   - GAS rumah itu ditutup penuh, dan Supabase menjadi satu-satunya penulis.
   - Semua WO, termasuk yang masih pending mekanik/L1/L2, dilanjutkan di abadiops dari status terakhirnya, dengan aturan dan rumus yang sama.

## Posisi saklar

| Posisi | Penulis | GAS web dan API | PWA dan web abadiops | Arah cermin |
|---|---|---|---|---|
| `gas` (bawaan) | GAS | normal | diteruskan ke GAS | spreadsheet → Supabase |
| `menutup` (beberapa menit) | tidak ada | ditutup | menunggu; HP mengantre kiriman | sinkron terakhir, lalu periksa selisih |
| `supabase` | Supabase | ditutup, mengarahkan ke abadiops | kode GAS asli di Worker | Supabase → spreadsheet (cermin balik) |
| `membuka` (beberapa menit) | tidak ada | ditutup | menunggu; HP mengantre kiriman | cermin balik terakhir, lalu periksa selisih |

- `menutup` dan `membuka` adalah posisi peralihan yang dipasang tombol, bukan pilihan manual.
- GAS atau Worker yang gagal membaca saklar **tidak menulis apa pun**, dan meminta pengguna mencoba lagi sebentar lagi. Menolak sebentar lebih aman daripada dua penulis.
- "GAS ditutup" berarti semua aksi ditolak dengan pesan dan link ke abadiops (login dengan token). Ini termasuk buat WO, approve, override, unduh payroll, dan laporan. Setelah jam mulai, data GAS sudah tidak lengkap, jadi laporan dari GAS akan salah.

## Mulai migrasi (`gas` → `supabase`)

Tombol mulai hanya aktif kalau **kesehatan cermin** rumah itu hijau:
- tidak ada selisih selama 7 hari berturut-turut (`hari_tanpa_selisih` ≥ 7);
- sinkron terakhir berhasil, kurang dari 2 jam lalu;
- semua syarat di bawah sudah tercentang.

Yang dikerjakan tombol secara otomatis (`workers/pintu/src/migrasi.js`, dijalankan Durable Object saklar). Pekerjaan yang butuh akun layanan Google dikerjakan pelaksana GitHub (`.github/workflows/peralihan.yml`) lewat antrean `public.cermin_permintaan`; pintu tidak memegang kunci Google maupun token GitHub. Jadwal workflow itu tiap 5 menit, tetapi GitHub nyatanya menjalankannya ±1 jam sekali, jadi **tepat sebelum menekan tombol: GitHub → Actions → Peralihan → Run workflow** (menit tunggu bawaan 30). Putaran yang sudah mengerjakan satu permintaan tetap menunggu 20 menit lagi untuk langkah berikutnya; panel menampilkan tautan *Run workflow* bila permintaan belum diambil 3 menit.
1. Saklar → `menutup`. Worker menahan kiriman HP (protokol PWA), dan GAS menutup dirinya sendiri (tambalan tutup GAS membaca saklar, disimpan 30 detik).
2. **GAS terbukti tertutup:** pintu mem-ping web app GAS sampai dijawab "sudah pindah ke abadiops" (maksimal ±4 menit). Kalau tidak, berhenti: tambalan belum ter-deploy.
3. **Sinkron maju dikunci, lalu sinkron terakhir + periksa selisih penuh** (`cermin_kunci_maju`, lalu `sinkron.mjs --periksa --akhir`). Kunci menunggu putaran sinkron tiap jam yang sedang menulis rumah ini selesai; sesudahnya hanya sinkron terakhir pelaksana yang boleh menulis cermin rumah ini (`db/bersama/cermin_maju.sql`). Tanpa kunci itu, potret spreadsheet yang dibaca sebelum GAS ditutup bisa tertulis sesudah sinkron terakhir. Harus dijalankan sesudah GAS ditutup, semua sheet sama, tanpa sheet yang dilewati.
4. **Cadangan jam mulai** (`cermin_cadangkan`).
5. **Izin tulis dibuka** (`cermin_atur_izin_tulis`). Basis data hanya menerimanya sesudah sinkron maju dikunci, dan menunggu bila masih ada transaksi sinkron yang menulis. Saklar masih `menutup`, jadi belum ada yang menulis.
6. **Cermin balik awal** (`balik.mjs --penuh --tulis --periksa --uji-editor`): penanda per sheet, uji hak Editor akun layanan, dan periksa spreadsheet = cermin.
7. Saklar → `supabase`; jam mulai dicatat dalam waktu setempat rumah itu (SUM WITA, lainnya WIB). Pemicu terjadwal dijalankan Worker, cermin balik berkala berjalan di setiap putaran pelaksana (praktiknya ±1 jam sekali; tiap 5 menit selama putaran yang diperpanjang), dan antrean HP terkirim ke Supabase.

Gagal di langkah mana pun → saklar kembali ke `gas`, izin tulis yang sudah dibuka ditutup lagi, kunci sinkron maju dilepas, dan permintaan yang belum diambil pelaksana dibatalkan. Tidak ada yang hilang, karena belum ada yang ditulis di Supabase. Batas waktu seluruh prosedur 90 menit; lamanya biasanya ±15–40 menit, bergantung jadwal GitHub dan besar rumah.

**Urutan rumah: bertahap** (keputusan Gabriel 14 Nov, menggantikan go-live serentak 29 Okt): BUPR → KMB Projek → KMB V2 → SUM. Setiap rumah punya jam mulai sendiri, jadi kalau ada masalah dampaknya hanya ke satu rumah.

## Jaring pengaman: kembali ke GAS (`supabase` → `gas`)

Tujuannya: GAS dan PWA kembali beroperasi persis seperti sebelum migrasi, lengkap dengan semua yang sudah dikerjakan di abadiops.
- **Cermin balik.** Setelah jam mulai, cermin balik menyalin perubahan Supabase ke spreadsheet di setiap putaran pelaksana (praktiknya ±1 jam sekali, mengikuti jadwal GitHub; tombol Kembali selalu menjalankan cermin balik terakhir + periksa, jadi tidak ada yang tertinggal). Bentuk datanya sama (baris dan kolom sheet) dan hanya ada satu penulis, jadi spreadsheet selalu hampir sama dengan Supabase.
  - Cermin balik **tidak menulis nilai ke sel berumus**. Sel itu ditulis dengan rumusnya (`<skema>.cermin_rumus`), jadi spreadsheet menghitung sendiri. Rumus hanya ada di sheet config (`Config_Jobs_Field` keluarga KMB, `base_point = plan_hours × 2`); pusat admin menghitung ulang rumus yang sama (keputusan 15 Nov).
  - Akun layanan cermin saat ini hanya Viewer di spreadsheet. Cermin balik butuh hak **Editor**, yang hanya dipakai setelah jam mulai; hak itu diuji otomatis di langkah 6 Mulai.
  - Alatnya `tools/cermin/balik.mjs`: hanya baris yang berubah sejak putaran terakhir (penanda `<skema>.cermin_balik`), dan dibaca ulang dengan pembaca yang sama dengan sinkron maju.
- **Tombol "Kembali ke GAS".** Cukup satu konfirmasi, tanpa daftar syarat. Tepat sebelum menekannya: GitHub → Actions → Peralihan → *Run workflow* (sama dengan Mulai). Urutannya:
  1. saklar → `membuka` (tidak ada penulis; HP menahan kiriman);
  2. cermin balik terakhir + periksa seluruh spreadsheet (pelaksana GitHub; bila ada selisih, diulang dengan `--penuh`);
  3. izin tulis ditutup, kunci sinkron maju dilepas (cermin kembali mengikuti spreadsheet), saklar → `gas`. Menutup izin
     saja tidak melepas kunci: selama belum dipastikan spreadsheet sama dengan cermin, sinkron maju tidak boleh menimpa
     cermin. Bila prosedur macet di tengah, lepas manual: `SELECT public.cermin_kunci_maju('<skema>', false, '<alasan>', '<nama>')`.

  Gagal → saklar kembali ke `supabase` (Supabase tetap penulis, izin tetap terbuka, sinkron maju tetap dikunci; GAS tidak dibuka dengan data yang belum sama).

  Setelah itu GAS terbuka lagi, pemicunya hidup lagi, PWA kembali diteruskan ke GAS, dan cermin kembali ke arah spreadsheet → Supabase.
- **Lapisan cadangan lain:** cadangan harian Supabase Pro (7 hari), cadangan database sesaat sebelum mulai, dan riwayat versi Google Sheets.
- **Spreadsheet hanya ditulis setelah jam mulai**, dan hanya oleh cermin balik atau tombol kembali (izin Gabriel 14 Nov). Sebelum itu spreadsheet tetap tidak ditulis.
- **Dilatih lebih dulu.** Tombol mulai dan tombol kembali dilatih di salinan spreadsheet sebelum jam mulai rumah mana pun.
- **Kapan dipakai:**
  - Supabase mati sebentar: jangan kembali dulu. Antrean di HP menampung kiriman dan mengirim ulang otomatis.
  - Supabase mati lama atau ada bug di jalur Supabase: kembali ke GAS, perbaiki, lalu mulai lagi dari tombol mulai.

## Ruang uji (keputusan Gabriel 14 Nov)

- Pengujian dilakukan di Gedung 1 (produksi, paket Pro), di skema salinan `uji_<skema>` yang disegarkan dari cermin dengan SQL. Ukuran, mesin, dan isinya sama dengan produksi.
- Skema cermin asli **tidak pernah ditulis sebelum jam mulai** rumah itu. Itu dijaga di database: penulisan ke skema asli ditolak kecuali saklar rumah itu `supabase`.
- Worker `abadiops-*-staging` menjadi Worker uji yang membaca dan menulis skema `uji_*`.
- Gedung 2 (proyek "Stagging") tidak dipakai lagi.

## Syarat sebelum tombol mulai aktif

- [ ] Kesehatan cermin hijau (lihat di atas).
- [ ] Semua aksi baca, aksi tulis, dan halaman web rumah itu lulus uji kembar di ruang uji: hasil Worker sama dengan GAS, kolom per kolom.
- [ ] Fitur yang memakai layanan Google sudah punya pengganti dan lulus uji: unduh payroll (`DriveApp`), pemicu terjadwal, email (`MailApp`), dan panggilan keluar (`UrlFetchApp`).
- [ ] Payroll dari Supabase sama dengan payroll GAS untuk bulan-bulan sebelumnya.
- [ ] `AuditLogs` dan `ProcessedOps` ikut tercermin.
- [ ] Tambalan "tutup GAS" terpasang di GAS rumah itu. Tambalan ini tidur selama saklar `gas`.
- [ ] Worker produksi sudah memakai kode GAS asli dan di-deploy ulang setelah upgrade Workers Paid. Worker yang di-deploy saat paket gratis tetap memakai batas CPU lama sampai di-deploy ulang (BUG-DICATAT #40).
- [ ] Latihan mulai dan kembali sudah dilakukan di salinan spreadsheet, tanpa data hilang dan tanpa kiriman ganda.
- [ ] Gabriel sudah menguji sendiri satu siklus WO penuh di ruang uji.
- [ ] Gabriel menyetujui.

## Panel saklar di `abadiops.com` (keputusan Gabriel, 29 Okt 2026)

Saklar dioperasikan dari **satu panel visual di domain pintu**. Daftar kamar dan profilnya ada di `config/rumah.json`, dan kamar yang aktif per lingkungan diatur `RUMAH` di `workers/pintu/wrangler.toml`. Panel membangun tab, pilihan, section, dan peran dari daftar itu. Kode lama: `kmbtra` dulu `kmb`, `kmbprojek` dulu `kmb-projek`.

**Letak dan akses**
- Panel ada di alamat `abadiops.com` yang **tidak ditautkan dari mana pun**. Tujuannya sedikit tersembunyi, bukan untuk keamanan.
- Panel **dilindungi kata sandi**.
  - Kata sandi disimpan sebagai *secret* Worker pintu (`wrangler secret put`), dalam bentuk hash, dan **tidak pernah** masuk repo.
  - Percobaan gagal dibatasi, dan sesi masuk berumur pendek.
- Panel **harus selalu bisa dibuka**, karena ia juga alat penyelamat. Panel dan penyimpanan saklar **hanya bergantung pada Cloudflare**, tidak pada Supabase maupun GAS. Saat Supabase atau GAS bermasalah, panel tetap hidup.

**Tampilan**
- Satu kartu per rumah. Posisi sekarang terlihat jelas lewat warna dan tulisan, beserta waktu dan pelaku perubahan terakhir, jam mulai migrasi (waktu setempat), dan **kesehatan cermin**:
  - sinkron terakhir;
  - hasil pemeriksaan selisih terakhir;
  - hari tanpa selisih;
  - sheet yang berbeda;
  - tombol "Periksa sekarang".
- Setelah jam mulai, kartu juga menampilkan kesehatan cermin balik: perubahan terakhir yang sudah tersalin ke spreadsheet.
- Di bawahnya tampil riwayat perubahan saklar (siapa, kapan, dari → ke, alasan).

**Mulai migrasi selalu dengan peringatan**
- Sebelum mulai, panel menampilkan **peringatan/caution**: apa yang akan berubah, siapa yang terdampak, dan cara kembali.
- Panel menampilkan daftar syarat di atas. Semua syarat harus tercentang.
- Pelaku wajib mengetik nama rumah dan alasannya sebagai konfirmasi.

**Kembali ke GAS = penyelamat**
- Selalu tersedia dan cepat. Cukup satu konfirmasi, tanpa daftar syarat.
- Kembali ke GAS **tidak boleh merusak atau menghilangkan data**. Itu dijamin oleh dua hal: hanya ada satu penulis pada satu waktu, dan cermin balik terakhir harus berselisih 0 sebelum GAS dibuka.

**Teknis**
- Nilai saklar disimpan di **Durable Object SQLite-backed** Cloudflare (`workers/pintu/src/saklar-do.js`). Nilainya berlaku seketika (strongly consistent) di semua lokasi edge Cloudflare.
- Panel visual aktif di rute `/saklar` pada Worker Pintu (`abadiops.com/saklar` dan `abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar`).
- Pintu menulis lewat antarmuka panel. Worker rumah membaca saklar dinamis lewat *service binding* `PINTU`, dengan cache memori 5 detik. Perubahan saklar tidak memerlukan deploy.
  - Kode Worker GAS asli di branch `staging` sudah mengikuti saklar.
  - Worker produksi menyusul saat merge (BUG-DICATAT #27).
- GAS membaca saklar rumahnya sendiri dari pintu, dengan cache singkat. Ini bagian dari tambalan "tutup GAS".
- Setiap perubahan dicatat otomatis, hingga 50 riwayat terakhir, di Durable Object (siapa, kapan, dari → ke, alasan). Saat terjadi pembalikan produksi, catatan itu disalin ke tabel di bawah.

**Yang sudah dibangun (14 Nov malam, branch `staging`)**
- **Prosedur Mulai/Kembali:** `workers/pintu/src/migrasi.js` (kesehatan cermin, rute `/saklar/api/migrasi/*`, langkah-langkah) dan `SaklarDO` (mesin langkah dengan alarm Durable Object; kegagalan selalu berakhir di posisi aman: mulai → `gas`, kembali → `supabase`). Di produksi ubah manual hanya untuk membatalkan `menutup`; tombol mulai terkunci sampai `gas.jalan_kembali_siap` di `config/rumah.json` bernilai `true`.
- **Kunci tulis di database:** `cermin_tulis` menolak skema asli (`TERKUNCI`, HTTP 423) kecuali izin dibuka prosedur (`public.cermin_izin_tulis`, `public.cermin_atur_izin_tulis`).
- **Peralihan di Worker rumah:** kiriman PWA ditahan dengan protokol yang dikenali PWA (`gas.peralihan`: `MAINTENANCE|` untuk SUM/KMB V2, `retry_later` untuk KMB Projek/BUPR), bacaan tetap jalan, halaman web 503 "pindah jalur".
- **Pengaman sinkron:** `tools/cermin/sinkron.mjs` melewati rumah yang izin tulisnya terbuka, supaya sinkron per jam tidak menimpa pekerjaan di abadiops. Workflow `cermin.yml` di `main` harus memakai versi ini sebelum jam mulai rumah mana pun.
- **Kunci sinkron maju** (15 Nov siang, `db/bersama/cermin_maju.sql`, terpasang di Gedung 1): kolom `maju_dikunci` di `public.cermin_izin_tulis` dan `public.cermin_kunci_maju`. Setiap transaksi sheet sinkron maju memegang kunci bersama per rumah lalu membaca ulang izinnya, dan kunci eksklusif per sheet supaya dua putaran tidak menulis sheet yang sama bersamaan (tanpa itu, periksa bisa melaporkan selisih palsu). Uji SQL 16/16 di Gedung 1 (transaksi di-rollback, dua koneksi); uji ujung ke ujung BUPR 7/7, termasuk kunci yang dipasang di tengah putaran (berhenti rapi sesudah 11 sheet); uji langkah prosedur 12/12. `cermin.yml` dan `peralihan.yml` memakainya begitu ada di `main`.
- **Tutup GAS:** `tools/kembar/tambal-tutup-gas.mjs` (uji logika 14/14; kode bertambalan tetap 66/66 di uji kembar BUPR). Belum di-push ke GAS: Gabriel men-deploy dari editor.
- **Fungsi pendukung** (`db/bersama/migrasi.sql`): `cermin_bandingkan`, `cermin_cadangkan`, `cermin_kesehatan`; terpasang di Gedung 1.
- **Uji prosedur di staging** (simulasi di ruang uji): 18/18 lulus. Mencakup kembali → mulai lengkap dengan cadangan, sinkron terakhir, periksa selisih 0, dan jam mulai tercatat; penolakan konfirmasi/posisi/prosedur ganda; dan penahanan kiriman HP saat peralihan.
- **Pemicu terjadwal GAS di Worker:** `config/rumah.json` `gas.pemicu` (cleanupProcessedOps, cleanupKirimanWeb, penjagaOtomatis; jam WIB zona skrip), cron `[triggers]` produksi, `scheduled()` hanya bila saklar `supabase`. Uji kembar di ruang uji 11/11 identik (jawaban + seluruh sheet), termasuk pemangkasan 10.686 baris ProcessedOps KMB V2.
- **Hitung ulang rumus config** (keputusan 15 Nov): `cermin_rumus` diisi alat sinkron; `workers/bersama/rumus.js`; pusat admin menghitung ulang, mengunci sel berumus, dan menolak hapus baris di sheet berumus. Cermin balik nanti memakai `cermin_rumus` supaya tidak menimpa rumus.
- **Payroll XLSX dari abadiops** (15 Nov): identik sel demi sel dengan berkas GAS (KMB V2, KMB Projek); `docs/INVENTARIS-LAYANAN-GOOGLE.md`.
- **Cermin balik** (15 Nov): `tools/cermin/balik.mjs` + `tools/cermin/google.mjs` (pembaca bersama dengan sinkron maju). Uji kering terhadap spreadsheet BUPR asli: 24/24 sheet sama; 8 uji dengan spreadsheet tiruan (`tests/cerminBalik.test.ts`).
- **Prosedur produksi lengkap** (15 Nov): langkah 1–7 di atas, antrean `db/bersama/cermin_permintaan.sql` (terpasang di Gedung 1), pelaksana `tools/cermin/peralihan.mjs` + `.github/workflows/peralihan.yml`, pemulihan otomatis bila gagal. Uji: permintaan sinkron terakhir BUPR sungguhan diproses pelaksana lokal (24/24 sama), 8 uji langkah (`tests/prosedurMigrasi.test.ts`), uji prosedur staging 18/18.
- **Tutup GAS siap dikirim** (15 Nov): `tools/kembar/siapkan-tutup-gas.mjs` (clone HEAD + versi ter-deploy, wajib identik, tambal, uji 14/14, `--push` dengan izin Gabriel). Keempat rumah sudah dicek: HEAD identik dengan @11/@49/@299/@199.
- **Belum, menunggu Gabriel:** daftar lengkapnya di `docs/SIAP-MULAI.md` (gabung ke `main` + deploy produksi, kunci Supabase produksi, push + deploy tutup GAS, hak Editor, latihan cermin balik di salinan, PWA BUPR, aturan 7 hari).

## Catatan pembalikan saklar

| Tanggal dan jam (waktu setempat) | Rumah | Dari → ke | Alasan | Oleh |
|---|---|---|---|---|
| — | — | — | belum pernah dibalik | — |
