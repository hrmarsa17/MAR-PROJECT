import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  /**
   * Keluaran MANDIRI — hanya untuk penerapan sendiri (Docker), BUKAN Vercel.
   *
   * Tanpa ini, image Docker harus membawa seluruh `node_modules`: ratusan
   * megabyte yang sebagian besar hanya dipakai saat MEMBANGUN, bukan saat
   * melayani.
   *
   * Di Vercel ia justru tidak diinginkan — Vercel punya cara mengemasnya
   * sendiri, dan `standalone` menghasilkan keluaran kedua yang tidak ia pakai.
   * Vercel menyetel VERCEL=1 di lingkungan build-nya, jadi pembedaannya tidak
   * perlu diingat siapa pun.
   *
   * ── DAN TIDAK PERNAH SAAT `next dev` ──────────────────────────────────────
   * `standalone` menjalankan penelusuran berkas, yang memanggil `readlink` ke
   * seluruh pohon proyek. Proyek ini berada di dalam OneDrive, dan tiap berkas
   * di sana adalah REPARSE POINT (`Archive, ReparsePoint`) — bukan symlink,
   * jadi `readlink` menjawab EINVAL. Node melemparnya, dan dev server MATI di
   * tengah sesi:
   *
   *     [Error: EINVAL: invalid argument, readlink '…\.next\prerender-manifest.json']
   *
   * Yang terlihat dari luar bukan sebuah crash, melainkan setiap rute tiba-tiba
   * menjawab 500 — termasuk rute yang semenit lalu masih baik. Itu sudah dua
   * kali dikira basis data yang rusak.
   *
   * Menyematkan berkasnya ("always keep on this device", `attrib +P`) TIDAK
   * menolong: reparse point-nya tetap ada, sudah diuji. Yang menolong adalah
   * tidak meminta penelusuran itu sama sekali saat pengembangan — dan memang
   * tidak ada yang membutuhkannya di sana. `standalone` urusan MEMBANGUN, dan
   * `npm run build` tetap menghasilkannya seperti biasa.
   */
  ...(process.env['VERCEL'] || process.env['NODE_ENV'] === 'development'
    ? {}
    : { output: 'standalone' as const }),
  // Ada package-lock.json lain di C:\Users\gabri, dan Next memilihnya sebagai
  // akar ruang kerja. Ditunjuk eksplisit supaya tidak salah tebak.
  outputFileTracingRoot: import.meta.dirname,
  // Modul domain diimpor dengan akhiran .js (gaya ESM Node) supaya berkas yang
  // sama bisa dijalankan Vitest tanpa bundler. Webpack perlu diberi tahu bahwa
  // .js pada sumber TypeScript berarti .ts.
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
