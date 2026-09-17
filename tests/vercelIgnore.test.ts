import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * KALAU TIDAK TAHU, BANGUN — JANGAN LEWATI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `ignoreCommand` di vercel.json memutuskan apakah sebuah penerapan dibangun.
 * Vercel membalik arti kode keluarnya: **1 = bangun, 0 = lewati.**
 *
 * ── KEJADIAN 17 Sep 2026 ────────────────────────────────────────────────────
 * Bunyinya semula:
 *
 *     [ "$VERCEL_ENV" = production ] && exit 1 || exit 0
 *
 * Maksudnya "bangun kalau produksi, selain itu lewati". Yang tidak terpikir:
 * kalau `VERCEL_ENV` TIDAK TERSEDIA saat langkah ignore berjalan, nilainya
 * kosong — bukan `production` — sehingga SETIAP penerapan dilewati, produksi
 * termasuk.
 *
 * Akibatnya empat jam produksi berhenti menerima perubahan apa pun tanpa satu
 * pun tanda: tidak ada build merah, tidak ada galat, tidak ada pemberitahuan.
 * Yang terlihat cuma "sudah saya push kok" dari satu sisi dan "masih warna
 * lama" dari sisi lain. Ketahuan hanya karena seseorang mengubah warna tombol
 * dan menunggu terlalu lama.
 *
 * Sekarang arah gagalnya dibalik:
 *
 *     [ "$VERCEL_ENV" = preview ] && exit 0 || exit 1
 *
 * Melewati HANYA kalau yakin ini pratinjau. Ragu sedikit pun → bangun. Build
 * pratinjau yang tidak perlu cuma memboroskan dua menit; penerapan produksi
 * yang dilewati diam-diam menghentikan seluruh pekerjaan dua orang.
 */

const vercel = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'vercel.json'), 'utf8'),
) as { ignoreCommand?: string };

describe('ignoreCommand tidak pernah melewati penerapan karena ragu', () => {
  const perintah = vercel.ignoreCommand;

  it('ada dan berbentuk perintah shell', () => {
    expect(typeof perintah).toBe('string');
  });

  it('cabang terakhirnya MEMBANGUN, bukan melewati', () => {
    /* Cabang `||` adalah yang dipakai saat pemeriksaannya tidak cocok — termasuk
       saat variabelnya kosong karena tidak tersedia. Ia WAJIB `exit 1`. */
    expect(perintah).toMatch(/\|\|\s*exit 1\s*$/);
  });

  it('hanya melewati saat yakin ini pratinjau', () => {
    /* `exit 0` (lewati) boleh muncul hanya di cabang yang memeriksa `preview`.
       Memeriksa `production` lalu melewati di cabang lain adalah bentuk yang
       meledak pada 17 Sep 2026. */
    expect(perintah).toContain('preview');
    expect(perintah).not.toContain('production');
  });

  it('tidak melewati apa pun selain pratinjau', () => {
    const lewati = (perintah!.match(/exit 0/g) ?? []).length;
    expect(lewati).toBe(1);
  });
});
