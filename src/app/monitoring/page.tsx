import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { kartuMekanik, ringkasMonitoring } from '../../domain/kueriMonitoring.js';
import { CariMekanik } from './CariMekanik.js';

export const dynamic = 'force-dynamic';

export default async function Monitoring() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  // Layar ini menampilkan token setiap mekanik. Yang menjaganya bukan hash,
  // melainkan gerbang ini — dan scope section di lapisan kueri.
  if (aku.peran === 'mechanic') {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">📊 Monitoring Mekanik</h1>
        </div>
        <div className="kosong">Layar ini untuk L1 dan L2.</div>
      </div>
    );
  }

  const [ringkas, kartu] = await Promise.all([
    ringkasMonitoring(aku),
    kartuMekanik(aku),
  ]);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">📊 Monitoring Mekanik</h1>
        <p className="page-subtitle">
          Pencapaian &amp; progres WO tiap mekanik, berikut tokennya.
          Tekan <b>Copy Token</b> untuk mekanik yang lupa tokennya.
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
          {/* KMB V2 menulis "Approved (semua waktu)" di sini padahal angkanya
              periode berjalan (MechanicService.js:216). Labelnya yang salah,
              bukan angkanya — jadi labelnya yang diperbaiki. */}
          <div className="stat-label">✅ Approved</div>
          <div className="stat-subtitle">{ringkas.periodeLabel}</div>
        </div>
      </div>

      <CariMekanik daftar={kartu} bisaKelolaToken />
    </div>
  );
}
