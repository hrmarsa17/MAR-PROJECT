/**
 * Mesin rumus kecil untuk sheet config di cermin (keputusan Gabriel 15 Nov 2026: setelah migrasi pusat admin
 * menghitung ulang rumus seperti spreadsheet). Hanya bentuk yang benar-benar dipakai spreadsheet keempat rumah
 * (analisis 15 Nov): angka, teks "...", + - * / &, kurung, rujukan sel/rentang A1 ($ boleh), dan XLOOKUP.
 * Pemisah argumen , atau ; (BUPR memakai ;). Bentuk lain (FILTER, TEXT, IF, ...) DITOLAK dengan TidakDidukung,
 * bukan ditebak: sel itu tidak dihitung ulang dan pemanggil memutuskan (pusat admin menolak perubahan yang
 * memengaruhinya).
 *
 * Sheet dibaca dalam bentuk cermin: headers (baris 1) dan baris data { baris, nilai[] } (baris sheet mulai 2).
 */

export class TidakDidukung extends Error {}
export class GalatRumus extends Error {}   // hasil galat Sheets (#VALUE!, #N/A, #DIV/0!)

// ── Pemindai ──────────────────────────────────────────────────────────────────
function pindai(teks) {
  const t = [];
  let i = 0;
  const s = String(teks);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1, isi = '';
      for (;;) {
        if (j >= s.length) throw new TidakDidukung('teks tidak ditutup');
        if (s[j] === '"') { if (s[j + 1] === '"') { isi += '"'; j += 2; continue; } break; }
        isi += s[j++];
      }
      t.push({ j: 'teks', v: isi }); i = j + 1; continue;
    }
    const m = s.slice(i).match(/^(\$?[A-Za-z]{1,3}\$?\d+)(:\$?[A-Za-z]{1,3}\$?\d+)?/);
    if (m && !/^[A-Za-z]{1,3}\d+\s*\(/.test(s.slice(i))) {
      t.push(m[2] ? { j: 'rentang', a: m[1], b: m[2].slice(1) } : { j: 'sel', v: m[1] });
      i += m[0].length; continue;
    }
    const n = s.slice(i).match(/^\d+(\.\d+)?/);
    if (n) { t.push({ j: 'angka', v: Number(n[0]) }); i += n[0].length; continue; }
    const f = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (f) { t.push({ j: 'nama', v: f[0].toUpperCase() }); i += f[0].length; continue; }
    if ('+-*/&(),;'.includes(c)) { t.push({ j: c }); i++; continue; }
    throw new TidakDidukung(`tanda "${c}" belum didukung`);
  }
  return t;
}

// ── Pengurai (rekursif turun): ekspresi := gabung; gabung := tambah ('&' tambah)*; tambah := kali (('+'|'-') kali)*;
//    kali := unari (('*'|'/') unari)*; unari := '-' unari | primer; primer := angka | teks | sel | rentang | fungsi | '(' ekspresi ')'
export function urai(rumus) {
  const s = String(rumus || '');
  if (!s.startsWith('=')) throw new TidakDidukung('bukan rumus');
  const t = pindai(s.slice(1));
  let p = 0;
  const lihat = () => t[p];
  const ambil = (j) => { const x = t[p]; if (!x || (j && x.j !== j)) throw new TidakDidukung(`diharapkan ${j || 'token'}`); p++; return x; };
  function ekspresi() { return gabung(); }
  function gabung() { let a = tambah(); while (lihat() && lihat().j === '&') { p++; a = { op: '&', a, b: tambah() }; } return a; }
  function tambah() { let a = kali(); while (lihat() && (lihat().j === '+' || lihat().j === '-')) { const op = ambil().j; a = { op, a, b: kali() }; } return a; }
  function kali() { let a = unari(); while (lihat() && (lihat().j === '*' || lihat().j === '/')) { const op = ambil().j; a = { op, a, b: unari() }; } return a; }
  function unari() { if (lihat() && lihat().j === '-') { p++; return { op: 'neg', a: unari() }; } if (lihat() && lihat().j === '+') { p++; return unari(); } return primer(); }
  function primer() {
    const x = lihat();
    if (!x) throw new TidakDidukung('rumus terpotong');
    if (x.j === 'angka') { p++; return { angka: x.v }; }
    if (x.j === 'teks') { p++; return { teks: x.v }; }
    if (x.j === 'sel') { p++; return { sel: x.v }; }
    if (x.j === 'rentang') { p++; return { rentang: [x.a, x.b] }; }
    if (x.j === '(') { p++; const e = ekspresi(); ambil(')'); return e; }
    if (x.j === 'nama') {
      p++;
      ambil('(');
      const args = [];
      if (!(lihat() && lihat().j === ')')) {
        for (;;) {
          args.push(ekspresi());
          if (lihat() && (lihat().j === ',' || lihat().j === ';')) { p++; continue; }
          break;
        }
      }
      ambil(')');
      if (!FUNGSI[x.v]) throw new TidakDidukung(`fungsi ${x.v} belum didukung`);
      return { fungsi: x.v, args };
    }
    throw new TidakDidukung(`token "${x.j}" tidak diharapkan`);
  }
  const pohon = ekspresi();
  if (p !== t.length) throw new TidakDidukung('sisa rumus tidak terbaca');
  return pohon;
}

// ── Rujukan A1 ────────────────────────────────────────────────────────────────
export function kolomKeIndeks(huruf) {
  let n = 0;
  for (const c of String(huruf).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
function pecahSel(ref) {
  const m = String(ref).replace(/\$/g, '').match(/^([A-Za-z]{1,3})(\d+)$/);
  if (!m) throw new TidakDidukung(`rujukan ${ref} tidak terbaca`);
  return { kolom: kolomKeIndeks(m[1]), baris: Number(m[2]) };
}

// Nilai satu sel sheet (baris sheet mulai 1 = judul).
function nilaiSel(sheet, baris, kolom) {
  if (baris === 1) return sheet.headers[kolom] ?? '';
  const r = sheet.petaBaris.get(baris);
  return r ? (r.nilai[kolom] ?? '') : '';
}

// ── Pemaksaan tipe seperti Google Sheets ─────────────────────────────────────
function keAngka(v) {
  if (v instanceof GalatRumus) throw v;
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  throw new GalatRumus('#VALUE!');
}
function keTeks(v) {
  if (v instanceof GalatRumus) throw v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}
const samaPersis = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b || String(a) === String(b));

const FUNGSI = {
  // XLOOKUP(cari, rentang_cari, rentang_hasil [, jika_tidak_ada]): kecocokan persis pertama (teks tanpa beda huruf besar).
  XLOOKUP(args, hitung, sheet) {
    if (args.length < 3 || args.length > 4) throw new TidakDidukung('XLOOKUP hanya 3–4 argumen');
    const cari = hitung(args[0]);
    const a = rentangNilai(args[1], sheet), b = rentangNilai(args[2], sheet);
    if (a.length !== b.length) throw new GalatRumus('#VALUE!');
    for (let i = 0; i < a.length; i++) if (samaPersis(a[i], cari)) return b[i];
    if (args.length === 4) return hitung(args[3]);
    throw new GalatRumus('#N/A');
  },
};

function rentangNilai(n, sheet) {
  if (!n || !n.rentang) throw new TidakDidukung('argumen harus rentang');
  const a = pecahSel(n.rentang[0]), b = pecahSel(n.rentang[1]);
  if (a.kolom !== b.kolom) throw new TidakDidukung('hanya rentang satu kolom');
  const out = [];
  for (let r = Math.min(a.baris, b.baris); r <= Math.max(a.baris, b.baris); r++) out.push(nilaiSel(sheet, r, a.kolom));
  return out;
}

// Hitung pohon rumus untuk sheet tertentu. Hasil: angka/teks, atau GalatRumus (dikembalikan, bukan dilempar).
export function hitungPohon(pohon, sheet) {
  const hitung = (n) => {
    if ('angka' in n) return n.angka;
    if ('teks' in n) return n.teks;
    if (n.sel) { const c = pecahSel(n.sel); return nilaiSel(sheet, c.baris, c.kolom); }
    if (n.rentang) throw new TidakDidukung('rentang di luar fungsi');
    if (n.fungsi) return FUNGSI[n.fungsi](n.args, hitung, sheet);
    if (n.op === 'neg') return -keAngka(hitung(n.a));
    if (n.op === '&') return keTeks(hitung(n.a)) + keTeks(hitung(n.b));
    const a = keAngka(hitung(n.a)), b = keAngka(hitung(n.b));
    if (n.op === '+') return a + b;
    if (n.op === '-') return a - b;
    if (n.op === '*') return a * b;
    if (n.op === '/') { if (b === 0) throw new GalatRumus('#DIV/0!'); return a / b; }
    throw new TidakDidukung(`operator ${n.op}`);
  };
  try {
    return hitung(pohon);
  } catch (e) {
    if (e instanceof GalatRumus) return e;
    throw e;
  }
}

// Bentuk rumus tanpa nomor barisnya sendiri: "=F5*2" di baris 5 → "=F{r}*2". Rujukan mutlak ($E$3) tidak diubah.
export function normalRumus(rumus, baris) {
  return String(rumus).replace(new RegExp(`(^|[^$A-Za-z])(\\$?[A-Za-z]{1,3})${baris}(?![0-9])`, 'g'), (m, depan, kol) => `${depan}${kol}{r}`);
}
export const isiTemplat = (templat, baris) => String(templat).split('{r}').join(String(baris));

/**
 * Rumus kolom yang seragam, untuk baris baru: { kolom: templat } bila satu bentuk menguasai ≥ 90% sel berumus di
 * kolom itu DAN mencakup ≥ 50% baris data (misalnya base_point =F{r}*2). Kolom yang hanya sebagian berumus (job_type
 * XLOOKUP di 160 dari ±1.550 baris) atau berisi konstanta (=15/60) tidak punya templat: baris baru diisi orang.
 */
export function templatKolom(rumus, jumlahBarisData) {
  const perKolom = new Map();
  for (const f of rumus) {
    if (f.baris < 2) continue;
    const t = normalRumus(f.rumus, f.baris);
    if (!t.includes('{r}')) continue;
    const k = perKolom.get(f.kolom) || new Map();
    k.set(t, (k.get(t) || 0) + 1);
    perKolom.set(f.kolom, k);
  }
  const hasil = {};
  for (const [kolom, peta] of perKolom) {
    const total = [...peta.values()].reduce((a, b) => a + b, 0);
    const [t, n] = [...peta.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n / total >= 0.9 && n >= jumlahBarisData * 0.5) hasil[kolom] = t;
  }
  return hasil;
}

// Sheet cermin → bentuk untuk mesin rumus. rows boleh array nilai (cermin_baca: baris sheet = indeks + 2) atau
// { baris, nilai, data } (alat sinkron). Array nilai dipakai langsung, jadi hitung ulang mengubah baris aslinya.
export function siapkanSheet(headers, rows) {
  return {
    headers,
    petaBaris: new Map(rows.map((r, i) => (Array.isArray(r) ? [i + 2, { baris: i + 2, nilai: r }] : [r.baris, r]))),
  };
}

/**
 * Hitung ulang semua sel berumus di sheet (data, baris ≥ 2). rumus: [{ baris, kolom, rumus }] dari cermin_rumus.
 * Mengubah nilai sel di rows (dan data[judul]) di tempat, berurutan baris lalu kolom, dua putaran supaya rumus yang
 * bergantung pada sel berumus lain ikut stabil. Kembali: { berubah: [{ baris, kolom, lama, baru }], tidakDidukung:
 * [{ baris, kolom, sebab }] }. Galat Sheets disimpan sebagai teksnya (#N/A dll.), seperti nilai yang dibaca GAS.
 */
export function hitungUlangSheet(headers, rows, rumus) {
  const sheet = siapkanSheet(headers, rows);
  const pohon = new Map();
  const tidakDidukung = [];
  for (const f of rumus) {
    if (f.baris < 2) continue;   // rumus di baris judul (penanda bantu) tidak dihitung ulang
    try { pohon.set(`${f.baris}:${f.kolom}`, { ...f, p: urai(f.rumus) }); } catch (e) { tidakDidukung.push({ baris: f.baris, kolom: f.kolom, sebab: e.message }); }
  }
  const awal = new Map();
  for (const f of pohon.values()) { const r = sheet.petaBaris.get(f.baris); awal.set(`${f.baris}:${f.kolom}`, r ? r.nilai[f.kolom] : undefined); }
  for (let putaran = 0; putaran < 2; putaran++) {
    for (const f of [...pohon.values()].sort((x, y) => x.baris - y.baris || x.kolom - y.kolom)) {
      const r = sheet.petaBaris.get(f.baris);
      if (!r) continue;
      let v = hitungPohon(f.p, sheet);
      if (v instanceof GalatRumus) v = v.message;
      r.nilai[f.kolom] = v;
      if (r.data && headers[f.kolom] !== undefined) r.data[headers[f.kolom]] = v;
    }
  }
  const berubah = [];
  for (const f of pohon.values()) {
    const k = `${f.baris}:${f.kolom}`;
    const r = sheet.petaBaris.get(f.baris);
    const baru = r ? r.nilai[f.kolom] : undefined;
    if (!Object.is(awal.get(k), baru) && String(awal.get(k)) !== String(baru)) berubah.push({ baris: f.baris, kolom: f.kolom, lama: awal.get(k), baru });
  }
  return { berubah, tidakDidukung };
}
