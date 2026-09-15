# Layar 4 — Approvals

> **Sumber:** `Approval.html` + `ApprovalService.js`, dibaca dari
> `C:\Users\gabri\OneDrive\1\KMB\MAR github\MAR-project`, cabang
> `feature/token-auth-web`, HEAD `d806ee5`, pemeriksaan 15 September 2026.
> Sumber **baca saja**. Nomor baris dalam dokumen ini merujuk salinan tersebut.
>
> **Sasaran:** `src/app/approval/page.tsx`, `KartuApprovalTampil.tsx`,
> `AksiKartu.tsx`; `src/domain/kueriApproval.ts`, `approval.ts`,
> `nilaiEfektif.ts`; satu pintu `POST /api/perintah`.
>
> **Status:** kontrak porting selesai; implementasi layar **belum lengkap**.
> Sketsa SQL di §5 adalah rancangan, bukan migrasi atau kode yang sudah berjalan.

Ini layar keputusan uang. Kemiripan kartu saja belum cukup: orang harus melihat
nilai yang benar-benar akan dipakai saat approve, alasan pengembalian, akibat
transfer, serta akibat pembatalan poin yang telah terbit.

## 1. Susunan layar

```text
navbar                                           Approval.html:198-215
.container
  .page-header > h1.page-title + p.page-subtitle   :217-221
  .sub-nav > a.sub-nav-tab                        :223-229
    ✅ WO Approval → ⏳ WO Aktif → 🏆 WO Approved → 🔁 Transfer WO → ❌ Ditolak
  satu view aktif:
    pending: .section-header + spanduk potongan + #pendingGrid :231-467
    transfer: .section-header + .wo-grid                       :469-539
    active: .section-header + .wo-grid                        :541-589
    approved: .section-header + petunjuk bulan + pencarian     :591-659
    rejected: .section-header + .wo-grid                      :661-711
#cancelModal                                     :715-726
#editModal                                       :729-790
#approveModal                                    :793-820
#approveOverlay / #successOverlay (dibuat JS)     :872-895,947-969
```

Judul mengikuti view, **bukan** selalu `✅ WO Approval`:

| View sumber → tab target | Judul | Subjudul persis (`Approval.html:219-220`) |
|---|---|---|
| `pending` → `menunggu` | `✅ WO Approval` | `Review dan approve work orders yang sudah dikerjakan mekanik` |
| `active` → `aktif` | `⏳ WO Aktif` | `Work orders yang belum di-submit mekanik` |
| `approved` → `approved` | `🏆 WO Approved` | `Semua work orders yang sudah disetujui (menampilkan 100 terbaru)` |
| `transfer` → `transfer` | `🔁 Transfer WO` | `Permintaan oper WO ke shift berikutnya — jam kerja mekanik sebelumnya baru dihitung bila Anda setujui` |
| `rejected` → `ditolak` | `❌ Ditolak / Dibatalkan` | `Riwayat WO yang ditolak atau dibatalkan, beserta alasannya — inilah yang ditengok saat ada pertanyaan "kenapa WO saya tidak dibayar" (100 terbaru)` |

Hanya L1/L2 masuk layar ini. Antrean utama L1 hanya `pending_supervisor`, L2
hanya `pending_superintendent`; wewenang backend L2 untuk approve tahap L1
tetap ada. Alasannya: WO yang muncul di dua meja mengundang L2 melewati L1
tanpa sengaja (`ApprovalService.js:622-637,1401-1405`). Navbar L1 sengaja tanpa
badge peran; L2 berlabel `Manager` (`Approval.html:210-213`). Nama pengguna dan
aktor memakai nama; fallback email mentah di sumber tidak dibawa.

### Ukuran dan kelas

Salin ukuran, urutan, jarak, dan bentuk sebelum penyesuaian hue tema merah:

| Blok | Kontrak CSS sumber |
|---|---|
| `.container`, header | maksimum 1400px; padding `0 2rem 2rem`; judul 2.5rem/700, subjudul 1.125rem (`Approval.html:27-30`) |
| `.wo-grid` | `repeat(auto-fill,minmax(420px,1fr))`, gap 1.5rem; ≤768px satu kolom (`:40,192`) |
| `.wo-card` | padding 1.5rem, radius 12px, border 2px, bayangan `0 1px 3px rgba(0,0,0,0.1)` (`:41-49`) |
| `.wo-section-title`, `.wo-detail-row` | judul 0.7rem uppercase; isi 0.875rem, label kiri dan nilai kanan (`:80-84`) |
| `.wo-actions` | flex, gap 0.5rem, margin/padding atas 1rem; tombol radius 8px (`:95-111`) |
| `.sub-nav-tab` | padding 0.75rem 1.25rem, radius 10px, border 2px, 0.9rem/600 (`:146-149`) |
| `.modal-backdrop`, `.modal` | backdrop scroll; modal maksimum 700px, body maksimum 70vh; approve maksimum 480px (`:150-158,794`) |
| `.ov-time-grid` | dua kolom `minmax(0,1fr)`, anak `min-width:0`; ≤560px satu kolom (`:162-164`) |

`getThemeCSS()` dipasang setelah CSS halaman (`Approval.html:194`): nilai
visual akhir perlu dibandingkan bersama `Theme.js`, bukan CSS halaman saja.
Kembalikan tetap amber; Reject maroon mengikuti keputusan target yang masih
perlu dilihat Gabriel. Jangan menyimpulkan ungu hanya berarti data perkiraan:
sumber juga memakainya untuk badge L2, pembuat mekanik, dan override
(`Approval.html:62,65,94,1243-1246`). Detail tyre sengaja netral supaya tidak
bersaing dengan peringatan kembar merah dan kiriman ulang amber (`:126-130`).

## 2. Kontrak per blok

### 2a. Pending Approvals

Kepala `✅ Pending Approvals` + `.section-count` adalah **jumlah seluruh antrean
yang lolos saringan**, bukan jumlah kartu yang dirender. Batas awal 25 berasal
dari `Constants.js:200`; `Router.js:450-481` memotong sesudah enrichment.
Komentar mencatat 271 kartu memakan 18.992 ms dan halaman 2 MB. Komentar
`Approval.html:236-239` menyebut jumlah 25 saat 273 menunggu sebagai
“kabar baik palsu”. Bawa penjelasan potongan berikut (`:248-263`):

> Menampilkan **{jumlah tampil}** dari **{jumlah seluruh}** WO yang menunggu.
> Yang lain naik dengan sendirinya begitu yang di atas selesai.
> **Tampilkan semua {jumlah seluruh}**

Estimasi detik `round(total × 0.07)` adalah pengukuran GAS, bukan SLA Next.js.
Jika target mempertahankan batas lain, nyatakan jumlah yang benar dan sisa yang
masih ada; `semua=1` tidak boleh diam-diam berhenti di 500 lalu menghilangkan
spanduk. Sumber hanya memberi badge antrean pada tab pending, bukan seluruh
tab (`Approval.html:224-228`).

Urutan dalam `.wo-card[data-wo-id]` (`Approval.html:267-460`):

1. `.wo-header`: nomor WO; `👷 Dibuat Mekanik` bila pembuat berperan mechanic
   (tooltip meminta pemeriksaan job/unit/tim); badge grup `📦 1 job · banyak unit`
   atau `📦 1 unit · banyak job`; `Level 1`/`Level 2`; ketepatan `ON TIME`,
   `LATE`, `WAY LATE` berikut tooltip actual/target/rasio/faktor (`:270-283`).
2. `.kembar-note` bila ada pasangan: `⚠️ Mungkin pekerjaan yang sama dengan
   {n} WO lain.`; nomor pasangan, jarak mulai dalam menit, `mekanik SAMA` atau
   `mekanik berbeda`, status, `(sudah dibayar)` bila approved. Petunjuk menegaskan
   pekerjaan dua orang seharusnya satu WO bertim; kerja ulang sah tetap mungkin
   dan approver memutuskan (`:291-307`). **Bukan auto-reject**.
3. `.kembali-note` bila putaran >1: `↩ Kiriman ulang — putaran ke-{n}.`, nama
   pengembali, alasan terakhir, dan `Periksa apakah hal itu sudah diperbaiki
   sebelum menyetujui.` (`:308-317`).
4. `Detail Tyre` bila ada isian: inspeksi tabel `Pos / Pressure / RTD / Suhu`
   berisi **before → after**; Remove/Instal menampilkan `Posisi`, `Dilepas`,
   `Dipasang`, `Tyre / Inner / Flap`, `Lokasi`; Repair `Ban yang direpair`, `SN`,
   `Ban`. Kosong ditandai `–`, angka nol jangan dianggap kosong (`:318-378`).
   Detailnya mengikuti [03b-DETAIL-TYRE.md](03b-DETAIL-TYRE.md).
5. `📦 Component`: `No: / Name: / Category:` (`:379-384`).
6. `🚜 Unit`: `ID: / Name: / Location:`; `field` → `🚜 Lapangan`, selain itu
   `🏭 Bengkel` (`:385-396`). Jangan mendeteksi kata “lapangan” dari kode `field`.
7. `🔧 Work Info`: `Dibuat:` dengan tanggal **dan jam**, `Dikirim:` bila ada,
   `Kondisi:`, `Actual Hours:`, `Target Hours:`, `Base Points:`, `Unit Factor:`
   dengan 🔒. Target/base masing-masing punya badge `SPV` dan/atau `SUPT`;
   `📝 Keterangan:` menyimpan line break (`:397-428`). Kondisi persis
   `normal` → `Shift 1`, `difficult` → `Shift 2`, `extreme` → `Kondisi Ekstrim`.
8. `👥 Team`: satu baris per nama **tim efektif**, tanpa pembagian persen; badge
   override tim tersendiri (`:429-443`). `Level 1 By:` hanya ketika menunggu L2
   dan stempel L1 tersedia (`:444-448`).
9. Tombol dalam urutan **✏️ → 🚫 → ✓ Approve → ↩ Kembalikan → ✗ Reject**.
   Dua ikon memiliki title `Edit Override` / `Cancel WO` (`:449-459`).

Kosong yang sah: `✅ Tidak ada WO yang menunggu persetujuan.` (`:464`). Galat
pemuatan harus tampil sebagai galat, bukan pesan ini.

### 2b. WO Aktif

Kepala `⏳ WO Aktif (Belum Submit)`; kartu `.active-wo` (`Approval.html:541-587`).
Nomor + pembuat mekanik + `Belum Dikerjakan`/`Sedang Dikerjakan`; kemudian
`📦 Pekerjaan` (`Component:`, `Kondisi:`, `Location:`), `👥 Team`, `Dibuat oleh:`,
keterangan, tombol selebar kartu `🚫 Cancel WO`. Kosong:
`Tidak ada WO aktif yang menunggu dikerjakan mechanic.`

**Ketidaksinkronan sumber:** backend sudah mengirim `unit_name` dengan komentar
“Nama unit WAJIB ikut” (`ApprovalService.js:1506-1516`), tetapi markup aktif
`:561-566` belum menampilkannya. Catat sebagai celah parity; jangan mengklaim
baris Unit telah ada pada web sumber. Data target harus tetap menyertakannya.

### 2c. WO Approved

Kepala `🏆 WO Approved` + `#approvedCount`; petunjuk wajib:
`Menampilkan WO yang disahkan bulan ini. Bulan sebelumnya diambil lewat Export
Payroll.` (`Approval.html:598-603`). “Bulan ini” memakai tanggal disahkan L2,
**bulan kalender**, bukan periode gaji 16→15.

`#searchApproved.search-input`, placeholder `Cari WO number...`; pencarian
substring nomor, case-insensitive dan trim, hanya atas kartu yang telah dimuat.
Jumlah berubah menjadi yang cocok; `Tidak ditemukan WO dengan nomor tersebut.`
bila hasil nol (`:605-608,655,897-901`). Maksimum sumber 100, diurut `created_at`
terbaru setelah disaring bulan `superintendent_approved_at`
(`ApprovalService.js:1618-1629`). Jangan mengganti kunci urut menjadi tanggal
approve tanpa menyatakan perubahan.

Kartu `.approved-wo` atau `.incident-wo`: `✅ Approved` atau `⚠️ Approved - Insiden`;
insiden menampilkan `⚠️ Safety Incident — Poin di-nol-kan oleh Manager`.
`.points-highlight` memuat `Final Points`, **rupiah total seluruh penerima WO**,
dan `{final_points} pts` per anggota penuh. Kemudian pekerjaan/unit/kondisi/
actual/location, tim, `Tanggal:` (dibuat), keterangan; L2 saja melihat
`🚫 Cancel & Batalkan Poin` (`Approval.html:609-651`). Kosong:
`Belum ada WO yang diapprove.`

### 2d. Transfer WO

Kepala `🔁 Menunggu Keputusan Transfer`; kartu berisi nomor, `Menunggu Keputusan`,
`Diminta oleh {nama} · section {section}`, `Keterangan WO:`, `Catatan mekanik:`.
**Sebelum pilihan dan tombol**, kotak `DAMPAK JAM KERJA` menampilkan:

> Sesi mekanik ini **{sesi} jam** · jam tercatat sekarang **{partial lama}** →
> **{partial baru} jam** bila disetujui
>
> Bila ditolak, sesi {sesi} jam tersebut hangus.

Lalu `Tim sekarang:`, `Mekanik penerima *` sebagai **select multiple size=4**
`#trTarget_{wo_id}`, pilihan `Nama (mechanic_id)`. Petunjuk persis:
`Bisa pilih lebih dari satu (Ctrl / Cmd + klik). Semua penerima mendapat poin
penuh.` Tombol berdampingan `Setujui Transfer` dan `Tolak`
(`Approval.html:470-532`). Kosong:
`✅ Tidak ada permintaan transfer yang menunggu keputusan.`

Setujui wajib ≥1 penerima, konfirmasi jumlah orang dan bahwa jam sesi sebelumnya
dihitung. Tolak wajib alasan serta konfirmasi bahwa sesi hangus dan WO kembali
ke tim semula (`Approval.html:1084-1129`). Jangan mengubah pilihan jam ini menjadi
sekadar pindah penanggung jawab: tim lama **tetap** ikut menerima poin penuh.

### 2e. Ditolak / Dibatalkan

Kartu menunjukkan `🗑 Dibatalkan` atau `❌ Ditolak`. Alasan berada paling menonjol
sebelum pekerjaan: `🗑 Alasan dibatalkan:` / `❌ Alasan ditolak:`. Berikutnya
`📦 Pekerjaan` (`Component:`, `Unit:`, `Location:`, `Section:`), `👥 Tim & Jejak`
(`Tim:`, `Pembuat:`, `Oleh:`), keterangan. Tidak ada tombol untuk menghidupkan
kembali WO (`Approval.html:662-709`). Kosong:
`Belum ada WO yang ditolak atau dibatalkan.`

Backend mengambil kedua status dari aktif + arsip, menerapkan ambang berlaku,
urut dibuat terbaru, maksimum 100. Alasan historis sebelum kolom terisi memang
dapat kosong; **jangan mengarang alasan** (`ApprovalService.js:1523-1601`).

## 3. Modal dan kontrak interaksi

### 3a. Approve

`✓ Approve Work Order` dengan nomor WO, tahap, keterangan bila tersedia, dua
checkbox (`Approval.html:793-819,910-941`):

| Pilihan | L1 | L2 |
|---|---|---|
| `⚠️ Ada safety incident pada WO ini` | catatan untuk tahap berikutnya; poin belum dipotong | jika dicentang poin otomatis 0 |
| `🔧 Pekerjaan ini REDO (perbaikan ulang)` | info untuk L2 | menerapkan faktor `redo` atau `first_time` dari konfigurasi |

Prefill dari keputusan yang sekarang tersimpan, termasuk warisan L1. L2 boleh
mengubah keduanya. Tahap L2 menampilkan `Approval Final (Layer 2) — poin akan
dihitung & didistribusikan.`; tahap L1 `Approval Level 1 — WO akan diteruskan
ke Layer 2.` Tombol `Batal` dan `✓ Konfirmasi Approve`.

Simpan **sesudah** konfirmasi, bukan langsung klik ✓ Approve. Selama berjalan,
nonaktifkan semua aksi kartu; tampilkan proses yang sesuai tahap. Setelah sukses,
muat ulang data otoritatif. Sumber memakai overlay `Berhasil!` + `Lihat Hasil →`
dan redirect 3,5 detik (`Approval.html:872-895,970-1006`).

### 3b. Cancel

`🚫 Cancel Work Order`; nomor, status, `Alasan Pembatalan *`, placeholder
`Tulis alasan pembatalan WO ini...`; `Batal` / `🚫 Ya, Cancel WO`
(`Approval.html:715-726`). Ketika status approved, bawa `.danger-box` apa adanya:

> 🚨 **PERHATIAN!** WO ini sudah **FULLY APPROVED** dan poin sudah terdistribusi
> ke mechanic.
>
> Membatalkan WO ini akan **otomatis me-nol-kan poin** semua mechanic dalam WO
> ini. Tindakan ini **tidak bisa di-undo**.

Masih ada konfirmasi akhir khusus approved sebelum kirim (`:1142-1154`). Status
segar di server yang menentukan akibat, bukan boolean modal. Poin historis tidak
dihapus; status menjadi cancelled dan nilai uang saat ini nol, audit tetap ada.

### 3c. Edit Override

`✏️ Edit Override - {wo_number}`; urutan dan kontrol (`Approval.html:729-788`):

| Bagian | Medan dan isi |
|---|---|
| `📝 Editable Fields` | `Base Points` number step 0.1 min 0 + `Original:`; `Target Hours` **dua kotak** jam integer ≥0 dan menit 0–59 + `Original:` dalam jam-menit |
| kondisi | `Kondisi Kerja` select Shift 1/Shift 2/Kondisi Ekstrim; `Saat ini: {label} — mengubahnya mengubah poin.` |
| tim | `Team Composition`, `.team-editor-list`, tiap baris **dropdown nama (id) + ✕**, tombol `+ Add Member`; tidak ada input persentase |
| `⏱️ Waktu Kerja (koreksi jam mekanik)` | petunjuk lupa stop/salah start; `Mulai` / `Selesai`, picker 24 jam yang sama dengan halaman lain; kotak `Durasi:`, hint partial bila pernah transfer |
| `🗒️ Judgment / Catatan Approver (opsional)` | alasan pengerjaan lama/menyimpang, tampil di dashboard; textarea maxlength 500 + penghitung `0/500`; petunjuk sumber catatan L1 |
| `✏️ Riwayat Override` | bila ada; nama aktor, level L1/L2, waktu, jenis, nilai lama dicoret → baru, judgment |
| `🔒 Read-Only` | `Unit Factor`, termasuk nama unit pada isi |
| footer | `Cancel` dan `💾 Save Override` |

**Cacat sumber yang harus dinyatakan:** `modalWorkCondition` dipakai dua kali,
select `:742` dan input readonly berlabel `Work Condition` `:785`. Getter JS
memilih elemen pertama; prefill sempat menulis label lalu ditimpa kode kondisi
(`:1170-1195`). Di target gunakan ID unik; label readonly yang menggandakan
medan editable adalah sisa markup, bukan medan bisnis kedua. Begitu pula CSS
`.team-editor-row` masih menyisakan kolom persentase (`:174`) sementara pembuat
baris hanya memasukkan dropdown dan tombol hapus (`:1273-1278`).

Prefill nilai **efektif**, tetapi `Original:` tetap nilai katalog/manual awal.
Tim tidak boleh kosong atau duplikat; semua anggota menerima 100%, dan payload
sumber selalu menuliskan `percentage:100` (`:1272-1302`). Target tidak perlu
menyimpan kolom persentase.

Waktu mulai/selesai harus berpasangan, valid, akhir > awal. Kirim hanya jika
berubah; jangan menyimpan prefill sebagai override baru. Target hours sumber
dikonversi `round((jam + menit/60) ×100)/100`. Judgment dibandingkan dengan
**nilai efektif**, sehingga menghapus warisan L1 menghasilkan string kosong
yang sengaja dikirim; `undefined` berarti tidak disentuh (`:1281-1330`).

Hint transfer persis (`Approval.html:1178-1184`):

> ⚠️ WO ini pernah **ditransfer**. Picker hanya mengoreksi sesi **terakhir**;
> {jam-menit partial} dari sesi sebelumnya tetap ditambahkan otomatis oleh sistem.

Durasi kotak adalah **sesi picker**, bukan total plus partial (`:1217-1231`).
Contoh uji kontrak: partial 3 jam + picker 2 jam → actual efektif 5 jam.
`partial_hours` tidak menjadi medan editable.

Catatan warisan L1 (`:1199-1202`): `↩️ Catatan ini ditulis L1. Anda boleh
mengubahnya, atau kosongkan untuk menghapus.` Backend sumber juga menerima
`unit_id`, tetapi web `Approval.html` yang diperiksa **tidak punya pemilih unit**.
Jangan menambahkan picker sambil mengklaim itu salinan markup sumber.

### 3d. Reject, Kembalikan, dan jawaban terputus

Reject memakai `Masukkan alasan penolakan:` dan menolak alasan kosong.
Kembalikan meminta apa yang harus diperbaiki mekanik, minimum 5 karakter setelah
trim. Alasan ini satu-satunya petunjuk pada HP mekanik; satu titik tidak cukup
(`Approval.html:1008-1079`; `ApprovalService.js:481-488`). Kembalikan ditempatkan
**sebelum Reject** dan amber sebab salah ketik perlu diperbaiki tanpa mematikan
WO/meniadakan upah (`Approval.html:453-455`).

Kalimat kegagalan transport sumber berlaku untuk semua tindakan (`:1000-1006,
1026-1032,1073-1079,1108-1111,1126-1129,1153`):

> ⚠️ Sambungan terputus sebelum jawaban server sampai.
>
> Tindakan Anda MUNGKIN sudah tersimpan. JANGAN diulangi buta — tekan Refresh
> dulu dan lihat keadaan sebenarnya.

Bedakan galat server yang diketahui dari jawaban yang hilang. Target memakai
`op_id` yang tetap sama selama percobaan ulang **satu maksud tindakan**, termasuk
sesudah jawaban hilang; refresh memperlihatkan keadaan server.

## 4. Kontrak backend

### 4a. Baca dan nilai efektif

| Fungsi sumber | Saringan/perakitan yang benar-benar terlihat |
|---|---|
| `getPendingApprovals` (`ApprovalService.js:622-660`) | identitas → antrean per level → ambang berlaku → scope section; scope kosong berarti seluruh section |
| `getPendingApprovalsEnriched` (`:701-933`) | WO/tim segar; referensi tampilan boleh cache 5 menit; komponen/job/manual, unit, tim efektif, faktor ketepatan, nama aktor, grup, putaran/alasan, pasangan kembar, detail tyre, waktu+partial, judgment dan jejak override |
| `getAllActiveWosForManagement` (`:1474-1520`) | gerbang role; status pending mechanic/in progress; enrichment nama/unit/tim |
| `getApprovedWosForManagement` (`:1613-1672`) | gerbang role; approved aktif+arsip, tanggal disahkan bulan kalender ini; urut created_at desc; 100; rupiah dari jumlah baris MechanicPoints |
| `getRejectedWosForManagement` (`:1535-1610`) | gerbang role; aktif+arsip → ambang → rejected/cancelled → urut created_at desc → 100 |
| `getPendingTransfers` (`:1977-2044`) | **role + scope** → pending_transfer; tim dan peminta; sesi, partial kini, partial jika disetujui |
| `getAllMechanicsForOverride` (`:1389-1398`) | mechanic, saringan akun uji mengikuti identitas pemakai; hanya id/nama untuk picker |

**Jangan menganggap semua helper legacy sudah scope-safe:** active/approved/
rejected di rentang di atas tidak menambahkan saringan section lokal. Handler
web hanya meneruskan hasil (`Router.js:492-503`). Kontrak target wajib memakai
tenant dan scope pada **seluruh** query sebelum LIMIT; ini penegakan akses,
bukan aturan uang baru.

Ambang KMB V2: `submitted_at`, cadangan `created_at`, sebelum **16 Agustus 2026
00:00 waktu bisnis** disembunyikan; bila kedua tanggal rusak/kosong, data tetap
terlihat untuk diperiksa (`_PeriodePayroll.js:374-416`). Tidak dipasang pada
bacaan mentah yang melayani meter, deteksi kembar, atau lookup per ID
(`:419-426`). Target `periode.ts` dan konfigurasi ambang bersama masih belum
ada; jangan hardcode tanggal ini di setiap layar atau menyatakan filter telah
diterapkan pada `kueriApproval.ts` saat ini.

Base/target/tim: **L2 → L1 → sumber asli**, dengan nol override yang sah tetap
dianggap terisi. Others legacy menyimpan input awal pada kolom override L1;
itu **bukan** bukti supervisor mengubahnya (`ApprovalService.js:896-911,936-945,
1013-1022`). Target memisahkannya sebagai `manual_*`.

Ketepatan dihitung dari actual efektif ÷ target efektif: ≤100% `on_time`,
≤150% `late`, selebihnya `way_late`; besar faktor dari konfigurasi, bukan angka
mati. Badge sumber hanya hadir bila actual dan target >0
(`ApprovalService.js:839-847`; `PointsCalculation.js:185-230`). Jam memakai satu
fungsi format bersama, termasuk carry ketika pembulatan menit menjadi 60
(`Approval.html:197,862-869`; target `src/lib/format.ts`).

### 4b. Keputusan dan uang

| Tindakan | Kontrak sumber dan sasaran |
|---|---|
| Approve L1 (`ApprovalService.js:87-170`) | L1/L2 dalam scope; status segar pending_supervisor → pending_superintendent; catat aktor/waktu/putaran + safety/redo sebagai informasi; belum menerbitkan poin |
| Approve L2 (`:223-368`) | L2 dalam scope; pending_superintendent → approved; pilihan safety/redo final; hitung dengan override efektif; catat snapshot, persetujuan, poin penuh per anggota, audit |
| Reject (`:173-220,371-418`) | hanya tahap yang boleh diputuskan aktor; alasan wajib; status terminal rejected; simpan siapa/kapan/alasan pada WO dan audit persetujuan |
| Kembalikan (`:474-587`) | status segar menentukan level; L1 tidak boleh menarik WO dari meja L2; pending L1/L2 → pending_mechanic_work; putaran +1; hapus stempel L1; pertahankan waktu, meter, part, **partial_hours** |
| Cancel (`:1412-1471`) | alasan wajib; cari aktif/arsip; rejected/cancelled tidak bisa dibatalkan lagi; approved dinolkan **final_points, points dan rupiah**; simpan jejak siapa/kapan/alasan |

Rumus sumber: `round(BASE × UNIT × KONDISI × KETEPATAN × SAFETY × MTBF, 2)`
(`ScoringService.js:41-120`). Setiap mekanik memperoleh final points utuh;
rupiah per mekanik dihitung memakai tarif jabatannya saat penerbitan
(`ScoringService.js:542-556`). Angka `Final Points` kartu bukan jumlah points
semua anggota; rupiah kartu adalah jumlah `idr_value` mereka
(`ApprovalService.js:1639-1645,1666`). **Jangan menghitung ulang rupiah approved
dengan tarif sekarang.** Target membekukan tarif dan snapshot
(`src/domain/approval.ts:166-201`; `db/schema.sql:472-504`).

Sumber L2 punya “mode lanjutan”: status approved belum membuktikan poin sudah
terbit karena timeout GAS dapat memutus di tengah (`ApprovalService.js:236-246`).
Komentar awal menyebut langkah pasca-klaim di luar lock, tetapi kode sekarang
menjalankannya **di dalam lock yang sama** (`:330-361`); tetap bukan transaksi
yang bisa rollback. Target harus satu transaksi: perubahan status + snapshot +
semua poin + persetujuan + audit + struk berhasil, atau semuanya batal.

### 4c. Override server

`saveOverride` memilih level dari identitas, bukan payload; memeriksa role dan
scope (`ApprovalService.js:1034-1053`). Validasi sumber:

- base points 0–10.000; target hours 0–1.000; nilai numerik valid
  (`:1081-1087`; `Constants.js:534-536`).
- waktu berpasangan, akhir setelah awal, sesi dibulatkan dua desimal, >0 dan
  ≤1.000 jam; total = sesi baru + partial lama (`:1055-1078,1104-1129`).
- tim berisi mechanic ID yang ada dan percentage 100; tidak membagi poin
  (`:1089-1102`). Target perlu pula validasi array tidak kosong/unik, tenant dan
  kelayakan anggota di server; JS sumber saja yang menolak duplikasi.
- kondisi hanya `normal/difficult/extreme`, karena kunci salah dapat jatuh ke
  faktor bawaan dan mengubah pembayaran (`:1166-1193`).
- judgment maksimal 500; kehadiran catatan pada level mengalahkan warisan
  meskipun isinya sengaja kosong (`:1197-1209`).
- unit override bersumber daftar seluruh unit, sengaja tanpa pembatasan
  job/model/section unit atas keputusan Gabriel; hanya faktor unit yang ikut
  berganti, base/target tetap milik job. Unit penanda scope `others` ditolak;
  placeholder legacy WORKSHOP/OTHERS diperlakukan khusus (`:1132-1163`).

Waktu/unit/kondisi legacy menulis nilai efektif ke kolom WO dan jejak lama→baru
terpisah supaya semua layar/scoring sepakat. Target sudah punya tabel override;
query layar wajib memakai resolver yang sama dengan uang, atau memperbarui
proyeksi WO **dalam transaksi yang sama**. Jangan membuat dua nilai yang saling
bertentangan. **Tidak ada guard status di `saveOverride` sumber**: target wajib
mengunci dan memeriksa status pending yang masih boleh diubah; WO approved tidak
boleh diubah diam-diam lewat modal basi. Audit lama→baru jangan berhenti di nilai
terakhir: PK override target menyimpan satu nilai per jenis/level, sehingga
riwayat perubahan berulang harus tetap ditulis ke `audit_logs`.

### 4d. Transfer server

`APPROVER_ROLES` mencakup L1 dan L2 (`Constants.js:278`), meskipun judul komentar
menyebut keputusan L1. Sumber approve (`ApprovalService.js:1705-1878`):

1. Normalisasi array/string ID, trim, dedup, wajib ≥1.
2. WO harus pending_transfer dan actor berwenang atas section.
3. Penerima ada, aktif, belum dalam tim; anggota lama dipertahankan.
4. Sesi = `(transfer_stopped_at - transfer_started_at)/3600000`, dua desimal;
   pasangan tanggal invalid menghasilkan 0 di helper sumber (`:1679-1684`).
5. Klaim status segar sekali; partial baru = partial lama + sesi.
6. Kembali pending_mechanic_work; tambah penerima ke tim dengan poin penuh;
   jejak penerima/jam/aktor, catatan mekanik tetap tersedia.

Tolak (`:1882-1967`) tidak menambah partial/tim, kembali pending_mechanic_work,
mempertahankan waktu dan catatan sesi sebagai bukti, mencatat alasan dan jam
hangus. Target menyimpan bukti itu di `work_order_transfers` dan recipients.
Data historis invalid harus terlihat sebagai masalah kualitas data, bukan
disulap menjadi sesi valid.

**Batas atomicity legacy:** approve memperbarui status/jam sebelum append tim
di luar lock (`:1794-1851`), reject tidak mengambil lock yang sama (`:1931-1952`).
Target harus menserialkan approve-vs-approve **dan approve-vs-reject** atas satu
transfer; status, jam, anggota, keputusan dan struk dalam satu transaksi. Sukses
ulang harus mengembalikan keputusan yang benar-benar tersimpan, bukan
menggambarkan “setuju” jika yang memenangkan balapan adalah “tolak”.

## 5. Terjemahan ke KMB Project

### 5a. Pemetaan data

| KMB V2 | KMB Project / aturan |
|---|---|
| `WorkOrders` + `WorkOrders_Archive` | `work_orders`; tidak ada tabel arsip paralel (`db/schema.sql:274-356`) |
| `component_id` / `job_id` | `jobs` + hierarki komponen; manual memakai `is_manual/manual_*` |
| `WorkOrderTeam`, percentage 100 | `work_order_team`, PK WO+mechanic; tanpa percentage (`:407-413`) |
| `override_*_supervisor/superintendent` | `work_order_overrides(level,kind,value,set_by,set_at)` (`:440-452`) |
| override base/target | JSON number, termasuk 0; level L2 menang atas L1 |
| override team JSON | array integer mechanic ID; cocok `nilaiEfektif.ts:102-109` |
| override waktu JSON | `{start_time,end_time,session_hours}` rancangan payload target; resolver sekarang membaca `session_hours` saja (`nilaiEfektif.ts:89-99`) |
| override unit | `{unit_id,unit_factor}` rancangan payload; resolver sekarang membaca `unit_factor` (`nilaiEfektif.ts:72-81`) |
| `judgment_at_*` + teks | baris kind `judgment`; keberadaan baris membedakan belum menyentuh vs sengaja kosong; resolver judgment layar **belum ada** |
| `actual_hours` ditulis manual | kolom GENERATED `session_hours + partial_hours`; jangan UPDATE langsung (`db/schema.sql:307-313`) |
| `transfer_*` pada WO | `work_order_transfers` + `work_order_transfer_recipients` (`:416-434`) |
| `approved_by_*`, `*_approved_at` | `approved_l1_by/at`, `approved_l2_by/at`; join nama mechanics |
| `dikembalikan_*`, `alasan_kembali` | `returned_by/at`, `return_reason`, `putaran` |
| `Approvals` | `approvals`, unik WO+stage+decision+putaran (`:458-468`) |
| `ScoringSnapshots` | `scoring_snapshots`, unik WO (`:472-485`) |
| `MechanicPoints` | `mechanic_points`; PK WO+mechanic, points dan tarif beku, rupiah GENERATED (`:489-504`) |
| `ProcessedOps` | `processed_ops` + `jalankanPerintah`; struk ikut transaksi (`:516-527`) |

### 5b. Sketsa kueri — belum implementasi

Gunakan parameter waktu bisnis yang disiapkan resolver periode bersama.
Scope/tenant diterapkan **sebelum** count dan limit. Contoh approved:

```sql
-- RANCANGAN, bukan kode yang telah terpasang.
WITH sesuai_akses AS (
  SELECT w.*
  FROM work_orders w JOIN sections s ON s.id = w.section_id
  WHERE w.tenant_id = $1
    AND ($2::text[] IS NULL OR s.code::text = ANY($2::text[]))
    AND w.status = 'approved'
    AND w.approved_l2_at >= $3::timestamptz
    AND w.approved_l2_at <  $4::timestamptz
    AND coalesce(w.submitted_at,w.created_at) >= $5::timestamptz
)
SELECT w.id, w.wo_number, w.final_points,
       ss.base_points, ss.target_hours, ss.actual_hours,
       coalesce(p.total_idr,0) AS final_idr,
       count(*) OVER () AS total_sebelum_limit
FROM sesuai_akses w
LEFT JOIN scoring_snapshots ss ON ss.work_order_id = w.id
LEFT JOIN LATERAL (
  SELECT sum(mp.idr_value) AS total_idr
  FROM mechanic_points mp WHERE mp.work_order_id = w.id
) p ON true
ORDER BY w.created_at DESC, w.id DESC
LIMIT 100;
```

Agregat rupiah dibuat sebelum digabung dengan tim, supaya satu baris poin tidak
tergandakan JOIN anggota. Jika hasil nol, query count tersendiri tetap harus
mengembalikan 0. Approved menggunakan snapshot untuk angka keputusan; pending
memakai resolver nilai efektif. Informasi pasangan kembar dibaca dari riwayat
utuh, tidak dibatasi `$3..$5` atau limit kartu.

### 5c. Sketsa transaksi override/transfer — belum implementasi

Semua langkah berikut harus berada dalam callback `jalankanPerintah`, **bukan**
membuka jalur tulis baru. Actor/tenant berasal sesi; level berasal identitas.

```sql
-- RANCANGAN: kunci WO yang memang masuk tenant/scope actor terlebih dahulu.
SELECT w.* FROM work_orders w JOIN sections s ON s.id = w.section_id
WHERE w.id = $1 AND w.tenant_id = $2
  AND ($3::text[] IS NULL OR s.code::text = ANY($3::text[]))
FOR UPDATE OF w;

-- Server periksa tahap, role, angka, tim, tanggal sebelum UPSERT.
INSERT INTO work_order_overrides
  (work_order_id,level,kind,value,set_by,set_at)
VALUES ($1,$4::override_level,$5::override_kind,$6::jsonb,$7,now())
ON CONFLICT (work_order_id,level,kind) DO UPDATE
SET value=EXCLUDED.value,set_by=EXCLUDED.set_by,set_at=EXCLUDED.set_at;
-- Audit berisi before/after; ambil before sebelum UPSERT.
-- Saat koreksi waktu: UPDATE start_time/end_time/session_hours jika memakai
-- proyeksi WO; partial_hours tetap, actual_hours dihitung database.
```

Transfer memerlukan kunci **WO dan baris permintaan**; pastikan `decision IS NULL`
dan status pending_transfer setelah kunci diperoleh. Approve memperbarui partial
tepat sekali dan menambah anggota; reject mempertahankan partial. Catatan sesi
lama tetap di tabel transfer. Bersihkan sesi terakhir yang sudah dipindahkan
ke partial agar tidak ikut dihitung dua kali oleh `actual_hours` GENERATED;
penerima memulai sesi baru. Validasi ini menunggu implementasi request/decision
transfer, bukan sudah dijamin hanya karena tabelnya tersedia.

### 5d. Keadaan target yang terverifikasi pada 15 September 2026

| Sudah ada | Belum setara / pekerjaan berikut |
|---|---|
| lima tab + hitungan, kartu dasar | judul selalu pending; ikon/teks berbeda; satu bentuk kartu dipakai semua tab (`page.tsx:10-18,54-107`) |
| limit 25 + `semua=1` | semua dibatasi 500 dan spanduk hilang; approved belum bulan kalender/100/pencarian (`page.tsx:42-50`; `kueriApproval.ts:76-163`) |
| tenant/scope dalam query kartu | belum ambang; base/target/tim dari katalog/tim asli, belum resolver override; kembar hanya boolean; belum total IDR, alasan, tyre, rincian transfer (`kueriApproval.ts:103-158`) |
| tombol urut lima | Edit disabled; Approve langsung kirim, tanpa safety/redo modal; pembatalan L1 disabled; tab aktif/approved tidak menyediakan aksi (`AksiKartu.tsx:95-114`; `page.tsx:104`) |
| approve_l1/l2, reject, kembali, batal | `save_override`, request/approve/reject transfer belum ada dalam daftar API (`src/app/api/perintah/route.ts:52-81`) |
| snapshot/tarif beku, uang+status satu transaksi | perubahan uang tetap butuh uji integrasi sebelum/sesudah implementasi |
| `nilaiEfektif` menjaga partial | layar belum memakai hasilnya, belum resolver judgment/history yang dibaca UI (`nilaiEfektif.ts:18-21,84-99`) |
| API menerima safety/redo | UI sekarang mengirim hanya `{woId}` saat approve (`AksiKartu.tsx:56-59`) |

**Gap akses dan jejak yang harus ditutup sebelum klaim jalur uang lengkap:**

- `tolakWo` dan `kembalikanKeMekanik` target memeriksa actor L1/L2 tetapi menerima
  kedua status pending, belum menolak L1 di meja L2 (`approval.ts:279-288,
  333-344`). Sumber kembali menegakkan per tahap (`ApprovalService.js:524-542`).
- `rebutStatus` target menyaring ID/status saja (`runCommand.ts:94-105`). Jalur
  tulis perlu membuktikan tenant/scope actor; policy RLS yang ada hanya SELECT
  (`db/schema.sql:714-747`). Jangan menganggap `SET LOCAL` sendiri sudah menjadi
  guard tulis, terutama jika koneksi memiliki hak melewati RLS. Ini temuan baca
  kode, **belum uji penyalahgunaan** atau audit akses lengkap.
- `batalkanWo` target hanya mengizinkan L2, sedangkan sumber backend mengizinkan
  L1/L2 dan mekanik pada WO buatannya yang belum dikerjakan. UI sumber approved
  memang L2 saja. Jangan menyamakan aturan tiga konteks ini. Target juga belum
  mengisi `rejected_by/at/rejection_reason` saat cancel, hanya audit
  (`approval.ts:231-267`), sehingga riwayat pembatalan tidak lengkap.
- `AksiKartu.tsx:44-46` membuat UUID **di setiap pemanggilan kirim** meskipun
  komentarnya mengatakan lahir sekali. Pengiriman ulang tindakan yang sama perlu
  memakai ID lama; dedup server tidak mengenali UUID baru sebagai maksud lama.

## 6. Jebakan yang wajib dibawa beserta alasannya

1. **Kembar L1 dan L2.** Komentar HTML `Approval.html:285-290` masih mengatakan
   hanya L2. Kode dan keputusan lebih baru pada `ApprovalService.js:717-745,879`
   tidak membatasi L1: L1 paling dekat lapangan dan mampu menangkap kekeliruan
   jujur. Risiko pembuat WO mempelajari ambang diterima Gabriel; pengimbangnya
   laporan admin memakai jendela **lebih lebar**. Jangan menghapus akses L1
   berdasarkan komentar HTML usang, atau menerapkan filter payroll pada kandidat.
2. **Kehilangan nama bukan kehilangan anggota.** Sumber memisahkan parse tim
   dari pelengkapan nama; kegagalan lookup nama dulu membuang override dan
   membayar tim awal (`ApprovalService.js:969-1009`). Fallback ID untuk label
   boleh; mengganti daftar penerima diam-diam tidak boleh.
3. **Judgment kosong adalah keputusan.** Tanpa penanda pernah menyentuh, catatan
   L1 yang dihapus L2 muncul lagi (`:1197-1209`). Kehadiran row target mengganti
   penanda waktu legacy; jangan gunakan `coalesce` yang menghidupkan warisan lagi.
4. **Jam sebelum transfer milik kerja sebelumnya.** Koreksi sesi terakhir maupun
   Kembalikan tidak boleh menghapus partial (`:453-465,1104-1129`). Meng-copy pola
   SUM yang berbeda konteks pernah membuat mekanik dibayar kurang.
5. **Satu klik dari halaman basi tidak menentukan tahap.** Server membaca keadaan
   segar; persetujuan dan pengembalian bersamaan harus hanya menghasilkan satu
   keputusan (`:499-542`; `Approval.html:1034-1039`).
6. **Rupiah hantu saat cancel.** Poin nol dengan rupiah masih terisi pernah
   ditampilkan seolah sudah dibayar (`ApprovalService.js:1462-1465`). Target
   kolom GENERATED menutup perbedaan ini, tetapi status dan poin tetap harus
   berada dalam transaksi sama.
7. **Date/time grid menyusut dengan benar.** `1fr 1fr` memberi batas min-content
   sehingga kolom Selesai terdorong keluar layar; sumber memakai minmax dan
   min-width:0 (`Approval.html:755-764`). Ini alasan bentuk, bukan dekorasi.
8. **Tanggal dibuat harus menyertakan jam.** Dua WO satu tanggal pada shift
   berbeda tidak boleh terlihat identik (`Approval.html:399-401`).
9. **Tidak ada catatan tersembunyi tambahan.** Kotak “Catatan” approval lama
   dihapus karena terkubur di JSON; Judgment menggantikannya dan dapat dibaca
   dashboard (`ApprovalService.js:63-81`). Jangan menambah kotak wajib baru.

## 7. Yang tidak perlu ditiru

- URL deployment GAS hardcode, token pada query, `google.script.run`, scriptlet
  ES5, perbaikan escaping `&`, include DateTime24 dan injeksi DOM manual: gunakan
  route/session/komponen React. **Bentuk kontrol dan semantics tetap sama.**
- Arsip sheet paralel dan flush/cache invalidation/global lock marker; Postgres
  menyediakan indeks, kunci baris dan transaksi. Mode lanjutan approved-tanpa-poin
  bukan fitur target, sebab keadaan separuh jadi tidak boleh commit.
- Estimasi `0.07 detik/kartu`, redirect `window.top`, workaround batas eksekusi
  GAS, dan field persentase tak terpakai; jangan menyalin alasan platform lama
  sebagai aturan baru target.
- Duplicate ID `modalWorkCondition`, input readonly kondisi yang ketinggalan,
  komentar L2-only kembar yang usang, fallback email, serta galat yang diubah
  menjadi `[]` pada Router. Semuanya didokumentasikan sebagai perbedaan sengaja.
- `saveOverride` tanpa guard status, cancel yang menelan kegagalan nol poin,
  transfer status/jam yang terpisah dari perubahan tim, dan asumsi RLS tanpa
  bukti. Port hasil bisnisnya dengan transaksi dan validasi; jangan membawa
  celah implementasi sebagai alasan “1:1”.

## 8. Daftar periksa selesai

### Dokumentasi

- [x] Cabang, sumber, markup, fungsi backend dan target diperiksa langsung.
- [x] Lima view, tiga modal, label, struktur, parameter dan asal angka dicatat.
- [x] Override, transfer, keputusan safety/redo, rupiah beku dan jejak dijelaskan.
- [x] Komentar yang merekam insiden dan konflik komentar-vs-kode dinyatakan.
- [x] Rancangan SQL dibedakan dari implementasi; tidak ada perubahan aplikasi/DB.

### Implementasi — belum dinyatakan selesai

- [ ] Lima view menggunakan bentuk kartu, judul, teks kosong, ikon dan aksi yang
  sesuai; nama orang tanpa email; group/return/kembar/tyre tampil sebelum aksi.
- [ ] Pending count tetap total sebenarnya; `Tampilkan semua` jujur; approved
  hanya disahkan bulan kalender ini/100, pencarian nomor dan hint Export Payroll.
- [ ] Query pending memakai nilai efektif yang sama dengan scoring; approved
  memakai snapshot/rupiah beku; perbedaan hasil setelah ubah katalog tidak ada.
- [ ] Modal approve prefill safety/redo L1; L2 menentukan final; approve tidak
  langsung mengirim sebelum konfirmasi; safety benar-benar menghasilkan 0.
- [ ] Edit Override lengkap, target jam+menit, dropdown tim, ID unik, history;
  backend validasi status/level/tenant/scope dan seluruh nilai, audit before/after.
- [ ] L2 menghapus judgment L1 tetap kosong setelah reload; nol base yang sah
  tidak berubah menjadi fallback; Others baru tidak mendapat badge override palsu.
- [ ] Uji partial 3 + sesi 2 = actual 5; Kembalikan tidak menghapus partial;
  override/re-submit tidak membangkitkan sesi lama secara diam-diam.
- [ ] Transfer multiple receiver menambah tim penuh; penerima nonaktif/duplikat/
  anggota lama ditolak server; jumlah jam sebelum/sesudah dan jam hangus terlihat.
- [ ] Dua approver atau approve-vs-reject transfer bersamaan hanya satu keputusan;
  session dipindah ke partial sekali; audit, anggota dan struk ikut transaksi.
- [ ] Cancel approved menyampaikan bahaya, meminta alasan, menolkan poin+rupiah
  seluruh anggota, mempertahankan audit, mengisi jejak pembatalan pada WO.
- [ ] Reject/Kembalikan L1 tidak dapat memutus tahap L2 melalui API langsung;
  WO luar tenant/scope tidak bisa dibaca/diubah; authorization tidak hanya UI.
- [ ] Putus jawaban tidak disebut pasti gagal; retry maksud yang sama memakai
  `op_id` sama; konflik antar maksud berbeda memperlihatkan keadaan tersimpan.
- [ ] Jalankan uji integrasi uang sebelum/sesudah implementasi dan bandingkan
  layar dengan sumber, termasuk viewport kecil, modal panjang dan data kosong.
