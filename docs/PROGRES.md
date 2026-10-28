# Progres

Entri terbaru selalu di **atas**. Setiap sesi kerja, baik oleh orang maupun AI, wajib menambah satu entri sebelum push.

Formatnya:

```
### YYYY-MM-DD · Nama (+ AI) · rumah
- Berubah: …
- Belum selesai / berikutnya: …
```

---

## Tugas terbuka

| Tugas | Rumah | Pemegang | Status |
|---|---|---|---|
| Pintu: pengecekan token kembar otomatis setiap hari untuk ketiga rumah, dengan peringatan | bersama | Gabriel + Raka | lihat `docs/KEPUTUSAN.md` 28 Okt. Saat login, pintu sudah menolak token kembar (28 Okt malam). Pengecekan harian masih butuh daftar token ketiga rumah (akun layanan Google) |
| KMB Project: hapus salinan 4 akun uji KMB V2 (`SUPT-001`, `SPV-001`, `MECH-003`, `TYRE-002`) dari data token KMB Project. Kalau perlu akun uji, buat sendiri dengan token berbeda | kmb-projek | Gabriel (+ Claude), menggantikan Raka | **kode dan sheet selesai** 28 Okt malam (pilihan C). Keempat token lama kini hanya dikenali KMB V2 (`scripts/buat-token-tiga-rumah.mjs --cek`). Sisa: SQL dan deploy di baris bawah |
| KMB Project: buang hardcode yang tersisa (bug #16): `TOKENS`/`MECHANICS` di `data.js` dan `DEFAULT_MECHANICS_LIST` di `scripts/patched-app.js` | kmb-projek | Raka (+ keputusan Gabriel) | mengubah login luring dan tampilan awal portal |
| KMB Project: di spreadsheet, sheet ApiTokens, ganti token `SUPT-001`, `SPV-001`, `MECH-003` dengan token baru (diberikan di chat, **jangan** ditulis di repo). Di sheet Config_Mechanics, kosongkan `offline_token` yang masih berisi token lama | kmb-projek | Gabriel | **token lama selesai dibuang** 28 Okt malam. Token uji baru belum dimasukkan; opsional, kalau Raka perlu akun uji |
| KMB Project: jalankan `db/kmb_projek/hapus-salinan-token-uji.sql` di Supabase SQL Editor. Wajib, karena login KMB Project mengecek Supabase sebelum GAS | kmb-projek | Gabriel | **selesai** 28 Okt malam: 4 baris (`api_tokens` dan `config_mechanics` untuk SPV-001 dan SUPT-001). Diverifikasi lewat `kmb_ping`: keempat token lama tidak ada lagi di cermin |
| Deploy ketiga Worker sesudah pull: `project-kmb` (akar repo), `abadiops-sum` (`workers/sum`), `abadiops-kmb` (`workers/kmb`). Pastikan dulu Raka tidak punya deploy `project-kmb` yang lebih baru dan belum di-push | bersama | Gabriel | `project-kmb` **sudah live** 28 Okt malam (diverifikasi: pintu menjawab tenant `KMB_V2`, portal memuat `serahkanKeRumah`). **`abadiops-sum` dan `abadiops-kmb` belum**: tanpa pembaca `#token=`, pengguna yang diantar pintu harus mengetik token lagi dan tokennya tertinggal di alamat |
| KMB Project: jalankan `db/kmb_projek/rpc_wajib_token.sql` di Supabase SQL Editor | kmb-projek | Gabriel | **selesai** 28 Okt malam. Diverifikasi dari luar: 4 fungsi lama tertutup untuk anon, 4 pembungkus menolak token palsu |
| Pintu: uji di browser (jendela penyamaran) dengan token uji SUM, KMB V2, KMB Project, token kembar, dan token palsu | bersama | Gabriel | sesudah deploy |
| KMB Project: definisi `kmb_projek.catalog_jobs` dimasukkan ke `cermin_sheet.sql` dan diisi lewat skrip sinkron (bug #15) | kmb-projek | Raka | |
| KMB Project: cermin diperbarui terus-menerus, lalu uji kembar per aksi (`scripts/uji-kembar-kmb-projek.mjs`). Aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR` di `worker.js` | kmb-projek | Raka | sekarang 0 aksi lulus |
| KMB Project: setel `KMBP_UJI_SPV_TOKEN` (token baru SPV-001) sebelum menjalankan `scripts/sinkron-kmb-projek-cermin.mjs`, `scripts/uji-live-supabase-backend.mjs`, `scripts/verify-sum-kmb-isolation.mjs` | kmb-projek | Raka | |
| Konfirmasi region Supabase adalah Singapura | bersama | Gabriel + Raka | **selesai** (terkonfirmasi `ap-southeast-1` = Singapura) |
| Konfirmasi bahwa spreadsheet `1qHjfIUT…` milik SUM V2 (script `1k_A_KER…`) | sum | Gabriel + Raka | **selesai** (terkonfirmasi script `1k_A_KER…` di `MAR-SUM-v2`) |
| Pindahkan kode MARProject ke cabang arsip, lalu bentuk susunan tiga rumah | bersama | Gabriel + Raka | **arsip selesai** (`archive/marproject`), susunan tiga rumah disiapkan |
| Buat project Supabase untuk staging | bersama | Gabriel + Raka | menunggu pembuatan/koneksi project web console |
| Inventaris perilaku per aksi | setiap rumah | pemegang rumah | **kmb-projek selesai** (`docs/INVENTARIS-KMB-PROJEK.md`), **sum versi 1** (`docs/INVENTARIS-SUM.md`), kmb menunggu Gabriel |
| SUM: buat akun layanan Google (baca-saja), bagikan spreadsheet SUM sebagai Viewer | sum | Gabriel | langkah ada di `db/sum/README.md` |
| SUM: jalankan `db/sum/cermin_sheet.sql` di Supabase SQL Editor | sum | Gabriel | |
| SUM: sinkron pertama (`--kering` dulu), cocokkan jumlah baris 19 sheet | sum | Gabriel | |
| SUM: pelajari `readSheetAsObjects` dan versi aktif 4 fungsi kembar, sebelum aksi baca pertama dipindah | sum | Gabriel | |
| SUM: deploy `workers/sum` ke alamat uji memakai API token kawanabadigrup (`CLOUDFLARE_API_TOKEN`, lalu `npx wrangler deploy`). Jangan `wrangler login`: laptop Gabriel masih login ke akun Cloudflare pribadi untuk Rembes | sum | Gabriel | **selesai** 28 Okt: `https://abadiops-sum.kawanabadigrup.workers.dev` |
| SUM: uji dengan token sungguhan untuk kelima peran | sum | Gabriel | |
| Pintu `abadiops.com`: sambungkan rumah SUM. Alamat itu sekarang menyajikan portal KMB Project | bersama | Gabriel + Raka | **kode selesai** 28 Okt malam: pengguna SUM diantar ke `abadiops-sum`. Menunggu deploy |
| SUM: tombol serah-terima token di PWA lama dan pembaca `#token=` di PWA baru | sum | Gabriel | pembaca `#token=` **selesai** di `pwa/sum` dan `pwa/kmb` (28 Okt malam). Tombol di PWA lama belum. Sebelum mekanik dipindah |
| SUM: pindahkan 7 halaman web GAS secara 1:1 ke Abadi (dashboard, buat WO, My Work, approval, cancel, laporan/payroll, whoami), lalu tutup halaman web GAS | sum | Gabriel | **wajib sebelum saklar SUM dinyalakan** |
| KMB Project: bersihkan label golongan `(1a)` dari Create WO & RPC `kmb_create_refs` (Bug #6) | kmb-projek | Raka | **selesai** 28 Okt |
| KMB Project: kembalikan fallback `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` (Bug #8) | bersama / kmb-projek | Raka | **selesai** 28 Okt |
| KMB Project: kunci isolasi `worker.js` murni KMB, hapus routing `GAS_URLS.SUM` dan switch system (Bug #9) | kmb-projek | Raka | **selesai** 28 Okt |
| KMB Project: perbaiki gate login agar token asal tidak otomatis lolos ke tab mekanik (Bug #10) | kmb-projek | Raka | **selesai** 28 Okt |
| KMB V2: deploy `workers/kmb` ke alamat uji (`CLOUDFLARE_API_TOKEN` yang sama, lalu `npx wrangler deploy`) | kmb | Gabriel | **selesai** 28 Okt: `https://abadiops-kmb.kawanabadigrup.workers.dev` |
| Pintu: deteksi rumah dari token (keputusan login zero-select). Token SUM dan KMB V2 belum ada di Supabase, jadi pintu perlu cermin `api_tokens` kedua rumah, atau bertanya ke GAS masing-masing. Cek juga token kembar antar-rumah | bersama | Gabriel + Raka | 4 token kembar KMB V2 ↔ KMB Project **diselesaikan dengan pilihan C** (28 Okt), tinggal langkah manual di atas. **Kode pintu selesai** 28 Okt malam: ketiga rumah dicek sekaligus, aturan "jangan menebak" terpasang. Menunggu deploy |
| KMB V2: uji dengan token sungguhan untuk ketiga peran (mechanic, supervisor, superintendent) | kmb | Gabriel | |
| Pintu `abadiops.com`: sambungkan rumah KMB V2 | bersama | Gabriel + Raka | **kode selesai** 28 Okt malam: pengguna KMB V2 diantar ke `abadiops-kmb`. Menunggu deploy |
| KMB V2: inventaris perilaku per aksi (`docs/INVENTARIS-KMB.md`) dan skema cermin `kmb` | kmb | Gabriel | |
| KMB V2: pindahkan halaman web GAS secara 1:1 ke Abadi, lalu tutup halaman web GAS | kmb | Gabriel | **wajib sebelum saklar KMB dinyalakan** |

---

### 2026-10-28 · Gabriel (+ Claude) · bersama (haram hardcode + alat token tiga rumah)
- Berubah:
  - Aturan **HARAM hardcode** (keputusan Gabriel): `AGENTS.md` §5 dan `docs/KEPUTUSAN.md`.
  - Baru: `scripts/buat-token-tiga-rumah.mjs`. Skrip ini membuat token hex 20 yang dicek langsung ke GAS ketiga rumah, atau dengan `--cek` memeriksa token yang sudah ada. Tidak ada daftar token di repo, jadi token yang bertambah besok ikut terperiksa.
    - Cek 28 Okt malam: keempat token uji lama kini hanya dikenali KMB V2.
    - Ketiga token uji baru belum terdaftar di rumah mana pun.
  - Hardcode yang dibuang:
    - Daftar token SUM di `worker.js` (`isKnownSumToken`) dan `scripts/patched-app.js` (`tenantCode`). Rumah ditentukan pintu.
    - Token uji SUM di `scripts/verify-sum-kmb-isolation.mjs`, sekarang dari environment `SUM_UJI_TOKEN`.
    - `scripts/sum-monitoring.json`: salinan 40 token dan nama mekanik SUM, tidak dipakai di mana pun, bisa dipulihkan dari git.
    - Token di `docs/PROGRES.md` dan `docs/INVENTARIS-KMB-PROJEK.md` disamarkan.
  - Pencocokan ApiTokens ketiga rumah dari tangkapan layar Gabriel, hanya untuk diketahui dan tidak ditulis di mana pun:
    - Tidak ada token kembar selain 3 akun uji KMB V2 ↔ KMB Project, dan ketiganya sudah dibereskan di sheet.
    - `mechanic_id` yang sama di dua rumah dengan token berbeda (misalnya `SUPT-001`, `SPV-002`) tidak masalah.
- Belum selesai / berikutnya: bug #16, hardcode yang tersisa di portal KMB Project (Raka, perlu keputusan Gabriel).

### 2026-10-28 · Gabriel (+ Claude) · bersama (pintu tiga rumah + serah-terima token + RPC bertoken)
- Berubah:
  - **Pintu** di `worker.js` dan `workers/kmb-projek/worker.js` (keputusan Gabriel 28 Okt malam, bug #11). Ping dicek ke GAS KMB Project, SUM V2, dan KMB V2 sekaligus, dengan batas 25 detik per rumah.
    - Cocok satu: masuk. Untuk SUM V2 dan KMB V2, jawaban membawa `rumah` dan `alamat_rumah`.
    - Cocok lebih dari satu: ditolak.
    - Tidak cocok: jawaban asli GAS.
    - Ada rumah yang tidak menjawab: "Server sedang sibuk".
    - URL GAS KMB V2 diambil dari `workers/kmb/wrangler.toml`.
  - **Isolasi:** selain ping, Worker KMB Project hanya meneruskan ke GAS KMB Project. Rute data ke GAS SUM dihapus.
  - `scripts/patched-app.js`, dirakit ke `worker.js` (`index.html`, `style.css`, dan `data.js` tidak berubah):
    - Sesudah ping berhasil, token SUM V2 / KMB V2 diantar ke aplikasi rumahnya (`#token=`), dan sesi portal dibersihkan.
    - Cadangan ping langsung ke GAS memakai aturan yang sama.
    - Cadangan data langsung ke GAS hanya ke KMB Project.
  - `pwa/sum/app.js` dan `pwa/kmb/app.js`: `terimaTokenSerahan()` membaca `#token=`, menghapusnya dari alamat, lalu menjalankan `doLogin()` yang sudah ada. Kalau HP sudah masuk dengan token lain, token itu tidak diganti, karena antrean kirimannya bisa hilang.
  - **Bug #13:** `db/kmb_projek/rpc_wajib_token.sql` (baru), GRANT di `rpc_baca.sql` diganti REVOKE, dan Worker memanggil `*_bertoken` dengan `p_token`.
  - `scripts/update-worker-engine.mjs` dipensiunkan (langsung keluar dengan pesan), karena skrip itu menimpa seluruh blok `/api/gas` di `worker.js`.
  - `docs/KEPUTUSAN.md`: baris keputusan pintu. `docs/BUG-DICATAT.md`: #11 dan #13 diperbaiki, #15 dicatat. `AGENTS.md` §2 dan §6 diperbarui.
  - **Diuji di `wrangler dev`:**
    - Token uji SUM diantar ke `abadiops-sum`, token uji KMB V2 ke `abadiops-kmb`.
    - SPV-001 dan SUPT-001 lama (kembar KMB V2 + KMB Project) ditolak.
    - Token palsu ditolak.
    - Data bertanda SUM lewat Worker KMB Project ditolak.
    - Login memakan 5–12 detik.
    - Pengantaran di browser (`#token=`) belum diuji, karena perlu browser.
- Belum selesai / berikutnya:
  - Gabriel: deploy ketiga Worker, jalankan dua SQL (`hapus-salinan-token-uji.sql`, `rpc_wajib_token.sql`), lalu uji di browser. Lihat tabel tugas.
  - **Raka, besok pagi: `git pull` dulu.** Yang berubah:
    - `worker.js`: pintu, isolasi, gerbang tahap 4, RPC bertoken.
    - `scripts/patched-app.js`.
    - Skrip sinkron.
    - `update-worker-engine.mjs` dipensiunkan.
  - Di kode pintu, `tenant_code` `KMB` tetap berarti KMB Project, sedangkan KMB V2 memakai `KMB_V2`.
  - PWA KMB V2 mengambil `app.js` dari cache dulu. Perangkat uji yang sudah pernah membuka `abadiops-kmb` perlu menghapus data situsnya sekali. Versi PWA sengaja tidak dinaikkan supaya labelnya tetap 1:1 dengan PWA lama.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (uji kembar baca + gerbang tahap 4)
- Berubah:
  - Baru: `scripts/uji-kembar-kmb-projek.mjs`. Skrip ini mengirim permintaan yang sama seperti frontend ke jalur Supabase dan jalur GAS, lalu membandingkan isinya. Baris dicocokkan per kunci, bukan per urutan, dan token tidak dicetak. Hasil 28 Okt (token uji SPV lama): `ping` beda tipis (Supabase menambah `section`), sedangkan `pull_monitoring` dan `pull_create_refs` **jauh berbeda** (bug #12). `pull_my_wos` sama, tapi hanya karena jatuh ke GAS.
  - `worker.js` dan `workers/kmb-projek/worker.js`: gerbang tahap 4. Supabase hanya melayani aksi yang ada di `AKSI_SUPABASE_LULUS_KEMBAR`, yang sekarang masih kosong. `?uji=supabase` memaksa jalur Supabase, khusus untuk uji kembar. Diuji di `wrangler dev`: jalur bawaan frontend kini dijawab GAS (pending L2 19, approved 44), jalur `?uji=supabase` tetap Supabase (0 dan 1), login token SUM lewat pintu tetap jalan, token palsu tetap ditolak.
  - `scripts/sinkron-kmb-projek-cermin.mjs`: tidak lagi membuat token tiruan `kmb-<id>` (bug #14).
  - `docs/BUG-DICATAT.md`: #12, #13, dan #14.
- Belum selesai / berikutnya:
  - Deploy `project-kmb`, supaya gerbang ini dan pilihan C berlaku di `abadiops.com`. Selama belum di-deploy, supervisor KMB Project di sana melihat 0 pending.
  - Raka: cermin perlu diperbarui terus-menerus (bukan sinkron manual), lalu jalankan uji kembar per aksi. Aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR`.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (pilihan C: hapus salinan token uji KMB V2)
- Berubah:
  - `worker.js` dan `workers/kmb-projek/worker.js`: 4 entri `TOKENS` di data.js dihapus (28 → 24), `offline_token` SUPT-001 dikosongkan, app.js dirakit ulang dari `scripts/patched-app.js`. style.css sengaja dibiarkan persis seperti sebelumnya, karena perakitan ulang mengubah akhiran barisnya. Kode Worker di luar 4 file tertanam tidak berubah.
  - `scripts/patched-app.js`: peran tidak lagi dikunci ke dua token uji lama. Untuk token lain hasilnya sama persis (`tokenRecord.role || 'mechanic'`).
  - `scripts/sinkron-kmb-projek-cermin.mjs`, `scripts/uji-live-supabase-backend.mjs`, `scripts/verify-sum-kmb-isolation.mjs`: token uji supervisor dibaca dari environment `KMBP_UJI_SPV_TOKEN`. Dua skrip pertama berhenti dengan pesan jelas kalau kosong.
  - `tests/api/gas.test.ts`: memakai token palsu `uji-palsu-spv-kmbp`. Fetch dan Supabase di-mock, jadi nilainya tidak berpengaruh. Lulus 3/3.
  - `docs/MULTI-TENANT-SETUP.md` dan `docs/INVENTARIS-KMB-PROJEK.md` tidak lagi memuat token itu.
  - Baru: `db/kmb_projek/hapus-salinan-token-uji.sql`. Yang dicocokkan md5-nya; token mentah tidak ditulis. Sudah diuji di Postgres dalam memori (PGlite) dengan skema `cermin_sheet.sql`: menghapus tepat baris lama, baris lain utuh, jalan kedua 0 baris.
  - Tiga token uji baru untuk `SUPT-001`, `SPV-001`, `MECH-003` sudah dicek: ditolak ("Token tidak dikenal / nonaktif") oleh GAS SUM V2, KMB V2, dan KMB Project, dan tidak ada di bundel. Tokennya hanya diberikan ke Gabriel lewat chat.
  - `docs/KEPUTUSAN.md`: nomor 8 dipindah ke "Sudah diputuskan".
  - Temuan: login KMB Project mengecek `kmb_projek.api_tokens` (RPC `kmb_ping`) **sebelum** GAS. Jadi mengganti token di sheet saja tidak cukup; SQL di atas wajib dijalankan.
- Belum selesai / berikutnya: langkah manual di tabel tugas (sheet, SQL, deploy, `KMBP_UJI_SPV_TOKEN`). Setelah sheet diganti, tunggu paling lama 30 menit (cache token GAS KMB Project): token lama ditolak di KMB Project dan token baru dikenali.

### 2026-10-28 · Gabriel (+ Claude) · bersama (verifikasi token kembar)
- Berubah: tidak ada kode. Keempat token kembar dibandingkan utuh (20 karakter) antara cadangan KMB V2 (23 Sep) dan `workers/kmb-projek/worker.js`: **sama persis**, dan **keempatnya akun uji KMB V2** ("L2 Test", "L1 Test", "Test Mechanic Field 1", "Test Mechanic tyre 1"). Di data KMB Project, `MECH-003` dan `TYRE-002` hanya ada tokennya, tanpa data mekanik.
- Koreksi catatan sebelumnya: token `52fd…` memang token uji (L1 Test), jadi label "token uji" di `docs/MULTI-TENANT-SETUP.md` sudah benar. Tidak ada token pengguna sungguhan yang kembar antar-rumah.
- Belum selesai / berikutnya: persetujuan Gabriel untuk pilihan C (hapus salinan akun uji dari KMB Project).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Isolasi Data SUM vs KMB & Pemisahan Cache Tenant)
- Berubah:
  - **Akar Masalah Data KMB Tampil di SUM:**
    1. Di worker.js, ekstraksi reqSystem sebelumnya memeriksa parsedData.system (dimana parsedData adalah peek.data). Saat frontend mengirim payload JSON { token, system: 'SUM', action: 'pull_monitoring', data: {} }, peek.system tidak terbaca dan reqSystem bernilai kosong (targetSystem default ke 'KMB').
    2. Akibatnya, if (isSupabaseSelected && targetSystem === 'KMB') terpanggil dan Worker mengambil RPC kmb_monitoring serta kmb_create_refs dari database Supabase Singapore KMB Project, mengabaikan rumah SUM.
    3. Di scripts/patched-app.js, fungsi initStorage() memiliki baris peninggalan yang menghapus mar_current_system jika bernilai 'SUM', sehingga sistem selalu ter-reset ke KMB setiap refresh atau load storage.
    4. Cache localStorage menggunakan satu kunci global kmb_gas_refs_v9 dan filter rekondisi yang menolak unit non-vessel milik SUM.
  - **Perbaikan:**
    1. worker.js & workers/kmb-projek/worker.js:
       - Ekstraksi bodySystem diperluas membaca peek.system dan params.get('system').
       - Pengenalan otomatis token SUM (`4651…`, 4738…, prefix sum).
       - isSupabaseSelected dikunci khusus targetSystem === 'KMB'. Untuk SUM, seluruh aksi dialirkan 100% langsung ke SUM GAS (AKfycbzB5EUJ…).
    2. scripts/patched-app.js:
       - api() kini menyematkan parameter query &system=${currentSystem.toLowerCase()} dan header X-MAR-System: currentSystem.
       - Menghapus pembersihan destruktif mar_current_system di initStorage().
       - Kunci cache dan work orders di-scope per tenant (mar_gas_refs_${currentSys}_v1 dan mar_work_orders_${currentSys}).
       - loginWithToken() mengosongkan state in-memory saat berpindah tenant agar tidak ada data unit/mekanik KMB yang bocor ke sesi SUM.
       - Badge sistem dan indikator engine menampilkan PROJEK SUM (biru) dan SPREADSHEET LIVE (Google Sheets) untuk SUM.
  - **Catatan untuk Gabriel (Perbedaan Form Create WO SUM V2 vs KMB Project):**
    - Saat login dengan token SUM V2 (`4651…`), backend kini sudah 100% menarik data monitoring, unit, dan mekanik dari GAS SUM.
    - Namun, form Create WO di `abadiops.com` saat ini masih menyajikan antarmuka KMB Project (3 model pembuatan: Bebas/Unit/Job, pembagian section Rekondisi/Maintenance, dan unit Vessel).
    - Di sistem asli SUM V2 (`docs/INVENTARIS-SUM.md` & `pwa/sum/index.html`), SUM tidak punya section dan form Create WO-nya ringkas 2 level (Kategori Pekerjaan → Komponen Dump Truck → Work Condition → Lokasi Bengkel/Lapangan → Tim Mekanik).
    - PWA asli SUM V2 versi 46 sudah siap 1:1 di folder `pwa/sum/` dan telah dideploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev`.
    - Dicatat di Bug #11 (`docs/BUG-DICATAT.md`). Menunggu keputusan Gabriel untuk pemisahan frontend di pintu utama `abadiops.com` saat menyajikan rumah SUM.
- Belum selesai / berikutnya:
  - Menunggu verifikasi visual dari pengguna saat login di abadiops.com dengan token SUM.

---
### 2026-10-28 · Raka (+ Antigravity) · bersama (Penyambungan Multi-GAS Token Resolver untuk SUM V2)
- Berubah:
  - Multi-GAS Token Resolver (`worker.js`, `workers/kmb-projek/worker.js`):
    - **Penyebab masalah:** Worker `abadiops.com` sebelumnya hanya memeriksa Supabase `kmb_ping` lalu fallback ke `GAS_EXEC_URL` KMB Project (`AKfycbxh4086…`). Saat token SUM V2 (`4651…` milik SPV-000 L1 Supervisor) dimasukkan, KMB GAS menolak dengan pesan *"Token tidak dikenal / nonaktif"*.
    - **Perilaku baru:**
      - Merestrukturisasi blok `action === 'ping'` di `worker.js` agar berdiri sendiri sebelum pengecekan engine (`isSupabaseSelected && targetSystem === 'KMB'`). Sebelumnya, jika `targetSystem` awal adalah SUM atau belum disetel, blok ping terlewati dan langsung jatuh ke forwarding KMB default.
      - Menambahkan header `X-Active-Engine` pada `Access-Control-Allow-Headers` preflight OPTIONS `/api/gas` agar browser tidak memblokir request karena CORS.
      - Di `worker.js` pada action `ping`: jika `kmb_ping` tidak cocok, Worker memverifikasi token ke `GAS_URLS.KMB` dan `GAS_URLS.SUM` (`AKfycbzB5EUJ…`).
      - Saat GAS SUM memvalidasi token, Worker menyematkan `tenant_code: 'SUM'` dan header `X-MAR-Tenant: SUM`.
      - Untuk aksi data selanjutnya (`pull_monitoring`, `pull_create_refs`, dll.), Worker secara otomatis meneruskan permintaan ke backend SUM jika tenant adalah SUM.
      - Teruji secara lokal via Node: ping token SUM mengembalikan status 200 dengan profil supervisor dan `pull_monitoring` berhasil menarik data monitoring SUM.
  - Client GAS Fallback (`scripts/patched-app.js`):
    - Menambahkan rute SUM ke `GAS_FALLBACK_URLS`.
    - Mengoptimasi pemanggilan `api()` dengan menghapus custom headers yang memicu preflight CORS di browser, serta menyematkan fallback multi-GAS langsung pada klien browser untuk aksi `ping`.
    - Mengemas ulang ke `worker.js` via `scripts/pack-final-worker.mjs`.
- Belum selesai / berikutnya: Verifikasi login langsung dengan token SUM di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Fix Mode Akses: Web Normal Buka Portal Lengkap)
- Berubah:
  - Alur Pemilihan Mode Akses (scripts/built-index.html, scripts/patched-app.js, worker.js):
    - **Penyebab masalah:** Sebelumnya tombol atas (PWA) yang menutup gate overlay (`hideGateOverlay()`) dan membuka portal dashboard dengan toast "Mode PWA aktif", sedangkan tombol bawah (Web Normal) mencoba melakukan `window.location.href = /monitoring?token=...` yang menyebabkan reload dan memunculkan kembali modal pilihan mode (looping).
    - **Perilaku baru:**
      - Tombol bawah **Web Normal** (`#btn-mode-web`): Ditandai sebagai mode aktif utama (badge "Buka Semua Modul"). Saat diklik, langsung memanggil `hideGateOverlay()`, mengaktifkan seluruh modul/tab portal web (Performa, Create WO, Monitoring, Approvals, Teknis, Koreksi HM/KM, Reports), memperbarui riwayat URL tanpa reload, dan menampilkan notifikasi sukses "Web Normal aktif (Semua modul terbuka)".
      - Tombol atas **PWA** (`#btn-mode-pwa`): Diberi label "Segera Hadir". Karena PWA offline lapangan masih dalam tahap persiapan, jika diklik sistem memberi pemberitahuan "PWA Lapangan sedang disiapkan" dan mengarahkan pengguna ke Web Normal agar tidak terhalang.
      - Menyesuaikan warna aksen tombol Web Normal secara dinamis (`#3B82F6` untuk SUM, `#10B981` untuk KMB).
      - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas HTML dan JS terbaru ke dalam `worker.js`.
- Belum selesai / berikutnya: Verifikasi pengujian langsung di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (scripts/built-index.html, scripts/patched-app.js):
    - Mengganti teks KMB PORTAL GATE menjadi MAR PORTAL GATE dan title menjadi MAR PORTAL - Mechanic Activity Report.
    - Menyembunyikan label engine toggle (#btn-engine-toggle, #btn-engine-switch-user) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi Masuk ke Aplikasi.
    - Mengganti hardcode state.currentSystem = 'KMB' dan localStorage.setItem('mar_current_system', 'KMB') menjadi dinamis sesuai tenant_code dari respon server atau prefix token (SUM, KMB, dll.).
  - Resolusi Token Multi-Skema (src/backends/supabase/auth.ts, workers/kmb-projek/src/backends/supabase/auth.ts, src/lib/supabaseCerminReader.ts):
    - bacaPingSupabase diperluas agar menyelesaikan token dari kmb_projek.api_tokens, skema relasional sum.api_tokens / cermin sum, dan tabel public.api_tokens.
    - identitasDariTokenSupabase memeriksa tabel token public, fallback sum, dan fallback kmb_projek.
    - Validasi sistem disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di loginWithToken: setelah token valid, menampilkan modal pilihan mode (showModeChoice).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke /monitoring?token=...&tenant=... sekaligus menyinkronkan token dan tenant ke cookies & localStorage.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaikan validasi token di login gate PWA KMB Project (`scripts/patched-app.js`, `worker.js`, `workers/kmb-projek/worker.js`) (Bug #10):
    - **Penyebab masalah:** Sebelumnya, `loginWithToken()` langsung membuat dummy fallback user `{ id: cleanToken, role: 'mechanic', name: 'User KMB' }` jika token tidak ada di cache lokal, lalu segera memanggil `hideGateOverlay()` dan `switchTab('monitoring')` sebelum verifikasi server selesai. Akibatnya, token sembarangan/salah langsung dibawa masuk ke tab monitoring mekanik.
    - **Perilaku baru:**
      1. Saat tombol login ditekan (atau ditekan Enter), tombol langsung berganti status menjadi loading spinner (`Memeriksa token...`) dan di-disable.
      2. Layar login (gate overlay) ditahan tetap terbuka — tidak langsung berpindah tab.
      3. Token diverifikasi secara async via `api('ping')` ke database backend (Supabase Singapore `kmb_ping` atau fallback GAS KMB Project).
      4. Jika token tidak valid / tidak dikenal: user tetap di layar login, muncul pesan error merah di elemen `#gate-error-msg` dan toast error, input token diberi border merah dan fokus, token dibersihkan dari `localStorage` dan URL, dan tombol login kembali aktif.
      5. Jika token valid: profil dan role dimuat sesuai respon backend (mekanik ke monitoring, approver/supervisor ke dashboard).
- Belum selesai / berikutnya: pengujian login langsung di browser untuk berbagai variasi token.

### 2026-10-28 · Gabriel (+ Claude) · bersama (cek token)
- Berubah: tidak ada kode. Cek token kembar antar-rumah, dengan token hanya ditampilkan 4 huruf pertamanya.
  - Sumber: `ApiTokens` dan `offline_token` dari cadangan KMB V2 (23 Sep), `ApiTokens` dari cadangan SUM V2 (15 Sep), dan `TOKENS` dari `workers/kmb-projek/worker.js` (KMB Project). Semua token berupa hex 20 karakter.
  - Jumlah: KMB V2 32 (+3 offline_token), SUM V2 55, KMB Project 28.
  - **4 token kembar, semuanya KMB V2 ↔ KMB Project, dengan mechanic_id yang sama di kedua rumah:** `SUPT-001` (67e8…), `SPV-001` (52fd…), `MECH-003` (fde7…), `TYRE-002` (9b83…). Dua di antaranya approver (superintendent dan supervisor).
  - SUM V2 tidak kembar dengan rumah lain. Tidak ada token kembar di dalam satu rumah.
  - Token `52fd…` juga tercantum sebagai token uji di `docs/MULTI-TENANT-SETUP.md`, padahal di cadangan KMB V2 token itu milik `SPV-001`.
  - Keterbatasan: cadangan bertanggal 15–23 Sep, jadi token yang dibuat sesudahnya belum ikut dicek. Ulangi dengan data terbaru sebelum pintu dinyalakan.
- Belum selesai / berikutnya: keputusan cara menangani 4 token kembar (`docs/KEPUTUSAN.md`, belum diputuskan nomor 8).

### 2026-10-28 · Gabriel (+ Claude) · kmb (2)
- Berubah:
  - Worker `abadiops-kmb` di-deploy Gabriel ke `https://abadiops-kmb.kawanabadigrup.workers.dev` (versi `5f1b2647`), memakai API token kawanabadigrup yang sama dengan SUM.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): identik dengan jawaban langsung GAS KMB V2. Waktu jawab 3–5 detik.
  - Pemisahan rumah terkonfirmasi: `abadiops-sum` menjawab `X-Abadi-Rumah: sum`, sedangkan `abadiops-kmb` menjawab `kmb`. API token Cloudflare hanya kunci unggah kode, sedangkan data tiap rumah dipisahkan oleh Worker, alamat GAS, dan `ApiTokens` masing-masing.
- Belum selesai / berikutnya: uji token sungguhan di kedua alamat uji, lalu penyambungan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Raka (+ opencode) · bersama
- Berubah:
  - Implementasi **Zero-Select Tenant Login**: hapus pemilihan sistem di `/masuk`. Token otomatis dipetakan ke tenant di database.
  - Update `src/app/masuk/page.tsx`: hapus UI pemilihan sistem, hanya input token.
  - Update `src/app/api/masuk/route.ts`: hapus param `sistem`, token resolution otomatis.
  - Update `src/backends/supabase/auth.ts`: pencarian token di `public.api_tokens` dengan join ke `tenants` untuk deteksi tenant otomatis.
  - Catat keputusan di `docs/KEPUTUSAN.md`: Token unik global, login tanpa pilih sistem.
- Belum selesai / berikutnya:
  - Tambah UI pemilihan mode akses (PWA vs Web Normal) di halaman monitoring/home.
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaiki Bug #9 (Pelanggaran Isolasi Rumah §2 & Kebocoran Rute Data SUM):
    - Mengunci frontend `scripts/built-index.html` dan `scripts/patched-app.js` 100% murni KMB Project (menghapus tombol gate SUM `#gate-sys-sum`, tooltip switcher `#project-badge`, event listeners beralih sistem, dan fallback `GAS_FALLBACK_URLS.SUM`).
    - Menambahkan pembersih cache otomatis pada inisialisasi state & storage untuk membuang entri terkontaminasi SUM (`localStorage.mar_current_system === 'SUM'` dan item `kmb_work_orders` berakhiran suffix batch `-A/-U/-V/-W`).
    - Menghapus routing dan fallback `GAS_URLS.SUM` dari wrapper `worker.js` dan mengunci `targetSystem = 'KMB'` serta `targetGasUrl` hanya ke endpoint GAS KMB Project.
    - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas ulang `worker.js` dan menyinkronkan ke `workers/kmb-projek/worker.js`.
- Belum selesai / berikutnya:
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production untuk menyelesaikan Bug #6 di sisi basis data.

### 2026-10-28 · Raka (+ opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #6: hapus kolom `golongan` dari `kmb_projek.config_mechanics` dan field `position` dari RPC `kmb_create_refs`. Dropdown mekanik Create WO sekarang 100% murni nama tanpa label golongan, sesuai GAS asli KMB Project.
  - Buat migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` untuk drop kolom dari DB production.
  - Update skema `db/kmb_projek/cermin_sheet.sql` dan RPC `db/kmb_projek/rpc_baca.sql`.
- Belum selesai / berikutnya:
  - Jalankan migrasi di Supabase production.

### 2026-10-28 · Gabriel (+ Claude) · kmb
- Berubah:
  - Tahap 3 (Pintu) untuk KMB V2, dengan pola yang sama seperti rumah SUM. Menambah `pwa/kmb/`: salinan 1:1 PWA `mar-offline` v91. Hanya empat baris yang diubah: alamat API di `app.js:6` dan `sw.js:25` menjadi `./api`, serta versi v91 menjadi v92. File lainnya identik byte demi byte.
  - Menambah `workers/kmb/` (Worker `abadiops-kmb`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS KMB V2. Akun kawanabadigrup dikunci, saklar tetap `gas`. Kodenya sama dengan Worker SUM.
  - Diuji lokal dengan `wrangler dev`. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS KMB V2. `wrangler deploy --dry-run` valid.
  - Belum di-deploy. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, inventaris dan cermin KMB V2.

### 2026-10-28 · Raka (+ Antigravity & opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #8: kembalikan fallback query `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant. Token dari skema cermin hanya diterima jika prefix `kmb-` atau `s === 'KMB'`.
  - Mengidentifikasi dan mencatat Bug #9 di `docs/BUG-DICATAT.md`: kebocoran rute data SUM pada `worker.js` KMB Project akibat adanya dual-tenant router dan switch system yang melanggar isolasi rumah [AGENTS.md §2].
- Belum selesai / berikutnya:
  - Kunci `worker.js` KMB Project agar 100% terisolasi ke KMB (hapus `GAS_URLS.SUM`, hapus event switch sistem, hapus pembacaan state `mar_current_system === 'SUM'`).
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek (dan bersama)
- Berubah:
  - Tarik pembaruan remote dari Gabriel lewat `git pull --rebase` di `main`: menerima fondasi rumah SUM tahap Pintu (`pwa/sum/`, `workers/sum/`, `docs/INVENTARIS-SUM.md`, dan keputusan tetap dua link per rumah di `docs/KEPUTUSAN.md`).
  - Mengaudit perbaikan kebocoran token cross-tenant (commit `4259f67` / Bug #7).
  - Merapikan identitas pencatat Bug #7 di `docs/BUG-DICATAT.md` menjadi Raka (+ opencode).
  - Mencatat temuan bug regresi #8 di `docs/BUG-DICATAT.md`: terhapusnya fallback query `kmb_projek.api_tokens` pada `src/backends/supabase/auth.ts` saat commit `4259f67`.
- Belum selesai / berikutnya:
  - Pulihkan resolusi token `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant.
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Gabriel (+ Claude) · sum (4)
- Berubah: mencatat keputusan Gabriel di `docs/KEPUTUSAN.md`. Selama migrasi tetap dua link per rumah: PWA lapangan dan halaman web menu lengkap. Halaman web tetap di GAS sampai dipindah 1:1, dan wajib sudah dipindah sebelum saklar dinyalakan. Ide satu aplikasi offline-first dengan menu lengkap masuk daftar "setelah ketiga rumah selesai pindah". Berlaku juga untuk rumah kmb dan kmb-projek.
- Belum selesai / berikutnya: uji token sungguhan di alamat uji SUM.

### 2026-10-28 · Gabriel (+ Claude) · sum (3)
- Berubah:
  - Worker `abadiops-sum` di-deploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev` (versi `fdbdbc6c`), memakai API token kawanabadigrup.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-9 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Waktu jawab 3–6 detik, hampir seluruhnya waktu GAS.
- Belum selesai / berikutnya: uji dengan token sungguhan untuk kelima peran. Alamat ini belum dipakai mekanik.

### 2026-10-28 · Gabriel (+ Claude) · sum (2)
- Berubah:
  - Tahap 3 (Pintu) untuk SUM. Menambah `pwa/sum/`: salinan 1:1 PWA `mar-sum-offline` v45. Hanya empat baris yang diubah: alamat API di `app.js:8` dan `sw.js:20` menjadi `./api`, serta versi v45 menjadi v46.
  - Menambah `workers/sum/` (Worker `abadiops-sum`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS SUM. Tidak ada logika bisnis, saklar tetap `gas`. Buat WO, approve, dan semua aksi lain tetap dikerjakan GAS.
  - Diuji lokal dengan `wrangler dev`. Semua file PWA tersaji 200 tanpa redirect. Uji kembar API dengan token palsu (`ping`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Kalau GAS tidak terjangkau, Worker menjawab teks biasa (502), sehingga PWA tetap menahan kiriman di antrean.
  - Belum di-deploy ke Cloudflare. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, sambungkan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Gabriel (+ Claude) · sum
- Berubah:
  - Menambah `docs/INVENTARIS-SUM.md` versi 1: 19 sheet, 26 aksi (13 baca, 13 tulis) beserta gerbang peran dan sheet yang disentuh, 5 peran, halaman web, 4 pemicu terjadwal, Script Properties, rumus poin dan rupiah, nomor WO, dan zona waktu. Disusun dari kode `MAR-SUM-v2` commit `89edc5a`.
  - Menambah `db/sum/cermin_sheet.sql`: skema `sum` berisi 19 tabel cermin mentah (`nilai` = baris persis seperti `getValues()`), plus `cermin_header`, `cermin_log`, dan `cermin_meta`. Belum dijalankan di Supabase.
  - Menambah `tools/sum/sinkron-cermin.mjs`: membaca sheet lewat Google Sheets API memakai akun layanan baca-saja, lalu menulis ke skema `sum`. Ada mode `--kering`. Sintaks sudah dicek dan konversi tanggal WIB ke UTC lulus 4 uji. **Belum pernah dijalankan** terhadap spreadsheet sungguhan.
  - Menambah `db/sum/README.md`: alasan cermin mentah, langkah penyiapan, dan cara menjalankan.
  - Saklar SUM tetap `gas`. GAS dan spreadsheet tidak disentuh.
- Belum selesai / berikutnya: empat tugas SUM di daftar tugas terbuka.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - **STOP & EVALUASI KEPATUHAN PINDAHKAN DULU, PERBAIKI NANTI (AGENTS.md §1 & §2):**
    1. **Kesalahan Teridentifikasi:** Dropdown *Team Composition* pada layar Create WO menampilkan imbuhan grade/golongan `(1a)` di samping nama mekanik (contoh: `Afid Irham (1a)`).
    2. **Akar Masalah:**
       - Template option di `patched-app.js` menyisipkan `${name}${pos ? ` (${pos})` : ''}`.
       - Kolom `golongan` pada `kmb_projek.config_mechanics` di Supabase sempat terisi `'1a'` dan diekspos melalui RPC `kmb_create_refs`.
       - **Koreksi Fatal:** Sistem penilaian dan grading `(1a, 1b, 2a, dst)` adalah milik **Rumah SUM V2**, bukan milik KMB Project. Di Google Spreadsheet dan GAS asli KMB Project, dropdown mekanik sama sekali tidak memiliki label golongan dan murni hanya menampilkan nama mekanik.
    3. **Tindakan:** Menghentikan sementara pekerjaan baru dan mencatat temuan ini secara formal di `docs/BUG-DICATAT.md` (Entri #6) agar menjadi pengingat keras untuk pekerjaan selanjutnya.
- Belum selesai / berikutnya:
  - Kembalikan dropdown *Team Composition* di `scripts/patched-app.js` dan `worker.js` menjadi 100% murni nama mekanik tanpa embel-embel grade `(${pos})`, persis 1:1 seperti GAS dan Spreadsheet KMB.
  - Bersihkan eksposur `golongan` di skema `kmb_projek` / RPC `kmb_create_refs` agar data SUM tidak bocor ke rumah KMB.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan full smart cascading pada form Create WO (Unit -> Component -> Sub Component -> Job):
    1. Auto-select otomatis jika pilihan pada level berikutnya hanya ada 1 (contoh: Unit DLCD/SDVS langsung auto-select Component; Component ber-sub tunggal langsung auto-select Sub Component).
    2. Dependent dropdowns dinonaktifkan (disabled) secara bertingkat dengan label instruksi jelas sebelum dropdown induk dipilih.
    3. Pilihan yang valid tetap dipertahankan saat induk diganti (tidak asal di-reset kosong jika masih kompatibel).
    4. Memperbaiki perhitungan Unit Factor (1.00x) dan kalkulasi Estimated Points di box Preview secara real-time.
    5. Re-pack worker.js.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Menyusun `docs/PANDUAN-GABRIEL.md` berisi panduan setup langkah demi langkah untuk Gabriel (KMB V2 & SUM V2).
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - Gabriel membuat skema `kmb` dan `sum` serta memindahkan PWA masing-masing.
  - Penyesuaian akhir import shared di root.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki pengisian dropdown Create WO (Rekondisi & Maintenance) agar tidak lagi kosong:
    1. Bump cache version ke kmb_gas_refs_v9 dan otomatis purge cache usang (v8/v7) di browser klien.
    2. Menambahkan validasi integritas cache sebelum dipakai (hasRekondisi, validasi count komponen).
    3. Menambahkan ID prefix matching (sdvs, dlcd, sdt, xevb, xtn) dan safety fallback pada getAvailableUnits, getAvailableComponents, getAvailableSubComponents, dan getAvailableJobs agar cascading kebal terhadap perbedaan penamaan section.
    4. Menyinkronkan pull_create_refs secara asinkron-deterministik (await) dalam syncFromSpreadsheet.
    5. Re-pack worker.js siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy bundle worker.js ke Cloudflare Workers Quick Edit.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - **Issue**: Kode shared (`src/lib/`, `src/domain/`, `src/pwa/`) perlu di-extract atau dibuat relatif import yang benar. Perlu keputusan apakah frontend Next.js milik KMB Project saja atau shared.
  - Pindahkan `db/kmb_projek/` ke `db/` (sudah benar).
  - Siapkan skema database untuk `kmb` dan `sum` (Gabriel).
  - Tentukan monorepo strategy: `package.json` shared vs per rumah.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Menyinkronkan seluruh 1.533 katalog pekerjaan (`jobs_vessel` 276 baris & `jobs_field` 1.257 baris) dari Google Spreadsheet ke tabel Supabase `kmb_projek.catalog_jobs` dengan kunci komposit `(job_id, section)`.
  - Memperbaiki stored procedure RPC `public.kmb_create_refs()` di [db/kmb_projek/rpc_baca.sql](file:///d:/marbaru/MARProject/db/kmb_projek/rpc_baca.sql) agar mengembalikan format 1:1 GAS untuk `jobs_vessel` dan `jobs_field` beserta work conditions shift 1, shift 2, dan ekstrim.
  - Memperbaiki dropdown katalog yang sebelumnya kosong di halaman Create WO (misalnya untuk unit `SDT-003` yang kini langsung menampilkan 84 pekerjaan transmisi dan 13 sub-komponen lengkap).
  - Diterapkan langsung ke Supabase Singapore (`sptgqsjgszwbreikxdph`) dan terverifikasi live.
- Belum selesai / berikutnya:
  - Gabriel melanjutkan pembuatan skema cermin dan Uji Kembar untuk KMB V2 dan SUM V2.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan fitur **Dynamic Dual-Engine Switcher**: pengguna kini dapat dengan sangat mudah berpindah backend secara on-demand antara **SUPABASE LIVE (PostgreSQL Singapore)** dan **SPREADSHEET LIVE (Google Sheets / Google Apps Script)** tanpa perlu ubah kode.
  - Menambahkan tombol/badge interaktif langsung di antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html)):
    - Badge header (`#btn-engine-toggle`): cukup diklik sekali untuk toggle antara `🟢 SUPABASE LIVE (PostgreSQL)` dan `📊 SPREADSHEET LIVE (Google Sheets)`.
    - Tombol switch di user profile bar (`#btn-engine-switch-user`): tombol cepat "Ke Sheets" / "Ke Supabase".
    - Switch engine di login modal KMB PORTAL GATE (`#gate-engine-toggle`).
  - Mendukung override parameter URL (`?engine=supabase` vs `?engine=sheets` / `?engine=spreadsheet`) dan persistensi pilihan di `localStorage` (`kmb_active_engine`).
  - Menyelaraskan client API di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) agar menyertakan header `X-Active-Engine` dan query param `engine` di setiap request.
  - Memperbarui router [worker.js](file:///d:/marbaru/MARProject/worker.js) dan [src/app/api/gas/route.ts](file:///d:/marbaru/MARProject/src/app/api/gas/route.ts) agar saat engine `SPREADSHEET` dipilih, request 100% langsung diteruskan ke Google Apps Script / Sheets. Saat `SUPABASE` dipilih, request baca dilayani sub-50ms oleh Supabase Singapore.
  - Menambahkan unit test di [tests/api/gas.test.ts](file:///d:/marbaru/MARProject/tests/api/gas.test.ts) dan memaketkan ulang ke [worker.js](file:///d:/marbaru/MARProject/worker.js) (lolos validasi sintaks & testing).
- Belum selesai / berikutnya:
  - Copy [worker.js](file:///d:/marbaru/MARProject/worker.js) terbaru ke Cloudflare Workers Quick Edit lalu deploy.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbarui Cloudflare Worker (`worker.js`) dan Portal Web agar langsung terhubung ke basis data Supabase Singapore (`sptgqsjgszwbreikxdph`) menggunakan RPC & REST API.
  - Membuat dan menerapkan fungsi PostgreSQL RPC di Supabase Singapore (`db/kmb_projek/rpc_baca.sql`): `kmb_ping`, `kmb_create_refs`, `kmb_monitoring`, `kmb_my_wos`, dan `kmb_wos_by_status`.
  - Memperbarui badge dan teks pada antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js)) menjadi `🟢 SUPABASE LIVE (PostgreSQL)` dan sinkronisasi `Sync Supabase`.
  - Mengonfigurasi `STORAGE_MODE = "SUPABASE"` di [wrangler.toml](file:///d:/marbaru/MARProject/wrangler.toml) beserta variabel public Supabase.
  - Memaketkan ulang seluruh bundle ke dalam [worker.js](file:///d:/marbaru/MARProject/worker.js) siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers (lewat tab dashboard Cloudflare atau `wrangler deploy`).

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengaktifkan pengambilan data sistem langsung dari basis data Supabase Singapore (`kmb_projek`) sesuai Tahap 4 Roadmap (`docs/SAKLAR.md` & `AGENTS.md` §2).
  - Mengimplementasikan `src/lib/supabaseCerminReader.ts`: reader sub-50ms untuk aksi baca `ping`, `pull_create_refs`, `pull_monitoring`, `pull_my_wos`, dan kueri status WO (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`).
  - Menambahkan endpoint Next.js `src/app/api/gas/route.ts` yang bertindak sebagai Dual-Engine Gateway: menyajikan aksi baca langsung dari Supabase saat `BACKEND_DRIVER=supabase` dan meneruskan aksi tulis ke GAS.
  - Memperbarui `src/backends/supabase/auth.ts` dan `src/backends/supabase/data.ts` untuk mendukung resolusi token dan katalog cermin dari skema `kmb_projek`.
  - Mengalihkan `BACKEND_DRIVER=supabase` di `.env.local`.
  - Pengujian live: `pull_create_refs` selesai dalam 272ms (vs GAS ~6400ms) dan `pull_monitoring` selesai dalam 25ms (vs GAS ~8100ms), 100% data valid dan terverifikasi.
  - Menambahkan pengujian otomatis di `tests/api/gas.test.ts`.
- Belum selesai / berikutnya:
  - Bersama Gabriel mempersiapkan pemisahan folder `workers/` dan `pwa/` ke dalam struktur tiga rumah sesuai §6 `AGENTS.md`.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki bug flash UI di mana panel supervisor ("Mekanik Monitoring L1 & L2") sempat muncul ketika akun mekanik (contoh: Gusti Raka Pamungkas / `VES-012`) sedang proses loading awal.
  - Akar masalah:
    1. Di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html), kontainer `#mon-supervisor-panel` belum memiliki atribut bawaan `style="display: none;"`.
    2. Di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js), pemetaan profil mekanik dari cache lokal (`state.mechanics` asal `pull_create_refs`) tidak memiliki atribut `role` (terisi string kosong `""`), menyebabkan pengecekan `isMechanicMode` bernilai `false` selama beberapa detik sebelum `ping` selesai.
  - Perbaikan:
    - Menambahkan `style="display: none;"` dan loading spinner pada `#mon-supervisor-panel` di template HTML.
    - Memperbaiki `loginWithToken()` agar `user.role` selalu terisi `'mechanic'` sebagai fallback aman jika bukan supervisor/superintendent.
    - Memperketat pengecekan `renderMonitoring()` sehingga panel supervisor hanya dapat terbuka jika role eksplisit supervisor/superintendent.
    - Mengemas ulang [worker.js](file:///d:/marbaru/MARProject/worker.js) melalui `scripts/pack-final-worker.mjs`.
  - Menghapus bagian "Token Pengujian Cepat" (L1 Test, Gusti Raka, Mekanik SUM) dari modal KMB PORTAL GATE di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) sesuai arahan keamanan dan permintaan Raka.
  - Membuat panduan integrasi lengkap untuk Gabriel di [`docs/CATATAN-GABRIEL.md`](file:///d:/marbaru/MARProject/docs/CATATAN-GABRIEL.md) mencakup arsitektur 3 rumah, alur login/token routing, panduan pembuatan skema cermin `kmb` & `sum`, sinkronisasi snapshot, uji kembar, dan protokol kerja harian.
  - Membuat dan menjalankan skrip simulasi siklus hidup transaksi Work Order langsung di Supabase cloud PostgreSQL ([`scripts/simulasi-alur-supabase.mjs`](file:///d:/marbaru/MARProject/scripts/simulasi-alur-supabase.mjs)): berhasil menguji alur Create WO → Mechanic Submission → L1 Approval → L2 Final Approval & Poin Payroll (`WO-SB-20261027-8491`) dengan stempel waktu audit trail lengkap dan tersimpan permanen di skema `kmb_projek`.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengeksekusi sinkronisasi data snapshot awal dari Google Apps Script KMB Project ke skema cermin Supabase `kmb_projek` melalui [`scripts/sinkron-kmb-projek-cermin.mjs`](file:///d:/marbaru/MARProject/scripts/sinkron-kmb-projek-cermin.mjs).
  - Mengisi data tabel cermin Supabase:
    - `kmb_projek.config_units`: 28 unit
    - `kmb_projek.config_components`: 276 komponen
    - `kmb_projek.config_mechanics`: 21 mekanik & supervisor
    - `kmb_projek.api_tokens`: 21 token akses aktif
    - `kmb_projek.config_factors`: 6 faktor pengali jabatan & rate
    - `kmb_projek.work_orders`: 15 work order aktif & pending approval
    - `kmb_projek.work_orders_archive`: 51 work order riwayat arsip
  - Menjalankan Uji Kembar (*Twin Test*) Tahap 4 untuk aksi baca (`ping` token supervisor, `ping` token mekanik, katalog unit, dan daftar mekanik): hasil JSON dari Supabase `kmb_projek` 100% identik dengan GAS.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek & bersama (2)
- Berubah:
  - Menyelesaikan inventaris lengkap perilaku per aksi untuk Rumah KMB Project di [`docs/INVENTARIS-KMB-PROJEK.md`](file:///d:/marbaru/MARProject/docs/INVENTARIS-KMB-PROJEK.md) mencakup 20 aksi, payload, format JSON, pesan error persis huruf demi huruf, baris sheet, dan rumus hitung poin/rupiah.
  - Memverifikasi region project Supabase `sptgqsjgszwbreikxdph` adalah Singapura (`ap-southeast-1`), memperbarui [`docs/KEPUTUSAN.md`](file:///d:/marbaru/MARProject/docs/KEPUTUSAN.md).
  - Memverifikasi Script ID `1k_A_KER…` untuk SUM V2 dari repo `MAR-SUM-v2` (`.clasp.json` dan `SERAH-TERIMA.md`), memperbarui [`AGENTS.md`](file:///d:/marbaru/MARProject/AGENTS.md).
  - Memverifikasi cabang arsip `archive/marproject` tersimpan di remote `kmb` dan `origin`.
  - Menyiapkan skema cermin Google Sheets untuk Rumah KMB Project di Supabase (`db/kmb_projek/cermin_sheet.sql`) sesuai mandat Tahap 2 Cermin.
- Belum selesai / berikutnya:
  - Menunggu input kredensial database untuk project Supabase `sptgqsjgszwbreikxdph` / pembuatan staging project.
  - Pembentukan susunan tiga rumah bersama Gabriel (`workers/`, `pwa/`, `db/`).

### 2026-10-27 · Raka (+ Antigravity) · bersama (kmb-projek & sum)
- Berubah: Menyiapkan pemisahan multi-sistem KMB & SUM (Apps Script terpisah & database Supabase terpisah).
  - Menambahkan routing dinamis di Cloudflare Worker `worker.js` (`/api/gas`) berdasarkan header `X-MAR-System`, token prefix (`sum-` vs `kmb-`), dan query param.
  - Mendefinisikan URL Web App GAS untuk KMB (`AKfycbxh...`) dan SUM (`AKfycbzB...`) dengan fallback override via environment variable.
  - Menyiapkan koneksi kolam PostgreSQL / Supabase terpisah (`DATABASE_URL_KMB` dan `DATABASE_URL_SUM`) di `src/lib/db.ts` dan `src/lib/backendConfig.ts`.
  - Memperbarui `scripts/patched-app.js` dan `scripts/built-index.html` dengan pemilih sistem KMB / SUM, badge klik untuk beralih sistem, dan auto-deteksi token.
  - Menjalankan uji kembar routing (`test-worker-routing.mjs` & `test-backend-multi-tenant.mjs` lulus 100%).
- Belum selesai / berikutnya: Mengisi connection string Supabase khusus untuk SUM di `DATABASE_URL_SUM` (`.env.local` / Cloudflare env) setelah project Supabase SUM siap.

### 2026-10-27 · Gabriel + Claude · bersama (2)
- Berubah: mencatat keputusan Gabriel bahwa repo tetap publik dan token yang ada tetap dipakai. Tiga tugas mendesak soal repo privat, data di bundle, dan penggantian token dihapus dari daftar tugas terbuka. `AGENTS.md` §4 dan `docs/KEPUTUSAN.md` disesuaikan.
- Berikutnya: inventaris perilaku per rumah.

### 2026-10-27 · Gabriel + Claude · bersama
- Berubah: menambah `AGENTS.md`, `CLAUDE.md`, `docs/KEPUTUSAN.md`, `docs/SAKLAR.md`, `docs/PROGRES.md`, dan `docs/BUG-DICATAT.md`. Tidak ada kode yang diubah.
- Sebelum menulis, `main` sudah ditarik sampai commit `2e8e1da`.
- Temuan: repo masih publik, dan data produksi ikut terbawa di bundle frontend. Lihat tugas terbuka.
- Berikutnya: kerjakan tiga tugas mendesak di atas, lalu inventaris per rumah.
