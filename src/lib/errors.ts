/**
 * Galat yang punya NAMA.
 *
 * Pelajaran KMB V2: klien menerima teks galat mentah lalu menerjemahkannya
 * kembali jadi kalimat manusia dengan pencocokan kata (`_pesanGagal`,
 * `app.js:2474-2483`). Begitu pesan server berubah satu kata, terjemahan itu
 * diam-diam berhenti bekerja.
 *
 * Di sini setiap kegagalan yang bisa ditindaklanjuti punya kode tetap. Klien
 * memutuskan dari kode, bukan dari kalimat.
 */

export type KodeGalat =
  | 'KONFLIK_KEADAAN'    // perintah basi: orang lain sudah memprosesnya
  | 'TIDAK_BERHAK'
  | 'TIDAK_DITEMUKAN'
  | 'MASUKAN_TIDAK_SAH'
  | 'ATURAN_BISNIS'
  | 'SEDANG_SIBUK';      // klien boleh mencoba lagi apa adanya

export class GalatAplikasi extends Error {
  readonly kode: KodeGalat;
  readonly detail: Record<string, unknown>;
  /** Boleh dicoba ulang dengan op_id yang SAMA tanpa risiko ganda. */
  readonly bolehCobaLagi: boolean;

  constructor(
    kode: KodeGalat,
    pesan: string,
    opts: { detail?: Record<string, unknown>; bolehCobaLagi?: boolean } = {},
  ) {
    super(pesan);
    this.name = 'GalatAplikasi';
    this.kode = kode;
    this.detail = opts.detail ?? {};
    this.bolehCobaLagi = opts.bolehCobaLagi ?? kode === 'SEDANG_SIBUK';
  }
}

/** WO sudah berpindah keadaan sebelum perintah ini tiba.
 *
 *  Ini BUKAN galat teknis. Approver kedua yang menekan tombol sepersekian detik
 *  lebih lambat harus melihat "sudah disetujui <nama>", bukan pesan kegagalan. */
export function konflikKeadaan(
  pesan: string,
  detail: Record<string, unknown> = {},
): GalatAplikasi {
  return new GalatAplikasi('KONFLIK_KEADAAN', pesan, { detail });
}

export function tidakBerhak(pesan: string): GalatAplikasi {
  return new GalatAplikasi('TIDAK_BERHAK', pesan);
}

export function tidakDitemukan(apa: string, id: unknown): GalatAplikasi {
  return new GalatAplikasi('TIDAK_DITEMUKAN', `${apa} tidak ditemukan`, {
    detail: { id },
  });
}

export function aturanBisnis(
  pesan: string,
  detail: Record<string, unknown> = {},
): GalatAplikasi {
  return new GalatAplikasi('ATURAN_BISNIS', pesan, { detail });
}

export function masukanTidakSah(
  pesan: string,
  detail: Record<string, unknown> = {},
): GalatAplikasi {
  return new GalatAplikasi('MASUKAN_TIDAK_SAH', pesan, { detail });
}
