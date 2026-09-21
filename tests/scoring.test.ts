import { describe, expect, it } from 'vitest';
import {
  bulatkan,
  hitungSkor,
  jamTerpakai,
  rupiahUntukPoin,
  statusKetepatanWaktu,
  type FaktorTersedia,
} from '../src/domain/scoring.js';

/**
 * Uji rumus uang.
 *
 * Setiap blok di bawah menguji satu hal yang PERNAH SALAH di KMB V2, atau satu
 * aturan yang kalau bergeser akan mengubah jumlah rupiah yang diterima orang.
 */

const FAKTOR: FaktorTersedia = {
  workCondition: { normal: 1.0, difficult: 1.2, extreme: 1.5 },
  timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
  safety: { no_incident: 1.0, incident: 0.0 },
  mtbf: { first_time: 1.2, redo: 0.8 },
};

const DASAR = {
  basePoints: 10,
  targetHours: 5,
  actualHours: 5,
  unitFactor: 1,
  workCondition: 'normal',
  safetyIncident: false,
  mtbfRedoStatus: null,
};

describe('pembulatan', () => {
  it('membulatkan ke 0 desimal dengan benar', () => {
    // KMB V2: `decimals = decimals || 2` membuat pemanggilan dengan 0 diam-diam
    // membulatkan ke 2 desimal, karena 0 itu falsy. Belum menggigit di sana
    // hanya karena semua tarif kebetulan kelipatan 100.
    expect(bulatkan(1234.56, 0)).toBe(1235);
    expect(bulatkan(0.5, 0)).toBe(1);
  });

  it('tidak terseret galat pecahan biner', () => {
    expect(bulatkan(1.005, 2)).toBe(1.01);
    expect(bulatkan(8.165, 2)).toBe(8.17);
  });
});

describe('ketepatan waktu', () => {
  it('tepat waktu sampai 100%', () => {
    expect(statusKetepatanWaktu(5, 5)).toBe('on_time');
    expect(statusKetepatanWaktu(4, 5)).toBe('on_time');
  });

  it('terlambat di atas 100% sampai 150%', () => {
    expect(statusKetepatanWaktu(5.01, 5)).toBe('late');
    expect(statusKetepatanWaktu(7.5, 5)).toBe('late');
  });

  it('sangat terlambat di atas 150%', () => {
    expect(statusKetepatanWaktu(7.51, 5)).toBe('way_late');
  });

  it('target nol jam dianggap tepat waktu, bukan pembagian nol', () => {
    expect(statusKetepatanWaktu(3, 0)).toBe('on_time');
    expect(hitungSkor({ ...DASAR, targetHours: 0 }, FAKTOR).finalPoints).toBe(10);
  });
});

describe('rumus poin', () => {
  it('mengalikan seluruh faktor berurutan', () => {
    const s = hitungSkor(
      {
        ...DASAR,
        basePoints: 16,
        unitFactor: 1.1,
        workCondition: 'difficult',
        actualHours: 6,
        targetHours: 5,
        mtbfRedoStatus: 'first_time',
      },
      FAKTOR,
    );
    // 16 × 1,1 × 1,2 (difficult) × 0,8 (late) × 1,0 (safety) × 1,2 (first_time)
    expect(s.timelinessStatus).toBe('late');
    expect(s.finalPoints).toBe(bulatkan(16 * 1.1 * 1.2 * 0.8 * 1.0 * 1.2, 2));
  });

  it('insiden keselamatan menol-kan SELURUH WO', () => {
    // Bukan penalti per orang — seluruh WO jadi nol untuk semua anggota tim.
    const s = hitungSkor({ ...DASAR, safetyIncident: true }, FAKTOR);
    expect(s.finalPoints).toBe(0);
  });

  it('faktor yang tidak dikenal bernilai 1,0, bukan nol', () => {
    // Faktor hilang berarti "tanpa penyesuaian". Kalau ia jatuh ke 0, satu baris
    // konfigurasi yang terhapus akan membuat semua orang dibayar nol.
    const s = hitungSkor({ ...DASAR, workCondition: 'belum_ada_di_config' }, FAKTOR);
    expect(s.workConditionFactor).toBe(1.0);
    expect(s.finalPoints).toBe(10);
  });

  it('mtbf redo memangkas, first_time menaikkan', () => {
    const redo = hitungSkor({ ...DASAR, mtbfRedoStatus: 'redo' }, FAKTOR);
    const pertama = hitungSkor({ ...DASAR, mtbfRedoStatus: 'first_time' }, FAKTOR);
    expect(redo.finalPoints).toBe(8);
    expect(pertama.finalPoints).toBe(12);
    // Rentangnya 50% dan murni pilihan approver — tanpa pembanding riwayat.
    expect(pertama.finalPoints / redo.finalPoints).toBe(1.5);
  });
});

describe('jam kerja', () => {
  it('menjumlahkan sesi terakhir dengan jam sebelum transfer', () => {
    // Jam shift sebelumnya tidak boleh hilang saat WO dioper.
    expect(jamTerpakai(3, 4.5)).toBe(7.5);
  });

  it('tetap benar bila belum pernah ditransfer', () => {
    expect(jamTerpakai(3, 0)).toBe(3);
  });
});

describe('rupiah', () => {
  it('poin dikali tarif, dibulatkan ke rupiah utuh', () => {
    expect(rupiahUntukPoin(12.5, 2500)).toBe(31250);
  });

  it('menolak tarif yang bukan angka — tidak ada nilai cadangan', () => {
    // Di KMB V2, tarif yang tidak ketemu diam-diam jadi 50.000 per poin —
    // 11-20x lipat tarif asli, tanpa error dan tanpa log.
    expect(() => rupiahUntukPoin(10, Number.NaN)).toThrow();
  });

  it('dua mekanik dengan tarif berbeda menerima poin sama, rupiah berbeda', () => {
    const poin = hitungSkor(DASAR, FAKTOR).finalPoints;
    expect(rupiahUntukPoin(poin, 2500)).toBe(25000);
    expect(rupiahUntukPoin(poin, 4500)).toBe(45000);
  });
});

describe('model poin penuh', () => {
  it('setiap anggota menerima poin utuh, bukan dibagi', () => {
    const poin = hitungSkor({ ...DASAR, basePoints: 30 }, FAKTOR).finalPoints;
    const tim = [2500, 2500, 3500];
    const total = tim.reduce((a, tarif) => a + rupiahUntukPoin(poin, tarif), 0);

    // 30 poin untuk MASING-MASING dari 3 orang, bukan 10 poin per orang.
    expect(poin).toBe(30);
    expect(total).toBe(30 * 2500 + 30 * 2500 + 30 * 3500);
    // Menambah anggota tidak memecah kue — ia menggandakan pengeluaran.
  });
});

describe('edge cases', () => {
  it('mendukung base points besar', () => {
    const s = hitungSkor({ ...DASAR, basePoints: 10000 }, FAKTOR);
    expect(s.finalPoints).toBe(10000);
  });
});

