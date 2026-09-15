# ARSITEKTUR KMB PROJECT

> Rancangan target. Setiap keputusan di sini menjawab satu kegagalan nyata yang
> tercatat di [PETA-KMB-V2.md](PETA-KMB-V2.md). Tidak ada komponen yang dipilih
> karena sedang populer.

---

## 1. BENTUK SISTEM

```
┌──────────────────────┐        ┌──────────────────────┐
│  PWA (HP mekanik)    │        │  WEB (approver/mgr)  │
│  offline-first       │        │  lengkap, online     │
│  outbox + IndexedDB  │        │  dashboard, payroll  │
└──────────┬───────────┘        └──────────┬───────────┘
           │                                │
           └───────────┬────────────────────┘
                       ▼
          ┌─────────────────────────────┐
          │   SATU LAPIS LOGIKA BISNIS  │   ← tidak ada salinan kedua
          │   (TypeScript, server)      │
          └──────────────┬──────────────┘
                         ▼
          ┌─────────────────────────────┐
          │      PostgreSQL             │
          │  transaksi · constraint ·   │
          │  sequence · RLS             │
          └─────────────────────────────┘
```

**Satu aplikasi, dua permukaan.** PWA dan Web adalah dua rute dalam satu proyek,
memakai **fungsi bisnis yang sama persis**. Ini bukan pilihan gaya — di KMB V2,
logika yang digandakan antara `WorkOrder.html` dan `app.js` PWA melahirkan
sederet bug yang hanya muncul di salah satu sisi (`isiDropdownUnit` ditandai
"KEMBAR — kalau salah satu diubah, ubah keduanya", `WorkOrder.html:494-496`).

---

## 2. PILIHAN TEKNIS

| Lapis | Pilihan | Alasan yang mengikat |
|---|---|---|
| Basis data | **PostgreSQL** (Supabase) | Transaksi, `UNIQUE`, FK, sequence, enum — semua penjaga yang di GAS ditulis tangan |
| Backend | **Next.js (App Router) + TypeScript** | Satu proyek melayani web & PWA; logika bisnis di server, bukan di dua klien |
| Akses data | **Drizzle ORM** + SQL langsung untuk jalur uang | Skema sebagai kode, migrasi terversi; jalur uang ditulis SQL eksplisit agar terbaca |
| Validasi | **Zod**, satu skema dipakai web **dan** API | Menutup bug "field hilang senyap karena daftar putih disalin manual" |
| Antrean offline | **IndexedDB** (`idb`) + Web Locks | Satu pengosong antrean; urutan sama di halaman dan service worker |
| Autentikasi | Token per orang, **disimpan ter-hash** | Mempertahankan pengalaman "ketik token sekali", menghapus token telanjang dari layar Monitoring |

**Yang sengaja TIDAK dipakai:**
- **Expo/React Native** — ScannerFinance memakainya karena butuh kamera & aplikasi toko. KMB butuh keandalan offline di browser HP yang sudah terpasang; PWA lebih murah dan tidak menuntut instal ulang.
- **Edge Function untuk jalur uang** — jalur uang butuh transaksi panjang ke Postgres, bukan eksekusi pendek terdistribusi.

---

## 3. ATURAN YANG DITEGAKKAN MESIN, BUKAN DISIPLIN

Ini inti perbedaan dengan GAS. Setiap baris di bawah menggantikan penjagaan yang
di KMB V2 bergantung pada seseorang mengingat.

| Aturan | Ditegakkan oleh |
|---|---|
| Satu WO satu nomor | `UNIQUE(tenant_id, wo_number)` + sequence |
| Satu (WO, mekanik) satu baris poin | `UNIQUE(work_order_id, mechanic_id)` |
| Satu WO satu snapshot | `UNIQUE(work_order_id)` |
| Kiriman terulang tidak menggandakan apa pun | `UNIQUE(idempotency_key)` + `ON CONFLICT DO NOTHING RETURNING` |
| Approve tidak bisa direbut dua orang | `UPDATE … WHERE status = $harapan RETURNING` |
| Poin terbit **bersama** status approved, atau tidak sama sekali | satu transaksi |
| Transisi status ilegal | enum + trigger |
| Rate jabatan tidak pernah jatuh ke angka cadangan | FK `NOT NULL` ke `pay_rates` |
| Model unit tidak pernah gagal cocok karena spasi | FK, bukan perbandingan teks |
| Section ganda tidak menghilangkan orang | relasi, bukan string koma |
| Rupiah tidak pernah berbeda antara dashboard dan payroll | kolom turunan dari poin × rate tersimpan |
| Siapa boleh apa | RLS + pemeriksaan di lapisan data, bukan di lapisan halaman |

---

## 4. JALUR TULIS — satu pola untuk semua

Setiap perubahan data melewati pola yang sama. Tidak ada jalan pintas, termasuk
untuk aksi yang "kelihatannya ringan".

```ts
async function jalankanPerintah(perintah, idempotencyKey, aktor) {
  return db.transaction(async (tx) => {
    // 1. Struk: pernah dikerjakan?  → kembalikan hasil lama, jangan ulangi
    const lama = await tx.select().from(processedOps).where(eq(processedOps.key, idempotencyKey));
    if (lama.length) return lama[0].result;

    // 2. Rebut keadaan secara atomik (bukan baca-lalu-tulis)
    const wo = await tx.update(workOrders)
      .set({ status: perintah.statusBaru })
      .where(and(eq(workOrders.id, perintah.woId), eq(workOrders.status, perintah.statusDiharapkan)))
      .returning();
    if (!wo.length) throw new KonflikKeadaan();   // orang lain sudah memprosesnya

    // 3. Efek samping — di transaksi yang SAMA
    //    (poin, snapshot, audit, arsip)

    // 4. Simpan struk HANYA bila sampai sini
    await tx.insert(processedOps).values({ key: idempotencyKey, result });
    return result;
  });
}
```

Empat sifat yang lahir dari pola ini:

1. **Retry aman.** Klien boleh mengirim ulang berapa kali pun.
2. **Tidak ada keadaan setengah jadi.** Status berubah tanpa poin terbit adalah hal yang tidak mungkin, sehingga "mode lanjutan" KMB V2 tidak perlu ada.
3. **Kegagalan tidak dicatat sebagai sukses.** Struk hanya ditulis pada jalur berhasil — persis pelajaran `ApiService.js:821-826`.
4. **Konflik punya nama.** `KonflikKeadaan` dikembalikan sebagai konflik yang bisa dijelaskan ke pengguna ("WO ini sudah disetujui approver lain"), bukan galat teknis yang harus diterjemahkan ulang di klien.

---

## 5. OFFLINE — kontrak antara HP dan server

### Di HP

```
aksi ditekan
   └─▶ tulis ke outbox (op_id lahir di sini, sekali seumur hidup)
          └─▶ coba kirim sekarang
                 ├─ berhasil        → tandai selesai, simpan struk
                 ├─ ditolak server  → tandai gagal, TAMPILKAN, jangan hapus
                 └─ tak ada sinyal  → biarkan mengantre
```

Aturan keras:

- Satu pengosong antrean pada satu waktu — **Web Locks**, bukan harapan.
- Urutan kirim: `created_at` lalu `seq`. **Sama persis di halaman dan service worker.**
- `op_id` tak pernah berubah, termasuk saat "Coba lagi".
- Entri dibuang **hanya** atas bukti positif atau perintah pengguna.
- **Logout tidak menghapus antrean.** Bila masih ada yang belum terkirim, logout ditahan dengan penjelasan.
- Setiap entri membawa identitas pembuatnya.
- Umur entri dibatasi **lebih pendek** dari retensi struk di server.
- Penyimpanan diminta persisten; kalau ditolak browser, pengguna diberi tahu.

### Di server

- Setiap tulis wajib `idempotency_key`; tanpa itu ditolak.
- Struk disimpan **sebelum** balasan dikirim.
- Perintah membawa `status_diharapkan` sehingga perintah basi ditolak sebagai **konflik**, bukan galat.

---

## 6. PWA vs WEB — pembagian yang disengaja

| | PWA (HP) | Web |
|---|:---:|:---:|
| Buat WO (termasuk grup) | ✅ | ✅ |
| Kerjakan, timer, submit | ✅ | ✅ |
| Approve L1 / L2, tolak, kembalikan | ✅ | ✅ |
| Override (poin, jam, tim, **unit**, kondisi, judgment) | ✅ | ✅ |
| Transfer WO | ✅ | ✅ |
| Bekerja tanpa sinyal | ✅ | ❌ |
| Dashboard performa & leaderboard | ringkas | ✅ penuh |
| Dashboard teknis (ban, PA/MTTR/MTBF) | ❌ | ✅ |
| Ekspor payroll | ❌ | ✅ |
| Koreksi HM/KM | ❌ | ✅ |
| Kelola katalog, unit, mekanik, rate | ❌ | ✅ |

**Paritas wajib:** semua yang menyentuh WO dan uang ada di kedua sisi. Yang hanya
di web adalah hal yang butuh layar lebar, bukan hal yang menghambat pekerjaan
lapangan.

**Naik dari KMB V2:** kelola katalog/unit/mekanik/rate lewat layar — di V2
semuanya hanya bisa lewat spreadsheet dan fungsi editor. Ini prasyarat agar
pemilik produk bisa mengisi unit dan joblist barunya sendiri.

---

## 7. URUTAN PEMBANGUNAN

| Tahap | Isi | Selesai bila |
|---|---|---|
| **1** | Skema database + migrasi + data benih | Skema berdiri, constraint terbukti menolak yang salah |
| **2** | Lapisan bisnis: WO, approval, scoring, transfer | Uji otomatis: dua approve bersamaan → satu hasil; retry 10× → satu WO |
| **3** | Web: buat WO, approval, override | Satu WO bisa berjalan dari dibuat sampai approved |
| **4** | PWA: shell offline, outbox, timer, sinkron | Mode pesawat → aksi → sinyal → data mendarat tepat sekali |
| **5** | Dashboard, payroll, koreksi meter | Angka cocok dengan definisi di peta §8 |
| **6** | Layar admin katalog/unit/rate | Pemilik produk mengisi joblist sendiri tanpa menyentuh kode |
| **7** | Pengerasan | Uji beban, uji token dicabut, uji antrean tua |

Tahap 1-2 adalah pondasi uang. Tidak ada layar yang dibangun sebelum keduanya
punya uji otomatis yang lulus.

---

## 8. YANG TIDAK DIBAWA DARI KMB V2

| Ditinggalkan | Alasan |
|---|---|
| `PointsCalculation.js` | Nol pemanggil hidup, rumus usang (kunci rate berbeda) |
| `OthersJobService.js` + `OthersJobRequests` | Nol pemanggil klien; alurnya tidak pernah hidup |
| Workflow A (`created`, `wait_mtbf`, `startWorkOrder`, `finishWorkOrder`, `MtbfTracking`) | Mati di seluruh UI |
| `superintendentOverrideAll()`, `overrideFactor()` | Nol pemanggil; meninggalkan dua kolom yatim |
| `is_lead` | Tak pernah bernilai `true` lewat jalur produksi mana pun |
| Sheet arsip terpisah | Satu tabel + index; arsip ada karena sheet panas harus kecil |
| `ProcessedOps` sebagai sheet + pemangkasan manual | `UNIQUE` + `DELETE … WHERE created_at < …` |
| Buku Kiriman (`_KirimanWeb.js`) | Digantikan idempotency key di transaksi yang sama |
| Cache config berumur 5-10 menit | Ada karena batas CacheService, bukan karena kebutuhan |
| Token telanjang di layar Monitoring | Diganti tombol "Reset token" |

Ini bukan penilaian bahwa kerja itu sia-sia. Sebagian besar pengerasan KMB V2
adalah basis data yang ditulis tangan di atas platform yang tidak punya
transaksi. Pindah stack berarti berhenti **memeliharanya**, bukan berhenti
membutuhkannya.
