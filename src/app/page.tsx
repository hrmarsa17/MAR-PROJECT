import { redirect } from 'next/navigation';
import { akuServer } from '../lib/sesi.js';
import { antreanApproval, woSaya } from '../domain/kueri.js';
import { KartuWoTampil } from './KartuWo.js';

export const dynamic = 'force-dynamic';

export default async function Beranda() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const approver = aku.peran === 'supervisor' || aku.peran === 'superintendent';
  const [antrean, milikku] = await Promise.all([
    approver ? antreanApproval(aku) : Promise.resolve([]),
    woSaya(aku),
  ]);

  return (
    <>
      <h1>Halo, {aku.nama}</h1>
      <p className="sub">
        {approver
          ? `${antrean.length} WO menunggu keputusan Anda`
          : `${milikku.length} WO terkait Anda`}
      </p>

      {approver && antrean.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>Menunggu keputusan</h2>
          {antrean.slice(0, 5).map((w) => (
            <KartuWoTampil key={w.id} wo={w} />
          ))}
          {antrean.length > 5 && (
            <p className="sub">
              <a href="/approval">Lihat semua {antrean.length} →</a>
            </p>
          )}
        </>
      )}

      <h2 style={{ fontSize: 16, margin: '22px 0 8px' }}>WO terkait Anda</h2>
      {milikku.length === 0 ? (
        <div className="kosong">
          Belum ada WO. <a href="/wo/baru">Buat WO pertama →</a>
        </div>
      ) : (
        milikku.slice(0, 20).map((w) => <KartuWoTampil key={w.id} wo={w} />)
      )}
    </>
  );
}
