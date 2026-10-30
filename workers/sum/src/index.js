/**
 * Rumah SUM V2: Worker `abadiops-sum`
 * Rumah: sum · Pemegang: Gabriel · Penjelasan: workers/sum/README.md
 *
 * Tahap 4 (Dual-Engine):
 *   1. menyajikan file PWA SUM (pwa/sum/, salinan 1:1 dari mar-sum-offline v45);
 *   2. melayani aksi baca dari Supabase skema `sum` jika diaktifkan atau lulus kembar;
 *   3. meneruskan panggilan tulis dan fallback aksi baca ke GAS SUM.
 * Saklar rumah ini: `gas` (docs/SAKLAR.md).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine',
};

// Aksi yang sudah lulus uji kembar dan diizinkan dilayani langsung dari Supabase
const AKSI_SUPABASE_LULUS_KEMBAR = new Set([]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/api/sehat')) return sehat(env);
    if (/\/api\/?$/.test(url.pathname)) return tanganiApi(request, env, url);
    
    // Akar folder → index.html, disajikan langsung tanpa redirect (lihat wrangler.toml).
    if (url.pathname.endsWith('/')) {
      return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  },
};

async function tanganiApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const bodyText = await request.text();
  let parsed = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {}

  const action = parsed.action || '';
  const token = parsed.token || '';
  const reqEngine = (
    request.headers.get('x-active-engine') ||
    url.searchParams.get('engine') ||
    parsed.engine ||
    env.STORAGE_MODE ||
    'GAS'
  ).toUpperCase();

  const ujiSupabase = url.searchParams.get('uji') === 'supabase';
  const bolehSupabase = (aksi) => ujiSupabase || (reqEngine === 'SUPABASE' && AKSI_SUPABASE_LULUS_KEMBAR.has(aksi));

  // Coba jalur Supabase jika diizinkan atau sedang diuji
  if (bolehSupabase(action) && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const resSupa = await cobaSupabaseSum(action, token, parsed, env);
    if (resSupa) {
      return resSupa;
    }
  }

  // Jalur utama / fallback ke GAS
  return teruskanKeGas(bodyText, action, env);
}

async function cobaSupabaseSum(action, token, parsed, env) {
  const supaHeaders = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  try {
    let rpcName = '';
    let payload = {};

    if (action === 'ping' && token) {
      rpcName = 'sum_ping';
      payload = { p_token: token };
    } else if (action === 'pull_create_refs' && token) {
      rpcName = 'sum_create_refs_bertoken';
      payload = { p_token: token };
    } else if (action === 'pull_monitoring' && token) {
      rpcName = 'sum_monitoring_bertoken';
      payload = { p_token: token };
    } else if (action === 'pull_my_wos' && token) {
      rpcName = 'sum_my_wos_bertoken';
      payload = { p_token: token };
    }

    if (!rpcName) return null;

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        catat(env, { aksi: action, jalur: 'supabase', status: 200 });
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Rumah': env.RUMAH,
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    }
  } catch (err) {
    catat(env, { aksi: action, galat_supabase: String((err && err.message) || err) });
  }

  return null; // Fallback ke GAS
}

async function teruskanKeGas(body, aksi, env) {
  const mulai = Date.now();
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
    catat(env, { aksi, status: res.status, ms: Date.now() - mulai, jalur: 'gas' });
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

function catat(env, isi) {
  console.log(JSON.stringify({ rumah: env.RUMAH, ...isi }));
}

function sehat(env) {
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH,
    saklar: env.SAKLAR,
    jalur: env.STORAGE_MODE || 'gas',
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
