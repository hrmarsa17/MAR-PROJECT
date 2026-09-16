'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type ItemOutbox, adaIndexedDb, hapusItem, semuaItem,
} from '../../pwa/simpanan.js';
import { bedaPratinjau } from '../../pwa/bandingPratinjau.js';
import { useDaring } from '../../pwa/useDaring.js';

/**
 * Apa yang belum sampai ke server, dan apa yang ditolaknya.
 *
 * Layar ini ada supaya "sudah terkirim atau belum" tidak pernah jadi urusan
 * ingatan. Di KMB V2 pertanyaan itu dijawab dengan menelepon kantor.
 */

const JUDUL: Record<string, string> = {
  buat_wo: 'Buat WO',
  kirim_kerja: 'Kirim jam kerja',
  approve_l1: 'Setujui L1',
  approve_l2: 'Setujui L2',
  reject: 'Tolak WO',
  kembalikan: 'Kembalikan ke mekanik',
  batal_wo: 'Batalkan WO',
  simpan_detail: 'Simpan detail ban',
  koreksi_meter: 'Koreksi meter',
  minta_transfer: 'Minta transfer',
  setujui_transfer: 'Setujui transfer',
  tolak_transfer: 'Tolak transfer',
  save_override: 'Simpan override',
};

function usia(iso: string): string {
  const menit = (Date.now() - Date.parse(iso)) / 60_000;
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${Math.floor(menit)} menit lalu`;
  if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`;
  return `${Math.floor(menit / 1440)} hari lalu`;
}

export function LayarAntrean() {
  const { daring, dorong, sibuk } = useDaring();
  const [item, setItem] = useState<ItemOutbox[] | null>(null);

  const muat = useCallback(async () => {
    if (!adaIndexedDb()) { setItem([]); return; }
    try { setItem(await semuaItem()); } catch { setItem([]); }
  }, []);

  useEffect(() => { void muat(); }, [muat]);

  if (item === null) return <div className="kosong">Memuat…</div>;

  const antre = item.filter((i) => i.status === 'antre');
  const gagal = item.filter((i) => i.status === 'gagal');
  const terkirim = item.filter((i) => i.status === 'terkirim');

  return (
    <div className="container">
      <div className="page-header">
        <h1>Antrean kiriman</h1>
        <p className="form-hint">
          Pekerjaan yang sudah Anda kirim tapi belum sampai ke server. Semuanya
          terkirim sendiri begitu ada sinyal — <strong>tidak perlu dikirim ulang</strong>.
        </p>
      </div>

      {antre.length > 0 && daring && (
        <button type="button" className="btn-secondary" disabled={sibuk}
                onClick={() => { void dorong().then(muat); }}>
          {sibuk ? 'Mengirim…' : `Kirim ${antre.length} sekarang`}
        </button>
      )}

      <Bagian
        judul={`Menunggu terkirim (${antre.length})`}
        kosong="Tidak ada yang menunggu. Semua sudah sampai."
        daftar={antre}
        muat={muat}
      />

      {gagal.length > 0 && (
        <Bagian
          judul={`Ditolak server (${gagal.length})`}
          catatan={
            'Ini TIDAK akan dicoba lagi — mengulanginya hanya akan ditolak '
            + 'dengan alasan yang sama. Perbaiki lalu kirim ulang dari layarnya, '
            + 'atau hapus baris ini sesudah dibaca.'
          }
          kosong=""
          daftar={gagal}
          muat={muat}
        />
      )}

      {terkirim.length > 0 && (
        <Bagian
          judul={`Sudah terkirim (${terkirim.length})`}
          kosong=""
          daftar={terkirim.slice(0, 20)}
          muat={muat}
        />
      )}
    </div>
  );
}

function Bagian({ judul, catatan, kosong, daftar, muat }: {
  judul: string; catatan?: string; kosong: string;
  daftar: ItemOutbox[]; muat: () => Promise<void>;
}) {
  return (
    <section style={{ marginTop: 'var(--spacing-lg)' }}>
      <h2 style={{ fontSize: '0.95rem' }}>{judul}</h2>
      {catatan && <p className="form-hint">{catatan}</p>}
      {daftar.length === 0 && kosong && <p className="kosong">{kosong}</p>}
      {daftar.map((it) => <Baris key={it.op_id} it={it} muat={muat} />)}
    </section>
  );
}

function Baris({ it, muat }: { it: ItemOutbox; muat: () => Promise<void> }) {
  const beda = it.status === 'terkirim' ? bedaPratinjau(it.pratinjau, it.hasil) : [];
  const kelas = it.status === 'gagal' ? ' antrean-item-gagal'
    : beda.length > 0 ? ' antrean-item-beda' : '';

  return (
    <div className={`antrean-item${kelas}`}>
      <div className="antrean-baris">
        <span className="antrean-aksi">{JUDUL[it.aksi] ?? it.aksi}</span>
        {it.ringkas && <span>{it.ringkas}</span>}
        <span className="antrean-waktu">{usia(it.dibuat_at)}</span>
        {it.percobaan > 1 && (
          <span className="antrean-waktu">· {it.percobaan} percobaan</span>
        )}
      </div>

      {it.galat && <div className="antrean-galat">❌ {it.galat}</div>}

      {/* Uang yang membeku berbeda dari yang dilihat approver saat menekan.
          Disebutkan terang-terangan; yang berlaku tetap hitungan server. */}
      {beda.length > 0 && (
        <div className="antrean-beda">
          ⚠️ Hasil akhirnya berbeda dari yang Anda lihat saat menyetujui:
          <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>
            {beda.map((b) => (
              <li key={b.kunci}>
                {b.kunci}: Anda lihat <strong>{b.dilihat}</strong>, yang tersimpan{' '}
                <strong>{b.jadi}</strong>
              </li>
            ))}
          </ul>
          <span style={{ display: 'block', marginTop: 4 }}>
            Faktor atau tarifnya berubah selagi kiriman ini menunggu. Yang
            tersimpan adalah hitungan server. Periksa di Riwayat Perubahan kalau
            selisihnya tidak Anda duga.
          </span>
        </div>
      )}

      {(it.status === 'gagal' || it.status === 'terkirim') && (
        <button
          type="button" className="btn-secondary btn-sm" style={{ marginTop: 8 }}
          onClick={() => { void hapusItem(it.op_id).then(muat); }}
        >
          Hapus dari daftar
        </button>
      )}
    </div>
  );
}
