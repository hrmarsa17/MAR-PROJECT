import { APPSCRIPT_URL } from './backendConfig.js';
import { tidakBerhak } from './errors.js';
import type { Identitas } from './auth.js';

export interface GasResponse<T = unknown> {
  success: boolean;
  result?: T;
  data?: T;
  error?: string;
  me?: any;
}

/**
 * Memanggil Web App Google Apps Script via HTTP POST.
 *
 * Sesuai instruksi:
 * 1. Hanya mengakses endpoint APPSCRIPT_URL yang ditentukan.
 * 2. Tidak menulis/mengubah data jika dipanggil dalam konteks pembacaan.
 */
export async function panggilAppsScript<T = any>(
  token: string | null | undefined,
  action: string,
  data?: unknown,
  opId?: string,
): Promise<GasResponse<T>> {
  const body = JSON.stringify({
    token: token || undefined,
    action,
    data: data || {},
    op_id: opId || undefined,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body,
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Apps Script HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as GasResponse<T>;
    return json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Koneksi ke Google Apps Script melampaui batas waktu (timeout).');
    }
    throw err;
  }
}

/**
 * Menukar token menjadi Identitas pengguna melalui Google Apps Script.
 */
export async function identitasDariTokenAppsScript(token: string | null | undefined): Promise<Identitas> {
  if (!token || token.trim().length < 4) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }

  const res = await panggilAppsScript(token.trim(), 'ping');

  if (!res.success) {
    throw tidakBerhak(res.error || 'Token tidak dikenal atau tidak berlaku di Google Apps Script');
  }

  const me = (res.result || res.me || {}) as Record<string, any>;
  const peranRaw = String(me['role'] || 'mechanic').toLowerCase();
  
  let peran: Identitas['peran'] = 'mechanic';
  if (peranRaw === 'superintendent' || peranRaw === 'manager' || peranRaw === 'l2') {
    peran = 'superintendent';
  } else if (peranRaw === 'supervisor' || peranRaw === 'planner' || peranRaw === 'l1' || peranRaw === 'foreman') {
    peran = 'supervisor';
  }

  const isL2 = peran === 'superintendent';
  const isL1 = peran === 'supervisor';

  return {
    mechanicId: Number(me['mechanic_id'] || me['id'] || 1),
    tenantId: Number(me['tenant_id'] || 1),
    tenantCode: String(me['tenant_code'] || me['tenant'] || 'SUM'),
    nama: String(me['name'] || me['nama'] || token),
    peran,
    bolehLihat: {
      performa: isL2 || isL1 || Boolean(me['may_view_performance']),
      teknis: isL2 || isL1 || Boolean(me['may_view_technical']),
      report: isL2 || isL1 || Boolean(me['may_view_report']),
    },
    bolehAdmin: isL2 || Boolean(me['may_admin']),
  };
}
