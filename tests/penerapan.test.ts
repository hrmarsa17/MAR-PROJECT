import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from '../src/lib/db.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RIWAYAT PENERAPAN MEMBEDAKAN "SUDAH DI-PUSH" DARI "SUDAH TAYANG"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * GitHub menyimpan riwayat commit, tapi commit yang ada di GitHub belum tentu
 * melayani siapa pun: ia bisa masih dibangun, gagal dibangun, atau di-rollback
 * sebelum satu permintaan pun sampai. Yang menjawab "sudah masuk produksi?"
 * hanya baris di tabel `deployments` — dan baris itu hanya lahir dari
 * permintaan yang sungguhan dilayani.
 */

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const ASLI = { ...process.env };

async function modul() {
  vi.resetModules(); /* `sudahDicoba` hidup di lingkup modul */
  return import('../src/domain/penerapan.js');
}

async function jumlahBaris(komit: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(commit_sha)::int AS n FROM deployments WHERE commit_sha = ${komit}`;
  return r!.n;
}

beforeEach(() => {
  delete process.env['VERCEL_GIT_COMMIT_SHA'];
  delete process.env['VERCEL_GIT_COMMIT_MESSAGE'];
  delete process.env['VERCEL_GIT_COMMIT_AUTHOR_NAME'];
  delete process.env['VERCEL_GIT_COMMIT_REF'];
});

afterEach(async () => {
  process.env['VERCEL_GIT_COMMIT_SHA'] = ASLI['VERCEL_GIT_COMMIT_SHA'] ?? '';
  if (!ASLI['VERCEL_GIT_COMMIT_SHA']) delete process.env['VERCEL_GIT_COMMIT_SHA'];
  await sql`DELETE FROM deployments WHERE commit_sha = ${SHA.slice(0, 7)}`;
});

describe('penerapan hanya tercatat kalau benar-benar tayang', () => {
  it('yang dijalankan di laptop tidak pernah masuk riwayat', async () => {
    /* Kalau laptop ikut tercatat, riwayatnya berisi commit yang tak seorang pun
       di lapangan pernah lihat — dan jawaban "sudah tayang" jadi bohong. */
    const { catatPenerapan, komitSekarang } = await modul();
    expect(komitSekarang()).toBe('lokal');
    await catatPenerapan();
    expect(await jumlahBaris('lokal')).toBe(0);
  });

  it('penerapan di Vercel tercatat beserta siapa penulisnya', async () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = SHA;
    process.env['VERCEL_GIT_COMMIT_MESSAGE'] = 'fix(antrean): tombol kembali';
    process.env['VERCEL_GIT_COMMIT_AUTHOR_NAME'] = 'Aurakha';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'master';

    const { catatPenerapan, riwayatPenerapan } = await modul();
    await catatPenerapan();

    const baris = (await riwayatPenerapan()).find((d) => d.commit_sha === SHA.slice(0, 7));
    expect(baris).toBeDefined();
    expect(baris!.penulis).toBe('Aurakha');
    expect(baris!.pesan).toBe('fix(antrean): tombol kembali');
    expect(baris!.cabang).toBe('master');
  });

  it('penerapan yang sama tidak pernah tercatat dua kali', async () => {
    /* Tiap instans serverless memanggilnya sendiri-sendiri, dan pada satu
       penerapan bisa ada banyak instans hidup bersamaan. */
    process.env['VERCEL_GIT_COMMIT_SHA'] = SHA;

    const a = await modul();
    await a.catatPenerapan();
    const b = await modul(); /* seolah instans kedua, penanda modulnya bersih */
    await b.catatPenerapan();

    expect(await jumlahBaris(SHA.slice(0, 7))).toBe(1);
  });

  it('judul commit berbaris banyak hanya diambil baris pertamanya', async () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = SHA;
    process.env['VERCEL_GIT_COMMIT_MESSAGE'] = 'judul singkat\n\nbadan panjang\nbaris lain';

    const { catatPenerapan, riwayatPenerapan } = await modul();
    await catatPenerapan();

    const baris = (await riwayatPenerapan()).find((d) => d.commit_sha === SHA.slice(0, 7));
    expect(baris!.pesan).toBe('judul singkat');
  });
});

describe('catatan penerapan tidak pernah menggagalkan permintaan', () => {
  it('/api/sehat tetap menjawab sehat meski pencatatan melempar', async () => {
    /* ── KENAPA UJI INI ADA ────────────────────────────────────────────────
       `catatPenerapan()` dipanggil DI LUAR blok try di route.ts, jadi kalau ia
       melempar, seluruh titik periksa kesehatan ikut merah — dan pemeriksa
       hulu akan menyatakan aplikasi mati lalu memulainya ulang, karena sebuah
       catatan gagal ditulis.

       Hari ini ia tidak melempar karena menelan galatnya sendiri. Uji ini
       memastikan keselamatan itu tidak BERGANTUNG pada penelan tersebut:
       route.ts memasang `.catch()` sendiri. Dua lapis, karena yang satu bisa
       dilepas orang lain tanpa sadar akibatnya. */
    vi.resetModules();
    vi.doMock('../src/domain/penerapan.js', async (asli) => ({
      ...(await asli<typeof import('../src/domain/penerapan.js')>()),
      catatPenerapan: async () => { throw new Error('basis data tidak bisa ditulis'); },
    }));

    const { GET } = await import('../src/app/api/sehat/route.js');
    const r = await GET();
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);

    vi.doUnmock('../src/domain/penerapan.js');
    vi.resetModules();
  });
});
