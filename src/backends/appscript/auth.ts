import { panggilAppsScript } from './client.js';
import { tidakBerhak } from '../../lib/errors.js';
import type { Identitas } from '../../lib/auth.js';

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

  let tenantCode = (process.env['DEFAULT_TENANT'] || 'KMB').toUpperCase();
  if (me['tenant_code'] || me['tenant']) {
    tenantCode = String(me['tenant_code'] || me['tenant']).toUpperCase();
  } else if (token && token.toLowerCase().startsWith('sum')) {
    tenantCode = 'SUM';
  } else if (token && token.toLowerCase().startsWith('kmb')) {
    tenantCode = 'KMB';
  }

  return {
    mechanicId,
    tenantId: Number(me['tenant_id'] || (tenantCode === 'SUM' ? 2 : 1)),
    tenantCode,
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
