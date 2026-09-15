'use client';

import { useMemo, useState } from 'react';
import type { KartuMekanik } from '../../domain/kueriMonitoring.js';

/**
 * Daftar kartu mekanik dengan pencarian di sisi klien.
 *
 * Pencariannya lokal karena jumlah mekanik puluhan, bukan ribuan — menembak
 * server tiap ketikan hanya menambah jeda tanpa menambah apa pun
 * (`MechanicDashboard.html:455-465`).
 *
 * TOKEN DITAMPILKAN UTUH, dan itu memang gunanya layar ini: mekanik di lapangan
 * yang lupa tokennya bertanya ke L1/L2, yang membukanya di sini lalu menekan
 * Copy. Yang disalin TOKEN-nya, bukan URL panjang — sejak layar masuk berbasis
 * token, itu yang dibagikan ke mekanik (`MechanicDashboard.html:401-403`).
 */
export function CariMekanik({
  daftar,
  bisaKelolaToken,
}: {
  daftar: KartuMekanik[];
  bisaKelolaToken: boolean;
}) {
  const [cari, setCari] = useState('');
  const [tersalin, setTersalin] = useState<number | null>(null);

  const hasil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    if (!k) return daftar;
    return daftar.filter(
      (m) =>
        m.nama.toLowerCase().includes(k) ||
        m.kode.toLowerCase().includes(k) ||
        (m.section ?? '').toLowerCase().includes(k),
    );
  }, [daftar, cari]);

  async function salin(m: KartuMekanik) {
    if (!m.token) return;
    try {
      await navigator.clipboard.writeText(m.token);
    } catch {
      // Clipboard API ditolak (halaman non-HTTPS, izin peramban). Jalur
      // cadangan yang sama dengan KMB V2 — tanpa ini tombolnya diam saja dan
      // orang mengira tersalin padahal tidak.
      const ta = document.createElement('textarea');
      ta.value = m.token;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* menyerah dengan jujur */ }
      document.body.removeChild(ta);
    }
    setTersalin(m.id);
    setTimeout(() => setTersalin((v) => (v === m.id ? null : v)), 1500);
  }

  return (
    <>
      <div className="form-group" style={{ maxWidth: 340 }}>
        <input
          type="text"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="🔍 Cari nama mekanik…"
          aria-label="Cari nama mekanik"
        />
      </div>

      {hasil.length === 0 ? (
        <div className="kosong">
          {daftar.length === 0
            ? 'Belum ada mekanik dalam scope Anda.'
            : `Tidak ditemukan mekanik dengan nama tersebut.`}
        </div>
      ) : (
        <div className="mekanik-grid">
          {hasil.map((m) => (
            <article className="mechanic-card" key={m.id}>
              <div className="mekanik-head">
                <div className="mechanic-avatar">{m.nama.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="mekanik-nama">{m.nama}</div>
                  <div className="mekanik-kode">
                    {m.kode}
                    {m.section && <span className="badge badge-blue">{m.section.toUpperCase()}</span>}
                    {m.akun_uji && (
                      <span
                        className="badge badge-warning"
                        title="Akun uji — disembunyikan dari dropdown & tidak dihitung payroll/peringkat"
                      >UJI</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Empat penghitung pipeline, urutan sama dengan KMB V2. */}
              <div className="mekanik-angka">
                <span className="badge badge-grey" title="Perlu diisi">📝 {m.perlu_diisi}</span>
                <span className="badge badge-amber" title="Menunggu L1">⏳ L1 {m.menunggu_l1}</span>
                <span className="badge badge-purple" title="Menunggu L2">⏳ L2 {m.menunggu_l2}</span>
                <span className="badge badge-success" title="Approved periode ini">✅ {m.approved}</span>
              </div>

              {bisaKelolaToken && (
                m.token ? (
                  <div className="mekanik-token">
                    <input
                      readOnly
                      value={m.token}
                      title="Token login mekanik"
                      aria-label={`Token ${m.nama}`}
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => void salin(m)}
                    >
                      {tersalin === m.id ? '✅ Tersalin' : '📋 Copy Token'}
                    </button>
                  </div>
                ) : (
                  <div className="kabar kabar-awas" style={{ marginTop: 8, fontSize: '0.75rem' }}>
                    ⚠️ Belum ada token. Terbitkan lewat{' '}
                    <code>npm run token {m.kode}</code>
                  </div>
                )
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
