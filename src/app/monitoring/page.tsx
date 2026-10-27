import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { akuServer, NAMA_COOKIE } from '../../lib/sesi.js';
import { pakaiAppsScript } from '../../lib/backendConfig.js';
import { kartuMekanik, ringkasMonitoring, type KartuMekanik, type RingkasMonitoring } from '../../domain/kueriMonitoring.js';
import { pullMonitoringAppsScript } from '../../backends/appscript/data.js';
import { CariMekanik } from './CariMekanik.js';
import { LayarMekanik } from './LayarMekanik.js';

export const dynamic = 'force-dynamic';

/**
 * SATU RUTE, DUA LAYAR — sama seperti `?page=mechanic` di KMB V2
 * (`MechanicDashboard.html:335`):
 *
 *   approver tanpa `?as=`  → selector: kartu mekanik + statistik pipeline
 *   mekanik, atau approver yang menekan "Buka →" → daftar WO orang itu
 */

export default async function Monitoring({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; as?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const sp = await searchParams;
  const mintaAs = sp.as ? Number(sp.as) : null;

  /* Siapa WO-nya yang ditampilkan. Mekanik selalu dirinya sendiri: `?as=` dari
     tangan mekanik diabaikan, bukan ditolak dengan galat — tak ada yang perlu
     ia lakukan dengan pesan itu. */
  const sebagai = aku.peran === 'mechanic' ? aku.mechanicId : mintaAs;

  /* Daftar WO diambil DI KLIEN — itulah yang membuatnya bisa dibuka tanpa
     sinyal. Halaman ini tinggal memastikan ada sesi, lalu menyerahkan sisanya.

     Pemilih mekanik di bawah TETAP dirender server: ia pekerjaan kantor, bukan
     pekerjaan pit, dan ia memuat token setiap orang — hal yang tidak ada
     gunanya disimpan di HP siapa pun. */
  if (sebagai !== null && Number.isFinite(sebagai)) {
    return (
      <LayarMekanik
        as={aku.peran === 'mechanic' ? null : sebagai}
        tab={sp.tab ?? 'assigned'}
      />
    );
  }

  let ringkas: RingkasMonitoring = {
    mekanik: 0,
    perlu_diisi: 0,
    menunggu_approval: 0,
    approved: 0,
    periodeLabel: 'Periode Berjalan',
  };
  let kartu: KartuMekanik[] = [];
  let galatKoneksi: string | null = null;

  try {
    if (pakaiAppsScript()) {
      const token = (await cookies()).get(NAMA_COOKIE)?.value;
      const data = await pullMonitoringAppsScript(token);
      ringkas = data.ringkas;
      kartu = data.kartu;
    } else {
      [ringkas, kartu] = await Promise.all([
        ringkasMonitoring(aku),
        kartuMekanik(aku),
      ]);
    }
  } catch (err) {
    console.error('Galat saat mengambil data monitoring:', err);
    galatKoneksi = 'Basis data tidak dapat dijangkau. Menampilkan tampilan terbatas.';
  }


  return (
    <div className="container">
      {aku.peran !== 'mechanic' && (
        <div className="selector-header">
          <h1 className="page-title">📊 Mechanic Activity Report</h1>
          <p className="selector-subtitle">Track and submit your assigned work</p>
          <div className="stat-grid" style={{ marginTop: '20px' }}>
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
              <div className="stat-label">✅ Approved</div>
              <div className="stat-subtitle">{ringkas.periodeLabel}</div>
            </div>
          </div>
        </div>
      )}

      <CariMekanik daftar={kartu} bisaKelolaToken />
    </div>
  );
}
