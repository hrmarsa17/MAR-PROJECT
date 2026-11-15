/**
 * Penyusun XLSX untuk spreadsheet baru di memori (workers/bersama/gas-layanan.js, SpreadsheetApp.create), meniru
 * berkas dari https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx: nilai, format angka, huruf, latar,
 * garis, rata, gabungan sel, lebar kolom, dan baris beku. Dipakai payroll (PayrollService.gs generatePayrollReport),
 * yang di GAS mengambil XLSX itu lewat UrlFetchApp lalu mengirimkannya ke halaman sebagai base64.
 *
 * Acuannya berkas payroll asli hasil GAS. Kebiasaan ekspor Google yang ditiru:
 *   - huruf bawaan Arial 10, lebar kolom bawaan 100 px (12.63), tinggi baris bawaan 21 px (15.75);
 *   - lebar kolom = px / 8 + 0.13, dibulatkan ke bawah pada dua desimal (40 px → 5.13, 35 px → 4.5);
 *   - baris beku: pane ySplit, sel terpilih B<beku + 2>;
 *   - teks di string bersama (sharedStrings), sel kosong yang berformat tetap ditulis, sel di dalam gabungan
 *     selain kiri-atas tidak ditulis.
 * Yang sengaja tidak ditiru karena tidak terlihat: urutan indeks gaya, readingOrder, tema, dan bentuk angka "1.0".
 *
 * Kompresi memakai node:zlib (Worker: compatibility flag nodejs_compat), sinkron karena kode GAS sinkron.
 */
import { deflateRawSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
// Format angka bawaan Excel yang dipakai Google dengan nomor bawaannya (ekspor asli: "0.00" → 2, "h:mm" → 20).
const ANGKA_BAWAAN = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, 'h:mm': 20, 'h:mm:ss': 21, '@': 49 };

const KOLOM = [''];
function huruf(n) {
  if (KOLOM[n]) return KOLOM[n];
  let s = '', x = n;
  while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
  KOLOM[n] = s;
  return s;
}
function esc(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
// px / 8 + 0.13, dibulatkan KE BAWAH pada dua desimal (ekspor asli: 35 px → 4.5, 85 px → 10.75, 95 px → 12.0).
const lebarExcel = (px) => Math.floor(px * 12.5 + 13) / 100;

// ── Gaya ──────────────────────────────────────────────────────────────────
function susunGaya(daftarFormat, dipakai) {
  const angka = new Map();
  let angkaBaru = 164;
  const kumpulan = () => ({ isi: [], indeks: new Map() });
  const fonts = kumpulan(), fills = kumpulan(), borders = kumpulan();
  const daftar = (k, xml) => { if (!k.indeks.has(xml)) { k.indeks.set(xml, k.isi.length); k.isi.push(xml); } return k.indeks.get(xml); };
  const font = (f) => `<font>${f.tebal ? '<b/>' : ''}${f.miring ? '<i/>' : ''}<sz val="${f.ukuran || 10}"/><color rgb="FF${f.warna || '000000'}"/><name val="${escAttr(f.huruf || 'Arial')}"/><family val="2"/></font>`;
  daftar(fonts, font({}));
  daftar(fills, '<fill><patternFill patternType="none"/></fill>');
  daftar(fills, '<fill><patternFill patternType="gray125"/></fill>');
  daftar(borders, '<border><left/><right/><top/><bottom/><diagonal/></border>');
  const sisi = (nama, g) => {
    if (!g) return `<${nama}/>`;
    const [gaya, warna] = String(g).split(' ');
    return `<${nama} style="${gaya}"><color rgb="FF${warna || '000000'}"/></${nama}>`;
  };
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const peta = new Map([[0, 0]]);
  for (const id of dipakai) {
    if (peta.has(id)) continue;
    const f = daftarFormat[id] || {};
    let nf = 0;
    if (f.angka !== undefined && f.angka !== null && f.angka !== '') {
      if (Object.prototype.hasOwnProperty.call(ANGKA_BAWAAN, f.angka)) nf = ANGKA_BAWAAN[f.angka];
      else { if (!angka.has(f.angka)) angka.set(f.angka, angkaBaru++); nf = angka.get(f.angka); }
    }
    const fo = daftar(fonts, font(f));
    const fi = f.latar ? daftar(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${f.latar}"/><bgColor rgb="FF${f.latar}"/></patternFill></fill>`) : 0;
    const bo = f.gK || f.gN || f.gA || f.gB ? daftar(borders, `<border>${sisi('left', f.gK)}${sisi('right', f.gN)}${sisi('top', f.gA)}${sisi('bottom', f.gB)}<diagonal/></border>`) : 0;
    const rata = [];
    if (f.rataH) rata.push(`horizontal="${f.rataH}"`);
    if (f.rataV) rata.push(`vertical="${f.rataV}"`);
    if (f.bungkus !== undefined) rata.push(`wrapText="${f.bungkus ? 1 : 0}"`);
    const al = rata.length ? `<alignment ${rata.join(' ')}/>` : '';
    const atribut = `numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"`
      + (nf ? ' applyNumberFormat="1"' : '') + (fo ? ' applyFont="1"' : '') + (fi ? ' applyFill="1"' : '')
      + (bo ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"' : '');
    peta.set(id, xfs.length);
    xfs.push(al ? `<xf ${atribut}>${al}</xf>` : `<xf ${atribut}/>`);
  }
  const numFmts = angka.size ? `<numFmts count="${angka.size}">${[...angka].map(([kode, n]) => `<numFmt numFmtId="${n}" formatCode="${escAttr(kode)}"/>`).join('')}</numFmts>` : '';
  const xml = `${XML}<styleSheet xmlns="${NS}">${numFmts}`
    + `<fonts count="${fonts.isi.length}">${fonts.isi.join('')}</fonts>`
    + `<fills count="${fills.isi.length}">${fills.isi.join('')}</fills>`
    + `<borders count="${borders.isi.length}">${borders.isi.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>';
  return { xml, peta };
}

// ── Lembar ────────────────────────────────────────────────────────────────
function formatDipakai(lembar) {
  const s = new Set();
  for (const l of lembar) for (const r of l.format) if (r) for (const id of r) if (id) s.add(id);
  return s;
}

function susunLembar(l, sst, peta) {
  const potong = [];
  const lewati = (b, k) => {
    for (const g of l.gabung) if (b >= g.b && b < g.b + g.nb && k >= g.k && k < g.k + g.nk) return b !== g.b || k !== g.k;
    return false;
  };
  const ada = l.gabung.length > 0;
  let kepala = `${XML}<worksheet xmlns="${NS}" xmlns:r="${NS_R}"><sheetPr><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>`;
  const bB = Number(l.bekuB) || 0, bK = Number(l.bekuK) || 0;
  if (bB || bK) {
    const kiriAtas = huruf(bK + 1) + (bB + 1);
    const panel = bB && bK ? 'bottomRight' : bB ? 'bottomLeft' : 'topRight';
    const pilih = huruf(bK + 2) + (bB + 2);
    kepala += `<sheetViews><sheetView workbookViewId="0"><pane${bK ? ` xSplit="${bK}"` : ''}${bB ? ` ySplit="${bB}"` : ''} topLeftCell="${kiriAtas}" activePane="${panel}" state="frozen"/>`
      + `<selection activeCell="${pilih}" sqref="${pilih}" pane="${panel}"/></sheetView></sheetViews>`;
  } else {
    kepala += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  }
  kepala += '<sheetFormatPr customHeight="1" defaultColWidth="12.63" defaultRowHeight="15.75"/>';
  const kolom = Object.keys(l.lebar || {}).map(Number).filter((k) => k >= 1).sort((a, b) => a - b);
  if (kolom.length) {
    const kel = [];
    for (const k of kolom) {
      const w = lebarExcel(Number(l.lebar[k]));
      const akhir = kel[kel.length - 1];
      if (akhir && akhir.max === k - 1 && akhir.w === w) akhir.max = k; else kel.push({ min: k, max: k, w });
    }
    kepala += `<cols>${kel.map((x) => `<col customWidth="1" min="${x.min}" max="${x.max}" width="${x.w}"/>`).join('')}</cols>`;
  }
  potong.push(kepala, '<sheetData>');
  const nBaris = Math.max(l.nilai.length, l.format.length);
  for (let b = 1; b <= nBaris; b++) {
    const v = l.nilai[b - 1] || [], f = l.format[b - 1] || [];
    const n = Math.max(v.length, f.length);
    let isi = '';
    for (let k = 1; k <= n; k++) {
      const x = v[k - 1], fid = f[k - 1] || 0;
      const kosong = x === null || x === undefined || x === '';
      if (kosong && !fid) continue;
      if (ada && lewati(b, k)) continue;
      const s = peta.get(fid) || 0;
      const atr = `r="${huruf(k)}${b}"${s ? ` s="${s}"` : ''}`;
      if (kosong) isi += `<c ${atr}/>`;
      else if (typeof x === 'number') isi += Number.isFinite(x) ? `<c ${atr}><v>${x}</v></c>` : `<c ${atr} t="e"><v>#NUM!</v></c>`;
      else if (typeof x === 'boolean') isi += `<c ${atr} t="b"><v>${x ? 1 : 0}</v></c>`;
      else isi += `<c ${atr} t="s"><v>${sst(String(x))}</v></c>`;
    }
    const tinggi = l.tinggi && l.tinggi[b] ? ` ht="${Math.round(Number(l.tinggi[b]) * 0.75 * 100) / 100}" customHeight="1"` : '';
    if (isi) potong.push(`<row r="${b}"${tinggi}>${isi}</row>`);
  }
  potong.push('</sheetData>');
  if (l.gabung.length) {
    potong.push(`<mergeCells count="${l.gabung.length}">${l.gabung.map((g) => `<mergeCell ref="${huruf(g.k)}${g.b}:${huruf(g.k + g.nk - 1)}${g.b + g.nb - 1}"/>`).join('')}</mergeCells>`);
  }
  potong.push('</worksheet>');
  return potong;
}

// ── ZIP ───────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function waktuDos(d) {
  return {
    waktu: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    tanggal: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}
function zip(berkas) {
  const { waktu, tanggal } = waktuDos(new Date());
  const lokal = [], pusat = [];
  let offset = 0;
  for (const { nama, isi } of berkas) {
    const data = Buffer.isBuffer(isi) ? isi : Buffer.from(isi, 'utf8');
    const padat = deflateRawSync(data);
    const n = Buffer.from(nama, 'utf8');
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(waktu, 10); h.writeUInt16LE(tanggal, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(padat.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(waktu, 12); c.writeUInt16LE(tanggal, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(padat.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    lokal.push(h, n, padat);
    pusat.push(c, n);
    offset += 30 + n.length + padat.length;
  }
  const ukuranPusat = pusat.reduce((s, b) => s + b.length, 0);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(0, 4); e.writeUInt16LE(0, 6);
  e.writeUInt16LE(berkas.length, 8); e.writeUInt16LE(berkas.length, 10);
  e.writeUInt32LE(ukuranPusat, 12); e.writeUInt32LE(offset, 16); e.writeUInt16LE(0, 20);
  return Buffer.concat([...lokal, ...pusat, e]);
}

/**
 * @param model { judul, format: [objek format per nomor], lembar: [{ nama, nilai: [[...]], format: [[nomor]],
 *              gabung: [{ b, k, nb, nk }], lebar: { kolom: px }, tinggi: { baris: px }, bekuB, bekuK }] }
 * @returns Buffer berkas XLSX
 */
export function susunXlsx(model) {
  const lembar = [...model.lembar];
  const { xml: gaya, peta } = susunGaya(model.format, formatDipakai(lembar));
  const indeks = new Map(), teks = [];
  let rujukan = 0;
  const sst = (s) => {
    rujukan++;
    let i = indeks.get(s);
    if (i === undefined) { i = teks.length; indeks.set(s, i); teks.push(s); }
    return i;
  };
  const berkasLembar = lembar.map((l, i) => ({ nama: `xl/worksheets/sheet${i + 1}.xml`, isi: Buffer.from(susunLembar(l, sst, peta).join(''), 'utf8') }));
  const sharedStrings = `${XML}<sst xmlns="${NS}" count="${rujukan}" uniqueCount="${teks.length}">`
    + teks.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${esc(s)}</t></si>`).join('') + '</sst>';
  const workbook = `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><workbookPr/><sheets>`
    + lembar.map((l, i) => `<sheet state="visible" name="${escAttr(l.nama)}" sheetId="${i + 1}" r:id="rId${i + 3}"/>`).join('')
    + '</sheets><definedNames/><calcPr/></workbook>';
  const relWorkbook = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
    + lembar.map((_, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + '</Relationships>';
  const jenis = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + lembar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>';
  const relAkar = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  return zip([
    { nama: '[Content_Types].xml', isi: jenis },
    { nama: '_rels/.rels', isi: relAkar },
    { nama: 'xl/workbook.xml', isi: workbook },
    { nama: 'xl/_rels/workbook.xml.rels', isi: relWorkbook },
    { nama: 'xl/styles.xml', isi: gaya },
    { nama: 'xl/sharedStrings.xml', isi: sharedStrings },
    ...berkasLembar,
  ]);
}
