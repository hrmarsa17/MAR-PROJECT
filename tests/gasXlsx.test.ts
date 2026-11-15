import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
// Modul JS bersama Worker rumah dan uji kembar; JSDoc-nya bukan anotasi tipe, jadi dipakai sebagai any.
import * as modLayanan from '../workers/bersama/gas-layanan.js';
import * as modHost from '../workers/bersama/gas-host.js';

const { buatLayanan } = modLayanan as any;
const { buatHost } = modHost as any;

/**
 * PAYROLL XLSX DARI ABADIOPS (keputusan Gabriel 15 Nov 2026: "XLSX langsung dari abadiops").
 *
 * Di GAS, generatePayrollReport membuat spreadsheet baru, mengisinya, lalu mengambil XLSX-nya dari alamat
 * ekspor docs.google.com. Di Worker, spreadsheet itu hidup di memori (workers/bersama/gas-layanan.js) dan
 * XLSX-nya disusun workers/bersama/xlsx.js. Perilaku yang diuji di sini DIAMBIL DARI BERKAS PAYROLL ASLI
 * hasil GAS (ekspor Google, Sep–Okt 2026), bukan dari dugaan:
 *   - Google mengurai teks seperti ketikan di lokal en_US: "28 Sep 2026" jadi tanggal, "05 Okt 2026" tetap teks.
 *   - gabungan A1:AA1 di kisi 26 kolom tersimpan A1:Z1; kolom yang lahir belakangan mewarisi format kolom Z.
 *   - lebar kolom px/8 + 0.13, dibulatkan ke bawah (35 px → 4.5).
 * Uji 15 Nov 2026 dengan data cermin: payroll KMB V2 (13.724 baris) dan KMB Projek identik sel demi sel dengan
 * berkas GAS untuk periode yang sama, kecuali stempel "Dibuat:".
 */

type Layanan = Record<string, any>;

function layanan(): Layanan {
  return buatLayanan({ zonaSkrip: 'Asia/Jakarta', sheets: {}, dilewati: [] }, buatHost());
}

async function ambilXlsx(L: Layanan, ss: any) {
  const id = ss.getId();
  const resp = L.UrlFetchApp.fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&id=${id}`,
    { headers: { Authorization: 'Bearer ' + L.ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  expect(resp.getResponseCode()).toBe(200);
  const bytes = resp.getBlob().getBytes();
  const b64 = L.Utilities.base64Encode(bytes);
  const buf = Buffer.from(b64, 'base64');
  expect(buf.length).toBe(bytes.length);
  // Byte bertanda seperti Byte[] GAS; isinya sama dengan base64 yang dikirim ke halaman.
  expect(bytes.slice(0, 4)).toEqual([80, 75, 3, 4]);
  expect(bytes.every((x: number, i: number) => (x & 255) === buf[i])).toBe(true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return { wb, buf };
}

describe('spreadsheet baru di memori → XLSX', () => {
  it('mengurai teks seperti Google (lokal en_US) dan memasang format tampilan yang sama', async () => {
    const L = layanan();
    const ss = L.SpreadsheetApp.create('Payroll_uji');
    const sh = ss.getActiveSheet();
    sh.setName('Ringkasan');
    sh.getRange(7, 1, 1, 9).setValues([['28 Sep 2026', '05 Okt 2026', '07:00', '06 Jul 2026 17:52', '22 Jul 2026', '398', 'TRUE', "'007", 'MNT-005']]);
    const { wb } = await ambilXlsx(L, ss);
    const ws = wb.getWorksheet('Ringkasan')!;
    const c = (a: string) => ws.getCell(a);
    expect(c('A7').value).toEqual(new Date(Date.UTC(2026, 8, 28)));
    expect(c('A7').numFmt).toBe('d mmm yyyy');
    expect(c('B7').value).toBe('05 Okt 2026');               // bulan Indonesia: tetap teks, seperti di GAS
    expect(c('C7').numFmt).toBe('h:mm');
    expect(c('C7').value).toEqual(new Date(Date.UTC(1899, 11, 30, 7, 0)));
    expect(c('D7').numFmt).toBe('dd mmm yyyy h:mm');          // nol di depan hari → "dd"
    expect(c('D7').value).toEqual(new Date(Date.UTC(2026, 6, 6, 17, 52)));
    expect(c('E7').numFmt).toBe('d mmm yyyy');
    expect(c('F7').value).toBe(398);
    expect(c('G7').value).toBe(true);
    expect(c('H7').value).toBe('007');                        // apostrof di depan: teks apa adanya
    expect(c('I7').value).toBe('MNT-005');
  });

  it('menulis Date sebagai jam dinding zona skrip (Asia/Jakarta)', async () => {
    const L = layanan();
    const ss = L.SpreadsheetApp.create('x');
    const sh = ss.getActiveSheet();
    sh.getRange(1, 1).setValue(new L.Date(Date.UTC(2026, 6, 6, 6, 15)));   // 06:15Z = 13:15 WIB
    sh.getRange(1, 1).setNumberFormat('hh:mm');
    const { wb } = await ambilXlsx(L, ss);
    const cel = wb.worksheets[0]!.getCell('A1');
    expect(cel.numFmt).toBe('hh:mm');
    expect(cel.value).toEqual(new Date(Date.UTC(2026, 6, 6, 13, 15)));
  });

  it('meniru format payroll: gabungan, kisi 26 kolom yang meluas, garis, latar, lebar, baris beku', async () => {
    const L = layanan();
    const ss = L.SpreadsheetApp.create('Payroll_uji');
    const s1 = ss.getActiveSheet();
    s1.setName('Ringkasan');
    s1.getRange('A1').setValue('LAPORAN PAYROLL INSENTIF MEKANIK');
    s1.getRange('A1:H1').merge();
    s1.getRange('A1').setFontSize(14).setFontWeight('bold').setBackground('#f59e0b').setFontColor('white').setHorizontalAlignment('center');
    s1.getRange('A2').setValue('Periode: x').setFontStyle('italic').setFontColor('#b45309 ');   // spasi di ujung, seperti PayrollService
    s1.getRange(6, 1, 1, 3).setValues([['No', 'Nama', 'IDR']])
      .setFontWeight('bold').setBackground('#f59e0b').setFontColor('white').setBorder(true, true, true, true, true, true);
    const data = s1.getRange(7, 1, 2, 3);
    data.setValues([[1, 'A', 82500], [2, 'B', 1500]]);
    data.setBackgrounds([['#f8fafc', '#f8fafc', '#f8fafc'], ['#ffffff', '#ffffff', '#ffffff']]);
    data.setBorder(null, true, null, true, true, null, '#e5e7eb', L.SpreadsheetApp.BorderStyle.SOLID);
    s1.getRange(7, 3, 2, 1).setNumberFormat('"Rp "#,##0');
    s1.setColumnWidth(1, 40); s1.setColumnWidth(2, 35); s1.setFrozenRows(6);

    // SUM: judul digabung ke kolom 29 sebelum kisi meluas, lalu 29 judul kolom ditulis.
    const s2 = ss.insertSheet('Detail WO');
    s2.getRange('A1').setValue('DETAIL');
    s2.getRange(1, 1, 1, 29).merge();
    s2.getRange('A1').setBackground('#1e40af');
    s2.getRange(5, 1, 1, 29).setValues([Array.from({ length: 29 }, (_, i) => 'K' + (i + 1))]);
    const safety = s2.getRange(6, 26, 1, 2).getA1Notation();
    expect(safety).toBe('Z6:AA6');

    const { wb } = await ambilXlsx(L, ss);
    const r = wb.getWorksheet('Ringkasan')!;
    expect(r.model.merges).toEqual(['A1:H1']);
    expect(r.getCell('A1').font).toMatchObject({ bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Arial' });
    expect(r.getCell('A1').fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FFF59E0B' } });
    expect(r.getCell('A1').alignment).toMatchObject({ horizontal: 'center' });
    expect(r.getCell('A2').font).toMatchObject({ italic: true, color: { argb: 'FFB45309' } });
    const garisHitam = { style: 'thin', color: { argb: 'FF000000' } };
    expect(r.getCell('B6').border).toEqual({ top: garisHitam, left: garisHitam, bottom: garisHitam, right: garisHitam });
    const garisAbu = { style: 'thin', color: { argb: 'FFE5E7EB' } };
    expect(r.getCell('B7').border).toEqual({ left: garisAbu, right: garisAbu });      // tanpa atas/bawah, seperti ekspor asli
    expect(r.getCell('C8').numFmt).toBe('"Rp "#,##0');
    expect(r.getCell('A8').fill).toMatchObject({ fgColor: { argb: 'FFFFFFFF' } });
    expect(r.getColumn(1).width).toBe(5.13);
    expect(r.getColumn(2).width).toBe(4.5);                    // dibulatkan ke bawah, bukan 4.51
    expect(r.views[0]).toMatchObject({ state: 'frozen', ySplit: 6, topLeftCell: 'A7', activeCell: 'B8' });

    const d = wb.getWorksheet('Detail WO')!;
    expect(d.model.merges).toEqual(['A1:Z1']);                 // gabungan berhenti di batas kisi saat itu
    expect(d.getCell('AC5').value).toBe('K29');                // menulis di luar kisi memperluas kisi
    expect(d.getCell('AA1').fill).toMatchObject({ fgColor: { argb: 'FF1E40AF' } });   // mewarisi kolom Z (bagian gabungan A1)
    expect(d.getCell('AA2').fill).toBeUndefined();
  });

  it('setValues menolak ukuran data yang tidak cocok, seperti GAS', () => {
    const L = layanan();
    const sh = L.SpreadsheetApp.create('x').getActiveSheet();
    expect(() => sh.getRange(1, 1, 2, 2).setValues([[1, 2]])).toThrow(/number of rows in the data does not match/);
    expect(() => sh.getRange(1, 1, 1, 2).setValues([[1]])).toThrow(/number of columns in the data does not match/);
  });
});

describe('batas jalur Google tiruan', () => {
  it('hanya melayani spreadsheet baru di memori, tidak menulis ke cermin', async () => {
    const L = layanan();
    const ss = L.SpreadsheetApp.create('Payroll_uji');
    ss.getActiveSheet().getRange('A1').setValue('x');
    const folder = L.DriveApp.getFoldersByName('Payroll_V2_KMB');
    expect(folder.hasNext()).toBe(true);
    L.DriveApp.getFileById(ss.getId()).moveTo(folder.next());
    L.DriveApp.getFileById(ss.getId()).addViewer('orang@contoh.test');
    await ambilXlsx(L, ss);
    expect(() => L.UrlFetchApp.fetch('https://contoh.test/push')).toThrow(/tidak tersedia/);
    expect(() => L.UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/gas-lokal/export?format=xlsx')).toThrow(/tidak tersedia/);
    expect(() => L.DriveApp.getFileById('gas-lokal')).toThrow(/tidak tersedia/);
    expect(() => L.DriveApp.searchFiles('x')).toThrow(/tidak tersedia/);
    expect(L.__CATAT.tulis).toEqual([]);
    expect(L.__ekspor()).toEqual({});
    expect(L.__CATAT.tak_dikenal).toEqual([]);
  });

  it('rumus yang ditulis sebagai teks dicatat, tidak diam-diam', () => {
    const L = layanan();
    L.SpreadsheetApp.create('x').getActiveSheet().getRange('A1').setValue('=SUM(A2:A3)');
    expect(L.__CATAT.tak_dikenal.join()).toMatch(/rumus/);
  });
});
