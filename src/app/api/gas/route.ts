import { dapatkanAppscriptUrl, pakaiAppsScript } from '../../../lib/backendConfig.js';
import {
  bacaPingSupabase,
  bacaCreateRefsSupabase,
  bacaMonitoringSupabase,
  bacaMyWosSupabase,
  bacaWosByStatusSupabase,
} from '../../../lib/supabaseCerminReader.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MAR-System, X-MAR-Tenant',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let action = '';
    let token = '';
    let system = 'KMB';
    let data: any = {};
    let rawBody = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      action = params.get('action') || '';
      system = params.get('system') || 'KMB';
      const rawData = params.get('data');
      if (rawData) {
        try {
          data = JSON.parse(rawData);
          token = data.token || '';
        } catch (_) {}
      }
    } else {
      rawBody = await req.text();
      try {
        const parsed = JSON.parse(rawBody);
        action = parsed.action || '';
        token = parsed.token || '';
        system = parsed.system || 'KMB';
        data = parsed.data || {};
      } catch (_) {
        // Fallback text
      }
    }

    const headerSystem = req.headers.get('x-mar-system') || req.headers.get('x-mar-tenant');
    if (headerSystem) {
      system = headerSystem.toUpperCase();
    }

    const reqUrl = new URL(req.url);
    const reqEngine = (
      req.headers.get('x-active-engine') ||
      reqUrl.searchParams.get('engine') ||
      data?.engine ||
      'SUPABASE'
    ).toUpperCase();

    const isSupabaseSelected =
      (reqEngine === 'SUPABASE' || reqEngine === 'POSTGRES') &&
      reqEngine !== 'SPREADSHEET' &&
      reqEngine !== 'SHEETS' &&
      reqEngine !== 'GAS';

    // =========================================================================
    // JALUR SUPABASE (Aktif saat engine=SUPABASE dan saklar aktif)
    // Sesuai Tahap 4: Aksi baca dialihkan ke Supabase Cermin
    // =========================================================================
    if (isSupabaseSelected && !pakaiAppsScript()) {
      if (action === 'ping' && token) {
        const pingRes = await bacaPingSupabase(token, system);
        return Response.json(pingRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE', 'X-Active-Engine': 'SUPABASE' },
        });
      }

      if (action === 'pull_create_refs') {
        const refsRes = await bacaCreateRefsSupabase(system);
        return Response.json(refsRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_monitoring') {
        const monRes = await bacaMonitoringSupabase(system);
        return Response.json(monRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_my_wos') {
        const mechId = data?.mechanic_id || token;
        const wosRes = await bacaMyWosSupabase(mechId, system);
        return Response.json(wosRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_pending') {
        const pendingRes = await bacaWosByStatusSupabase('pending', system);
        return Response.json(pendingRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_active') {
        const activeRes = await bacaWosByStatusSupabase('active', system);
        return Response.json(activeRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_approved') {
        const approvedRes = await bacaWosByStatusSupabase('approved', system);
        return Response.json(approvedRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }

      if (action === 'pull_rejected') {
        const rejRes = await bacaWosByStatusSupabase('rejected', system);
        return Response.json(rejRes, {
          headers: { 'Access-Control-Allow-Origin': '*', 'X-MAR-Backend': 'SUPABASE' },
        });
      }
    }

    // =========================================================================
    // JALUR GOOGLE APPS SCRIPT (Default / Fallback / Aksi Tulis Lama)
    // =========================================================================
    const gasUrl = dapatkanAppscriptUrl(token, system);
    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType || 'application/json',
      },
      body: rawBody,
      redirect: 'follow',
    });

    const gasJson = await gasRes.json();
    return Response.json(gasJson, {
      status: gasRes.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'X-MAR-Backend': 'GAS',
        'X-Active-Engine': 'SPREADSHEET',
      },
    });
  } catch (err: any) {
    return Response.json(
      { success: false, error: err.message || 'Terjadi kesalahan pada router' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
