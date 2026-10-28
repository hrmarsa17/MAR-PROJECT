# Inventaris SUM V2

Versi 1, 28 Okt 2026, oleh Gabriel + Claude. Disusun dengan membaca kode GAS `MAR-SUM-v2` (commit `89edc5a`, 10 Okt 2026) sebagai teks.
Skrip GAS tidak dijalankan, dan spreadsheet tidak dibuka.

Sumber kebenaran tetap GAS produksi SUM V2:
- script `1k_A_KER…`
- web app `AKfycbzB5EUJ…`
- spreadsheet `1qHjfIUT…`

Kalau dokumen ini bertentangan dengan perilaku GAS, **GAS yang benar**. Perbaiki dokumen ini.

## Ringkasan

| | Jumlah |
|---|---|
| File kode produksi (di luar alat uji dan migrasi) | 68 |
| Sheet yang dipakai kode | 19 |
| Aksi API untuk PWA | 26 (13 baca, 13 tulis) |
| Halaman web GAS | 7 file HTML |
| Pemicu terjadwal | 4 |
| Peran | 5 |

## Zona waktu, nomor WO, dan uang

- **Zona waktu skrip:** `Asia/Jakarta`. Semua tanggal yang dihitung di Worker harus eksplisit WIB.
- **Nomor WO:** `WO-YYYYMMDD-XXX`, dengan `XXX` = milidetik saat ini modulo 1000 (`generateWoNumber` di `Utils.js`). Jadi hanya ada 1.000 kemungkinan per hari. Penjaga anti-kembar `nomorTerpakaiHariIni()` membaca nomor hari itu dari `WorkOrders` dan dari 800 baris terakhir `WorkOrders_Archive` (jendela ini melebar sendiri bila perlu).
- **ID baris:** `prefix-<ms>-<3 angka acak>` (`generateId`). Bisa kembar: tercatat 5 pasang ID kembar di `MechanicPoints`.
- **Rumus poin:** `FINAL = BASE × UNIT × WORK_CONDITION × TIMELINESS × SAFETY × 1.0`. Faktor MTBF dimatikan (selalu 1.0).
- **Rumus rupiah:** `IDR = points × rate_global × pengali_golongan`. Tarif per jabatan aktif sejak 9 Sep 2026 dan berlaku surut: `1x=0,6 · 2x=1,0 · 3x=1,1 · 4x=1,2 · 5x=1,3`.
- **Dua kunci untuk satu angka:** jalur award memakai `points_to_idr_multiplier`, sedangkan ekspor payroll memakai `idr_rate`. Keduanya disalin apa adanya.
- **Periode payroll:** ditentukan oleh `superintendent_approved_at`. Kalau kosong, dipakai `submitted_at`, lalu `created_at`.
- **Rupiah di laporan payroll:** memakai `idr_value` per baris. Kalau kosong, dihitung ulang memakai tarif dan pengali jabatan yang berlaku **saat laporan ditarik**. Jabatan dan golongan yang tampil adalah data saat ini. Perilaku ini disalin apa adanya (lihat `docs/BUG-DICATAT.md`).

## Peran dan gerbang akses

SUM tidak punya section. Semua approver melihat semua WO.

| Peran | Buat WO | Approve | Dashboard dan Reports | My Work | Catatan |
|---|---|---|---|---|---|
| `mechanic` | tidak | tidak | tidak | ya | |
| `supervisor` | ya | L1 | ya | ya | |
| `superintendent` | ya | L2 | ya | ya | Satu-satunya yang melihat poin |
| `foreman` | ya | tidak | tidak | ya | Boleh mengisi pekerjaan atas nama mekanik. Boleh membatalkan WO sebelum L1 approve |
| `foreman_approver` | ya | L1 | tidak | **tidak** | Boleh membatalkan WO sebelum L1 approve. Tidak menerima kartu WO kadaluwarsa |

Gerbangnya ada di `Constants.js`: `canAccessDashboard`, `canAccessReports`, `canAccessApprovals`, `canAccessCreateWO`, `canAccessMyWork`, `isApproverRole`, dan `isWoCreatorRole`.

**Token.** Sheet `ApiTokens` berisi `token`, `mechanic_id`, `email`, `is_active`, `created_at`, dan `last_used`.
`_resolveToken` membaca sheet itu pada **setiap** permintaan, tanpa cache. Token dianggap aktif kalau `is_active` bukan teks `'false'`.
Peran diambil dari `Config_Mechanics` berdasarkan email. Kalau email tidak ditemukan, perannya `null`, dan token tetap diterima (KMB V2 menolaknya). Disalin apa adanya.

## 19 sheet

Semua sheet dicermin utuh ke skema `sum` (lihat `db/sum/README.md`). Jumlah baris bertanggal 9 Sep 2026 diambil dari `MIGRASI-STACK.md`.

| Sheet | Jenis | Dipakai oleh | Catatan |
|---|---|---|---|
| `Config_Components` | setelan | buat WO, katalog | |
| `Config_Units` | setelan | buat WO, katalog | |
| `Config_Mechanics` | setelan | semua aksi, untuk menentukan peran | Kolom khas SUM: `jabatan_aktual`, `golongan`, `notify_email` |
| `Config_Factors` | setelan | rumus poin dan rupiah | Termasuk tarif per jabatan. Baris golongan 5a–5c belum ada (pengali diam-diam 1,0) |
| `Config_BaseSettings` | setelan | rumus rupiah | `points_to_idr_multiplier` dan `idr_rate` |
| `ApiTokens` | akses | semua aksi | Sekitar 40 baris |
| `WorkOrders` | transaksi | hampir semua aksi | Sheet "panas", ukurannya dijaga kecil |
| `WorkOrders_Archive` | transaksi | WO yang sudah approved L2 | Header **wajib identik** dengan `WorkOrders` |
| `WorkOrderTeam` | transaksi | anggota tim per WO | 9.344 baris |
| `Approvals` | transaksi | approve dan reject L1/L2 | |
| `ScoringSnapshots` | transaksi | potret nilai saat approve L2 | Satu WO, satu snapshot |
| `MechanicPoints` | **uang** | approve L2, cancel, payroll | 18.812 baris. Ada 5 pasang ID kembar |
| `OthersJobRequests` | transaksi | job di luar katalog | |
| `AuditLogs` | jejak | semua aksi tulis | |
| `MtbfTracking` | dorman | | MTBF dimatikan. Tetap ikut dicermin |
| `ProcessedOps` | sistem | penanda kiriman sudah diproses (`op_id`) | Dibersihkan tiap hari jam 03.00 |
| `WebKiriman` | sistem | penanda kiriman dari web GAS | |
| `NotificationQueue` | sistem | antrean email | Dikirim oleh project GAS **terpisah** milik pemilik |
| `PushSubs` | sistem | langganan notifikasi push | |

Juga ada sheet `BAK_*` (cadangan) dan `_UjiAppendSementara` (uji). Keduanya tidak dicermin.

## 26 aksi API

Bentuk permintaan: `POST text/plain` dengan body `{token, action, data, op_id}`.
Bentuk jawaban: `{success:true, result:{…}}` atau `{success:false, error:"…"}`.
Aksi tulis wajib membawa `op_id`, yang dicek terhadap `ProcessedOps` supaya kiriman ganda tidak tercatat dua kali.

Kolom "Sheet yang disentuh" diperoleh dari penelusuran kode. Untuk aksi tulis, sheet yang **ditulis** baru perkiraan, karena banyak penulisan lewat fungsi bantu yang nama sheet-nya disimpan di variabel. Bentuk JSON persis tiap aksi dicatat saat aksi itu dipindah (uji kembar).

### Aksi baca

| Aksi | Gerbang | Fungsi utama | Sheet yang disentuh |
|---|---|---|---|
| `ping` | token valid | `_resolveToken` | ApiTokens, Config_Mechanics |
| `get_vapid_key` | token valid | `getVapidPublicKey` | Script Properties |
| `debug_raw_wos` | token valid | `readSheetAsObjects` | WorkOrders (alat diagnosa) |
| `pull_my_wos` | token valid | `getRowById`, `kadaluwarsaBerlaku`, `loadComponents` | WorkOrders, WorkOrders_Archive, WorkOrderTeam, Config_Components |
| `pull_create_refs` | token valid | `loadActiveComponents`, `loadUnits`, `getMechanicsByRole`, `getWorkConditionOptionsForView` | Config_* (di-cache 15 menit) |
| `pull_pending` | menurut peran: supervisor, superintendent, foreman_approver | `_buildOverrideSummary`, `getTimelinessFactor`, `kadaluwarsaBerlaku`, `bolehBukaExpired` | WorkOrders, WorkOrderTeam, Config_*. **Sekitar 20 detik** |
| `pull_active` | token valid | `getAllActiveWosForManagement` | WorkOrders, WorkOrderTeam, Config_* |
| `pull_cancelable` | `bolehMenuCancelWo` (foreman, foreman_approver) | `getDaftarCancelWo` | WorkOrders, WorkOrderTeam, Config_* |
| `pull_rejected` | `canAccessApprovals` | `getRejectedWosForManagement` | WorkOrders, WorkOrderTeam, Config_* |
| `pull_monitoring` | hanya L1 dan L2 (`bolehDrillMonitoring`) | `getMonitoringData` | ApiTokens, Config_Mechanics, WorkOrders, WorkOrders_Archive, WorkOrderTeam. **Memuat token setiap mekanik** |
| `pull_wo_detail` | `bolehMonitoringPwa` | detail satu WO | WorkOrders, WorkOrders_Archive, WorkOrderTeam |
| `pull_monitoring_daftar` | token valid | `getMonitoringDaftar`, `getMonitoringDetailWo` | WorkOrders, WorkOrders_Archive, WorkOrderTeam |
| `pull_approved` | token valid | `getApprovedWosForManagement` | WorkOrders, WorkOrders_Archive (gabungan arsip), WorkOrderTeam, Config_* |

### Aksi tulis (wajib membawa `op_id`)

| Aksi | Gerbang | Fungsi utama | Sheet yang disentuh |
|---|---|---|---|
| `save_push_sub` | token valid | `savePushSubscription` | PushSubs (idempoten per endpoint) |
| `create_wo` | `isWoCreatorRole` | `_apiCreateWoKerjakan`, `_kirimanKlaim` | WorkOrders, WorkOrderTeam, WebKiriman, ProcessedOps, NotificationQueue, AuditLogs |
| `submit_work` | anggota tim WO | `submitMechanicWork` | WorkOrders (jam kerja, `part_type` wajib: baru, repair, canibal), NotificationQueue, AuditLogs |
| `approve_l1` | `isApproverRole` (supervisor, foreman_approver) | `supervisorApprove` | WorkOrders, Approvals, NotificationQueue, AuditLogs |
| `approve_l2` | superintendent | `superintendentApprove` | WorkOrders, Approvals, **MechanicPoints**, ScoringSnapshots, WorkOrders_Archive, AuditLogs. Poin dan arsip ditulis dalam satu kunci (LockService) |
| `reject` | approver | `supervisorReject`, `superintendentReject` | WorkOrders, Approvals, AuditLogs |
| `cancel_wo` | `bolehCancelWo` | `cancelWorkOrder` | WorkOrders, MechanicPoints, AuditLogs |
| `save_override` | approver (L1/L2 ditentukan oleh peran) | `saveOverride` | WorkOrders (kolom `override_*_supervisor` / `_superintendent`), AuditLogs |
| `request_transfer` | anggota tim | `requestTransferWO` | WorkOrders (status `pending_transfer`), NotificationQueue, AuditLogs |
| `approve_transfer` | L1 | `approveTransfer` | WorkOrderTeam, WorkOrders, NotificationQueue, AuditLogs |
| `reject_transfer` | L1 | `rejectTransfer` | WorkOrders, NotificationQueue, AuditLogs |
| `report_expired` | token valid | `reportExpiredWO` | WorkOrders, AuditLogs |
| `reopen_expired` | `bolehBukaExpired` | `reopenExpiredWO` | WorkOrders, WorkOrderTeam, AuditLogs |

Aksi `approveTransfer` diterima sebagai nama lain dari `approve_transfer`.

## Halaman web GAS

File HTML yang ada: `Main`, `WorkOrder`, `MechanicDashboard`, `Approval`, `CancelWO`, `Reports`, dan `Styles` (gaya bersama).

Halaman (`?page=`): `dashboard`, `create`/`createWO`, `mechanic`, `approvals`, `cancel`/`cancelWO`, `reports`, dan `whoami` (diagnosa).

Fungsi server yang dipanggil halaman web:
`getDashboardData`, `getMyWos`, `getPendingApprovals`, `getWODetails`, `getWoDetailForMechanic`, `startWO`, `finishWO`, `submitWO`, `submitMechanicWork`, `supervisorApprove`, `superintendentApprove`, `supervisorReject`, `superintendentReject`, `saveOverride`, `requestTransfer`, `approveTransfer`, `rejectTransfer`, `createOthersJob`, `approveOthersJob`, dan `generatePayrollReport`.

Halaman web menulis langsung ke spreadsheet tanpa lewat Worker. Inilah alasan cermin wajib disinkron berkala, dan halaman web harus ditutup sebelum saklar dinyalakan (`docs/SAKLAR.md`).

## Pemicu terjadwal dan Script Properties

| Pemicu | Jadwal | Isinya |
|---|---|---|
| `cleanupProcessedOps` | tiap hari jam 03.00 | Membersihkan `ProcessedOps` |
| `penjagaHarian` | tiap hari (`PENJAGA_JAM`) | 11 pemeriksaan integritas. Mengirim email hanya kalau ada temuan |
| `penjagaOtomatis` | tiap hari (`OTOMATIS_JAM`) | |
| `runBackup` | terjadwal | Membuat sheet `BAK_*` |

Script Properties yang dibaca:
- `VAPID_PUBLIC_B64URL` dan `VAPID_PRIVATE_PEM`. Kunci privat ini kelak dipindah ke Cloudflare secret, tidak boleh masuk repo.
- `notify_mechanic`, `notify_supervisor`, dan `notify_planner`, sebagai saklar email per jenis.
- `PENJAGA_TAKBERJEJAK_TERAKHIR` dan `MIGRASI_TERAKHIR`.

## Urutan pemindahan aksi (dari MIGRASI-STACK.md)

1. **Gelombang 1, baca:** `ping`, `pull_pending`, `pull_my_wos`, `pull_approved`, `pull_active`, `pull_rejected`, `pull_create_refs`, `pull_monitoring`, `pull_cancelable`, `pull_wo_detail`, `pull_monitoring_daftar`.
2. **Gelombang 2:** `get_vapid_key`, `save_push_sub`, `create_wo`, `request_transfer`.
3. **Gelombang 3:** `submit_work`, `reject`, `reject_transfer`, `approve_transfer`, `report_expired`, `reopen_expired`.
4. **Gelombang 4, uang:** `approve_l1`, `approve_l2`, `save_override`, `cancel_wo`.

Aksi uang dipindah terakhir, dan hanya setelah buku besar di Supabase cocok dengan `MechanicPoints` selama beberapa hari berturut-turut.

## Belum diinventaris

- Bentuk JSON persis setiap aksi. Dicatat per aksi saat uji kembar.
- Isi `readSheetAsObjects`: cara header dinormalkan dan cara baris kosong dilewati. Ini wajib ditiru persis sebelum aksi baca pertama dipindah.
- Versi aktif empat fungsi kembar (`formatNumber`, `getStatusLabel`, `isTerminalStatus`, `truncate`). Tanyakan langsung ke GAS.
- Header asli setiap sheet produksi. Header ini terbaca otomatis saat sinkron pertama, lalu disimpan di `sum.cermin_header`.
