# Layanan Google di kode GAS: apa yang harus punya pengganti sebelum jam mulai migrasi

Disusun 14 Nov 2026 malam dari kode GAS yang dipatok (BUPR @11, KMB Projek @49, KMB V2 @299, SUM @199), untuk syarat
"fitur yang memakai layanan Google sudah punya pengganti" di `docs/SAKLAR.md`. Jalur Supabase menjalankan kode GAS yang
sama, tetapi `DriveApp`, `MailApp`, `UrlFetchApp`, dan pemicu terjadwal tidak tersedia di Worker
(`workers/bersama/gas-layanan.js`). Setelah jam mulai, GAS ditutup, sehingga semua yang di bawah ini harus berjalan di
jalur Supabase atau sengaja dinyatakan tidak perlu.

## Wajib sebelum jam mulai

| Fitur (fungsi GAS) | Rumah | Kenapa penting | Rencana pengganti |
|---|---|---|---|
| Notifikasi push ke HP (`sendPushToEmails`, web-push VAPID lewat `UrlFetchApp`) | semua | WO yang menunggu tindakan diberitahukan ke orangnya. Saat ini di jalur Supabase push **diam-diam tidak terkirim**: kunci VAPID ada di Script Properties GAS, sedangkan PropertiesService Worker kosong (fungsi pulang dengan 0) | (1) Gabriel menyalin kunci VAPID dari editor GAS (Project Settings → Script properties) ke rahasia Worker, karena itu kunci rahasia; (2) `UrlFetchApp` di Worker dicatat selama kode GAS berjalan lalu dikirim sesudahnya (`ctx.waitUntil`). Langganan yang dijawab 404/410 dihapus sesudahnya dengan aturan yang sama dengan kode GAS. Di ruang uji hanya dicatat, tidak dikirim ke HP sungguhan |
| Unduh laporan payroll (`generatePayrollReport`: membuat spreadsheet di Drive lalu mengekspornya) | semua | Payroll dibayar dari laporan ini | Kode GAS yang sama menulis ke spreadsheet tiruan di memori; Worker mengubahnya menjadi berkas XLSX untuk diunduh. Angka dicocokkan dengan laporan GAS untuk beberapa periode lalu (titik henti: rumus poin/rupiah tidak diubah) |
| Penjaga otomatis (`penjagaOtomatis`, 06.00 dan 18.00 WIB) | semua | Menulis poin yang tertinggal untuk WO approved, artinya mekanik yang belum dibayar | **Selesai 15 Nov dini hari:** cron Worker menjalankan fungsi GAS yang sama di atas cermin, hanya bila saklar rumah itu `supabase`; uji kembar identik di keempat rumah (laporan temuan yang biasanya dikirim lewat email masih hanya dicatat) |
| Pemangkas ProcessedOps dan KirimanWeb (`cleanupProcessedOps`, `cleanupKirimanWeb`, tiap hari) | semua | Ditandai WAJIB di kode: tanpa pemangkasan setiap kiriman makin lambat | **Selesai 15 Nov dini hari:** cron Worker, fungsi GAS yang sama; uji kembar identik |

## Perlu keputusan Gabriel

| Fitur | Rumah | Catatan |
|---|---|---|
| Email penjaga harian (`penjagaHarian`/`_penjagaKirim`, `MailApp`) | semua | Hanya melapor, tidak mengubah data. Perlu saluran email dari Cloudflare, misalnya Email Routing `send_email` ke alamat penerima yang sudah diverifikasi, atau layanan email transaksional |

## Tidak perlu di jalur Supabase

| Fitur | Alasan |
|---|---|
| Cadangan ke Drive (`runBackup`, `_getOrCreateBackupFolder`, `_cadangkanSebelumBersihProjek`) | Digantikan cadangan harian Supabase Pro (7 hari), cadangan skema sesaat sebelum mulai (`cermin_cadangkan`), dan cermin balik ke spreadsheet |
| Penyegar cache config (`pasangSegarkanConfig`) | Worker tidak memakai CacheService antar-permintaan; setiap permintaan membaca cermin |
| Pengesah massal L2 dari editor (`_ApproveMassalL2`, `pasangPemicuApproveL2`) | Alat darurat sekali pakai (antrean 479 WO, 17 Sep 2026), bukan operasi rutin |
| Ekspor ke Supabase lama (`eksporMechanicsKeSupabase`, `eksporUnitsKeSupabase`) | Bagian rancangan lama Raka; digantikan cermin |
| `cariSpreadsheetV1` (SUM) | Alat perawatan dari editor |
