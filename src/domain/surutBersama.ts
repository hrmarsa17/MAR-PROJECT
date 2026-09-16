import { aturanBisnis } from '../lib/errors.js';
import { periodeSaatIni } from './periode.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DAMPAK SURUT — satu bentuk laporan untuk setiap perubahan yang berlaku mundur
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ada TIGA hal di menu Admin yang bisa dibawa mundur ke WO yang sudah dibayar:
 * base point job, nilai faktor, dan tarif per poin. Ketiganya menembus jaminan
 * yang menopang seluruh sistem ini — bahwa angka yang sudah disetujui dibekukan.
 *
 * Karena itu ketiganya WAJIB melapor dengan bentuk yang sama, dan layar
 * menampilkannya dengan SATU komponen. Kalau tiap perintah punya laporannya
 * sendiri, cepat atau lambat akan ada satu yang lupa menyebut rupiahnya — dan
 * yang menekan tombolnya tidak akan tahu bahwa ia kurang diberi tahu.
 *
 * Yang harus ada di setiap laporan, dan alasannya:
 *
 *   rupiahSekarang/Sesudah   "127 WO terpengaruh" tidak memberi tahu siapa pun
 *                            apa yang akan terjadi. Rupiahnya yang memberi tahu.
 *   periode[]                sebagian periode itu slipnya SUDAH keluar. Yang
 *                            perlu dilihat bukan totalnya, melainkan bulan mana.
 *   orang                    berapa baris pembayaran bergerak, bukan berapa WO.
 *   catatan[]                akibat sampingan yang tidak terbaca dari angkanya —
 *                            mis. status ketepatan waktu yang ikut bergeser.
 *   dilewati + alasannya     yang TIDAK disentuh harus disebut, bukan didiamkan.
 */

export interface PerubahanNilai {
  label: string;
  lama: string;
  baru: string;
}

export interface PeriodeDampak {
  kunci: string;
  label: string;
  wo: number;
  rupiahSekarang: number;
  rupiahSesudah: number;
}

export interface DampakSurut {
  /** Apa yang diubah, untuk kepala layar. "JOB-1210 — Remove & Install". */
  judul: string;
  /** Angka sebelum → sesudah, satu baris per medan yang berubah. */
  perubahan: PerubahanNilai[];
  /** WO approved yang akan dihitung ulang. */
  terpengaruh: number;
  /** WO yang sengaja TIDAK disentuh. 0 bila memang tak ada yang dilewati. */
  dilewati: number;
  /** Kenapa mereka dilewati. Wajib terisi bila `dilewati` > 0. */
  alasanDilewati: string | null;
  /** Peringatan yang tidak terbaca dari angkanya sendiri. */
  catatan: string[];
  rupiahSekarang: number;
  rupiahSesudah: number;
  /** Jumlah (WO × orang) baris pembayaran yang ikut bergerak. */
  orang: number;
  periode: PeriodeDampak[];
  /**
   * Apakah ADA yang benar-benar bergeser.
   *
   * Sengaja bukan `rupiahSesudah !== rupiahSekarang`: perubahan yang sangat
   * kecil bisa menghasilkan rupiah yang sama setelah dibulatkan ke rupiah
   * penuh, sementara poinnya tetap berubah — dan snapshot tetap perlu ditulis
   * supaya angka di katalog dan di WO tidak berselisih diam-diam.
   */
  adaGeser: boolean;
}

/** Satu baris WO di dalam perhitungan — bentuk minimum yang dibutuhkan laporan. */
export interface BarisDampak {
  woId: number;
  disetujui: Date;
  poinLama: number;
  poinBaru: number;
  rupiahLama: number;
  rupiahBaru: number;
  orang: number;
}

/**
 * Menyusun laporan dari baris-baris yang sudah dihitung pemanggilnya.
 *
 * Periode dikelompokkan dengan `periodeSaatIni`, yaitu cut-off 16-15 —
 * BUKAN bulan kalender. Yang perlu dibaca orang adalah periode gaji mana yang
 * bergeser, dan periode gaji tidak sama dengan bulan.
 */
export function rangkumDampak(
  baris: BarisDampak[],
  info: {
    judul: string;
    perubahan: PerubahanNilai[];
    dilewati?: number;
    alasanDilewati?: string | null;
    catatan?: string[];
  },
): DampakSurut {
  const perPeriode = new Map<string, PeriodeDampak>();
  for (const b of baris) {
    const p = periodeSaatIni(b.disetujui);
    const ada = perPeriode.get(p.kunci)
      ?? { kunci: p.kunci, label: p.label, wo: 0, rupiahSekarang: 0, rupiahSesudah: 0 };
    ada.wo += 1;
    ada.rupiahSekarang += b.rupiahLama;
    ada.rupiahSesudah += b.rupiahBaru;
    perPeriode.set(p.kunci, ada);
  }

  return {
    judul: info.judul,
    perubahan: info.perubahan,
    terpengaruh: baris.length,
    dilewati: info.dilewati ?? 0,
    alasanDilewati: info.alasanDilewati ?? null,
    catatan: info.catatan ?? [],
    rupiahSekarang: baris.reduce((a, b) => a + b.rupiahLama, 0),
    rupiahSesudah: baris.reduce((a, b) => a + b.rupiahBaru, 0),
    orang: baris.reduce((a, b) => a + b.orang, 0),
    periode: [...perPeriode.values()].sort((a, b) => a.kunci.localeCompare(b.kunci)),
    adaGeser: baris.some((b) => b.poinBaru !== b.poinLama || b.rupiahBaru !== b.rupiahLama),
  };
}

/**
 * Pagar terakhir sebelum menulis: angka yang DILIHAT orangnya harus masih
 * berlaku.
 *
 * Kalau ada WO yang disetujui di antara "lihat pratinjau" dan "tekan tombol",
 * totalnya berubah — dan yang menekan menyetujui angka yang sudah basi. Ia
 * harus melihat lagi. Dipakai ketiga perintah surut, supaya tak ada satu pun
 * yang lupa memasangnya.
 */
export function pastikanPratinjauMasihBerlaku(
  rupiahSesudahDihitung: number,
  rupiahSesudahDilihat: number,
): void {
  if (Math.round(rupiahSesudahDihitung) !== Math.round(rupiahSesudahDilihat)) {
    throw aturanBisnis(
      'Angkanya berubah sejak Anda melihat pratinjaunya — kemungkinan ada WO '
      + 'yang baru disetujui. Tutup lalu lihat pratinjaunya sekali lagi.',
    );
  }
}
