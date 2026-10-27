'use client';

import { useState } from 'react';
import { daftarTenant } from '../../lib/tenantRouter.js';

export default function Masuk() {
  const [sistemTerpilih, setSistemTerpilih] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const tenants = daftarTenant();

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!sistemTerpilih) {
      setGalat('Pilih sistem terlebih dahulu');
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetch('/api/masuk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), sistem: sistemTerpilih }),
      });
      const j = await r.json();
      if (!j.ok) {
        setGalat(j.pesan ?? 'Token tidak dikenal');
        setSibuk(false);
        return;
      }
      window.location.href = '/';
    } catch {
      setGalat('Tidak bisa menghubungi server. Periksa sambungan.');
      setSibuk(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="container-sempit" style={{ maxWidth: 500 }}>
        <div className="page-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️ MAR Gate</h1>
          <p className="page-subtitle">Pilih sistem dan masuk dengan token Anda</p>
        </div>

        <form className="card" onSubmit={kirim}>
          <div className="card-body">
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
                Pilih Sistem
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
                {tenants.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => setSistemTerpilih(t.code)}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '2px solid',
                      borderColor: sistemTerpilih === t.code ? 'var(--primary)' : 'var(--border)',
                      background: sistemTerpilih === t.code ? 'var(--primary-soft)' : 'var(--card)',
                      color: 'var(--text)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (sistemTerpilih !== t.code) {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (sistemTerpilih !== t.code) {
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }
                    }}
                  >
                    {t.code}
                  </button>
                ))}
              </div>
              {sistemTerpilih && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  ✓ {tenants.find((t) => t.code === sistemTerpilih)?.name}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="token">
                Token <span className="wajib">*</span>
              </label>
              <input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Ketik token akses Anda"
                style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}
              />
            </div>

            {galat && (
              <div className="kabar kabar-salah" style={{ marginBottom: '1rem' }}>
                ⚠️ {galat}
              </div>
            )}

            <button
              className="btn-primary btn-blok"
              disabled={sibuk || !sistemTerpilih || token.trim().length < 8}
            >
              {sibuk ? '⏳ Memeriksa…' : '🔓 Masuk'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <p>Token Anda aman. Disimpan di server dengan enkripsi.</p>
        </div>
      </div>
    </div>
  );
}
