import type { Tx } from '../lib/db.js';
import { aturanBisnis, konflikKeadaan, masukanTidakSah, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, rebutStatus, type HasilPerintah } from './runCommand.js';

/**
 * KIRIM KERJA — mekanik melaporkan jam kerjanya.
 *
 * Port dari `submitMechanicWork()` (`MechanicService.js:335-519`). Tiga
 * perilaku sumber dibawa apa adanya karena masing-masing menutup lubang yang
 * sudah pernah terbuka:
 *
 *  1. **Kiriman ulang menjawab SUKSES, bukan galat** (`:400-430`). Mekanik
 *     menekan Kirim dua kali karena kartunya belum sempat berubah; kiriman
 *     kedua ber-op_id BERBEDA sehingga dedup tidak menolong. Dulu ditolak
 *     sebagai galat transisi status, dan yang terbaca di lapangan adalah
 *     "Gagal Kirim" MERAH di atas WO yang sebenarnya sudah masuk ke meja L1.
 *     Niat mekanik sudah terpenuhi — maka jawabannya sukses, dan TIDAK ADA
 *     yang ditulis ulang.
 *
 *  2. **HM & KM tidak pernah ditulis di sini** (`:343-347`, `:467-473`).
 *     Keduanya diisi saat WO DIBUAT. Menuliskannya lagi berarti menimpanya
 *     dengan kosong setiap kali mekanik menekan Kirim tanpa mengisi apa pun —
 *     persis yang sudah terjadi pada `hour_meter` dan baru ketahuan lama
 *     sesudahnya, karena kolomnya jadi kosong tanpa satu pun galat.
 *
 *  3. **Jam sesi sebelum transfer ikut dihitung** (`:379-381`). Di sini itu
 *     tidak perlu dikerjakan tangan: `actual_hours` adalah kolom GENERATED
 *     = `session_hours + partial_hours` (`db/schema.sql:310-313`), jadi cukup
 *     mengisi `session_hours` dan totalnya tidak mungkin meleset.
 */

/** `VALIDATION.MAX_TARGET_HOURS` di `Constants.js:536`. */
const BATAS_JAM = 1000;

export interface MasukanKirimKerja {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  /** ISO. Layar mengirim hasil picker 24 jam, bukan `datetime-local` mentah. */
  startTime: string;
  endTime: string;
  /** Hanya ditulis bila DIISI. Kosong tidak pernah menimpa nilai yang ada. */
  partCategory?: 'baru' | 'repair' | 'kanibal';
}

export interface HasilKirimKerja {
  woId: number;
  woNumber: string;
  status: string;
  /** Jam sesi terakhir saja. */
  sessionHours: number;
  /** Sesi terakhir + jam shift sebelumnya. Ini yang dinilai approver. */
  actualHours: number;
  partialHours: number;
  /** true = WO sudah lewat tahap mekanik; tak ada yang ditulis. */
  sudahTerkirim: boolean;
}

function waktuDari(nilai: string, medan: string): Date {
  const d = new Date(nilai);
  if (Number.isNaN(d.getTime())) {
    throw masukanTidakSah(`${medan} bukan waktu yang bisa dibaca`, { nilai });
  }
  return d;
}

/**
 * Boleh mengirim: anggota tim WO ini, atau approver.
 *
 * Approver dibolehkan karena itulah jalur "Buka →" dari Monitoring — ia masuk
 * atas nama mekanik yang HP-nya mati atau yang tidak bisa dihubungi. Sama
 * dengan `MechanicService.js:394-398`, dan seperti di sana, yang mengerjakan
 * tetap tercatat di audit sebagai dirinya sendiri.
 */
async function bolehMengirim(tx: Tx, actorId: number, woId: number): Promise<void> {
  const r = (
    await tx<{ peran: string; anggota: boolean }[]>`
      SELECT m.role::text AS peran,
             EXISTS (SELECT 1 FROM work_order_team t
                      WHERE t.work_order_id = ${woId} AND t.mechanic_id = m.id) AS anggota
        FROM mechanics m WHERE m.id = ${actorId} AND m.is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', actorId);
  if (r.peran === 'mechanic' && !r.anggota) {
    throw tidakBerhak('Anda tidak terdaftar di work order ini');
  }
}

export async function kirimKerja(
  m: MasukanKirimKerja,
): Promise<HasilPerintah<HasilKirimKerja>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'kirim_kerja',
    jalankan: async ({ tx }) => {
      const mulai = waktuDari(m.startTime, 'Jam mulai');
      const selesai = waktuDari(m.endTime, 'Jam selesai');
      if (selesai.getTime() <= mulai.getTime()) {
        throw aturanBisnis('Jam selesai harus sesudah jam mulai');
      }

      const jamSesi =
        Math.round(((selesai.getTime() - mulai.getTime()) / 3_600_000) * 100) / 100;
      if (jamSesi <= 0) throw aturanBisnis('Durasi kerja harus lebih dari nol');
      if (jamSesi > BATAS_JAM) {
        throw aturanBisnis(`Durasi ${jamSesi} jam melewati batas wajar (${BATAS_JAM} jam)`);
      }

      const wo = (
        await tx<{
          id: number; wo_number: string; status: string; partial_hours: string;
          session_hours: string | null;
        }[]>`
          SELECT id, wo_number, status::text AS status, partial_hours, session_hours
            FROM work_orders
           WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);

      await bolehMengirim(tx, m.actorId, m.woId);

      // ── SUDAH LEWAT TAHAP MEKANIK = BUKAN KEGAGALAN ────────────────────────
      // Lihat catatan nomor 1 di kepala berkas. Tidak ada yang ditulis ulang:
      // jam yang sudah tercatat dibiarkan apa adanya, dan approver tetap bisa
      // mengoreksinya lewat override.
      const sudahLewat = ['pending_supervisor', 'pending_superintendent', 'approved'];
      if (sudahLewat.includes(wo.status)) {
        const partial = Number(wo.partial_hours ?? 0);
        const sesi = Number(wo.session_hours ?? 0);
        return {
          woId: m.woId,
          woNumber: wo.wo_number,
          status: wo.status,
          sessionHours: sesi,
          actualHours: sesi + partial,
          partialHours: partial,
          sudahTerkirim: true,
        };
      }

      const direbut = await rebutStatus(
        tx, m.woId, ['pending_mechanic_work', 'in_progress'], 'pending_supervisor',
      );
      if (!direbut) {
        // Satu-satunya sisa: pending_transfer (menunggu keputusan L1) atau
        // rejected/cancelled. Keduanya keadaan yang bisa dijelaskan, bukan
        // galat teknis.
        throw konflikKeadaan(
          wo.status === 'pending_transfer'
            ? `WO ${wo.wo_number} sedang menunggu keputusan transfer — jam kerjanya `
              + 'dicatat saat transfer disetujui, bukan lewat tombol Kirim.'
            : `WO ${wo.wo_number} tidak lagi di tahap mekanik (${wo.status})`,
          { status: wo.status },
        );
      }

      const baris = (
        await tx<{ partial_hours: string }[]>`
          UPDATE work_orders
             SET start_time    = ${mulai},
                 end_time      = ${selesai},
                 session_hours = ${jamSesi},
                 submitted_at  = now(),
                 -- Hanya ditulis bila DIISI. Lihat catatan nomor 2.
                 part_category = coalesce(${m.partCategory ?? null}, part_category)
           WHERE id = ${m.woId}
          RETURNING partial_hours
        `
      )[0]!;
      const partial = Number(baris.partial_hours ?? 0);

      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'kirim_kerja', 'work_order', ${String(m.woId)}, ${m.actorId},
                ${tx.json({
                  wo_number: wo.wo_number,
                  status_lama: wo.status,
                  status_baru: 'pending_supervisor',
                  start_time: mulai.toISOString(),
                  end_time: selesai.toISOString(),
                  session_hours: jamSesi,
                  partial_hours: partial,
                } as never)})
      `;

      return {
        woId: m.woId,
        woNumber: wo.wo_number,
        status: 'pending_supervisor',
        sessionHours: jamSesi,
        actualHours: Math.round((jamSesi + partial) * 100) / 100,
        partialHours: partial,
        sudahTerkirim: false,
      };
    },
  });
}
