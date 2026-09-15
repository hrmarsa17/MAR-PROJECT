import { BULAN } from '../lib/format.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERIODE GAJI — satu definisi, dipakai bersama
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cut-off gaji bukan bulan kalender, melainkan TANGGAL 16 sampai TANGGAL 15
 * bulan berikutnya (keputusan Gabriel 8 Sep 2026, KMB V2).
 *
 *     16 Agt 00:00:00.000  →  15 Sep 23:59:59.999
 *
 * ── SATU DEFINISI, BUKAN LIMA ───────────────────────────────────────────────
 * Di KMB V2 batas bulan sempat dihitung ulang di setiap tempat yang
 * membutuhkannya: PayrollService, DashboardService (statistik bulan ini DAN
 * grafik tren), dan _SimulasiApprove. Empat salinan aturan yang sama.
 *
 * Selama aturannya "tanggal 1 sampai akhir bulan", empat salinan itu tak pernah
 * berselisih — aturannya terlalu sederhana untuk salah. Begitu cut-off bergeser,
 * satu salinan yang terlewat menghasilkan angka yang BERBEDA TAPI MASUK AKAL di
 * layar yang berbeda, dan tak ada yang tahu mana yang benar sampai ada yang
 * menjumlahkannya.
 *
 * Maka aturannya tinggal di sini, sekali. Yang memakainya:
 *   - kartu statistik Performa (approved · total poin · rata-rata jam)
 *   - papan peringkat Periode
 *   - grafik tren 3 periode
 *   - export payroll
 *   - simulasi approve
 *
 * ── APA YANG TIDAK IKUT BERGESER ────────────────────────────────────────────
 * PA, MTBF, dan MTTR di Dashboard Teknis TETAP bulan kalender. Ketiganya milik
 * kontrak dengan klien, bukan milik payroll: laporan PA klien memakai MOHH 744
 * jam — jam kalender penuh sebulan — dan berjudul "PERIODE JUNI 2026".
 * Menggesernya ke 16-15 membuat angka PA kita berbeda dari angka yang dipegang
 * klien untuk bulan yang sama, dan selisih semacam itu mahal dijelaskan di ruang
 * rapat. Lihat docs/SPEK-LAYAR/05-TEKNIS.md.
 *
 * ── PENAMAAN: RENTANGNYA, BUKAN NAMA BULAN ──────────────────────────────────
 * "16 Agt – 15 Sep 2026", bukan "September" dan bukan "Agustus". Kedua nama itu
 * sama-sama dipakai orang di luar sana untuk rentang yang SAMA, jadi salah
 * satunya pasti akan disalahpahami oleh sebagian pembaca — sementara rentang
 * yang ditulis apa adanya tidak bisa dibaca dua cara.
 *
 * ── MURNI, DAN ITU DISENGAJA ────────────────────────────────────────────────
 * Tidak ada satu pun fungsi di sini yang menyentuh basis data. Cut-off diterima
 * sebagai argumen dengan nilai bawaan 16, bukan dibaca dari tabel `settings` di
 * dalam sini — kalau ia membaca basis data, seluruh pemanggilnya ikut jadi async
 * dan modul ini tak bisa diuji tanpa Postgres. Yang membaca `settings` adalah
 * pemanggil di lapisan kueri, lalu meneruskan angkanya ke sini.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Tanggal mulai periode. Ubah lewat `settings.payroll_cutoff_tanggal`. */
export const CUTOFF_BAWAAN = 16;

export interface Periode {
  /** Inklusif, 00:00:00.000 */
  mulai: Date;
  /** Inklusif, 23:59:59.999 */
  akhir: Date;
  /** "16 Agt – 15 Sep 2026" */
  label: string;
  /** "16 Agt – 15 Sep", untuk sumbu grafik. Tahun ditulis hanya bila lintas tahun. */
  labelPendek: string;
  /** "2026-09" — tahun-bulan PENUTUP. Stabil dan terurut. */
  kunci: string;
}

function periksaCutoff(cutoff: number): number {
  if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 28) {
    // Dibatasi 28 dengan sengaja: cut-off 29-31 tidak ada di Februari, dan
    // "periode yang hilang sebulan sekali" adalah bentuk kesalahan yang baru
    // ketahuan setelah ada yang tidak digaji.
    throw new Error(
      `Cut-off tidak sah: ${cutoff}. Harus bilangan bulat 1-28 ` +
      `(29-31 tidak ada di setiap bulan).`,
    );
  }
  return cutoff;
}

/**
 * Periode gaji yang BERAKHIR di bulan tertentu.
 *
 * Dipilih "berakhir di", bukan "dimulai di", karena itulah yang dipahami orang
 * saat memilih bulan di layar: gaji yang dibayarkan akhir September adalah
 * periode yang ditutup 15 September.
 *
 * @param tahun tahun bulan PENUTUP
 * @param bulan 1-12, bulan PENUTUP. Boleh di luar rentang itu — Date sendiri
 *              yang menggulungnya ke tahun sebelah, dan itu yang membuat
 *              `periodeMundur` bekerja melewati batas tahun tanpa percabangan.
 */
export function periodeBerakhir(tahun: number, bulan: number, cutoff = CUTOFF_BAWAAN): Periode {
  const c = periksaCutoff(cutoff);
  const akhir = new Date(tahun, bulan - 1, c - 1, 23, 59, 59, 999);
  const mulai = new Date(tahun, bulan - 2, c, 0, 0, 0, 0);
  return bungkus(mulai, akhir);
}

/**
 * Periode gaji yang SEDANG BERJALAN pada sebuah tanggal.
 *
 * Tanggal 1-15 masih milik periode yang dibuka bulan lalu; tanggal 16 ke atas
 * sudah masuk periode berikutnya. Batas itu satu-satunya tempat aturan ini bisa
 * salah, jadi ia ditulis sekali di sini dan tak diulang di mana pun.
 */
export function periodeSaatIni(acuan?: Date, cutoff = CUTOFF_BAWAAN): Periode {
  const c = periksaCutoff(cutoff);
  const d = acuan ? new Date(acuan) : new Date();
  const bulanPenutup = d.getDate() >= c
    ? d.getMonth() + 2   // 16 Agt -> ditutup 15 Sep
    : d.getMonth() + 1;  //  8 Sep -> ditutup 15 Sep
  return periodeBerakhir(d.getFullYear(), bulanPenutup, c);
}

/** Mundur N periode. Dipakai grafik tren. `n = 0` mengembalikan periode itu sendiri. */
export function periodeMundur(p: Periode, n: number, cutoff = CUTOFF_BAWAAN): Periode {
  const a = p.akhir;
  return periodeBerakhir(a.getFullYear(), a.getMonth() + 1 - n, cutoff);
}

/**
 * N periode terakhir, TERTUA DI DEPAN — urutan yang dipakai sumbu grafik.
 * Yang terakhir dalam larik adalah periode berjalan.
 */
export function periodeTerakhir(jumlah: number, acuan?: Date, cutoff = CUTOFF_BAWAAN): Periode[] {
  if (!Number.isInteger(jumlah) || jumlah < 1) {
    throw new Error(`Jumlah periode harus bilangan bulat ≥ 1, bukan ${jumlah}`);
  }
  const kini = periodeSaatIni(acuan, cutoff);
  const out: Periode[] = [];
  for (let i = jumlah - 1; i >= 0; i--) out.push(periodeMundur(kini, i, cutoff));
  return out;
}

/** Apakah sebuah tanggal jatuh di dalam periode ini. Kedua batas inklusif. */
export function dalamPeriode(nilai: Date | string | null | undefined, p: Periode): boolean {
  if (nilai === null || nilai === undefined || nilai === '') return false;
  const d = nilai instanceof Date ? nilai : new Date(nilai);
  const t = d.getTime();
  if (Number.isNaN(t)) return false;
  return t >= p.mulai.getTime() && t <= p.akhir.getTime();
}

function bungkus(mulai: Date, akhir: Date): Periode {
  const samaTahun = mulai.getFullYear() === akhir.getFullYear();

  // Tanda pisah adalah EN DASH (U+2013), bukan hubung. Sama dengan KMB V2.
  const label =
    `${mulai.getDate()} ${BULAN[mulai.getMonth()]}` +
    (samaTahun ? '' : ` ${mulai.getFullYear()}`) +
    ` – ${akhir.getDate()} ${BULAN[akhir.getMonth()]} ${akhir.getFullYear()}`;

  // Bentuk pendek untuk sumbu grafik: NAMA bulan, bukan angka. Angka bulan
  // menuntut pembacanya menerjemahkan dulu sebelum bisa membacanya.
  //
  // Tahun HANYA ditulis kalau periodenya menyeberang tahun ("16 Des – 15 Jan '27").
  // Kalau selalu ditulis, tiga batang akan mengulang "2026" tiga kali tanpa
  // memberi keterangan apa pun; kalau tak pernah ditulis, periode
  // Desember-Januari jadi satu-satunya yang ambigu.
  const labelPendek =
    `${mulai.getDate()} ${BULAN[mulai.getMonth()]}` +
    ` – ${akhir.getDate()} ${BULAN[akhir.getMonth()]}` +
    (samaTahun ? '' : ` '${String(akhir.getFullYear()).slice(-2)}`);

  const bln = akhir.getMonth() + 1;
  return {
    mulai, akhir, label, labelPendek,
    kunci: `${akhir.getFullYear()}-${bln < 10 ? '0' : ''}${bln}`,
  };
}
