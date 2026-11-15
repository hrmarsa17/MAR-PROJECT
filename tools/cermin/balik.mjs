#!/usr/bin/env node
/**
 * Cermin balik: Supabase (skema satu rumah) → spreadsheet rumah itu. Kebalikan tools/cermin/sinkron.mjs, dipakai
 * SETELAH jam mulai migrasi (docs/SAKLAR.md): jalur Supabase satu-satunya penulis, dan spreadsheet disalin dari
 * cermin berkala supaya "Kembali ke GAS" bisa membuka GAS lagi tanpa kehilangan data.
 *
 * Cermin bersifat posisional (baris sheet = kolom `baris`), sama seperti public.cermin_tulis menyimpannya: baris
 * yang ditulis jalur Supabase mendapat sinkron_at baru, baris yang dihapus (deleteRow) membuat jumlah_baris turun.
 * Maka yang disalin:
 *   - bawaan: hanya baris yang sinkron_at-nya lebih baru dari penanda sheet itu di <skema>.cermin_balik, ditambah
 *     baris judul bila berubah, dan baris di bawah jumlah_baris yang baru dikosongkan;
 *   - --penuh: seluruh sheet dibaca dari spreadsheet dan setiap baris yang berbeda ditulis (dipakai pertama kali,
 *     dan bila --periksa menemukan selisih). Penanda dan pola format tanggal per kolom dicatat di sini.
 * Tulisan ke penanda per sheet aman tanpa kunci tambahan: tulisan ke satu sheet di cermin_tulis berurutan (versi
 * sinkron_at + FOR UPDATE), dan baris setiap tulisan yang sukses bertanda waktu SESUDAH sinkron_at judul sheet
 * tulisan sebelumnya. Jadi penanda = cermin_header.sinkron_at yang terakhir tersalin.
 *
 * Cara menulis (spreadsheets.batchUpdate updateCells), supaya dibaca ulang sama persis oleh sinkron.mjs:
 *   teks → stringValue (tidak diurai), angka → numberValue, boolean → boolValue, sel kosong → nilai dihapus,
 *   tanggal (teks ISO di kolom bertipe tanggal, aturan yang sama dengan Worker) → nomor seri jam dinding zona
 *   spreadsheet + format tanggal kolom itu (pola terbanyak di kolom, dicatat saat --penuh),
 *   angka di kolom bertipe tanggal → format angka dikembalikan ke otomatis (supaya tidak terbaca tanggal),
 *   sel berumus (<skema>.cermin_rumus) → formulaValue: rumusnya ditulis, spreadsheet menghitung sendiri.
 * Format lain (warna, format angka non-tanggal, validasi) tidak disentuh.
 *
 * Pengaman:
 *   - Tanpa --tulis alat hanya menghitung (kering): tidak ada yang ditulis ke spreadsheet maupun penanda.
 *   - Spreadsheet ASLI rumah hanya ditulis bila izin tulis jalur Supabase rumah itu terbuka (public.cermin_izin_tulis,
 *     dibuka prosedur "Mulai migrasi"). Sebelum jam mulai yang boleh hanya --sasaran=<ID salinan> (latihan).
 *   - Skema uji_* wajib --sasaran, dan sasaran tidak boleh spreadsheet asli rumah mana pun.
 *   - Satu putaran per skema pada satu waktu (pg_try_advisory_lock).
 *
 * Variabel lingkungan:
 *   GOOGLE_SA_KEY_FILE       kunci akun layanan; untuk --tulis akun itu harus Editor di spreadsheet sasaran
 *   <SKEMA>_SPREADSHEET_ID   spreadsheet asli rumah, sama dengan sinkron.mjs (KMBBUPR_, KMB_PROJEK_, KMB_, SUM_)
 *   DATABASE_URL             koneksi Postgres gedung cermin
 *
 * Opsi:
 *   --skema=kmbbupr | --semua   rumah (atau skema uji_* dengan --sasaran)
 *   --sasaran=<ID>              tulis ke spreadsheet lain (latihan pada salinan)
 *   --tulis                     benar-benar menulis
 *   --penuh                     bandingkan seluruh sheet (lihat di atas)
 *   --periksa                   sesudah menulis, baca ulang seluruh spreadsheet dan bandingkan; selisih > 0 = GAGAL
 *   --sheet=Nama                satu sheet saja
 *   --ringkas                   untuk log publik GitHub Actions: tanpa judul, ID, atau nama sheet yang lulus
 */
import { pathToFileURL } from 'node:url';
import {
  CAKUPAN_BACA, CAKUPAN_TULIS, aksesToken, gapi, rapikan, isoKeSeri, BARIS_PER_AMBIL,
} from './google.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const POLA_TANGGAL_BAWAAN = { type: 'DATE_TIME', pattern: 'M/d/yyyy H:mm:ss' };
const BARIS_PER_TULIS = 1000;

const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));

function wajib(nama) {
  const v = process.env[nama];
  if (!v) throw new Error(`${nama} belum diisi. Lihat kepala berkas tools/cermin/balik.mjs.`);
  return v;
}
const idDisamarkan = new Set();
const samarkan = (pesan) => (arg.ringkas ? [...idDisamarkan].reduce((p, id) => p.split(id).join('<id>'), String(pesan)) : String(pesan));
const huruf = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Spreadsheet asli semua rumah di lingkungan: sasaran latihan tidak boleh salah satunya.
const ASLI = Object.fromEntries(Object.entries(process.env)
  .map(([k, v]) => [k.match(/^([A-Z][A-Z0-9_]*)_SPREADSHEET_ID$/), v]).filter(([m, v]) => m && v).map(([m, v]) => [m[1].toLowerCase(), v]));

// ── Database ──────────────────────────────────────────────────────────────
async function siapkanPenanda(sql, skema) {
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_balik')} (
    sheet        text PRIMARY KEY,
    sasaran      text NOT NULL,
    sinkron_at   timestamptz NOT NULL,
    jumlah_baris integer NOT NULL,
    headers      text[] NOT NULL,
    pola         jsonb NOT NULL DEFAULT '{}'::jsonb,
    diubah_at    timestamptz NOT NULL DEFAULT now()
  )`;
}

// Isi cermin satu sheet dalam satu potret (REPEATABLE READ): judul, tipe, jumlah baris, versi, dan baris
// (semua, atau hanya yang berubah sejak `sejak`). Rumus sel: <skema>.cermin_rumus.
async function bacaCermin(sql, skema, sheet, sejak) {
  return sql.begin('isolation level repeatable read read only', async (tx) => {
    const [h] = await tx`SELECT tabel, headers, tipe, jumlah_baris, sinkron_at::text AS versi FROM ${tx(skema + '.cermin_header')} WHERE sheet = ${sheet}`;
    if (!h) throw new Error('tidak ada di cermin_header');
    const baris = sejak
      ? await tx`SELECT baris, nilai FROM ${tx(skema + '.' + h.tabel)} WHERE sinkron_at > ${sejak}::timestamptz ORDER BY baris`
      : await tx`SELECT baris, nilai FROM ${tx(skema + '.' + h.tabel)} ORDER BY baris`;
    const [ada] = await tx`SELECT to_regclass(${skema + '.cermin_rumus'}) IS NOT NULL AS ada`;
    const rumus = ada.ada ? await tx`SELECT baris, kolom, rumus FROM ${tx(skema + '.cermin_rumus')} WHERE sheet = ${sheet}` : [];
    return { ...h, baris, rumus };
  });
}

// ── Spreadsheet ───────────────────────────────────────────────────────────
async function metaSpreadsheet(id, token) {
  const m = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}`
    + '?fields=properties(title,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))', token);
  return {
    judul: m.properties.title, zona: m.properties.timeZone,
    sheet: new Map(m.sheets.map((s) => [s.properties.title, { id: s.properties.sheetId, baris: s.properties.gridProperties.rowCount, kolom: s.properties.gridProperties.columnCount }])),
  };
}

// Sel mentah baris dari..sampai (1-based), dengan nilai dan format angka.
async function bacaMentah(id, judul, dari, sampai, token) {
  const out = [];
  for (let mulai = dari; mulai <= sampai; mulai += BARIS_PER_AMBIL) {
    const akhir = Math.min(mulai + BARIS_PER_AMBIL - 1, sampai);
    const range = encodeURIComponent(`'${judul.replace(/'/g, "''")}'!${mulai}:${akhir}`);
    const j = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}?ranges=${range}&includeGridData=true`
      + '&fields=sheets(data(rowData(values(effectiveValue,effectiveFormat/numberFormat))))', token);
    const rd = (j.sheets && j.sheets[0] && j.sheets[0].data && j.sheets[0].data[0] && j.sheets[0].data[0].rowData) || [];
    for (let i = 0; i < akhir - mulai + 1; i++) out.push((rd[i] && rd[i].values) || []);
  }
  return out;
}

// Pola format tanggal terbanyak per kolom (dari sel bernilai tanggal), dipakai untuk sel tanggal yang ditulis.
function polaKolom(mentah, ncol) {
  const hitung = Array.from({ length: ncol }, () => new Map());
  for (const r of mentah.slice(1)) {
    for (let j = 0; j < ncol; j++) {
      const f = r[j] && r[j].effectiveFormat && r[j].effectiveFormat.numberFormat;
      if (!f || !/^(DATE|DATE_TIME|TIME)$/.test(f.type) || !(r[j].effectiveValue && 'numberValue' in r[j].effectiveValue)) continue;
      const k = JSON.stringify({ type: f.type, pattern: f.pattern || '' });
      hitung[j].set(k, (hitung[j].get(k) || 0) + 1);
    }
  }
  const pola = {};
  hitung.forEach((m, j) => { if (m.size) pola[j] = JSON.parse([...m].sort((a, b) => b[1] - a[1])[0][0]); });
  return pola;
}

// ── Menyusun tulisan ──────────────────────────────────────────────────────
// Kolom bertipe tanggal (aturan Worker, gas-layanan.js barisDariCermin): tipe kolom memuat "tanggal".
const kolomTanggal = (headers, tipe) => headers.map((h) => String((tipe || {})[h] || '').includes('tanggal'));

function selNilai(x, tanggal, zona) {
  if (x === '' || x === null || x === undefined) return {};
  if (typeof x === 'boolean') return { userEnteredValue: { boolValue: x } };
  if (typeof x === 'number') return { userEnteredValue: { numberValue: x } };
  if (tanggal && typeof x === 'string' && ISO.test(x)) return { userEnteredValue: { numberValue: isoKeSeri(x, zona) } };
  return { userEnteredValue: { stringValue: String(x) } };
}
// Aksi format angka untuk sel di kolom tanggal: 'tgl' pasang pola tanggal, 'otomatis' kembalikan ke otomatis, null biarkan.
function aksiFormat(x, tanggal) {
  if (!tanggal || x === '' || x === null || x === undefined) return null;
  if (typeof x === 'string' && ISO.test(x)) return 'tgl';
  if (typeof x === 'number') return 'otomatis';
  return null;
}

// Baris yang ditulis → permintaan batchUpdate. tulis: Map(baris sheet 1-based → larik nilai). Baris 1 = judul.
function susunPermintaan(sheetId, tulis, ncol, kolomTgl, pola, rumus, zona) {
  const rumusDi = new Map(rumus.map((r) => [`${r.baris}:${r.kolom}`, r.rumus]));
  const nomor = [...tulis.keys()].sort((a, b) => a - b);
  const blok = [];
  for (const n of nomor) {
    const b = blok[blok.length - 1];
    if (b && n - b.akhir <= 1) b.akhir = n; else blok.push({ awal: n, akhir: n });
  }
  const minta = [];
  for (const { awal, akhir } of blok) {
    for (let a = awal; a <= akhir; a += BARIS_PER_TULIS) {
      const z = Math.min(akhir, a + BARIS_PER_TULIS - 1);
      const rows = [];
      for (let n = a; n <= z; n++) {
        const v = tulis.get(n) || [];
        const values = [];
        for (let j = 0; j < ncol; j++) {
          const f = rumusDi.get(`${n}:${j}`);
          values.push(f ? { userEnteredValue: { formulaValue: f } } : selNilai(v[j], n > 1 && kolomTgl[j], zona));
        }
        rows.push({ values });
      }
      minta.push({ updateCells: { range: { sheetId, startRowIndex: a - 1, endRowIndex: z, startColumnIndex: 0, endColumnIndex: ncol }, rows, fields: 'userEnteredValue' } });
      // Format angka kolom tanggal, per deret baris dengan aksi yang sama (sel lain tidak disentuh).
      for (let j = 0; j < ncol; j++) {
        if (!kolomTgl[j]) continue;
        let mulai = null, aksi = null;
        const tutup = (sampai) => {
          if (aksi === null || mulai === null) return;
          const jumlah = sampai - mulai + 1;
          const isi = aksi === 'tgl' ? { userEnteredFormat: { numberFormat: pola[j] || POLA_TANGGAL_BAWAAN } } : {};
          minta.push({ updateCells: { range: { sheetId, startRowIndex: mulai - 1, endRowIndex: sampai, startColumnIndex: j, endColumnIndex: j + 1 },
            rows: Array.from({ length: jumlah }, () => ({ values: [isi] })), fields: 'userEnteredFormat.numberFormat' } });
        };
        for (let n = a; n <= z; n++) {
          const x = n === 1 ? null : aksiFormat((tulis.get(n) || [])[j], true);
          if (x !== aksi) { tutup(n - 1); mulai = n; aksi = x; }
        }
        tutup(z);
      }
    }
  }
  return minta;
}

// ── Rencana tulisan satu sheet (tanpa I/O; diuji di tests/cerminBalik.test.ts) ─
//   grid    { id, baris, kolom } sheet sasaran
//   c       isi cermin { headers, tipe, jumlah_baris, baris: [{ baris, nilai }], rumus: [{ baris, kolom, rumus }] }
//   lalu    penanda sebelumnya { jumlah_baris, headers, pola } untuk mode bertahap (c.baris = baris yang berubah
//           saja), atau null untuk mode penuh (c.baris = semua baris, mentah = isi spreadsheet sasaran)
export function rencanaSheet({ grid, c, lalu, mentah, zona }) {
  const headers = c.headers;
  const tulis = new Map();
  let ncol, pola, jumlahLama;
  if (!lalu) {
    // Bandingkan seluruh sheet: tulis setiap baris yang berbeda dari isi spreadsheet.
    const kini = rapikan(mentah, zona);
    ncol = Math.max(headers.length, kini.headers.length);
    pola = polaKolom(mentah, ncol);
    jumlahLama = kini.rows.length;
    if (!sama(kini.headers, headers)) tulis.set(1, headers);
    const cermin = new Map(c.baris.map((r) => [r.baris, r.nilai]));
    const pad = (v) => { const o = (v || []).slice(0, ncol); while (o.length < ncol) o.push(''); return o; };
    for (let n = 2; n <= c.jumlah_baris + 1; n++) {
      const v = cermin.get(n) || [];
      const s = kini.rows[n - 2] ? kini.rows[n - 2].nilai : [];
      if (!sama(pad(v), pad(s))) tulis.set(n, v);
    }
  } else {
    ncol = Math.max(headers.length, lalu.headers.length);
    pola = lalu.pola || {};
    jumlahLama = lalu.jumlah_baris;
    if (!sama(lalu.headers, headers)) tulis.set(1, headers);
    for (const r of c.baris) if (r.baris >= 2 && r.baris <= c.jumlah_baris + 1) tulis.set(r.baris, r.nilai);
  }
  const kolomTgl = kolomTanggal(headers, c.tipe);
  while (kolomTgl.length < ncol) kolomTgl.push(false);
  // Baris di bawah jumlah baris baru (dihapus jalur Supabase) dikosongkan.
  const kosongDari = c.jumlah_baris + 2, kosongSampai = jumlahLama + 1;
  const minta = [];
  const perluBaris = Math.max(c.jumlah_baris + 1, ...[...tulis.keys()]);
  if (perluBaris > grid.baris) minta.push({ appendDimension: { sheetId: grid.id, dimension: 'ROWS', length: perluBaris - grid.baris } });
  if (ncol > grid.kolom) minta.push({ appendDimension: { sheetId: grid.id, dimension: 'COLUMNS', length: ncol - grid.kolom } });
  minta.push(...susunPermintaan(grid.id, tulis, ncol, kolomTgl, pola, c.rumus || [], zona));
  if (kosongSampai >= kosongDari) {
    minta.push({ updateCells: { range: { sheetId: grid.id, startRowIndex: kosongDari - 1, endRowIndex: Math.min(kosongSampai, Math.max(grid.baris, perluBaris)), startColumnIndex: 0, endColumnIndex: Math.max(ncol, grid.kolom) }, fields: 'userEnteredValue' } });
  }
  return { tulis, minta, pola, dikosongkan: Math.max(0, kosongSampai - kosongDari + 1) };
}

// ── Satu sheet ────────────────────────────────────────────────────────────
async function balikSheet(ctx, judul) {
  const { sql, skema, sasaran, token, meta, tulis: bolehTulis, penuh } = ctx;
  const grid = meta.sheet.get(judul);
  if (!grid) return { judul, gagal: 'sheet tidak ada di spreadsheet sasaran' };
  const [lalu] = ctx.adaPenanda
    ? await sql`SELECT sasaran, sinkron_at::text AS versi, jumlah_baris, headers, pola FROM ${sql(skema + '.cermin_balik')} WHERE sheet = ${judul}`
    : [];
  const pakaiPenuh = penuh || !lalu || lalu.sasaran !== sasaran;
  if (!penuh && !pakaiPenuh) {
    const [h] = await sql`SELECT sinkron_at::text AS versi FROM ${sql(skema + '.cermin_header')} WHERE sheet = ${judul}`;
    if (h && h.versi === lalu.versi) return { judul, baris: 0, dikosongkan: 0, tetap: true };
  }
  if (!penuh && pakaiPenuh) return { judul, gagal: 'belum punya penanda untuk sasaran ini; jalankan --penuh dulu' };
  const c = await bacaCermin(sql, skema, judul, pakaiPenuh ? null : lalu.versi);
  const mentah = pakaiPenuh ? await bacaMentah(sasaran, judul, 1, Math.max(grid.baris, 1), token) : null;
  const { tulis, minta, pola, dikosongkan } = rencanaSheet({ grid, c, lalu: pakaiPenuh ? null : lalu, mentah, zona: ctx.zona });
  const headers = c.headers;
  const hasil = { judul, baris: tulis.size, dikosongkan, permintaan: minta.length };
  if (!bolehTulis) return { ...hasil, kering: true };
  if (minta.length) {
    // Satu batchUpdate per sheet (dipotong bila sangat besar): semuanya berlaku, atau tidak sama sekali.
    for (let i = 0, ukuran = 0, kelompok = []; i <= minta.length; i++) {
      const m = minta[i];
      const besar = m ? JSON.stringify(m).length : 0;
      if (i === minta.length || (kelompok.length && ukuran + besar > 4e6)) {
        if (kelompok.length) await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${sasaran}:batchUpdate`, token, { requests: kelompok });
        kelompok = []; ukuran = 0;
      }
      if (m) { kelompok.push(m); ukuran += besar; }
    }
  }
  await sql`INSERT INTO ${sql(skema + '.cermin_balik')} (sheet, sasaran, sinkron_at, jumlah_baris, headers, pola, diubah_at)
            VALUES (${judul}, ${sasaran}, ${c.versi}::timestamptz, ${c.jumlah_baris}, ${headers}, ${sql.json(pola)}, now())
            ON CONFLICT (sheet) DO UPDATE SET sasaran = EXCLUDED.sasaran, sinkron_at = EXCLUDED.sinkron_at,
              jumlah_baris = EXCLUDED.jumlah_baris, headers = EXCLUDED.headers, pola = EXCLUDED.pola, diubah_at = now()`;
  return hasil;
}

// Bandingkan seluruh sheet spreadsheet dengan cermin (cara baca sama dengan sinkron.mjs). Kembalikan jumlah baris beda.
async function periksaSheet(ctx, judul) {
  const grid = ctx.meta.sheet.get(judul);
  const mentah = await bacaMentah(ctx.sasaran, judul, 1, Math.max(grid.baris, 1), ctx.token);
  const kini = rapikan(mentah, ctx.zona);
  const c = await bacaCermin(ctx.sql, ctx.skema, judul, null);
  let beda = sama(kini.headers, c.headers) ? 0 : 1;
  const cermin = new Map(c.baris.map((r) => [r.baris, r.nilai]));
  const n = Math.max(kini.rows.length, c.jumlah_baris);
  const lebar = Math.max(kini.headers.length, c.headers.length);
  const pad = (v) => { if (!v) return null; const o = v.slice(0, lebar); while (o.length < lebar) o.push(''); return o; };
  const contoh = [];
  for (let i = 0; i < n; i++) {
    const a = pad(kini.rows[i] ? kini.rows[i].nilai : null), b = pad(cermin.get(i + 2) || null);
    if (!sama(a, b)) { beda++; if (contoh.length < 3) contoh.push(i + 2); }
  }
  return { beda, contoh };
}

// ── Satu rumah ────────────────────────────────────────────────────────────
// Sasaran yang sah. Kembalikan true bila sasaran adalah spreadsheet ASLI rumah ini (penulisan lalu masih menunggu izin
// tulis jalur Supabase di database). Skema uji_* hanya ke salinan; salinan tidak boleh spreadsheet asli rumah lain.
export function cekSasaran({ skema, sasaran, asli, semuaAsli, dariOpsi }) {
  if (!sasaran) throw new Error(`tidak ada sasaran: ${skema.toUpperCase()}_SPREADSHEET_ID belum diisi dan --sasaran tidak diberikan`);
  if (skema.startsWith('uji_') && (!dariOpsi || semuaAsli.includes(sasaran))) {
    throw new Error(`skema ${skema} hanya boleh ke salinan latihan (--sasaran), bukan spreadsheet asli`);
  }
  if (sasaran !== asli && semuaAsli.includes(sasaran)) throw new Error('sasaran adalah spreadsheet asli rumah lain');
  return sasaran === asli;
}

async function balikRumah(sql, skema) {
  const tulis = Boolean(arg.tulis);
  const asli = ASLI[skema] || null;
  const sasaran = typeof arg.sasaran === 'string' ? arg.sasaran : asli;
  if (sasaran) idDisamarkan.add(sasaran);
  const keAsli = cekSasaran({ skema, sasaran, asli, semuaAsli: Object.values(ASLI), dariOpsi: typeof arg.sasaran === 'string' });
  if (tulis && keAsli) {
    const [izin] = await sql`SELECT boleh FROM public.cermin_izin_tulis WHERE skema = ${skema}`;
    if (!izin || !izin.boleh) {
      console.log(`${skema}: DILEWATI — migrasi belum dimulai; spreadsheet asli tidak ditulis sebelum jam mulai (docs/SAKLAR.md).`);
      return true;
    }
  }
  const [kunci] = await sql`SELECT pg_try_advisory_lock(hashtext(${'cermin_balik:' + skema})) AS dapat`;
  if (!kunci.dapat) { console.log(`${skema}: DILEWATI — putaran cermin balik lain sedang berjalan.`); return true; }
  try {
    if (tulis) await siapkanPenanda(sql, skema);
    const [ap] = await sql`SELECT to_regclass(${skema + '.cermin_balik'}) IS NOT NULL AS ada`;
    const { token, email } = await aksesToken(wajib('GOOGLE_SA_KEY_FILE'), tulis ? CAKUPAN_TULIS : CAKUPAN_BACA);
    const meta = await metaSpreadsheet(sasaran, token);
    if (!arg.ringkas) console.log(`Sasaran: "${meta.judul}"${sasaran === asli ? ' (ASLI)' : ' (salinan latihan)'} · skema ${skema} · zona ${meta.zona} · akun ${email}${tulis ? '' : ' · KERING'}`);
    const daftar = (await sql`SELECT sheet FROM ${sql(skema + '.cermin_header')} ORDER BY sheet`).map((r) => r.sheet)
      .filter((s) => !arg.sheet || s === arg.sheet);
    const ctx = { sql, skema, sasaran, token, meta, zona: meta.zona, tulis, penuh: Boolean(arg.penuh), adaPenanda: ap.ada };
    const hasil = [];
    for (const judul of daftar) {
      try { hasil.push(await balikSheet(ctx, judul)); } catch (e) { hasil.push({ judul, gagal: samarkan(e.message) }); }
    }
    let periksa = null;
    if (arg.periksa) {
      periksa = [];
      for (const judul of daftar) {
        if (!meta.sheet.get(judul)) continue;
        try { periksa.push({ judul, ...(await periksaSheet(ctx, judul)) }); } catch (e) { periksa.push({ judul, gagal: samarkan(e.message) }); }
      }
    }
    const gagal = hasil.filter((h) => h.gagal).concat((periksa || []).filter((p) => p.gagal || p.beda > 0));
    const baris = hasil.reduce((s, h) => s + (h.baris || 0), 0), kosong = hasil.reduce((s, h) => s + (h.dikosongkan || 0), 0);
    const ringkasPeriksa = periksa ? ` · periksa ${periksa.filter((p) => p.beda === 0).length}/${periksa.length} sama` : '';
    if (tulis) {
      const isi = [['balik_terakhir', new Date().toISOString()], ['balik_hasil', `${baris} baris ditulis, ${kosong} dikosongkan, ${gagal.length} gagal${ringkasPeriksa}`]];
      if (periksa) isi.push(['balik_periksa_hasil', `${periksa.filter((p) => p.beda === 0).length}/${periksa.length} sama`], ['balik_periksa_terakhir', new Date().toISOString()]);
      for (const [k, v] of isi) {
        await sql`INSERT INTO ${sql(skema + '.cermin_meta')} (kunci, nilai, diubah_at) VALUES (${k}, ${v}, now())
                  ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()`;
      }
    }
    if (arg.ringkas) {
      console.log(`${skema}: ${tulis ? '' : 'KERING · '}${baris} baris ${tulis ? 'ditulis' : 'akan ditulis'}, ${kosong} dikosongkan, ${gagal.length} gagal${ringkasPeriksa}`);
      for (const g of gagal) console.log(`  GAGAL ${g.gagal ? g.gagal : `${g.beda} baris berbeda`}`);
    } else {
      for (const h of hasil) {
        console.log(`  ${h.judul.padEnd(26)} ${h.gagal ? 'GAGAL: ' + h.gagal : h.tetap ? 'tidak berubah' : `${h.baris} baris ${tulis ? 'ditulis' : 'akan ditulis'}, ${h.dikosongkan} dikosongkan (${h.permintaan} permintaan)`}`);
      }
      if (periksa) for (const p of periksa) console.log(`  periksa ${p.judul.padEnd(18)} ${p.gagal ? 'GAGAL: ' + p.gagal : p.beda === 0 ? 'sama' : `${p.beda} baris BERBEDA (contoh baris ${p.contoh.join(', ')})`}`);
    }
    return gagal.length === 0;
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext(${'cermin_balik:' + skema}))`.catch(() => {});
  }
}

async function utama() {
  const daftar = arg.semua ? Object.keys(ASLI).sort() : [typeof arg.skema === 'string' ? arg.skema : ''];
  if (!daftar.length || daftar.some((s) => !/^[a-z][a-z0-9_]*$/.test(s))) throw new Error('isi --skema=<skema> atau --semua');
  const { default: postgres } = await import('postgres');
  const sql = postgres(wajib('DATABASE_URL'), { max: 1, prepare: false, ssl: 'require', connect_timeout: 20, idle_timeout: 20, onnotice: () => {} });
  let lulus = true;
  try {
    for (const skema of daftar) {
      try { if (!(await balikRumah(sql, skema))) lulus = false; } catch (e) { lulus = false; console.error(`${skema}: Berhenti: ${samarkan(e.message)}`); }
    }
  } finally { await sql.end({ timeout: 5 }).catch(() => {}); }
  if (!lulus) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  utama().catch((e) => { console.error(`Berhenti: ${samarkan(e.message)}`); process.exit(1); });
}
