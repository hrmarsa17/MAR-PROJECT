'use client';

import { useCallback, useEffect, useState } from 'react';
import { KartuApprovalTampil } from './KartuApprovalTampil.js';
import { KartuTransferTampil } from './KartuTransferTampil.js';
import { adaIndexedDb, bacaKv, simpanKv } from '../../pwa/simpanan.js';
import type { KartuApproval, TabApproval } from '../../domain/kueriApproval.js';
import type { KartuTransfer } from '../../domain/kueriTransfer.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LAYAR APPROVAL — diambil di KLIEN, supaya bisa dibuka tanpa sinyal
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sama seperti Monitoring: sampai 16 Sep 2026 layar ini dirender server dan
 * karena itu tidak bisa dibuka sama sekali tanpa sinyal.
 *
 * ── HANYA TAB `menunggu` YANG DISIMPAN ──────────────────────────────────────
 * Itu satu-satunya tab yang menghasilkan TINDAKAN. `aktif`, `approved`, dan
 * `ditolak` adalah bacaan riwayat — berguna di kantor, tidak ada yang bisa
 * dikerjakan atasnya dari lapangan. `transfer` juga dilewati: keputusannya
 * menuntut daftar calon penerima yang berubah-ubah, dan memutuskan transfer
 * dengan daftar yang basi berarti menunjuk orang yang mungkin sudah ada di tim.
 *
 * `menunggu` aman disimpan karena ia sudah dibatasi 25 kartu di server.
 */

interface Muatan {
  peran: 'supervisor' | 'superintendent';
  tab: TabApproval;
  semua: boolean;
  hitung: Record<string, number>;
  kartu: KartuApproval[];
  transfer: KartuTransfer[];
  penerima: { id: number; nama: string; kode: string }[];
  total: number;
}

const TAB: { kunci: TabApproval; label: string; ikon: string }[] = [
  { kunci: 'menunggu', label: 'WO Approval', ikon: '✅' },
  { kunci: 'aktif', label: 'WO Aktif', ikon: '⏳' },
  { kunci: 'approved', label: 'WO Approved', ikon: '📋' },
  { kunci: 'transfer', label: 'Transfer WO', ikon: '🔄' },
  { kunci: 'ditolak', label: 'Ditolak', ikon: '❌' },
];

export function LayarApproval({ tab, semua }: { tab: string; semua: boolean }) {
  const [data, setData] = useState<Muatan | null>(null);
  const [dariSimpanan, setDariSimpanan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const bolehSimpan = tab === 'menunggu' && !semua;

  const muat = useCallback(async () => {
    setGalat(null);

    if (adaIndexedDb() && bolehSimpan) {
      try {
        const simpan = await bacaKv<Muatan>('approval');
        if (simpan) { setData(simpan); setDariSimpanan(true); }
      } catch { /* penyimpanan diblokir */ }
    }

    try {
      const r = await fetch(
        `/api/data?jenis=approval&tab=${encodeURIComponent(tab)}${semua ? '&semua=1' : ''}`,
      );
      const j = await r.json();
      if (!j.ok) throw new Error(j.pesan ?? 'Gagal memuat');
      const m = j.data as Muatan;
      setData(m);
      setDariSimpanan(false);
      if (adaIndexedDb() && bolehSimpan) {
        try { await simpanKv('approval', m); } catch { /* penuh atau diblokir */ }
      }
    } catch (e) {
      setGalat((e as Error).message);
    }
  }, [tab, semua, bolehSimpan]);

  useEffect(() => { void muat(); }, [muat]);

  if (!data && galat) {
    return (
      <div className="container">
        <div className="page-header"><h1 className="page-title">✅ WO Approval</h1></div>
        <div className="kabar kabar-salah">
          Tidak bisa memuat antrean approval: {galat}
          {!bolehSimpan && (
            <>
              <br />
              Hanya tab <b>WO Approval</b> yang disimpan untuk dibuka tanpa
              sinyal — tab lain adalah bacaan riwayat.
            </>
          )}
        </div>
      </div>
    );
  }
  if (!data) return <div className="kosong">Memuat…</div>;

  const adaSisa = data.tab !== 'transfer' && !data.semua && data.total > data.kartu.length;
  const judulTab = TAB.find((t) => t.kunci === data.tab)!;

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">✅ WO Approval</h1>
        <p className="page-subtitle">
          Review dan approve work orders yang sudah dikerjakan mekanik
        </p>
      </div>

      {dariSimpanan && (
        <div className="kabar kabar-awas">
          📴 Ditampilkan dari simpanan di HP ini — mungkin sudah ada yang
          ditangani rekan Anda. Keputusan Anda tetap masuk antrean dengan aman;
          yang sudah diputuskan orang lain akan ditolak server dengan alasannya.
        </div>
      )}

      {/* `.sub-nav-tab`, bukan `.filter-tab` — di KMB V2 pil ini bernama
          `sub-nav-tab` (`Approval.html:147`), sementara `.filter-tab` adalah
          tab bergaris bawah milik layar mekanik. Dua bentuk yang berbeda. */}
      <div className="sub-nav">
        {TAB.map((t) => (
          <a
            key={t.kunci}
            href={`/approval?tab=${t.kunci}`}
            className={`sub-nav-tab${t.kunci === data.tab ? ' active' : ''}`}
          >
            {t.ikon} {t.label}
            <span className="count">{data.hitung[t.kunci] ?? 0}</span>
          </a>
        ))}
      </div>

      <div className="section-title">
        {judulTab.ikon}{' '}
        {data.tab === 'menunggu' ? 'Pending Approvals' : judulTab.label}
        <span className="badge badge-grey">{data.total}</span>
      </div>

      {/* Jujur soal apa yang BELUM ditampilkan. Layar yang memuat 25 dari 369
          tanpa mengatakannya membuat orang mengira antreannya sudah habis. */}
      {adaSisa && (
        <div className="kabar kabar-awas">
          Menampilkan <b>{data.kartu.length}</b> dari <b>{data.total}</b> WO.
          Sisanya naik dengan sendirinya begitu yang di atas selesai.{' '}
          <a href={`/approval?tab=${data.tab}&semua=1`}>
            <b>Tampilkan semua {data.total}</b>
          </a>{' '}
          — memuatnya butuh waktu lebih lama.
        </div>
      )}

      {data.tab === 'transfer' ? (
        data.transfer.length === 0 ? (
          <div className="kosong">
            ✅ Tidak ada permintaan transfer yang menunggu keputusan.
          </div>
        ) : (
          <div className="wo-grid">
            {data.transfer.map((t) => (
              <KartuTransferTampil key={t.transferId} kartu={t} mekanik={data.penerima} />
            ))}
          </div>
        )
      ) : data.kartu.length === 0 ? (
        <div className="kosong">
          {data.tab === 'menunggu'
            ? 'Antrean bersih — tidak ada yang menunggu.' : 'Tidak ada data.'}
        </div>
      ) : (
        <div className="wo-grid">
          {data.kartu.map((w) => (
            <KartuApprovalTampil
              key={w.id}
              wo={w}
              peran={data.peran}
              bisaAksi={data.tab === 'menunggu'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
