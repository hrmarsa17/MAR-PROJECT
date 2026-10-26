# Penerapan dengan Cloudflare Tunnel

Aplikasi ini tidak lagi diterapkan ke Vercel. Runtime tetap Next.js standalone
di Docker, sedangkan Cloudflare Tunnel menjadi pintu internetnya. Dengan cara
ini database PostgreSQL tetap dapat diakses melalui koneksi TCP biasa dan server
tidak perlu membuka porta 80/443 ke internet.

## Bentuk penerapan

```
pengguna
   │ HTTPS
Cloudflare
   │ tunnel terenkripsi
cloudflared ── app:3000
                 │
              PostgreSQL
```

Cloudflare Tunnel hanya meneruskan trafik ke aplikasi. Ia tidak menyimpan
`DATABASE_URL`, token login, atau data aplikasi.

## 1. Siapkan server

Pasang Docker dan Docker Compose di VPS atau mesin yang selalu menyala, lalu
clone repository ini. Jangan buka port PostgreSQL ke internet.

```bash
git clone <url-repository> MARProject
cd MARProject
copy .env.produksi.example .env.produksi
```

Isi `.env.produksi`:

- `POSTGRES_DB`, `POSTGRES_USER`, dan `POSTGRES_PASSWORD` untuk database lokal.
- `CLOUDFLARE_TUNNEL_TOKEN` dari Cloudflare Zero Trust.
- `DB_POOL_MAX` sesuai kapasitas server.

File `.env.produksi` tidak boleh di-commit.

## 2. Buat Cloudflare Tunnel

Di Cloudflare Zero Trust:

1. Buka **Networks → Tunnels → Create a tunnel**.
2. Pilih **Cloudflared**, beri nama tunnel, lalu salin token instalasinya ke
   `CLOUDFLARE_TUNNEL_TOKEN`.
3. Tambahkan **Public hostname**, misalnya `mar.example.com`.
4. Untuk service, pilih `http://app:3000`.
5. Pastikan DNS hostname dikelola Cloudflare (record tunnel dibuat otomatis).

`app:3000` adalah nama service Docker Compose, bukan alamat yang dibuka dari
internet. HTTPS pengguna diterminasi oleh Cloudflare dan koneksi tunnel
dienkripsi.

## 3. Jalankan aplikasi

```bash
docker compose --env-file .env.produksi up -d --build
docker compose --env-file .env.produksi ps
```

Compose menjalankan database, migrasi, aplikasi, dan `cloudflared`. Migrasi
harus selesai sebelum aplikasi menerima trafik. Periksa:

```bash
curl https://mar.example.com/api/sehat
```

Jawaban yang benar memiliki HTTP 200 dan `"ok":true`.

Jalur Caddy lama tetap tersedia untuk keadaan darurat atau penerapan tanpa
Cloudflare Tunnel. Jalankan secara eksplisit dengan profile `direct`; jalur ini
membutuhkan `DOMAIN` dan `EMAIL_TLS`:

```bash
docker compose --profile direct --env-file .env.produksi up -d --build
```

Jangan menjalankan profile `direct` bersamaan dengan kebutuhan server yang sama
tanpa memastikan port 80/443 memang tersedia.

## 4. Database pertama dan akun admin

Migrasi awal dijalankan oleh service `migrasi`. Buat akun pertama dari mesin
yang dapat mengakses database:

```bash
docker compose --env-file .env.produksi run --rm alat \
  npx tsx scripts/orang-pertama.ts --kode ADM-001 --nama "Admin" --izinkan-luar
```

Ganti token bootstrap setelah login pertama. Impor katalog besar tetap
dijalankan dengan skrip dari mesin admin, bukan melalui request HTTP.

## 5. Rilis berikutnya

```bash
git pull
docker compose --env-file .env.produksi up -d --build
```

Jika rilis membawa migrasi baru, Compose menjalankan service `migrasi` sebelum
`app` dimulai. Untuk perubahan database yang besar, buat cadangan lebih dulu:

```bash
docker compose --env-file .env.produksi run --rm alat \
  npx tsx scripts/cadangkan.ts
```

Lihat [CADANGAN.md](CADANGAN.md) untuk penjadwalan dan uji pemulihan.

## 6. Pemantauan

Set `ALAMAT_SEHAT` pada GitHub Actions repository variables ke:

```
https://mar.example.com/api/sehat
```

Workflow `.github/workflows/pantau.yml` akan gagal jika endpoint tidak
terjangkau, menjawab bukan 200, atau database tidak sehat. Untuk notifikasi
yang lebih cepat, tambahkan UptimeRobot/Better Uptime ke URL yang sama.

Jika pemeriksaan gagal:

```bash
docker compose --env-file .env.produksi ps
docker compose --env-file .env.produksi logs --tail=100 cloudflared
docker compose --env-file .env.produksi logs --tail=100 app
```

Periksa juga status tunnel dan public hostname di Cloudflare Zero Trust.
