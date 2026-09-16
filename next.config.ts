import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  /**
   * Keluaran MANDIRI: Next menyalin hanya modul yang benar-benar dipakai ke
   * `.next/standalone`, lengkap dengan server kecilnya sendiri.
   *
   * Tanpa ini, image Docker harus membawa seluruh `node_modules` — ratusan
   * megabyte yang sebagian besar hanya dipakai saat MEMBANGUN, bukan saat
   * melayani. Di jaringan site, ukuran image adalah selisih antara penerapan
   * yang selesai dan yang putus di tengah jalan.
   */
  output: 'standalone',
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
