# Siap menekan "Mulai migrasi" — daftar periksa

Disusun 15 Nov 2026 siang (Claude, atas penyerahan keputusan oleh Gabriel). Urutan rumah: **BUPR → KMB Projek → KMB V2 → SUM**
(`docs/SAKLAR.md`). Daftar ini untuk rumah pertama, **BUPR**; rumah berikutnya mengulang langkah yang ditandai *per rumah*.

## Sudah siap (branch `staging`, sudah di GitHub)

| Bagian | Bukti |
|---|---|
| Kode GAS asli berjalan di Worker, 1:1 | ruang uji Gedung 1: baca 66/286/468/672, web 27/27/27/45, tulis 4/4 + seluruh sheet sama, pemicu 11/11 |
| Payroll XLSX dari abadiops | identik sel demi sel dengan berkas GAS (KMB V2 16 Sep–15 Okt, KMB Projek 26 Sep–25 Okt); Worker staging keempat rumah sukses |
| Rumus config dihitung ulang | mesin rumus cocok 1.533/1.533 dengan Google Sheets; uji pusat admin 7/7 |
| Prosedur Mulai/Kembali produksi | 7 langkah, gagal selalu ke posisi aman; uji langkah 12/12, uji prosedur staging 18/18 |
| Kunci sinkron maju (15 Nov siang) | sinkron per jam tidak bisa menimpa sinkron terakhir maupun tulisan Worker; SQL terpasang di Gedung 1 (uji 16/16), uji ujung ke ujung BUPR 7/7; **kodenya baru di `staging`** (lihat langkah 1) |
| Sinkron terakhir lewat pelaksana GitHub | pelaksana terjadwal dari `main` (15 Nov 10.51 WIB): permintaan #6 BUPR diambil putaran pertama, selesai 2 menit 21 detik, 24/24 sheet sama |
| Cermin balik (jalan kembali ke GAS) | uji kering ke spreadsheet BUPR asli 24/24 sama; 8 uji spreadsheet tiruan |
| Tambalan tutup GAS | keempat rumah: HEAD identik dengan versi ter-deploy, uji logika 14/14; **belum dikirim** |
| Kesehatan cermin | 0 selisih: BUPR 3 hari, lainnya 2 hari (syarat 7 hari) |

## Yang harus Gabriel lakukan (sekali, sebelum BUPR)

Langkah 1, 3, dan 7 cukup "ya" di chat; Claude yang mengerjakan. Langkah 2, 5, dan 6 butuh tangan Gabriel (dasbor
Supabase, berbagi spreadsheet); langkah 4 keduanya ("ya" untuk push, lalu Deploy dari editor GAS). Pengaman otomatis
sesi Claude menolak push ke `main` dan `clasp push` tanpa persetujuan langsung Anda, dan itu memang benar: keduanya
mengubah sistem yang dipakai orang.

1. **Gabung `staging` → `main`.** **Sudah 15 Nov 10.03 WIB** ("ya push main"): `main` = `6daefcd`, CI `uji` hijau;
   pelaksana `peralihan.yml` dan sinkron per jam (kini dengan AuditLogs) berjalan dari `main`. Tidak ada deploy
   otomatis: semua Worker di-deploy manual. **Perlu sekali lagi sebelum 19 Nov:** perbaikan kunci sinkron maju
   (BUG-DICATAT #43) baru ada di `staging`, sedangkan sinkron per jam dan pelaksana berjalan dari `main`. Cukup "ya,
   push main" lagi.
2. **Kunci Supabase produksi.** **Kunci sudah ada (15 Nov 11.01 WIB):** `SUPABASE_SECRET_KEY_GEDUNG1` di
   `abadiops.env` diuji tanpa dicetak: format `sb_secret_`, berbeda dari kunci uji dan Gedung 2, Gedung 1 menerimanya
   dengan hak service_role (tanpa kunci ditolak 401). Tinggal dipasang ke Worker produksi bersamaan dengan langkah 3.
   Worker produksi belum punya kunci Supabase sama sekali (selama ini hanya meneruskan ke GAS). Buat di dasbor Supabase proyek Gedung 1 (`sptgqsjgszwbreikxdph`,
   https://supabase.com/dashboard/project/sptgqsjgszwbreikxdph/settings/api-keys): tab kunci baru (bukan *Legacy*) →
   *Secret keys → New secret key*, nama `worker_produksi`. Salin (diawali `sb_secret_`), lalu tambahkan satu baris di
   `C:\dev\rahasia\abadiops.env`: `SUPABASE_SECRET_KEY_GEDUNG1=<kuncinya>`. Jangan ditempel di chat. Claude langsung
   mengujinya (satu panggilan baca ke Gedung 1, tanpa mencetak), lalu memasangnya ke `abadiops-pintu`, `abadiops-kmb`,
   `abadiops-sum`, `abadiops-porject-kmb`, `abadiops-kmbbupr` **bersamaan dengan deploy produksi** (langkah 3): memasang
   rahasia ke Worker langsung men-deploy ulang Worker itu, dan kode produksi sekarang (30 Okt) belum pernah diuji dengan
   kunci. (Kunci `worker_uji` sengaja tidak dipakai untuk produksi, supaya memutar kunci uji tidak mematikan produksi.)
3. **Izinkan deploy produksi** (cukup "ya, deploy produksi"). Urutannya penting:
   - `abadiops-kmbbupr` (baru) di `kmbbupr.abadiops.com` **lebih dulu**, karena pintu mengarahkan pengguna BUPR ke sana;
   - `abadiops-pintu`: panel migrasi baru, BUPR masuk daftar rumah, token rumah yang sudah pindah dikenali lewat Worker-nya;
   - Worker rumah KMB V2, SUM, KMB Projek: **bertahap** (10% lalu 100% sesudah dicek) dengan kemungkinan rollback seketika.
     Selama saklar `gas` semuanya tetap meneruskan ke GAS. Deploy ulang ini juga wajib untuk batas CPU Workers Paid
     (BUG-DICATAT #40).
4. **Tutup GAS BUPR** *(per rumah)*: izinkan `node tools/kembar/siapkan-tutup-gas.mjs --kamar=kmbbupr --push`, lalu di
   editor GAS BUPR: *Deploy → Manage deployments → pensil pada deployment produksi → Version: New version → Deploy*.
   **Jangan `clasp deploy`.** Tambalan tidur selama saklar `gas`; uji di panel tidak berubah apa-apa.
5. **Hak Editor akun layanan** *(per rumah)*: bagikan spreadsheet BUPR ("New MAR Project") ke email akun layanan cermin
   (yang sekarang Viewer) sebagai **Editor**. Dipakai cermin balik hanya setelah jam mulai.
6. **Latihan cermin balik** (sekali, sebelum BUPR): *File → Make a copy* spreadsheet BUPR, bagikan salinannya ke akun
   layanan sebagai Editor, kirim ID salinannya ke Claude. Claude menjalankan `tools/cermin/latihan-balik.mjs` di skema uji
   `uji_kmbbupr` → salinan: `--tahap=awal` (salin penuh + uji Editor + periksa), satu siklus WO di Worker uji, lalu
   `--tahap=akhir` (cermin balik bertahap + periksa, harus semua sheet sama). Lulus → `config/rumah.json`
   `kmbbupr.gas.jalan_kembali_siap = true` (syarat ke-4 tombol Mulai) + deploy ulang pintu.
7. **PWA BUPR lama** (GitHub Pages `kawanabadigrup/PWA-Project-KMB2`) masih memanggil GAS langsung. Sebelum Mulai, ganti
   alamatnya ke Worker supaya kiriman HP ikut tertahan dengan benar saat peralihan:
   `app.js` baris 15 `API_URL` dan `sw.js` baris 41 `API_URL` → `https://kmbbupr.abadiops.com/api`, lalu `sw.js` baris 1
   `CACHE` → `mar-projek-v5`. Selama saklar `gas`, Worker meneruskan ke GAS yang sama, jadi pengguna tidak merasakan beda.
   (Claude bisa menyiapkan commit-nya bila diizinkan.)
8. **Tunggu syarat 7 hari tanpa selisih** (otomatis, diperiksa tiap hari mulai 02.00 WIB): BUPR paling cepat **19 Nov**,
   rumah lain **20 Nov**, selama tidak ada selisih.

## Saat menekan Mulai (BUPR)

Panel `abadiops.com/saklar` → tab **Saklar Migrasi** → kartu BUPR (semua syarat hijau) → **Mulai migrasi** → isi alasan →
ketik `kmbbupr`. Lalu, otomatis:

1. saklar `menutup`: HP menahan kiriman, MAR Web menampilkan "pindah jalur";
2. GAS BUPR terbukti tertutup (≤ ±4 menit);
3. sinkron maju dikunci, lalu sinkron terakhir + periksa selisih oleh pelaksana GitHub;
4. cadangan jam mulai;
5. izin tulis dibuka;
6. cermin balik awal + uji hak Editor + periksa;
7. saklar `supabase`, jam mulai tercatat (WIB).

Lama ±15–40 menit. Gagal di mana pun → kembali ke `gas` sendiri, tidak ada yang hilang. Membatalkan saat `menutup`:
ubah saklar manual ke `gas` (izin yang sudah dibuka ikut ditutup). Sesudah `supabase`: tombol **Kembali ke GAS** kapan saja.

## Sebelum rumah berikutnya (KMB Projek, KMB V2, SUM)

- Langkah 4 dan 5 untuk rumah itu (tambalan sudah dicek siap; tinggal izin push + Deploy dari editor + Editor).
- **Notifikasi push** wajib sebelum rumah besar: kunci VAPID dari Script Properties GAS disalin Gabriel ke rahasia Worker
  (`docs/INVENTARIS-LAYANAN-GOOGLE.md`). BUPR boleh mulai tanpa push (satu mekanik aktif, WO mandiri).
- Satu siklus WO uji oleh Gabriel di `staging-<rumah>.abadiops.com`.
