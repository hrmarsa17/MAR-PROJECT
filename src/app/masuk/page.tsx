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
    <>
      <h1>Masuk</h1>
      <p className="sub">Ketikkan token yang diberikan atasan Anda. Sekali saja.</p>

      <form className="kartu" onSubmit={kirim} style={{ maxWidth: 420 }}>
        <div className="medan">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="20 huruf"
          />
        </div>

        {galat && <div className="kabar salah">{galat}</div>}

        <button className="utama" disabled={sibuk || token.trim().length < 8}>
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </>
  );
}
