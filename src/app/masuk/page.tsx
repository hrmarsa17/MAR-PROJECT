'use client';

import { useState } from 'react';

export default function Masuk() {
  const [token, setToken] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetch('/api/masuk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
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
          <p className="page-subtitle">Masuk dengan token akses Anda</p>
        </div>

        <form className="card" onSubmit={kirim}>
          <div className="card-body">
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
              disabled={sibuk || token.trim().length < 8}
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