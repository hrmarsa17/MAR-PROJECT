import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { LayarApproval } from '../../approval/LayarApproval.js';

export const dynamic = 'force-dynamic';

export default async function ApprovalLapangan({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; semua?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (aku.peran === 'mechanic') {
    return (
      <div className="container">
        <div className="kosong">Layar ini untuk L1 dan L2.</div>
      </div>
    );
  }
  const sp = await searchParams;
  return (
    <LayarApproval
      tab={sp.tab ?? 'menunggu'} semua={sp.semua === '1'} dasar="/lapangan"
    />
  );
}
