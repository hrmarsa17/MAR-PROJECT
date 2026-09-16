import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  antrean, bacaItem, hapusItem, lupakanKoneksi, pangkasYangSelesai,
  semuaItem, tulisOutbox, umurAntreanHari,
} from '../src/pwa/simpanan.js';
import { kirimPerintah, kosongkanAntrean } from '../src/pwa/kirim.js';

/**
 * ANTREAN LURING — yang diuji di sini adalah jam kerja orang.
 *
 * Satu-satunya data di aplikasi ini yang tidak punya salinan di tempat lain
 * adalah antrean: pekerjaan yang sudah dilakukan tapi belum sampai ke server.
 * Kalau ia hilang, tidak ada cadangan, tidak ada log, dan tidak ada satu pun
 * cara mengetahui bahwa ia pernah ada — yang tersisa cuma mekanik yang bersumpah
 * ia sudah mengirim.
 *
 * Nama uji di bawah menyebut PERILAKU, bukan nama fungsi: yang harus tetap
 * benar adalah janjinya kepada orang lapangan, bukan bentuk kodenya hari ini.
 */

function jawabanServer(isi: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => isi,
  } as unknown as Response;
}

let daring = true;

beforeEach(() => {
  // Basis data baru tiap uji — kalau tidak, antrean uji sebelumnya ikut terbawa
  // dan yang gagal bukan yang sedang diuji.
  globalThis.indexedDB = new IDBFactory();
  lupakanKoneksi();
  daring = true;
  vi.stubGlobal('navigator', { get onLine() { return daring; } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pekerjaan yang dikirim tanpa sinyal', () => {
  it('tersimpan sebagai antrean, dan TIDAK dilaporkan sebagai galat', async () => {
    daring = false;
    const h = await kirimPerintah('kirim_kerja', { woId: 7, jam: 3 });

    expect(h.keadaan).toBe('antre');
    /* Bukan 'ditolak'. Orang yang melihat kata "gagal" akan mengisi ulang
       formulirnya — dan pekerjaan yang sebenarnya sudah aman tersimpan jadi
       terkirim dua kali. */
    expect(h.keadaan).not.toBe('ditolak');

    const it = await bacaItem(h.opId);
    expect(it?.status).toBe('antre');
    expect(it?.data).toEqual({ woId: 7, jam: 3 });
  });

  it('masih ada sesudah aplikasi ditutup dan dibuka lagi', async () => {
    daring = false;
    const h = await kirimPerintah('kirim_kerja', { woId: 9 });

    // Aplikasi ditutup: koneksi dilupakan, modulnya seolah dimuat dari awal.
    lupakanKoneksi();

    const it = await bacaItem(h.opId);
    expect(it?.op_id).toBe(h.opId);
    expect(it?.status).toBe('antre');
  });

  it('tercatat SEBELUM permintaan berangkat, bukan sesudah gagal', async () => {
    /* Kalau antrean baru ditulis setelah fetch gagal, ada celah di antara
       "berangkat" dan "kita tahu ia gagal". HP yang mati di celah itu
       menghapus pekerjaannya tanpa jejak. */
    let adaSaatFetch = false;
    let opId = '';
    vi.stubGlobal('fetch', vi.fn(async () => {
      const isi = await semuaItem();
      adaSaatFetch = isi.length === 1;
      opId = isi[0]?.op_id ?? '';
      throw new Error('jaringan putus');
    }));

    await kirimPerintah('buat_wo', { blok: [] });
    expect(adaSaatFetch).toBe(true);
    expect(opId).not.toBe('');
  });
});

describe('server yang sedang sibuk', () => {
  it('membuat kiriman TETAP antre, bukan ditandai gagal', async () => {
    /* Ini pembedaan yang di KMB V2 disebut `retry_later`. Menandainya gagal
       berarti pekerjaan yang sah berhenti dicoba selamanya, hanya karena
       server sedang ramai selama tiga detik. */
    vi.stubGlobal('fetch', vi.fn(async () =>
      jawabanServer({ ok: false, kode: 'SEDANG_SIBUK', pesan: 'Sedang sibuk', boleh_coba_lagi: true }, 503)));

    const h = await kirimPerintah('approve_l1', { woId: 3 });
    expect(h.keadaan).toBe('antre');
    expect((await bacaItem(h.opId))?.status).toBe('antre');
  });
});

describe('kiriman yang ditolak server dengan alasan', () => {
  it('berhenti dicoba, dan alasannya disimpan apa adanya', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jawabanServer({ ok: false, kode: 'ATURAN_BISNIS', pesan: 'Jam selesai mendahului jam mulai' }, 400)));

    const h = await kirimPerintah('kirim_kerja', { woId: 4 });
    expect(h.keadaan).toBe('ditolak');
    expect(h.pesan).toBe('Jam selesai mendahului jam mulai');

    const it = await bacaItem(h.opId);
    expect(it?.status).toBe('gagal');
    expect(it?.galat).toBe('Jam selesai mendahului jam mulai');

    /* Dan ia tidak ikut terbawa saat antrean dikosongkan — mengulanginya hanya
       akan ditolak dengan alasan yang sama. Yang dibutuhkan orang. */
    expect(await antrean()).toHaveLength(0);
  });
});

describe('jawaban yang bukan JSON', () => {
  it('dianggap masalah jaringan, bukan penolakan', async () => {
    /* Portal wifi dan proxy kantor menjawab HTML yang menyaru jadi jawaban
       server. Menganggapnya penolakan membuang pekerjaan orang. */
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => { throw new Error('bukan JSON'); },
    }) as unknown as Response));

    const h = await kirimPerintah('kirim_kerja', { woId: 5 });
    expect(h.keadaan).toBe('antre');
    expect((await bacaItem(h.opId))?.status).toBe('antre');
  });
});

describe('kiriman yang sudah sampai', () => {
  it('tidak dikirim ulang walau tombolnya ditekan lagi dengan nomor yang sama', async () => {
    const panggil = vi.fn(async () =>
      jawabanServer({ ok: true, data: { hasil: { dibuat: [{ id: 1 }] } } }));
    vi.stubGlobal('fetch', panggil);

    const a = await kirimPerintah('buat_wo', { blok: [1] });
    expect(a.keadaan).toBe('berhasil');

    const b = await kirimPerintah('buat_wo', { blok: [1] }, { opId: a.opId });
    expect(b.keadaan).toBe('berhasil');

    /* Server memang sudah menjaga ini lewat op_id. Tapi menahannya di klien
       berarti permintaannya tidak pernah berangkat sama sekali — dan di sinyal
       lapangan, permintaan yang tidak perlu adalah detik-detik yang hilang. */
    expect(panggil).toHaveBeenCalledTimes(1);
  });
});

describe('mengosongkan antrean', () => {
  it('mengirim yang tertua lebih dulu', async () => {
    const urutan: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, o: RequestInit) => {
      urutan.push(JSON.parse(String(o.body)).data);
      return jawabanServer({ ok: true, data: { hasil: {} } });
    }));

    daring = false;
    await kirimPerintah('kirim_kerja', { urut: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await kirimPerintah('kirim_kerja', { urut: 2 });
    daring = true;

    await kosongkanAntrean();
    expect(urutan).toEqual([{ urut: 1 }, { urut: 2 }]);
  });

  it('berhenti pada kegagalan jaringan pertama, tidak menguras sisanya', async () => {
    daring = false;
    await kirimPerintah('kirim_kerja', { urut: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await kirimPerintah('kirim_kerja', { urut: 2 });
    daring = true;

    const panggil = vi.fn(async () => { throw new Error('putus lagi'); });
    vi.stubGlobal('fetch', panggil);

    const h = await kosongkanAntrean();
    expect(panggil).toHaveBeenCalledTimes(1);
    expect(h.terkirim).toBe(0);
    expect(h.sisa).toBe(2);
  });

  it('melaporkan berapa yang terkirim dan berapa yang masih menunggu', async () => {
    daring = false;
    await kirimPerintah('kirim_kerja', { urut: 1 });
    await kirimPerintah('kirim_kerja', { urut: 2 });
    daring = true;

    vi.stubGlobal('fetch', vi.fn(async () => jawabanServer({ ok: true, data: { hasil: {} } })));
    const h = await kosongkanAntrean();
    expect(h).toEqual({ terkirim: 2, sisa: 0 });
  });
});

describe('membersihkan antrean lama', () => {
  it('TIDAK PERNAH membuang yang masih menunggu, berapa pun umurnya', async () => {
    const tua = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await tulisOutbox({
      op_id: 'lama-antre', aksi: 'kirim_kerja', data: {},
      status: 'antre', dibuat_at: tua, percobaan: 99,
    });
    await tulisOutbox({
      op_id: 'lama-gagal', aksi: 'kirim_kerja', data: {},
      status: 'gagal', galat: 'ditolak', dibuat_at: tua, percobaan: 1,
    });
    await tulisOutbox({
      op_id: 'lama-terkirim', aksi: 'kirim_kerja', data: {},
      status: 'terkirim', dibuat_at: tua, percobaan: 1,
    });

    const dibuang = await pangkasYangSelesai(7);

    expect(dibuang).toBe(1);
    /* Yang antre adalah pekerjaan yang belum sampai — membuangnya menghapus
       jam kerja seseorang diam-diam. Yang gagal adalah satu-satunya catatan
       bahwa ia pernah mencoba; ia dibuang oleh ORANG, sesudah dibaca. */
    expect(await bacaItem('lama-antre')).not.toBeNull();
    expect(await bacaItem('lama-gagal')).not.toBeNull();
    expect(await bacaItem('lama-terkirim')).toBeNull();
  });
});

describe('antrean yang menua di iPhone', () => {
  it('umurnya bisa dibaca, supaya bisa diperingatkan sebelum penyimpanan dibuang', async () => {
    /* Safari membuang penyimpanan situs yang tidak dibuka sekitar tujuh hari.
       Antrean yang menua di iPhone bukan sekadar tertunda — ia bisa lenyap
       bersama seluruh jam kerja di dalamnya, tanpa ada yang menekan apa pun. */
    expect(await umurAntreanHari()).toBe(0);

    await tulisOutbox({
      op_id: 'menua', aksi: 'kirim_kerja', data: {}, status: 'antre',
      dibuat_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), percobaan: 3,
    });

    expect(await umurAntreanHari()).toBeGreaterThan(4.9);
    expect(await umurAntreanHari()).toBeLessThan(5.1);

    await hapusItem('menua');
    expect(await umurAntreanHari()).toBe(0);
  });
});
