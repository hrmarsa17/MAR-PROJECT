/**
 * Worker GAS Tiruan (Staging / Panggung Latihan)
 *
 * PERINGATAN KERAS:
 * Worker ini TIDAK BOLEH memanggil Google Apps Script produksi maupun Google Sheets (AGENTS.md §5).
 * Fungsinya adalah meniru jawaban GAS untuk ketiga rumah (sum, kmbtra, kmbprojek)
 * di lingkungan staging agar tidak merusak spreadsheet dan payroll nyata.
 *
 * Aksi baca: Dijawab dari RPC Supabase Gedung 2 (dnnqrslftndcbmnvuveb).
 * Aksi tulis: Dijawab dengan format resmi GAS (misal nomor WO format GAS WO-YYYYMMDD-XXX)
 * tanpa pernah menulis ke Google Sheets.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // Endpoint Sehat / Status
    if (url.pathname.endsWith('/sehat') || (request.method === 'GET' && url.pathname === '/')) {
      return new Response(JSON.stringify({
        ok: true,
        layanan: 'abadiops-gas-tiruan',
        peran: 'GAS Tiruan Staging (Tanpa Google Sheets)',
        waktu: new Date().toISOString(),
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // Deteksi rumah dari pathname (/sum, /kmbtra, /kmbprojek), query (?rumah=...), atau header
    let rumah = '';
    const matchPath = url.pathname.match(/\/(sum|kmbtra|kmbprojek|kmb_projek)/i);
    if (matchPath) {
      rumah = matchPath[1].toLowerCase();
      if (rumah === 'kmb_projek') rumah = 'kmbprojek';
    } else if (url.searchParams.get('rumah')) {
      rumah = url.searchParams.get('rumah').toLowerCase();
    } else if (request.headers.get('x-abadi-rumah')) {
      rumah = request.headers.get('x-abadi-rumah').toLowerCase();
    }

    // Parse Body
    let parsed = {};
    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      try {
        if (contentType.includes('application/json') || contentType.includes('text/plain')) {
          const text = await request.text();
          if (text) parsed = JSON.parse(text);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const form = await request.formData();
          for (const [k, v] of form.entries()) {
            parsed[k] = v;
          }
        }
      } catch (_) {}
    }

    let dataObj = {};
    if (typeof parsed.data === 'string') {
      try { dataObj = JSON.parse(parsed.data); } catch(_) {}
    } else if (parsed.data && typeof parsed.data === 'object') {
      dataObj = parsed.data;
    }

    // Fallback bila parameter dikirim lewat query URL atau dataObj
    const action = parsed.action || url.searchParams.get('action') || dataObj.action || '';
    const token = parsed.token || url.searchParams.get('token') || dataObj.token || '';
    if (!rumah && parsed.rumah) rumah = String(parsed.rumah).toLowerCase();
    if (!rumah && dataObj.rumah) rumah = String(dataObj.rumah).toLowerCase();

    // Jalankan penanganan aksi
    return tanganiAksi(action, token, rumah, { ...parsed, ...dataObj }, env);
  },
};

async function tanganiAksi(action, token, rumah, parsed, env) {
  // 1. Verifikasi / Autentikasi: ping
  if (action === 'ping') {
    return tanganiPing(token, rumah, env);
  }

  // 2. Aksi Baca: pull_create_refs
  if (action === 'pull_create_refs') {
    return panggilRpcBertoken(rumah, 'create_refs', token, env);
  }

  // 3. Aksi Baca: pull_monitoring
  if (action === 'pull_monitoring') {
    return panggilRpcBertoken(rumah, 'monitoring', token, env);
  }

  // 4. Aksi Baca: pull_my_wos
  if (action === 'pull_my_wos') {
    return panggilRpcBertoken(rumah, 'my_wos', token, env);
  }

  // 5. Aksi Baca List WO: pull_pending, pull_active, pull_approved, pull_rejected
  if (['pull_pending', 'pull_active', 'pull_approved', 'pull_rejected'].includes(action)) {
    const statusMap = {
      pull_pending: 'pending',
      pull_active: 'active',
      pull_approved: 'approved',
      pull_rejected: 'rejected',
    };
    return panggilRpcStatus(rumah, statusMap[action], token, env);
  }

  // 6. Aksi Tulis (Simulasi Mandiri Tanpa Google Sheets)
  if (action === 'create_wo' || action === 'createWO') {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const mockWoId = `WO-${today}-${randomSuffix}`;
    return responJson({
      success: true,
      result: {
        wo_id: mockWoId,
        id: mockWoId,
        status: 'pending',
        message: 'Work order berhasil dibuat (Simulasi Staging)',
      },
      data: {
        wo_id: mockWoId,
        id: mockWoId,
        created: [{ wo_id: mockWoId, id: mockWoId }],
      },
    });
  }

  if (['submit_work', 'submit_job', 'submitMechanicWork'].includes(action)) {
    return responJson({
      success: true,
      result: {
        message: 'Pekerjaan berhasil diserahkan ke SPV (Simulasi Staging)',
      },
    });
  }

  if (['approve', 'supervisorApprove', 'superintendentApprove', 'handleSupervisorApprove', 'handleSuperintendentApprove', 'handleBulkApprove'].includes(action)) {
    return responJson({
      success: true,
      result: {
        message: 'Work order berhasil disetujui (Simulasi Staging)',
      },
    });
  }

  if (['reject', 'supervisorReject', 'superintendentReject', 'handleSupervisorReject', 'handleSuperintendentReject'].includes(action)) {
    return responJson({
      success: true,
      result: {
        message: 'Work order ditolak (Simulasi Staging)',
      },
    });
  }

  if (['cancel', 'cancelWO', 'handleCancelWO'].includes(action)) {
    return responJson({
      success: true,
      result: {
        message: 'Work order dibatalkan (Simulasi Staging)',
      },
    });
  }

  if (['dataDashboardTeknis', 'dataDashboardField'].includes(action)) {
    return responJson({
      success: true,
      data: { units: [], summary: {} },
    });
  }

  if (['riwayatHmUnit', 'riwayatKmUnit'].includes(action)) {
    return responJson({
      success: true,
      data: [],
    });
  }

  if (action === 'loadJobsCatalog') {
    return responJson({
      success: true,
      data: { jobs: [] },
    });
  }

  if (action === 'getWODetails') {
    return responJson({
      success: true,
      data: { id: parsed.wo_id || 'WO-STAGING', status: 'approved' },
    });
  }

  if (action === 'request_transfer') {
    return responJson({
      success: true,
      result: {
        message: 'Permohonan transfer berhasil diajukan (Simulasi Staging)',
      },
    });
  }

  // Fallback Aksi Umum Lainnya
  return responJson({
    success: true,
    result: {
      action,
      message: `Aksi ${action} diterima oleh GAS Tiruan Staging`,
    },
  });
}

/**
 * Tangani aksi ping.
 * Jika rumah sudah ditentukan, cek ke rumah tersebut.
 * Jika belum, cek ke ketiga rumah di Gedung 2 secara berurutan.
 */
async function tanganiPing(token, rumah, env) {
  if (!token) {
    return responJson({ success: false, error: 'Token tidak dikenal / nonaktif' });
  }

  // Dukungan token uji instan staging (uji-palsu-*)
  if (token.startsWith('uji-palsu-') || token.startsWith('test-')) {
    const t = token.toLowerCase();
    let tokenRumah = '';
    if (t.includes('sum')) tokenRumah = 'sum';
    else if (t.includes('kmbtra') || t.includes('-kmb-') || t.endsWith('-kmb')) tokenRumah = 'kmbtra';
    else if (t.includes('kmbp') || t.includes('projek')) tokenRumah = 'kmbprojek';

    // Jika dipanggil dari rumah tertentu dan token ditujukan untuk rumah lain, tolak
    if (rumah && tokenRumah && rumah !== tokenRumah) {
      return responJson({ success: false, error: 'Token tidak dikenal / nonaktif' });
    }

    const r = rumah || tokenRumah || 'kmbprojek';
    return responJson({
      success: true,
      result: {
        nama: `Tester Staging (${r.toUpperCase()})`,
        name: `Tester Staging (${r.toUpperCase()})`,
        role: token.includes('spv') ? 'supervisor' : (token.includes('spt') ? 'superintendent' : 'mechanic'),
        mechanic_id: `MECH-${r.toUpperCase()}-001`,
        token,
        rumah: r,
      },
    });
  }

  const rumahList = rumah ? [rumah] : ['sum', 'kmbtra', 'kmbprojek'];

  for (const r of rumahList) {
    const rpcName = dapatkanNamaRpc(r, 'ping');
    try {
      const res = await panggilRpcGedung2(rpcName, { p_token: token }, env);
      if (res && res.success === true && res.result) {
        return responJson({
          success: true,
          result: {
            ...res.result,
            rumah: r,
          },
        });
      }
    } catch (_) {}
  }

  return responJson({ success: false, error: 'Token tidak dikenal / nonaktif' });
}

async function panggilRpcBertoken(rumah, jenis, token, env) {
  const r = rumah || 'kmbprojek';
  const rpcName = dapatkanNamaRpc(r, jenis + '_bertoken');
  try {
    const res = await panggilRpcGedung2(rpcName, { p_token: token }, env);
    if (res && res.success !== undefined) {
      return responJson(res);
    }
    return responJson({ success: true, result: res });
  } catch (err) {
    return responJson({ success: false, error: String((err && err.message) || err) });
  }
}

async function panggilRpcStatus(rumah, status, token, env) {
  const r = rumah || 'kmbprojek';
  const rpcName = dapatkanNamaRpc(r, 'wos_by_status_bertoken');
  try {
    const res = await panggilRpcGedung2(rpcName, { p_status: status, p_token: token }, env);
    if (res && res.success !== undefined) {
      return responJson(res);
    }
    return responJson({ success: true, result: Array.isArray(res) ? res : [] });
  } catch (_) {
    // Jika fungsi belum ada atau gagal, kembalikan array kosong (standar GAS)
    return responJson({ success: true, result: [] });
  }
}

function dapatkanNamaRpc(rumah, namaAksi) {
  if (rumah === 'sum') {
    return `sum_${namaAksi}`;
  }
  if (rumah === 'kmbtra' || rumah === 'kmb') {
    return `kmbtra_${namaAksi}`;
  }
  // kmbprojek
  return `kmb_${namaAksi}`;
}

async function panggilRpcGedung2(rpcName, params, env) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${rpcName} HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

function responJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Abadi-Simulasi': 'gas-tiruan',
    },
  });
}
