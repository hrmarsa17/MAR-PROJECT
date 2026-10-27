# AGENTS.md — Abadi Operation

Berlaku untuk **semua orang dan semua AI** yang bekerja di repo ini (Claude, Codex, Gemini, Cursor, dan lainnya).
Kalau alatmu membaca nama file lain, arahkan file itu ke file ini. Contohnya `CLAUDE.md` yang hanya berisi `@AGENTS.md`.

Repo ini memindahkan tiga sistem MAR dari Google Apps Script (GAS) ke **Cloudflare Workers + Supabase**:
**KMB V2**, **KMB Project**, dan **SUM V2**. Nama platformnya **Abadi Operation**, alamatnya `abadiops.com`.

Bacaan wajib sebelum mengubah apa pun, berurutan:
1. File ini.
2. `docs/KEPUTUSAN.md`: semua keputusan yang sudah diambil, dan yang masih menunggu.
3. Lima entri teratas `docs/PROGRES.md`: apa yang terakhir dikerjakan, plus daftar tugas terbuka.
4. `docs/SAKLAR.md`, kalau pekerjaanmu menyentuh alur WO lama atau WO baru.

---

## 0. Protokol setiap sesi (WAJIB)

Gabriel dan Raka, beserta AI mereka, bekerja di repo ini pada waktu yang sama dengan **akun GitHub yang sama**.
Supaya pekerjaan tidak saling menimpa atau menumpuk:

**Sebelum mulai**
1. Jalankan `git pull --rebase` di `main`. Jangan mulai bekerja di salinan yang belum ditarik.
2. Baca bacaan wajib di atas.
3. Pastikan kamu tahu sedang bekerja di rumah yang mana (§2). Jangan menyentuh rumah lain.

**Selama kerja**
4. Buat commit kecil dan sering. Jalankan `git pull --rebase` lagi tepat sebelum `git push`.
5. Kalau terjadi konflik di file milik orang lain, **berhenti dan tanya pemiliknya**. Jangan memilih versimu sendiri.

**Sesudah kerja (jangan dilewati)**
6. Tambahkan satu entri di **bagian atas** `docs/PROGRES.md`: tanggal, siapa (orang dan AI), rumah, apa yang berubah, dan apa yang belum selesai.
7. Kalau ada keputusan baru atau keputusan yang berubah, perbarui `docs/KEPUTUSAN.md`.
8. Kalau menemukan bug atau perbedaan perilaku, catat di `docs/BUG-DICATAT.md`. Jangan diperbaiki (lihat §1).
9. Commit dan push dokumen-dokumen itu bersama kodenya. **Dokumen yang tidak diperbarui berarti pekerjaannya belum selesai.**

**Penanda siapa.** Akun GitHub, Cloudflare, dan Supabase dipakai bersama, jadi riwayat akun tidak bisa menunjukkan siapa yang mengerjakan apa. Gantinya:
- Setel nama sendiri di laptop masing-masing, khusus untuk repo ini: `git config user.name "Gabriel"` atau `git config user.name "Raka"`.
- Awali pesan commit dengan nama rumahnya: `[kmb] …`, `[kmb-projek] …`, `[sum] …`, atau `[bersama] …`.
- Di `docs/PROGRES.md`, selalu tulis nama orangnya.

---

## 1. Aturan utama: PINDAHKAN DULU, PERBAIKI NANTI

Perilaku tiap sistem dipindah **persis seperti di GAS-nya sendiri, termasuk bug-nya**.
Tidak ada perbaikan. Tidak ada penyeragaman antar-rumah. Tidak ada "yang ini lebih bagus, kita pakai juga di sana".
Bug baru dikerjakan setelah ketiga rumah selesai pindah, satu rumah per kali.

Sebelum mengubah perilaku apa pun, jawab pertanyaan ini:

> **Apakah GAS rumah ini melakukan hal yang sama?**
> - **Ya** → salin persis.
> - **Tidak, dan perubahanmu akan membuat sistem baru berbeda dari GAS** → jangan dikerjakan. Catat di `docs/BUG-DICATAT.md`.
> - **Sistem baru sudah terlanjur berbeda dari GAS** → memperbaikinya supaya kembali sama dengan GAS **boleh dan wajib**.

Satu pengecualian: **kebocoran keamanan yang lahir dari kode baru** (§4) wajib diperbaiki segera.

"Sama persis" mencakup semua yang terlihat pengguna dan semua yang menyentuh uang:
- input yang diterima atau ditolak;
- **pesan error, huruf demi huruf**, karena PWA mengenalinya lewat pola teks;
- nama dan bentuk setiap field JSON;
- angka poin dan rupiah;
- status WO;
- baris dan kolom yang ditulis.

Kelambatan GAS, batas waktu 6 menit, dan antrean kunci (lock) **tidak** perlu ditiru.

Jebakan yang membuat hasil diam-diam berbeda:
- **Zona waktu.** GAS memakai `Asia/Jakarta`, sedangkan Worker berjalan dalam UTC. Hitung semua tanggal secara eksplisit dalam WIB: periode payroll, kadaluwarsa 24 jam, dan nomor WO yang memuat tanggal.
- **Hitungan uang tetap di JavaScript**, dengan urutan operasi yang sama seperti di GAS. Jangan dipindah ke SQL, karena tipe `numeric` membulatkan secara berbeda.
- **Cara GAS membaca sel.** Sel kosong dibaca sebagai `''`, angka bisa tersimpan sebagai teks, dan `'false'` dibandingkan sebagai teks. Tiru cara GAS mengubahnya.
- **Fungsi kembar di GAS.** `formatNumber`, `getStatusLabel`, `isTerminalStatus`, dan `truncate` masing-masing didefinisikan dua kali, dan hanya satu yang aktif. Salin versi yang aktif. Tanyakan langsung ke GAS-nya, jangan menebak.

---

## 2. Tiga rumah

Satu pintu (`abadiops.com`), tiga rumah di belakangnya. Token menentukan rumah mana yang dituju.
Tiap rumah punya frontend dan backend sendiri.

| | Rumah KMB V2 | Rumah KMB Project | Rumah SUM V2 |
|---|---|---|---|
| Kode rumah | `kmb` | `kmb-projek` (skema `kmb_projek`) | `sum` |
| Pemegang | Gabriel | **Raka** | Gabriel |
| Frontend asal (PWA) | `mar-offline` | `mar-projek-offline` | `mar-sum-offline` |
| Backend sekarang (GAS `/exec`) | `AKfycbwlwlQv…` | `AKfycbxh4086…` | `AKfycbzB5EUJ…` |
| Spreadsheet | `1ehnxDlv…` | `1lnJo74O…` | `1qHjfIUT…` (perlu dikonfirmasi: script `1k_A_KER…`) |
| Backend yang disiapkan | Supabase skema `kmb` | skema `kmb_projek` | skema `sum` |

Aturan rumah:
1. **Frontend adalah salinan 1:1 dari PWA lama rumah itu.** Cara paling aman: pakai file PWA lama apa adanya, dan ubah hanya alamat API serta tombol serah-terima token. Kalau frontend dibangun ulang, hasilnya wajib identik dengan PWA lama (layar, alur, field, dan pesan) dan dibandingkan berdampingan. Ukuran "identik" ada di PWA lama, bukan di rumah lain.
2. **Backend sekarang tetap GAS.** Worker milik rumah meneruskan permintaan ke GAS rumah itu sendiri.
3. **Backend Supabase disiapkan di skema rumah itu sendiri.** Mulai dari cermin sheet yang persis. Setelah itu aksi dipindah satu per satu, masing-masing setelah lulus **uji kembar**: untuk permintaan yang sama, JSON dari Worker harus sama dengan JSON dari GAS.
4. **Jangan menyentuh folder, skema, atau GAS milik rumah lain.** Perubahan yang menyentuh lebih dari satu rumah wajib ditulis di `docs/PROGRES.md` dan diketahui pemilik rumah tersebut.
5. **Bagian bersama** dikerjakan berdua, dan yang lain diberi tahu sebelum diubah: pintu depan, buku tamu kiriman, saklar, CI, dan file ini.

---

## 3. Saklar "WO baru ke Supabase"

Ringkasnya (detail lengkap ada di `docs/SAKLAR.md`):
- Tiap rumah punya satu saklar. **Bawaannya MATI.**
- **Saklar mati:** semua tetap lewat GAS, seperti sekarang.
- **Saklar menyala:** WO **baru** lahir dan selesai di Supabase. WO **lama** (yang lahir di GAS) tetap diteruskan ke GAS sampai approved.
- Setiap WO punya **satu rumah seumur hidupnya**, dan tidak pernah dipindah di tengah jalan.
- Data hanya mengalir **satu arah, dari spreadsheet ke Supabase**. Sistem baru tidak pernah menulis ke spreadsheet.
- Yang boleh membalik saklar hanya **Gabriel**. Setiap pembalikan dicatat di `docs/SAKLAR.md`.

---

## 4. Keamanan: larangan keras

- **Jangan pernah** menaruh token, password, kunci API, atau string koneksi database di repo, di dokumen, maupun di bundle frontend.
- **Jangan pernah** menaruh data produksi di repo atau di bundle: daftar mekanik, nama, email, isi sheet `ApiTokens`, atau tarif. Data contoh dan data uji harus **palsu**.
- **Token hanya diperiksa di server** (GAS atau Worker). Frontend tidak boleh membawa daftar token milik siapa pun.
- Rahasia disimpan di **Cloudflare secrets** (`wrangler secret put`) atau **GitHub Actions secrets**. File `.env` tidak pernah di-commit.
- Sebelum commit, periksa diff-mu. Pastikan tidak ada token, email orang, atau alamat database lengkap di dalamnya.
- Token lama milik pengguna dipertahankan apa adanya, kecuali token yang pernah bocor. Token yang bocor wajib diganti.

---

## 5. Garis merah

- **Jangan `clasp push` ke GAS produksi**, dan **jangan membuat deployment GAS baru**. Alamat `/exec` setiap GAS harus tetap sama selama masa peralihan.
- **Jangan menulis ke spreadsheet** dari sistem baru.
- **Jangan mengubah rumus poin atau rupiah**, dan jangan "membetulkan" angka apa pun. Keputusan bisnis dan angka uang ada di tangan **Gabriel**.
- **Jangan menyalakan saklar** (§3), dan jangan mengganti `BACKEND_DRIVER` menjadi `supabase`, tanpa persetujuan Gabriel.
- **Kalau uji milik rumah lain gagal, jangan ubah angka harapannya.** Berhenti dan laporkan.
- **Jangan memindahkan, menghapus, atau menulis ulang kode orang lain seorang diri.**

---

## 6. Keadaan repo saat ini (27 Okt 2026)

Repo ini belum berbentuk tiga rumah. Isinya sekarang:
- Kode **MARProject** (Next.js) di `src/`, `db/`, `tests/`, dan `scripts/`. Awalnya dibuat untuk KMB V2, sekarang dipakai sebagai dasar kerja KMB Project.
- **`worker.js`**: hasil build untuk Worker `project-kmb` (lihat `wrangler.toml`), yang bekerja dengan GAS **KMB Project**.
- `src/lib/backendConfig.ts`: saklar global `BACKEND_DRIVER` dengan pilihan `appscript` atau `supabase`. Konstanta `APPSCRIPT_URL_KMB` di file itu sebenarnya menunjuk ke GAS **KMB Project**, bukan KMB V2.
- `src/lib/tenantRouter.ts`: memakai kode tenant `KMB`, `MAR`, dan `SUM`. Kode ini belum sama dengan kode rumah di §2.
- `docs/MULTI-TENANT-SETUP.md` dan `docs/SPEK-LAYAR/`: dokumen kerja dari Raka. Kalau ada yang bertentangan dengan file ini, **file ini yang berlaku** sampai diselaraskan.

Susunan yang dituju. Pemindahannya dilakukan bersama, tidak oleh satu orang:

```
workers/pintu/        bersama
workers/kmb/          Gabriel
workers/kmb-projek/   Raka
workers/sum/          Gabriel
pwa/kmb/  pwa/kmb-projek/  pwa/sum/     salinan PWA lama
db/kmb/   db/kmb_projek/   db/sum/       migrasi skema per rumah
tools/    docs/
```

Kode MARProject akan disimpan di cabang arsip sebelum `main` diubah ke susunan ini.
