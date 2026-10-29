# Rumah KMB Project: Worker `abadiops-kmbprojek`

Rumah: `kmbprojek` · Pemegang: Raka · Tahap 3 (Pintu) · Saklar: `gas`

Worker ini membuat KMB Project bisa dipakai lewat Cloudflare dengan **fungsi lengkap PWA**: masuk, buat WO (cascade rekondisi/maintenance/workshop), kirim kerja, approve L1/L2, transfer, monitoring, dan lainnya.
Semua pekerjaannya tetap dilakukan **GAS KMB Project**. Worker hanya meneruskan setiap panggilan apa adanya. Belum ada satu pun aksi yang dilayani Supabase.

```
HP / laptop ──▶ abadiops-kmbprojek (Worker)
                 ├─ file PWA      ← pwa/kmbprojek/  (salinan 1:1 mar-projek-offline projek-v13)
                 └─ POST ./api    ──▶ GAS KMB Project (/exec) ──▶ spreadsheet KMB Project (1lnJo74O…)
```

Halaman web GAS KMB Project (link kedua, menu lengkap) tetap di alamat GAS sampai dipindah 1:1. Lihat `docs/KEPUTUSAN.md`.

## Isi

| File | Isinya |
|---|---|
| `workers/kmbprojek/wrangler.toml` | Nama Worker, akun kawanabadigrup (dikunci), folder PWA, alamat GAS KMB Project, saklar `gas` |
| `workers/kmbprojek/src/index.js` | Menyajikan PWA dan meneruskan `/api` ke GAS. Kodenya sama dengan `workers/kmb/src/index.js` |
| `pwa/kmbprojek/` | PWA KMB Project projek-v13 apa adanya. Hanya empat baris yang diubah (lihat di bawah) |

### Yang diubah dari PWA lama (`mar-projek-offline`, repo `PWA-Project-KMB`)

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 15 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 21 | `APP_VERSION = 'projek-v13'` | `'projek-v14'` |
| `sw.js` | 1 | `CACHE = 'mar-projek-v13'` | `'mar-projek-v14'` |
| `sw.js` | 41 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

Tambahan serah terima pintu: `ambilTokenSerahan` dan `masukDariPintu` (keputusan 29 Okt nomor 10).
File lainnya (`index.html`, `manifest.json`, kedua ikon) identik byte demi byte.

Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.
