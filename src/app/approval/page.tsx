import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { antreanApproval } from '../../domain/kueri.js';
import { KartuWoTampil } from '../KartuWo.js';
import { AksiApproval } from './AksiApproval.js';

export const dynamic = 'force-dynamic';

export default async function Approval() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  // Diambil ke variabel tersendiri supaya penyempitan tipenya bertahan
  // melewati `await` di bawah.
  const peran = aku.peran;

  if (peran === 'mechanic') {
    return (
      <>
        <h1>Approval</h1>
        <div className="kosong">Layar ini untuk L1 dan L2.</div>
      </>
    );
  }

  const antrean = await antreanApproval(aku);
  const tahap = peran === 'superintendent' ? 'L2' : 'L1';

  return (
    <>
      <h1>Approval {tahap}</h1>
      <p className="sub">
        {antrean.length === 0
          ? 'Tidak ada yang menunggu.'
          : `${antrean.length} WO menunggu keputusan Anda, terlama di atas.`}
        {peran === 'superintendent' && antrean.length > 0 && (
          <> Menyetujui di sini <b>menerbitkan poin dan rupiah</b>.</>
        )}
      </p>

      {antrean.length === 0 ? (
        <div className="kosong">Antrean bersih.</div>
      ) : (
        antrean.map((w) => (
          <KartuWoTampil
            key={w.id}
            wo={w}
            anak={<AksiApproval woId={w.id} nomor={w.wo_number} peran={peran} />}
          />
        ))
      )}
    </>
  );
}
