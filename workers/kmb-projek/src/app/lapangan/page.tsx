import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';

export const dynamic = 'force-dynamic';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PINTU LAPANGAN — langsung ke pekerjaannya, tanpa beranda pengantar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sampai 16 Sep 2026 di sini ada beranda berisi empat tombol besar. Ia dibuang
 * karena jadi JALAN BUNTU: begitu orang menekan Buat WO, tidak ada satu pun
 * jalan kembali ke beranda itu — navbar tidak memuatnya, dan di aplikasi
 * terpasang tidak ada tombol Back peramban. Halaman yang hanya bisa dikunjungi
 * sekali bukan beranda; ia layar pembuka yang menghalangi.
 *
 * PWA KMB V2 pun tidak punya beranda: ia membuka langsung ke tab, dan tabnya
 * yang jadi navigasi (`mar-offline/app.js:2583-2593`).
 *
 * ── KE MANA MASING-MASING MENDARAT ──────────────────────────────────────────
 *   approver (L1 & L2) → Approval. Itu meja kerjanya.
 *   mekanik            → WO Saya.  Itu pekerjaannya.
 *
 * Tidak ada yang mendarat di layar yang haknya bisa dimatikan admin, dan tidak
 * ada yang mendarat di layar milik peran lain.
 */
export default async function Lapangan() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const approver = aku.peran === 'supervisor' || aku.peran === 'superintendent';
  redirect(approver ? '/lapangan/approval' : '/lapangan/monitoring');
}
