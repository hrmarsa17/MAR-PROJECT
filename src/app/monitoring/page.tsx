import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { akuServer, NAMA_COOKIE } from '../../lib/sesi.js';
import { pakaiAppsScript } from '../../lib/backendConfig.js';
import { kartuMekanik, ringkasMonitoring, type KartuMekanik, type RingkasMonitoring } from '../../domain/kueriMonitoring.js';
import { pullMonitoringAppsScript } from '../../backends/appscript/data.js';
import { CariMekanik } from './CariMekanik.js';
import { LayarMekanik } from './LayarMekanik.js';

const modePilih = {
  display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
  padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
};

const modeLabel = { fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.85rem' };

const modeOpsi = {
  display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const,
};

const modeBtnSuara = (mode: 'pwa' | 'web') => ({
  padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', border: '2px solid',
  color: 'var(--text)', cursor: 'pointer',
  fontWeight: 600, transition: 'all 0.2s',
  borderColor: mode === 'pwa' ? 'var(--primary)' : 'var(--border)',
  background: mode === 'pwa' ? 'var(--primary-soft)' : 'var(--card)',
});

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
      {/* Mode akses: PWA vs Web Normal */}
      <div style={{ background: 'var(--primary-soft)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '2rem', border: '2px solid var(--primary)' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ background: 'white', padding: '0.4rem 0.8rem', borderRadius: '50%' }}>📱</span>
          Pilih mode akses
        </h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Token Anda: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-surface-elevated)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>{aku.nama}</code> • Tenant: <strong>{aku.tenantCode}</strong>
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => window.location.href = '/pwa'}
            style={{
              padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', border: '3px solid var(--primary)',
              background: 'linear-gradient(135deg, var(--primary-soft) 0%, #e3f2ed 100%)', color: 'var(--primary)',
              cursor: 'pointer', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)', transition: 'all 0.2s', flex: '1', minWidth: '200px'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>📱</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 800 }}>PWA (Offline-first)</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Untuk HP lapangan</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => window.location.href = '/monitoring'}
            style={{
              padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', border: '3px solid var(--border-subtle)',
              background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer',
              fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              boxShadow: 'var(--shadow-card)', transition: 'all 0.2s', flex: '1', minWidth: '200px'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>💻</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 800 }}>Web Normal</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Untuk laptop/PC</div>
            </div>
          </button>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Mode PWA menyimpan data offline, Web Normal terhubung langsung ke backend.
        </p>
      </div>

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
