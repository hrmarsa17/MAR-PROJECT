import { describe, expect, it } from 'vitest';
import * as modBalik from '../tools/cermin/balik.mjs';
import * as modGoogle from '../tools/cermin/google.mjs';

const { rencanaSheet, cekSasaran } = modBalik as any;
const { rapikan, isoKeSeri } = modGoogle as any;

/**
 * CERMIN BALIK (Supabase → spreadsheet), jaring pengaman "Kembali ke GAS" (docs/SAKLAR.md).
 *
 * Yang diuji: rencana tulisan tools/cermin/balik.mjs, diterapkan ke spreadsheet tiruan di memori yang meniru
 * semantik Sheets API (updateCells dengan masker `fields`, appendDimension), lalu dibaca ulang dengan pembaca yang
 * SAMA dengan sinkron maju (tools/cermin/google.mjs rapikan). Syaratnya satu: hasil baca ulang = isi cermin, sehingga
 * pemeriksaan "selisih 0" sebelum GAS dibuka kembali bisa terpenuhi.
 * Uji 15 Nov 2026 terhadap spreadsheet BUPR asli (mode kering, hanya baca): 24/24 sheet sama dengan cermin.
 */

const ZONA = 'Asia/Jakarta';
type Sel = { uv?: any; fmt?: any };

// ── Spreadsheet tiruan ──────────────────────────────────────────────────────
function buatGrid(baris: number, kolom: number) {
  return { baris, kolom, sel: [] as Sel[][] };
}
function sel(g: any, r: number, c: number): Sel {
  const row = g.sel[r] || (g.sel[r] = []);
  return row[c] || (row[c] = {});
}
function terapkan(g: any, minta: any[]) {
  for (const m of minta) {
    if (m.appendDimension) {
      if (m.appendDimension.dimension === 'ROWS') g.baris += m.appendDimension.length; else g.kolom += m.appendDimension.length;
      continue;
    }
    const u = m.updateCells;
    const { startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } = u.range;
    expect(r1).toBeLessThanOrEqual(g.baris);       // Sheets menolak rentang di luar kisi
    expect(c1).toBeLessThanOrEqual(g.kolom);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const isi = u.rows ? ((u.rows[r - r0] || {}).values || [])[c - c0] || {} : {};
        const s = sel(g, r, c);
        if (u.fields === 'userEnteredValue') s.uv = isi.userEnteredValue;
        else if (u.fields === 'userEnteredFormat.numberFormat') s.fmt = isi.userEnteredFormat && isi.userEnteredFormat.numberFormat;
        else throw new Error('masker tidak dikenal ' + u.fields);
      }
    }
  }
}
// Isi sel seperti yang dikembalikan API (effectiveValue + effectiveFormat), rumus sederhana =<kolom><baris>*<angka>.
function mentahDari(g: any) {
  const nilaiEf = (r: number, c: number): any => {
    const s = (g.sel[r] || [])[c];
    if (!s || !s.uv) return undefined;
    if ('formulaValue' in s.uv) {
      const m = String(s.uv.formulaValue).match(/^=([A-Z])(\d+)\*(\d+(?:\.\d+)?)$/);
      if (!m) throw new Error('rumus uji tidak dikenal');
      const v = nilaiEf(Number(m[2]) - 1, m[1]!.charCodeAt(0) - 65);
      return { numberValue: (v ? v.numberValue : 0) * Number(m[3]) };
    }
    return s.uv;
  };
  const out: any[] = [];
  for (let r = 0; r < g.baris; r++) {
    const row: any[] = [];
    for (let c = 0; c < g.kolom; c++) {
      const s = (g.sel[r] || [])[c];
      const ev = nilaiEf(r, c);
      row.push(ev || (s && s.fmt) ? { ...(ev ? { effectiveValue: ev } : {}), ...(s && s.fmt ? { effectiveFormat: { numberFormat: s.fmt } } : {}) } : {});
    }
    out.push(row);
  }
  return out;
}
// Isi awal spreadsheet dari isi cermin (seperti spreadsheet asli saat jam mulai: selisih 0).
function gridDariCermin(headers: string[], rows: any[][], tipe: Record<string, string>, ekstraBaris = 5) {
  const g = buatGrid(rows.length + 1 + ekstraBaris, headers.length);
  headers.forEach((h, c) => { sel(g, 0, c).uv = { stringValue: h }; });
  rows.forEach((r, i) => r.forEach((x, c) => {
    const s = sel(g, i + 1, c);
    if (x === '') return;
    if (typeof x === 'string' && /T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && String(tipe[headers[c]!]).includes('tanggal')) {
      s.uv = { numberValue: isoKeSeri(x, ZONA) }; s.fmt = { type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm:ss' };
    } else if (typeof x === 'number') s.uv = { numberValue: x };
    else if (typeof x === 'boolean') s.uv = { boolValue: x };
    else s.uv = { stringValue: x };
  }));
  return g;
}
const bacaUlang = (g: any) => rapikan(mentahDari(g), ZONA);
const cerminDari = (headers: string[], rows: any[][], tipe: any, rumus: any[] = []) => ({
  headers, tipe, jumlah_baris: rows.length, rumus, baris: rows.map((nilai, i) => ({ baris: i + 2, nilai })),
});

const H = ['id', 'status', 'created_at', 'poin', 'aktif'];
const T = { id: 'teks', status: 'teks', created_at: 'tanggal', poin: 'angka', aktif: 'boolean' };
const AWAL: any = [
  ['WO-1', 'approved', '2026-11-01T01:15:00.000Z', 4.4, true],
  ['WO-2', 'pending', '2026-11-02T13:59:30.123Z', 1.1, false],
  ['WO-3', 'pending', '', 0, true],
  ['WO-4', 'submitted', '2026-11-03T23:00:00.000Z', 2.25, true],
];

describe('cermin balik: rencana tulisan → spreadsheet', () => {
  it('mode penuh pada spreadsheet yang sudah sama: tidak menulis apa pun', () => {
    const g = gridDariCermin(H, AWAL, T);
    const r = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: cerminDari(H, AWAL, T), lalu: null, mentah: mentahDari(g), zona: ZONA });
    expect(r.tulis.size).toBe(0);
    expect(r.minta.length).toBe(0);
    expect(r.pola['2']).toEqual({ type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm:ss' });   // pola kolom dicatat
  });

  it('mode bertahap: ubah, hapus baris (geser naik), tambah baris; hasil baca ulang = cermin', () => {
    const g = gridDariCermin(H, AWAL, T, 0);   // kisi pas, supaya baris baru harus menambah kisi
    const awal = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: cerminDari(H, AWAL, T), lalu: null, mentah: mentahDari(g), zona: ZONA });
    // Jalur Supabase: WO-1 dihapus (deleteRow menggeser semua baris di bawahnya naik), WO-3 berubah, dua WO baru.
    const T2 = { ...T, created_at: 'campur:angka+tanggal' };
    const BARU: any[][] = [
      AWAL[1],                                                       // baris 2 (dulu WO-1, berformat tanggal)
      ['WO-6', 'teks bebas "07:00"', 12345, '', ''],                 // baris 3 (dulu tanggal WO-2): angka, bukan tanggal
      ['WO-3', 'approved', '2026-11-15T00:05:00.000Z', 3, true],     // baris 4 (dulu kosong, tanpa format): tanggal baru
      AWAL[3],
      ['WO-5', 'pending', '2026-11-15T02:30:45.500Z', 0.75, false],  // baris 6: di luar kisi lama
    ];
    // cermin_tulis menulis ulang semua baris yang bergeser: semua baris 2..6 bertanda waktu baru.
    const c = cerminDari(H, BARU, T2);
    const r = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c, lalu: { jumlah_baris: AWAL.length, headers: H, pola: awal.pola }, mentah: null, zona: ZONA });
    terapkan(g, r.minta);
    const ulang = bacaUlang(g);
    expect(ulang.headers).toEqual(H);
    expect(ulang.rows.map((x: any) => x.nilai)).toEqual(BARU);
    // Sel tanggal yang ditulis memakai pola kolom; angka di kolom tanggal kembali ke format otomatis.
    expect(sel(g, 2, 2).fmt).toBeUndefined();                                     // format tanggal lama dilepas
    expect(sel(g, 3, 2).fmt).toEqual({ type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm:ss' });
    expect(sel(g, 5, 2).fmt).toEqual({ type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm:ss' });
    expect(sel(g, 2, 1).uv).toEqual({ stringValue: 'teks bebas "07:00"' });   // teks tidak diurai
  });

  it('jumlah baris turun: baris sisa di bawah dikosongkan', () => {
    const g = gridDariCermin(H, AWAL, T);
    const awal = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: cerminDari(H, AWAL, T), lalu: null, mentah: mentahDari(g), zona: ZONA });
    const BARU: any[][] = [AWAL[0], AWAL[2]];
    const c = { ...cerminDari(H, BARU, T), baris: [{ baris: 3, nilai: AWAL[2] }] };   // hanya baris 3 yang bergeser
    const r = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c, lalu: { jumlah_baris: 4, headers: H, pola: awal.pola }, mentah: null, zona: ZONA });
    expect(r.dikosongkan).toBe(2);
    terapkan(g, r.minta);
    expect(bacaUlang(g).rows.map((x: any) => x.nilai)).toEqual(BARU);
  });

  it('kolom baru di judul: kisi diperluas, judul dan baris ditulis', () => {
    const g = gridDariCermin(H, AWAL, T);
    const awal = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: cerminDari(H, AWAL, T), lalu: null, mentah: mentahDari(g), zona: ZONA });
    const H2 = [...H, 'catatan'];
    const BARU = AWAL.map((r: any[], i: number) => [...r, i === 1 ? 'baru' : '']);
    const r = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: { ...cerminDari(H2, BARU, { ...T, catatan: 'teks' }), baris: [{ baris: 3, nilai: BARU[1] }] },
      lalu: { jumlah_baris: 4, headers: H, pola: awal.pola }, mentah: null, zona: ZONA });
    expect(r.minta[0]).toMatchObject({ appendDimension: { dimension: 'COLUMNS', length: 1 } });
    terapkan(g, r.minta);
    const ulang = bacaUlang(g);
    expect(ulang.headers).toEqual(H2);
    expect(ulang.rows.map((x: any) => x.nilai)).toEqual(BARU);
  });

  it('mode penuh memulihkan sel yang diubah langsung di spreadsheet', () => {
    const g = gridDariCermin(H, AWAL, T);
    sel(g, 2, 1).uv = { stringValue: 'diubah tangan' };
    sel(g, 3, 3).uv = undefined;
    const r = rencanaSheet({ grid: { id: 7, baris: g.baris, kolom: g.kolom }, c: cerminDari(H, AWAL, T), lalu: null, mentah: mentahDari(g), zona: ZONA });
    expect([...r.tulis.keys()].sort()).toEqual([3, 4]);
    terapkan(g, r.minta);
    expect(bacaUlang(g).rows.map((x: any) => x.nilai)).toEqual(AWAL);
  });

  it('sel berumus (cermin_rumus) ditulis sebagai rumus, spreadsheet menghitung sendiri', () => {
    const HJ = ['job_id', 'plan_hours', 'base_point'];
    const TJ = { job_id: 'teks', plan_hours: 'angka', base_point: 'angka' };
    const JOB: any = [['JOB-1', 2, 4], ['JOB-2', 0.5, 1]];
    const rumus = [{ baris: 2, kolom: 2, rumus: '=B2*2' }, { baris: 3, kolom: 2, rumus: '=B3*2' }];
    const g = gridDariCermin(HJ, JOB, TJ);
    rumus.forEach((f) => { sel(g, f.baris - 1, f.kolom).uv = { formulaValue: f.rumus }; });
    const awal = rencanaSheet({ grid: { id: 9, baris: g.baris, kolom: g.kolom }, c: cerminDari(HJ, JOB, TJ, rumus), lalu: null, mentah: mentahDari(g), zona: ZONA });
    expect(awal.tulis.size).toBe(0);
    // Pusat admin: plan_hours JOB-2 diubah (base_point dihitung ulang di cermin) dan baris baru dengan rumus seragam.
    const BARU: any[][] = [JOB[0], ['JOB-2', 0.75, 1.5], ['JOB-3', 1.25, 2.5]];
    const rumus2 = [...rumus, { baris: 4, kolom: 2, rumus: '=B4*2' }];
    const c = { ...cerminDari(HJ, BARU, TJ, rumus2), baris: [{ baris: 3, nilai: BARU[1] }, { baris: 4, nilai: BARU[2] }] };
    const r = rencanaSheet({ grid: { id: 9, baris: g.baris, kolom: g.kolom }, c, lalu: { jumlah_baris: 2, headers: HJ, pola: {} }, mentah: null, zona: ZONA });
    terapkan(g, r.minta);
    expect(sel(g, 3, 2).uv).toEqual({ formulaValue: '=B4*2' });
    expect(bacaUlang(g).rows.map((x: any) => x.nilai)).toEqual(BARU);
  });
});

describe('cermin balik: pengaman sasaran', () => {
  const semuaAsli = ['ASLI-BUPR', 'ASLI-SUM'];
  it('spreadsheet asli rumah sendiri dikenali (penulisan lalu menunggu izin tulis di database)', () => {
    expect(cekSasaran({ skema: 'kmbbupr', sasaran: 'ASLI-BUPR', asli: 'ASLI-BUPR', semuaAsli, dariOpsi: false })).toBe(true);
    expect(cekSasaran({ skema: 'kmbbupr', sasaran: 'SALINAN', asli: 'ASLI-BUPR', semuaAsli, dariOpsi: true })).toBe(false);
  });
  it('menolak spreadsheet asli rumah lain dan skema uji ke spreadsheet asli', () => {
    expect(() => cekSasaran({ skema: 'kmbbupr', sasaran: 'ASLI-SUM', asli: 'ASLI-BUPR', semuaAsli, dariOpsi: true })).toThrow(/rumah lain/);
    expect(() => cekSasaran({ skema: 'uji_kmbbupr', sasaran: 'ASLI-BUPR', asli: null, semuaAsli, dariOpsi: true })).toThrow(/salinan latihan/);
    expect(() => cekSasaran({ skema: 'uji_kmbbupr', sasaran: null, asli: null, semuaAsli, dariOpsi: false })).toThrow(/tidak ada sasaran/);
    expect(cekSasaran({ skema: 'uji_kmbbupr', sasaran: 'SALINAN', asli: null, semuaAsli, dariOpsi: true })).toBe(false);
  });
});

describe('galat Google yang diulang (tools/cermin/google.mjs bolehUlang)', () => {
  const { bolehUlang } = modGoogle as any;
  it('409 ABORTED diulang (15 Nov: sinkron per jam KMB V2 gagal karenanya), 409 lain tidak', () => {
    expect(bolehUlang(409, '{ "error": { "code": 409, "message": "The operation was aborted.", "status": "ABORTED" } }')).toBe(true);
    expect(bolehUlang(409, '{ "error": { "code": 409, "status": "ALREADY_EXISTS" } }')).toBe(false);
  });
  it('429 dan 5xx diulang; 400/403/404 tidak', () => {
    expect(bolehUlang(429)).toBe(true);
    expect(bolehUlang(503)).toBe(true);
    for (const s of [400, 403, 404]) expect(bolehUlang(s, 'ABORTED')).toBe(false);
  });
});
