import { BULAN } from '../lib/format.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SHIFT — satu tetapan jam, dipakai bersama
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   Shift 1  06:00 – 18:00, dalam satu hari
 *   Shift 2  18:00 – 06:00, MELEWATI hari
 *
 * Di KMB V2 batas ini tinggal di `_DashboardField.js` sebagai
 * FIELD_SHIFT_MULAI_PAGI / _MALAM, dan papan harian di DashboardService
 * MEMINJAMNYA alih-alih menulis angkanya sendiri (`DashboardService.js:509-513`):
 *
 *   "supaya jam shift tak pernah punya dua versi di satu sistem. Kalau kelak
 *    jamnya bergeser, satu tempat saja."
 *
 * Maka di sini pun satu berkas, dipakai papan harian Performa dan Dashboard
 * Teknis.
 *
 * ── KENAPA PAPAN HARIAN MEMAKAI SHIFT, BUKAN 24 JAM ─────────────────────────
 * Keputusan Gabriel 8 Sep 2026. Sebelumnya jendelanya 06:00 ke 06:00 — sehari
 * penuh — dan itu mencampur dua shift. Dua shift adalah dua REGU ORANG yang
 * berbeda: papan yang menyatukannya membandingkan orang yang tak pernah bekerja
 * bersamaan, dan regu malam akan selalu kalah di pagi hari hanya karena
 * shiftnya belum dimulai.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const SHIFT_MULAI_PAGI = 6;
export const SHIFT_MULAI_MALAM = 18;

export interface JendelaShift {
  nama: 'Shift 1' | 'Shift 2';
  /** Inklusif */
  mulai: Date;
  /** Inklusif, satu milidetik sebelum batas bulat berikutnya */
  akhir: Date;
  /** "Shift 1 · 15 Sep 06:00 – 18:00" */
  label: string;
}

/**
 * Shift yang SEDANG BERJALAN pada sebuah waktu.
 *
 * Batas akhir disimpan sebagai satu milidetik SEBELUM jam bulat berikutnya
 * (17:59:59.999) supaya tak bertindih dengan shift sesudahnya. Yang DITULIS di
 * layar tetap jam bulatnya — itu yang dipahami orang, dan tidak ada pekerjaan
 * yang jatuh di celah satu milidetik itu.
 */
export function shiftBerjalan(acuan?: Date): JendelaShift {
  const now = acuan ? new Date(acuan) : new Date();
  const th = now.getFullYear();
  const bl = now.getMonth();
  const tg = now.getDate();
  const jam = now.getHours();

  let nama: JendelaShift['nama'];
  let mulai: Date;
  let akhir: Date;

  if (jam < SHIFT_MULAI_PAGI) {
    // Dini hari: masih Shift 2 yang dibuka KEMARIN petang.
    nama = 'Shift 2';
    mulai = new Date(th, bl, tg - 1, SHIFT_MULAI_MALAM, 0, 0, 0);
    akhir = new Date(th, bl, tg, SHIFT_MULAI_PAGI, 0, 0, -1);
  } else if (jam < SHIFT_MULAI_MALAM) {
    nama = 'Shift 1';
    mulai = new Date(th, bl, tg, SHIFT_MULAI_PAGI, 0, 0, 0);
    akhir = new Date(th, bl, tg, SHIFT_MULAI_MALAM, 0, 0, -1);
  } else {
    nama = 'Shift 2';
    mulai = new Date(th, bl, tg, SHIFT_MULAI_MALAM, 0, 0, 0);
    akhir = new Date(th, bl, tg + 1, SHIFT_MULAI_PAGI, 0, 0, -1);
  }

  return { nama, mulai, akhir, label: labelShift(nama, mulai, akhir) };
}

function labelShift(nama: string, mulai: Date, akhir: Date): string {
  const samaHari =
    mulai.getDate() === akhir.getDate() && mulai.getMonth() === akhir.getMonth();
  const ekor = samaHari ? '' : `${akhir.getDate()} ${BULAN[akhir.getMonth()]} `;
  return (
    `${nama} · ${mulai.getDate()} ${BULAN[mulai.getMonth()]} ${jj(mulai)}` +
    ` – ${ekor}${jj(akhir)}`
  );
}

/**
 * Jam:menit untuk label. Batas yang disimpan sebagai 17:59 dan 05:59 ditulis
 * sebagai jam bulatnya — lihat catatan di `shiftBerjalan`.
 */
function jj(d: Date): string {
  let h = d.getHours();
  let m = d.getMinutes();
  if (h === SHIFT_MULAI_MALAM - 1 && m === 59) { h = SHIFT_MULAI_MALAM; m = 0; }
  else if (h === SHIFT_MULAI_PAGI - 1 && m === 59) { h = SHIFT_MULAI_PAGI; m = 0; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
