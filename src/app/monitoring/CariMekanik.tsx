'use client';

import { useMemo, useState } from 'react';
import type { KartuMekanik } from '../../domain/kueriMonitoring.js';

/**
 * Daftar kartu mekanik dengan pencarian di sisi klien.
 *
 * Pencariannya lokal karena jumlah mekanik puluhan, bukan ribuan — menembak
 * server tiap ketikan hanya menambah jeda tanpa menambah apa pun.
 *
 * SATU PERUBAHAN DISENGAJA dari KMB V2: kotak token tidak lagi menampilkan
 * tokennya. Di KMB V2 tab ini memamerkan token setiap mekanik ke layar L1 dan
 * L2, sehingga siapa pun yang memegang HP approver yang tak terkunci bisa
 * menyalin token siapa saja. Di sini token disimpan ter-hash — tidak ada yang
 * bisa membacanya kembali, termasuk sistemnya sendiri. Yang tersisa: empat
 * huruf terakhir sebagai penanda, dan tombol terbitkan ulang.
 */
export function CariMekanik({
  daftar,
  bisaKelolaToken,
}: {
  daftar: KartuMekanik[];
  bisaKelolaToken: boolean;
}) {
  const [cari, setCari] = useState('');

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
        <div className="kosong">Tidak ada mekanik yang cocok dengan “{cari}”.</div>
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
                    {m.akun_uji && <span className="badge badge-warning">UJI</span>}
                  </div>
                </div>
              </div>

              <div className="mekanik-angka">
                <span className="badge badge-grey">📝 {m.perlu_diisi}</span>
                <span className="badge badge-amber">L1 {m.menunggu_l1}</span>
                <span className="badge badge-purple">L2 {m.menunggu_l2}</span>
                <span className="badge badge-success">✅ {m.approved}</span>
              </div>

              {bisaKelolaToken && (
                <div className="mekanik-token">
                  <input
                    readOnly
                    value={m.punya_token ? `••••••••••••••••${m.token_petunjuk}` : 'belum punya token'}
                    aria-label={`Token ${m.nama}`}
                  />
                  <button className="btn-secondary btn-sm" disabled title="Belum dibangun">
                    ↻ Reset
                  </button>
                  <button className="btn-gelap btn-sm" disabled title="Belum dibangun">
                    Buka →
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
