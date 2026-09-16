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
   */
  ...(process.env['VERCEL'] ? {} : { output: 'standalone' as const }),
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
