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
    <div className="container-sempit" style={{ maxWidth: 420 }}>
      <div className="page-header">
        <h1 className="page-title">⚙️ Mechanic Activity Report</h1>
        <p className="page-subtitle">
          Ketikkan token yang diberikan atasan Anda. Sekali saja.
        </p>
      </div>

      <form className="card" onSubmit={kirim}>
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
            placeholder="20 huruf"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {galat && <div className="kabar kabar-salah">{galat}</div>}

        <button className="btn-primary btn-blok" disabled={sibuk || token.trim().length < 8}>
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
