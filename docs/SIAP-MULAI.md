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
3. **Sudah 15 Nov 11.18–11.37 WIB** ("ya deploy produksi"), dari `main` `51efbc7`, semuanya dengan kunci produksi:
   `abadiops-kmbbupr` (baru, GAS @11), `abadiops-pintu` (`8cf12155`, 1% → 100%), `abadiops-porject-kmb` (`105df4e9`, GAS
   @49, 1% → 10% → 100%), `abadiops-kmb` (`61ecc873`, GAS @299, 1% → 10% → 100%). Sebelum tiap kenaikan, versi baru diuji
   di domain produksi lewat header `Cloudflare-Workers-Version-Overrides`: aset PWA dan semua jawaban API sama persis
   dengan versi lama dan dengan GAS; satu-satunya beda `/web` (dulu halaman "Perlu Token", kini dialihkan ke web app
   GAS; PWA tidak menautkannya, pintu mengirim pengguna rumah `gas` langsung ke web GAS). Rollback seketika ke versi
   sebelum: pintu `6ac7fea8`, KMB Projek `2be3bb6a`, KMB V2 `fac0593d` (`wrangler versions deploy <id>@100`).
   **`abadiops-sum` menyusul** (keputusan 15 Nov siang, `docs/KEPUTUSAN.md`): PWA SUM `app.js` dikembalikan ke v49 yang
   tayang (BUG #44 ditunda), `sw.js` dengan perbaikan BUG #30 (`mar-sum-v52`). **Menunggu "ya push main"** untuk
   `7a09662`; sesudahnya SUM di-deploy dengan cara yang sama + kunci, dan Worker BUPR, KMB Projek, KMB V2 di-deploy ulang
   supaya `sw.js` baru (tanpa cache `/web` dan `/api`) tayang beberapa hari sebelum migrasinya. Staging sudah memakainya
   (15 Nov). Urutan semula:
   - `abadiops-kmbbupr` (baru) di `kmbbupr.abadiops.com` **lebih dulu**, karena pintu mengarahkan pengguna BUPR ke sana;
   - `abadiops-pintu`: panel migrasi baru, BUPR masuk daftar rumah, token rumah yang sudah pindah dikenali lewat Worker-nya;
   - Worker rumah KMB V2, SUM, KMB Projek: **bertahap** (10% lalu 100% sesudah dicek) dengan kemungkinan rollback seketika.
     Selama saklar `gas` semuanya tetap meneruskan ke GAS. Deploy ulang ini juga wajib untuk batas CPU Workers Paid
     (BUG-DICATAT #40).
4. **BUPR selesai 15 Nov ±12.05 WIB:** `clasp push` (HEAD = @11 + tambalan, tanpa izin OAuth baru), lalu Gabriel
   Deploy dari editor → deployment produksi `AKfycbykSslm…` **@12**. Clone @12 = 119 berkas, sama persis dengan yang
   dikirim; /exec tetap menjawab sama dengan sebelumnya (API = Worker, halaman "MAR BUPR" 200). Tambalan tidur selama
   saklar `gas`. Rumah lain: tambalan siap, menunggu gilirannya. Cara semula:
   **Tutup GAS BUPR** *(per rumah)*: izinkan `node tools/kembar/siapkan-tutup-gas.mjs --kamar=kmbbupr --push`, lalu di
   editor GAS BUPR: *Deploy → Manage deployments → pensil pada deployment produksi → Version: New version → Deploy*.
   **Jangan `clasp deploy`.** Tambalan tidur selama saklar `gas`; uji di panel tidak berubah apa-apa.
5. **BUPR selesai 15 Nov** (dibagikan Gabriel). Dicek tanpa mengubah apa pun (`batchUpdate` kosong: Viewer → 403,
   Editor → 400 "Must specify at least one request"): akun layanan **Editor** di BUPR, KMB Projek, dan SUM; **Viewer** di
   KMB V2 (pembanding 403). Penulisan tetap dijaga `public.cermin_izin_tulis` (semua tertutup).
   **Hak Editor akun layanan** *(per rumah)*: bagikan spreadsheet BUPR ("New MAR Project") ke email akun layanan cermin
   (yang sekarang Viewer) sebagai **Editor**. Dipakai cermin balik hanya setelah jam mulai.
6. **LULUS 15 Nov ±12.40–13.05 WIB** di salinan "Salinan New MAR Project" (`1uOZUOHw…`, dibuat Gabriel; skrip salinannya
   `1t2eOlSw…` tidak dipakai dan tidak boleh di-deploy): tahap awal 24/24 sama (0 baris perlu ditulis); skenario tulis
   BUPR di Worker uji (`skenario-tulis.mjs`: WO mandiri → L2, SPV → L1 → L2, kiriman ulang op_id, pembatalan, 3 penolakan)
   + pemicu GAS (pemangkas ProcessedOps menghapus 10.402 baris); tahap akhir bertahap: 9 sheet ditulis (ProcessedOps 134
   ditulis + 10.402 dikosongkan), **periksa 24/24 sama**. `config/rumah.json` `kmbbupr.gas.jalan_kembali_siap = true`
   (`main` `4c599d3`), pintu produksi `5f80640a` (rollback `b9a1b246`) sudah membacanya. Sesudah latihan, `uji_kmbbupr`
   disegarkan lagi dari cermin BUPR (24/24 sama) untuk uji WO Gabriel.
   **Latihan cermin balik** (sekali, sebelum BUPR): *File → Make a copy* spreadsheet BUPR, bagikan salinannya ke akun
   layanan sebagai Editor, kirim ID salinannya ke Claude. Claude menjalankan `tools/cermin/latihan-balik.mjs` di skema uji
   `uji_kmbbupr` → salinan: `--tahap=awal` (salin penuh + uji Editor + periksa), satu siklus WO di Worker uji, lalu
   `--tahap=akhir` (cermin balik bertahap + periksa, harus semua sheet sama). Lulus → `config/rumah.json`
   `kmbbupr.gas.jalan_kembali_siap = true` (syarat ke-4 tombol Mulai) + deploy ulang pintu.
7. **Sudah 15 Nov ±11.50 WIB:** commit `81b8ee9` di `kawanabadigrup/PWA-Project-KMB2` (API `app.js` + `sw.js` →
   `https://kmbbupr.abadiops.com/api`, versi `projek-v5`), sesudah API Worker BUPR terbukti sama persis dengan GAS.
   Semula: **PWA BUPR lama** (GitHub Pages `kawanabadigrup/PWA-Project-KMB2`) masih memanggil GAS langsung. Sebelum Mulai, ganti
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

## Sebelum rumah berikutnya (KMB Projek, KMB V2, SUM) — keadaan 15 Nov sore

| Syarat | KMB Projek | KMB V2 | SUM |
|---|---|---|---|
| Worker produksi kode baru + kunci | ✔ `0aa0f170` | ✔ `da2d4843` | ✔ `0352395b` |
| Tutup GAS (`siapkan-tutup-gas.mjs`) | siap: HEAD = @49, 14/14 | siap: HEAD = @299, 14/14 | siap: HEAD = @199, 14/14 |
| Akun layanan Editor di spreadsheet | ✔ | **✗ Viewer** | ✔ |
| Latihan cermin balik → `jalan_kembali_siap` | skenario siap | skenario siap | skenario siap |
| Notifikasi push (langganan aktif di PushSubs) | 0 → tidak menghalangi | 64 → **wajib kunci VAPID** | 109 → **wajib kunci VAPID** |
| 7 hari tanpa selisih | ≥ 20 Nov | ≥ 20 Nov | ≥ 20 Nov |
| Uji WO Gabriel | `staging-kmbprojek` | `staging-kmbtra` | `staging-sum` |

Tidak ada izin OAuth baru di ketiga tambalan (`UrlFetchApp`, `CacheService`, `PropertiesService` sudah dipakai kodenya).

**Yang dibutuhkan dari Gabriel:**
1. "ya clasp push kmbprojek kmbtra sum", lalu Deploy versi baru dari editor ketiga GAS (akun yang sama seperti biasa).
2. Spreadsheet KMB V2 → bagikan ke akun layanan sebagai Editor.
3. Tiga salinan (*File → Make a copy*) KMB Projek, KMB V2, SUM, masing-masing dibagikan ke akun layanan sebagai Editor;
   kirim tautannya. Claude menjalankan per rumah: `latihan-balik.mjs --tahap=awal` → `tools/cermin/siklus-latihan.mjs
   --rumah=<kode>` (SUM: `--mekanik=` mekanik yang berlangganan push di ruang uji) → `latihan-balik.mjs --tahap=akhir`;
   lulus → `jalan_kembali_siap = true` + push `main` + deploy pintu.
4. Kunci VAPID KMB V2 dan SUM (Script Properties `VAPID_PRIVATE_PEM`, `VAPID_PUBLIC_B64URL`) ke `abadiops.env`
   sebagai `VAPID_PRIVATE_PEM_KMBTRA`, `VAPID_PUBLIC_B64URL_KMBTRA`, `VAPID_PRIVATE_PEM_SUM`, `VAPID_PUBLIC_B64URL_SUM`
   (satu baris; dirapikan otomatis). KMB Projek bila ada. Lalu "ya push main" + "ya deploy produksi" untuk kode push
   (`3b9605b`, `30554a1`) + rahasia VAPID di Worker produksi.

**Notifikasi push di Worker (15 Nov, branch `staging`, sudah di Worker staging):** kunci VAPID → Script Properties GAS;
web push dicatat shim dan dikirim sesudah tulisan tersimpan, hanya ke layanan push yang dikenal; 404/410 mematikan
langganan seperti GAS; ruang uji hanya mencatat. Uji ujung ke ujung dengan kode GAS BUPR asli: JWT ES256 sah. Di
Worker uji (kunci VAPID uji, tidak dikirim): KMB V2 buat WO 31 push, L2 31; SUM buat WO 17 push ke HP mekanik, L2 17.
