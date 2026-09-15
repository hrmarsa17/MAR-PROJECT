import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';

/**
 * MONITORING — pipeline per mekanik.
 *
 * Satu kueri untuk semua mekanik sekaligus, bukan satu kueri per orang. Di
 * KMB V2 layar ini pernah jadi salah satu yang terberat karena setiap kartu
 * memicu pencarian sendiri ke sheet.
 */

export interface KartuMekanik {
  id: number;
  kode: string;
  nama: string;
  section: string | null;
  jabatan: string | null;
  akun_uji: boolean;
  perlu_diisi: number;
  menunggu_l1: number;
  menunggu_l2: number;
  approved: number;
  token_petunjuk: string | null;
  punya_token: boolean;
}

export interface RingkasMonitoring {
  mekanik: number;
  perlu_diisi: number;
  menunggu_approval: number;
  approved: number;
}

export async function ringkasMonitoring(aku: Identitas): Promise<RingkasMonitoring> {
  const r = (
    await sql<Record<string, string>[]>`
      SELECT
        (SELECT count(*) FROM mechanics WHERE tenant_id = ${aku.tenantId} AND is_active) AS mekanik,
        count(*) FILTER (WHERE w.status IN ('pending_mechanic_work','in_progress')) AS perlu_diisi,
        count(*) FILTER (WHERE w.status IN ('pending_supervisor','pending_superintendent')) AS menunggu_approval,
        count(*) FILTER (WHERE w.status = 'approved') AS approved
      FROM work_orders w
      WHERE w.tenant_id = ${aku.tenantId}
    `
  )[0]!;
  return {
    mekanik: Number(r['mekanik']),
    perlu_diisi: Number(r['perlu_diisi']),
    menunggu_approval: Number(r['menunggu_approval']),
    approved: Number(r['approved']),
  };
}

export async function kartuMekanik(aku: Identitas): Promise<KartuMekanik[]> {
  return sql<KartuMekanik[]>`
    SELECT
      m.id,
      m.mechanic_code::text AS kode,
      m.name               AS nama,
      sec.section          AS section,
      pr.label             AS jabatan,
      m.is_test_account    AS akun_uji,

      coalesce(h.perlu_diisi, 0)  AS perlu_diisi,
      coalesce(h.menunggu_l1, 0)  AS menunggu_l1,
      coalesce(h.menunggu_l2, 0)  AS menunggu_l2,
      coalesce(h.approved, 0)     AS approved,

      t.token_hint::text   AS token_petunjuk,
      (t.token_hint IS NOT NULL) AS punya_token

    FROM mechanics m
    LEFT JOIN pay_rates pr ON pr.id = m.pay_rate_id
    LEFT JOIN LATERAL (
      SELECT string_agg(ms.section::text, ', ' ORDER BY ms.section::text) AS section
        FROM mechanic_sections ms WHERE ms.mechanic_id = m.id
    ) sec ON true
    LEFT JOIN LATERAL (
      -- Dihitung dari keanggotaan tim, bukan dari siapa yang membuat WO:
      -- yang ditunggu mekanik adalah pekerjaan yang MELIBATKAN dia.
      SELECT
        count(*) FILTER (WHERE w.status IN ('pending_mechanic_work','in_progress')) AS perlu_diisi,
        count(*) FILTER (WHERE w.status = 'pending_supervisor')                     AS menunggu_l1,
        count(*) FILTER (WHERE w.status = 'pending_superintendent')                 AS menunggu_l2,
        count(*) FILTER (WHERE w.status = 'approved')                               AS approved
      FROM work_order_team wt
      JOIN work_orders w ON w.id = wt.work_order_id
      WHERE wt.mechanic_id = m.id
    ) h ON true
    LEFT JOIN LATERAL (
      -- Hanya PETUNJUK (4 huruf terakhir). Token utuh tidak tersimpan di mana
      -- pun, jadi layar ini tidak bisa lagi memamerkannya seperti KMB V2.
      SELECT at.token_hint FROM api_tokens at
       WHERE at.mechanic_id = m.id AND at.is_active AND at.revoked_at IS NULL
       ORDER BY at.created_at DESC LIMIT 1
    ) t ON true

    WHERE m.tenant_id = ${aku.tenantId} AND m.is_active
    ORDER BY m.name
  `;
}
