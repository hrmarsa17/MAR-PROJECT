import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pembaca .env seadanya — cukup untuk kebutuhan kita, tanpa menambah
 * ketergantungan. Nilai yang sudah ada di lingkungan TIDAK ditimpa, supaya
 * `DATABASE_URL=... npm test` tetap menang atas berkas.
 */
const berkas = resolve(process.cwd(), '.env');
if (existsSync(berkas)) {
  for (const baris of readFileSync(berkas, 'utf8').split('\n')) {
    const bersih = baris.trim();
    if (!bersih || bersih.startsWith('#')) continue;
    const pisah = bersih.indexOf('=');
    if (pisah < 0) continue;
    const kunci = bersih.slice(0, pisah).trim();
    const nilai = bersih.slice(pisah + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[kunci] === undefined) process.env[kunci] = nilai;
  }
}

/**
 * PAGAR BASIS DATA — dipasang 16 Sep 2026, sesudah kejadian.
 *
 * Uji integrasi memanggil `bersihkanTransaksi()`, yang menjalankan
 * `TRUNCATE work_orders ... CASCADE`. Setiap skrip uji lain di repo ini punya
 * pagar `:5433`; justru satu-satunya tempat yang MENGHAPUS tidak punya. Salah
 * satu isi DATABASE_URL, dan `npm test` mengosongkan basis data yang keliru
 * tanpa satu pun pertanyaan.
 *
 * Diperiksa di sini, sebelum modul mana pun sempat dimuat.
 */
const alamat = process.env['DATABASE_URL'] ?? '';
if (!/:5433\//.test(alamat)) {
  throw new Error(
    'DITOLAK: uji integrasi menjalankan TRUNCATE. DATABASE_URL harus menunjuk '
    + 'basis data pengembangan di port 5433, bukan '
    + (alamat ? alamat.replace(/:\/\/[^@]*@/, '://***@') : '(kosong)'),
  );
}
