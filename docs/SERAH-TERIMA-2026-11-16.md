# Serah-terima migrasi abadiops: Gabriel (+ Claude) → Raka, 16 Nov 2026

Mulai dari dokumen ini. Rinciannya ada di dokumen lain (daftar di akhir); di sini hanya keadaan, langkah berikutnya,
cara kerja, akses, dan aturan. Ditulis Claude atas permintaan Gabriel sebelum ia lepas tangan.

## 1. Keadaan sekarang (16 Nov 2026 pagi)

**Arah:** kode GAS asli keempat rumah dijalankan 1:1 di Cloudflare Workers di atas cermin spreadsheet di Supabase
Gedung 1. Migrasi per rumah lewat tombol **Mulai migrasi** di panel `abadiops.com/saklar`, berurutan
**BUPR → KMB Projek → KMB V2 → SUM**, dengan jaring pengaman tombol **Kembali ke GAS** (cermin balik ke spreadsheet).

| | BUPR (`kmbbupr`) | KMB Projek (`kmbprojek`) | KMB V2 / TRA (`kmbtra`) | SUM (`sum`) |
|---|---|---|---|---|
| Saklar | `gas` | `gas` | `gas` | `gas` |
| GAS produksi (tambalan tutup GAS, tidur selama `gas`) | @12 | @50 | @300 | @200 |
| PWA lama (GitHub Pages) → Worker | ✔ `kawanabadigrup/PWA-Project-KMB2` projek-v5 | ✔ `gabrielrurent/PWA-Project-KMB` projek-v15 | ✔ `gabrielrurent/mar-kmb-v2-offline` v92 | ✔ `gabrielrurent/mar-sum-offline` sum-v46 |
| Latihan cermin balik di salinan | ✔ | ✔ | ✔ | ✔ |
| Hari tanpa selisih (syarat 7) | 4 → paling cepat **19 Nov** | 3 → **20 Nov** | 1 → **22 Nov** (lihat §6) | 3 → **20 Nov** |
| Notifikasi push | 0 langganan | 0 langganan | kunci VAPID di Worker | kunci VAPID di Worker |

Semua syarat tombol Mulai rumah asli sudah hijau **kecuali 7 hari**; tombolnya menyala sendiri saat hitungan sampai 7
(diperiksa tiap hari mulai 02.00 WIB). Daftar periksa lengkap: `docs/SIAP-MULAI.md`.

**Produksi (semua dari `main`, deploy bertahap 1% → uji versi baru → 100%):**

| Worker | Versi tayang | Rollback |
|---|---|---|
| `abadiops-pintu` (abadiops.com) | `2e500a8b` (kode `c87e894d` + sandi baru 16 Nov) | `18b5e9bb` — lalu pasang ulang kedua secret sandi (lihat §8) |
| `abadiops-kmbbupr` (kmbbupr.abadiops.com) | `ca991cdc` | `9375ce38` |
| `abadiops-porject-kmb` (kmbprojek.abadiops.com) | `543b321f` | `7276db1b` |
| `abadiops-kmb` (kmbtra.abadiops.com) | `37398406` | `4ff03a67` |
| `abadiops-sum` (sum.abadiops.com) | `06b86ff1` | `f7aaa06c` |
| 4 Worker rumah latihan (`abadiops-<w>-latihan`) | lihat §3 | — (tanpa pengguna) |

Rollback seketika: `wrangler versions deploy <id-rollback>@100 --yes` di folder Worker itu (token Cloudflare dari env).

**Lalu lintas sejak PWA lama diarahkan ke Worker (15 Nov 15.10):** 24 jam pertama 0 galat (KMB V2 3.160 permintaan,
SUM 1.399, KMB Projek 1.244, BUPR 535). `clientDisconnected` KMB V2 ±13% terjadi saat menunggu GAS yang lambat
(median 7 detik, p99 ±50 detik), bukan karena Worker; kiriman HP aman karena antrean HP mengulang dengan `op_id` yang
sama dan GAS menolak dobel.

## 2. Langkah berikutnya

1. **Gladi di produksi pada rumah LATIHAN** (keputusan Gabriel 15 Nov; §3). Belum dijalankan. Urutan BUPR latihan →
   KMB Projek → KMB TRA → SUM. Bila ada langkah gagal: perbaiki di kode bersama (§5), ulangi.
2. **Tunggu 7 hari** (otomatis). Pantau tiap pagi (§4).
3. **Hari H per rumah** (§3 langkah yang sama, kartu rumah asli): jalankan pelaksana → Mulai → pantau → uji satu WO
   lewat HP/PWA → pantau 24 jam → rumah berikutnya. **Menekan Mulai rumah asli = menyalakan saklar produksi: titik
   henti, butuh persetujuan Gabriel** (§7), kecuali Gabriel menyerahkannya kepadamu secara tertulis.
4. Uji WO Gabriel sendiri di `staging-<rumah>.abadiops.com` (tidak menahan tombol; ruang uji `uji_*` disegarkan 15 Nov).

## 3. Prosedur Mulai / Kembali (sama untuk gladi dan hari H)

**Pelaksana dulu.** Pekerjaan yang butuh akun layanan Google (sinkron terakhir, cermin balik) dikerjakan workflow
GitHub **Peralihan** (`.github/workflows/peralihan.yml`). Jadwalnya `*/5` tetapi GitHub nyatanya menjalankannya ±1 jam
sekali, dan selama prosedur semua tulisan rumah itu tertahan. Jadi **tepat sebelum menekan tombol**:
https://github.com/kawanabadigrup/abadiops/actions/workflows/peralihan.yml → **Run workflow** (menit tunggu 30), atau
lewat API: `POST /repos/kawanabadigrup/abadiops/actions/workflows/peralihan.yml/dispatches`
`{"ref":"main","inputs":{"menit":"30"}}` dengan `GITHUB_TOKEN_ABADIOPS`. Panel menampilkan tautan yang sama bila
permintaan belum diambil 3 menit. Putaran yang sudah mengerjakan satu permintaan menunggu 20 menit lagi.

**Mulai** (panel → tab Saklar Migrasi → kartu rumah → ▶ Mulai migrasi → alasan → ketik kode rumah → untuk kartu rumah ASLI isi juga **sandi migrasi asli**). Otomatis:
MENUTUP (HP menahan kiriman) → GAS terbukti tertutup → sinkron maju dikunci + sinkron terakhir + periksa selisih →
cadangan skema jam mulai → izin tulis dibuka → cermin balik awal + uji hak Editor + periksa → SUPABASE. Lama ±15–40
menit (KMB V2/SUM lebih lama). Gagal di mana pun → kembali ke `gas` sendiri, tidak ada yang hilang. Selama MENUTUP bisa
✋ Batalkan peralihan.

**Kembali ke GAS** (kartu yang sama, sesudah SUPABASE; jalankan pelaksana dulu): MEMBUKA → cermin balik terakhir +
periksa seluruh spreadsheet → izin tulis ditutup + kunci sinkron maju dilepas → GAS. Gagal → tetap SUPABASE.

**Rumah latihan untuk gladi** (`workers/bersama/profil-rumah.js`, `docs/SIAP-MULAI.md` bagian "Uji kering di produksi"):
kartu "… (LATIHAN)" kode `latihan_kmbbupr`, `latihan_kmbprojek`, `latihan_kmbtra`, `latihan_sum`. Data = salinan
spreadsheet (skema `latihan_*` di Gedung 1, diperlakukan database seperti rumah asli), GAS = titik tiruan
`latihan-<rumah>.abadiops.com/gas-tiruan`, Worker `abadiops-<w>-latihan` di `latihan-<rumah>.abadiops.com` (tanpa
cron, push hanya dicatat). Pelaksana GitHub melayaninya lewat rahasia `CERMIN_RUMAH_LATIHAN`. Rumah latihan **tidak**
ikut mengenali token pengguna (salinan memuat token asli; jangan dilepas, lihat `tests/rumahLatihan.test.ts`). Syarat 7
hari dan umur sinkron tidak berlaku untuk rumah latihan.
Gladi per rumah: pelaksana → Mulai kartu latihan → tunggu SUPABASE → satu siklus WO:
`node tools/cermin/siklus-latihan.mjs --rumah=<kmbbupr|kmbprojek|kmbtra|sum> --latihan` (env `DATABASE_URL` Gedung 1)
→ ±5 menit kemudian baris barunya muncul di salinan (cermin balik berkala) → pelaksana → Kembali ke GAS → cek salinan =
skema latihan (`node tools/cermin/balik.mjs --skema=latihan_<skema> --periksa`, hanya membaca).
Salinan (dibuat Gabriel 15 Nov, ID-nya di `abadiops.env` `LATIHAN_*_SPREADSHEET_ID`) berisi data dan token asli:
perlakukan sebagai rahasia; skrip ikutannya **tidak boleh** di-deploy.

## 4. Pemantauan harian

- Kesehatan cermin: `cermin_kesehatan('<skema>')` di Gedung 1 → `hari_tanpa_selisih`, `periksa_hasil` (harus N/N
  sama), `sinkron_terakhir` (< 2 jam). Workflow `Cermin` (tiap jam, menit ±41) harus hijau; bila merah, lihat log:
  satu sheet gagal sudah memutus hitungan 7 hari rumah itu (§6).
- Galat Worker: Cloudflare GraphQL `workersInvocationsAdaptive` (permintaan, galat, status). `wrangler tail` dan
  `*.workers.dev` diblokir di jaringan kantor Gabriel (sertifikat salah); uji versi Worker lewat header
  `Cloudflare-Workers-Version-Overrides: <worker>="<id versi>"` di domain produksi.
- Antrean pelaksana: tabel `public.cermin_permintaan` (yang `selesai_at IS NULL`).

## 5. Bila ada bug: satu perbaikan untuk keempat rumah

Kode bersama dipakai keempat rumah: `workers/bersama/*` (GAS di Worker, router, push, saklar, profil),
`config/rumah.json` (profil per rumah: daftar aksi, pemicu, versi GAS dipatok), `tools/cermin/*` (sinkron, cermin
balik, pelaksana). Urutan: perbaiki → `npm run typecheck` → uji (`npx vitest run`; uji integrasi butuh Postgres
lokal porta 5433, CI `uji` menjalankan semuanya) → ruang uji `staging-<rumah>.abadiops.com` (Worker uji, skema
`uji_*`) → push `staging` → push `main` (CI `uji` hijau) → deploy produksi bertahap keempat Worker rumah + pintu bila
kena (1% → uji versi baru lewat header override → 100%). Rumah yang belum dimigrasi tetap meneruskan ke GAS, jadi
deploy itu tidak mengubah apa pun bagi penggunanya. Bundel GAS (`workers/<w>/gas/gas-kamar.js`, tidak di repo) dibuat
`node tools/kembar/bundel-gas.mjs --kamar=<kode>` sebelum deploy.

Deploy bertahap tanpa alat pembungkus (di folder Worker; `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` dari env;
hanya dari `main` yang bersih):
```
wrangler versions upload --message "<pesan>"                  # → Worker Version ID baru
wrangler versions deploy <baru>@1% <lama>@99% --yes
curl -H 'Cloudflare-Workers-Version-Overrides: <nama-worker>="<baru>"' https://<domain>/...   # bandingkan dengan versi lama:
#   aset PWA, /api/sehat, POST /api dengan token palsu (ping, getDashboard, aksi tak dikenal), OPTIONS /api;
#   pintu: /, /api/saklar/status, POST /api/pintu token palsu & kosong, /saklar, /saklar/api/status tanpa sesi (401)
wrangler versions deploy <baru>@100% --yes                    # hanya bila semua sama
```
Worker latihan (tanpa pengguna) langsung: `wrangler deploy --env latihan` + `wrangler secret put
SUPABASE_SERVICE_ROLE_KEY --env latihan` (kunci `worker_produksi`).

## 6. Temuan dan keputusan yang masih terbuka

- **Hitungan 7 hari KMB V2 kembali ke 1 (16 Nov).** `hitungBeruntun` (`tools/cermin/sinkron.mjs`) memutus beruntun pada
  hari dengan satu sheet gagal, walau selisih datanya 0: 15 Nov pukul 17.25 Google menjawab "409 ABORTED" untuk
  `WorkOrders_Archive`. Galat itu kini diulang otomatis (BUG #48), tetapi KMB V2 jadi paling cepat 22 Nov. Mengubah
  aturan (misalnya galat sementara yang pulih di putaran berikutnya tidak memutus) = keputusan Gabriel; tidak diubah.
- Rumah latihan sesudah migrasi asli selesai: hapus dari `RUMAH` pintu + skema `latihan_*` + `cad_latihan_*`?
  (Menghapus data = minta persetujuan.)
- Bug yang ditunda/menunggu keputusan: `docs/BUG-DICATAT.md` (#35, #38, #44 dan yang berstatus terbuka).
- `AGENTS.md` §6 "Keadaan repo" sudah lama (29 Okt); dokumen ini dan `docs/SIAP-MULAI.md` yang terbaru.

## 7. Aturan yang tetap berlaku (titik henti = tanya Gabriel dulu)

- Titik henti: **pembayaran**, **menyalakan saklar produksi (Mulai rumah asli)**, **rumus poin/rupiah**, **menghapus
  data produksi**. `clasp push` / deployment GAS baru hanya dengan izin langsung (BUPR: deploy lewat editor, jangan
  `clasp deploy`). Spreadsheet asli hanya ditulis sesudah jam mulai, dan hanya oleh cermin balik / Kembali ke GAS.
- Tidak ada rahasia, token, data produksi, atau ID spreadsheet di repo (repo publik) maupun di chat/log. HARAM hardcode
  (`AGENTS.md` §5).
- Rahasia di Cloudflare secrets dan GitHub Actions secrets; salinan lokal di `abadiops.env` (lihat §8).

## 8. Akses yang kamu butuhkan (nama saja; nilainya diserahkan Gabriel lewat jalur aman, bukan chat/repo)

`abadiops.env` (di laptop Gabriel: `C:\dev\rahasia\abadiops.env`, di luar repo dan OneDrive) memuat antara lain:
`CLOUDFLARE_API_TOKEN` (token `abadiops-deploy`, berlaku s.d. 11 Feb 2027), `GITHUB_TOKEN_ABADIOPS` (fine-grained
`abadiops-cermin`: repo abadiops, Actions + Secrets), `DATABASE_URL_GEDUNG1_POOLER`, `SUPABASE_SECRET_KEY_GEDUNG1`
(kunci `worker_produksi`), `SUPABASE_SECRET_KEY_UJI` (kunci `worker_uji`), `GOOGLE_SA_KEY_FILE` (kunci akun layanan
`abadi-operation-sync@…`, berkas `akun-layanan.json`), `<SKEMA>_SPREADSHEET_ID` keempat rumah,
`LATIHAN_*_SPREADSHEET_ID`, kunci VAPID KMB V2/SUM, sandi panel staging, dan **dua sandi panel produksi** (sejak 16 Nov; sandi lama tidak berlaku): `PANEL_SAKLAR_SANDI_PRODUKSI` (masuk panel + Mulai/Kembali kartu latihan) dan `PANEL_SAKLAR_SANDI_MIGRASI_ASLI` (diminta lagi untuk Mulai/Kembali kartu rumah asli; Gabriel yang menentukan siapa memegangnya). Sidiknya (`PANEL_SAKLAR_SECRET_SHA256`, `MIGRASI_ASLI_SECRET_SHA256`) = nilai secret `PANEL_SAKLAR_SECRET` dan `MIGRASI_ASLI_SECRET` Worker pintu. Versi Worker menyimpan secret-nya sendiri: rollback pintu ke versi sebelum 16 Nov pagi menghidupkan sandi lama, jadi sesudah rollback pasang ulang kedua secret itu (`wrangler secret put`, nilai = sidik dari env).
Rahasia GitHub Actions repo: `GOOGLE_SA_KEY_JSON`, `CERMIN_DATABASE_URL`, `CERMIN_RUMAH`, `CERMIN_RUMAH_LATIHAN`.
Alat operasional Claude (pembungkus deploy bertahap, rekaman pembanding, pemantau lalu lintas) ada di laptop Gabriel
`C:\dev\rahasia\alat\` (README di sana; tanpa rahasia, membaca `abadiops.env`). Worktree kerja: `C:\dev\abadiops-staging`
(branch `staging`; `main` = yang tayang).

## 9. Dokumen

`docs/SIAP-MULAI.md` (daftar periksa, gladi, hari H) · `docs/SAKLAR.md` (rancangan saklar, Mulai/Kembali) ·
`docs/KEPUTUSAN.md` (keputusan Gabriel, terbaru di bawah) · `docs/BUG-DICATAT.md` (#1–#48) · `docs/PROGRES.md` (log
sesi, terbaru di atas) · `AGENTS.md` (aturan kerja AI, garis merah) · `docs/INVENTARIS-LAYANAN-GOOGLE.md`.
