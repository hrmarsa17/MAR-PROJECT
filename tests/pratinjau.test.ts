import { describe, expect, it } from 'vitest';
import { bedaPratinjau } from '../src/pwa/bandingPratinjau.js';

/**
 * Persetujuan yang menunggu di antrean membekukan uang SESUDAHNYA, memakai
 * faktor yang berlaku saat server memprosesnya. Uji ini menjaga agar selisih
 * antara "yang dilihat approver" dan "yang akhirnya membeku" tidak pernah
 * lewat tanpa disebut — dan, sama pentingnya, agar yang BUKAN selisih tidak
 * pernah diributkan.
 */

describe('angka yang berubah selagi kiriman menunggu', () => {
  it('disebutkan, lengkap dengan yang dilihat dan yang jadi', () => {
    const beda = bedaPratinjau(
      { poin: 120, idr: 480_000 },
      { hasil: { poin: 96, idr: 384_000 } },
    );

    expect(beda).toEqual([
      { kunci: 'poin', dilihat: 120, jadi: 96 },
      { kunci: 'idr', dilihat: 480_000, jadi: 384_000 },
    ]);
  });

  it('ditemukan walau tersimpan jauh di dalam jawaban server', () => {
    const beda = bedaPratinjau(
      { idr: 100 },
      { hasil: { wo: { mekanik: [{ idr: 250 }] } } },
    );
    expect(beda).toHaveLength(1);
    expect(beda[0]?.jadi).toBe(250);
  });
});

describe('yang BUKAN selisih', () => {
  it('numeric Postgres yang tiba sebagai teks tidak dianggap berbeda', () => {
    /* Postgres mengembalikan numeric sebagai string: "120.00". Membandingkannya
       sebagai teks dengan angka 120 akan melaporkan selisih pada SETIAP
       kiriman — dan peringatan yang selalu menyala akan berhenti dibaca,
       termasuk pada hari selisihnya sungguhan. */
    expect(bedaPratinjau({ poin: 120 }, { hasil: { poin: '120.00' } })).toEqual([]);
  });

  it('beda pembulatan di bawah setengah sen tidak dianggap berbeda', () => {
    expect(bedaPratinjau({ poin: 12.0 }, { hasil: { poin: 12.004 } })).toEqual([]);
  });

  it('kunci yang memang tidak dikembalikan server dilewati, bukan dilaporkan', () => {
    /* Pratinjau boleh memuat hal yang tidak ada di jawaban — nama unit,
       keterangan. Melaporkannya sebagai selisih membuat tiap kiriman tampak
       bermasalah. */
    expect(bedaPratinjau({ namaUnit: 'DT-01', poin: 10 }, { hasil: { poin: 10 } })).toEqual([]);
  });

  it('tanpa pratinjau tidak ada yang dibandingkan', () => {
    expect(bedaPratinjau(undefined, { hasil: { poin: 999 } })).toEqual([]);
  });

  it('nilai kosong di pratinjau tidak dianggap nol', () => {
    expect(bedaPratinjau({ poin: null as unknown as number }, { hasil: { poin: 0 } })).toEqual([]);
    expect(bedaPratinjau({ poin: '' }, { hasil: { poin: 0 } })).toEqual([]);
  });
});

describe('teks yang berubah', () => {
  it('dibandingkan apa adanya, bukan sebagai angka', () => {
    const beda = bedaPratinjau(
      { status: 'pending_superintendent' },
      { hasil: { status: 'approved' } },
    );
    expect(beda).toEqual([
      { kunci: 'status', dilihat: 'pending_superintendent', jadi: 'approved' },
    ]);
  });
});
