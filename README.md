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
npm test          # uji rumus uang, tidak butuh basis data
npm run typecheck
```

Untuk basis data:

```bash
createdb kmb_project
psql kmb_project -f db/schema.sql
psql kmb_project -f db/seed.sql
export DATABASE_URL=postgres://localhost:5432/kmb_project
```

## Keadaan sekarang

| Tahap | Status |
|---|---|
| 1 · Skema + benih | ✅ berdiri |
| 2 · Lapisan bisnis (WO, approval, scoring) | 🔨 inti selesai, uji konkurensi belum |
| 3 · Web | belum |
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
