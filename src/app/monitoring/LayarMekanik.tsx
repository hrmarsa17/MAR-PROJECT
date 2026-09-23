'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DaftarWoMekanik } from './DaftarWoMekanik.js';
import { adaIndexedDb, bacaKv, simpanKv } from '../../pwa/simpanan.js';
import type { KartuWoMekanik } from '../../domain/kueriWoMekanik.js';
import type { BekalForm, DetailWo } from '../../domain/kueriDetailForm.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DAFTAR WO MEKANIK — diambil di KLIEN, supaya bisa dibuka tanpa sinyal
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sampai 16 Sep 2026 layar ini dirender di server: ia menanyai basis data saat
 * halaman disusun. Itu berjalan baik selama ada sinyal, dan sama sekali tidak
 * bisa dibuka tanpa sinyal — padahal inilah layar tempat mekanik melapor dari
 * pit. Mengirim jam kerja bisa diantrekan; membuka layarnya tidak, kalau
 * layarnya sendiri menuntut server.
 *
 * ── APA YANG DISIMPAN, DAN APA YANG SENGAJA TIDAK ───────────────────────────
 * Tab `assigned` dan `pending_approval` disimpan; `done` TIDAK.
 *
 * Alasannya bukan selera: kueri `woMekanik` tidak punya LIMIT, jadi tab `done`
 * tumbuh selamanya. Sesudah setahun ia bisa berisi ratusan WO, dan menyalin
 * seluruhnya ke IndexedDB tiap kali layar dibuka adalah beban yang tidak pernah
 * berhenti bertambah di HP orang. Yang dibutuhkan mekanik di lapangan juga
 * bukan itu — ia butuh tahu apa yang HARUS DIKERJAKAN, bukan riwayat.
 */

interface Muatan {
  sebagai: number;
  sendiri: boolean;
  orang: { nama: string } | null;
  tab: string;
  hitung: Record<string, number>;
  daftar: KartuWoMekanik[];
  bekal: BekalForm[];
  detail: Record<string, DetailWo>;
}

const TAB: { kunci: string; label: string }[] = [
  { kunci: 'assigned', label: 'Assigned' },
  { kunci: 'pending_approval', label: 'Pending' },
  { kunci: 'done', label: 'Done' },
];

/** Tab yang boleh menetap di HP. Lihat catatan di atas. */
const DISIMPAN = new Set(['assigned', 'pending_approval']);

type Simpanan = Record<string, Muatan>;

export function LayarMekanik({ as, tab, dasar = '' }: {
  as: number | null;
  tab: string;
  /** Awalan rute. '' untuk pintu utama, '/lapangan' untuk pintu lapangan. */
  dasar?: string;
}) {
  const [data, setData] = useState<Muatan | null>(null);
  const [dariSimpanan, setDariSimpanan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kunci = `${as ?? 'saya'}:${tab}`;

  const muat = useCallback(async () => {
    setGalat(null);

    /* SIMPANAN DULU, baru jaringan — dan ini bukan demi kecepatan.
       Di sinyal lapangan yang tipis, `fetch` bisa menggantung belasan detik
       sebelum menyerah. Menampilkan yang tersimpan lebih dulu berarti mekanik
       melihat daftar WO-nya seketika, lalu daftar itu diperbarui diam-diam
       kalau jaringannya ternyata sampai. */
    if (adaIndexedDb()) {
      try {
        const simpan = (await bacaKv<Simpanan>('monitoring')) ?? {};
        if (simpan[kunci]) { setData(simpan[kunci]!); setDariSimpanan(true); }
      } catch { /* penyimpanan diblokir — lanjut ke jaringan saja */ }
    }

    try {
      const alamat = `/api/data?jenis=monitoring&tab=${encodeURIComponent(tab)}`
        + (as !== null ? `&as=${as}` : '');
      const r = await fetch(alamat);
      const j = await r.json();
      if (!j.ok) throw new Error(j.pesan ?? 'Gagal memuat');

      const m = j.data as Muatan;
      setData(m);
      setDariSimpanan(false);

      if (adaIndexedDb() && DISIMPAN.has(tab)) {
        try {
          const simpan = (await bacaKv<Simpanan>('monitoring')) ?? {};
          await simpanKv('monitoring', { ...simpan, [kunci]: m });
        } catch { /* penuh atau diblokir — layar tetap benar, cuma tidak luring */ }
      }
    } catch (e) {
      /* Kalau simpanannya ada, layarnya SUDAH terisi dan galat jaringan cuma
         jadi catatan kaki. Yang tidak boleh terjadi: layar kosong tanpa
         keterangan, yang terbaca seperti "Anda tidak punya WO". */
      setGalat((e as Error).message);
    }
  }, [as, tab, kunci]);

  useEffect(() => { void muat(); }, [muat]);

  if (!data && galat) {
    return (
      <div className="container">
        <div className="page-header"><h1 className="page-title">Monitoring</h1></div>
        <div className="kabar kabar-salah">
          Tidak bisa memuat daftar WO: {galat}
          {tab === 'done' && (
            <>
              <br />
              Tab <b>Done</b> memang tidak disimpan untuk dibuka tanpa sinyal —
              buka tab <b>Assigned</b>.
            </>
          )}
        </div>
      </div>
    );
  }
  if (!data) return <div className="kosong">Memuat…</div>;

  /* Tautan HARUS membawa awalannya. Tanpa ini, menekan tab dari dalam aplikasi
     lapangan yang terpasang akan keluar dari `scope` manifest-nya — dan
     peramban membuka halaman berikutnya di tab browser biasa, lengkap dengan
     bilah alamat. Terbaca seperti aplikasinya "keluar sendiri". */
  const tautan = (t: string) =>
    data.sendiri ? `${dasar}/monitoring?tab=${t}` : `${dasar}/monitoring?as=${data.sebagai}&tab=${t}`;

  return (
    <div className="container layar-mekanik">
      {!data.sendiri && (
        <div className="impersonate-banner">
          <div className="impersonate-info">
            <div className="impersonate-icon">👤</div>
            <div className="impersonate-text">
              <h3>Viewing As</h3>
              <p>{data.orang?.nama}</p>
            </div>
          </div>
          <Link href={`${dasar}/monitoring`} className="btn-back-to-self">
            ← Kembali ke Monitoring
          </Link>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Monitoring</h1>
        <p className="page-subtitle">
          {data.sendiri ? 'Track and submit your assigned work' : 'Kelola work order mekanik ini'}
        </p>
      </div>

      {/* Daftar yang sedang dilihat berasal dari HP, bukan server. Disebutkan,
          karena mekanik yang baru saja melapor lewat orang lain perlu tahu
          kenapa WO itu belum hilang dari daftarnya. */}
      {dariSimpanan && (
        <div className="kabar kabar-awas">
          📴 Ditampilkan dari simpanan di HP ini — mungkin belum yang terbaru.
          Daftar diperbarui sendiri begitu ada sinyal.
        </div>
      )}

      {/* Tab mengganti RUTE, bukan menyaring di klien — sama dengan sumber
          (`changeFilter`, MechanicDashboard.html:977-981). Itulah sebabnya
          `grup_total` harus datang dari server: layar hanya memegang baris yang
          lolos tab ini. */}
      <div className="filter-tabs">
        {TAB.map((t) => (
          <Link
            key={t.kunci}
            href={tautan(t.kunci)}
            className={`filter-tab${t.kunci === data.tab ? ' active' : ''}`}
          >
            {t.label}
            <span className="count">{data.hitung?.[t.kunci] ?? 0}</span>
          </Link>
        ))}
      </div>

      <DaftarWoMekanik daftar={data.daftar} bekal={data.bekal} detail={data.detail} />
    </div>
  );
}
