# Bug dan perbedaan yang dicatat

Selama migrasi, bug **tidak diperbaiki**. Bug dicatat di sini, lalu baru dikerjakan setelah ketiga rumah selesai pindah, dimulai dari SUM V2.

Ada dua pengecualian yang tetap dikerjakan sekarang:
- perbedaan antara sistem baru dan GAS, yang diperbaiki supaya kembali sama dengan GAS;
- kebocoran keamanan yang lahir dari kode baru.

Cara mencatat: tambahkan satu baris di bawah. Jangan menghapus baris lama. Kalau sebuah bug sudah dikerjakan setelah migrasi, isi kolom "Status".

| # | Rumah | Temuan | Sumber | Dicatat | Status |
|---|---|---|---|---|---|
| 1 | kmb, sum | `VerifySpreadsheetData.js` membuka spreadsheet `1GTJP…`, bukan spreadsheet rumahnya sendiri. Kemungkinan file ini tersalin antar-proyek. Ini hanya alat cek manual, bukan alur utama. | GAS | 27 Okt, Claude | |
| 2 | semua | Token yang tidak terhubung ke data mekanik diperlakukan berbeda di tiap sistem. KMB V2 menolaknya. KMB Project menerimanya sebagai `mechanic` dengan email buatan `<id>@kmb.local`. SUM V2 menerimanya dengan peran kosong. | `_resolveToken` di `ApiService.js` | 27 Okt, Claude | |
| 3 | sum | Dari inventaris SUM V1 (16 Jul): `cancelWorkOrder` tidak mengosongkan `idr_value`; `handleCreateWO` tidak punya nilai cadangan `\|\| 1.0` untuk `manual_unit_factor`; tampilan timeliness memakai angka tetap 1.0/0.8/0.5. **Perlu dicek ulang di SUM V2.** | `MAR-SUM/FASE0-INVENTARIS.md` | 27 Okt, Claude | |
| 4 | semua | Empat fungsi didefinisikan dua kali (`formatNumber`, `getStatusLabel`, `isTerminalStatus`, `truncate`), dan hanya satu yang aktif di GAS. | GAS | 27 Okt, Claude | |
| 5 | sum (kmb perlu dicek) | Nomor WO berbentuk `WO-YYYYMMDD-XXX`, sehingga hanya ada 1.000 kemungkinan nomor per hari, padahal volumenya sekitar 130 WO per hari. Penjaga anti-kembar hanya membaca sheet miliknya sendiri. Penting untuk saklar (lihat `docs/SAKLAR.md`). | `generateWoNumber` di `Utils.js` | 27 Okt, Claude | |
| 6 | kmb-projek | **Pelanggaran Isolasi Rumah (§1 & §2)**: Dropdown Team Composition di Create WO menampilkan label golongan `(1a)` pada nama mekanik. Sistem penjenjangan/penilaian golongan (`1a`, `1b`, `2a`, dll) adalah **milik rumah SUM V2**, bukan KMB Project. Di Spreadsheet dan GAS asli KMB Project, dropdown mekanik murni hanya menampilkan nama mekanik. Sesuai AGENTS.md §1, sistem baru yang terlanjur berbeda dari spreadsheet/GAS **wajib dikembalikan sama persis dengan aslinya**. | Form Create WO (`patched-app.js`) & `kmb_create_refs` | 27 Okt, Raka (+ Antigravity) | Terbuka (akan diperbaiki) |
| 7 | bersama | **Kebocoran Token Cross-Tenant (Keamanan)**: Token milik tenant SUM bisa membuka data KMB kalau prefix token cocok dengan tenant lain. User login SUM (token `sum-xxx`), terus login KMB (token `kmb-xxx`), tapi UI menampilkan data tenant yang tidak sesuai. Root cause: `identitasDariTokenSupabase` tidak validasi tenant dari token prefix cocok dengan tenant_code di database. | Alur login → `akuServer()` → `identitasDariTokenSupabase()` | 28 Okt, Raka (+ opencode) | Diperbaiki 28 Okt |
| 8 | kmb-projek | **Regresi Resolusi Token Cermin**: Pada commit `4259f67` saat perbaikan bug #7, query fallback ke skema cermin `kmb_projek.api_tokens` terhapus dari `identitasDariTokenSupabase`. Menyebabkan token mekanik KMB Project yang tersimpan di skema cermin tidak dapat login. | `src/backends/supabase/auth.ts` | 28 Okt, Raka (+ Antigravity) | Diperbaiki 28 Okt |

