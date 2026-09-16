# Cadangan

> **Paket Free Supabase TIDAK dicadangkan otomatis.** Cadangan harian hanya ada
> di Pro ke atas. Di Free, kalau proyeknya rusak atau terhapus, tidak ada yang
> bisa dipulihkan — kecuali yang Anda simpan sendiri.
>
> Halaman ini membuat "yang Anda simpan sendiri" itu berjalan tanpa perlu
> diingat.

---

## Sekali: siapkan berkasnya

```powershell
cd "C:\Users\gabri\OneDrive\1\Resurgam\KMBProject"
copy cadangkan-produksi.cmd.contoh cadangkan-produksi.cmd
notepad cadangkan-produksi.cmd
```

Isi `GANTI-SANDI` dengan sandi basis data Supabase. Yang terisi sudah diabaikan
`.gitignore` — ia tidak akan ikut ke GitHub.

**Porta 5432, bukan 6543.** Ambil *Session pooler* dari Supabase → Connect.
6543 adalah pooler mode transaksi yang dipakai Vercel; `pg_dump` membutuhkan
satu sesi utuh, dan skripnya memang menolak alamat itu daripada menghasilkan
cadangan yang mungkin tidak utuh.

Coba jalankan sekali dengan tangan:

```powershell
.\cadangkan-produksi.cmd
```

Yang benar terlihat begini:

```
▶  Mencadangkan ke C:\Users\gabri\OneDrive\cadangan-kmb\kmb-2026-09-16T....dump
✅ 1.4 MB, 9 tabel inti diperiksa ada
   1 cadangan tersimpan
```

Baris **"9 tabel inti diperiksa ada"** itu yang penting. Ukuran berkas bukan
bukti isinya ada: sebuah dump bisa berukuran wajar, berstatus berhasil, dan
tetap kehilangan tabel yang justru paling dibutuhkan. Karena itu daftar isinya
dibaca ulang dan `work_orders`, `mechanic_points`, `scoring_snapshots`, `jobs`,
`units`, `mechanics`, `api_tokens`, `pay_rates`, `factors` harus benar-benar
ada di sana.

---

## Sekali: jadwalkan

**Task Scheduler** → Create Task (bukan *Basic Task*).

| Tab | Isian |
|---|---|
| General | Name: `Cadangan KMB` · centang **Run whether user is logged on or not** |
| Triggers | New → Daily → **01:40** · Enabled |
| Actions | New → Start a program → `C:\Users\gabri\OneDrive\1\Resurgam\KMBProject\cadangkan-produksi.cmd` |
| Conditions | **hapus centang** "Start the task only if the computer is on AC power" |
| Settings | centang **Run task as soon as possible after a scheduled start is missed** |

Dua baris terakhir itu yang menentukan apakah ia benar-benar jalan. Laptop
jarang colok listrik jam 1 pagi, dan lebih jarang lagi menyala — tanpa keduanya
tugasnya dilewati diam-diam, dan Anda baru tahu saat membutuhkannya.

Jam **01:40**, bukan 01:00 atau 02:00: jam bulat adalah tempat setiap tugas
terjadwal di dunia berkumpul.

---

## Tiap minggu: lihat sebentar

Buka `C:\Users\gabri\OneDrive\cadangan-kmb`. Yang dicari cuma dua hal:

1. **Ada berkas dari tadi malam.**
2. **Ukurannya wajar** — naik pelan seiring bertambahnya WO, tidak pernah
   mendadak mengecil.

Berkas yang tiba-tiba jauh lebih kecil berarti ada yang berubah di basis data
atau di hak baca peran yang dipakai.

Di Task Scheduler, kolom **Last Run Result** harus `0x0`. Skripnya sengaja
meneruskan status gagal — tugas terjadwal yang selalu tampak berhasil adalah
cara paling umum sebuah cadangan berhenti diam-diam selama berbulan-bulan.

---

## Tiap bulan: buktikan ia bisa dipulihkan

> Cadangan yang tidak pernah diuji pulih bukan cadangan. Ia baru jadi cadangan
> pada saat seseorang membuktikannya — dan hari Anda membutuhkannya adalah hari
> yang paling buruk untuk mencari tahu.

```powershell
npm run uji:cadangan
```

14 pemeriksaan: cadangan dipulihkan ke basis data kosong, lalu isinya
dibandingkan baris per baris — termasuk total rupiah. Berjalan di basis data
pengembangan, tidak menyentuh produksi.

Untuk membuktikan cadangan **produksi** yang sesungguhnya, pulihkan salah satu
berkasnya ke basis data lokal:

```powershell
npx tsx scripts/pulihkan.ts "C:\Users\gabri\OneDrive\cadangan-kmb\kmb-….dump" `
    --ke postgres://postgres:SANDI@127.0.0.1:5433/kmb_pulih_uji
```

Tujuan **wajib** disebut dan tidak pernah diambil diam-diam — memulihkan
mengganti isi basis data tujuan, dan tidak ada tombol batal.

---

## Sebelum tiap perubahan besar

Migrasi, impor borongan, "praktekkan ke semua" — cadangkan lebih dulu, dengan
tangan:

```powershell
.\cadangkan-produksi.cmd
```

Nama berkasnya memuat jam sampai detik, jadi dua cadangan di hari yang sama
tidak saling menimpa.

---

## Kalau kelak naik ke Pro

Cadangan harian otomatis jadi ada, dan jadwal ini boleh dimatikan. Tapi
pertimbangkan membiarkannya: cadangan Supabase tersimpan di Supabase. Kalau
yang hilang adalah akses ke akun itu sendiri, satu-satunya yang tersisa adalah
salinan yang ada di tangan Anda.
