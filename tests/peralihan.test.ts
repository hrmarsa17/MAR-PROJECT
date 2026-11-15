import { describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs tanpa deklarasi tipe
import { jadwalAwal, perpanjang, bolehAmbil, waktunyaBalik, sudahAkhir } from '../tools/cermin/peralihan.mjs';

// Jadwal putaran pelaksana (tools/cermin/peralihan.mjs). GitHub menjalankan jadwal */5 nyatanya ±1 jam sekali
// (15 Nov), jadi putaran yang baru mengerjakan satu permintaan harus tetap menunggu langkah prosedur berikutnya.
const M = 60000;
const T0 = Date.UTC(2026, 10, 19, 1, 0, 0);

describe('jadwal pelaksana Peralihan', () => {
  it('putaran terjadwal biasa: menunggu 4 menit lalu berhenti', () => {
    const j = jadwalAwal(T0, { menit: 4, maks: 150 });
    expect(j.akhir).toBe(T0 + 4 * M);
    expect(sudahAkhir(j, T0 + 3 * M + 44_000, 15_000)).toBe(false);
    expect(sudahAkhir(j, T0 + 3 * M + 46_000, 15_000)).toBe(true);
  });

  it('sesudah satu permintaan selesai, putaran menunggu 20 menit lagi untuk langkah berikutnya', () => {
    let j = jadwalAwal(T0, { menit: 4, maks: 150 });
    // sinkron terakhir diambil di menit 1 dan selesai di menit 12
    j = perpanjang(j, T0 + 12 * M, 20);
    expect(j.akhir).toBe(T0 + 32 * M);
    expect(sudahAkhir(j, T0 + 20 * M)).toBe(false);
    // cermin balik awal diminta di menit 15, selesai di menit 35: tunggu lagi sampai menit 55
    expect(bolehAmbil(j, T0 + 15 * M)).toBe(true);
    j = perpanjang(j, T0 + 35 * M, 20);
    expect(j.akhir).toBe(T0 + 55 * M);
  });

  it('perpanjangan tidak pernah memendekkan jendela tunggu yang sudah lebih panjang (jalan manual --menit=60)', () => {
    let j = jadwalAwal(T0, { menit: 60, maks: 150 });
    j = perpanjang(j, T0 + 5 * M, 20);
    expect(j.akhir).toBe(T0 + 60 * M);
  });

  it('tidak melewati batas: permintaan baru tidak diambil sesudah --maks menit', () => {
    let j = jadwalAwal(T0, { menit: 4, maks: 150 });
    j = perpanjang(j, T0 + 140 * M, 20);
    expect(j.akhir).toBe(T0 + 150 * M);
    expect(bolehAmbil(j, T0 + 149 * M)).toBe(true);
    expect(bolehAmbil(j, T0 + 150 * M)).toBe(false);
    expect(jadwalAwal(T0, { menit: 200, maks: 150 }).akhir).toBe(T0 + 150 * M);
  });

  it('cermin balik berkala: di awal putaran, lalu tiap 5 menit', () => {
    expect(waktunyaBalik(null, T0, 5)).toBe(true);
    expect(waktunyaBalik(T0, T0 + 4 * M, 5)).toBe(false);
    expect(waktunyaBalik(T0, T0 + 5 * M, 5)).toBe(true);
  });
});
