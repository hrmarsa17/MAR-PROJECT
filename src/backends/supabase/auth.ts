import { sql, type Tx } from '../../lib/db.js';
import { tidakBerhak } from '../../lib/errors.js';
import type { Identitas } from '../../lib/auth.js';

/**
 * Menukar token menjadi Identitas pengguna melalui database PostgreSQL / Supabase.
 */
export async function identitasDariTokenSupabase(
  token: string | null | undefined,
  tx?: Tx,
): Promise<Identitas> {
  if (!token || token.trim().length < 8) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }
  const q = tx ?? sql;
  const baris = await q<
    {
      mechanic_id: number; tenant_id: number; tenant_code: string; name: string; role: string;
      may_view_performance: boolean; may_view_technical: boolean; may_view_report: boolean;
      may_admin: boolean;
    }[]
  >`
    SELECT t.mechanic_id, t.tenant_id, tn.code::text AS tenant_code, m.name, m.role::text,
           m.may_view_performance, m.may_view_technical, m.may_view_report,
           m.may_admin
      FROM api_tokens t
      JOIN mechanics m ON m.id = t.mechanic_id
      JOIN tenants tn ON tn.id = t.tenant_id
     WHERE t.token = ${token.trim()}
       AND t.is_active
       AND t.revoked_at IS NULL
       AND (t.expires_at IS NULL OR t.expires_at > now())
       AND m.is_active
  `;
  const r = baris[0];
  if (!r) throw tidakBerhak('Token tidak dikenal atau tidak berlaku');

  // Jejak pemakaian, sengaja tidak menunggu
  void q`UPDATE api_tokens SET last_used_at = now() WHERE token = ${token.trim()}`.catch(() => {});

  const peran = r.role as Identitas['peran'];
  const l2 = peran === 'superintendent';

  return {
    mechanicId: Number(r.mechanic_id),
    tenantId: Number(r.tenant_id),
    tenantCode: String(r.tenant_code ?? ''),
    nama: r.name,
    peran,
    bolehLihat: {
      performa: l2 || r.may_view_performance === true,
      teknis: l2 || r.may_view_technical === true,
      report: l2 || r.may_view_report === true,
    },
    bolehAdmin: r.may_admin === true,
  };
}
