import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { LayarApproval } from './LayarApproval.js';

export const dynamic = 'force-dynamic';

export default async function Approval({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; semua?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const peran = aku.peran;
  if (peran === 'mechanic') {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">✅ WO Approval</h1>
        </div>
        <div className="kosong">Layar ini untuk L1 dan L2.</div>
      </div>
    );
  }

  const sp = await searchParams;

  /* Isinya diambil DI KLIEN — itulah yang membuat layar ini bisa dibuka tanpa
     sinyal. Halaman ini tinggal memastikan ada sesi dan peran yang benar.

     Penjaga peran TETAP di server, bukan dipindah ke klien: menyembunyikan
     tombol di layar bukan pengamanan. Yang sesungguhnya menahan tetap gerbang
     peran di /api/perintah, dan ini cuma supaya mekanik tidak melihat layar
     yang tak ada gunanya baginya. */
  return <LayarApproval tab={sp.tab ?? 'menunggu'} semua={sp.semua === '1'} />;
}
