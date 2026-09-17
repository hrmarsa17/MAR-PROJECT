import { sql } from '../lib/db.js';

/**
 * RIWAYAT PENERAPAN — pencatat dan pembacanya.
 *
 * Yang membedakan "sudah di-push" dari "sudah masuk produksi" hanya baris di
 * tabel `deployments`. Alasan lengkapnya di db/migrasi/010-riwayat-penerapan.sql.
 */

export interface Penerapan {
  commit_sha: string;
  pesan: string | null;
  penulis: string | null;
  cabang: string | null;
  tayang_at: Date;
}

/** Tujuh huruf sidik commit yang sedang dijalankan; `lokal` kalau bukan Vercel. */
export function komitSekarang(): string {
  return process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 7) || 'lokal';
}

/* Instans serverless hidup beberapa menit dan melayani banyak permintaan.
   Tanpa penanda ini, tiap permintaan sehat akan menembak basis data untuk
   mencatat hal yang sama berulang-ulang. Satu instans cukup mencoba sekali. */
let sudahDicoba = false;

/**
 * Mencatat penerapan yang sedang berjalan, sekali saja per instans.
 *
 * ── KENAPA DICATAT SAAT BERJALAN, BUKAN SAAT MEMBANGUN ──────────────────────
 * Build yang berhasil belum tentu tayang — ia bisa gagal saat mulai, bisa
 * ditolak, bisa di-rollback sebelum satu pun permintaan sampai. Mencatat dari
 * dalam permintaan yang sungguhan berarti barisnya hanya lahir kalau penerapan
 * ini BENAR-BENAR melayani seseorang. Itu yang ingin diketahui.
 *
 * ── KENAPA GAGALNYA DIABAIKAN ───────────────────────────────────────────────
 * Pemanggilnya adalah titik periksa kesehatan. Kalau basis data sedang tidak
 * bisa ditulis, jawaban yang benar tetap "aplikasi hidup, basis data
 * bermasalah" — bukan melempar galat baru yang menutupi galat aslinya. Catatan
 * penerapan tidak pernah cukup penting untuk menggagalkan permintaan.
 */
export async function catatPenerapan(): Promise<void> {
  if (sudahDicoba) return;
  sudahDicoba = true;

  const komit = komitSekarang();
  if (komit === 'lokal') return; /* laptop bukan penerapan */

  try {
    await sql`
      INSERT INTO deployments (commit_sha, pesan, penulis, cabang)
      VALUES (
        ${komit},
        ${process.env['VERCEL_GIT_COMMIT_MESSAGE']?.split('\n')[0]?.slice(0, 200) ?? null},
        ${process.env['VERCEL_GIT_COMMIT_AUTHOR_NAME'] ?? null},
        ${process.env['VERCEL_GIT_COMMIT_REF'] ?? null}
      )
      ON CONFLICT (commit_sha) DO NOTHING
    `;
  } catch {
    /* Sengaja bisu — lihat alinea di atas. */
  }
}

/** Penerapan terakhir, terbaru lebih dulu. */
export async function riwayatPenerapan(batas = 30): Promise<Penerapan[]> {
  return sql<Penerapan[]>`
    SELECT commit_sha, pesan, penulis, cabang, tayang_at
      FROM deployments
     ORDER BY tayang_at DESC
     LIMIT ${batas}
  `;
}
