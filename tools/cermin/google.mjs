/**
 * Bagian bersama sinkron maju (tools/cermin/sinkron.mjs, spreadsheet → Supabase) dan cermin balik
 * (tools/cermin/balik.mjs, Supabase → spreadsheet): login akun layanan, panggilan Sheets API dengan jeda dan coba
 * ulang, konversi tanggal, dan cara membaca sheet. Kedua arah membaca spreadsheet dengan kode yang SAMA, jadi
 * pemeriksaan selisih sesudah cermin balik memakai ukuran yang sama dengan syarat "selisih 0" sinkron maju.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

export const BARIS_PER_AMBIL = 2000;

// Nilai galat sel, ditulis sama seperti yang dikembalikan getValues() di GAS.
export const GALAT = {
  REF: '#REF!', NA: '#N/A', VALUE: '#VALUE!', DIVIDE_BY_ZERO: '#DIV/0!',
  NAME: '#NAME?', NUM: '#NUM!', NULL_VALUE: '#NULL!', ERROR: '#ERROR!', LOADING: '#LOADING',
};

export const CAKUPAN_BACA = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const CAKUPAN_TULIS = 'https://www.googleapis.com/auth/spreadsheets';

// Nama sheet → nama tabel: Config_BaseSettings → config_base_settings, WorkOrderTeam → work_order_team.
export const keTabel = (sheet) => sheet
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();

// ── Login akun layanan Google (JWT RS256). Bawaannya cakupan baca-saja. ───────
export async function aksesToken(keyFile, cakupan = CAKUPAN_BACA) {
  const k = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const kepala = b64({ alg: 'RS256', typ: 'JWT' });
  const klaim = b64({
    iss: k.client_email,
    scope: cakupan,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const tanda = crypto.createSign('RSA-SHA256').update(`${kepala}.${klaim}`).sign(k.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${kepala}.${klaim}.${tanda}`,
    }),
  });
  if (!res.ok) throw new Error(`Login akun layanan gagal: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { token: (await res.json()).access_token, email: k.client_email };
}

// Kuota Sheets API: 60 permintaan baca per menit per akun layanan. Beri jeda antarpermintaan,
// dan kalau tetap kena 429, galat 5xx, atau jaringan putus sesaat, tunggu lalu coba lagi.
const JEDA_MS = 1100;
let terakhirMs = 0;
export const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// Galat sementara yang aman diulang: 429 (kuota), 5xx, dan 409 ABORTED ("The operation was aborted": Google membatalkan
// operasi, biasanya karena beban/konkurensi; tidak ada yang diterapkan, jadi mengulang aman, juga untuk batchUpdate).
// 409 ABORTED pernah menggagalkan sinkron per jam KMB V2 (WorkOrders_Archive, 15 Nov 17.24 WIB); di hari H galat yang
// sama akan menggagalkan sinkron terakhir prosedur Mulai.
export const bolehUlang = (status, isi = '') => status === 429 || status >= 500 || (status === 409 && /ABORTED/.test(String(isi)));

// badan: objek untuk POST JSON (spreadsheets.batchUpdate). Tanpa badan: GET.
export async function gapi(url, token, badan) {
  for (let coba = 1; ; coba++) {
    await tidur(terakhirMs + JEDA_MS - Date.now());
    terakhirMs = Date.now();
    let res;
    try {
      res = await fetch(url, badan === undefined
        ? { headers: { authorization: `Bearer ${token}` } }
        : { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(badan) });
    } catch (e) {
      if (coba >= 5) throw e;
      console.log(`  jaringan: ${e.message}, mencoba lagi (${coba + 1}/5)`);
      await tidur(5000 * coba);
      continue;
    }
    if (res.ok) return res.json();
    const isi = (await res.text()).replace(/\s+/g, ' ');
    const pesan = `${res.status} ${url.split('?')[0]}: ${isi.slice(0, 300)}`;
    if (!bolehUlang(res.status, isi) || coba >= 5) throw new Error(pesan);
    console.log(`  ${res.status}, mencoba lagi (${coba + 1}/5)`);
    await tidur(res.status === 429 ? 61000 : 5000 * coba);
  }
}

// ── Tanggal: nomor seri spreadsheet ↔ ISO UTC, memakai zona waktu spreadsheet ─
export function selisihZonaMs(zona, utcMs) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000;
}
export function seriKeIso(seri, zona) {
  const jamDinding = Math.round((seri - 25569) * 86400000);
  let utc = jamDinding - selisihZonaMs(zona, jamDinding);
  utc = jamDinding - selisihZonaMs(zona, utc);
  return new Date(utc).toISOString();
}
// Kebalikan seriKeIso: waktu ISO → nomor seri jam dinding di zona spreadsheet.
export function isoKeSeri(iso, zona) {
  const utc = Date.parse(iso);
  return (utc + selisihZonaMs(zona, utc)) / 86400000 + 25569;
}

// Satu sel API → nilai yang sama dengan yang dibaca getValues() di GAS.
export function bacaSel(c, zona) {
  const v = c && c.effectiveValue;
  if (!v) return { nilai: '', tipe: null };
  if ('stringValue' in v) return { nilai: v.stringValue, tipe: 'teks' };
  if ('boolValue' in v) return { nilai: v.boolValue, tipe: 'boolean' };
  if ('errorValue' in v) return { nilai: GALAT[v.errorValue.type] || '#ERROR!', tipe: 'galat' };
  if ('numberValue' in v) {
    const f = c.effectiveFormat && c.effectiveFormat.numberFormat && c.effectiveFormat.numberFormat.type;
    if (f === 'DATE' || f === 'DATE_TIME' || f === 'TIME') return { nilai: seriKeIso(v.numberValue, zona), tipe: 'tanggal' };
    return { nilai: v.numberValue, tipe: 'angka' };
  }
  return { nilai: '', tipe: null };
}

// ── Baca satu sheet utuh, bentuknya sama dengan getDataRange().getValues() ───
// rumus: ikut ambil teks rumus (userEnteredValue.formulaValue) di panggilan yang sama. Hanya untuk sheet config
// (SHEET_BERUMUS): pusat admin menghitung ulang rumus setelah migrasi (keputusan Gabriel 15 Nov), dan cermin balik
// tidak menimpa sel berumus. Sheet operasional tidak berumus (analisis 14 Nov), jadi tidak ikut membengkak.
export async function bacaSheet(id, judul, jumlahBarisGrid, zona, token, { rumus = false } = {}) {
  const mentah = [];
  for (let mulai = 1; mulai <= jumlahBarisGrid; mulai += BARIS_PER_AMBIL) {
    const akhir = Math.min(mulai + BARIS_PER_AMBIL - 1, jumlahBarisGrid);
    const range = encodeURIComponent(`'${judul.replace(/'/g, "''")}'!${mulai}:${akhir}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?ranges=${range}&includeGridData=true`
      + `&fields=sheets(data(startRow,rowData(values(effectiveValue,effectiveFormat/numberFormat/type${rumus ? ',userEnteredValue/formulaValue' : ''}))))`;
    const j = await gapi(url, token);
    const data = (j.sheets && j.sheets[0] && j.sheets[0].data && j.sheets[0].data[0]) || {};
    const rd = data.rowData || [];
    for (let i = 0; i < akhir - mulai + 1; i++) mentah.push((rd[i] && rd[i].values) || []);
  }
  // Sel berumus: nomor baris sheet (mulai 1, termasuk baris judul) dan indeks kolom (mulai 0), seperti nilai[].
  const daftarRumus = [];
  if (rumus) mentah.forEach((sel, i) => sel.forEach((c, j) => {
    const f = c && c.userEnteredValue && c.userEnteredValue.formulaValue;
    if (f) daftarRumus.push({ baris: i + 1, kolom: j, rumus: f });
  }));
  return { ...rapikan(mentah, zona), rumus: daftarRumus };
}

// Sel API mentah (per baris) → { headers, rows, tipe }: nilai GAS, lalu baris dan kolom kosong di ujung dipotong
// seperti getDataRange().
export function rapikan(mentah, zona) {
  const baris = mentah.map((sel) => sel.map((c) => bacaSel(c, zona)));
  let barisTerakhir = 0, kolomTerakhir = 0;
  baris.forEach((r, i) => r.forEach((s, j) => {
    if (s.nilai !== '') { barisTerakhir = Math.max(barisTerakhir, i + 1); kolomTerakhir = Math.max(kolomTerakhir, j + 1); }
  }));
  const potong = baris.slice(0, barisTerakhir).map((r) => {
    const out = r.slice(0, kolomTerakhir);
    while (out.length < kolomTerakhir) out.push({ nilai: '', tipe: null });
    return out;
  });
  if (potong.length === 0) return { headers: [], rows: [], tipe: {} };
  const headers = potong[0].map((s) => String(s.nilai));
  const tipeKolom = headers.map(() => new Set());
  const rows = potong.slice(1).map((r, i) => {
    r.forEach((s, j) => { if (s.tipe) tipeKolom[j].add(s.tipe); });
    const nilai = r.map((s) => s.nilai);
    const data = {};
    headers.forEach((h, j) => { data[h] = nilai[j]; });
    return { baris: i + 2, nilai, data };
  });
  const tipe = {};
  headers.forEach((h, j) => {
    const t = [...tipeKolom[j]].sort();
    tipe[h] = t.length === 0 ? 'kosong' : t.length === 1 ? t[0] : `campur:${t.join('+')}`;
  });
  return { headers, rows, tipe };
}

export const sidikDari = (headers, rows) => crypto.createHash('sha256')
  .update(JSON.stringify({ headers, rows: rows.map((r) => r.nilai) })).digest('hex');
