/**
 * Pintu Abadi Operation (abadiops.com). Netral: tidak menampilkan aplikasi rumah mana pun.
 * Keputusan: docs/KEPUTUSAN.md 28 Okt 2026. Bagian bersama (AGENTS.md §2).
 *
 * Rute:
 * - GET  /                     -> Halaman Pintu (index.html)
 * - POST /api/pintu            -> Ping token ke semua rumah (kenaliRumah)
 * - GET  /saklar               -> Panel Saklar Visual (saklar.html)
 * - POST /saklar/api/masuk     -> Login panel saklar
 * - GET  /saklar/api/status    -> Ambil posisi saklar & audit history (auth required)
 * - POST /saklar/api/ubah      -> Balik posisi saklar (auth required)
 * - GET  /api/saklar/status    -> Endpoint publik/antar-worker untuk cek posisi saklar
 *
 * Durable Object: SaklarDO (strongly consistent, zero latency, tahan banting jika DB down).
 */

import { SaklarDO } from './saklar-do.js';
import { verifikasiKataSandi, validasiSesi } from './saklar-auth.js';

export { SaklarDO };

const BATAS_GAS_MS = 25000;

function daftarRumah(env) {
  const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
  if (!Array.isArray(r) || !r.length) throw new Error('RUMAH belum dikonfigurasi di wrangler.toml');
  return r;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function getSaklarStub(env) {
  if (!env.SAKLAR_DO) return null;
  try {
    const id = env.SAKLAR_DO.idFromName('abadiops-master-saklar');
    return env.SAKLAR_DO.get(id);
  } catch (err) {
    console.warn('Gagal inisialisasi SaklarDO stub:', err);
    return null;
  }
}

// Badan ping sama dengan yang dikirim PWA lama ke GAS.
async function tanyaGas(rumah, token, env) {
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), BATAS_GAS_MS);
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(rumah.gas, {
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
  const hasil = await Promise.all(daftarRumah(env).map((r) => tanyaGas(r, token, env)));
  const cocok = hasil.filter((h) => h.cocok);
  const gagal = hasil.filter((h) => h.gagal);
  if (gagal.length) console.log('pintu: rumah tidak menjawab: ' + gagal.map((h) => `${h.rumah.kode} (${h.err})`).join(', '));

  if (cocok.length > 1) {
    console.log(`pintu: TOKEN KEMBAR ${token.slice(0, 4)}… di ${cocok.map((h) => h.rumah.kode).join(' + ')}`);
    return { success: false, error: 'Token ini terdaftar di lebih dari satu rumah. Hubungi admin.' };
  }
  if (cocok.length === 1) {
    const { rumah, d } = cocok[0];
    return { success: true, rumah: rumah.kode, nama_rumah: rumah.nama, alamat_rumah: rumah.alamat, web_rumah: rumah.web || '', nama: (d.result && d.result.name) || '' };
  }
  if (gagal.length) return { success: false, error: 'Server sedang sibuk, token belum bisa diperiksa. Coba lagi sebentar lagi.' };
  const tolak = hasil.find((h) => h.d && h.d.error);
  return { success: false, error: (tolak && tolak.d.error) || 'Token tidak dikenal / nonaktif' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Penanganan CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // --- Rute Panel Saklar Visual (docs/SAKLAR.md) ---
    if (url.pathname === '/saklar' || url.pathname === '/saklar/' || url.pathname === '/saklar.html') {
      return env.ASSETS.fetch(new Request(new URL('/saklar.html', url), request));
    }

    // API Masuk / Login Panel Saklar
    if (url.pathname === '/saklar/api/masuk' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
      const auth = await verifikasiKataSandi(body.password || '', env, clientIp);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, 401);
      }
      return json({ success: true, token: auth.token }, 200, {
        'Set-Cookie': `abadi_saklar_session=${encodeURIComponent(auth.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`,
      });
    }

    // API Status Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/status' && request.method === 'GET') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      const stub = getSaklarStub(env);
      if (!stub) {
        // Fallback aman: jika DO belum aktif, laporkan semua 'gas'
        return json({
          success: true,
          switches: {
            kmbprojek: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Durable Object belum terpasang' },
            sum: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Durable Object belum terpasang' },
            kmbtra: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Durable Object belum terpasang' },
          },
          history: [],
        });
      }

      const resp = await stub.fetch('https://saklar.internal/?action=status');
      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // API Ubah Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/ubah' && request.method === 'POST') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      let body = {};
      try { body = await request.json(); } catch (_) {
        return json({ success: false, error: 'Format JSON salah' }, 400);
      }

      const stub = getSaklarStub(env);
      if (!stub) {
        return json({ success: false, error: 'Durable Object saklar tidak tersedia pada runtime ini.' }, 500);
      }

      const resp = await stub.fetch('https://saklar.internal/?action=ubah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // API Publik / Antar-Rumah untuk mengecek status saklar (tanpa history)
    if (url.pathname === '/api/saklar/status' && request.method === 'GET') {
      let switches = { kmbprojek: 'gas', sum: 'gas', kmbtra: 'gas' };
      try {
        const stub = getSaklarStub(env);
        if (stub) {
          const resp = await stub.fetch('https://saklar.internal/?action=status');
          const data = await resp.json();
          if (data && data.switches) {
            switches = {
              kmbprojek: data.switches.kmbprojek?.posisi || 'gas',
              sum: data.switches.sum?.posisi || 'gas',
              kmbtra: data.switches.kmbtra?.posisi || 'gas',
            };
          }
        }
      } catch (err) {
        console.warn('Gagal membaca saklar dari DO:', err);
      }

      return json({ success: true, switches }, 200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
      });
    }

    // --- Rute Pintu Utama (Pengenalan Token) ---
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
