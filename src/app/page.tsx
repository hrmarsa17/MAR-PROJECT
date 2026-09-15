import { redirect } from 'next/navigation';
import { akuServer } from '../lib/sesi.js';

export const dynamic = 'force-dynamic';

/**
 * Halaman awal per peran — mengikuti `doGet` KMB V2: L2 mendarat di Performa,
 * approver lain di Approvals, mekanik di Monitoring (layar kerjanya sendiri).
 */
export default async function Beranda() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  if (aku.bolehLihat.performa) redirect('/performa');
  if (aku.peran === 'supervisor') redirect('/approval');
  redirect('/monitoring');
}
