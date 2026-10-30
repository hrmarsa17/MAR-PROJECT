/**
 * Rumah KMB Project: Worker `abadiops-kmbprojek`
 * Rumah: kmbprojek · Pemegang: Raka · Penjelasan: workers/kmbprojek/README.md
 *
 * Tahap 3 (Pintu). Worker ini melakukan dua hal:
 *   1. menyajikan file PWA KMB Project (pwa/kmbprojek/, salinan 1:1 dari mar-projek-offline projek-v13);
 *   2. meneruskan SETIAP panggilan API (POST ./api) apa adanya ke GAS KMB Project.
 * Tidak ada logika bisnis di sini. Buat WO, kirim kerja, approve, dan semua aksi
 * lainnya tetap dikerjakan GAS. Saklar rumah ini: `gas` (docs/SAKLAR.md).
 *
 * Yang ditiru persis dari jalur lama PWA → GAS (MIGRASI-STACK.md §4):
 *   - body diteruskan apa adanya, dengan Content-Type text/plain;
 *   - jawaban GAS dikembalikan apa adanya, termasuk "MAINTENANCE|…", jawaban retry_later (server ramai), dan pesan
 *     token ditolak yang dikenali PWA lewat pola teks;
 *   - redirect 302 dari GAS ke googleusercontent diikuti;
 *   - kalau GAS tidak terjangkau, jawabannya berupa teks yang BUKAN JSON. PWA
 *     menganggap itu koneksi putus, sehingga kiriman tetap di antrean dan dikirim
 *     ulang otomatis, sama seperti saat ini ketika GAS tidak terjangkau.
 */

import { handleWebRequest, handleWebBridgeApi } from './web-handler.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/api/sehat')) return sehat(env);
    if (url.pathname === '/api/web' || url.pathname === '/api/web/') return handleWebBridgeApi(request, env, url);
    if (url.pathname === '/web' || url.pathname === '/web/' || url.pathname.startsWith('/web/')) return handleWebRequest(request, env, url);
    if (/\/api\/?$/.test(url.pathname)) return teruskanKeGas(request, env);
    // Akar folder → index.html, disajikan langsung tanpa redirect (lihat wrangler.toml).
    if (url.pathname.endsWith('/')) {
      return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  },
};

async function teruskanKeGas(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const body = await request.text();
  const mulai = Date.now();
  const aksi = namaAksi(body);
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const teks = await res.text();
    catat(env, { aksi, status: res.status, ms: Date.now() - mulai });
    return new Response(teks, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH,
        'X-Abadi-Jalur': 'gas',
      },
    });
  } catch (e) {
    catat(env, { aksi, galat: String((e && e.message) || e), ms: Date.now() - mulai });
    return new Response('GAS_TIDAK_TERJANGKAU', {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

// Nama aksi hanya untuk log. Token TIDAK PERNAH dicatat.
function namaAksi(body) {
  try {
    const a = JSON.parse(body).action;
    return typeof a === 'string' ? a.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) : '?';
  } catch {
    return '?';
  }
}

function catat(env, isi) {
  console.log(JSON.stringify({ rumah: env.RUMAH, jalur: 'gas', ...isi }));
}

let cacheSaklar = { nilai: null, waktu: 0 };

async function bacaStatusSaklar(env) {
  const sekarang = Date.now();
  if (cacheSaklar.nilai && cacheSaklar.waktu > sekarang) {
    return cacheSaklar.nilai;
  }
  let hasil = env.SAKLAR || 'gas';
  try {
    const isStaging = (env.GAS_URL && env.GAS_URL.includes('gas-tiruan')) || (env.RUMAH && env.RUMAH.includes('staging'));
    const url = isStaging
      ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev/api/saklar/status'
      : 'https://abadiops.com/api/saklar/status';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      const val = data?.switches?.[env.RUMAH];
      if (val) {
        hasil = val;
        cacheSaklar = { nilai: hasil, waktu: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}

async function sehat(env) {
  const liveSaklar = await bacaStatusSaklar(env);
  return new Response(JSON.stringify({ ok: true, rumah: env.RUMAH, saklar: liveSaklar, jalur: liveSaklar === 'gas' ? 'gas' : 'dua_cabang' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
