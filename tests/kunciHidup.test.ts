import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIDAK ADA KUNCI SIMPANAN YANG MATI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tiap kunci `kv` harus punya yang MENULIS dan yang MEMBACA. Kunci yang hanya
 * dibaca adalah fitur yang mati diam-diam; kunci yang hanya ditulis adalah
 * ruang yang terbuang di HP orang.
 *
 * ── KENAPA UJI BERBENTUK ANEH INI ADA ───────────────────────────────────────
 * Pada 17 Sep 2026 `kv.aku` dibaca `public/sw.js:177` dan TIDAK PERNAH ditulis
 * siapa pun. Akibatnya `periksaPerubahan()` berhenti di baris pertamanya —
 * `if (!aku) return 0;` — dan seluruh jalur notifikasi mati untuk semua orang.
 *
 * Tidak ada galat di mana pun, dan tidak akan pernah ada: daftar kosong adalah
 * keadaan yang sah, dan diam adalah keadaan yang sah bagi notifikasi. Tidak ada
 * uji perilaku yang bisa menangkapnya tanpa menjalankan notifikasi sungguhan di
 * peramban sungguhan.
 *
 * Itu bug KETIGA dengan bentuk yang sama pada hari yang sama — ditulis, tidak
 * pernah dipanggil, gagal tanpa bersuara. Dua lainnya: service worker membaca
 * `j.data.kartu` pada sebuah array, dan tujuh belas skrip uji menyasar porta
 * yang tidak ada isinya. Ketiganya lolos karena "tidak ada galat" dibaca
 * sebagai "berhasil".
 */

const AKAR = resolve(__dirname, '..');

function berkasSumber(dir: string, out: string[] = []): string[] {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '.next' || nama === '.git') continue;
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) berkasSumber(p, out);
    else if (/\.(ts|tsx|js)$/.test(nama) && !/\.test\.tsx?$/.test(nama)) out.push(p);
  }
  return out;
}

const SUMBER = [
  ...berkasSumber(join(AKAR, 'src')),
  ...berkasSumber(join(AKAR, 'public')),
].map((p) => readFileSync(p, 'utf8')).join('\n');

/** Kunci yang tercantum di tipe `KunciKv`. */
function kunciDariTipe(): string[] {
  const isi = readFileSync(join(AKAR, 'src/pwa/simpanan.ts'), 'utf8');
  const blok = /export type KunciKv =([\s\S]*?);/.exec(isi)?.[1] ?? '';
  return [...blok.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe('kunci simpanan luring', () => {
  const kunci = kunciDariTipe();

  it('tipenya tidak kosong — kalau ini gagal, pembacanya yang rusak', () => {
    expect(kunci.length).toBeGreaterThan(0);
  });

  it.each(kunciDariTipe())('"%s" ADA yang menulisnya', (k) => {
    /* Dua bentuk penulisan yang dipakai proyek ini: `simpanKv('x', …)` dari
       halaman, dan `s.put(…, 'x')` dari service worker yang memakai IndexedDB
       mentah karena tidak bisa mengimpor modul TypeScript. */
    const lewatHelper = new RegExp(`simpanKv\\(\\s*'${k}'`).test(SUMBER);
    const lewatIdbMentah = new RegExp(`put\\([^)]*,\\s*'${k}'\\s*\\)`).test(SUMBER);
    expect(lewatHelper || lewatIdbMentah).toBe(true);
  });

  it.each(kunciDariTipe())('"%s" ADA yang membacanya', (k) => {
    const lewatHelper = new RegExp(`bacaKv<[^>]*>\\(\\s*'${k}'`).test(SUMBER);
    const lewatIdbMentah = new RegExp(`get\\(\\s*'${k}'\\s*\\)`).test(SUMBER);
    expect(lewatHelper || lewatIdbMentah).toBe(true);
  });
});
