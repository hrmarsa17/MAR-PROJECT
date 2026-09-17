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
 *
 * ── `--jauh`: basis data yang SUNGGUHAN DIPAKAI ORANG ────────────────────────
 * Beberapa perintah memang perlu diarahkan ke Supabase dari laptop — membaca
 * token sendiri saat lupa (`npm run orang`), memeriksa keadaan (`npm run
 * periksa`), mencadangkan. Sampai 17 Sep 2026 caranya adalah menempelkan
 * alamat lengkap ke baris perintah:
 *
 *     $env:DATABASE_URL='postgresql://...:SANDI@...supabase.com:6543/postgres'
 *
 * Dan setiap kali itu dilakukan, PowerShell menuliskannya ke
 * `ConsoleHost_history.txt` — berkas teks biasa yang tidak pernah kedaluwarsa.
 * Pada hari ini berkas itu sudah memuat sebelas baris berisi sandi produksi
 * terbaca. Bukan satu pun karena kecerobohan; itu memang satu-satunya cara yang
 * tersedia.
 *
 * `--jauh` membaca `.env.jauh` (tidak ikut git). Sandinya ditulis SEKALI lewat
 * penyunting teks, tidak pernah lewat baris perintah, jadi riwayat berhenti
 * bertambah.
 *
 * Ini TIDAK melemahkan penjaga mana pun: penjaga memeriksa isi DATABASE_URL,
 * bukan dari mana ia datang. `buat-token.ts --jauh` tetap ditolak — ia masih
 * menuntut `--izinkan-luar` juga. Dua bendera tegas untuk satu perbuatan berat.
 *
 * Nama `.env.produksi` sengaja TIDAK dipakai: itu sudah milik penerapan Docker
 * mandiri (POSTGRES_PASSWORD, DOMAIN, EMAIL_TLS) di docs/PENERAPAN.md, hal yang
 * sama sekali berbeda.
 */
function bacaKe(berkas: string): boolean {
  if (!existsSync(berkas)) return false;
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
  return true;
}

export function muatEnv(): void {
  if (process.argv.includes('--jauh')) {
    const jauh = resolve(process.cwd(), '.env.jauh');
    if (!bacaKe(jauh)) {
      console.error(
        '\n❌ --jauh diminta, tapi `.env.jauh` tidak ada.\n\n'
        + '   Buat sekali saja, lewat penyunting teks — JANGAN lewat baris\n'
        + '   perintah, karena PowerShell menyimpan riwayatnya selamanya:\n\n'
        + '       copy .env.jauh.example .env.jauh\n'
        + '       notepad .env.jauh\n\n'
        + '   Isi DATABASE_URL-nya dari Vercel → Settings → Environment\n'
        + '   Variables → DATABASE_URL (klik ikon mata, lalu salin).\n\n'
        + '   Berkasnya tidak ikut git (.gitignore: .env.*).\n',
      );
      process.exit(1);
    }
    /* .env tetap dibaca sesudahnya, untuk kunci yang tidak ada di .env.jauh.
       Yang sudah terisi tidak ditimpa, jadi .env.jauh tetap menang. */
  }
  bacaKe(resolve(process.cwd(), '.env'));
}

muatEnv();
