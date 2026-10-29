# Rumah KMB Project: Worker `abadiops-porject-kmb`

> Nama Worker di Cloudflare memang `abadiops-porject-kmb` (salah ketik dari `abadiops-kmbprojek`). Nama itu dibiarkan karena domain `kmbprojek.abadiops.com` sudah terpasang padanya. Mengganti nama berarti membuat Worker baru lalu memindahkan domain.

Rumah: `kmbprojek` · Pemegang: Raka · Tahap 3 (Pintu) · Saklar: `gas`

Worker ini membuat KMB Project bisa dipakai lewat Cloudflare dengan **fungsi lengkap PWA**: masuk, buat WO (cascade rekondisi/maintenance/workshop), kirim kerja, approve L1/L2, transfer, monitoring, dan lainnya.
Semua pekerjaannya tetap dilakukan **GAS KMB Project**. Worker hanya meneruskan setiap panggilan apa adanya. Belum ada satu pun aksi yang dilayani Supabase.

```
HP / laptop ──▶ abadiops-porject-kmb (Worker)
                 ├─ file PWA      ← pwa/kmbprojek/  (salinan 1:1 mar-projek-offline projek-v13)
                 └─ POST ./api    ──▶ GAS KMB Project (/exec) ──▶ spreadsheet KMB Project (1lnJo74O…)
```

Halaman web GAS KMB Project (link kedua, menu lengkap) tetap di alamat GAS sampai dipindah 1:1. Lihat `docs/KEPUTUSAN.md`.

## Isi

| File | Isinya |
|---|---|
| `workers/kmbprojek/wrangler.toml` | Nama Worker, akun kawanabadigrup (dikunci), folder PWA, alamat GAS KMB Project, saklar `gas` |
| `workers/kmbprojek/src/index.js` | Menyajikan PWA dan meneruskan `/api` ke GAS. Kodenya sama dengan `workers/kmb/src/index.js` |
| `pwa/kmbprojek/` | PWA KMB Project projek-v13 apa adanya, dengan resep empat baris dan pembaca serah-terima token (lihat di bawah) |

### Yang diubah dari PWA lama (repo `gabrielrurent/PWA-Project-KMB`, commit `6e8b980` 23 Okt, projek-v13)

Salinan lokal `MAR github/mar-projek-offline` masih projek-v1, jadi **jangan** dipakai sebagai pembanding.

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 15 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 21 | `APP_VERSION = 'projek-v13'` | `'projek-v17'` |
| `sw.js` | 1 | `CACHE = 'mar-projek-v13'` | `'mar-projek-v17'` |
| `sw.js` | 41 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

Tambahan serah-terima pintu (keputusan 29 Okt nomor 10), **sama persis dengan `pwa/kmb` dan `pwa/sum`**:
- `app.js`: `ambilTokenSerahan`, `masukDariPintu` dengan penjaga sesi (HP yang sudah masuk dengan token lain **tidak** diganti tokennya, supaya antrean kiriman milik pengguna lama tidak terkirim atas nama token baru), dan satu baris boot yang melepas kelas anti-kedip sesudah layar pertama dipilih.
- `index.html`: dua baris di `<head>` (anti-kedip), supaya layar token tidak tampil sekilas saat datang dari pintu.

`sw.js` **tidak** boleh diubah selain dua baris resep. Kalau GAS tidak terjangkau, Worker menjawab dengan teks yang bukan JSON (`GAS_TIDAK_TERJANGKAU`). `r.json()` di `sw.js` asli lalu melempar galat, sehingga kiriman tetap di antrean dan dikirim ulang otomatis (lihat `src/index.js`). Versi 29 Okt siang sempat mengubah jawaban itu menjadi `success:false`, dan kiriman ditandai gagal tanpa dicoba ulang. Sudah dipulihkan di projek-v17.

File lainnya (`manifest.json`, kedua ikon) identik byte demi byte. Cara cek: unduh file dari repo asli lalu `diff --strip-trailing-cr`. Untuk `sw.js`, hasilnya harus hanya dua baris.

Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.
