/**
 * HYBRID DATABASE INTERFACE
 *
 * Abstraction layer supporting:
 * - Google Sheets (via Apps Script)
 * - Supabase/PostgreSQL (direct)
 * - One-way sync: Sheets → Supabase
 *
 * All queries route through backendConfig to select driver.
 */

import { pakaiAppsScript } from './backendConfig.js';
import { sql, type Tx } from './db.js';
import { panggilAppsScript } from '../backends/appscript/client.js';
import type { Identitas } from './auth.js';

export type QueryResult<T> = T[];

/**
 * Generic query interface supporting both backends.
 * Apps Script: HTTP POST with action/data
 * Supabase: Direct SQL
 */
export async function kueri<T>(
  action: string,
  data?: Record<string, any>,
  token?: string,
): Promise<QueryResult<T>> {
  if (pakaiAppsScript()) {
    const res = await panggilAppsScript<T[]>(token, action, data);
    if (!res.success) {
      throw new Error(`Apps Script error: ${res.error}`);
    }
    return res.result || res.data || [];
  }

  throw new Error('Supabase backend not yet configured for direct queries');
}

/**
 * Write operation (create/update) — routed by backend.
 */
export async function tulis<T>(
  action: string,
  data: Record<string, any>,
  token?: string,
): Promise<T> {
  if (pakaiAppsScript()) {
    const res = await panggilAppsScript<T>(token, action, data);
    if (!res.success) {
      throw new Error(`Apps Script error: ${res.error}`);
    }
    return (res.result || res.data) as T;
  }

  throw new Error('Supabase backend not yet configured for write operations');
}

/**
 * Work order query (KMB-specific).
 */
export async function beriWO(
  token: string,
  filters?: { status?: string; section?: string; mechanicId?: number },
): Promise<
  Array<{
    wo_id: string;
    wo_number: string;
    unit_id: string;
    component_id: string;
    status: string;
    section: string;
    start_time: string;
    end_time: string;
    actual_hours: number;
    final_points: number;
  }>
> {
  return kueri(
    'listWorkOrders',
    {
      filters: filters || {},
    },
    token,
  );
}

/**
 * Approval queue (supervisor/superintendent).
 */
export async function beriApprovalQueue(
  token: string,
  stage: 'supervisor' | 'superintendent',
): Promise<
  Array<{
    wo_id: string;
    wo_number: string;
    mechanic_name: string;
    status: string;
    submitted_at: string;
  }>
> {
  return kueri('listApprovalsForStage', { stage }, token);
}

/**
 * Config mechanics (team roster).
 */
export async function beriMekanik(token: string): Promise<
  Array<{
    mechanic_id: string;
    mechanic_name: string;
    email: string;
    role: string;
    section: string;
    is_active: boolean;
  }>
> {
  return kueri('listMechanics', {}, token);
}

/**
 * Units (equipment).
 */
export async function beriUnit(token: string): Promise<
  Array<{
    unit_id: string;
    unit_name: string;
    unit_type: string;
    unit_factor: number;
    is_active: boolean;
  }>
> {
  return kueri('listUnits', {}, token);
}

/**
 * Job catalog (components).
 */
export async function beriKatalog(token: string): Promise<
  Array<{
    component_no: string;
    component_name: string;
    category: string;
    section: string;
    base_points: number;
    target_hours: number;
    is_active: boolean;
  }>
> {
  return kueri('listComponents', {}, token);
}

/**
 * Create work order.
 */
export async function buatWO(
  token: string,
  data: {
    unit_id: string;
    component_id: string;
    section: string;
    work_condition: string;
  },
): Promise<{ wo_id: string; wo_number: string }> {
  return tulis('createWorkOrder', data, token);
}

/**
 * Submit work (mechanic finishes WO).
 */
export async function kirimPekerjaan(
  token: string,
  wo_id: string,
  data: {
    end_time: string;
    actual_hours: number;
    hour_meter?: string;
    kilometers?: string;
  },
): Promise<{ success: boolean }> {
  return tulis('submitWorkOrder', { wo_id, ...data }, token);
}

/**
 * Approve work (supervisor L1).
 */
export async function setujuL1(
  token: string,
  wo_id: string,
  decision: 'approve' | 'reject' | 'return',
  notes?: string,
): Promise<{ success: boolean }> {
  return tulis('approveWorkOrderL1', { wo_id, decision, notes }, token);
}

/**
 * Approve work (superintendent L2).
 */
export async function setujuL2(
  token: string,
  wo_id: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<{ success: boolean }> {
  return tulis('approveWorkOrderL2', { wo_id, decision, notes }, token);
}
