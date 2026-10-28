/**
 * Pintu Abadi Operation (abadiops.com). Netral: tidak menampilkan aplikasi rumah mana pun.
 * Keputusan: docs/KEPUTUSAN.md 28 Okt 2026. Bagian bersama (AGENTS.md §2).
 *
 * POST /api/pintu  { token }
 *   Token dicek ke GAS SEMUA rumah sekaligus (ping), lalu:
 *   - cocok di tepat satu rumah → { success, rumah, nama_rumah, alamat_rumah, nama }.
 *     Halaman pintu mengantar pengguna ke alamat_rumah dengan #token=.
 *   - cocok di lebih dari satu rumah → ditolak. JANGAN menebak.
 *   - tidak cocok di mana pun → pesan asli GAS ("Token tidak dikenal / nonaktif").
 *   - tidak cocok, tapi ada rumah yang tidak menjawab → minta coba lagi, supaya mekanik
 *     tidak mengira tokennya rusak hanya karena GAS lambat.
 * Selain itu: menyajikan halaman pintu dari public/.
 *
 * Daftar rumah ada di wrangler.toml [vars] RUMAH, bukan di kode. Tidak ada token atau
 * daftar token di sini (haram hardcode, AGENTS.md §5).
 */

const BATAS_GAS_MS = 25000;

function daftarRumah(env) {
  const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
  if (!Array.isArray(r) || !r.length) throw new Error('RUMAH belum dikonfigurasi di wrangler.toml');
  return r;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Badan ping sama dengan yang dikirim PWA lama ke GAS.
async function tanyaGas(rumah, token) {
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), BATAS_GAS_MS);
  try {
    const res = await fetch(rumah.gas, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action: 'ping', data: {} }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const d = await res.json();
    if (d && d.success === true && d.result) return { rumah, cocok: true, d };
    if (d && d.success === false) return { rumah, cocok: false, d };
    return { rumah, gagal: true, err: 'jawaban tidak dikenal' };
  } catch (err) {
    return { rumah, gagal: true, err: String((err && err.message) || err) };
  } finally {
    clearTimeout(batas);
  }
}

async function kenaliRumah(token, env) {
  const hasil = await Promise.all(daftarRumah(env).map((r) => tanyaGas(r, token)));
  const cocok = hasil.filter((h) => h.cocok);
  const gagal = hasil.filter((h) => h.gagal);
  if (gagal.length) console.log('pintu: rumah tidak menjawab: ' + gagal.map((h) => `${h.rumah.kode} (${h.err})`).join(', '));

  if (cocok.length > 1) {
    console.log(`pintu: TOKEN KEMBAR ${token.slice(0, 4)}… di ${cocok.map((h) => h.rumah.kode).join(' + ')}`);
    return { success: false, error: 'Token ini terdaftar di lebih dari satu rumah. Hubungi admin.' };
  }
  if (cocok.length === 1) {
    const { rumah, d } = cocok[0];
    return { success: true, rumah: rumah.kode, nama_rumah: rumah.nama, alamat_rumah: rumah.alamat, nama: (d.result && d.result.name) || '' };
  }
  if (gagal.length) return { success: false, error: 'Server sedang sibuk, token belum bisa diperiksa. Coba lagi sebentar lagi.' };
  const tolak = hasil.find((h) => h.d && h.d.error);
  return { success: false, error: (tolak && tolak.d.error) || 'Token tidak dikenal / nonaktif' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/pintu') {
      if (request.method !== 'POST') return json({ success: false, error: 'Metode tidak didukung' }, 405);
      let token = '';
      try { token = String((await request.json()).token || '').trim(); } catch (_) { /* badan kosong / bukan JSON */ }
      if (!token) return json({ success: false, error: 'Silakan masukkan token akses.' });
      return json(await kenaliRumah(token, env));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
