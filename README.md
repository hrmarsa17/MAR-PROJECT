# MARProject

[![uji](https://github.com/gabrielrurent/MARProject/actions/workflows/uji.yml/badge.svg)](https://github.com/gabrielrurent/MARProject/actions/workflows/uji.yml)

Sistem work order & insentif mekanik, di atas PostgreSQL + TypeScript + Next.js.

Pengganti **KMB V2** (Google Apps Script + Google Sheets), yang sudah menggaji
orang tiga bulan berturut-turut. Itu ukuran keandalan yang harus disamai sebelum
sistem ini boleh menggantikannya.

> **KMB adalah nama *tenant*, bukan nama produk.** Skemanya multi-tenant sejak
> awal — 13 constraint `UNIQUE (tenant_id, …)`. SUM V2 menyusul sebagai tenant
> kedua; karena itu repo ini bernama MARProject, bukan KMBProject.

## Dua kalimat yang mengikat seluruh rancangan

1. **Tidak boleh ada WO hilang.**
2. **Tidak boleh ada mekanik kurang bayar atau dibayar dua kali.**

Setiap keputusan teknis di repo ini tunduk pada dua kalimat itu, dan setiap
constraint di `db/schema.sql` menjawab satu kegagalan yang benar-benar pernah
terjadi di KMB V2.

## Baru di sini?

→ **[docs/GABUNG.md](docs/GABUNG.md)** — dari nol sampai bisa menjalankan uji.
Ikuti sekali, lalu tidak perlu dibuka lagi.

Di dalamnya ada lima aturan yang tidak bisa ditawar. Yang paling sering
menggigit: **basis data pengembangan ada di porta 5433, bukan 5432.** Uji
integrasi menjalankan `TRUNCATE work_orders`, dan pagar 5433 itulah yang
memisahkannya dari basis data yang dipakai menggaji orang.

## Dokumen

| Berkas | Isi |
|---|---|
| [docs/GABUNG.md](docs/GABUNG.md) | Pemasangan dari nol, aturan, alur cabang + PR |
| [docs/PETA-KMB-V2.md](docs/PETA-KMB-V2.md) | Peta sistem lama: peran, siklus WO, anti-ganda, jalur uang, katalog, offline, 35 insiden |
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Bentuk target, pilihan teknis beserta alasannya |
| [docs/SERAH-TERIMA.md](docs/SERAH-TERIMA.md) | Keadaan terkini, jebakan yang sudah memakan waktu |
| [docs/PENERAPAN.md](docs/PENERAPAN.md) | Penerapan Docker mandiri |
| [docs/CADANGAN.md](docs/CADANGAN.md) | Pencadangan dan pemulihan |
| [db/schema.sql](db/schema.sql) | Skema Postgres, 37 tabel |

## Susunan

```
src/
  lib/db.ts            kolam koneksi, konversi numeric, identitas RLS
  domain/
    scoring.ts         rumus poin & rupiah — murni, tanpa basis data
    nilaiEfektif.ts    resolusi override → angka yang benar-benar dipakai
    runCommand.ts      SATU pintu untuk tiap tulis: idempoten, satu transaksi
    workOrder.ts       pembuatan WO
    approval.ts        approve L1/L2, pembatalan — tempat rupiah dibekukan
  app/                 layar Next.js (App Router) + /lapangan untuk PWA
  pwa/                 outbox IndexedDB, pintu kirim, deteksi daring
public/sw.js           service worker, ditulis tangan
db/migrasi/            migrasi bernomor
scripts/               perkakas + 21 berkas uji ujung-ke-ujung
tests/                 vitest — 256 uji
```

## Menjalankan

```bash
npm install
npm test            # 256 uji: rumus uang, invarian basis data, outbox luring
npm run typecheck
npm run siap        # isi data contoh, lalu tampilkan token untuk masuk
npm run dev         # http://localhost:3000
```

Pemasangan basis data pengembangan ada di [docs/GABUNG.md](docs/GABUNG.md#3-menyiapkan-mesin).

> **Token disimpan terbaca, bukan hash.** Itu keputusan sadar: mekanik yang lupa
> tokennya harus bisa dibukakan lagi tanpa menggantinya, karena token yang
> berganti berarti orang berhenti bisa bekerja di tengah shift. Alasan lengkapnya
> ada di `db/schema.sql` pada tabel `api_tokens`.

## Sudah tayang atau belum

Dua tempat menjawabnya, keduanya tanpa akun Vercel:

| | |
|---|---|
| `/api/sehat` | `{"ok":true,…,"komit":"0cecba8"}` — commit yang **sedang** tayang. Terbuka, tanpa login. Cocokkan dengan `git log --oneline -1`. |
| `/penerapan` | Riwayat: apa saja yang pernah tayang, dari siapa, sejak jam berapa. Perlu login, peran apa pun. |

Commit yang sudah ada di GitHub **belum tentu** tayang — ia bisa masih dibangun,
gagal dibangun, atau di-rollback. Yang membedakannya hanya baris di `/penerapan`,
dan baris itu lahir dari permintaan yang sungguhan dilayani.

Sengaja **tidak** ada di menu: menu harus 1:1 dengan KMB V2, dan layar ini tidak
ada di sana. Ia untuk yang menulis kode, bukan untuk orang lapangan.

## Keadaan sekarang

| Tahap | Status |
|---|---|
| 1 · Skema + benih | ✅ 37 tabel, 9 migrasi |
| 2 · Lapisan bisnis (WO, approval, scoring) | ✅ termasuk uji konkurensi & idempotensi |
| 3 · Web | ✅ 11 layar |
| 4 · PWA luring | ✅ terbangun — **menunggu uji di HP sungguhan** |
| 5 · Dashboard, payroll, koreksi meter | ✅ `/performa`, `/reports`, `/koreksi` |
| 6 · Layar admin katalog | ✅ `/admin` |
| 7 · Pengerasan | 🔨 pagar skrip, cadangan, pemantauan sudah; uji balik belum |

Produksi berdiri di Vercel + Supabase (Singapura) dan sudah dilalui ujung ke
ujung, tetapi masih kosong: 0 work order, satu akun. Dua puluh empat orang
menyusul saat go-live.

## Yang belum selesai

1. **Uji PWA di HP sungguhan** — tiga hal belum terbukti: bilah alamat tidak
   muncul saat berpindah tab secara luring, notifikasi approver, dan keluar lalu
   masuk sebagai orang lain tidak mengirim antrean orang pertama
2. **Uji balik / jalan paralel** — menarik input GAS KMB V2 yang masih hidup ke
   sini, supaya keandalannya terbukti sebelum berpindah
3. **Penggabungan SUM V2** sebagai tenant kedua — 27 titik `code = 'KMB'` yang
   masih ditulis keras di skrip, benih, migrasi, dan uji
4. **RLS belum menjaga apa pun hari ini** — begitu SUM masuk, satu filter
   `tenant_id` yang terlewat menjadi kebocoran antar-tenant
