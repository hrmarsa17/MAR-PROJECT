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
/** Berkas produksi KMB V2 memakai Arial di seluruh sel. */
const HURUF = 'Arial';

const BLN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

/** "2026-08-16" → "16 Agt 2026". Kosong → "-". */
function tglIndo(ymd: string | null): string {
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '-';
  return `${d} ${BLN[m - 1]} ${y}`;
}

/**
 * "07:35" → pecahan hari Excel, supaya selnya jadi WAKTU sungguhan (format
 * `h:mm`) alih-alih teks.
 *
 * Bedanya terasa saat penerima berkas menyortir kolom Start: teks "9:05" duduk
 * sebelum "18:20" karena diurut sebagai huruf.
 */
function jamExcel(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60 + m) / 1440;
}

/**
 * Label kondisi DI SHEET DETAIL berbeda dari label di layar, dan itu apa adanya
 * di KMB V2: layar approval menulis "Shift 1 / Shift 2 / Kondisi Ekstrim"
 * sementara export payroll menulis "Ringan / Sedang / Berat"
 * (berkas produksi 91626_1202.xlsx, kolom Kondisi).
 *
 * Dua nama untuk satu hal memang membingungkan, tapi berkas gaji dibaca
 * berdampingan dengan berkas gaji bulan-bulan sebelumnya — dan mengubah
 * istilahnya sekarang membuat perbandingan antar bulan jadi pekerjaan
 * menerjemahkan. Diputuskan Gabriel: samakan dengan berkas yang sudah ada.
 */
function kondisiExport(kunci: string): string {
  return { normal: 'Ringan', difficult: 'Sedang', extreme: 'Berat' }[kunci] ?? kunci ?? '-';
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

/** "15 Sep 2026 23.59.58" — bentuk berkas produksi. */
function tglJam(t: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getDate()} ${BLN[t.getMonth()]} ${t.getFullYear()} `
       + `${p(t.getHours())}.${p(t.getMinutes())}.${p(t.getSeconds())}`;
}

function isiKepala(
  ws: ExcelJS.Worksheet, baris: number, judul: string[], warna: string[],
) {
  const r = ws.getRow(baris);
  judul.forEach((t, i) => {
    const sel = r.getCell(i + 1);
    sel.value = t;
    sel.font = { bold: true, color: { argb: PUTIH }, size: 10, name: HURUF };
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
  j.font = { bold: true, size: 14, color: { argb: PUTIH }, name: HURUF };
  j.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
  j.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.getCell('A2').value = `Periode: ${d.periodeLabel}`;
  ws.getCell('A2').font = { italic: true, color: { argb: COKELAT }, name: HURUF };
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

  // Lebar dalam satuan Excel, disalin dari berkas produksi 91626_1202.xlsx.
  // Bukan hasil konversi piksel: konversi px→karakter itu taksiran, dan
  // taksiran yang meleset membuat kolom Nama memotong nama orang.
  [5.13, 25.13, 15.13, 17.63, 15.13, 13.88, 12.63, 20.13].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  d.ringkas.forEach((m, i) => {
    const r = ws.getRow(7 + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = m.nama;
    /* GOLONGAN, bukan grade — berkas produksi menulis "advisor"/"junior"/
       "tyreman" di kolom ini, sementara sheet Detail menulis grade
       ("Mekanik Sr"). Sumbernya memang tidak konsisten, dan saya sempat
       menyeragamkannya jadi grade di keduanya.

       Dikembalikan karena berkas gaji dibandingkan antar bulan: kolom yang
       isinya berubah arti di tengah jalan membuat perbandingan itu gagal
       diam-diam. Catatan: golongan ini adalah kunci tarif, jadi ia memberi
       tahu pita gaji seseorang kepada siapa pun yang membuka berkasnya. */
    r.getCell(3).value = m.posisi;
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

/** Lebar & format disalin dari berkas produksi 91626_1202.xlsx. */
const KEPALA_DETAIL: { judul: string; w: number; warna: string; fmt?: string }[] = [
  { judul: 'No', w: 4.5, warna: AMBER },
  { judul: 'Nama Mekanik', w: 18.88, warna: AMBER },
  { judul: 'Jabatan', w: 13.88, warna: AMBER },
  { judul: 'Tgl Submit', w: 13.88, warna: AMBER },
  { judul: 'Tgl Approved', w: 13.88, warna: AMBER },
  { judul: 'WO Number', w: 15.13, warna: AMBER },
  { judul: 'Unit', w: 12.63, warna: AMBER },
  { judul: 'sub_component (field dan ws) - component name (tyreman)', w: 27.63, warna: AMBER },
  { judul: 'job_description (field dan ws) - category (tyreman)', w: 27.63, warna: AMBER },
  { judul: 'Kondisi', w: 10.75, warna: AMBER },
  { judul: 'Lokasi', w: 10.13, warna: AMBER },
  { judul: 'Start', w: 7.63, warna: AMBER, fmt: 'h:mm' },
  { judul: 'End', w: 7.63, warna: AMBER, fmt: 'h:mm' },
  { judul: 'Actual Hours', w: 10.75, warna: 'FF4B5563', fmt: '#,##0.##' },
  { judul: 'Base Pts', w: 8.88, warna: 'FFAD1457', fmt: '#,##0.##' },
  { judul: '×Unit', w: 7, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Kondisi', w: 8.25, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Waktu', w: 7.63, warna: 'FFAD1457', fmt: '0.00' },
  { judul: '×Safety', w: 7.63, warna: 'FFAD1457', fmt: '0.0' },
  { judul: '×Redo', w: 7.63, warna: 'FFAD1457', fmt: '0.00' },
  { judul: 'WO Poin', w: 9.5, warna: COKELAT, fmt: '#,##0.##' },
  { judul: 'Poin Mekanik', w: 11.38, warna: COKELAT, fmt: '#,##0.##' },
  { judul: 'IDR (Rp)', w: 15.13, warna: COKELAT, fmt: '"Rp "#,##0' },
];

function detailWo(wb: ExcelJS.Workbook, d: HasilPayroll) {
  const ws = wb.addWorksheet('Detail WO');
  const kolom = KEPALA_DETAIL.length;

  /* Digabung sampai kolom 26 walau datanya 23 — persis berkas produksi. Tiga
     kolom sisa itu ruang kosong yang membuat judulnya tidak berhenti tepat di
     tepi tabel. */
  ws.mergeCells(1, 1, 1, Math.max(kolom, 26));
  const j = ws.getCell('A1');
  j.value = `DETAIL WO PER MEKANIK — ${d.periodeLabel}`;
  j.font = { bold: true, size: 12, color: { argb: PUTIH }, name: HURUF };
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
  KEPALA_DETAIL.forEach((k, i) => { ws.getColumn(i + 1).width = k.w; });

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
    const nilai: (string | number | null)[] = [
      i + 1, x.nama, x.jabatan, tglIndo(x.tglSubmit), tglIndo(x.tglApproved),
      x.woNumber, x.unitKode, x.komponen, x.deskripsi,
      kondisiExport(x.kondisiKunci), x.lokasi,
      jamExcel(x.jamMulai), jamExcel(x.jamSelesai),
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
