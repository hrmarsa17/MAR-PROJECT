# Menerapkan KMB di server

Dokumen ini untuk orang yang memegang servernya. Ia menganggap Anda bisa masuk
SSH dan menjalankan perintah, tapi tidak menganggap Anda hafal Docker.

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
- **Tidak ada pemantauan otomatis.** Kalau server mati jam 2 pagi, tidak ada
  yang memberi tahu. Sebelum benar-benar bergantung padanya, pasang pemantau
  luar apa pun yang menembak `/api/sehat` dan mengabari kalau ia berhenti
  menjawab.
- **Satu server, satu basis data.** Kalau mesinnya hilang, yang tersisa cuma
  cadangan. Itu sebabnya cadangan harus keluar dari server itu.

---

## Catatan tentang berkas ini

Yang di sini sudah **diuji di mesin pengembangan**, bukan diasumsikan:

- `npm run uji:db-baru` — 30 pemeriksaan. Basis data kosong → skema → kebijakan
  → 9 migrasi → orang pertama → token yang bisa dipakai masuk.
- `npm run uji:cadangan` — 14 pemeriksaan. Cadangan dipulihkan ke basis data
  kosong, lalu isinya dibandingkan baris per baris, termasuk total rupiah.

Yang **belum bisa diuji** di mesin pengembangan: `Dockerfile`, `docker-compose.yml`,
dan `Caddyfile` — Docker tidak terpasang di sana. Keduanya ditulis dengan hati-hati
dan mengikuti bentuk baku Next.js standalone, tapi jalannya baru terbukti saat
dijalankan pertama kali di server. Sediakan waktu untuk itu, dan jangan
melakukannya pada hari yang sama dengan WO pertama yang sungguhan.
