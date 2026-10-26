'use client';

import { useState } from 'react';

export default function Masuk() {
  const [sistem, setSistem] = useState('PKMB');
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
        body: JSON.stringify({ token: token.trim(), sistem }),
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
        <h1 className="page-title">⚙️ MAR Gate</h1>
      </div>

      <form className="card" onSubmit={kirim}>
        <div className="card-body">
        <div className="form-group">
          <label className="form-label">Sistem</label>
          <select value={sistem} onChange={(e) => setSistem(e.target.value)} style={{ marginBottom: 16 }}>
            <option value="PKMB">PKMB (Hybrid)</option>
            <option value="KMB">KMB (Sheet)</option>
            <option value="SUM">SUM (Sheet)</option>
          </select>
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
            placeholder="Ketik token akses"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {galat && <div className="kabar kabar-salah">{galat}</div>}

        <button className="btn-primary btn-blok" disabled={sibuk || token.trim().length < 8}>
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>
        </div>
      </form>
    </div>
  );
}
