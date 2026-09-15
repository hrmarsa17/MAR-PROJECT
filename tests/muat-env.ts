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
