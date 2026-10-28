# Rumah KMB V2: Worker `abadiops-kmb`

Rumah: `kmb` · Pemegang: Gabriel · Tahap 3 (Pintu) · Saklar: `gas`

Worker ini membuat KMB V2 bisa dipakai lewat Cloudflare dengan **fungsi lengkap PWA**: masuk, buat WO, kirim kerja, approve L1/L2, transfer, monitoring, dan lainnya.
Semua pekerjaannya tetap dilakukan **GAS KMB V2**. Worker hanya meneruskan setiap panggilan apa adanya. Belum ada satu pun aksi yang dilayani Supabase.

```
HP / laptop ──▶ abadiops-kmb (Worker)
                 ├─ file PWA      ← pwa/kmb/  (salinan 1:1 mar-offline v91)
                 └─ POST ./api    ──▶ GAS KMB V2 (/exec) ──▶ spreadsheet KMB V2 (1ehnxDlv…)
```

Halaman web GAS KMB V2 (link kedua, menu lengkap) tetap di alamat GAS sampai dipindah 1:1. Lihat `docs/KEPUTUSAN.md`.

## Isi

| File | Isinya |
|---|---|
| `workers/kmb/wrangler.toml` | Nama Worker, akun kawanabadigrup (dikunci), folder PWA, alamat GAS KMB V2, saklar `gas` |
| `workers/kmb/src/index.js` | Menyajikan PWA dan meneruskan `/api` ke GAS. Kodenya sama dengan `workers/sum/src/index.js` |
| `pwa/kmb/` | PWA KMB V2 v91 apa adanya. Hanya empat baris yang diubah (lihat di bawah) |

### Yang diubah dari PWA lama (`mar-offline`, repo `mar-kmb-v2-offline`)

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 6 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 12 | `APP_VERSION = 'v91'` | `'v92'` |
| `sw.js` | 1 | `CACHE = 'mar-v91'` | `'mar-v92'` |
| `sw.js` | 25 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

File lainnya (`index.html`, `manifest.json`, kedua ikon) identik byte demi byte.
Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.

## Sudah diuji di laptop (`wrangler dev`, 28 Okt 2026)

- **Semua file PWA** tersaji 200 tanpa redirect.
- **Uji kembar jalur API** dengan token palsu, dikirim langsung ke GAS KMB V2 dan lewat Worker:
  - `ping`, `pull_my_wos`, dan `create_wo`: identik byte demi byte.
  - Token kosong dan body bukan JSON: identik, kecuali jam pencatatan.

  GAS hanya menolak token palsu itu. Tidak ada data yang dibaca atau ditulis.
- **Perilaku saat GAS tidak terjangkau** sama dengan rumah SUM (kodenya sama): Worker menjawab `GAS_TIDAK_TERJANGKAU` (502, teks biasa), sehingga PWA tetap menahan kiriman di antrean.

Belum diuji: versi yang sudah di-deploy, dan aksi dengan token sungguhan.

## Deploy ke alamat uji (Gabriel)

Memakai API token kawanabadigrup yang sama dengan rumah SUM (`abadiops-sum laptop Gabriel`). Token itu berlaku untuk semua Worker di akun kawanabadigrup.

```powershell
cd C:\dev\abadiops
git pull --rebase
cd workers\kmb
$env:CLOUDFLARE_API_TOKEN = "<token kawanabadigrup>"
npx wrangler deploy        # alamatnya: https://abadiops-kmb.kawanabadigrup.workers.dev
```

Cek sehatnya di `https://abadiops-kmb.kawanabadigrup.workers.dev/api/sehat`. Jawabannya harus `{"ok":true,"rumah":"kmb","saklar":"gas","jalur":"gas"}`.

## Uji dengan token sungguhan

1. Buka alamat uji, lalu masuk dengan token KMB V2 Anda. Token diketik manual.
2. Bandingkan berdampingan dengan PWA lama: profil, My Work, antrean approval, Monitoring, dan cakupan section (tyreman, field, workshop).
3. Uji aksi tulis dengan pekerjaan sungguhan yang memang perlu diproses. **Ini menulis ke GAS produksi**, persis sama seperti PWA lama. Hindari membuat WO palsu sampai approve L2.
4. Coba ketiga peran KMB V2: mechanic, supervisor, dan superintendent.

## Sebelum mekanik dipindah

- [ ] Uji dengan token sungguhan lulus untuk ketiga peran.
- [ ] Rumah KMB V2 tersambung ke pintu `abadiops.com` (dikerjakan bersama Raka).
- [ ] Tombol serah-terima token di PWA lama dan pembaca `#token=` di PWA baru sudah ada.
- [ ] Gabriel menyetujui hari pindah.
