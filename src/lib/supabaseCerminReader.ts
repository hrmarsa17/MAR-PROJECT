import { dapatkanSql } from './db.js';

/**
 * Reader Cermin Supabase (Tahap 4 AGENTS.md & docs/SAKLAR.md)
 * Membaca data langsung dari skema rumah (kmb_projek / sum) di Supabase Singapore.
 * Kecepatan sub-50ms (vs GAS ~6000ms - 8000ms).
 */

export interface PingResult {
  success: boolean;
  result: {
    mechanic_id: string;
    name: string;
    role: string;
    email: string;
    section: string;
    tenant_code: string;
  } | null;
  source: 'SUPABASE';
}

export async function bacaPingSupabase(token: string, sistem = 'KMB'): Promise<PingResult> {
  const sql = dapatkanSql(sistem);
  const rows = await sql<
    {
      token: string;
      role: string;
      name: string;
      user_id: string;
      email: string | null;
      section: string | null;
    }[]
  >`
    SELECT t.token, t.role, t.name, t.user_id, m.email, m.section
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m ON t.user_id = m.mechanic_id
     WHERE t.token = ${token.trim()}
       AND t.status = 'ACTIVE'
     LIMIT 1
  `;

  const r = rows[0];
  if (!r) {
    return { success: false, result: null, source: 'SUPABASE' };
  }

  return {
    success: true,
    result: {
      mechanic_id: r.user_id || '',
      name: r.name || '',
      role: r.role || 'mechanic',
      email: r.email || '',
      section: r.section || '',
      tenant_code: sistem.toUpperCase()
    },
    source: 'SUPABASE'
  };
}

export async function bacaCreateRefsSupabase(sistem = 'KMB') {
  const sql = dapatkanSql(sistem);
  const [units, components, mechanics, factors] = await Promise.all([
    sql<{ unit_code: string; model: string | null; section: string | null }[]>`
      SELECT unit_code, model, section 
        FROM kmb_projek.config_units 
       WHERE status = 'ACTIVE' 
       ORDER BY unit_code
    `,
    sql<{ component_id: string; name: string; section: string | null }[]>`
      SELECT component_id, name, section 
        FROM kmb_projek.config_components 
       WHERE status = 'ACTIVE' 
       ORDER BY component_id
    `,
    sql<{ mechanic_id: string; name: string; section: string }[]>`
      SELECT mechanic_id, name, section 
        FROM kmb_projek.config_mechanics 
       WHERE role = 'mechanic' AND status = 'ACTIVE' 
       ORDER BY mechanic_id
    `,
    sql<{ factor_type: string; key: string; value: number }[]>`
      SELECT factor_type, key, value FROM kmb_projek.config_factors
    `
  ]);

  return {
    success: true,
    source: 'SUPABASE',
    result: {
      refs: {
        sections: ['maintenance', 'vessel', 'field', 'workshop'],
        units: units.map(u => ({
          unit_id: u.unit_code,
          unit_name: u.unit_code,
          unit_type: u.section || 'OTHERS',
          unit_model: u.model || '',
          unit_scope: [u.section || 'all'],
          unit_factor: 1
        })),
        mechanics: mechanics.map(m => ({
          mechanic_id: m.mechanic_id,
          mechanic_name: m.name,
          section: m.section
        })),
        components: components.map(c => ({
          component_no: c.component_id,
          component_name: c.name,
          target_hours: 4
        })),
        jobs_field: components.filter(c => c.section === 'field' || !c.section).map(c => ({
          job_code: c.component_id,
          job_name: c.name,
          target_hours: 4
        })),
        jobs_workshop: components.filter(c => c.section === 'workshop').map(c => ({
          job_code: c.component_id,
          job_name: c.name,
          target_hours: 4
        })),
        jobs_vessel: components.filter(c => c.section === 'vessel').map(c => ({
          job_code: c.component_id,
          job_name: c.name,
          target_hours: 4
        })),
        factors: factors.map(f => ({
          type: f.factor_type,
          key: f.key,
          value: Number(f.value)
        })),
        work_conditions: ['NORMAL', 'OVERTIME', 'EMERGENCY']
      },
      pulled_at: new Date().toISOString()
    }
  };
}

export async function bacaMonitoringSupabase(sistem = 'KMB') {
  const sql = dapatkanSql(sistem);
  const mechanics = await sql<
    {
      id: string;
      name: string;
      section: string;
      token: string | null;
      pending_mechanic_work: number;
      pending_l1: number;
      pending_l2: number;
      approved: number;
    }[]
  >`
    SELECT m.mechanic_id as id, m.name, m.section, t.token,
           coalesce(count(w.wo_number) filter (where w.status = 'assigned'), 0)::int as pending_mechanic_work,
           coalesce(count(w.wo_number) filter (where w.status = 'pending_supervisor'), 0)::int as pending_l1,
           coalesce(count(w.wo_number) filter (where w.status = 'pending_superintendent'), 0)::int as pending_l2,
           coalesce(count(w.wo_number) filter (where w.status = 'approved'), 0)::int as approved
      FROM kmb_projek.config_mechanics m
      LEFT JOIN kmb_projek.api_tokens t ON t.user_id = m.mechanic_id
      LEFT JOIN kmb_projek.work_orders w ON w.lead_mechanic_id = m.mechanic_id
     WHERE m.role = 'mechanic'
     GROUP BY m.mechanic_id, m.name, m.section, t.token
     ORDER BY m.mechanic_id
  `;

  const list = mechanics.map(m => ({
    id: m.id,
    name: m.name,
    section: m.section,
    token: m.token || '',
    has_token: !!m.token,
    uji: '',
    pending_mechanic_work: Number(m.pending_mechanic_work) || 0,
    pending_l1: Number(m.pending_l1) || 0,
    pending_l2: Number(m.pending_l2) || 0,
    approved: Number(m.approved) || 0
  }));

  const overall = {
    total_mechanics: list.length,
    pending_mechanic_work: list.reduce((a, b) => a + b.pending_mechanic_work, 0),
    pending_l1: list.reduce((a, b) => a + b.pending_l1, 0),
    pending_l2: list.reduce((a, b) => a + b.pending_l2, 0),
    approved: list.reduce((a, b) => a + b.approved, 0)
  };

  return {
    success: true,
    source: 'SUPABASE',
    result: {
      overall,
      mechanics: list,
      pulled_at: new Date().toISOString()
    }
  };
}

export async function bacaMyWosSupabase(mechanicIdOrToken: string, sistem = 'KMB') {
  const sql = dapatkanSql(sistem);
  const wos = await sql<
    {
      wo_number: string;
      date: string;
      shift: string | null;
      unit_code: string;
      component: string;
      activity: string;
      duration_hours: number;
      status: string;
      points: number;
      created_by: string | null;
      lead_mechanic_id: string | null;
    }[]
  >`
    SELECT wo_number, date::text, shift, unit_code, component, activity,
           duration_hours, status, points, created_by, lead_mechanic_id
      FROM kmb_projek.work_orders
     WHERE lead_mechanic_id = ${mechanicIdOrToken}
        OR created_by = ${mechanicIdOrToken}
     ORDER BY created_at DESC
     LIMIT 50
  `;

  return {
    success: true,
    source: 'SUPABASE',
    result: {
      wos: wos.map(w => ({
        wo_number: w.wo_number,
        date: w.date,
        shift: w.shift || '1',
        unit_code: w.unit_code,
        component: w.component,
        activity: w.activity,
        duration_hours: Number(w.duration_hours) || 0,
        status: w.status,
        points: Number(w.points) || 0
      })),
      pulled_at: new Date().toISOString()
    }
  };
}

export async function bacaWosByStatusSupabase(status: string, sistem = 'KMB') {
  const sql = dapatkanSql(sistem);
  let statusFilter = sql`status = ${status}`;
  if (status === 'pending') {
    statusFilter = sql`status IN ('pending_supervisor', 'pending_superintendent')`;
  } else if (status === 'active') {
    statusFilter = sql`status IN ('assigned', 'in_progress', 'draft')`;
  }

  const wos = await sql<
    {
      wo_number: string;
      date: string;
      shift: string | null;
      unit_code: string;
      component: string;
      activity: string;
      duration_hours: number;
      status: string;
      points: number;
      lead_mechanic_id: string | null;
    }[]
  >`
    SELECT wo_number, date::text, shift, unit_code, component, activity,
           duration_hours, status, points, lead_mechanic_id
      FROM kmb_projek.work_orders
     WHERE ${statusFilter}
     ORDER BY created_at DESC
     LIMIT 100
  `;

  return {
    success: true,
    source: 'SUPABASE',
    result: {
      wos: wos.map(w => ({
        wo_number: w.wo_number,
        date: w.date,
        shift: w.shift || '1',
        unit_code: w.unit_code,
        component: w.component,
        activity: w.activity,
        duration_hours: Number(w.duration_hours) || 0,
        status: w.status,
        points: Number(w.points) || 0
      })),
      pulled_at: new Date().toISOString()
    }
  };
}
