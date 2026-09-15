import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Memuat `.env` ke process.env.
 *
 * WAJIB diimpor SEBELUM `src/lib/db.ts`, karena db.ts membaca DATABASE_URL saat
 * modul dimuat. Pola pemakaiannya:
 *
 *     import './muat-env.js';
 *     const { sql } = await import('../src/lib/db.js');
 *
 * Next.js memuat .env sendiri dan vitest lewat tests/muat-env.ts; yang tidak
 * punya pemuat adalah skrip `npx tsx`. Sebelum berkas ini ada, pemuatnya
 * disalin inline di tiap skrip — dan skrip yang lupa menyalinnya akan jatuh ke
 * nilai bawaan db.ts, yaitu basis data yang SALAH.
 *
 * Nilai yang SUDAH ada di process.env tidak ditimpa: itu yang membuat
 * `DATABASE_URL=... npx tsx skrip.ts` tetap bisa dipakai untuk menunjuk basis
 * data lain tanpa menyunting berkas.
 */
export function muatEnv(): void {
  const berkas = resolve(process.cwd(), '.env');
  if (!existsSync(berkas)) return;
  for (const baris of readFileSync(berkas, 'utf8').split('\n')) {
    const b = baris.trim();
    if (!b || b.startsWith('#')) continue;
    const i = b.indexOf('=');
    if (i < 0) continue;
    const k = b.slice(0, i).trim();
    if (process.env[k] === undefined) {
      process.env[k] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

muatEnv();
