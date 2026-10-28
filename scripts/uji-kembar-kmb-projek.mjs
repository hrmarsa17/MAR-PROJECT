/**
 * Uji kembar aksi baca KMB Project: jalur Supabase vs jalur GAS, lewat Worker yang sama.
 *
 * Tahapan 4 (docs/KEPUTUSAN.md): sebuah aksi baca baru boleh dilayani dari Supabase
 * kalau jawabannya sama dengan GAS. Skrip ini mengirim permintaan yang persis sama
 * seperti frontend (lihat api() di scripts/patched-app.js) dua kali, sekali dengan
 * engine=supabase dan sekali dengan engine=spreadsheet, lalu membandingkan isinya.
 *
 * Hanya aksi baca. Token tidak pernah dicetak utuh.
 *
 * Pemakaian:
 *   KMBP_UJI_SPV_TOKEN=<token uji supervisor KMB Project> node scripts/uji-kembar-kmb-projek.mjs
 *   PINTU_URL=https://kmbprojek.abadiops.com (bawaan; abadiops.com sekarang pintu, tanpa /api/gas)
 */
const PINTU_URL = process.env.PINTU_URL || 'https://kmbprojek.abadiops.com';
const GAS_URL = process.env.APPSCRIPT_URL_KMB || 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';
const TOKEN = process.env.KMBP_UJI_SPV_TOKEN;
if (!TOKEN) {
  console.error('❌ KMBP_UJI_SPV_TOKEN belum disetel di environment! (token uji supervisor KMB Project)');
  process.exit(1);
}

const AKSI = ['ping', 'pull_monitoring', 'pull_create_refs', 'pull_my_wos'];
// Field yang memang beda tiap panggilan atau hanya menandai jalur, bukan isi.
const ABAIKAN = new Set(['source', 'pulled_at', 'engine', 'server_time', 'generated_at', 'elapsed_ms']);

const samar = (v) => (typeof v === 'string' && /^[0-9a-f]{20}$/i.test(v) ? v.slice(0, 4) + '…' : v);

async function panggil(action, engine) {
  const res = await fetch(`${PINTU_URL}/api/gas?engine=${engine}&system=kmb${engine === 'supabase' ? '&uji=supabase' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MAR-System': 'KMB' },
    body: JSON.stringify({ token: TOKEN, system: 'KMB', engine: engine.toUpperCase(), action, data: {} }),
  });
  const teks = await res.text();
  let json;
  try { json = JSON.parse(teks); } catch { json = { bukan_json: teks.slice(0, 120) }; }
  return { jalur: res.headers.get('x-active-engine') || '(tanpa header)', json };
}

const KUNCI_BARIS = ['id', 'mechanic_id', 'wo_id', 'unit_id', 'component_no', 'job_id', 'key'];
const kunciDaftar = (arr) => KUNCI_BARIS.find((k) => arr.length > 0 && arr.every((x) => x && typeof x === 'object' && k in x));

function rapikan(v) {
  if (Array.isArray(v)) return v.map(rapikan);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!ABAIKAN.has(k)) o[k] = rapikan(v[k]);
    return o;
  }
  return v;
}

function beda(a, b, jalan, hasil) {
  if (Array.isArray(a) && Array.isArray(b)) {
    // Daftar baris (mekanik, komponen, WO, …) dicocokkan per kunci, bukan per urutan.
    const k = kunciDaftar(a) && kunciDaftar(a) === kunciDaftar(b) ? kunciDaftar(a) : null;
    if (k) {
      const peta = (arr) => new Map(arr.map((x) => [String(x[k]), x]));
      const pa = peta(a), pb = peta(b);
      for (const [id, x] of pa) {
        if (!pb.has(id)) hasil.push(`${jalan}[${k}=*]: hanya ada di supabase → ${id}`);
        else beda(x, pb.get(id), `${jalan}[${k}=*]`, hasil);
      }
      for (const id of pb.keys()) if (!pa.has(id)) hasil.push(`${jalan}[${k}=*]: hanya ada di gas → ${id}`);
      return;
    }
    if (a.length !== b.length) hasil.push(`${jalan}: jumlah supabase ${a.length} ≠ gas ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) beda(a[i], b[i], `${jalan}[*]`, hasil);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) hasil.push(`${jalan}.${k}: hanya ada di gas`);
      else if (!(k in b)) hasil.push(`${jalan}.${k}: hanya ada di supabase`);
      else beda(a[k], b[k], `${jalan}.${k}`, hasil);
    }
    return;
  }
  if (a !== b) hasil.push(`${jalan}: supabase ${JSON.stringify(samar(a))} ≠ gas ${JSON.stringify(samar(b))}`);
}

// ping selalu dijawab Supabase lebih dulu oleh Worker, apa pun engine-nya,
// jadi pembandingnya GAS KMB Project langsung, dengan badan yang sama.
async function gasLangsung(action) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: TOKEN, action, data: {} }),
    redirect: 'follow',
  });
  const teks = await res.text();
  try { return { jalur: 'GAS langsung', json: JSON.parse(teks) }; } catch { return { jalur: 'GAS langsung', json: { bukan_json: teks.slice(0, 120) } }; }
}

let lulus = 0;
for (const action of AKSI) {
  const [s, g] = await Promise.all([
    panggil(action, 'supabase'),
    action === 'ping' ? gasLangsung(action) : panggil(action, 'spreadsheet'),
  ]);
  const hasil = [];
  // Kalau jalur Supabase gagal lalu jatuh ke GAS, yang dibandingkan GAS dengan GAS:
  // "SAMA" palsu. Itu dihitung gagal. (ping tidak membawa header ini.)
  if (action !== 'ping' && s.jalur !== 'SUPABASE') {
    hasil.push(`jalur Supabase tidak menjawab sendiri (X-Active-Engine=${s.jalur}), jadi tidak ada yang dibandingkan`);
  }
  beda(rapikan(s.json), rapikan(g.json), 'jawaban', hasil);
  const sama = hasil.length === 0;
  if (sama) lulus++;
  console.log(`\n== ${action}: ${sama ? 'SAMA' : `BEDA (${hasil.length} titik)`}  (dijawab oleh: supabase→${s.jalur}, pembanding→${g.jalur})`);
  // Ringkas per jenis beda, lalu contoh.
  const jenis = {};
  for (const h of hasil) { const p = h.replace(/: supabase .*/, ': nilai beda').replace(/ → .*/, ''); jenis[p] = (jenis[p] || 0) + 1; }
  Object.entries(jenis).sort((x, y) => y[1] - x[1]).slice(0, 12).forEach(([p, n]) => console.log(`   ${String(n).padStart(4)}×  ${p}`));
  hasil.filter((h) => / → |≠/.test(h)).slice(0, 6).forEach((h) => console.log('     contoh: ' + h));
}
console.log(`\n${lulus}/${AKSI.length} aksi sama.`);
process.exit(lulus === AKSI.length ? 0 : 1);
