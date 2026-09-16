import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MEMBUANG SISA .next SEBELUM MEMBANGUN — hanya di Windows, hanya di luar CI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dijalankan otomatis oleh `npm run build` lewat skrip `prebuild`.
 *
 * ── MASALAHNYA ──────────────────────────────────────────────────────────────
 * Proyek ini berada di dalam OneDrive, dan OneDrive mengubah setiap berkas jadi
 * REPARSE POINT (`Archive, ReparsePoint`). Reparse point bukan symlink, jadi
 * `fs.readlink` menjawab EINVAL — dan Node melempar:
 *
 *     [Error: EINVAL: invalid argument, readlink
 *      '...\.next\diagnostics\framework.json']
 *
 * Yang memicunya adalah sisa `.next` dari jalan SEBELUMNYA, terutama dari
 * `next dev`: berkas-berkas itu sudah sempat disinkronkan OneDrive. `.next`
 * yang bersih selalu berhasil dibangun — sudah diuji bolak-balik.
 *
 * ── KENAPA TIDAK "INGAT HAPUS .next DULU" ───────────────────────────────────
 * Karena itu tidak akan diingat. Galatnya muncul berbulan-bulan sekali, tidak
 * menyebut OneDrive sama sekali, dan menunjuk ke berkas di dalam .next yang tak
 * pernah ditulis siapa pun. Waktu yang hilang untuk menemukannya lagi jauh
 * lebih mahal daripada satu detik pembersihan di sini.
 *
 * ── `cache` SENGAJA DIPERTAHANKAN ───────────────────────────────────────────
 * `.next/cache` yang membuat pembangunan berikutnya cepat, dan ia bukan yang
 * dibaca `readlink`. Membuang seluruh `.next` akan memperbaiki bug yang sama
 * dengan harga yang tidak perlu dibayar.
 *
 * ── DAN TIDAK PERNAH DI VERCEL ──────────────────────────────────────────────
 * Vercel membangun di Linux, tempat masalah ini tidak ada, dan ia memulihkan
 * `.next/cache` sendiri antar-deploy. Menyentuhnya di sana hanya memperlambat
 * tanpa memperbaiki apa pun.
 */

const DI_CI = process.env['VERCEL'] === '1' || process.env['CI'] === 'true';

if (process.platform !== 'win32' || DI_CI) {
  process.exit(0);
}

const DIR = resolve(process.cwd(), '.next');

let isi;
try {
  isi = readdirSync(DIR);
} catch {
  process.exit(0);   // belum pernah dibangun — tidak ada yang perlu dibuang
}

let dibuang = 0;
for (const nama of isi) {
  if (nama === 'cache') continue;
  try {
    rmSync(resolve(DIR, nama), { recursive: true, force: true });
    dibuang++;
  } catch {
    /* Berkas yang sedang dipegang proses lain (dev server yang masih hidup).
       Bukan alasan menggagalkan pembangunan — kalau ia memang mengganggu,
       galat EINVAL-nya akan muncul dan sekarang sudah ada penjelasannya. */
  }
}

if (dibuang > 0) {
  console.log(`  (${dibuang} sisa .next dibuang — OneDrive, lihat scripts/bersihkan-next.mjs)`);
}
