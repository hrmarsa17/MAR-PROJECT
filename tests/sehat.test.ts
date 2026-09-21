import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db.js', () => ({
  sql: Object.assign(
    vi.fn(async () => [{ count: 1 }]),
    {
      begin: vi.fn(async (cb) => cb(vi.fn())),
      options: { host: 'localhost' },
    }
  ),
}));

vi.mock('../src/domain/kesehatan.js', () => ({
  ringkasanKesehatan: vi.fn(async () => ({ ok: true, basisData: 'terhubung', migrasi: 10 })),
}));

/**
 * ════════════════════════════════════════════════════════════════════════════
 * /api/sehat MENYEBUT KODE MANA YANG SEDANG TAYANG
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── KENAPA INI ADA ──────────────────────────────────────────────────────────
 * Pada 17 Sep 2026 orang kedua mulai mengerjakan repo ini. Ia mendorong dua
 * perubahan, lalu tidak punya satu pun cara memastikan keduanya benar-benar
 * terbit: keanggotaan Vercel berbayar, jadi dasbor Deployments tertutup
 * untuknya. Pertanyaannya — "sudah jalan belum di produksi?" — hanya bisa
 * dijawab orang lain yang membukakan layar.
 *
 * Lebih buruk lagi, dua perubahan itu berbeda sifat: yang satu mengubah
 * aplikasi, yang satu lagi hanya menambah skrip yang jalan di laptop. Tanpa
 * penanda, keduanya terlihat sama dari luar — "sudah ter-push" — padahal hanya
 * satu yang mengubah apa pun di layar.
 *
 * Satu baris di jawaban /api/sehat menutup seluruh celah itu, dan bisa dibaca
 * siapa saja tanpa akun Vercel.
 */

const ASLI = process.env['VERCEL_GIT_COMMIT_SHA'];

afterEach(() => {
  if (ASLI === undefined) delete process.env['VERCEL_GIT_COMMIT_SHA'];
  else process.env['VERCEL_GIT_COMMIT_SHA'] = ASLI;
});

/** Membaca ulang modulnya, karena `komit` dihitung saat GET dipanggil. */
async function tanya(): Promise<{ status: number; badan: Record<string, unknown> }> {
  const { GET } = await import('../src/app/api/sehat/route.js');
  const r = await GET();
  return { status: r.status, badan: (await r.json()) as Record<string, unknown> };
}

describe('jawaban sehat menyebut penerapan yang sedang tayang', () => {
  it('menyebut tujuh huruf pertama commit saat berjalan di Vercel', async () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = '0cecba8f1234567890abcdef1234567890abcdef';
    const { badan } = await tanya();
    expect(badan['komit']).toBe('0cecba8');
  });

  it('menyebut "lokal" saat dibuka di laptop, bukan hasil penerapan', async () => {
    delete process.env['VERCEL_GIT_COMMIT_SHA'];
    const { badan } = await tanya();
    expect(badan['komit']).toBe('lokal');
  });

  it('tidak membocorkan sidik commit utuh — hanya tujuh huruf', async () => {
    const utuh = '0cecba8f1234567890abcdef1234567890abcdef';
    process.env['VERCEL_GIT_COMMIT_SHA'] = utuh;
    const { badan } = await tanya();
    expect(String(badan['komit']).length).toBe(7);
    expect(JSON.stringify(badan)).not.toContain(utuh);
  });

  it('tetap tidak menyebut nama basis data, alamat, maupun versi Postgres', async () => {
    /* Alinea "YANG SENGAJA TIDAK DIBOCORKAN" di route.ts harus tetap berlaku.
       Titik ini terbuka untuk siapa pun yang bisa menjangkaunya. */
    const { badan } = await tanya();
    const kunci = Object.keys(badan).sort();
    expect(kunci).toEqual(['basisData', 'komit', 'migrasi', 'ok']);
    expect(badan['basisData']).toBe('terhubung');
  });
});
