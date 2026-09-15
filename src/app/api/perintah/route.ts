import { z } from 'zod';
import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah } from '../../../lib/errors.js';
import { buatWorkOrder } from '../../../domain/workOrder.js';
import { approveL1, approveL2, batalkanWo } from '../../../domain/approval.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SATU ALAMAT UNTUK SEMUA PENULISAN.
 *
 * Bentuknya `{ aksi, data, op_id }` — sengaja sama dengan kontrak yang sudah
 * dipakai PWA KMB V2, karena antrean offline jadi sederhana bila ia hanya
 * perlu tahu satu URL. Di V2 alamat API tertulis di DUA berkas (`app.js:6`
 * dan `sw.js:25`); mengganti satu dan lupa yang lain berarti antrean dikirim
 * diam-diam ke alamat mati.
 *
 * Validasi memakai SATU skema per aksi, dipakai jalur web maupun PWA. Di V2
 * penyaringan field dilakukan daftar putih manual yang disalin ke dua tempat,
 * dan satu field yang lupa ditambahkan hilang tanpa jejak sementara server
 * menjawab BERHASIL.
 */

const Blok = z.object({
  jobId: z.number().int().positive().optional(),
  unitId: z.number().int().positive().optional(),
  workCondition: z.string().min(1).optional(),
  location: z.string().max(200).optional(),
  keterangan: z.string().max(1000).optional(),
  hourMeter: z.number().nonnegative().optional(),
  kilometers: z.number().nonnegative().optional(),
  teamMechanicIds: z.array(z.number().int().positive()).min(1),
  manual: z
    .object({
      description: z.string().min(1).max(500),
      basePoints: z.number().positive(),
      targetHours: z.number().positive(),
      unitFactor: z.number().positive(),
    })
    .optional(),
});

const SKEMA = {
  buat_wo: z.object({
    sectionCode: z.string().min(1),
    blok: z.array(Blok).min(1).max(50),
    grup: z.object({ mode: z.enum(['unit', 'job']) }).optional(),
  }),
  approve_l1: z.object({
    woId: z.number().int().positive(),
    mtbfRedoStatus: z.enum(['first_time', 'redo']).optional(),
    safetyIncident: z.boolean().optional(),
    judgment: z.string().max(1000).optional(),
  }),
  approve_l2: z.object({
    woId: z.number().int().positive(),
    mtbfRedoStatus: z.enum(['first_time', 'redo']).optional(),
    safetyIncident: z.boolean().optional(),
    judgment: z.string().max(1000).optional(),
  }),
  batal_wo: z.object({
    woId: z.number().int().positive(),
    alasan: z.string().min(5).max(1000),
  }),
} as const;

const Amplop = z.object({
  aksi: z.enum(['buat_wo', 'approve_l1', 'approve_l2', 'batal_wo']),
  // op_id lahir di klien dan TIDAK PERNAH berubah, termasuk saat dicoba ulang.
  // Inilah yang membuat kiriman terulang tidak melahirkan WO kedua.
  op_id: z.string().min(8).max(100),
  data: z.unknown(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);

    const mentah = await req.json().catch(() => null);
    const amplop = Amplop.safeParse(mentah);
    if (!amplop.success) {
      throw masukanTidakSah('Bentuk permintaan tidak dikenali', {
        masalah: amplop.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }

    const { aksi, op_id } = amplop.data;
    const isi = SKEMA[aksi].safeParse(amplop.data.data);
    if (!isi.success) {
      throw masukanTidakSah(`Data untuk aksi "${aksi}" tidak lengkap atau tidak sah`, {
        masalah: isi.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }

    const umum = { opId: op_id, tenantId: aku.tenantId, actorId: aku.mechanicId };

    switch (aksi) {
      case 'buat_wo': {
        const d = isi.data as z.infer<typeof SKEMA.buat_wo>;
        return jawab(await buatWorkOrder({ ...umum, ...d }));
      }
      case 'approve_l1': {
        const d = isi.data as z.infer<typeof SKEMA.approve_l1>;
        return jawab(await approveL1({ ...umum, ...d }));
      }
      case 'approve_l2': {
        const d = isi.data as z.infer<typeof SKEMA.approve_l2>;
        return jawab(await approveL2({ ...umum, ...d }));
      }
      case 'batal_wo': {
        const d = isi.data as z.infer<typeof SKEMA.batal_wo>;
        return jawab(await batalkanWo({ ...umum, ...d }));
      }
    }
  } catch (e) {
    return jawabGalat(e);
  }
}
