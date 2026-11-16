# CATATAN LANJUTAN — Perbaikan Dashboard Performa `?page=dashboard` (KMB Projek, KMB V2/TRA, SUM)

Ditulis 16 Nov 2026 oleh Claude (sesi dihentikan atas permintaan sebelum perubahan kode).
Tugas asli: perbaiki 4 kartu KPI + kolom `N/A` di tabel "Work Order Terbaru" untuk ketiga rumah.
**Belum ada satu pun file kode yang diubah.** Semua di bawah adalah hasil investigasi (bukti path:line).

## 1. KOREKSI ASUMSI TUGAS (penting — jangan kerjakan daftar file lama)

Daftar file di tugas (`workers/kmb/src/web-handler.js`, `web-templates.js`, `src/lib/supabaseCerminReader.ts`
sebagai jalur dashboard, `scripts/update-worker-engine.mjs`, deploy 3 worker staging) **sudah tidak relevan**.
Arsitektur sekarang (sejak keputusan Gabriel 14 Nov, "GAS asli di Worker"):

- Worker rumah (`workers/kmbprojek/src/index.js`, `workers/kmb/src/index.js`, `workers/sum/src/index.js`) semuanya
  memanggil `buatWorkerRumah(bundel)` dari `workers/bersama/gas-rumah.js`, menjalankan **kode GAS ASLI**
  (`workers/<w>/gas/gas-kamar.js`, dibangun `node tools/kembar/bundel-gas.mjs --kamar=<kamar>`, tidak di-commit,
  versi dipatok di `config/rumah.json` → kmbprojek v49, kmbtra v299, sum v199) di atas **cermin Supabase**.
- Halaman `/web?page=dashboard` = doGet + template `Main.html` + `DashboardService.js` GAS asli. Tidak ada
  web-handler buatan sendiri lagi. `scripts/update-worker-engine.mjs` memang dipensiunkan (AGENTS.md §6).
- Route Next.js `/performa` (`src/app/performa/*`, `src/domain/kueriPerforma.ts`) **warisan MARProject lama,
  tidak dilayani Worker mana pun, tidak dipanggil siapa pun** (satu-satunya pemanggil page.tsx-nya sendiri).
  Tidak perlu disentuh untuk tugas ini.
- `rpc_baca.sql` (db/kmb, db/kmb_projek, db/sum) = RPC ping/create_refs untuk PWA, tidak berhubungan dashboard.

## 2. STATUS VERIFIKASI (terbukti via ping, 16 Nov)

- `staging-kmbprojek.abadiops.com/api/sehat` → ok, saklar `supabase`, GAS v49, 9 template web, 24 fungsi web.
- `staging-sum.abadiops.com` → ok, saklar `supabase`, GAS v199. `staging-kmbtra.abadiops.com` → ok, GAS v299.
- `/web` tanpa token menampilkan gate token (normal). API POST token palsu ditolak benar.
- Belum bisa verifikasi angka 13/13/1/51.8: butuh token uji sah (`KMBP_UJI_SPV_TOKEN` / `SUM_UJI_TOKEN`
  dari env — JANGAN hardcode, AGENTS.md §5) atau baca skema `uji_*` langsung di Supabase.

## 3. TEMUAN ANALISIS (kode GAS asli, sumber: gas-backup/kmb-projek/*)

a. **Mustahil approved+pending > total dari loop GAS.** `getSupervisorStats` (DashboardService.js:175-240):
   `totalWOs++` untuk SEMUA WO (baris 210) sebelum blok approved (217-223) dan pending (224). Subtitle kartu
   Total WO bahkan "Semua waktu & status". `approved` hanya dihitung bila status approved DAN
   `superintendent_approved_at` dalam periode payroll berjalan (`_dashWoBulanIni`, :959-962).
   → Angka aneh (13/13/1) kemungkinan besar berasal dari **portal lama** `worker.js` (renderDashboard memakai
   `DEFAULT_MONITORING_OVERALL`, total = pending_mechanic_work+pending_l1+pending_l2+approved — kalau data
   monitoring tidak termuat, total ikut terpotong) ATAU dari cermin yang datanya tidak utuh. **Verifikasi dulu
   jalur mana yang ditonton Gabriel sebelum mengubah apa pun.**
b. **Dugaan kuat akar masalah kolom N/A + tanggal:** jalur konversi tanggal cermin.
   - Cermin mencatat `tipe` kolom di `<skema>.cermin_header` (tools/cermin/google.mjs:120-126): tipe `tanggal`
     HANYA bila sel numberValue dengan numberFormat DATE di spreadsheet asli. String teks → tipe `teks`.
   - Pembacaan Worker (`workers/bersama/gas-layanan.js:363-370`): string dikonversi ke `DateZona` HANYA bila
     tipe kolom memuat `tanggal` DAN nilai cocok regex ketat `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`
     (baris 51). ISO tanpa ms/tanda Z → tidak dikonversi.
   - `parseDate` GAS (Utils.js:44-67) menerima string apa adanya via `new Date(str)`; format tanggal Sheets
     gaya AS (mm/dd/yyyy) atau string lokal → Invalid Date → null.
   - Akibat: `getRecentWOs` (DashboardService.js:293-372) memfilter window 36 jam dari `created_at`
     (:303-314). Kalau `created_at` gagal di-parse di semua baris → tabel kosong; bila sebagian lolos, baris
     yang lolos dirender, dan Main.html:378-379 menampilkan `N/A` untuk `created_by_name`/tanggal kosong,
     `—` untuk judgment kosong (:377), dan id mekanik mentah bila lookup `loadMechanics`/`getMechanicByEmail`
     (:353, :357-358) gagal (Config_Mechanics tidak termuat / email tak cocok).
c. **Mapping kolom yang benar (jangan diubah perilakunya, ini 1:1 GAS):**
   - created_by → `wo.created_by` (email) → `getMechanicByEmail` → `created_by_name` (Main.html:378).
   - tanggal → `wo.created_at` (Main.html:379, toLocaleDateString 'id-ID').
   - judgment → `getEffectiveJudgment(wo)` (ApprovalService.js:1007-1019): prioritas
     `judgment_at_superintendent`→`judgment_superintendent`, lalu supervisor; kosong → `—` di layar (bukan bug).
   - mekanik → `WorkOrder_Team` (teamMap wo_id) → nama dari `loadMechanics()` (Config_Mechanics) (:326-355);
     id mentah muncul bila mechanic_id tidak ketemu di map.
   - component → COM-OTHERS → 'Others — '+others_description; job_id → getJobById; else Config_Components.
d. **Filter status dropdown SUDAH berfungsi** di kode GAS (Main.html:666-686, client-side, data-status per baris).
   Tidak ada pekerjaan di sini kecuali terbukti rusak di layar nyata.

## 4. LANGKAH LANJUTAN YANG DISARANKAN (urut)

1. **Buktikan sumber angka 13/13/1/51.8.** Ambil token uji dari env (Gabriel), GET
   `staging-kmbprojek.abadiops.com/web?page=dashboard&token=...`, dan bandingkan dengan
   `pull_monitoring` via POST /api. Bila angka hanya aneh di portal lama (`worker.js`), masalahnya di
   `state.monitoringData` kosong → perbaiki jalur monitoring portal, BUKAN DashboardService.
2. **Cek cermin langsung di Supabase** (butuh DATABASE_URL / kunci di abadiops.env milik Gabriel):
   `SELECT tipe FROM uji_kmb_projek.cermin_header WHERE sheet='WorkOrders';` → lihat tipe kolom
   `created_at`, `submitted_at`, `superintendent_approved_at`, `judgment_*`. Bila `teks`/`campur`, itu akar
   masalahnya: nilai tanggal tidak dikonversi DateZona → parseDate null → N/A.
3. **Cek jumlah baris**: `SELECT count(*) FROM uji_kmb_projek.workorders;` + `..._archive`; bandingkan dengan
   yang tampil. Cermin menyalin SEMUA sheet (tools/cermin/sinkron.mjs:10-14), jadi kalau kurang berarti
   putaran sinkron gagal per sheet (cek `cermin_log`).
4. Bila akar masalah = tipe kolom tanggal di spreadsheet asli bertipe teks: ini keputusan data/ Spreadsheet
   (milik Gabriel) atau perluasan konversi di `barisDariCermin` (bersama semua rumah, uji kembar dulu di
   tools/kembar/gas-lokal.mjs, lalu ruang uji). JANGAN ubah DashboardService — itu melanggar aturan 1:1 §1.
5. Bila akar masalah = lookup nama mekanik gagal: cek `Config_Mechanics` termuat di shim (belajar otomatis
   via `baca_dilewati`, gas-rumah.js:331-388) dan cocoknya `getMechanicByEmail` (email vs mechanic_id).
6. Perbaikan diterapkan di **kode bersama** (`workers/bersama/*`) bila shim-nya, lalu:
   `node tools/kembar/bundel-gas.mjs --kamar=...` per rumah sebelum deploy, uji `npx vitest run`,
   ruang uji `staging-<rumah>.abadiops.com` → push `staging` → push `main` → deploy bertahap
   (prosedur §5 docs/SERAH-TERIMA-2026-11-16.md). Deploy staging butuh `SUPABASE_SERVICE_ROLE_KEY` via
   `wrangler secret put ... --env staging` (nilai dari Gabriel, JANGAN dicatat di repo).
7. Titik henti tetap (AGENTS.md §17): saklar produksi, rumus poin, pembayaran, hapus data produksi.

## 5. KEADAAN LINGKUNGAN SAAT DIHENTIKAN

- Branch `staging`, bersih dari perubahan kode. Ada 3 untracked milik lokal: `.agent/`, `opencode.json`,
  `opencode.json.bak.20261116` (config OpenCode, jangan di-commit; `.gitignore` lokal sudah memuatnya tapi
  perubahan `.gitignore` itu juga belum di-commit — putuskan Gabriel).
- MCP `my-server` di `D:\marbaru\MARProject\opencode.json` sudah diperbaiki (placeholder rusak diganti server
  filesystem; terverifikasi jalan). Tidak berhubungan dengan repo.
- PWA/Web staging berfungsi (gate token normal). Tidak ada deploy yang dilakukan sesi ini.

## 6. DOKUMEN YANG DIBACA SESI INI (konteks)

`docs/SERAH-TERIMA-2026-11-16.md` (awal wajib), `docs/SPEK-LAYAR/01-PERFORMA.md` (spesifikasi layar 1:1),
`docs/PROGRES.md` (grep "dashboard"), `config/rumah.json`, `tools/kembar/bundel-gas.mjs`,
`workers/bersama/gas-rumah.js` + `gas-layanan.js`, `tools/cermin/{sinkron,google,balik}.mjs`,
`gas-backup/kmb-projek/{DashboardService,ApprovalService,Utils,Constants,_PeriodePayroll}.js` + `Main.html`.
