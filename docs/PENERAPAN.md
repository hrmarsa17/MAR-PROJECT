# Menerapkan KMB

Ada **dua jalan**, dan pilihannya menentukan berapa banyak hal yang harus Anda
urus sendiri.

| | Vercel + Supabase | Server sendiri (Docker) |
|---|---|---|
| Server | tidak ada | Anda yang punya & rawat |
| Domain | dapat otomatis (`*.vercel.app`) | harus punya sendiri |
| HTTPS | otomatis | Caddy, otomatis |
| Cadangan | disediakan Supabase | Anda yang jalankan & simpan |
| Menerapkan versi baru | `git push` | SSH + `docker compose up` |
| Kalau server mati jam 2 pagi | bukan urusan Anda | urusan Anda |
| Biaya awal | gratis | sewa VPS |

**Saran: mulai dari Vercel + Supabase** — sama seperti ScannerFinance. Bagian
yang paling mahal dari punya server sendiri bukan uang sewanya, melainkan
bahwa ia harus ada yang menjaga. Pindah ke server sendiri selalu bisa
belakangan; berkas Docker di repo ini tetap ada untuk itu.

Lompat ke [Jalan B](#jalan-b--server-sendiri-docker) kalau memang mau server
sendiri.

---

## Jalan A — Vercel + Supabase

### 1. Basis data di Supabase

1. Buat proyek di [supabase.com](https://supabase.com).
2. **Region: Singapore.** Ini bukan selera — lihat kotak di bawah.
3. Salin *connection string* dari **Project Settings → Database**. Ambil yang
   **Transaction pooler** (porta **6543**), bukan yang koneksi langsung.

> #### Kenapa region harus sama dengan Vercel
>
> Impor katalog lewat Excel menjalankan **sekitar 4 kueri per baris**. Untuk
> katalog field KMB yang 1.535 baris, itu kira-kira **6.100 perjalanan
> bolak-balik** ke basis data.
>
> | Jarak | Satu perjalanan | 6.100 perjalanan |
> |---|---|---|
> | Se-region | ~1 ms | ~6 detik — lewat |
> | Beda benua | ~50 ms | ~5 menit — **putus di tengah** |
>
> Fungsi Vercel berhenti di 10 detik (paket gratis). Jadi region yang berjauhan
> bukan "agak lambat" — ia membuat impor katalog besar mustahil.
>
> Untuk impor pertama yang besar, tetap lebih baik pakai skrip dari laptop
> (`scripts/pindah-katalog-v2.ts`) — ia tidak punya batas waktu sama sekali.
> Menu Admin memang untuk perubahan sehari-hari, bukan pemindahan ribuan baris.

Pasang skema dan seluruh migrasi, dari laptop Anda:

```bash
DATABASE_URL="<connection string tadi>" \
  npx tsx scripts/migrasi.ts --awal --terapkan --izinkan-luar
```

Lalu buat orang pertama:

```bash
DATABASE_URL="<connection string tadi>" \
  npx tsx scripts/orang-pertama.ts --kode ADM-001 --nama "Gabriel" --izinkan-luar
```

Simpan token yang tercetak.

### 2. Aplikasi di Vercel

1. Hubungkan repo ini di [vercel.com](https://vercel.com).
2. **Region: Singapore** (Project Settings → Functions).
3. Tambah *environment variable*:

| Nama | Isi |
|---|---|
| `DATABASE_URL` | connection string **pooler** (porta 6543) |

Tidak perlu yang lain. `DB_POOL_MAX` diatur sendiri: `src/lib/db.ts` mengenali
alamat pooler dan menyetel kolam ke 1 koneksi beserta `prepare: false`, yang
memang dituntut pooler mode-transaksi.

4. Deploy. Vercel memberi alamat `https://<nama>.vercel.app` lengkap dengan
   HTTPS — dan HTTPS itu wajib, karena cookie sesi memakai `secure: true`.

Periksa: `https://<nama>.vercel.app/api/sehat`

### 3. Katalog — dari laptop, TIGA perintah berurutan

Basis data yang baru dipasang punya skema dan kebijakan, tapi **nol job dan nol
unit**. Katalognya dipindahkan dari laptop, bukan lewat menu Admin: 1.535 baris
lewat fungsi Vercel akan menabrak batas 10 detik (lihat kotak region di atas).

Ganti `<PROD>` dengan alamat **session pooler** yang tadi dipakai.

```bash
# 1. Katalog KMB V2 — field, workshop, tyreman, unit
DATABASE_URL="<PROD>" npx tsx scripts/pindah-katalog-v2.ts \
    "C:\...\Backup manual\KMB\9152026_1340.xlsx" --terapkan --izinkan-luar

# 2. Matriks workshop baru — 52 job SDT70 & DOLLY50T
DATABASE_URL="<PROD>" npx tsx scripts/pindah-matriks-workshop.ts \
    MARworkshop.xlsx --terapkan --izinkan-luar

# 3. Petakan job tyreman ke form inspeksi ban
DATABASE_URL="<PROD>" npx tsx scripts/migrasi.ts \
    db/migrasi/004-form-ban-lengkap.sql --terapkan --izinkan-luar
```

Jalankan dulu **tanpa** `--terapkan` untuk melihat apa yang akan terjadi.

> #### Kenapa langkah 3 ada, dan kenapa ia HARUS terakhir
>
> Migrasi 004 memetakan job tyreman ke form detail ban — form inspeksi, remove &
> instal, repair. Ia sudah ikut dijalankan saat pemasangan, **ketika basis data
> masih nol job**, jadi ia tidak memetakan apa pun.
>
> Kalau tidak diulang sesudah katalog masuk, WO tyreman tidak akan punya form
> detailnya: mekanik mengirim kerja, dan tidak ada tempat mencatat tekanan, RTD,
> maupun nomor seri ban. Layar Teknis lalu kosong tanpa alasan yang kelihatan.
>
> `migrasi.ts` biasanya melewati migrasi yang sudah tercatat — menyebut nama
> berkasnya secara langsung memaksanya jalan lagi. Migrasi ini aman diulang.

### 4. Buktikan isinya, dari laptop

Skrip pemindah melaporkan apa yang **ia** lakukan. Yang berdiri di basis data
bisa berbeda — transaksi yang putus, migrasi yang lupa diulang, atau
`DATABASE_URL` yang ternyata menunjuk ke tempat lain sejak tiga perintah yang
lalu. Yang membuktikan cuma membaca ulang:

```bash
DATABASE_URL="<PROD>" npm run periksa
```

`<PROD>` di sini dan di seluruh dokumen ini adalah **tempat isian** — ganti
dengan connection string yang sesungguhnya, jangan diketik apa adanya.
(Kalau terlanjur, ia berhenti dengan kalimat yang menyebutkannya, bukan dengan
jejak tumpukan.)

Ia hanya membaca — transaksinya `READ ONLY`, jadi Postgres sendiri yang menolak
tulisan apa pun. Aman dijalankan kapan saja, termasuk saat sistem sedang
dipakai.

Yang harus terlihat sesudah impor pertama:

| | |
|---|---|
| migrasi | 9 — mengulang 004 tidak menambah barisnya, hanya memperbarui sidiknya |
| job field · workshop · tyreman | 1.535 · 242 · 7 |
| unit | 103 |
| form ban | 5 dari 7 job terpetakan |
| tarif · faktor | > 0 · ≥ 10 |
| work order · poin mekanik | **0 · 0** |

Dua angka nol terakhir itu yang paling penting hari ini: kalau bukan nol,
`DATABASE_URL` menunjuk ke basis data yang salah — dan itu jauh lebih baik
diketahui sekarang daripada sesudah sesuatu ditulis ke sana.

Jalankan lagi setiap sesudah impor besar, dan sekali lagi sebelum hari WO
sungguhan yang pertama.

### 5. Orang dan pemeriksaan

Masuk dengan token tadi, lalu dari dalam aplikasi:

1. **Admin → Orang & Token → Ganti token** — ganti token bootstrap Anda lebih
   dulu. Ia tercetak di layar saat pemasangan dan mungkin tersalin ke mana-mana.
2. **Admin → Orang & Token** — tambahkan mekanik, L1, L2.
3. **Admin → Katalog Job** — periksa jumlahnya: field 1.535, workshop 242,
   tyreman 7, unit 103.
4. **Admin → Kesehatan Sistem** — pastikan tidak ada butir merah.

### Memperbarui

`git push` — Vercel membangun dan menerapkan sendiri.

**Migrasi TIDAK ikut otomatis.** Kalau rilis itu membawa migrasi baru, jalankan
dari laptop **sebelum** push:

```bash
DATABASE_URL="<pooler>" npx tsx scripts/migrasi.ts --terapkan --izinkan-luar
```

Urutannya memang begitu: skema harus siap sebelum kode baru menyentuhnya.

### Cadangan

> #### ⚠️ Paket Free TIDAK dicadangkan otomatis
>
> Cadangan harian otomatis hanya ada di paket **Pro, Team, dan Enterprise**.
> Di paket Free, Supabase sendiri menyuruh pemakainya mengekspor data secara
> berkala dan menyimpan salinannya di luar. Kalau proyeknya hilang atau rusak
> di paket Free, **tidak ada yang bisa dipulihkan**.
>
> Dokumen ini sempat menulis "Supabase mencadangkan otomatis setiap hari" —
> keliru, dan keliru ke arah yang paling berbahaya: ia membuat orang merasa
> terlindungi justru saat tidak ada yang melindungi.
>
> Dua jalan keluarnya, pilih salah satu sebelum WO sungguhan yang pertama:
>
> 1. **Naik ke paket Pro** — cadangan harian otomatis jadi ada.
> 2. **Jadwalkan `scripts/cadangkan.ts` di laptop atau mesin mana pun yang
>    menyala tiap hari**, dan simpan hasilnya di luar mesin itu.
>
> Yang tidak boleh: menganggap sudah aman tanpa melakukan keduanya.
>
> Sumber: [Database Backups](https://supabase.com/docs/guides/platform/backups),
> [Pricing](https://supabase.com/pricing)

Ambil salinan sendiri sebelum tiap perubahan besar, apa pun paketnya:

```bash
DATABASE_URL="<koneksi langsung, porta 5432>" npx tsx scripts/cadangkan.ts
```

> Cadangan yang tidak pernah diuji pulih bukan cadangan. Sekali sebulan:
> `npm run uji:cadangan` di laptop, atau pulihkan ke proyek Supabase kedua.

**Cara menjadwalkannya, langkah demi langkah: [CADANGAN.md](CADANGAN.md).**

### 7. Pemantauan

Tanpa ini, kalau sistemnya mati jam 2 pagi tidak ada yang tahu sampai ada
mekanik yang gagal mengirim kerjanya — dan ia akan mengira dirinya yang salah.

Pakai pemantau luar apa pun yang gratis (UptimeRobot, Better Stack, Pingdom).
Yang diisi:

| | |
|---|---|
| URL | `https://<nama>.vercel.app/api/sehat` |
| Jenis | HTTP(s), periksa **kode status** |
| Selang | 5 menit |
| Anggap mati bila | status **bukan 200** |

Kode statusnya memang sudah dibuat untuk ini: `/api/sehat` menjawab **200** saat
kuerinya jalan dan **503** saat basis datanya tak terjangkau. Jadi pemantau
biasa sudah cukup — tidak perlu yang bisa membaca isi JSON.

> #### Dua hal yang ikut didapat
>
> **Angka, bukan perasaan.** Selama masa pembuktian, yang ingin Anda ketahui
> justru berapa kali ia mati dan berapa lama. Tanpa pemantau, "andal" tidak
> punya satuan.
>
> **Proyek Free tidak tertidur.** Supabase menidurkan proyek Free yang lama
> tidak dipakai. Pemantau yang menembak tiap 5 menit menjalankan kueri
> sungguhan, jadi proyeknya tidak pernah dianggap menganggur.

Arahkan pemberitahuannya ke tempat yang benar-benar Anda lihat. Pemantau yang
mengirim email ke kotak yang tidak pernah dibuka sama saja dengan tidak ada.

---

## Jalan B — server sendiri (Docker)

Bagian sisa dokumen ini untuk orang yang memegang servernya. Ia menganggap Anda
bisa masuk SSH dan menjalankan perintah, tapi tidak menganggap Anda hafal
Docker.

---

## Sebelum mulai: tiga hal yang harus sudah ada

**1. Sebuah server.** Ukuran yang cukup untuk 24 orang dan puluhan ribu WO:

| | minimum | nyaman |
|---|---|---|
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 40 GB |
| CPU | 1 inti | 2 inti |

Yang perlu terpasang cuma Docker. Distro apa pun yang Anda kenal.

**2. Nama domain**, dan A-record-nya sudah menunjuk ke IP server itu.
Alamat IP telanjang tidak bisa diberi sertifikat.

**3. Waktu yang tidak terburu-buru.** Pemasangan pertama sekitar 20 menit,
sebagian besar menunggu image dibangun.

> ### Kenapa domain tidak bisa ditunda
>
> Cookie sesi KMB memakai `secure: true` di produksi. Artinya **tanpa HTTPS,
> tidak ada satu pun orang yang bisa masuk** — bukan "kurang aman", melainkan
> tidak berfungsi sama sekali. HTTPS butuh nama domain. Jadi urutannya memang
> domain dulu, baru sisanya.

---

## Pemasangan pertama

```bash
git clone <repo> kmb && cd kmb

cp .env.produksi.example .env.produksi
nano .env.produksi          # isi POSTGRES_PASSWORD, DOMAIN, EMAIL_TLS
```

Kata sandi basis data jangan diketik sendiri:

```bash
openssl rand -base64 32
```

Lalu:

```bash
docker compose --env-file .env.produksi up -d --build
```

Yang terjadi, berurutan: Postgres menyala → `migrasi` memasang skema, baris
kebijakan, dan seluruh migrasi → aplikasi menyala → Caddy menerbitkan
sertifikat. Aplikasi **tidak** menyala sebelum migrasi selesai dengan sukses.

Periksa:

```bash
curl https://<domain>/api/sehat
# {"ok":true,"basisData":"terhubung","migrasi":9}
```

### Orang pertama

Basis data yang baru berisi skema dan kebijakan, tapi **nol orang**. Menambah
orang lewat menu Admin menuntut hak admin, dan hak admin harus dimiliki orang
yang sudah ada. Lingkaran itu dibuka sekali, dari baris perintah:

```bash
docker compose --env-file .env.produksi run --rm migrasi \
  npx tsx scripts/orang-pertama.ts --kode ADM-001 --nama "Gabriel" --izinkan-luar
```

Ia mencetak sebuah token. **Simpan sekarang.** Buka `https://<domain>/masuk`,
masukkan token itu.

Skrip ini menolak berjalan lagi selama masih ada admin aktif — penambahan orang
berikutnya lewat menu Admin, tempat semuanya tercatat beserta siapa yang
melakukannya.

### Mengisi katalog dan orang

Dari dalam aplikasi, tanpa baris perintah:

1. **Admin → Orang & Token** — tambahkan mekanik, L1, dan L2. Terbitkan token
   masing-masing.
2. **Admin → Katalog Job** — unduh templat Excel, tempel isi katalog Anda,
   unggah. Pratinjau menyebutkan setiap angka yang berubah sebelum tersimpan.
3. **Admin → Katalog Job → lembar Unit** — sama caranya untuk daftar unit.
4. **Admin → Kesehatan Sistem** — periksa tidak ada butir merah.

---

## Memperbarui ke versi baru

```bash
cd kmb
git pull
docker compose --env-file .env.produksi up -d --build
```

Migrasi yang baru jalan sendiri sebelum aplikasi menyala. Yang sudah terpasang
tidak dijalankan ulang — ada catatannya di tabel `schema_migrations`.

**Cadangkan dulu**, selalu:

```bash
docker compose --env-file .env.produksi run --rm migrasi \
  npx tsx scripts/cadangkan.ts --ke /cadangan
```

---

## Cadangan

### Setiap hari, otomatis

```bash
crontab -e
```

```cron
# 01:30 setiap hari. Simpan 30 hari terakhir.
30 1 * * * cd /path/ke/kmb && docker compose --env-file .env.produksi run --rm migrasi npx tsx scripts/cadangkan.ts --ke /cadangan --simpan 30 >> /var/log/kmb-cadangan.log 2>&1
```

Berkasnya ada di `./cadangan` pada server.

> ### Cadangan yang tidak pernah diuji pulih bukan cadangan
>
> Salin berkas cadangan ke **luar server** — mesin lain, atau penyimpanan awan.
> Cadangan yang tersimpan di server yang sama akan hilang bersama servernya.
>
> Dan sekali sebulan, buktikan ia benar-benar pulih. Perintahnya ada di bawah.

### Memulihkan

```bash
# lihat cadangan yang ada
docker compose --env-file .env.produksi run --rm migrasi \
  npx tsx scripts/pulihkan.ts --dari /cadangan

# pulihkan (tujuan WAJIB disebut — tidak pernah diambil diam-diam)
docker compose --env-file .env.produksi run --rm migrasi \
  npx tsx scripts/pulihkan.ts /cadangan/kmb-….dump \
    --ke postgres://kmb:SANDI@db:5432/kmb
```

Memulihkan **mengganti** isi basis data tujuan. WO yang masuk sesudah cadangan
itu dibuat akan hilang, dan tidak ada tombol batal.

---

## Kalau ada yang rusak

| Yang terlihat | Periksa |
|---|---|
| Tidak ada yang bisa masuk | Sertifikat: `docker compose logs caddy`. Cookie butuh HTTPS. |
| Semua layar galat | `curl https://<domain>/api/sehat`. Kalau `ok:false`, basis datanya. |
| Aplikasi tidak menyala | `docker compose logs migrasi` — hampir selalu migrasi yang gagal. |
| Lambat | `docker compose logs db`. Naikkan `DB_POOL_MAX` hanya kalau terlihat antre. |

Log:

```bash
docker compose --env-file .env.produksi logs -f app
docker compose --env-file .env.produksi ps
```

---

## Yang perlu diperiksa berkala

| Kapan | Apa |
|---|---|
| Tiap hari | Cadangan semalam ada dan ukurannya wajar |
| Tiap minggu | **Admin → Kesehatan Sistem**, tidak ada butir merah |
| Tiap bulan | Pulihkan satu cadangan ke basis data uji. Buktikan, jangan asumsikan. |
| Tiap bulan | **Admin → Riwayat Perubahan**, saring "hanya yang menggeser uang" |

---

## Yang BELUM ada, dan sebaiknya diketahui sebelum go-live

- **PWA / mode luring belum dibangun.** Mekanik masih membutuhkan sinyal saat
  mengirim jam kerja. Ini pekerjaan berikutnya, dan ia butuh server ini lebih
  dulu — service worker hanya hidup di HTTPS.
- **Dashboard Teknis dunia Field kosong.** PA/MTTR/MTBF berdiri di atas jam unit
  turun & jam siap pakai, dan belum diputuskan siapa yang mencatatnya. Lihat
  `docs/SPEK-LAYAR/05-TEKNIS.md` §7b.
- **Pemantauan harus dipasang, bukan sekadar bisa.** Caranya ada di §7 di atas
  dan `/api/sehat` sudah menjawab 503 saat basis datanya tak terjangkau — tapi
  sampai ada yang benar-benar mendaftarkannya, kalau sistemnya mati jam 2 pagi
  tetap tidak ada yang tahu.
- **Satu server, satu basis data.** Kalau mesinnya hilang, yang tersisa cuma
  cadangan. Itu sebabnya cadangan harus keluar dari server itu.

---

## Catatan tentang berkas ini

Yang di sini sudah **diuji di mesin pengembangan**, bukan diasumsikan:

- `npm run uji:db-baru` — 30 pemeriksaan. Basis data kosong → skema → kebijakan
  → 9 migrasi → orang pertama → token yang bisa dipakai masuk.
- `npm run uji:cadangan` — 14 pemeriksaan. Cadangan dipulihkan ke basis data
  kosong, lalu isinya dibandingkan baris per baris, termasuk total rupiah.

Yang **belum bisa diuji** di mesin pengembangan:

- `Dockerfile`, `docker-compose.yml`, `Caddyfile` — Docker tidak terpasang di
  sana. Ditulis mengikuti bentuk baku Next.js standalone, tapi jalannya baru
  terbukti saat dijalankan pertama kali di server.
- **Jalan A (Vercel + Supabase) belum pernah dijalankan sama sekali.** Yang
  sudah diperiksa cuma kecocokannya: ekstensi yang dipakai (`citext`,
  `pgcrypto`) tersedia di Supabase, tidak ada sintaks khusus Postgres 18, dan
  `src/lib/db.ts` sudah mengenali pooler. Yang belum: menjalankannya.

Sediakan waktu untuk penerapan pertama, dan jangan melakukannya pada hari yang
sama dengan WO pertama yang sungguhan.

---

## Satu hal yang perlu diketahui tentang RLS

`work_orders` dan `mechanic_points` punya Row Level Security beserta
kebijakannya (`db/schema.sql:751`). **Saat ini kebijakan itu tidak menjaga apa
pun**, karena aplikasi menyambung sebagai PEMILIK tabel, dan pemilik selalu
melewati RLS. Begitu juga di Supabase kalau memakai peran `postgres`.

Ini bukan penghalang untuk menerapkan — pagar yang sesungguhnya hari ini adalah
gerbang peran di lapisan aplikasi, dan itu diuji. Tapi jangan menganggap RLS
sedang menjaga sesuatu. Kalau kelak ia memang mau diandalkan, aplikasi harus
menyambung sebagai peran non-pemilik, dan seluruh pembacaan di luar transaksi
harus lebih dulu menetapkan `app.mechanic_id` — sekarang hanya jalur perintah
yang menetapkannya.
