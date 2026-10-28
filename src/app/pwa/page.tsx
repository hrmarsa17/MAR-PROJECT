import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';

export const dynamic = 'force-dynamic';

export default async function PWAMode() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '2rem' }}>
      <div style={{ maxWidth: 600, textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>📱</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--primary)' }}>
          PWA Mode (Offline-First)
        </h1>
        <div style={{ background: 'var(--card)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', marginBottom: '2rem' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
            <strong>Tenant:</strong> {aku.tenantCode}
          </p>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
            <strong>Nama:</strong> {aku.nama}
          </p>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
            <strong>Peran:</strong> {aku.peran}
          </p>
          <p style={{ fontSize: '1.1rem' }}>
            <strong>Mechanic ID:</strong> {aku.mechanicId}
          </p>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Halaman PWA ini adalah dummy untuk testing. Implementasi penuh akan menampilkan aplikasi offline-first yang sesuai dengan tenant Anda.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <a href="/monitoring" style={{ padding: '0.75rem 1.5rem', background: 'var(--primary)', color: 'white', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            💻 Ke Web Normal
          </a>
          <a href="/masuk" style={{ padding: '0.75rem 1.5rem', background: 'var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            🔓 Logout
          </a>
        </div>
      </div>
    </div>
  );
}
