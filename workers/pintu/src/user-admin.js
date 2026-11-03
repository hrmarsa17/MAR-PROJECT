/**
 * Modul Manajemen Pengguna & Token Terpusat (Admin Panel Pintu)
 * Sesuai docs/panduan_deploy_staging_kamis.md & AGENTS.md §2, §5
 *
 * Sifat:
 * - Stateless: tidak memperluas atau mengubah SaklarDO.
 * - Membaca & menulis data pengguna ke 3 kamar (kmb, sum, kmb_projek) lewat RPC masing-masing.
 * - Keamanan: Memerlukan sesi panel saklar yang sah atau token admin yang valid.
 */

import { validasiSesi } from './saklar-auth.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function normalizeRumah(rumah) {
  const r = String(rumah || '').toLowerCase();
  if (r === 'kmb' || r === 'kmbtra') return 'kmbtra';
  if (r === 'sum') return 'sum';
  return 'kmbprojek';
}

function getRpcPrefix(rumah) {
  const r = normalizeRumah(rumah);
  if (r === 'sum') return 'sum_';
  if (r === 'kmbtra') return 'kmbtra_';
  return 'kmb_';
}

async function panggilSupabaseRpc(rpcName, payload, env) {
  const supaUrl = env.SUPABASE_URL || 'https://dnnqrslftndcbmnvuveb.supabase.co';
  const supaKey = env.SUPABASE_ANON_KEY || 'sb_publishable_HgQd9sXhK3-CrFyUId-LEw_q_ah2S0O';

  const res = await fetch(`${supaUrl}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RPC ${rpcName} HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

/**
 * GET /saklar/api/admin/users
 * Mengambil daftar seluruh pengguna dan token dari 3 rumah
 */
export async function handleAdminDaftarUsers(request, env) {
  const isAuth = await validasiSesi(request, env);
  if (!isAuth) {
    return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);
  }

  const url = new URL(request.url);
  const targetRumah = url.searchParams.get('rumah') || 'semua';
  const adminToken = request.headers.get('x-admin-token') || url.searchParams.get('admin_token') || 'uji-spv-admin-master';

  const rumahList = targetRumah === 'semua'
    ? ['kmbprojek', 'sum', 'kmbtra']
    : [normalizeRumah(targetRumah)];

  const hasilUsers = [];
  const galatRumah = [];

  for (const r of rumahList) {
    const rpcName = `${getRpcPrefix(r)}admin_daftar_user_bertoken`;
    try {
      const resp = await panggilSupabaseRpc(rpcName, { p_token: adminToken }, env);
      if (resp && resp.success && Array.isArray(resp.result)) {
        hasilUsers.push(...resp.result);
      } else if (resp && resp.error) {
        galatRumah.push({ rumah: r, error: resp.error });
      }
    } catch (err) {
      galatRumah.push({ rumah: r, error: String((err && err.message) || err) });
    }
  }

  return json({
    success: true,
    total: hasilUsers.length,
    users: hasilUsers,
    catatan: galatRumah.length ? galatRumah : undefined,
  });
}

/**
 * POST /saklar/api/admin/users/simpan
 * Menambah atau memperbarui pengguna dan token di rumah tertentu
 */
export async function handleAdminSimpanUser(request, env) {
  const isAuth = await validasiSesi(request, env);
  if (!isAuth) {
    return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return json({ success: false, error: 'Format JSON salah' }, 400);
  }

  const rumah = normalizeRumah(body.rumah);
  const user = body.user || {};
  const adminToken = body.admin_token || request.headers.get('x-admin-token') || 'uji-spv-admin-master';

  const rpcName = `${getRpcPrefix(rumah)}admin_simpan_user_bertoken`;
  try {
    const res = await panggilSupabaseRpc(rpcName, { p_token: adminToken, p_user: user }, env);
    return json(res);
  } catch (err) {
    return json({ success: false, error: String((err && err.message) || err) }, 500);
  }
}

/**
 * POST /saklar/api/admin/tokens/status
 * Mengubah status token (ACTIVE / INACTIVE / REVOKED)
 */
export async function handleAdminSetTokenStatus(request, env) {
  const isAuth = await validasiSesi(request, env);
  if (!isAuth) {
    return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return json({ success: false, error: 'Format JSON salah' }, 400);
  }

  const rumah = normalizeRumah(body.rumah);
  const targetToken = String(body.target_token || body.token || '').trim();
  const status = String(body.status || 'ACTIVE').trim().toUpperCase();
  const adminToken = body.admin_token || request.headers.get('x-admin-token') || 'uji-spv-admin-master';

  if (!targetToken) {
    return json({ success: false, error: 'target_token wajib diisi' }, 400);
  }

  const rpcName = `${getRpcPrefix(rumah)}admin_set_token_status_bertoken`;
  try {
    const res = await panggilSupabaseRpc(rpcName, {
      p_token: adminToken,
      p_target_token: targetToken,
      p_status: status,
    }, env);
    return json(res);
  } catch (err) {
    return json({ success: false, error: String((err && err.message) || err) }, 500);
  }
}
