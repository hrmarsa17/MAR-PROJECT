# Saklar "WO baru ke Supabase"

Setiap rumah (`kmb`, `kmb-projek`, `sum`) punya satu saklar. Posisi bawaannya **`gas`**, artinya mati.

Tujuan saklar: memindahkan backend tanpa memindahkan WO yang sedang berjalan. WO lama diselesaikan di GAS, WO baru lahir di Supabase.

## Tiga posisi saklar

| Posisi | WO baru dibuat di | Aksi pada WO lama (lahir di GAS) | Aksi pada WO baru (lahir di Supabase) | Daftar, monitoring, payroll dibaca dari |
|---|---|---|---|---|
| `gas` (bawaan) | GAS | GAS | belum ada | GAS, atau cermin kalau aksi baca sudah dipindah |
| `dua_cabang` | **Supabase** | GAS, sampai approved | Supabase | Supabase: WO baru asli + cermin WO lama |
| `supabase` | Supabase | sudah habis | Supabase | Supabase. GAS tidak dipakai lagi |

Urutannya selalu `gas`, lalu `dua_cabang`, lalu `supabase`. Posisi `supabase` baru dipasang setelah semua WO lama habis.

## Satu WO, satu rumah

- Rumah sebuah WO ditentukan saat WO itu lahir, dan tidak pernah berubah.
- Worker mengenali rumah WO dari ID internalnya. WO yang lahir di Supabase memakai awalan ID yang berbeda dari ID buatan GAS.
- WO tidak pernah dipindah dari GAS ke Supabase, atau sebaliknya, di tengah jalan.

## Data hanya mengalir satu arah

Data mengalir dari spreadsheet ke Supabase sebagai cermin, tidak pernah sebaliknya.
- Setiap kali aksi yang diteruskan ke GAS berhasil, Worker langsung menarik WO yang berubah ke cermin.
- Selain itu ada sinkron penuh berkala, ditambah laporan selisih harian.
- Halaman web GAS yang dipakai supervisor di laptop menulis langsung ke spreadsheet tanpa lewat Worker. Karena itu sinkron berkala wajib, dan halaman web GAS rumah itu harus ditutup atau dibuat hanya-baca sebelum saklarnya dinyalakan.

## Syarat sebelum saklar sebuah rumah dinyalakan

- [ ] Cermin rumah itu tidak punya selisih dengan spreadsheet selama **7 hari** berturut-turut.
- [ ] Semua aksi tulis dan halaman web rumah itu sudah dipindah dan **lulus uji rekam-putar** di staging: hasil Worker sama dengan hasil GAS, kolom per kolom.
- [ ] **Buku tamu kiriman** sudah aktif di pintu depan dan disimpan di Cloudflare, bukan di Supabase. Dengan begitu, kiriman yang dikirim ulang tidak tercatat dua kali, ke mesin mana pun.
- [ ] Cermin ikut menyalin `ProcessedOps` dari GAS.
- [ ] Sudah dipastikan **nomor WO tidak bisa kembar** antara GAS dan Supabase. Ini menunggu keputusan A/B/C di `docs/KEPUTUSAN.md`.
- [ ] Payroll yang dihitung dari Supabase sama dengan payroll GAS untuk bulan-bulan sebelumnya.
- [ ] Supabase sudah berlangganan paket **Pro**, sehingga ada cadangan harian.
- [ ] Halaman web GAS rumah itu sudah ditutup atau dibuat hanya-baca.
- [ ] **Latihan saklar balik** sudah dilakukan di staging: nyalakan, matikan, nyalakan lagi, tanpa ada nomor kembar dan tanpa kiriman ganda.
- [ ] Gabriel menyetujui.

## Saklar balik sebagai lapisan pengaman

Kalau ada masalah, saklar dibalik dari `dua_cabang` kembali ke `gas`.
- Yang dibalik **hanya tempat lahirnya WO baru**. WO yang sudah terlanjur lahir di Supabase tetap tinggal di Supabase.
- **Supabase mati sebentar:** jangan dibalik. Antrean di HP menampung kiriman dan mengirim ulang otomatis.
- **Supabase mati lama (berjam-jam):** balik ke `gas`. Untuk sementara daftar dilayani GAS. WO yang lahir di Supabase menunggu sampai Supabase hidup lagi.
- **Ada bug di jalur Supabase:** balik ke `gas`, perbaiki, lalu nyalakan lagi.
- **Menyalin WO dari Supabase kembali ke spreadsheet hanya jalan terakhir.** Ini prosedur darurat manual yang harus sudah dilatih sebelumnya.
- **GAS harus tetap hidup penuh selama posisi `dua_cabang`.** Fungsi buat WO di GAS tidak dihapus, dan alamat `/exec` tidak berubah.

## Cara saklar disimpan

- Saklar harus bisa dibalik **dalam hitungan detik, tanpa deploy**. Simpan di tempat yang dibaca Worker pada setiap permintaan, misalnya Cloudflare KV, bukan di kode atau di `wrangler.toml`.
- Saklar yang ada sekarang (`BACKEND_DRIVER` di `src/lib/backendConfig.ts` dan `STORAGE_MODE` di `wrangler.toml`) berlaku untuk seluruh sistem sekaligus dan belum mendukung posisi `dua_cabang`. Keduanya akan diganti dengan saklar per rumah ini. Sampai saat itu, nilainya tetap `appscript` dan `SPREADSHEET`.

## Catatan pembalikan saklar

| Tanggal dan jam (WIB) | Rumah | Dari → ke | Alasan | Oleh |
|---|---|---|---|---|
| — | — | — | belum pernah dibalik | — |
