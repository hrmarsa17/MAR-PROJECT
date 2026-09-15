import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { kartuMekanik, ringkasMonitoring } from '../../domain/kueriMonitoring.js';
import { CariMekanik } from './CariMekanik.js';

export const dynamic = 'force-dynamic';

export default async function Monitoring() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const [ringkas, kartu] = await Promise.all([
    ringkasMonitoring(aku),
    kartuMekanik(aku),
  ]);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">📊 Monitoring Mekanik</h1>
        <p className="page-subtitle">
          Statistik pipeline &amp; akses per-mekanik. <b>Reset</b> bila mekanik
          kehilangan tokennya, atau <b>Buka</b> untuk masuk atas nama mekanik.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{ringkas.mekanik}</div>
          <div className="stat-label">👷 Mekanik</div>
        </div>
        <div className="stat-card biru">
          <div className="stat-value">{ringkas.perlu_diisi}</div>
          <div className="stat-label">📝 Perlu diisi</div>
        </div>
        <div className="stat-card ungu">
          <div className="stat-value">{ringkas.menunggu_approval}</div>
          <div className="stat-label">⏳ Menunggu approval</div>
        </div>
        <div className="stat-card hijau">
          <div className="stat-value">{ringkas.approved}</div>
          <div className="stat-label">✅ Approved (semua waktu)</div>
        </div>
      </div>

      <CariMekanik daftar={kartu} bisaKelolaToken={aku.peran !== 'mechanic'} />
    </div>
  );
}
