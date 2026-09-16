# Kenapa `vercel.json` cuma tiga baris

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
