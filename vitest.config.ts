import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Memuat .env SEBELUM modul apa pun diimpor — src/lib/db.ts membaca
    // DATABASE_URL saat modul dimuat, jadi urutannya menentukan.
    setupFiles: ['tests/muat-env.ts'],
    // Uji integrasi berbagi satu database. Menjalankannya bersamaan akan
    // membuat yang satu menghapus data yang sedang dipakai yang lain.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
