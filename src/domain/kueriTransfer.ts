import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';

/**
 * BACAAN TAB TRANSFER WO.
 *
 * Port dari `getPendingTransfers` (`ApprovalService.js:1977`).
 *
 * Yang dibawa apa adanya, dan kenapa: kartunya menyebut **angka jamnya sebelum
 * tombol**, bukan sesudah (`Approval.html:502-512`). Keputusan ini menambah jam
 * kerja yang dibayar — atau menghanguskannya — dan approver harus melihat
 * konsekuensinya tanpa menghitung sendiri.
 *
 * Gerbang PERANnya juga ikut: di KMB V2 fungsi ini sempat hanya menyaring
 * section, tidak peran, sehingga token MEKANIK bisa menarik daftar permintaan
 * transfer rekan sekelompoknya lengkap dengan jam sesi mereka
 * (`ApprovalService.js:1981-1988`). Menyembunyikan tabnya tidak cukup.
 */

export interface KartuTransfer {
  transferId: number;
  woId: number;
  woNumber: string;
  section: string | null;
  keterangan: string | null;

  dimintaOleh: string;
  dimintaAt: string;
  catatan: string | null;

  /** Jam yang AKAN ditambahkan bila disetujui, atau hangus bila ditolak. */
  sessionHours: number;
  partialSekarang: number;
  partialSesudah: number;

  tim: { mechanicId: number; nama: string }[];
}

export async function kartuTransfer(aku: Identitas): Promise<KartuTransfer[]> {
  if (aku.peran === 'mechanic') return [];

  const scope = await sql<{ section: string }[]>`
    SELECT section::text FROM mechanic_sections WHERE mechanic_id = ${aku.mechanicId}
  `;
  const daftarScope = scope.length === 0 ? null : scope.map((s) => s.section);

  const baris = await sql<{
    transfer_id: number; wo_id: number; wo_number: string;
    section: string | null; keterangan: string | null;
    diminta_oleh: string; diminta_at: Date; catatan: string | null;
    session_hours: string; partial_hours: string;
    tim: { mechanic_id: number; nama: string }[] | null;
  }[]>`
    SELECT
      tr.id           AS transfer_id,
      w.id            AS wo_id,
      w.wo_number,
      s.code::text    AS section,
      w.keterangan,
      peminta.name    AS diminta_oleh,
      tr.requested_at AS diminta_at,
      tr.note         AS catatan,
      tr.session_hours,
      w.partial_hours,
      tim.daftar      AS tim
    FROM work_order_transfers tr
    JOIN work_orders w       ON w.id = tr.work_order_id
    JOIN sections    s       ON s.id = w.section_id
    JOIN mechanics   peminta ON peminta.id = tr.requested_by
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('mechanic_id', m.id, 'nama', m.name)
                      ORDER BY m.name) AS daftar
        FROM work_order_team t JOIN mechanics m ON m.id = t.mechanic_id
       WHERE t.work_order_id = w.id
    ) tim ON true
    WHERE w.tenant_id = ${aku.tenantId}
      AND tr.decision IS NULL
      AND w.status = 'pending_transfer'
      AND (${daftarScope}::text[] IS NULL OR s.code::text = ANY(${daftarScope}::text[]))
    ORDER BY tr.requested_at ASC
  `;

  return baris.map((r) => {
    const sesi = Number(r.session_hours ?? 0);
    const partial = Number(r.partial_hours ?? 0);
    return {
      transferId: Number(r.transfer_id),
      woId: Number(r.wo_id),
      woNumber: r.wo_number,
      section: r.section,
      keterangan: r.keterangan,
      dimintaOleh: r.diminta_oleh,
      dimintaAt: r.diminta_at.toISOString(),
      catatan: r.catatan,
      sessionHours: sesi,
      partialSekarang: partial,
      partialSesudah: Math.round((partial + sesi) * 100) / 100,
      tim: (r.tim ?? []).map((t) => ({
        mechanicId: Number(t.mechanic_id), nama: t.nama,
      })),
    };
  });
}

/**
 * Calon penerima transfer.
 *
 * Akun uji ikut disembunyikan dari sini — sama seperti dropdown tim di Create
 * WO. Mekanik yang tidak ada di lapangan tidak boleh bisa dipilih menerima
 * pekerjaan yang sungguhan.
 */
export async function calonPenerima(
  aku: Identitas,
): Promise<{ id: number; nama: string; kode: string }[]> {
  const r = await sql<{ id: number; nama: string; kode: string }[]>`
    SELECT id, name AS nama, mechanic_code::text AS kode
      FROM mechanics
     WHERE tenant_id = ${aku.tenantId} AND is_active
       AND role = 'mechanic' AND is_test_account = false
     ORDER BY name
  `;
  return r.map((m) => ({ id: Number(m.id), nama: m.nama, kode: m.kode }));
}
