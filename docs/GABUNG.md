# Gabung ke MARProject

Panduan untuk orang yang baru pertama kali membuka repo ini. Ikuti dari atas ke
bawah sekali saja; sesudah itu Anda tidak perlu membukanya lagi.

---

## 1. Apa yang sedang Anda pegang

MARProject menghitung **upah insentif mekanik**. Angka yang keluar dari sistem
ini masuk ke slip gaji orang sungguhan, setiap bulan.

Pendahulunya — KMB V2, di Google Apps Script — sudah menggaji orang selama tiga
bulan berturut-turut tanpa salah. Itu ukuran yang harus kita samai sebelum
sistem ini boleh dipakai. Kita belum sampai di sana.

Dua kalimat mengikat seluruh rancangan, dan setiap keputusan teknis tunduk
padanya:

1. **Tidak boleh ada WO hilang.**
2. **Tidak boleh ada mekanik kurang bayar atau dibayar dua kali.**

Kalau sebuah perubahan mempercepat sesuatu tetapi membuat salah satu dari dua
kalimat itu mungkin dilanggar, perubahan itu ditolak. Tidak ada tawar-menawar
di titik ini.

---

## 2. Lima aturan yang tidak bisa ditawar

Kelimanya lahir dari kejadian yang benar-benar sudah terjadi, bukan dari
kehati-hatian teoretis.

### 2.1 Basis data pengembangan ada di porta **5433**, bukan 5432

Porta 5432 di mesin pemilik proyek dipakai hal lain dan terkunci sandi. Seluruh
repo ini menganggap **5433 = boleh dirusak, selain 5433 = jangan disentuh**.

Dua puluh dua skrip menolak berjalan kalau `DATABASE_URL` bukan 5433, dan
`npm test` menolak dua kali (di `tests/muat-env.ts` dan sekali lagi tepat
sebelum `TRUNCATE`). Itu bukan formalitas: uji integrasi **mengosongkan**
`work_orders`. Tanpa pagar itu, satu salah ketik mengosongkan basis data yang
dipakai orang.

Kalau Anda menambah skrip yang menulis ke basis data, ia **wajib** berpagar.
`tests/penjagaSkrip.test.ts` akan memerah kalau Anda lupa.

### 2.2 Repo `MAR-project` hanya boleh dibaca

Itu sistem KMB V2 yang **sedang hidup dan sedang menggaji orang** bulan ini.
Jangan menulis apa pun ke sana, jangan `clasp push`, jangan menyentuh
deployment-nya. Kita membaca darinya untuk meniru perilaku, itu saja.

### 2.3 Berkas `.xlsx` tidak pernah ikut git

`91626_1202.xlsx` dan `MARworkshop.xlsx` berisi **nama dan gaji karyawan
sungguhan**. `.gitignore` sudah menahan seluruh `*.xlsx`. Jangan pernah
melonggarkannya, jangan pernah `git add -f` berkas itu.

### 2.4 Sandi tidak pernah lewat baris perintah

PowerShell menyimpan tiap baris yang Anda ketik ke `ConsoleHost_history.txt` —
teks biasa, tanpa kedaluwarsa. Menempelkan alamat sambungan berisi sandi ke
sana berarti menuliskannya ke disk selamanya.

Pakai `.env.jauh` (bagian 6). Isi sekali lewat penyunting teks.

### 2.5 Token mekanik tidak boleh berganti tanpa sebab

Mekanik menghafal tokennya. Token yang berganti berarti seseorang berhenti bisa
bekerja di tengah shift. Token **tidak punya kedaluwarsa** dan **tidak pernah
berotasi sendiri** — itu disengaja, dan dijaga oleh `scripts/uji-token.ts`.

Kalau mekanik lupa tokennya, **jangan terbitkan yang baru**. Buka
Admin → Orang & Token dan salin yang sudah ada. Memang itu gunanya layar itu.

---

## 3. Menyiapkan mesin

Yang dibutuhkan: **Node 22+**, **PostgreSQL 18**, **Git**.

### 3.1 Basis data pengembangan di porta 5433

Instans **terpisah**, bukan Postgres yang mungkin sudah ada di mesin Anda.
Tanpa sandi, boleh dihapus kapan saja.

Sesuaikan dua baris pertama dengan mesin Anda sendiri:

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
DATA="$LOCALAPPDATA/marproject-pg"          # JANGAN di OneDrive — lihat catatan

# sekali saja
"$PGBIN/initdb.exe" -D "$DATA" -U postgres --auth=trust --encoding=UTF8

# tiap kali mau dipakai (lepas dari shell, supaya tidak ikut mati)
powershell -NoProfile -Command "Start-Process '$PGBIN/postgres.exe' \
  -ArgumentList '-D','$DATA','-p','5433' -WindowStyle Hidden"
```

> **Jangan taruh direktori data Postgres di OneDrive.** Sinkronisasi latar akan
> menyentuh berkas yang sedang ditulis mesin basis data dan merusaknya. Taruh di
> `AppData\Local`, yang tidak ikut tersinkron.

### 3.2 Repo dan skema

```bash
git clone https://github.com/gabrielrurent/MARProject.git
cd MARProject
npm install

copy .env.example .env        # isinya sudah menunjuk 5433, biarkan apa adanya

"$PGBIN/psql.exe" -U postgres -h 127.0.0.1 -p 5433 -d postgres \
  -c "CREATE DATABASE mar_project;"
"$PGBIN/psql.exe" -U postgres -h 127.0.0.1 -p 5433 -d mar_project \
  -v ON_ERROR_STOP=1 -f db/schema.sql -f db/seed.sql
npm run db:migrasi
```

> `db/seed.sql` bukan hiasan. Di dalamnya ada seluruh baris **kebijakan** —
> tenant, section, faktor, tarif, setelan, form detail ban. Tanpa itu basis data
> berdiri dengan 38 tabel kosong: tanpa tenant tidak ada yang bisa dibuat, tanpa
> `pay_rates` approve melempar, dan tanpa `factors` seluruh pengali poin
> diam-diam jatuh ke 1,0. Jangan lewati berkas kedua itu.

### 3.3 Membuktikan mesin Anda benar

```bash
npm run typecheck
npm test                      # 256 uji
```

Kalau `npm test` berkata `DITOLAK: uji integrasi menjalankan TRUNCATE`, berarti
`DATABASE_URL` Anda tidak menunjuk 5433. Itu pagar yang bekerja, bukan kerusakan.

Lalu isi data contoh dan jalankan:

```bash
npm run siap                  # isi 14 WO contoh, lalu tampilkan daftar token
npm run dev                   # http://localhost:3000
```

Salin salah satu token dari keluaran `npm run siap`, tempel di
`http://localhost:3000/masuk`.

> `npm test` **mengosongkan** `work_orders`. Kalau Anda baru menjalankannya,
> layar akan tampak kosong — isi ulang dengan `npm run siap` sebelum
> menyimpulkan ada yang rusak. Ini sudah beberapa kali disangka bug.

Ingin memastikan basis data kosong pun bisa berdiri dari nol?
`npm run uji:db-baru` membuat basis data baru, memasangnya, lalu membuangnya.
Itu **uji**, bukan pengisi data.

---

## 4. Alur kerja: cabang + PR

`master` dilindungi. Tidak ada yang push langsung ke sana, termasuk pemilik
proyek.

```bash
git switch -c nama-pekerjaan        # contoh: perbaiki-notifikasi-approver
# ... kerjakan ...
npm run typecheck && npm test       # wajib hijau sebelum push
git push -u origin nama-pekerjaan
```

Lalu buka Pull Request di GitHub. PR digabung sesudah dibaca orang kedua.

**Sebelum membuka PR, pastikan:**

- `npm run typecheck` bersih
- `npm test` hijau
- Uji skrip yang berhubungan dengan yang Anda sentuh juga hijau
  (`npm run uji:token`, `uji:admin`, `uji:surut`, dan seterusnya — daftarnya di
  `package.json`)
- Tidak ada `.env`, `.xlsx`, atau `.dump` yang ikut (`git status` harus bersih
  dari keempatnya)

---

## 5. Proses lima loop

Ini aturan pemilik proyek, dan berlaku untuk pekerjaan yang menyentuh perilaku
yang sudah dipakai orang lapangan:

1. **Baca sumbernya** — backend *dan* frontend KMB V2, bukan salah satu
2. **Periksa UI-nya secara khusus** — orang lapangan sudah hafal layar lama;
   layar baru harus 1:1, termasuk kata-katanya
3. **Baru menulis kode**
4. **Buktikan lewat uji yang menyebut PERILAKU**, bukan nama fungsi —
   `'kiriman luring yang di-flush dua kali hanya menghasilkan satu WO'`,
   bukan `'test flushOutbox()'`
5. **Periksa ulang terhadap temuan loop 1–2**, perbaiki yang ketemu, lalu
   laporkan apa yang ditemukan dan diperbaiki

Loop 5 bukan basa-basi. Empat bug dengan bentuk yang sama pernah lolos di repo
ini dalam satu hari — semuanya "ditulis, tidak pernah dipanggil, gagal tanpa
bersuara". Tidak ada galat di mana pun, jadi tidak ada yang curiga. Yang
menemukannya adalah loop 5, bukan uji.

---

## 6. Menyentuh basis data yang dipakai orang

Anda punya akses penuh. Karena itu bagian ini penting.

### 6.1 Dapatkan akun sendiri, jangan pinjam

- **Vercel** — minta diundang ke proyek MARProject dengan akun Anda sendiri
- **Supabase** — minta diundang ke organisasinya dengan akun Anda sendiri

Jangan memakai login orang lain. Kalau nanti ada yang perlu ditelusuri, jejaknya
harus menunjuk orang yang benar.

### 6.2 `.env.jauh` — membaca produksi dari laptop

```bash
copy .env.jauh.example .env.jauh
notepad .env.jauh          # isi DATABASE_URL dari Vercel → Settings → Env Vars
```

Atau, lebih bersih, tanpa nilainya pernah muncul di layar:

```bash
npx vercel login
npx vercel link
npx vercel env pull .env.jauh --environment=production
```

Lalu:

```bash
npm run orang   -- --jauh      # daftar orang + token (read-only)
npm run periksa -- --jauh      # periksa keadaan (read-only)
```

`.env.jauh` tidak ikut git. Jangan pernah mengirimkannya lewat chat.

### 6.3 `--jauh` tidak membuka kunci apa pun

Pagar memeriksa **isi** `DATABASE_URL`, bukan dari mana ia datang.
`buat-token.ts --jauh` tetap ditolak — ia masih menuntut `--izinkan-luar` juga.
Dua bendera tegas untuk satu perbuatan berat.

### 6.4 Porta menentukan sifat sambungan

| Porta | Mode | Untuk |
|---|---|---|
| `6543` | transaksi | aplikasi, `orang`, `periksa` |
| `5432` | sesi | `pg_dump`, DDL, `npm run db:cadangkan` |

`npm run db:cadangkan` **menolak** 6543 — `pg_dump` butuh koneksi yang dipegang
utuh. Kalau mencadangkan, pakai alamat yang sama dengan porta 5432.

### 6.5 Mengganti token orang di produksi

Lewat **Admin → Orang & Token → Ganti token**, tidak lewat skrip. Layar itu
mencatat siapa yang menekannya di `audit_logs`; skrip tidak mencatat apa pun.

---

## 7. Peta singkat

```
src/
  lib/db.ts            kolam koneksi, konversi numeric, identitas RLS
  domain/
    scoring.ts         rumus poin & rupiah — murni, tanpa basis data
    runCommand.ts      SATU pintu untuk tiap tulis: idempoten, satu transaksi
    approval.ts        approve L1/L2 — tempat rupiah dibekukan
  app/                 layar Next.js (App Router)
  pwa/                 outbox IndexedDB, pintu kirim, deteksi daring
public/sw.js           service worker, ditulis tangan
db/schema.sql          skema; tiap constraint menjawab satu insiden nyata
db/migrasi/            migrasi bernomor, dijalankan `npm run db:migrasi`
scripts/               perkakas + 21 berkas uji ujung-ke-ujung
tests/                 vitest — 256 uji
docs/PETA-KMB-V2.md    peta sistem lama: peran, siklus WO, 35 insiden
docs/ARSITEKTUR.md     bentuk target dan alasan tiap pilihan teknis
docs/SERAH-TERIMA.md   keadaan terkini, jebakan yang sudah memakan waktu
```

Kalau Anda hanya sempat membaca satu dokumen lain, baca
[PETA-KMB-V2.md](PETA-KMB-V2.md). Tiga puluh lima insiden di dalamnya
menjelaskan kenapa repo ini berbentuk seperti sekarang.
