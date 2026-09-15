/**
 * RUMUS POIN & RUPIAH — fungsi murni, tanpa basis data.
 *
 * Dipisah dari segalanya supaya bisa diuji tanpa Postgres, dan supaya hanya ada
 * SATU tempat di seluruh sistem yang tahu cara menghitung uang.
 *
 * Di KMB V2 rumus ini punya dua salinan (`ScoringService.calculateScore` yang
 * dipakai, dan `PointsCalculation.calculateFinalPointsDetailed` yang mati tapi
 * masih terbaca seperti hidup) dengan kunci rate yang berbeda. Namespace GAS
 * yang datar membuat yang aktif ditentukan urutan muat berkas, bukan import.
 */

export type TimelinessStatus = 'on_time' | 'late' | 'way_late';

/** Ambang ketepatan waktu, dalam persen actual/target. KMB V2: Constants.js:334-337 */
export const AMBANG_TEPAT_WAKTU = { ON_TIME_MAX: 100, LATE_MAX: 150 } as const;

export interface FaktorTersedia {
  /** Config_Factors factor_type='work_condition' → normal/difficult/extreme */
  workCondition: Record<string, number>;
  /** factor_type='timeliness' → on_time/late/way_late */
  timeliness: Record<TimelinessStatus, number>;
  /** factor_type='safety' → no_incident/incident */
  safety: Record<string, number>;
  /** factor_type='mtbf' → first_time/redo */
  mtbf: Record<string, number>;
}

export interface MasukanSkor {
  basePoints: number;
  targetHours: number;
  actualHours: number;
  unitFactor: number;
  workCondition: string;
  safetyIncident: boolean;
  mtbfRedoStatus: string | null;
}

export interface RincianSkor {
  basePoints: number;
  targetHours: number;
  actualHours: number;
  unitFactor: number;
  workConditionFactor: number;
  timelinessFactor: number;
  timelinessStatus: TimelinessStatus;
  safetyFactor: number;
  mtbfFactor: number;
  finalPoints: number;
}

/**
 * Pembulatan setengah-ke-atas yang tahan galat pecahan biner.
 *
 * Dua jebakan sekaligus:
 *
 * 1. KMB V2 memakai `decimals = decimals || 2`, sehingga memanggilnya dengan 0
 *    diam-diam membulatkan ke 2 desimal — 0 itu falsy. Belum menggigit di sana
 *    hanya karena semua tarif kebetulan kelipatan 100.
 *
 * 2. Angka seperti 8,165 tidak tersimpan persis: bentuk biner terdekatnya
 *    adalah 8,16499999999999986, sehingga `Math.round(8.165 * 100)` menghasilkan
 *    816 — membulat ke BAWAH. Koreksinya harus mengikuti BESARAN angkanya;
 *    `Number.EPSILON` sendirian adalah jarak antar-pecahan di sekitar 1,0 dan
 *    terlalu kecil untuk angka berukuran ratusan.
 *
 * Koreksi di bawah besarnya kurang dari satu langkah pecahan terkecil pada
 * skala itu, jadi ia hanya menggeser angka yang secara matematis memang tepat
 * di tengah — tidak pernah angka yang sungguh-sungguh di bawahnya.
 */
export function bulatkan(nilai: number, desimal: number): number {
  if (!Number.isFinite(nilai)) throw new Error(`bukan angka: ${String(nilai)}`);
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

export function statusKetepatanWaktu(
  actualHours: number,
  targetHours: number,
): TimelinessStatus {
  // target 0 jam tidak bisa dibagi; perlakukan sebagai tepat waktu, seperti V2.
  if (targetHours <= 0) return 'on_time';
  const rasio = (actualHours / targetHours) * 100;
  if (rasio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) return 'on_time';
  if (rasio <= AMBANG_TEPAT_WAKTU.LATE_MAX) return 'late';
  return 'way_late';
}

/**
 * FINAL = base × unit × kondisi × ketepatan × safety × mtbf
 *
 * Faktor yang tidak ditemukan bernilai 1,0 — TETAPI pemanggil wajib sudah
 * memastikan base_points ada. Di V2, base_points yang hilang melempar error
 * (benar); faktor yang hilang jatuh ke 1,0 dengan peringatan (juga benar,
 * karena faktor yang hilang berarti "tidak ada penyesuaian", bukan "nol").
 */
export function hitungSkor(m: MasukanSkor, f: FaktorTersedia): RincianSkor {
  const timelinessStatus = statusKetepatanWaktu(m.actualHours, m.targetHours);

  const workConditionFactor = f.workCondition[m.workCondition] ?? 1.0;
  const timelinessFactor = f.timeliness[timelinessStatus] ?? 1.0;
  const safetyFactor = m.safetyIncident
    ? (f.safety['incident'] ?? 0.0)
    : (f.safety['no_incident'] ?? 1.0);
  const mtbfFactor = m.mtbfRedoStatus ? (f.mtbf[m.mtbfRedoStatus] ?? 1.0) : 1.0;

  const finalPoints = bulatkan(
    m.basePoints *
      m.unitFactor *
      workConditionFactor *
      timelinessFactor *
      safetyFactor *
      mtbfFactor,
    2,
  );

  return {
    basePoints: m.basePoints,
    targetHours: m.targetHours,
    actualHours: m.actualHours,
    unitFactor: m.unitFactor,
    workConditionFactor,
    timelinessFactor,
    timelinessStatus,
    safetyFactor,
    mtbfFactor,
    finalPoints,
  };
}

/**
 * Rupiah satu mekanik.
 *
 * MODEL POIN PENUH: setiap anggota tim menerima finalPoints UTUH, bukan porsi.
 * Menambah anggota tidak memecah kue — ia menggandakan pengeluaran. Itu memang
 * kebijakannya, dan setiap penambahan anggota adalah keputusan uang.
 *
 * `idrPerPoint` WAJIB diserahkan pemanggil dari baris pay_rates mekanik itu.
 * Tidak ada nilai cadangan di sini — dengan sengaja. Di KMB V2 nilai cadangan
 * 50.000 (11-20x rate asli) dipakai diam-diam setiap kali nama jabatan tidak
 * cocok, tanpa error dan tanpa log.
 */
export function rupiahUntukPoin(points: number, idrPerPoint: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(idrPerPoint)) {
    throw new Error('poin dan rate wajib angka');
  }
  if (idrPerPoint < 0) throw new Error('rate tidak boleh negatif');
  return bulatkan(points * idrPerPoint, 0);
}

/** Jam yang dipakai menghitung = sesi terakhir + akumulasi sebelum transfer. */
export function jamTerpakai(sessionHours: number, partialHours: number): number {
  return bulatkan((sessionHours || 0) + (partialHours || 0), 2);
}
