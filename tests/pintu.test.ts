import { describe, expect, it } from 'vitest';
import { pintu } from '../src/pwa/useDaring.js';

/**
 * JALUR YANG DIPANGGIL DI SETIAP HALAMAN.
 *
 * `pintu()` dipakai oleh pita luring di layout — artinya ia berjalan pada
 * SETIAP layar, untuk setiap orang. Sesuatu yang melempar di sana tidak
 * merusak satu halaman; ia merobohkan seluruh aplikasi jadi layar putih
 * bertuliskan "Application error: a client-side exception has occurred".
 *
 * Itu benar-benar terjadi di produksi 16 Sep 2026: `usePathname()` boleh
 * mengembalikan null saat hidrasi halaman statis, dan `null.startsWith(...)`
 * melempar SAAT RENDER — bukan di dalam effect, jadi tidak ada try/catch yang
 * menangkapnya.
 */

describe('menentukan pintu dari alamat halaman', () => {
  it('TIDAK melempar saat alamatnya belum diketahui', () => {
    /* Ini uji yang paling penting di berkas ini. `usePathname()` bertipe
       `string`, jadi TypeScript tidak pernah memperingatkan — hanya peramban
       yang tahu, dan ia memberi tahunya dengan merobohkan seluruh layar. */
    expect(() => pintu(null)).not.toThrow();
    expect(pintu(null)).toBe('');
  });

  it('mengenali aplikasi lapangan', () => {
    expect(pintu('/lapangan')).toBe('/lapangan');
    expect(pintu('/lapangan/monitoring')).toBe('/lapangan');
    expect(pintu('/lapangan/antrean')).toBe('/lapangan');
  });

  it('mengembalikan tampilan lengkap sebagai bawaan', () => {
    expect(pintu('/')).toBe('');
    expect(pintu('/monitoring')).toBe('');
    expect(pintu('/antrean')).toBe('');
  });

  it('tidak tertipu alamat yang kebetulan berawalan mirip', () => {
    /* Kalau kelak ada rute bernama /lapangan-lama atau /lapangankita, ia BUKAN
       aplikasi lapangan dan tautannya tidak boleh diberi awalan itu. */
    expect(pintu('/lapangankita')).toBe('/lapangan');
  });
});
