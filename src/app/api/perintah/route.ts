import { z } from 'zod';
import { akuDari, tokenDari, jawab, jawabGalat, pasangCookieSesi } from '../_bantu.js';
import { pakaiAppsScript } from '../../../lib/backendConfig.js';
import { handlePerintahAppsScript } from '../../../backends/appscript/perintah.js';
import { handlePerintahSupabase } from '../../../backends/supabase/perintah.js';
import { masukanTidakSah } from '../../../lib/errors.js';

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
  teamMechanicIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
  team: z.array(z.object({ mechanicId: z.number().int().positive(), share: z.number().min(0).max(1).optional() })).min(1).max(50).optional(),

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
  /**
   * Detail teknis, DIPISAH dari kirim kerja dengan sengaja.
   *
   * Jam kerja adalah uang; detail teknis catatan. Kalau keduanya satu
   * transaksi, kegagalan menulis catatan membatalkan jam kerjanya — dan yang
   * terbaca mekanik adalah "Gagal Kirim" merah di atas pekerjaan yang sungguh
   * ia lakukan. `op_id`-nya sendiri, jadi bisa dicoba ulang tanpa mengirim jam
   * lagi.
   */
  simpan_detail: z.object({
    woId: z.number().int().positive(),
    nilai: z.record(z.string(), z.record(z.string(), z.string().max(500))),
  }),
  /**
   * `nilaiBaru: null` berarti DIKOSONGKAN, dan itu pilihan yang sah:
   * "lebih baik hilang daripada salah". Bedakan dari `undefined` — yang di sini
   * tidak diterima sama sekali, supaya tak ada koreksi yang lupa menyebut
   * angkanya lalu diam-diam tidak mengubah apa pun.
   */
  koreksi_meter: z.object({
    woId: z.number().int().positive(),
    jenis: z.enum(['HM', 'KM']),
    nilaiBaru: z.number().nullable(),
    alasan: z.string().min(5).max(1000),
  }),
  ganti_panel_meter: z.object({
    unitId: z.number().int().positive(),
    jenis: z.enum(['HM', 'KM']),
    // `0` diperbolehkan — panel baru memang mulai dari nol.
    nilaiBaru: z.number().nonnegative(),
    berlakuAt: z.string().min(1),
    alasan: z.string().min(5).max(1000),
  }),
  /* ── ADMIN ──────────────────────────────────────────────────────────────
     Gerbangnya `mechanics.may_admin`, diperiksa di lapisan domain supaya
     berlaku untuk semua pemanggil — bukan cuma yang lewat rute ini. */
  admin_orang: z.object({
    id: z.number().int().positive().optional(),
    kode: z.string().min(2).max(50),
    nama: z.string().min(2).max(200),
    email: z.string().max(200).nullable().optional(),
    peran: z.enum(['mechanic', 'supervisor', 'superintendent']),
    payRateId: z.number().int().positive(),
    grade: z.string().max(100).nullable().optional(),
    section: z.array(z.string().max(50)).max(20).optional(),
    aktif: z.boolean(),
    akunUji: z.boolean(),
    bolehPerforma: z.boolean(),
    bolehTeknis: z.boolean(),
    bolehReport: z.boolean(),
    bolehAdmin: z.boolean(),
  }),
  admin_token: z.object({
    mechanicId: z.number().int().positive(),
    ganti: z.boolean().optional(),
  }),
  admin_token_cabut: z.object({ mechanicId: z.number().int().positive() }),
  /** `jobId` kosong = job baru; ada = sunting. Section/kode hanya dipakai saat baru. */
  admin_job: z.object({
    jobId: z.number().int().positive().optional(),
    sectionCode: z.string().min(1).max(50).optional(),
    kode: z.string().min(2).max(50).optional(),
    nama: z.string().min(3).max(500).optional(),
    unitModel: z.string().max(100).nullable().optional(),
    komponen: z.string().max(200).nullable().optional(),
    subKomponen: z.string().max(200).nullable().optional(),
    basePoints: z.number().positive(),
    planHours: z.number().positive(),
    aktif: z.boolean(),
  }),
  /**
   * `unitId` kosong = unit baru; ada = sunting (kodenya tidak ikut berubah).
   *
   * `section` adalah daftar section yang boleh MEMILIH unit ini — bukan section
   * model alatnya. Larik KOSONG punya arti sendiri: "milik semua section", jadi
   * ia wajib dikirim, bukan opsional. Kalau opsional, "tidak disebut" dan
   * "sengaja dikosongkan" jadi tak terbedakan.
   */
  admin_unit: z.object({
    unitId: z.number().int().positive().optional(),
    kode: z.string().min(2).max(50).optional(),
    nama: z.string().min(2).max(200),
    unitModel: z.string().max(100).nullable().optional(),
    section: z.array(z.string().max(50)).max(20),
    global: z.boolean(),
    unitFactor: z.number().positive(),
    odometer: z.enum(['HM', 'KM']).nullable().optional(),
    brand: z.string().max(100).nullable().optional(),
    modelType: z.string().max(100).nullable().optional(),
    mtbfEligible: z.boolean(),
    aktif: z.boolean(),
  }),
  admin_hapus_job: z.object({ jobId: z.number().int().positive() }),
  admin_hapus_unit: z.object({ unitId: z.number().int().positive() }),
  /**
   * TERAPKAN SURUT — satu-satunya aksi yang menggeser uang yang sudah dibayar.
   *
   * `rupiahSesudahDilihat` bukan pelengkap: domain menghitung ulang pratinjaunya
   * di dalam transaksi dan MENOLAK bila angkanya tidak sama persis. Tanpa itu,
   * WO yang disetujui di antara "lihat pratinjau" dan "tekan tombol" akan ikut
   * terbawa tanpa pernah dilihat siapa pun.
   */
  terapkan_surut: z.object({
    jobId: z.number().int().positive(),
    basePointBaru: z.number().positive(),
    planHoursBaru: z.number().positive(),
    rupiahSesudahDilihat: z.number().nonnegative(),
  }),
  /** Faktor: LINTAS SECTION. Satu baris menyentuh field, workshop, dan tyreman. */
  terapkan_faktor_surut: z.object({
    faktorId: z.number().int().positive(),
    nilaiBaru: z.number().nonnegative(),
    rupiahSesudahDilihat: z.number().nonnegative(),
  }),
  /** Tarif: tidak menyentuh poin sama sekali, hanya harga per poinnya. */
  terapkan_tarif_surut: z.object({
    tarifId: z.number().int().positive(),
    idrBaru: z.number().positive(),
    rupiahSesudahDilihat: z.number().nonnegative(),
  }),
  admin_faktor: z.object({
    id: z.number().int().positive(),
    nilai: z.number().nonnegative(),
    deskripsi: z.string().max(200).nullable().optional(),
  }),
  admin_tarif: z.object({
    id: z.number().int().positive(),
    idrPerPoint: z.number().positive(),
    label: z.string().max(100).optional(),
    aktif: z.boolean(),
  }),
  admin_setelan: z.object({
    kunci: z.string().min(1).max(100),
    nilai: z.string().max(500),
  }),
  /**
   * Muatannya dikirim balik dari PRATINJAU, bukan dari berkas mentah. Server
   * tetap memvalidasi seluruhnya — pratinjau itu untuk mata manusia, bukan
   * pengganti pemeriksaan.
   */
  impor_katalog: z.object({
    jenis: z.enum(['job', 'unit']),
    sectionCode: z.string().max(50).nullable(),
    baris: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  }),
} as const;

const Amplop = z.object({
  aksi: z.enum([
    'buat_wo', 'approve_l1', 'approve_l2', 'batal_wo', 'reject', 'kembalikan',
    'save_override', 'kirim_kerja',
    'minta_transfer', 'setujui_transfer', 'tolak_transfer', 'simpan_detail',
    'koreksi_meter', 'ganti_panel_meter',
    'admin_orang', 'admin_token', 'admin_token_cabut',
    'admin_job', 'admin_unit', 'admin_hapus_job', 'admin_hapus_unit',
    'admin_faktor', 'admin_tarif', 'admin_setelan', 'impor_katalog',
    'terapkan_surut', 'terapkan_faktor_surut', 'terapkan_tarif_surut',
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

    if (pakaiAppsScript()) {
      const token = await tokenDari(req);
      const res = await handlePerintahAppsScript(aksi, amplop.data.data, op_id, token);
      return jawab(res);
    }

    const isi = SKEMA[aksi].safeParse(amplop.data.data);
    if (!isi.success) {
      throw masukanTidakSah(`Data untuk aksi "${aksi}" tidak lengkap atau tidak sah`, {
        masalah: isi.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }

    const umum = { opId: op_id, tenantId: aku.tenantId, actorId: aku.mechanicId };
    const hasil = await handlePerintahSupabase(aksi, isi.data, umum, aku, pasangCookieSesi);
    return jawab(hasil);
  } catch (e) {
    return jawabGalat(e);
  }
}
