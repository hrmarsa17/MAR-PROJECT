import { redirect } from 'next/navigation';
import { akuServer } from '../lib/sesi.js';

export const dynamic = 'force-dynamic';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HALAMAN AWAL — dan kenapa ia TIDAK mendarat di Performa
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sampai 16 Sep 2026 baris ini mengikuti `doGet` KMB V2: siapa pun yang boleh
 * melihat Performa mendarat di sana. Itu keliru, dan kelirunya bukan soal
 * selera.
 *
 * Performa adalah layar yang hak bukanya BISA DIMATIKAN per orang (Admin →
 * Orang & Token → "Boleh lihat Performa"). Menjadikannya pendaratan berarti
 * alamat utama sistem ini berperilaku berbeda-beda tergantung centang yang bisa
 * digeser admin kapan saja — dan orang yang haknya baru dicabut mendarat di
 * tempat yang berbeda dari kemarin tanpa satu pun kalimat yang menjelaskan.
 *
 * Pendaratan harus sesuatu yang dimiliki SEMUA ORANG, dan itu Monitoring:
 * satu-satunya layar kerja yang tidak punya penjaga hak sama sekali, karena
 * setiap orang di sistem ini punya pekerjaan untuk dilihat.
 *
 * Yang belum masuk tetap ke `/masuk`. Itu tidak berubah.
 */
export default async function Beranda() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  /* L1 mendarat di meja approval-nya — itu memang pekerjaan hariannya, dan
     tidak ada hak yang bisa dimatikan di sana. */
  if (aku.peran === 'supervisor') redirect('/approval');

  redirect('/monitoring');
}
