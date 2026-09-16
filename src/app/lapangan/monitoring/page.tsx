import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { LayarMekanik } from '../../monitoring/LayarMekanik.js';

/**
 * "Kerja Saya" — daftar WO orang yang sedang masuk.
 *
 * Pintu lapangan SENGAJA tidak punya pemilih mekanik. Approver yang ingin
 * melihat WO orang lain sedang mengerjakan pekerjaan kantor, dan untuk itu ada
 * pintu utama. Di sini `as` selalu null: yang terbuka selalu milik sendiri.
 */
export const dynamic = 'force-dynamic';

export default async function MonitoringLapangan({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  const sp = await searchParams;
  return <LayarMekanik as={null} tab={sp.tab ?? 'assigned'} dasar="/lapangan" />;
}
