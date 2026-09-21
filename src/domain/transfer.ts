import type { Tx } from '../lib/db.js';
import { aturanBisnis, konflikKeadaan, masukanTidakSah, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, rebutStatus, type HasilPerintah } from './runCommand.js';

/**
 * TRANSFER WO — oper pekerjaan ke shift berikutnya.
 *
 * Port dari `requestTransferWO` (`WorkOrderService.js:1292`), `approveTransfer`
 * dan `rejectTransfer` (`ApprovalService.js:1705`, `:1891`).
 *
 * ── ATURAN UANGNYA, DAN INI YANG MENENTUKAN SELURUH BENTUKNYA ───────────────
 * Saat mekanik MEMINTA transfer, `partial_hours` BELUM disentuh sama sekali.
 * Jam sesinya baru diakumulasi ketika L1 MENYETUJUI; kalau L1 menolak, jam itu
 * HANGUS. Disengaja, dan sama dengan SUM: jam baru diakui kalau transfernya
 * disetujui (`ApprovalService.js:1885-1886`).
 *
 * Akibatnya layar approval WAJIB menyebut angkanya sebelum tombol ditekan —
 * keputusan ini menambah jam kerja yang dibayar, atau menghanguskannya.
 *
 * ── BEDA BENTUK DARI KMB V2 ─────────────────────────────────────────────────
 * Di sana permintaan transfer hidup sebagai DELAPAN kolom yang ditempelkan ke
 * baris WO (`transfer_status`, `transfer_requested_by`, `transfer_started_at`,
 * …), yang harus dibersihkan satu per satu saat keputusan turun — dan dua di
 * antaranya sengaja TIDAK dibersihkan, sehingga tak ada satu tempat pun yang
 * bisa dibaca untuk tahu "transfer apa saja yang pernah terjadi pada WO ini".
 *
 * Di sini satu baris `work_order_transfers` per permintaan, dengan penerimanya
 * di tabel sendiri. Riwayatnya terbaca, dan keputusan tidak menghapus apa pun.
 */

/** Batas kewajaran satu sesi, dari `WorkOrderService.js:1353`. */
const BATAS_JAM_SESI = 24;

const STATUS_BOLEH_TRANSFER = ['pending_mechanic_work', 'in_progress'];

// ────────────────────────────────────────────────────────────────────────────
// 1. MEKANIK MEMINTA
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanMintaTransfer {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  /** ISO. Jam mulai sesi ini — dari timer atau dikoreksi manual di picker. */
  sessionStart: string;
  note?: string;
}

export interface HasilMintaTransfer {
  woId: number;
  woNumber: string;
  status: string;
  sessionHours: number;
  /** true = permintaan sudah tercatat sebelumnya; tak ada yang ditulis lagi. */
  sudahDiminta: boolean;
}

export async function mintaTransfer(
  m: MasukanMintaTransfer,
): Promise<HasilPerintah<HasilMintaTransfer>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'minta_transfer',
    jalankan: async ({ tx }) => {
      const wo = (
        await tx<{ id: number; wo_number: string; status: string }[]>`
          SELECT id, wo_number, status::text AS status
            FROM work_orders WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);

      /* Permintaan yang SUDAH tercatat = maksudnya sudah tercapai
         (`WorkOrderService.js:1303-1310`). Tanpa ini, kiriman ulang dari
         antrean PWA muncul sebagai kegagalan di HP mekanik, padahal
         permintaannya sudah masuk dan sedang menunggu approver. */
      const menggantung = (
        await tx<{ id: number; session_hours: string }[]>`
          SELECT id, session_hours FROM work_order_transfers
           WHERE work_order_id = ${m.woId} AND decision IS NULL
        `
      )[0];
      if (menggantung) {
        return {
          woId: m.woId, woNumber: wo.wo_number, status: wo.status,
          sessionHours: Number(menggantung.session_hours ?? 0),
          sudahDiminta: true,
        };
      }

      if (!STATUS_BOLEH_TRANSFER.includes(wo.status)) {
        throw konflikKeadaan(
          `Transfer hanya bisa dari WO yang sedang dikerjakan. Status sekarang: ${wo.status}`,
          { status: wo.status },
        );
      }

      const direbut = await rebutStatus(tx, m.woId, STATUS_BOLEH_TRANSFER, 'pending_transfer');
      if (!direbut) {
        throw konflikKeadaan(`WO ${wo.wo_number} tidak lagi di tahap mekanik`, {
          status: wo.status,
        });
      }

      // Hanya anggota tim. Cek setelah rebutStatus untuk cegah race condition.
      const anggota = (
        await tx<{ ada: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM work_order_team
                          WHERE work_order_id = ${m.woId} AND mechanic_id = ${m.actorId}) AS ada
        `
      )[0]!.ada;
      if (!anggota) throw tidakBerhak('Hanya anggota tim WO ini yang bisa minta transfer');

      const mulai = new Date(m.sessionStart);
      if (Number.isNaN(mulai.getTime())) {
        throw masukanTidakSah('Jam mulai sesi bukan waktu yang bisa dibaca', {
          nilai: m.sessionStart,
        });
      }
      const berhenti = new Date();
      if (mulai.getTime() > berhenti.getTime()) {
        throw aturanBisnis('Jam mulai sesi tidak boleh melewati jam sekarang');
      }
      const jamSesi =
        Math.round(((berhenti.getTime() - mulai.getTime()) / 3_600_000) * 100) / 100;
      if (jamSesi > BATAS_JAM_SESI) {
        throw aturanBisnis(
          `Durasi sesi ${jamSesi} jam melebihi batas wajar ${BATAS_JAM_SESI} jam `
          + '— periksa jam mulainya',
        );
      }

      await tx`
        INSERT INTO work_order_transfers
          (work_order_id, requested_by, session_start, session_stop, session_hours, note)
        VALUES (${m.woId}, ${m.actorId}, ${mulai}, ${berhenti}, ${jamSesi},
                ${m.note?.trim() || null})
      `;

      await catat(tx, m.tenantId, m.actorId, 'minta_transfer', m.woId, {
        wo_number: wo.wo_number,
        status_lama: wo.status,
        session_start: mulai.toISOString(),
        session_stop: berhenti.toISOString(),
        session_hours: jamSesi,
        note: m.note?.trim() ?? '',
      });

      return {
        woId: m.woId, woNumber: wo.wo_number, status: 'pending_transfer',
        sessionHours: jamSesi, sudahDiminta: false,
      };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 2. L1 MEMUTUSKAN
// ────────────────────────────────────────────────────────────────────────────

async function perankuDanScope(tx: Tx, mechanicId: number) {
  const r = (
    await tx<{ peran: string }[]>`
      SELECT role::text AS peran FROM mechanics WHERE id = ${mechanicId} AND is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', mechanicId);
  if (r.peran !== 'supervisor' && r.peran !== 'superintendent') {
    throw tidakBerhak('Hanya L1 atau L2 yang boleh memutuskan transfer');
  }
}

/** Approver hanya boleh menyentuh WO di section-nya (KMB punya scope, SUM tidak). */
async function pastikanDalamScope(tx: Tx, mechanicId: number, woId: number) {
  const r = (
    await tx<{ boleh: boolean }[]>`
      SELECT (
        NOT EXISTS (SELECT 1 FROM mechanic_sections s WHERE s.mechanic_id = ${mechanicId})
        OR EXISTS (
          SELECT 1 FROM work_orders w
            JOIN sections sec ON sec.id = w.section_id
            JOIN mechanic_sections s ON s.mechanic_id = ${mechanicId}
                                    AND s.section::text = sec.code::text
           WHERE w.id = ${woId})
      ) AS boleh
    `
  )[0]!;
  if (!r.boleh) throw tidakBerhak('WO ini di luar section Anda');
}

async function permintaanMenggantung(tx: Tx, woId: number) {
  return (
    await tx<{ id: number; session_hours: string; requested_by: number }[]>`
      SELECT id, session_hours, requested_by FROM work_order_transfers
       WHERE work_order_id = ${woId} AND decision IS NULL
       ORDER BY requested_at DESC LIMIT 1
    `
  )[0];
}

export interface MasukanPutusanTransfer {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
}

export interface MasukanSetujuiTransfer extends MasukanPutusanTransfer {
  /** Mekanik penerima. Minimal satu — WO tanpa penerima tak akan dikerjakan. */
  penerima: number[];
}

export interface HasilPutusanTransfer {
  woId: number;
  woNumber: string;
  status: string;
  sessionHours: number;
  partialHoursSebelum: number;
  partialHoursSesudah: number;
  penerima: number[];
  /** true = tidak ada permintaan menggantung; tak ada yang diubah. */
  sudahDiputuskan: boolean;
}

export async function setujuiTransfer(
  m: MasukanSetujuiTransfer,
): Promise<HasilPerintah<HasilPutusanTransfer>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'setujui_transfer',
    jalankan: async ({ tx }) => {
      await perankuDanScope(tx, m.actorId);

      const penerima = [...new Set(m.penerima)];
      if (penerima.length === 0) {
        throw aturanBisnis('Pilih minimal satu mekanik penerima transfer');
      }

      const wo = (
        await tx<{ wo_number: string; status: string; partial_hours: string }[]>`
          SELECT wo_number, status::text AS status, partial_hours
            FROM work_orders WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);
      await pastikanDalamScope(tx, m.actorId, m.woId);

      const minta = await permintaanMenggantung(tx, m.woId);
      if (!minta) {
        // Kiriman ulang (klik dobel / antrean PWA) bukan kegagalan.
        return {
          woId: m.woId, woNumber: wo.wo_number, status: wo.status,
          sessionHours: 0,
          partialHoursSebelum: Number(wo.partial_hours ?? 0),
          partialHoursSesudah: Number(wo.partial_hours ?? 0),
          penerima: [], sudahDiputuskan: true,
        };
      }

      // Penerima harus ada, aktif, dan BELUM di tim — menambahkan orang yang
      // sudah di tim akan melanggar kunci utama work_order_team, dan pesannya
      // akan berupa galat basis data alih-alih kalimat yang bisa dibaca.
      for (const id of penerima) {
        const p = (
          await tx<{ nama: string; aktif: boolean; sudah: boolean }[]>`
            SELECT m.name AS nama, m.is_active AS aktif,
                   EXISTS (SELECT 1 FROM work_order_team t
                            WHERE t.work_order_id = ${m.woId} AND t.mechanic_id = m.id) AS sudah
              FROM mechanics m WHERE m.id = ${id} AND m.tenant_id = ${m.tenantId}
          `
        )[0];
        if (!p) throw tidakDitemukan('Mekanik penerima', id);
        if (!p.aktif) throw aturanBisnis(`Mekanik penerima sudah nonaktif: ${p.nama}`);
        if (p.sudah) throw aturanBisnis(`${p.nama} sudah menjadi anggota tim WO ini`);
      }

      /* KLAIM ATOMIK — JALUR UANG.
         Dua approver yang menyetujui bersamaan sama-sama membaca
         'pending_transfer' lalu SAMA-SAMA menambahkan jam sesi ke
         partial_hours; jam kerja dan rupiahnya membengkak dua kali lipat. Di
         KMB V2 ini butuh LockService plus pembacaan ulang yang segar
         (`ApprovalService.js:1794-1818`). Di sini UPDATE bersyarat yang
         merebut status sudah menjadi kuncinya, di dalam transaksi yang sama
         dengan penambahan jamnya. */
      const direbut = await rebutStatus(tx, m.woId, ['pending_transfer'], 'pending_mechanic_work');
      if (!direbut) {
        throw konflikKeadaan(
          `Transfer WO ${wo.wo_number} sudah diproses approver lain`,
          { status: wo.status },
        );
      }

      const jamSesi = Number(minta.session_hours ?? 0);
      const sebelum = Number(wo.partial_hours ?? 0);
      const sesudah = Math.round((sebelum + jamSesi) * 100) / 100;

      await tx`
        UPDATE work_orders SET partial_hours = ${sesudah} WHERE id = ${m.woId}
      `;
      await tx`
        UPDATE work_order_transfers
           SET decision = 'approve', decided_by = ${m.actorId}, decided_at = now()
         WHERE id = ${minta.id}
      `;
      for (const id of penerima) {
        await tx`
          INSERT INTO work_order_transfer_recipients (transfer_id, mechanic_id)
          VALUES (${minta.id}, ${id})
        `;
        // Poin PENUH untuk setiap penerima — tidak ada kolom persentase di
        // sistem ini sama sekali. Keputusan Gabriel 1 Agu 2026, ikut SUM.
        await tx`
          INSERT INTO work_order_team (work_order_id, mechanic_id)
          VALUES (${m.woId}, ${id})
        `;
      }

      await catat(tx, m.tenantId, m.actorId, 'setujui_transfer', m.woId, {
        wo_number: wo.wo_number,
        penerima,
        session_hours: jamSesi,
        partial_sebelum: sebelum,
        partial_sesudah: sesudah,
      });

      return {
        woId: m.woId, woNumber: wo.wo_number, status: 'pending_mechanic_work',
        sessionHours: jamSesi, partialHoursSebelum: sebelum,
        partialHoursSesudah: sesudah, penerima, sudahDiputuskan: false,
      };
    },
  });
}

export interface MasukanTolakTransfer extends MasukanPutusanTransfer {
  alasan: string;
}

export async function tolakTransfer(
  m: MasukanTolakTransfer,
): Promise<HasilPerintah<HasilPutusanTransfer>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'tolak_transfer',
    jalankan: async ({ tx }) => {
      await perankuDanScope(tx, m.actorId);
      if (m.alasan.trim().length < 5) {
        throw aturanBisnis('Alasan penolakan wajib diisi, minimal 5 huruf');
      }

      const wo = (
        await tx<{ wo_number: string; status: string; partial_hours: string }[]>`
          SELECT wo_number, status::text AS status, partial_hours
            FROM work_orders WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);
      await pastikanDalamScope(tx, m.actorId, m.woId);

      const minta = await permintaanMenggantung(tx, m.woId);
      const partial = Number(wo.partial_hours ?? 0);
      if (!minta) {
        return {
          woId: m.woId, woNumber: wo.wo_number, status: wo.status,
          sessionHours: 0, partialHoursSebelum: partial, partialHoursSesudah: partial,
          penerima: [], sudahDiputuskan: true,
        };
      }

      const direbut = await rebutStatus(tx, m.woId, ['pending_transfer'], 'pending_mechanic_work');
      if (!direbut) {
        throw konflikKeadaan(
          `Transfer WO ${wo.wo_number} sudah diproses approver lain`,
          { status: wo.status },
        );
      }

      /* `partial_hours` TIDAK DIUBAH — jam sesi yang tadi diajukan HANGUS.
         Disengaja, sama dengan SUM (`ApprovalService.js:1885-1886`): jam baru
         diakui kalau transfernya disetujui. Barisnya tetap disimpan lengkap
         dengan jam dan catatannya, supaya pertanyaan "kenapa jam saya tidak
         dihitung" punya jawaban yang bisa dibaca. */
      await tx`
        UPDATE work_order_transfers
           SET decision = 'reject', decided_by = ${m.actorId}, decided_at = now(),
               decision_reason = ${m.alasan.trim()}
         WHERE id = ${minta.id}
      `;

      await catat(tx, m.tenantId, m.actorId, 'tolak_transfer', m.woId, {
        wo_number: wo.wo_number,
        alasan: m.alasan.trim(),
        jam_hangus: Number(minta.session_hours ?? 0),
      });

      return {
        woId: m.woId, woNumber: wo.wo_number, status: 'pending_mechanic_work',
        sessionHours: Number(minta.session_hours ?? 0),
        partialHoursSebelum: partial, partialHoursSesudah: partial,
        penerima: [], sudahDiputuskan: false,
      };
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
