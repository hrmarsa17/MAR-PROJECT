import ExcelJS from 'exceljs';
import type { HasilPayroll } from './kueriPayroll.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * WORKBOOK PAYROLL — tepat dua worksheet
 * ════════════════════════════════════════════════════════════════════════════
 * Kontraknya di docs/SPEK-LAYAR/07-REPORTS.md §4, diambil dari
 * `_buildSummarySheet` & `_buildDetailSheet` (`PayrollService.js:395-557`).
 *
 * ── SEL ANGKA HARUS ANGKA, BUKAN TEKS ───────────────────────────────────────
 * Rupiah ditulis sebagai number dengan format `"Rp "#,##0`, bukan string
 * "Rp 1.250.000". Bedanya baru terasa saat orang yang menerima berkas ini
 * menyorot satu kolom untuk menjumlahkannya sendiri — dan itu hal pertama yang
 * dilakukan siapa pun yang memeriksa slip gaji.
 *
 * ── WARNANYA AMBER, BUKAN MERAH ─────────────────────────────────────────────
 * Seluruh warna kepala di sini amber (#F59E0B), sama dengan sumber. Merah tidak
 * dipakai kecuali untuk safety nol. Berkas ini dibuka di Excel, di luar
 * antarmuka kita — ia tidak perlu ikut tema merah KMB Project, dan merah di
 * lembar kerja dibaca sebagai peringatan.
 */

const AMBER = 'FFF59E0B';
const PUTIH = 'FFFFFFFF';
const COKELAT = 'FFB45309';

/** px → lebar kolom Excel (satuan karakter). Excel ≈ 7px per karakter. */
function lebar(px: number): number {
  return Math.round((px / 7) * 100) / 100;
}

export async function workbookPayroll(d: HasilPayroll): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KMB Project';
  wb.created = d.dibuatAt;

  ringkasan(wb, d);
  detailWo(wb, d);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function tglJam(t: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()} `
       + `${p(t.getHours())}:${p(t.getMinutes())}`;
}

function tgl(iso: string | null): string {
  if (!iso) return '-';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}`;
}

function jam(iso: string | null): string {
  if (!iso) return '-';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getHours())}:${p(t.getMinutes())}`;
}

function isiKepala(
  ws: ExcelJS.Worksheet, baris: number, judul: string[], warna: string[],
) {
  const r = ws.getRow(baris);
  judul.forEach((t, i) => {
    const sel = r.getCell(i + 1);
    sel.value = t;
    sel.font = { bold: true, color: { argb: PUTIH }, size: 10 };
    sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: warna[i] ?? AMBER } };
    sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sel.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  r.height = 28;
}

/* ── Sheet 1: Ringkasan ─────────────────────────────────────────────────── */

function ringkasan(wb: ExcelJS.Workbook, d: HasilPayroll) {
  const ws = wb.addWorksheet('Ringkasan');

  ws.mergeCells('A1:H1');
  const j = ws.getCell('A1');
  j.value = 'LAPORAN PAYROLL INSENTIF MEKANIK';
  j.font = { bold: true, size: 14, color: { argb: PUTIH } };
  j.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
  j.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.getCell('A2').value = `Periode: ${d.periodeLabel}`;
  ws.getCell('A2').font = { italic: true, color: { argb: COKELAT } };
  ws.getCell('A3').value = `Dibuat: ${tglJam(d.dibuatAt)}`;
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };
  /* Tarifnya TIDAK satu angka. Ia dibekukan per baris poin, jadi satu orang
     bisa punya dua tarif dalam satu periode kalau jabatannya berubah di
     tengah. Kalimat ini yang mencegah orang mengalikan total poin dengan satu
     tarif dan bertanya kenapa tidak cocok. */
  ws.getCell('A4').value =
    'Rate per poin: DIBEKUKAN saat poin terbit, bisa berbeda antar baris '
    + '(lihat kolom Rate/Poin).';
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF6B7280' }, size: 9 };

  isiKepala(ws, 6,
    ['No', 'Nama Mekanik', 'Jabatan', 'Mechanic ID',
     'Total WO Selesai', 'Total Poin', 'Rate/Poin', 'Total IDR (Rp)'],
    new Array(8).fill(AMBER));

  [40, 200, 120, 140, 120, 110, 100, 160].forEach((px, i) => {
    ws.getColumn(i + 1).width = lebar(px);
  });

  d.ringkas.forEach((m, i) => {
    const r = ws.getRow(7 + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = m.nama;
    r.getCell(3).value = m.jabatan;
    r.getCell(4).value = m.mekanikKode;
    r.getCell(5).value = m.totalWo;
    r.getCell(6).value = m.totalPoin;
    r.getCell(6).numFmt = '#,##0.##';
    if (m.ratePoin === null) {
      r.getCell(7).value = 'Bervariasi';
      r.getCell(7).font = { italic: true, color: { argb: COKELAT } };
    } else {
      r.getCell(7).value = m.ratePoin;
      r.getCell(7).numFmt = '"Rp "#,##0';
    }
    r.getCell(8).value = m.totalIdr;
    r.getCell(8).numFmt = '"Rp "#,##0';

    if (i % 2 === 0) {
      for (let c = 1; c <= 8; c++) {
        r.getCell(c).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' },
        };
      }
    }
  });

  const barisTotal = 7 + d.ringkas.length;
  const t = ws.getRow(barisTotal);
  t.getCell(2).value = 'TOTAL';
  t.getCell(5).value = d.ringkas.reduce((a, b) => a + b.totalWo, 0);
  t.getCell(6).value = Math.round(d.ringkas.reduce((a, b) => a + b.totalPoin, 0) * 100) / 100;
  t.getCell(6).numFmt = '#,##0.##';
  t.getCell(8).value = d.statistik.idr;
  t.getCell(8).numFmt = '"Rp "#,##0';
  for (let c = 1; c <= 8; c++) {
    t.getCell(c).font = { bold: true, color: { argb: PUTIH } };
    t.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
  }

  // Enam baris dibekukan: judul, periode, dibuat, catatan tarif, kosong, kepala.
  ws.views = [{ state: 'frozen', ySplit: 6 }];
}

/* ── Sheet 2: Detail WO ─────────────────────────────────────────────────── */

const KEPALA_DETAIL: { judul: string; px: number; warna: string; fmt?: string }[] = [
  { judul: 'No', px: 35, warna: AMBER },
  { judul: 'Nama Mekanik', px: 150, warna: AMBER },
  { judul: 'Jabatan', px: 110, warna: AMBER },
  { judul: 'Tgl Submit', px: 110, warna: AMBER },
  { judul: 'Tgl Approved', px: 110, warna: AMBER },
  { judul: 'WO Number', px: 120, warna: AMBER },
  { judul: 'Unit', px: 100, warna: AMBER },
  { judul: 'sub_component (field dan ws) - component name (tyreman)', px: 220, warna: AMBER },
  { judul: 'job_description (field dan ws) - category (tyreman)', px: 220, warna: AMBER },
  { judul: 'Kondisi', px: 85, warna: AMBER },
  { judul: 'Lokasi', px: 80, warna: AMBER },
  { judul: 'Start', px: 60, warna: AMBER },
  { judul: 'End', px: 60, warna: AMBER },
  { judul: 'Actual Hours', px: 85, warna: 'FF4B5563', fmt: '#,##0.##' },
  { judul: 'Base Pts', px: 70, warna: 'FFAD1457', fmt: '#,##0.##' },
  { judul: '×Unit', px: 55, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Kondisi', px: 65, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Waktu', px: 60, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Safety', px: 60, warna: 'FFAD1457', fmt: '0.0' },
  { judul: '×Redo', px: 60, warna: 'FFAD1457', fmt: '0.00' },
  { judul: 'WO Poin', px: 75, warna: COKELAT, fmt: '#,##0.##' },
  { judul: 'Poin Mekanik', px: 90, warna: COKELAT, fmt: '#,##0.##' },
  { judul: 'IDR (Rp)', px: 120, warna: COKELAT, fmt: '"Rp "#,##0' },
];

function detailWo(wb: ExcelJS.Workbook, d: HasilPayroll) {
  const ws = wb.addWorksheet('Detail WO');
  const kolom = KEPALA_DETAIL.length;

  ws.mergeCells(1, 1, 1, kolom);
  const j = ws.getCell('A1');
  j.value = `DETAIL WO PER MEKANIK — ${d.periodeLabel}`;
  j.font = { bold: true, size: 12, color: { argb: PUTIH } };
  j.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
  j.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.getCell('A2').value = `Dibuat: ${tglJam(d.dibuatAt)}`;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };
  /* Rumusnya ditulis di lembar kerjanya sendiri. Yang membaca berkas ini sering
     bukan yang membangun sistemnya, dan enam pengali tanpa keterangan terbaca
     sebagai angka yang muncul entah dari mana. */
  ws.getCell('A3').value =
    'Formula: Base Pts × Unit × Kondisi × Waktu × Safety × Redo = WO Poin → Poin Mekanik';
  ws.getCell('A3').font = { italic: true, color: { argb: COKELAT }, size: 9 };

  isiKepala(ws, 5, KEPALA_DETAIL.map((k) => k.judul), KEPALA_DETAIL.map((k) => k.warna));
  KEPALA_DETAIL.forEach((k, i) => { ws.getColumn(i + 1).width = lebar(k.px); });

  /* ZEBRA PER MEKANIK, bukan per baris. Satu orang bisa punya dua puluh WO;
     zebra per baris membuat batas antar ORANG hilang, padahal itu batas yang
     dicari mata saat memeriksa slip. */
  let mekanikSebelumnya: number | null = null;
  let warnaGenap = true;

  d.detail.forEach((x, i) => {
    if (x.mekanikId !== mekanikSebelumnya) {
      if (mekanikSebelumnya !== null) warnaGenap = !warnaGenap;
      mekanikSebelumnya = x.mekanikId;
    }
    const latar = warnaGenap ? 'FFF9FAFB' : 'FFF0F9FF';
    const r = ws.getRow(6 + i);
    const nilai: (string | number)[] = [
      i + 1, x.nama, x.jabatan, tgl(x.tglSubmit), tgl(x.tglApproved),
      x.woNumber, x.unitKode, x.komponen, x.deskripsi, x.kondisi, x.lokasi,
      jam(x.mulai), jam(x.selesai),
      x.actualHours, x.basePts, x.xUnit, x.xKondisi, x.xWaktu, x.xSafety,
      x.xRedo, x.woPoin, x.poinMekanik, x.idr,
    ];
    nilai.forEach((v, c) => {
      const sel = r.getCell(c + 1);
      sel.value = v;
      const fmt = KEPALA_DETAIL[c]?.fmt;
      if (fmt) sel.numFmt = fmt;
      sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: latar } };
    });

    /* Safety nol berarti SELURUH WO jadi nol. Kalau baris seperti ini sampai
       muncul di sini ia harus terlihat dari jauh — bukan karena cantik, tapi
       karena itu satu-satunya baris yang orangnya akan menanyakan. */
    if (x.xSafety === 0) {
      for (const c of [19, 21]) {
        const sel = r.getCell(c);
        sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        sel.font = { bold: true, color: { argb: 'FF991B1B' } };
      }
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 5 }];
}
