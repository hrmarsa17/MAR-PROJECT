import { sql, dapatkanSql, type Tx } from '../../lib/db.js';
import { tidakBerhak } from '../../lib/errors.js';
import type { Identitas } from '../../lib/auth.js';

type TokenRow = {
  mechanic_id: number;
  tenant_id: number;
  tenant_code: string;
  name: string;
  role: string;
  may_view_performance: boolean;
  may_view_technical: boolean;
  may_view_report: boolean;
  may_admin: boolean;
};

export async function identitasDariTokenSupabase(
  token: string | null | undefined,
  tx?: Tx,
  sistem?: string | null,
): Promise<Identitas> {
  if (!token || token.trim().length < 8) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }
  const cleanToken = token.trim();
  const s = sistem?.toUpperCase();
  const q = tx ?? sql;

  // 1. Coba cari di public schema api_tokens
  let baris: TokenRow[] = [];
  try {
    baris = await q<TokenRow[]>`
      SELECT t.mechanic_id, t.tenant_id, tn.code::text AS tenant_code, m.name, m.role::text,
             m.may_view_performance, m.may_view_technical, m.may_view_report, m.may_admin
        FROM api_tokens t
        JOIN mechanics m ON m.id = t.mechanic_id
        JOIN tenants tn ON tn.id = t.tenant_id
       WHERE t.token = ${cleanToken}
         AND t.is_active
         AND t.revoked_at IS NULL
         AND (t.expires_at IS NULL OR t.expires_at > now())
         AND m.is_active
       LIMIT 1
    `;
  } catch (_) {}

  // 2. Coba cari di skema sum (relasional) jika belum ditemukan
  if (!baris[0]) {
    try {
      const sumRows = await q<TokenRow[]>`
        SELECT t.mechanic_id, t.tenant_id, tn.code::text AS tenant_code, m.name, m.role::text,
               m.may_view_performance, m.may_view_technical, m.may_view_report, m.may_admin
          FROM sum.api_tokens t
          JOIN sum.mechanics m ON m.id = t.mechanic_id
          JOIN sum.tenants tn ON tn.id = t.tenant_id
         WHERE t.token = ${cleanToken}
           AND t.is_active
           AND t.revoked_at IS NULL
           AND (t.expires_at IS NULL OR t.expires_at > now())
           AND m.is_active
         LIMIT 1
      `;
      if (sumRows[0]) baris = sumRows;
    } catch (_) {}
  }

  // 3. Coba cari di skema cermin kmb_projek
  if (!baris[0]) {
    try {
      const kmbRows = await q<
        {
          user_id: string;
          name: string;
          role: string;
          email: string | null;
          section: string | null;
        }[]
      >`
        SELECT t.user_id, t.name, t.role, m.email, m.section
          FROM kmb_projek.api_tokens t
          LEFT JOIN kmb_projek.config_mechanics m ON t.user_id = m.mechanic_id
         WHERE t.token = ${cleanToken}
           AND t.status = 'ACTIVE'
         LIMIT 1
      `;

      if (kmbRows[0]) {
        const sr = kmbRows[0];
        const peranRaw = sr.role?.toLowerCase() || 'mechanic';
        let peran: Identitas['peran'] = 'mechanic';
        if (peranRaw === 'superintendent' || peranRaw === 'manager' || peranRaw === 'l2') {
          peran = 'superintendent';
        } else if (peranRaw === 'supervisor' || peranRaw === 'planner' || peranRaw === 'l1' || peranRaw === 'foreman') {
          peran = 'supervisor';
        }
        const isL2 = peran === 'superintendent';
        const numMatch = sr.user_id?.match(/\d+/);
        const rawId = numMatch ? parseInt(numMatch[0], 10) : 1;
        const mechanicId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : 1;

        void q`UPDATE kmb_projek.api_tokens SET last_used_at = now() WHERE token = ${cleanToken}`.catch(() => {});

        return {
          mechanicId,
          tenantId: 1,
          tenantCode: 'KMB',
          nama: sr.name,
          peran,
          bolehLihat: {
            performa: true,
            teknis: true,
            report: true,
          },
          bolehAdmin: isL2,
        };
      }
    } catch (_) {}
  }

  const r = baris[0];
  if (!r) throw tidakBerhak('Token tidak dikenal atau tidak berlaku');

  const tenantFromDb = r.tenant_code.toUpperCase();

  void q`UPDATE api_tokens SET last_used_at = now() WHERE token = ${cleanToken}`.catch(() => {});

  const peran = r.role as Identitas['peran'];
  const l2 = peran === 'superintendent';

  return {
    mechanicId: Number(r.mechanic_id),
    tenantId: Number(r.tenant_id),
    tenantCode: tenantFromDb,
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
