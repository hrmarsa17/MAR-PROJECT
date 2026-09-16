import { sql } from '../lib/db.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DAMPAK SETELAN — kenapa tab ini TIDAK punya tombol "terapkan ke semua WO"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Base point, faktor, dan tarif dibekukan saat approve. Itu sebabnya ketiganya
 * butuh perintah terpisah untuk dibawa mundur.
 *
 * Setelan tidak dibekukan di mana pun. Tak satu pun nilainya pernah disalin ke
 * `scoring_snapshots`, `mechanic_points`, atau kolom WO. Ia dibaca LANGSUNG
 * setiap kali layar disusun. Artinya:
 *
 *   Mengubah setelan SUDAH berlaku surut, seketika, untuk seluruh riwayat.
 *
 * Tombol "terapkan ke semua" karena itu tidak punya pekerjaan untuk dilakukan —
 * dan memasangnya justru berbahaya: ia menyiratkan bahwa TANPA menekannya,
 * perubahan itu aman. Yang dibutuhkan bukan tombol, melainkan KETERANGAN.
 *
 * ── DAN SATU HAL LAGI YANG KETAHUAN SAAT MEMERIKSANYA ───────────────────────
 * Sebagian besar setelan di tabel ini TIDAK DIBACA SIAPA PUN. Nilainya bisa
 * disunting, layar menjawab "tersimpan", dan tidak ada apa pun yang berubah —
 * termasuk `periode_payroll_mulai`, yang terlihat seperti mengatur cut-off gaji
 * padahal cut-off diambil dari tetapan `CUTOFF_BAWAAN` di src/domain/periode.ts.
 *
 * Daftar di bawah ini karena itu bukan dokumentasi. Ia dibaca layar, dan setiap
 * kunci yang belum punya pembaca ditandai apa adanya — supaya tak ada lagi
 * setelan yang tampak bekerja padahal tidak.
 */

export type SifatSetelan = 'langsung' | 'belum_dipakai' | 'tak_dikenal';

interface Keterangan {
  sifat: SifatSetelan;
  /** Apa yang berubah begitu nilainya disimpan. */
  dampak: string;
  /** Berkas yang membacanya — supaya klaim di atas bisa diperiksa. */
  pembaca?: string;
}

/**
 * Diperbarui bersama kodenya. Kunci yang tidak ada di sini dilaporkan
 * `tak_dikenal` — bukan diasumsikan aman.
 */
const PETA: Record<string, Keterangan> = {
  meter_lompat_hm: {
    sifat: 'langsung',
    dampak: 'Dibaca setiap kali layar Koreksi Meter dibuka. Mengubahnya langsung '
      + 'menandai ulang SELURUH riwayat bacaan HM — bacaan lama bisa ikut berubah '
      + 'jadi MELOMPAT atau berhenti ditandai. Tidak menyentuh poin maupun rupiah.',
    pembaca: 'src/domain/meter.ts',
  },
  meter_lompat_km: {
    sifat: 'langsung',
    dampak: 'Sama seperti HM: menandai ulang seluruh riwayat bacaan KM seketika. '
      + 'Menandai, bukan menolak — tidak ada WO yang jadi sah atau tidak sah karenanya.',
    pembaca: 'src/domain/meter.ts',
  },
  tyre_rtd_kritis: {
    sifat: 'langsung',
    dampak: 'Ambang RTD yang ditandai kritis di Dashboard Teknis. Dibaca langsung, '
      + 'jadi mengubahnya langsung menandai ulang seluruh inspeksi ban yang pernah '
      + 'tercatat.',
    pembaca: 'src/domain/kueriTeknisTyre.ts, src/domain/kueriDetailForm.ts',
  },
  tyre_target_life_km: {
    sifat: 'langsung',
    dampak: 'Target umur ban di Dashboard Teknis. Dibaca langsung — seluruh '
      + 'perbandingan umur ban ikut bergeser seketika.',
    pembaca: 'src/domain/kueriTeknisTyre.ts',
  },
  periode_payroll_mulai: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Cut-off gaji diambil dari tetapan '
      + 'CUTOFF_BAWAAN (tanggal 16) di src/domain/periode.ts, bukan dari baris ini. '
      + 'Mengubah angka di sini TIDAK menggeser satu periode gaji pun.',
  },
  shift1_mulai: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Jam shift diambil dari tetapan '
      + 'SHIFT_MULAI_PAGI/MALAM (06 dan 18) di src/domain/shift.ts.',
  },
  shift2_mulai: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Lihat shift1_mulai.',
  },
  ambang_kembar_menit: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Pemeriksaan WO kembar memakai '
      + 'aturannya sendiri di src/domain/workOrder.ts.',
  },
  retensi_struk_hari: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Pemangkasan processed_ops belum '
      + 'dijalankan otomatis.',
  },
  umur_antrean_hari: {
    sifat: 'belum_dipakai',
    dampak: 'BELUM ADA kode yang membacanya. Antrean offline PWA belum dibangun.',
  },
};

export interface SetelanBerdampak {
  kunci: string;
  nilai: string | null;
  keterangan: string | null;
  sifat: SifatSetelan;
  dampak: string;
  pembaca: string | null;
  /** Ada barisnya di tabel `settings`? Kunci yang dibaca kode tapi tak punya baris
      selalu jatuh ke nilai bawaan — dan itu tidak terlihat dari mana pun. */
  adaBarisnya: boolean;
}

const TAK_DIKENAL: Keterangan = {
  sifat: 'tak_dikenal',
  dampak: 'Belum tercatat di daftar dampak. Sebelum mengubahnya, periksa dulu '
    + 'siapa yang membacanya — perubahan setelan berlaku SEKETIKA untuk seluruh '
    + 'riwayat, tanpa tombol apa pun.',
};

export async function setelanBerdampak(tenantId: number): Promise<SetelanBerdampak[]> {
  const baris = await sql<{ kunci: string; nilai: string | null; ket: string | null }[]>`
    SELECT setting_key::text AS kunci, setting_value AS nilai, description AS ket
      FROM settings WHERE tenant_id = ${tenantId} ORDER BY setting_key
  `;
  const punyaBaris = new Set(baris.map((b) => b.kunci));

  const keluar: SetelanBerdampak[] = baris.map((b) => {
    const k = PETA[b.kunci] ?? TAK_DIKENAL;
    return {
      kunci: b.kunci, nilai: b.nilai, keterangan: b.ket,
      sifat: k.sifat, dampak: k.dampak, pembaca: k.pembaca ?? null,
      adaBarisnya: true,
    };
  });

  /* Kunci yang DIBACA kode tapi tidak punya baris. Dari layar ia tak terlihat
     sama sekali, padahal ia sedang memakai nilai bawaan yang tak seorang pun
     pernah memilihnya. */
  for (const [kunci, k] of Object.entries(PETA)) {
    if (punyaBaris.has(kunci) || k.sifat !== 'langsung') continue;
    keluar.push({
      kunci, nilai: null, keterangan: null,
      sifat: k.sifat, dampak: k.dampak, pembaca: k.pembaca ?? null,
      adaBarisnya: false,
    });
  }

  return keluar.sort((a, b) => a.kunci.localeCompare(b.kunci));
}
