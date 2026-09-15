import { angka, type Tx } from '../lib/db.js';
import { aturanBisnis, konflikKeadaan, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, rebutStatus, type HasilPerintah } from './runCommand.js';
import { muatFaktor, nilaiEfektif } from './nilaiEfektif.js';
import { hitungSkor, rupiahUntukPoin } from './scoring.js';

/**
 * APPROVE — jalur tempat uang terbit.
 *
 * Seluruh berkas ini berdiri di atas satu kalimat: status berubah menjadi
 * `approved` dan poin tercatat DALAM SATU TRANSAKSI, atau tidak satu pun
 * terjadi.
 *
 * Di KMB V2 keduanya adalah langkah terpisah di dalam sebuah kunci, dan
 * eksekusi yang mati di antaranya (batas 6 menit Apps Script) meninggalkan WO
 * berstatus approved tanpa poin — "poin hilang" yang baru ketahuan keesokan
 * harinya. Di sana itu ditambal dengan mode lanjutan dan penjaga terjadwal.
 * Di sini keadaan itu tidak bisa ada.
 */

async function perankuAdalah(tx: Tx, mechanicId: number): Promise<string> {
  const r = (
    await tx<{ role: string }[]>`
      SELECT role::text FROM mechanics WHERE id = ${mechanicId} AND is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', mechanicId);
  return r.role;
}

async function siapaYangMemproses(tx: Tx, woId: number) {
  return (
    await tx<{ status: string; wo_number: string; nama: string | null }[]>`
      SELECT w.status::text, w.wo_number,
             coalesce(m2.name, m1.name) AS nama
        FROM work_orders w
        LEFT JOIN mechanics m1 ON m1.id = w.approved_l1_by
        LEFT JOIN mechanics m2 ON m2.id = w.approved_l2_by
       WHERE w.id = ${woId}
    `
  )[0];
}

export interface MasukanApprove {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  /** Pilihan approver, bukan hitungan. Lihat catatan MTBF di PETA-KMB-V2 §4. */
  mtbfRedoStatus?: 'first_time' | 'redo';
  safetyIncident?: boolean;
  judgment?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// L1
// ────────────────────────────────────────────────────────────────────────────

export async function approveL1(m: MasukanApprove): Promise<HasilPerintah<{ woId: number; status: string }>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'approve_l1',
    jalankan: async ({ tx }) => {
      const peran = await perankuAdalah(tx, m.actorId);
      if (peran !== 'supervisor' && peran !== 'superintendent') {
        throw tidakBerhak('Hanya L1 atau L2 yang boleh menyetujui tahap ini');
      }

      const wo = await rebutStatus(tx, m.woId, ['pending_supervisor'], 'pending_superintendent');
      if (!wo) {
        const kini = await siapaYangMemproses(tx, m.woId);
        if (!kini) throw tidakDitemukan('Work order', m.woId);
        throw konflikKeadaan(
          `WO ${kini.wo_number} sudah diproses${kini.nama ? ' oleh ' + kini.nama : ''}`,
          { status: kini.status },
        );
      }

      await tx`
        UPDATE work_orders
           SET approved_l1_by = ${m.actorId},
               approved_l1_at = now(),
               mtbf_redo_status = coalesce(${m.mtbfRedoStatus ?? null}, mtbf_redo_status, 'first_time'),
               safety_incident  = coalesce(${m.safetyIncident ?? null}, safety_incident)
         WHERE id = ${m.woId}
      `;

      await tx`
        INSERT INTO approvals (work_order_id, stage, decision, putaran, approver_id, judgment)
        VALUES (${m.woId}, 'supervisor', 'approve', ${Number(wo['putaran'])},
                ${m.actorId}, ${m.judgment ?? null})
      `;

      await catat(tx, m.tenantId, m.actorId, 'approve_l1', m.woId, {
        wo_number: wo['wo_number'],
      });

      return { woId: m.woId, status: 'pending_superintendent' };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// L2 — di sinilah rupiah terbit
// ────────────────────────────────────────────────────────────────────────────

export interface HasilApproveL2 {
  woId: number;
  woNumber: string;
  finalPoints: number;
  dibayar: { mechanicId: number; points: number; idr: number }[];
}

export async function approveL2(m: MasukanApprove): Promise<HasilPerintah<HasilApproveL2>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'approve_l2',
    jalankan: async ({ tx }) => {
      const peran = await perankuAdalah(tx, m.actorId);
      if (peran !== 'superintendent') {
        throw tidakBerhak('Hanya L2 yang boleh menyetujui tahap akhir');
      }

      // Merebut keadaan dan menerbitkan uang adalah satu tindakan.
      const wo = await rebutStatus(tx, m.woId, ['pending_superintendent'], 'approved');
      if (!wo) {
        const kini = await siapaYangMemproses(tx, m.woId);
        if (!kini) throw tidakDitemukan('Work order', m.woId);
        throw konflikKeadaan(
          kini.status === 'approved'
            ? `WO ${kini.wo_number} sudah disetujui${kini.nama ? ' oleh ' + kini.nama : ''}`
            : `WO ${kini.wo_number} tidak lagi menunggu persetujuan L2`,
          { status: kini.status },
        );
      }

      if (m.mtbfRedoStatus || m.safetyIncident !== undefined) {
        await tx`
          UPDATE work_orders
             SET mtbf_redo_status = coalesce(${m.mtbfRedoStatus ?? null}, mtbf_redo_status),
                 safety_incident  = coalesce(${m.safetyIncident ?? null}, safety_incident)
           WHERE id = ${m.woId}
        `;
      }

      const nilai = await nilaiEfektif(tx, m.woId);
      if (nilai.team.length === 0) {
        throw aturanBisnis('WO tanpa anggota tim tidak bisa disetujui', { woId: m.woId });
      }

      const faktor = await muatFaktor(tx, m.tenantId);
      const skor = hitungSkor(nilai, faktor);

      await tx`
        UPDATE work_orders
           SET final_points = ${skor.finalPoints},
               approved_l2_by = ${m.actorId},
               approved_l2_at = now()
         WHERE id = ${m.woId}
      `;

      // Riwayat dibekukan di sini. Menyesuaikan base_points di katalog besok
      // tidak boleh menggeser rupiah yang sudah terbit hari ini.
      await tx`
        INSERT INTO scoring_snapshots (
          work_order_id, base_points, target_hours, actual_hours, unit_factor,
          work_condition_factor, timeliness_factor, timeliness_status,
          safety_factor, mtbf_factor, final_points)
        VALUES (${m.woId}, ${skor.basePoints}, ${skor.targetHours}, ${skor.actualHours},
                ${skor.unitFactor}, ${skor.workConditionFactor}, ${skor.timelinessFactor},
                ${skor.timelinessStatus}, ${skor.safetyFactor}, ${skor.mtbfFactor},
                ${skor.finalPoints})
      `;

      // MODEL POIN PENUH: setiap anggota menerima poin utuh, bukan porsi.
      // Tarif dibekukan per baris — inilah yang membuat dashboard dan payroll
      // tidak akan pernah menampilkan rupiah berbeda untuk WO yang sama.
      const dibayar: HasilApproveL2['dibayar'] = [];
      for (const anggota of nilai.team) {
        await tx`
          INSERT INTO mechanic_points (
            work_order_id, mechanic_id, section_id, points, idr_per_point)
          VALUES (${m.woId}, ${anggota.mechanicId}, ${nilai.sectionId},
                  ${skor.finalPoints}, ${anggota.idrPerPoint})
          ON CONFLICT (work_order_id, mechanic_id) DO NOTHING
        `;
        dibayar.push({
          mechanicId: anggota.mechanicId,
          points: skor.finalPoints,
          idr: rupiahUntukPoin(skor.finalPoints, anggota.idrPerPoint),
        });
      }

      await tx`
        INSERT INTO approvals (work_order_id, stage, decision, putaran, approver_id, judgment)
        VALUES (${m.woId}, 'superintendent', 'approve', ${Number(wo['putaran'])},
                ${m.actorId}, ${m.judgment ?? null})
      `;

      await catat(tx, m.tenantId, m.actorId, 'approve_l2', m.woId, {
        wo_number: wo['wo_number'],
        final_points: skor.finalPoints,
        anggota: dibayar.length,
      });

      return {
        woId: m.woId,
        woNumber: String(wo['wo_number']),
        finalPoints: skor.finalPoints,
        dibayar,
      };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Pembatalan WO yang sudah approved
// ────────────────────────────────────────────────────────────────────────────

/**
 * Menol-kan poin. `idr_value` adalah kolom turunan, jadi rupiah ikut nol
 * dengan sendirinya — tidak ada kolom kedua yang bisa terlupakan.
 *
 * Di KMB V2 pembatalan pernah menol-kan `points` tapi melewatkan `idr_value`,
 * meninggalkan rupiah yang tetap tampil terbayar di dashboard.
 */
export async function batalkanWo(m: {
  opId: string; tenantId: number; actorId: number; woId: number; alasan: string;
}): Promise<HasilPerintah<{ woId: number }>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'cancel_wo',
    jalankan: async ({ tx }) => {
      if ((await perankuAdalah(tx, m.actorId)) !== 'superintendent') {
        throw tidakBerhak('Hanya L2 yang boleh membatalkan WO');
      }
      if (!m.alasan || m.alasan.trim().length < 5) {
        throw aturanBisnis('Alasan pembatalan wajib diisi');
      }

      const wo = await rebutStatus(
        tx, m.woId,
        ['pending_mechanic_work','in_progress','pending_transfer',
         'pending_supervisor','pending_superintendent','approved'],
        'cancelled',
      );
      if (!wo) throw konflikKeadaan('WO tidak dalam keadaan yang bisa dibatalkan');

      await tx`UPDATE work_orders SET final_points = 0 WHERE id = ${m.woId}`;
      await tx`UPDATE mechanic_points SET points = 0 WHERE work_order_id = ${m.woId}`;

      await catat(tx, m.tenantId, m.actorId, 'cancel_wo', m.woId, {
        wo_number: wo['wo_number'],
        alasan: m.alasan,
        sebelumnya: wo['status'],
      });

      return { woId: m.woId };
    },
  });
}

async function catat(
  tx: Tx, tenantId: number, actorId: number,
  action: string, woId: number, details: Record<string, unknown>,
): Promise<void> {
  await tx`
    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
    VALUES (${tenantId}, ${action}, 'work_order', ${String(woId)}, ${actorId},
            ${tx.json(details as never)})
  `;
}

export const _internal = { angka };
