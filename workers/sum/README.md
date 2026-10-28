# Rumah SUM V2: Worker `abadiops-sum`

Rumah: `sum` · Pemegang: Gabriel · Tahap 3 (Pintu) · Saklar: `gas`

Worker ini membuat SUM V2 bisa dipakai lewat Cloudflare dengan **fungsi lengkap**: masuk, buat WO, kirim kerja, approve L1/L2, transfer, cancel, monitoring, dan lainnya.
Semua pekerjaannya tetap dilakukan **GAS SUM**. Worker hanya meneruskan setiap panggilan apa adanya. Belum ada satu pun aksi yang dilayani Supabase.

```
HP / laptop ──▶ abadiops-sum (Worker)
                 ├─ file PWA      ← pwa/sum/  (salinan 1:1 mar-sum-offline v45)
                 └─ POST ./api    ──▶ GAS SUM (/exec) ──▶ spreadsheet SUM V2
```

## Isi

| File | Isinya |
|---|---|
| `workers/sum/wrangler.toml` | Nama Worker, folder PWA, alamat GAS SUM, saklar `gas` |
| `workers/sum/src/index.js` | Menyajikan PWA dan meneruskan `/api` ke GAS. Tidak ada logika bisnis |
| `pwa/sum/` | PWA SUM v45 apa adanya. Hanya empat baris yang diubah (lihat di bawah) |

### Yang diubah dari PWA lama

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 8 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 9 | `APP_VERSION = 'sum-v45'` | `'sum-v46'` |
| `sw.js` | 1 | `CACHE = 'mar-sum-v45'` | `'mar-sum-v46'` |
| `sw.js` | 20 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.

## Sudah diuji di laptop (`wrangler dev`, 28 Okt 2026)

- **Semua file PWA** tersaji 200 tanpa redirect: `/`, `/index.html`, `/sw.js`, `/app.js`, `/manifest.json`, ikon, dan foto.
- **Uji kembar jalur API**: permintaan yang sama dikirim langsung ke GAS SUM dan lewat Worker.
  - `ping` dan `create_wo` dengan token palsu: identik byte demi byte.
  - Token kosong dan body bukan JSON: identik, kecuali jam pencatatan di jawaban GAS.

  Uji ini memakai token palsu, sehingga GAS hanya menolak. Tidak ada data yang dibaca atau ditulis.
- **GAS tidak terjangkau**: Worker menjawab `GAS_TIDAK_TERJANGKAU` (502, teks biasa). PWA menganggapnya koneksi putus, sehingga kiriman tetap di antrean dan dikirim ulang otomatis, sama seperti sekarang.

**Versi tayang** (`https://abadiops-sum.kawanabadigrup.workers.dev`, di-deploy 28 Okt 2026): uji kembar yang sama lulus, dan semua file PWA tersaji 200 tanpa redirect.

Belum diuji: aksi dengan token sungguhan (perlu Gabriel).

## Deploy ke alamat uji (Gabriel)

Laptop Gabriel juga dipakai untuk Rembes, yang login wrangler-nya memakai akun Cloudflare **pribadi**. Supaya dua akun itu tidak tercampur, deploy Abadi Operation memakai **API token** kawanabadigrup, bukan `wrangler login`. Login Rembes tidak disentuh.

`wrangler.toml` juga mengunci `account_id` kawanabadigrup. Kalau yang aktif ternyata akun lain, deploy akan ditolak, bukan dikirim ke akun yang salah.

**Membuat API token (sekali saja):**
1. Di dash.cloudflare.com, login sebagai kawanabadigrup, lalu buka ikon profil → **My Profile → API Tokens → Create Token**.
2. Pilih template **Edit Cloudflare Workers**.
3. Di **Account Resources**, pilih akun kawanabadigrup. Di **Zone Resources**, pilih zona `abadiops.com`.
4. Klik **Continue to summary → Create Token**, lalu salin tokennya. Token hanya ditampilkan sekali. Simpan di password manager, jangan di chat atau di repo.

**Deploy**, di PowerShell:

```powershell
cd C:\dev\abadiops\workers\sum
$env:CLOUDFLARE_API_TOKEN = "<token kawanabadigrup>"   # hanya berlaku di jendela PowerShell ini
npx wrangler deploy                                     # mencetak alamat https://abadiops-sum.<subdomain>.workers.dev
```

Kelak CI memakai token yang sama, disimpan sebagai GitHub Actions secret `CLOUDFLARE_API_TOKEN`.

Cek sehatnya di `https://abadiops-sum.<subdomain>.workers.dev/api/sehat`. Jawabannya harus `{"ok":true,"rumah":"sum","saklar":"gas","jalur":"gas"}`.

Untuk sementara deploy dilakukan dari laptop karena CI untuk Cloudflare belum ada. Alamat `workers.dev` hanya untuk uji, belum dipakai mekanik.

## Uji dengan token sungguhan

1. Buka alamat uji di HP atau laptop, lalu masuk dengan token SUM Anda sendiri. Token diketik manual, karena tombol serah-terima token belum dibuat.
2. Cek bahwa profil, daftar WO, monitoring, dan antrean approval tampil sama dengan PWA lama.
3. Buat satu WO uji, lalu proses seperti biasa. **Ini menulis ke GAS produksi**, persis sama seperti memakai PWA lama.
4. Cocokkan dengan PWA lama atau spreadsheet. Hasilnya harus sama persis.

## Sebelum mekanik dipindah

- [ ] Uji dengan token sungguhan lulus, untuk peran mekanik, foreman, foreman_approver, supervisor, dan superintendent.
- [ ] Rumah SUM tersambung ke pintu `abadiops.com`. Saat ini alamat itu menyajikan portal KMB Project milik Raka, jadi penyambungan pintu dikerjakan bersama Raka.
- [ ] Tombol serah-terima token di PWA lama dan pembaca `#token=` di PWA baru sudah ada, supaya mekanik tidak perlu mengetik token.
- [ ] Gabriel menyetujui hari pindah.
