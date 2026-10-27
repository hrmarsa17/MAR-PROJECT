# Panduan untuk Gabriel: Menyiapkan Rumah KMB V2 & SUM V2

Halo Gabriel! Repo sekarang sudah disiapkan dalam arsitektur **tiga rumah** (`workers/kmb/`, `workers/kmb-projek/`, `workers/sum/` dan `db/kmb/`, `db/sum/`). 

Sesuai pembagian di `AGENTS.md` dan `docs/STRUKTUR-RUMAH.md`, kamu memegang dua rumah: **KMB V2** dan **SUM V2**.

Berikut adalah panduan langkah demi langkah untuk memulai rumahmu:

---

## 1. Salin & Siapkan Skema Database Supabase
Buat skema PostgreSQL di Supabase Singapore (`sptgqsjgszwbreikxdph`) untuk masing-masing rumah:
- **KMB V2**: buat schema `kmb` (cermin dari sheet KMB V2).
- **SUM V2**: buat schema `sum` (cermin dari sheet SUM V2, gunakan referensi `db/dummy-sum.sql`).

Letakkan migrasi SQL dan stored procedure RPC masing-masing di:
- `db/kmb/`
- `db/sum/`

---

## 2. Siapkan Worker & Backend Rumahmu
Raka sudah menyiapkan contoh pemisahan di folder `workers/kmb-projek/`. 
Untuk rumahmu, buat struktur serupa:

```
workers/
  ├── kmb/
  │   ├── worker.js          # Cloudflare Worker untuk KMB V2
  │   ├── wrangler.toml      # Konfigurasi worker KMB
  │   └── src/               # Backend & API routes KMB V2
  └── sum/
      ├── worker.js          # Cloudflare Worker untuk SUM V2
      ├── wrangler.toml      # Konfigurasi worker SUM
      └── src/               # Backend & API routes SUM V2
```

---

## 3. Pindahkan PWA Lama
Sesuai aturan emas §2.1 di `AGENTS.md`:
> *Frontend adalah salinan 1:1 dari PWA lama rumah itu.*

Ambil file PWA lama dari masing-masing rumah dan letakkan di:
- `pwa/kmb/` (untuk PWA KMB V2)
- `pwa/sum/` (untuk PWA SUM V2)

Ubah endpoint API-nya agar mengarah ke Worker rumah masing-masing.

---

## 4. Jalankan Uji Kembar (Twin Testing)
Sebelum menyalakan saklar apa pun:
1. Kirim request uji yang sama ke GAS lama dan Worker Supabase baru.
2. Bandingkan JSON output-nya (harus **sama persis**, huruf demi huruf dan angka demi angka).
3. Catat hasil inventaris aksi di `docs/INVENTARIS-KMB.md` dan `docs/INVENTARIS-SUM.md`.

---
*Silakan tanyakan jika ada kendala atau butuh sinkronisasi dengan kode shared di root! Semangat!*
