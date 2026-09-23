import { APPSCRIPT_URL } from './backendConfig.js';
import { tidakBerhak, GalatAplikasi } from './errors.js';
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
      if (res.status === 404) {
        throw tidakBerhak('Google Apps Script 404: ID yang dipasang adalah Script ID. Diperlukan Web App Deployment URL (yang berawalan AKfycb...).');
      }
      throw tidakBerhak(`Google Apps Script HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as GasResponse<T>;
    } catch {
      throw tidakBerhak('Google Apps Script tidak mengembalikan format JSON. Pastikan Web App disetel "Execute as: Me" dan "Who has access: Anyone".');
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err instanceof GalatAplikasi) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw tidakBerhak('Koneksi ke Google Apps Script melampaui batas waktu (timeout).');
    }
    throw tidakBerhak(`Gagal terhubung ke Google Apps Script: ${err.message}`);
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

  const rawId = Number(me['id'] ?? (typeof me['mechanic_id'] === 'number' ? me['mechanic_id'] : 1));
  const mechanicId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : 1;

  return {
    mechanicId,
    tenantId: Number(me['tenant_id'] || 1),
    tenantCode: String(me['tenant_code'] || me['tenant'] || 'SUM'),
    nama: String(me['name'] || me['nama'] || me['mechanic_id'] || token),
    peran,
    bolehLihat: {
      performa: isL2 || isL1 || Boolean(me['may_view_performance']),
      teknis: isL2 || isL1 || Boolean(me['may_view_technical']),
      report: isL2 || isL1 || Boolean(me['may_view_report']),
    },
    bolehAdmin: isL2 || Boolean(me['may_admin']),
  };
}
