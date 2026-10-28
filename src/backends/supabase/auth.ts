import { sql, dapatkanSql, type Tx } from '../../lib/db.js';
import { tidakBerhak } from '../../lib/errors.js';
import type { Identitas } from '../../lib/auth.js';

/**
 * Menukar token menjadi Identitas pengguna melalui database PostgreSQL / Supabase.
 */
export async function identitasDariTokenSupabase(
  token: string | null | undefined,
  tx?: Tx,
  sistem?: string | null,
): Promise<Identitas> {
  if (!token || token.trim().length < 8) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }
  const tokenClean = token.trim().toLowerCase();
  const s = sistem?.toUpperCase();
  let targetSql = sql;
  if (s === 'SUM' || tokenClean.startsWith('sum-') || tokenClean.startsWith('sum_')) {
    targetSql = dapatkanSql('SUM');
  } else if (s === 'KMB' || tokenClean.startsWith('kmb-') || tokenClean.startsWith('kmb_')) {
    targetSql = dapatkanSql('KMB');
  }
  const q = tx ?? targetSql;

  const tenantFromToken = tokenClean.startsWith('sum-') || tokenClean.startsWith('sum_')
    ? 'SUM'
    : tokenClean.startsWith('kmb-') || tokenClean.startsWith('kmb_')
      ? 'KMB'
      : null;

  // Coba resolusi dari skema cermin kmb_projek terlebih dahulu
  // Cermin ini khusus untuk KMB Project, jadi token harus prefix 'kmb-'
  if (tenantFromToken === 'KMB' || s === 'KMB') {
    try {
      const supaRows = await q<
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
         WHERE t.token = ${token.trim()}
           AND t.status = 'ACTIVE'
         LIMIT 1
      `;

      if (supaRows[0]) {
        const sr = supaRows[0];
        const peranRaw = sr.role?.toLowerCase() || 'mechanic';
        let peran: Identitas['peran'] = 'mechanic';
        if (peranRaw === 'superintendent' || peranRaw === 'manager' || peranRaw === 'l2') {
          peran = 'superintendent';
        } else if (peranRaw === 'supervisor' || peranRaw === 'planner' || peranRaw === 'l1' || peranRaw === 'foreman') {
          peran = 'supervisor';
        }
        const isL2 = peran === 'superintendent';
        const isL1 = peran === 'supervisor';

        const numMatch = sr.user_id?.match(/\d+/);
        const rawId = numMatch ? parseInt(numMatch[0], 10) : 1;
        const mechanicId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : 1;

        void q`UPDATE kmb_projek.api_tokens SET last_used_at = now() WHERE token = ${token.trim()}`.catch(() => {});

        return {
          mechanicId,
          tenantId: 1,
          tenantCode: 'KMB',
          nama: sr.name,
          peran,
          bolehLihat: {
            performa: isL2 || isL1,
            teknis: isL2 || isL1,
            report: isL2 || isL1,
          },
          bolehAdmin: isL2,
        };
      }
    } catch (_) {
      // Abaikan dan coba kueri skema utama di bawah
    }
  }

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

  const tenantFromDb = r.tenant_code.toUpperCase();

  if (tenantFromToken && tenantFromToken !== tenantFromDb) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }

  if (s && tenantFromDb !== s) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }

  void q`UPDATE api_tokens SET last_used_at = now() WHERE token = ${token.trim()}`.catch(() => {});

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