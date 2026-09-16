import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { LayarMekanik } from '../../monitoring/LayarMekanik.js';

/**
 * "WO Saya" — pekerjaan orang yang sedang masuk. MILIK MEKANIK.
 *
 * Pintu lapangan SENGAJA tidak punya pemilih mekanik: melihat WO orang lain
 * adalah pekerjaan kantor, dan untuk itu ada pintu utama. Di sini `as` selalu
 * null — yang terbuka selalu milik sendiri.
 */
export const dynamic = 'force-dynamic';

export default async function MonitoringLapangan({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  /* Approver dilempar ke mejanya sendiri — kebalikan dari V2, yang melempar
     mekanik yang tersasar ke tab approver (`app.js:2587`). Alasannya sama:
     approver tidak punya WO untuk dikerjakan sendiri, jadi layar ini akan
     selalu kosong baginya, dan daftar kosong terbaca seperti ada yang rusak. */
  if (aku.peran !== 'mechanic') redirect('/lapangan/approval');

  const sp = await searchParams;
  return <LayarMekanik as={null} tab={sp.tab ?? 'assigned'} dasar="/lapangan" />;
}
