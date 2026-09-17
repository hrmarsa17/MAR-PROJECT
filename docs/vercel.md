# Kenapa `vercel.json` cuma empat baris

`regions: ["sin1"]` adalah **sin**gapura, dan ia satu-satunya isi yang benar-benar
penting di berkas itu.

## Alasannya bukan selera

Impor katalog lewat Excel menjalankan sekitar **4 kueri per baris**. Untuk
katalog field KMB yang 1.535 baris, itu kira-kira **6.100 perjalanan
bolak-balik** antara fungsi Vercel dan basis data Supabase.

| Fungsi di | Basis data di | Satu perjalanan | 6.100 perjalanan |
|---|---|---|---|
| `sin1` Singapura | Singapura | ~1 ms | **~6 detik** — lewat |
| `iad1` Washington | Singapura | ~230 ms | **~23 menit** — putus jauh sebelum selesai |

`iad1` adalah bawaan Vercel. Tanpa berkas ini, fungsi berjalan di Washington
sementara basis datanya di Singapura — dan impor katalog jadi mustahil, bukan
sekadar lambat. Fungsi Vercel berhenti di 10 detik pada paket gratis.

Menaruhnya di `vercel.json` berarti ia ikut di dalam repo, bukan sebuah kotak
centang di dasbor yang harus diingat seseorang saat membuat proyek ulang.

## Yang harus cocok

Pilih region **Singapore** juga saat membuat proyek Supabase. Keduanya harus
sama; salah satu saja di tempat lain sudah cukup untuk menimbulkan tabel di
atas.

## `ignoreCommand` — kenapa cabang tidak diterbitkan

```
"ignoreCommand": "[ \"$VERCEL_ENV\" = production ] && exit 1 || exit 0"
```

Vercel membalik arti kode keluar di sini: **1 = lanjut membangun, 0 = lewati.**
Jadi barisnya berbunyi: bangun hanya kalau ini produksi; untuk yang lain,
berhenti diam-diam.

### Kenapa pratinjau dimatikan, bukan diperbaiki

Secara bawaan Vercel membangun pratinjau untuk **setiap cabang**. Pada 17 Sep
2026 pratinjau pertama gagal, dan sebabnya menunjuk masalah yang lebih dalam
daripada sekadar build merah: `DATABASE_URL` hanya terpasang untuk lingkungan
Production, sementara pratinjau berjalan di lingkungan Preview.

Perbaikan yang paling terlihat mudah adalah menyalin `DATABASE_URL` yang sama ke
Preview. Itu keliru, dan keliru dengan cara yang mahal: setiap cabang percobaan —
kode yang belum diuji dan belum dibaca siapa pun — akan tersambung ke basis data
yang menggaji orang. Seluruh repo ini justru dibangun untuk mencegah hal itu;
dua puluh dua skrip menolak berjalan di luar porta 5433 karena alasan yang sama.

Maka pratinjau dilewati sampai ada basis data staging yang memang untuknya.

### Kalau suatu hari pratinjau dibutuhkan

Buat proyek Supabase kedua (gratis, region Singapore juga), pasang
`DATABASE_URL`-nya di Vercel **khusus lingkungan Preview**, lalu hapus
`ignoreCommand` dari berkas ini. Jangan pernah mengarahkan Preview ke basis data
produksi.

## Yang TIDAK ada di berkas ini, dan kenapa

- **`buildCommand`** — Vercel mengenali Next.js sendiri.
- **`env`** — kata sandi basis data tidak pernah ditulis di berkas yang
  di-commit. Ia diisi di dasbor Vercel, sekali.
- **`functions.maxDuration`** — bisa dinaikkan sampai 60 detik di paket Pro.
  Sengaja tidak dipasang: kalau suatu hari ada yang butuh lebih dari 10 detik,
  yang benar adalah memperbaiki operasinya, bukan memperpanjang batasnya. Satu
  pengecualian yang sudah diketahui — impor katalog ribuan baris — memang lebih
  baik dijalankan dari laptop lewat `scripts/pindah-katalog-v2.ts`, yang tidak
  punya batas waktu sama sekali.
