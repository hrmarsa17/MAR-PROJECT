# KMB Project

Sistem work order & insentif mekanik. Pengganti KMB V2 (Google Apps Script +
Google Sheets), dibangun di atas PostgreSQL.

Proses bisnis dan cara memilih job mengikuti KMB V2. Yang berbeda: **unit dan
daftar job diisi sendiri oleh pemilik produk**, dan seluruh penjagaan yang di
KMB V2 ditulis tangan di JavaScript kini ditegakkan oleh basis data.

## Dua kalimat yang mengikat seluruh rancangan

1. **Tidak boleh ada WO hilang.**
2. **Tidak boleh ada mekanik kurang bayar atau dibayar dua kali.**

Setiap keputusan teknis di repo ini tunduk pada dua kalimat itu, dan setiap
constraint di `db/schema.sql` menjawab satu kegagalan yang benar-benar pernah
terjadi di KMB V2.

## Dokumen

| Berkas | Isi |
|---|---|
| [docs/PETA-KMB-V2.md](docs/PETA-KMB-V2.md) | Peta lengkap sistem lama: peran, siklus WO, anti-ganda, jalur uang, katalog, offline, 35 insiden |
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Bentuk target, pilihan teknis beserta alasannya, pola jalur tulis |
| [db/schema.sql](db/schema.sql) | Skema Postgres |
| [db/seed.sql](db/seed.sql) | Section, faktor, tarif, form detail — kerangka, bukan isi |

## Susunan

```
src/
  lib/
    db.ts            kolam koneksi, konversi numeric, identitas RLS
    errors.ts        galat yang punya KODE, bukan hanya kalimat
  domain/
    scoring.ts       rumus poin & rupiah — murni, tanpa basis data
    nilaiEfektif.ts  resolusi override → angka yang benar-benar dipakai
    runCommand.ts    satu pintu untuk setiap tulis: idempoten, satu transaksi
    workOrder.ts     pembuatan WO
    approval.ts      approve L1/L2, pembatalan — tempat rupiah terbit
tests/
  scoring.test.ts    uji rumus uang
```

## Menjalankan

```bash
npm install
npm test          # 28 uji: rumus uang + invarian basis data
npm run typecheck
npm run dev       # http://localhost:3000
```

Untuk masuk, terbitkan token dulu:

```bash
npm run token -- UJI-L2      # tampil sekali, hanya hash-nya yang tersimpan
```

Uji asap lewat HTTP (server harus sudah jalan):

```bash
npx tsx scripts/uji-alur.ts <token_L1> <token_L2> http://127.0.0.1:3000
```

### Basis data pengembangan

Instans **terpisah** di port 5433, bukan Postgres yang mungkin sudah kamu pakai
di 5432. Tanpa kata sandi, boleh dihapus kapan saja.

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
DATA="/c/Users/gabri/AppData/Local/kmbproject-pg"

# sekali saja
"$PGBIN/initdb.exe" -D "$DATA" -U postgres --auth=trust --encoding=UTF8

# tiap kali mau dipakai (lepas dari shell, supaya tak ikut mati)
powershell -NoProfile -Command "Start-Process '$PGBIN/postgres.exe' \
  -ArgumentList '-D','$DATA','-p','5433' -WindowStyle Hidden"

# pasang skema
"$PGBIN/psql.exe" -U postgres -h 127.0.0.1 -p 5433 -d postgres \
  -c "CREATE DATABASE mar_project;"
"$PGBIN/psql.exe" -U postgres -h 127.0.0.1 -p 5433 -d mar_project \
  -v ON_ERROR_STOP=1 -f db/schema.sql -f db/seed.sql
```

> **Jangan taruh direktori data Postgres di OneDrive.** Sinkronisasi latar akan
> menyentuh berkas yang sedang ditulis mesin basis data dan merusaknya. Karena
> itu ia di `AppData\Local`, yang tidak ikut tersinkron.

Sambungan dibaca dari `.env` (lihat `.env.example`).

## Keadaan sekarang

| Tahap | Status |
|---|---|
| 1 · Skema + benih | ✅ berdiri, 37 tabel |
| 2 · Lapisan bisnis (WO, approval, scoring) | ✅ 28 uji lulus, termasuk konkurensi |
| 3 · Web | 🔨 masuk, buat WO, approval L1/L2 jalan; override & tolak belum |
| 4 · PWA offline | belum |
| 5 · Dashboard, payroll, koreksi meter | belum |
| 6 · Layar admin katalog | belum |
| 7 · Pengerasan | belum |

Layar tidak dibangun sebelum tahap 1-2 punya uji otomatis yang lulus — termasuk
uji dua approver menekan bersamaan, dan uji kiriman terulang sepuluh kali.

## Yang masih ditunggu dari pemilik produk

1. Daftar unit & joblist (struktur cascade sudah siap menerima)
2. Apakah rasio poin ÷ jam adalah aturan resmi, atau kebetulan pola lama
3. Peran foreman — belum pernah ada di KMB V2
4. Multi-tenant: satu basis data untuk beberapa plant, atau terpisah
