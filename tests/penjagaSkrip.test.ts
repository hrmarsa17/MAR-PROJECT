import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIDAK ADA SKRIP YANG BISA MENGUBAH DATA ORANG SUNGGUHAN TANPA DIMINTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Skrip di `scripts/` dijalankan dengan basis data mana pun yang kebetulan
 * ditunjuk `DATABASE_URL` saat itu. Variabel itu berpindah-pindah sepanjang
 * hari: dipasang ke produksi untuk `npm run periksa`, lalu dilepas — dan kalau
 * lupa dilepas, perintah berikutnya mengenai produksi tanpa memberi tanda.
 *
 * ── KENAPA UJI INI ADA ──────────────────────────────────────────────────────
 * Pada 17 Sep 2026 Gabriel berkata: "token jangan berubah-ubah terus tiap kita
 * ngoding, karena ini sangat berbahaya apabila nanti sudah dipakai produksi."
 *
 * Audit atas kalimat itu menemukan `scripts/buat-token.ts` — `npm run token`,
 * nama sependek dan senyaman itu — berjalan pada basis data MANA PUN tanpa
 * penjaga. Ia mencabut token seorang mekanik lalu menerbitkan yang baru dengan
 * `UPDATE`/`INSERT` langsung, bukan lewat `terbitkanToken()`. Artinya juga
 * TANPA baris di `audit_logs`: HP seseorang berhenti bisa masuk di tengah
 * shift, dan tidak ada satu pun cara mengetahui siapa yang melakukannya.
 *
 * Dua puluh satu skrip lain sudah terkunci di porta 5433. Yang satu ini
 * terlewat — dan justru ia yang paling mudah diketik karena kebiasaan.
 *
 * Uji ini menjaga yang ke-23 dan seterusnya. Menambah skrip penulis tanpa
 * penjaga akan MEMERAHKAN uji, bukan menunggu sampai ada yang tidak bisa
 * masuk kerja.
 */

const SKRIP = resolve(__dirname, '..', 'scripts');

/** Tulisan yang mengubah keadaan orang sungguhan, bukan sekadar membaca. */
const MENULIS = /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\b|ALTER\s+TABLE|DROP\s+TABLE)/i;

/** Penjaga yang sah: kunci porta dev, atau pengakuan sadar bahwa ini bukan dev. */
const PENJAGA = /:5433|izinkan-luar|TRANSACTION READ ONLY/;

const berkas = readdirSync(SKRIP)
  .filter((n) => n.endsWith('.ts'))
  .map((n) => ({ nama: n, isi: readFileSync(join(SKRIP, n), 'utf8') }));

describe('skrip yang bisa menulis ke basis data selalu berpenjaga', () => {
  it('menemukan skrip untuk diperiksa (uji ini tidak boleh hijau karena kosong)', () => {
    expect(berkas.length).toBeGreaterThan(20);
    expect(berkas.filter((b) => MENULIS.test(b.isi)).length).toBeGreaterThan(20);
  });

  for (const b of berkas.filter((x) => MENULIS.test(x.isi))) {
    it(`${b.nama} menolak basis data selain pengembangan`, () => {
      expect(PENJAGA.test(b.isi), `${b.nama} menulis ke basis data tanpa memeriksa `
        + 'DATABASE_URL. Dijalankan saat DATABASE_URL masih menunjuk produksi, ia '
        + 'akan mengubah data orang sungguhan tanpa memberi tanda. Tambahkan '
        + 'penjaga :5433 dengan jalan keluar --izinkan-luar.').toBe(true);
    });
  }
});

describe('semua skrip memakai pemuat .env yang sama', () => {
  /* ── KENAPA INI DIUJI ──────────────────────────────────────────────────────
     `--jauh` (di scripts/muat-env.ts) mengarahkan skrip ke basis data hidup
     tanpa menempelkan sandi ke baris perintah. Ia bekerja HANYA bila skripnya
     memakai pemuat bersama itu.

     Pada 17 Sep 2026 `buat-token.ts` masih menyalin pemuat .env-nya sendiri —
     sisa dari sebelum muat-env.ts ada. `--jauh` diterima tanpa keluhan di sana
     dan tidak mengubah apa pun: benderanya TAMPAK bekerja. Kalau penjaga :5433
     tidak lebih dulu dipasang hari itu juga, perintahnya akan mengenai basis
     data dev sementara yang mengetik mengira sedang mengurus produksi.

     Itu bentuk kegagalan yang sama dengan empat bug sebelumnya di proyek ini:
     ditulis, tidak pernah dipanggil, tidak pernah bersuara. */
  const pakaiDb = berkas.filter((b) => /DATABASE_URL|db\.js/.test(b.isi) && b.nama !== 'muat-env.ts');

  it('ada skrip yang menyentuh basis data untuk diperiksa', () => {
    expect(pakaiDb.length).toBeGreaterThan(30);
  });

  for (const b of pakaiDb) {
    it(`${b.nama} memuat .env lewat muat-env.js, bukan salinan sendiri`, () => {
      expect(/muat-env/.test(b.isi), `${b.nama} tidak mengimpor './muat-env.js'. `
        + 'Bendera --jauh tidak akan berpengaruh di sini, dan ia akan diam saja '
        + 'alih-alih mengeluh — skrip berjalan pada basis data yang BUKAN dimaksud '
        + 'oleh yang mengetiknya.').toBe(true);
    });
  }
});

describe('mengganti token orang selalu meninggalkan jejak', () => {
  /* Satu-satunya jalan yang boleh dipakai di produksi adalah lewat
     `terbitkanToken()` di src/domain/admin.ts, yang berjalan di dalam
     `jalankanPerintah({ action: 'admin_token' })` sehingga tercatat siapa
     penekannya. Skrip menulis langsung ke tabel dan tidak tercatat — karena
     itu ia harus tetap terkurung di dev. */
  const penulisToken = berkas.filter((b) => /\b(INSERT\s+INTO|UPDATE)\s+api_tokens/i.test(b.isi));

  it('ada skrip penulis token yang diperiksa', () => {
    expect(penulisToken.length).toBeGreaterThan(0);
  });

  for (const b of penulisToken) {
    it(`${b.nama} tidak bisa menyentuh token produksi tanpa disengaja`, () => {
      expect(/:5433/.test(b.isi), `${b.nama} menulis ke api_tokens tanpa kunci porta `
        + '5433. Skrip tidak menulis audit_logs, jadi token yang berubah lewat sini '
        + 'tidak bisa ditelusuri siapa yang mengubahnya.').toBe(true);
    });
  }
});
