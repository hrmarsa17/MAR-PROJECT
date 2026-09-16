import { z } from 'zod';
import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah } from '../../../lib/errors.js';
import { buatWorkOrder } from '../../../domain/workOrder.js';
import { simpanOverride } from '../../../domain/override.js';
import { kirimKerja } from '../../../domain/kirimKerja.js';
import { mintaTransfer, setujuiTransfer, tolakTransfer } from '../../../domain/transfer.js';
import {
  approveL1, approveL2, batalkanWo, kembalikanKeMekanik, tolakWo,
} from '../../../domain/approval.js';

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
  reject: z.object({
    woId: z.number().int().positive(),
    alasan: z.string().min(5).max(1000),
  }),
  kembalikan: z.object({
    woId: z.number().int().positive(),
    alasan: z.string().min(5).max(1000),
  }),
  /**
   * Setiap medan OPSIONAL, dan itu bukan kelonggaran: `undefined` berarti
   * approver tidak menyentuhnya, sementara nilai yang ada — termasuk string
   * KOSONG untuk judgment — berarti ia sengaja menetapkannya. Membedakan
   * keduanya adalah satu-satunya cara catatan warisan L1 bisa dihapus L2.
   *
   * Batas atas di sini cuma pagar bentuk; batas bisnis yang sesungguhnya
   * (0-10.000 poin, 0-1.000 jam) ditegakkan di domain/override.ts, tempat ia
   * berlaku untuk semua pemanggil, bukan cuma yang lewat rute ini.
   */
  save_override: z.object({
    woId: z.number().int().positive(),
    basePoints: z.number().nonnegative().optional(),
    targetHours: z.number().nonnegative().optional(),
    workCondition: z.string().min(1).max(50).optional(),
    team: z.array(z.number().int().positive()).max(50).optional(),
    waktu: z.object({
      startTime: z.string().min(1),
      endTime: z.string().min(1),
    }).optional(),
    judgment: z.string().max(500).optional(),
  }),
  /**
   * HM & KM sengaja TIDAK ADA di sini.
   *
   * Keduanya diisi saat WO dibuat, dan layar kirim-kerja tidak menanyakannya
   * (medannya disembunyikan di semua section sejak 1 Agu 2026,
   * `MechanicDashboard.html:1002-1007`). Menerimanya di sini berarti membuka
   * kembali jalan yang dulu MENGOSONGKAN angka yang sudah benar setiap kali
   * mekanik mengirim tanpa mengisi — kolomnya jadi kosong tanpa satu pun galat.
   */
  kirim_kerja: z.object({
    woId: z.number().int().positive(),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    partCategory: z.enum(['baru', 'repair', 'kanibal']).optional(),
  }),
  /**
   * Jam mulai sesi WAJIB — dialah yang menentukan berapa jam akan ditambahkan
   * ke `partial_hours` bila L1 menyetujui. Tanpa itu permintaan transfer tidak
   * berarti apa pun bagi uang siapa pun.
   */
  minta_transfer: z.object({
    woId: z.number().int().positive(),
    sessionStart: z.string().min(1),
    note: z.string().max(1000).optional(),
  }),
  setujui_transfer: z.object({
    woId: z.number().int().positive(),
    penerima: z.array(z.number().int().positive()).min(1).max(20),
  }),
  tolak_transfer: z.object({
    woId: z.number().int().positive(),
    alasan: z.string().min(5).max(1000),
  }),
} as const;

const Amplop = z.object({
  aksi: z.enum([
    'buat_wo', 'approve_l1', 'approve_l2', 'batal_wo', 'reject', 'kembalikan',
    'save_override', 'kirim_kerja',
    'minta_transfer', 'setujui_transfer', 'tolak_transfer',
  ]),
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
      case 'reject': {
        const d = isi.data as z.infer<typeof SKEMA.reject>;
        return jawab(await tolakWo({ ...umum, ...d }));
      }
      case 'kembalikan': {
        const d = isi.data as z.infer<typeof SKEMA.kembalikan>;
        return jawab(await kembalikanKeMekanik({ ...umum, ...d }));
      }
      case 'save_override': {
        const d = isi.data as z.infer<typeof SKEMA.save_override>;
        return jawab(await simpanOverride({ ...umum, ...d }));
      }
      case 'kirim_kerja': {
        const d = isi.data as z.infer<typeof SKEMA.kirim_kerja>;
        return jawab(await kirimKerja({ ...umum, ...d }));
      }
      case 'minta_transfer': {
        const d = isi.data as z.infer<typeof SKEMA.minta_transfer>;
        return jawab(await mintaTransfer({ ...umum, ...d }));
      }
      case 'setujui_transfer': {
        const d = isi.data as z.infer<typeof SKEMA.setujui_transfer>;
        return jawab(await setujuiTransfer({ ...umum, ...d }));
      }
      case 'tolak_transfer': {
        const d = isi.data as z.infer<typeof SKEMA.tolak_transfer>;
        return jawab(await tolakTransfer({ ...umum, ...d }));
      }
    }
  } catch (e) {
    return jawabGalat(e);
  }
}
