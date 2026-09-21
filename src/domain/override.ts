import { angka, type Tx } from '../lib/db.js';
import { aturanBisnis, konflikKeadaan, masukanTidakSah, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { bulatkan } from './scoring.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OVERRIDE APPROVER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Approver mengoreksi angka yang dipakai menghitung uang: base points, target
 * jam, kondisi kerja, tim, jam kerja, dan catatan. Ini jalur uang paling
 * langsung di seluruh sistem — lebih langsung daripada approve itu sendiri,
 * karena approve hanya mengesahkan apa yang sudah ada, sementara override
 * MENGUBAHNYA.
 *
 * Kontraknya di docs/SPEK-LAYAR/04-APPROVALS.md §3c dan §4c.
 *
 * ── EMPAT HAL YANG BERBEDA DARI KMB V2, SEMUANYA DISENGAJA ──────────────────
 *
 * 1. ADA PENJAGA STATUS. `saveOverride` di KMB V2 tidak punya satu pun
 *    (`ApprovalService.js:1034+`), sehingga modal yang dibuka sebelum WO
 *    disetujui dan disimpan sesudahnya akan mengubah angka WO yang poinnya
 *    SUDAH terbit — tanpa menghitung ulang apa pun. Di sini WO yang sudah
 *    approved/cancelled/rejected ditolak, dan barisnya dikunci saat diperiksa.
 *
 * 2. LEVEL DIAMBIL DARI IDENTITAS, bukan dari muatan. Klien tidak pernah boleh
 *    memberi tahu server ia sedang bertindak sebagai siapa.
 *
 * 3. HANYA YANG BERUBAH YANG DITULIS. Menyimpan prefill sebagai override baru
 *    membuat setiap pembukaan modal meninggalkan jejak palsu "L2 mengubah base
 *    points" padahal ia cuma melihat-lihat.
 *
 * 4. RIWAYAT DITULIS KE audit_logs, bukan cuma ke tabel override. Kunci utama
 *    tabel itu (wo, level, kind) hanya menyimpan nilai TERAKHIR; tanpa audit,
 *    perubahan kedua menghapus jejak yang pertama.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Batas dari Constants.js:534-536 KMB V2. */
const MAKS_BASE_POINTS = 10_000;
const MAKS_TARGET_HOURS = 1_000;
const MAKS_SESI_JAM = 1_000;
const MAKS_JUDGMENT = 500;

/** Status yang masih boleh dikoreksi. Di luar ini, angkanya sudah jadi uang. */
const STATUS_BOLEH_DIUBAH = [
  'pending_mechanic_work', 'in_progress', 'pending_transfer',
  'pending_supervisor', 'pending_superintendent',
];

export interface MasukanOverride {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  /**
   * `undefined` = tidak disentuh. Itu bedanya dengan `null`, yang berarti
   * level ini sengaja MENGOSONGKAN — dan untuk judgment, mengosongkan berarti
   * menghapus warisan L1.
   */
  basePoints?: number;
  targetHours?: number;
  workCondition?: string;
  team?: number[];
  waktu?: { startTime: string; endTime: string };
  judgment?: string;
}

export interface HasilOverride {
  woId: number;
  /** Jenis yang benar-benar berubah. Kosong = tak ada yang ditulis. */
  berubah: string[];
}

export async function simpanOverride(
  m: MasukanOverride,
): Promise<HasilPerintah<HasilOverride>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'save_override',
    jalankan: async ({ tx }) => {
      const level = await levelDariIdentitas(tx, m.actorId);

      // Dikunci: dua approver yang menyimpan bersamaan tidak boleh saling
      // menimpa separuh, dan statusnya tidak boleh berubah di antara
      // pemeriksaan dan penulisan.
      const wo = (
        await tx<{
          id: number; status: string; section_id: number; wo_number: string;
          partial_hours: string; is_manual: boolean;
        }[]>`
          SELECT id, status::text, section_id, wo_number, partial_hours, is_manual
            FROM work_orders
           WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
           FOR UPDATE
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);

      if (!STATUS_BOLEH_DIUBAH.includes(wo.status)) {
        throw konflikKeadaan(
          `WO ${wo.wo_number} berstatus ${wo.status} dan tidak bisa dikoreksi lagi. ` +
          'Poinnya sudah terbit; batalkan WO-nya bila memang salah.',
          { status: wo.status, wo_number: wo.wo_number },
        );
      }

      await pastikanBolehSection(tx, m.actorId, wo.section_id);

      // Nilai pembanding, supaya yang tidak berubah tidak ditulis.
      const sekarang = await nilaiPembanding(tx, m.woId, level);
      const berubah: string[] = [];

      /** Menulis satu override, hanya bila nilainya benar-benar bergeser. */
      const tulis = async (kind: string, baru: unknown, lama: unknown) => {
        if (JSON.stringify(baru) === JSON.stringify(lama)) return;
        await tx`
          INSERT INTO work_order_overrides (work_order_id, level, kind, value, set_by)
          VALUES (${m.woId}, ${level}::override_level, ${kind}::override_kind,
                  ${tx.json(baru as never)}, ${m.actorId})
          ON CONFLICT (work_order_id, level, kind)
          DO UPDATE SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, set_at = now()
        `;
        // Jejak lama→baru. Tabel override cuma menyimpan yang terakhir; tanpa
        // baris ini, koreksi kedua menghapus bukti koreksi pertama.
        await tx`
          INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
          VALUES (${m.tenantId}, 'save_override', 'work_order', ${String(m.woId)}, ${m.actorId},
                  ${tx.json({ level, kind, lama, baru, wo_number: wo.wo_number } as never)})
        `;
        berubah.push(kind);
      };

      if (m.basePoints !== undefined) {
        periksaAngka('Base points', m.basePoints, MAKS_BASE_POINTS);
        await tulis('base_points', m.basePoints, sekarang.basePoints);
      }

      if (m.targetHours !== undefined) {
        periksaAngka('Target hours', m.targetHours, MAKS_TARGET_HOURS);
        await tulis('target_hours', m.targetHours, sekarang.targetHours);
      }

      if (m.workCondition !== undefined) {
        // Kunci yang tak dikenal jatuh ke faktor bawaan dan MENGUBAH BAYARAN
        // tanpa satu pun galat. Diperiksa terhadap tabel, bukan daftar di kode.
        const ada = await tx<{ ada: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM factors
             WHERE tenant_id = ${m.tenantId}
               AND factor_type = 'work_condition'
               AND factor_key = ${m.workCondition}
          ) AS ada
        `;
        if (!ada[0]?.ada) {
          throw masukanTidakSah(`Kondisi kerja tidak dikenal: ${m.workCondition}`);
        }
        await tulis('work_condition', m.workCondition, sekarang.workCondition);
      }

      if (m.team !== undefined) {
        if (!m.team.every((x) => Number.isInteger(x) && x > 0)) {
          throw aturanBisnis('ID mekanik harus berupa bilangan bulat positif.');
        }
        const bersih = [...new Set(m.team)];
        if (bersih.length === 0) {
          throw aturanBisnis('Tim tidak boleh kosong — WO wajib punya minimal satu mekanik.');
        }
        if (bersih.length !== m.team.length) {
          throw aturanBisnis('Ada mekanik yang terpilih lebih dari sekali.');
        }
        // Anggota harus ada, aktif, dan milik tenant ini. Di KMB V2 hanya JS
        // layar yang memeriksanya; permintaan yang disusun tangan lolos.
        const sah = await tx<{ n: string }[]>`
          SELECT count(*) AS n FROM mechanics
           WHERE id = ANY(${bersih}::int[]) AND tenant_id = ${m.tenantId} AND is_active
        `;
        if (Number(sah[0]!.n) !== bersih.length) {
          throw aturanBisnis('Ada anggota tim yang tidak dikenal atau sudah nonaktif.');
        }
        const urut = [...bersih].sort((a, b) => a - b);
        await tulis('team', urut, sekarang.team);
      }

      if (m.waktu !== undefined) {
        const mulai = new Date(m.waktu.startTime);
        const selesai = new Date(m.waktu.endTime);
        if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) {
          throw masukanTidakSah('Jam mulai dan selesai harus lengkap dan sah.');
        }
        if (selesai <= mulai) {
          throw aturanBisnis('Jam selesai harus setelah jam mulai.');
        }
        const sesi = bulatkan((selesai.getTime() - mulai.getTime()) / 3_600_000, 2);
        if (sesi <= 0 || sesi > MAKS_SESI_JAM) {
          throw aturanBisnis(`Durasi ${sesi} jam di luar batas wajar (0–${MAKS_SESI_JAM}).`);
        }
        /* HANYA sesi terakhir yang dikoreksi. `partial_hours` — jam dari shift
           sebelum transfer — TIDAK ikut dan tidak boleh jadi medan yang bisa
           disunting: ia sudah disetujui di putaran sebelumnya. `actual_hours`
           adalah kolom turunan yang menjumlahkan keduanya. */
        const nilai = {
          start_time: mulai.toISOString(),
          end_time: selesai.toISOString(),
          session_hours: sesi,
        };
        await tulis('time', nilai, sekarang.waktu);
      }

      if (m.judgment !== undefined) {
        const teks = m.judgment.trim();
        if (teks.length > MAKS_JUDGMENT) {
          throw masukanTidakSah(`Catatan maksimal ${MAKS_JUDGMENT} huruf.`);
        }
        /* String KOSONG sengaja disimpan, bukan diabaikan. Barisnya yang ADA
           berarti "level ini pernah menyentuh" — dan untuk L2, menyimpan
           kosong adalah caranya MENGHAPUS catatan warisan L1. Kalau kosong
           diperlakukan sebagai "tak disentuh", catatan L1 tak akan pernah bisa
           dihapus siapa pun. */
        await tulis('judgment', teks, sekarang.judgment);
      }

      if (berubah.length > 0) {
        await tx`UPDATE work_orders SET updated_at = now() WHERE id = ${m.woId}`;
      }

      return { woId: m.woId, berubah };
    },
  });
}

/** Peran menentukan level override. Muatan klien tidak pernah menentukannya. */
async function levelDariIdentitas(tx: Tx, actorId: number): Promise<'supervisor' | 'superintendent'> {
  const r = (
    await tx<{ role: string }[]>`
      SELECT role::text FROM mechanics WHERE id = ${actorId} AND is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', actorId);
  if (r.role === 'supervisor' || r.role === 'superintendent') return r.role;
  throw tidakBerhak('Hanya L1 dan L2 yang boleh mengoreksi angka WO.');
}

/** Scope kosong = boleh semua section. Perilaku KMB V2 dipertahankan. */
async function pastikanBolehSection(tx: Tx, mechanicId: number, sectionId: number) {
  const scope = await tx<{ section: string }[]>`
    SELECT section::text FROM mechanic_sections WHERE mechanic_id = ${mechanicId}
  `;
  if (scope.length === 0) return;
  const cocok = await tx<{ ada: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM mechanic_sections ms
       JOIN sections s ON s.code = ms.section
       WHERE ms.mechanic_id = ${mechanicId} AND s.id = ${sectionId}
    ) AS ada
  `;
  if (!cocok[0]?.ada) throw tidakBerhak('Section ini di luar cakupan Anda');
}

/**
 * Nilai pembanding: apa yang dianggap "tidak berubah".
 *
 * ── ATURANNYA, DAN KENAPA BUKAN YANG PERTAMA SAYA COBA ──────────────────────
 * Untuk tiap jenis: baris override LEVEL INI kalau ada, kalau tidak ada nilai
 * EFEKTIF yang sedang berlaku.
 *
 * Percobaan pertama hanya membaca baris level ini, dengan alasan yang terdengar
 * benar: L1 yang mengetik angka yang kebetulan sama dengan override L2 tetap
 * layak tercatat, karena pendapatnya akan berlaku kalau kelak override L2
 * dicabut.
 *
 * Ujinya menemukan akibatnya. Pada WO yang belum pernah dikoreksi, TIDAK ADA
 * baris level ini — jadi pembandingnya `undefined`, dan setiap medan tampak
 * berubah. Sekadar membuka modal lalu menekan Simpan menulis lima override
 * sekaligus dan mencatat "L2 mengubah base points" padahal ia tak menyentuh
 * apa pun. Persis jejak palsu yang berkas ini bilang ingin dicegah.
 *
 * Yang dipilih sekarang menukar kasus langka dengan kasus harian: L1 yang
 * menyatakan ulang angka yang identik dengan override L2 memang tidak tercatat.
 * Itu kehilangan yang nyata, tapi kecil dan jarang — sementara jejak palsu di
 * setiap WO yang pernah dibuka modalnya merusak seluruh gunanya riwayat.
 */
async function nilaiPembanding(tx: Tx, woId: number, level: string) {
  const { nilaiEfektif } = await import('./nilaiEfektif.js');

  const [rowsLevel, semua, ne, wo] = await Promise.all([
    tx<{ kind: string; value: unknown }[]>`
      SELECT kind::text, value FROM work_order_overrides
       WHERE work_order_id = ${woId} AND level = ${level}::override_level
    `,
    tx<{ level: string; kind: string; value: unknown }[]>`
      SELECT level::text, kind::text, value FROM work_order_overrides
       WHERE work_order_id = ${woId}
    `,
    nilaiEfektif(tx, woId),
    tx<{ start_time: Date | null; end_time: Date | null; session_hours: string | null }[]>`
      SELECT start_time, end_time, session_hours FROM work_orders WHERE id = ${woId}
    `,
  ]);

  const p = new Map(rowsLevel.map((r) => [r.kind, r.value]));
  const ambil = <T>(kind: string, efektif: T): unknown =>
    p.has(kind) ? p.get(kind) : efektif;

  // Judgment efektif: L2 menang atas L1; tak ada keduanya berarti kosong.
  const jL2 = semua.find((r) => r.kind === 'judgment' && r.level === 'superintendent');
  const jL1 = semua.find((r) => r.kind === 'judgment' && r.level === 'supervisor');
  const judgmentEfektif = (jL2 ?? jL1)?.value ?? '';

  // Waktu efektif: override kalau ada, kalau tidak dari kolom WO-nya sendiri.
  const wL2 = semua.find((r) => r.kind === 'time' && r.level === 'superintendent');
  const wL1 = semua.find((r) => r.kind === 'time' && r.level === 'supervisor');
  const w = wo[0];
  const waktuEfektif = (wL2 ?? wL1)?.value ?? (w?.start_time && w.end_time
    ? {
        start_time: w.start_time.toISOString(),
        end_time: w.end_time.toISOString(),
        session_hours: Number(w.session_hours ?? 0),
      }
    : undefined);

  return {
    basePoints: ambil('base_points', ne.basePoints),
    targetHours: ambil('target_hours', ne.targetHours),
    workCondition: ambil('work_condition', ne.workCondition),
    team: ambil('team', ne.team.map((t) => t.mechanicId).sort((a, b) => a - b)),
    waktu: ambil('time', waktuEfektif),
    judgment: ambil('judgment', judgmentEfektif),
  };
}

function periksaAngka(nama: string, nilai: number, maks: number): void {
  const n = angka(nilai);
  if (!Number.isFinite(n)) throw masukanTidakSah(`${nama} harus berupa angka.`);
  if (n < 0) throw aturanBisnis(`${nama} tidak boleh negatif.`);
  if (n > maks) throw aturanBisnis(`${nama} melampaui batas wajar (maksimal ${maks}).`);
}
