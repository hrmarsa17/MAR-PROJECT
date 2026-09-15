import { angka, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';

/**
 * PEMBUATAN WORK ORDER.
 *
 * Titik tempat KMB V2 paling sering melahirkan kembar — empat sebab berbeda,
 * empat tambalan berbeda (lihat PETA-KMB-V2 §3). Di sini ketiganya ditutup oleh
 * struktur, bukan oleh kewaspadaan:
 *
 *   nomor bertabrakan   → next_wo_number() dari penghitung basis data
 *   kiriman terulang    → op_id + processed_ops di transaksi yang sama
 *   dua pengirim        → kunci advisory per op_id
 *
 * Yang TIDAK ditutup struktur, dan memang tidak boleh: WO kembar yang dibuat
 * dua kali dengan sengaja dan bernomor berbeda. Itu sah — kerja ulang terjadi.
 * Ia ditandai lewat view wo_kembar_dicurigai, dan manusia yang memutuskan.
 */

export interface BlokWo {
  jobId?: number;
  unitId?: number;
  workCondition?: string;
  location?: string;
  keterangan?: string;
  hourMeter?: number;
  kilometers?: number;
  teamMechanicIds: number[];
  /** WO manual ("Others") — angkanya langsung masuk jalur uang. */
  manual?: {
    description: string;
    basePoints: number;
    targetHours: number;
    unitFactor: number;
  };
}

export interface MasukanBuatWo {
  opId: string;
  tenantId: number;
  actorId: number;
  sectionCode: string;
  blok: BlokWo[];
  grup?: { mode: 'unit' | 'job' };
}

export interface WoDibuat {
  id: number;
  woNumber: string;
}

export async function buatWorkOrder(
  m: MasukanBuatWo,
): Promise<HasilPerintah<{ dibuat: WoDibuat[]; grupId: string | null }>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'create_wo',
    jalankan: async ({ tx }) => {
      if (m.blok.length === 0) throw aturanBisnis('Tidak ada WO untuk dibuat');

      const pembuat = (
        await tx<{ role: string }[]>`
          SELECT role::text FROM mechanics WHERE id = ${m.actorId} AND is_active
        `
      )[0];
      if (!pembuat) throw tidakDitemukan('Mekanik', m.actorId);

      const section = (
        await tx<{ id: number; requires_unit: boolean }[]>`
          SELECT id, requires_unit FROM sections
           WHERE tenant_id = ${m.tenantId} AND code = ${m.sectionCode} AND is_active
        `
      )[0];
      if (!section) throw tidakDitemukan('Section', m.sectionCode);

      await pastikanBolehSection(tx, m.actorId, section.id);

      if (m.grup) tolakKembarDalamGrup(m.blok, m.grup.mode);

      const grupId = m.grup ? crypto.randomUUID() : null;
      const dibuat: WoDibuat[] = [];

      for (const b of m.blok) {
        // WO manual mengetik base_points & target_hours sendiri, dan angka itu
        // masuk langsung ke jalur uang. Mekanik hanya boleh dari katalog.
        if (b.manual && pembuat.role === 'mechanic') {
          throw tidakBerhak(
            'WO manual hanya boleh dibuat oleh L1 atau L2. Silakan pilih job dari katalog.',
          );
        }
        if (!b.manual && !b.jobId) {
          throw aturanBisnis('Job wajib dipilih dari katalog');
        }
        if (b.teamMechanicIds.length === 0) {
          throw aturanBisnis('WO wajib punya minimal satu anggota tim');
        }
        /* WO MANUAL TIDAK PUNYA UNIT, dan itu bukan kelonggaran.
           "Bersih gudang" atau "Training mekanik" memang tidak dikerjakan pada
           satu unit; di KMB V2 unitnya diisi penanda 'OTHERS'
           (`WorkOrderService.js:232`) yang bukan unit sungguhan.

           Sampai 16 Sep 2026 pagar `requires_unit` di bawah ini berlaku juga
           untuk WO manual, sehingga Others TIDAK BISA dibuat di section field
           maupun tyreman — dua section terbesar. Fiturnya ada di layar,
           ditolak server, dan tak ada uji yang menyentuhnya. */
        if (!b.manual && section.requires_unit && !b.unitId) {
          throw aturanBisnis(`Section ${m.sectionCode} wajib memilih unit`);
        }
        if (b.manual && b.unitId) {
          throw aturanBisnis(
            'WO manual tidak boleh terikat unit — pekerjaannya memang tidak '
            + 'dikerjakan pada satu unit. Hapus pilihan unitnya.',
          );
        }

        /* Unit SEMU bukan unit. Ia baris penanda yang di layar berfungsi
           sebagai jalan pintas ke job manual (`unit_scope = 'others'` di KMB
           V2). Melekatkannya ke WO sungguhan membuat WO yang seolah punya unit
           padahal tidak — dan faktor unitnya ikut masuk perhitungan uang.
           KMB V2 menolaknya di DUA tempat; di sini satu, karena satu pintu. */
        if (b.unitId) await tolakUnitSemu(tx, b.unitId);

        if (b.jobId) await pastikanJobCocok(tx, b.jobId, section.id, b.unitId ?? null);

        const woNumber = (
          await tx<{ next_wo_number: string }[]>`
            SELECT next_wo_number(${m.tenantId}::smallint, current_date)
          `
        )[0]!.next_wo_number;

        const baris = (
          await tx<{ id: number }[]>`
            INSERT INTO work_orders (
              tenant_id, wo_number, section_id, job_id, unit_id,
              work_condition, location, keterangan,
              is_manual, manual_description, manual_base_points,
              manual_target_hours, manual_unit_factor,
              wo_group_id, wo_group_mode, hour_meter, kilometers,
              status, created_by)
            VALUES (
              ${m.tenantId}, ${woNumber}, ${section.id},
              ${b.jobId ?? null}, ${b.unitId ?? null},
              ${b.workCondition ?? 'normal'}, ${b.location ?? null}, ${b.keterangan ?? null},
              ${Boolean(b.manual)}, ${b.manual?.description ?? null},
              ${b.manual?.basePoints ?? null}, ${b.manual?.targetHours ?? null},
              ${b.manual?.unitFactor ?? null},
              ${grupId}, ${m.grup?.mode ?? null},
              ${b.hourMeter ?? null}, ${b.kilometers ?? null},
              'pending_mechanic_work', ${m.actorId})
            RETURNING id
          `
        )[0]!;

        for (const mechanicId of new Set(b.teamMechanicIds)) {
          await tx`
            INSERT INTO work_order_team (work_order_id, mechanic_id, added_by)
            VALUES (${baris.id}, ${mechanicId}, ${m.actorId})
            ON CONFLICT (work_order_id, mechanic_id) DO NOTHING
          `;
        }

        if (b.hourMeter !== undefined || b.kilometers !== undefined) {
          await catatMeter(tx, baris.id, b.unitId ?? null, b.hourMeter, b.kilometers, m.actorId);
        }

        await tx`
          INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
          VALUES (${m.tenantId}, 'create_wo', 'work_order', ${String(baris.id)}, ${m.actorId},
                  ${tx.json({ wo_number: woNumber, section: m.sectionCode } as never)})
        `;

        dibuat.push({ id: baris.id, woNumber });
      }

      return { dibuat, grupId };
    },
  });
}

/**
 * Baris kembar di dalam satu grup ditolak SEBELUM satu pun WO terbit.
 *
 * Bentuk grupnya menentukan apa yang harus berbeda:
 *
 *   mode 'unit'  1 unit · banyak job  → JOB tiap baris harus berbeda
 *   mode 'job'   1 job · banyak unit  → UNIT tiap baris harus berbeda
 *
 * Layar sudah memeriksa ini lebih dulu (`cekKembarKlien` di KMB V2) supaya orang
 * tahu tanpa menunggu bolak-balik jaringan, tapi pemeriksaan di layar BUKAN
 * pagar: PWA, permintaan yang disusun tangan, dan versi layar lama semuanya
 * masuk lewat pintu yang sama. Pagarnya di sini.
 *
 * Melempar, bukan melewati diam-diam: dua baris identik dalam satu grup adalah
 * dua WO yang akan dibayar dua kali untuk pekerjaan yang sama.
 */
function tolakKembarDalamGrup(blok: BlokWo[], mode: 'unit' | 'job'): void {
  if (blok.length < 2) {
    throw aturanBisnis(
      'Mode grup butuh minimal 2 joblist. Tambah joblist, atau buat tanpa grup.',
    );
  }
  const terlihat = new Map<string, number>();
  for (let i = 0; i < blok.length; i++) {
    const b = blok[i]!;
    const kunci = mode === 'unit' ? String(b.jobId ?? '') : String(b.unitId ?? '');
    if (!kunci) continue;   // baris manual tanpa job/unit tak bisa dibandingkan
    const sebelumnya = terlihat.get(kunci);
    if (sebelumnya !== undefined) {
      throw aturanBisnis(
        `Joblist #${i + 1}: ${mode === 'unit' ? 'job' : 'unit'} ini sudah ada di grup ` +
        `(sama dengan joblist #${sebelumnya}).`,
      );
    }
    terlihat.set(kunci, i + 1);
  }
}

async function tolakUnitSemu(tx: Tx, unitId: number): Promise<void> {
  const u = (
    await tx<{ is_virtual: boolean; unit_name: string }[]>`
      SELECT is_virtual, unit_name FROM units WHERE id = ${unitId}
    `
  )[0];
  if (!u) throw tidakDitemukan('Unit', unitId);
  if (u.is_virtual) {
    throw aturanBisnis(
      `"${u.unit_name}" bukan unit sungguhan — ia penanda jalan pintas ke job `
      + 'manual. Pilih unit yang benar, atau centang "Job manual (Others)".',
    );
  }
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
 * Job wajib milik section yang dipilih, dan model unitnya wajib cocok.
 *
 * Di KMB V2 kecocokan ini adalah perbandingan teks di dua sisi yang tidak
 * simetris memangkas spasi — satu spasi di ujung sel membuat seluruh model unit
 * lenyap dari dropdown tanpa galat apa pun. Di sini keduanya adalah kunci asing
 * yang sama, jadi yang dibandingkan angka, bukan ejaan.
 */
async function pastikanJobCocok(
  tx: Tx, jobId: number, sectionId: number, unitId: number | null,
) {
  const job = (
    await tx<{ section_id: number; unit_model_id: number | null }[]>`
      SELECT section_id, unit_model_id FROM jobs WHERE id = ${jobId} AND is_active
    `
  )[0];
  if (!job) throw tidakDitemukan('Job', jobId);
  if (job.section_id !== sectionId) {
    throw aturanBisnis('Job tidak termasuk section yang dipilih');
  }
  if (job.unit_model_id !== null && unitId !== null) {
    const unit = (
      await tx<{ unit_model_id: number | null }[]>`
        SELECT unit_model_id FROM units WHERE id = ${unitId} AND is_active
      `
    )[0];
    if (!unit) throw tidakDitemukan('Unit', unitId);
    if (unit.unit_model_id !== job.unit_model_id) {
      throw aturanBisnis('Job ini bukan untuk model unit tersebut', { jobId, unitId });
    }
  }
}

/** Pagar naik-saja. HM menopang MTBF unit, KM menopang umur pakai ban. */
async function catatMeter(
  tx: Tx, woId: number, unitId: number | null,
  hm: number | undefined, km: number | undefined, actorId: number,
) {
  if (!unitId) return;
  for (const [kind, nilai] of [['HM', hm], ['KM', km]] as const) {
    if (nilai === undefined || nilai === null) continue;

    const terakhir = (
      await tx<{ value: string }[]>`
        SELECT r.value FROM meter_readings r
         WHERE r.unit_id = ${unitId} AND r.kind = ${kind}::odometer_type
           AND r.recorded_at > coalesce(
                 (SELECT max(changed_at) FROM meter_panel_changes
                   WHERE unit_id = ${unitId} AND kind = ${kind}::odometer_type),
                 '-infinity'::timestamptz)
         ORDER BY r.recorded_at DESC LIMIT 1
      `
    )[0];

    if (terakhir && angka(nilai) < angka(terakhir.value)) {
      throw aturanBisnis(
        `${kind} ${nilai} lebih kecil dari catatan terakhir ${terakhir.value}. ` +
        `Bila panel diganti, catat penggantian panelnya lebih dulu.`,
        { kind, nilai, terakhir: terakhir.value },
      );
    }

    await tx`
      INSERT INTO meter_readings (unit_id, kind, value, work_order_id, recorded_by)
      VALUES (${unitId}, ${kind}::odometer_type, ${nilai}, ${woId}, ${actorId})
    `;
  }
}
