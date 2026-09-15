import { describe, it, expect } from 'vitest';
import {
  periodeBerakhir, periodeSaatIni, periodeMundur, periodeTerakhir,
  dalamPeriode, CUTOFF_BAWAAN,
} from '../src/domain/periode.js';

/**
 * Uji ini meniru periksaPeriodePayroll() di KMB V2 (_PeriodePayroll.js:132-184),
 * dan alasannya ditulis di sana:
 *
 *   "Sengaja mengapit batasnya dari kedua sisi. Kesalahan pada aturan seperti
 *    ini selalu tepat di tanggal 15 dan 16, tak pernah di tengah bulan."
 *
 * Maka yang diuji bukan "apakah fungsinya jalan", melainkan tanggal-tanggal
 * tempat ia paling mungkin salah.
 */

/** Tengah hari, supaya zona waktu tak pernah menggeser tanggalnya. */
function tgl(th: number, bl: number, tg: number): Date {
  return new Date(th, bl - 1, tg, 12, 0, 0, 0);
}

describe('batas periode — tanggal 15 vs 16', () => {
  // Enam tanggal yang mengapit batas dari kedua sisi.
  const kasus: Array<[Date, string, string]> = [
    [tgl(2026, 8, 15), '2026-08', '16 Jul – 15 Agt 2026'],
    [tgl(2026, 8, 16), '2026-09', '16 Agt – 15 Sep 2026'],
    [tgl(2026, 8, 31), '2026-09', '16 Agt – 15 Sep 2026'],
    [tgl(2026, 9,  1), '2026-09', '16 Agt – 15 Sep 2026'],
    [tgl(2026, 9, 15), '2026-09', '16 Agt – 15 Sep 2026'],
    [tgl(2026, 9, 16), '2026-10', '16 Sep – 15 Okt 2026'],
  ];

  for (const [d, kunci, label] of kasus) {
    it(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} → ${label}`, () => {
      const p = periodeSaatIni(d);
      expect(p.kunci).toBe(kunci);
      expect(p.label).toBe(label);
    });
  }

  it('setiap tanggal termasuk di dalam periodenya sendiri', () => {
    for (const [d] of kasus) {
      expect(dalamPeriode(d, periodeSaatIni(d))).toBe(true);
    }
  });
});

describe('batas dibuka dan ditutup pada milidetik yang benar', () => {
  const p = periodeBerakhir(2026, 9);

  it('mulai 16 Agt 00:00:00.000', () => {
    expect(p.mulai.getFullYear()).toBe(2026);
    expect(p.mulai.getMonth()).toBe(7);     // Agustus
    expect(p.mulai.getDate()).toBe(16);
    expect(p.mulai.getHours()).toBe(0);
    expect(p.mulai.getMinutes()).toBe(0);
    expect(p.mulai.getSeconds()).toBe(0);
    expect(p.mulai.getMilliseconds()).toBe(0);
  });

  it('akhir 15 Sep 23:59:59.999', () => {
    expect(p.akhir.getMonth()).toBe(8);     // September
    expect(p.akhir.getDate()).toBe(15);
    expect(p.akhir.getHours()).toBe(23);
    expect(p.akhir.getMinutes()).toBe(59);
    expect(p.akhir.getSeconds()).toBe(59);
    expect(p.akhir.getMilliseconds()).toBe(999);
  });

  it('kedua batas inklusif; satu milidetik di luarnya sudah bukan miliknya', () => {
    expect(dalamPeriode(p.mulai, p)).toBe(true);
    expect(dalamPeriode(p.akhir, p)).toBe(true);
    expect(dalamPeriode(new Date(p.mulai.getTime() - 1), p)).toBe(false);
    expect(dalamPeriode(new Date(p.akhir.getTime() + 1), p)).toBe(false);
  });
});

describe('sambungan antar periode', () => {
  /**
   * Yang dijaga di sini: TIDAK ADA CELAH dan TIDAK ADA TINDIH.
   *
   * Celah berarti ada WO yang disahkan pada detik itu tidak masuk periode mana
   * pun — orangnya tidak digaji, dan tak ada satu pun galat yang muncul.
   * Tindih berarti ia masuk dua periode — dibayar dua kali.
   *
   * Diuji 26 periode berturut-turut supaya batas tahun, Februari, dan bulan
   * 30/31 hari ikut terlewati.
   */
  it('jarak antar periode tepat 1 milidetik, 26 periode berturut-turut', () => {
    let sebelum = periodeBerakhir(2025, 1);
    for (let i = 1; i <= 26; i++) {
      const kini = periodeBerakhir(2025, 1 + i);
      const jarak = kini.mulai.getTime() - sebelum.akhir.getTime();
      expect(jarak, `celah/tindih di ${kini.label}`).toBe(1);
      sebelum = kini;
    }
  });

  it('Februari tidak memendekkan atau memanjangkan sambungannya', () => {
    const feb = periodeBerakhir(2026, 2);   // 16 Jan – 15 Feb
    const mar = periodeBerakhir(2026, 3);   // 16 Feb – 15 Mar
    expect(feb.label).toBe('16 Jan – 15 Feb 2026');
    expect(mar.label).toBe('16 Feb – 15 Mar 2026');
    expect(mar.mulai.getTime() - feb.akhir.getTime()).toBe(1);
  });

  it('tahun kabisat: 29 Feb 2028 jatuh di periode yang benar', () => {
    const p = periodeSaatIni(tgl(2028, 2, 29));
    expect(p.label).toBe('16 Feb – 15 Mar 2028');
  });
});

describe('penyeberangan tahun', () => {
  it('16 Des 2026 masuk periode yang ditutup 15 Jan 2027', () => {
    const p = periodeSaatIni(tgl(2026, 12, 16));
    expect(p.kunci).toBe('2027-01');
    expect(p.mulai.getFullYear()).toBe(2026);
    expect(p.akhir.getFullYear()).toBe(2027);
  });

  it('label penuh menulis tahun di KEDUA sisi saat lintas tahun', () => {
    const p = periodeBerakhir(2027, 1);
    expect(p.label).toBe('16 Des 2026 – 15 Jan 2027');
  });

  it('label pendek menambahkan akhiran tahun HANYA saat lintas tahun', () => {
    expect(periodeBerakhir(2027, 1).labelPendek).toBe("16 Des – 15 Jan '27");
    expect(periodeBerakhir(2026, 9).labelPendek).toBe('16 Agt – 15 Sep');
  });

  it('mundur melewati Januari tidak menghasilkan bulan 0 atau tahun salah', () => {
    const jan = periodeBerakhir(2027, 1);
    expect(periodeMundur(jan, 1).label).toBe('16 Nov – 15 Des 2026');
    expect(periodeMundur(jan, 2).label).toBe('16 Okt – 15 Nov 2026');
    expect(periodeMundur(jan, 13).kunci).toBe('2025-12');
  });
});

describe('deret untuk grafik tren', () => {
  it('tiga periode, tertua di depan, yang terakhir adalah periode berjalan', () => {
    const acuan = tgl(2026, 9, 10);          // di dalam 16 Agt – 15 Sep
    const deret = periodeTerakhir(3, acuan);
    expect(deret.map((p) => p.kunci)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(deret[2]!.kunci).toBe(periodeSaatIni(acuan).kunci);
  });

  it('label sumbu tidak mengulang tahun saat semuanya di tahun yang sama', () => {
    const deret = periodeTerakhir(3, tgl(2026, 9, 10));
    expect(deret.map((p) => p.labelPendek)).toEqual([
      '16 Jun – 15 Jul', '16 Jul – 15 Agt', '16 Agt – 15 Sep',
    ]);
  });

  it('deret pun rapat: tiap periode menyambung ke berikutnya', () => {
    const deret = periodeTerakhir(6, tgl(2027, 1, 20));
    for (let i = 1; i < deret.length; i++) {
      expect(deret[i]!.mulai.getTime() - deret[i - 1]!.akhir.getTime()).toBe(1);
    }
  });

  it('menolak jumlah yang tidak masuk akal', () => {
    expect(() => periodeTerakhir(0)).toThrow();
    expect(() => periodeTerakhir(-3)).toThrow();
    expect(() => periodeTerakhir(2.5)).toThrow();
  });
});

describe('cut-off bisa digeser tanpa menyentuh kode', () => {
  it('cut-off 1 mengembalikan perilaku bulan kalender, panjang bulan ikut benar', () => {
    // 1 Sep 00:00:00.000 – 30 Sep 23:59:59.999
    const sep = periodeSaatIni(tgl(2026, 9, 10), 1);
    expect(sep.mulai.getDate()).toBe(1);
    expect(sep.mulai.getMonth()).toBe(8);
    expect(sep.akhir.getDate()).toBe(30);
    expect(sep.akhir.getMonth()).toBe(8);

    // Panjang bulan tidak dipatok 30/31 di mana pun — ia jatuh dari Date
    // sendiri, jadi Februari pun benar tanpa percabangan.
    expect(periodeBerakhir(2026, 3, 1).akhir.getDate()).toBe(28);
    expect(periodeBerakhir(2028, 3, 1).akhir.getDate()).toBe(29);  // kabisat
    expect(periodeBerakhir(2026, 2, 1).akhir.getDate()).toBe(31);  // Januari
  });

  it('cut-off 25: tanggal 24 masih periode lama, tanggal 25 sudah yang baru', () => {
    expect(periodeSaatIni(tgl(2026, 9, 24), 25).kunci).toBe('2026-09');
    expect(periodeSaatIni(tgl(2026, 9, 25), 25).kunci).toBe('2026-10');
  });

  it('sambungannya tetap rapat pada cut-off mana pun', () => {
    for (const c of [1, 5, 16, 28]) {
      const a = periodeBerakhir(2026, 5, c);
      const b = periodeBerakhir(2026, 6, c);
      expect(b.mulai.getTime() - a.akhir.getTime(), `cut-off ${c}`).toBe(1);
    }
  });

  it('menolak cut-off 29-31 — tanggal itu tidak ada di setiap bulan', () => {
    // Kalau diterima, Februari akan punya periode yang hilang atau bergeser
    // diam-diam — bentuk kesalahan yang baru ketahuan setelah ada yang tidak
    // digaji.
    expect(() => periodeBerakhir(2026, 3, 29)).toThrow(/1-28/);
    expect(() => periodeBerakhir(2026, 3, 31)).toThrow();
    expect(() => periodeBerakhir(2026, 3, 0)).toThrow();
    expect(() => periodeBerakhir(2026, 3, 16.5)).toThrow();
  });

  it('bawaannya 16', () => {
    expect(CUTOFF_BAWAAN).toBe(16);
    expect(periodeSaatIni(tgl(2026, 9, 10)).kunci)
      .toBe(periodeSaatIni(tgl(2026, 9, 10), 16).kunci);
  });
});

describe('dalamPeriode menolak masukan yang tidak berarti', () => {
  const p = periodeBerakhir(2026, 9);
  it('kosong, null, dan tanggal rusak semuanya false — bukan melempar', () => {
    expect(dalamPeriode(null, p)).toBe(false);
    expect(dalamPeriode(undefined, p)).toBe(false);
    expect(dalamPeriode('', p)).toBe(false);
    expect(dalamPeriode('bukan tanggal', p)).toBe(false);
  });
  it('menerima string ISO', () => {
    expect(dalamPeriode('2026-09-01T03:00:00.000Z', p)).toBe(true);
    expect(dalamPeriode('2026-07-01T03:00:00.000Z', p)).toBe(false);
  });
});
