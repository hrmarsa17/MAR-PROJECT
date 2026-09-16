'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { durasiJam, tanggalJam } from '../../lib/format.js';
import type { KartuTransfer } from '../../domain/kueriTransfer.js';

/**
 * KARTU KEPUTUSAN TRANSFER — port dari `Approval.html:469-539`.
 *
 * Bentuknya ditentukan satu kalimat: keputusan ini MENAMBAH jam kerja yang
 * dibayar, atau MENGHANGUSKANNYA. Karena itu kotak "Dampak Jam Kerja" berdiri
 * di atas tombol, bukan di bawahnya, dan menyebut ketiga angkanya sekaligus —
 * sesi, yang tercatat sekarang, dan yang akan tercatat. Approver tidak boleh
 * perlu menghitung sendiri untuk tahu apa yang ia setujui.
 */

export function KartuTransferTampil({
  kartu, mekanik,
}: {
  kartu: KartuTransfer;
  mekanik: { id: number; nama: string; kode: string }[];
}) {
  const router = useRouter();
  const [pilih, setPilih] = useState<number[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [mintaAlasan, setMintaAlasan] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [hasil, setHasil] = useState<{ baik: boolean; teks: string } | null>(null);

  // Satu identitas per aksi, lahir sekali. Lihat catatan di ModalKerja.
  const [opId] = useState(() => ({
    setuju: crypto.randomUUID(), tolak: crypto.randomUUID(),
  }));

  // Yang sudah di tim tidak boleh ditawarkan: server menolaknya, dan menawarkan
  // pilihan yang pasti ditolak cuma memindahkan kesalahan ke tangan approver.
  const sudahDiTim = new Set(kartu.tim.map((t) => t.mechanicId));
  const calon = mekanik.filter((m) => !sudahDiTim.has(m.id));

  async function putuskan(aksi: 'setujui_transfer' | 'tolak_transfer') {
    setSibuk(true);
    setHasil(null);
    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi,
          op_id: aksi === 'setujui_transfer' ? opId.setuju : opId.tolak,
          data: aksi === 'setujui_transfer'
            ? { woId: kartu.woId, penerima: pilih }
            : { woId: kartu.woId, alasan: alasan.trim() },
        }),
      });
      const j = await r.json();
      if (j.ok) {
        const h = j.data?.hasil;
        setMintaAlasan(false);
        setHasil({
          baik: true,
          teks: h?.sudahDiputuskan
            ? `${kartu.woNumber}: transfer ini sudah diputuskan sebelumnya.`
            : aksi === 'setujui_transfer'
              ? `Transfer ${kartu.woNumber} disetujui. Jam tercatat sekarang `
                + `${durasiJam(h?.partialHoursSesudah)}. WO kembali dikerjakan.`
              : `Transfer ${kartu.woNumber} ditolak — sesi ${durasiJam(h?.sessionHours)} `
                + 'hangus, WO kembali ke tim semula.',
        });
        router.refresh();
        return;
      }
      setHasil({ baik: false, teks: j.pesan ?? 'Gagal' });
      if (j.kode === 'KONFLIK_KEADAAN') router.refresh();
    } catch {
      setHasil({
        baik: false,
        teks: '⚠️ Sambungan terputus sebelum jawaban server sampai. Keputusan Anda '
          + 'MUNGKIN sudah tersimpan. JANGAN diulangi buta — muat ulang dulu dan '
          + 'lihat keadaan sebenarnya.',
      });
    } finally {
      setSibuk(false);
    }
  }

  if (hasil?.baik) {
    return (
      <article className="wo-card">
        <div className="kabar kabar-benar">{hasil.teks}</div>
      </article>
    );
  }

  return (
    <article className="wo-card">
      <div className="wo-card-head">
        <div className="wo-nomor">{kartu.woNumber}</div>
        <span className="badge badge-warning">Menunggu Keputusan</span>
      </div>

      <p className="tr-peminta">
        Diminta oleh <b>{kartu.dimintaOleh}</b>
        {kartu.section && <> · section <b>{kartu.section}</b></>}
        {' · '}{tanggalJam(kartu.dimintaAt)}
      </p>
      {kartu.keterangan && (
        <p className="tr-peminta">Keterangan WO: {kartu.keterangan}</p>
      )}
      {kartu.catatan && (
        <div className="tr-catatan">
          <b>Catatan mekanik:</b> {kartu.catatan}
        </div>
      )}

      {/* KONSEKUENSI JAM, DI ATAS TOMBOL — bukan di bawahnya. */}
      <div className="tr-dampak">
        <div className="tr-dampak-judul">DAMPAK JAM KERJA</div>
        <div className="tr-dampak-isi">
          Sesi mekanik ini <b>{durasiJam(kartu.sessionHours)}</b> · jam tercatat sekarang{' '}
          <b>{durasiJam(kartu.partialSekarang)}</b> →{' '}
          <b className="tr-sesudah">{durasiJam(kartu.partialSesudah)}</b> bila disetujui
        </div>
        <div className="tr-dampak-kaki">
          Bila ditolak, sesi {durasiJam(kartu.sessionHours)} tersebut hangus.
        </div>
      </div>

      <p className="tr-tim">
        Tim sekarang: {kartu.tim.map((t) => t.nama).join(', ') || '—'}
      </p>

      <div className="form-group">
        <label className="form-label tr-label">
          Mekanik penerima <span className="wajib">*</span>
        </label>
        {calon.length === 0 ? (
          <div className="kabar kabar-awas">
            Semua mekanik aktif sudah ada di tim WO ini — tidak ada yang bisa
            ditunjuk sebagai penerima.
          </div>
        ) : (
          /* Kotak centang, bukan `select multiple`. Sumbernya memakai
             `select multiple size=4` dengan petunjuk "Ctrl / Cmd + klik"
             (`Approval.html:521-526`) — cara memilih yang tidak ada di layar
             sentuh sama sekali, dan yang setiap tahun menghasilkan pilihan
             tak sengaja terhapus saat orang mengklik nama kedua. */
          <div className="tr-penerima">
            {calon.map((m) => (
              <label key={m.id} className="tr-penerima-baris">
                <input
                  type="checkbox"
                  checked={pilih.includes(m.id)}
                  disabled={sibuk}
                  onChange={(e) => setPilih((p) =>
                    e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id))}
                />
                <span>{m.nama}</span>
                <span className="tr-penerima-kode">{m.kode}</span>
              </label>
            ))}
          </div>
        )}
        <p className="form-hint">
          Boleh lebih dari satu. <b>Semua penerima mendapat poin penuh</b>, sama
          seperti tim yang sudah ada.
        </p>
      </div>

      {hasil && !hasil.baik && <div className="kabar kabar-salah">{hasil.teks}</div>}

      <div className="wo-aksi">
        <button
          className="btn-approve"
          disabled={sibuk || pilih.length === 0}
          onClick={() => void putuskan('setujui_transfer')}
        >
          {sibuk ? 'Memproses…' : 'Setujui Transfer'}
        </button>
        <button
          className="btn-reject"
          disabled={sibuk}
          onClick={() => { setAlasan(''); setMintaAlasan(true); }}
        >
          Tolak
        </button>
      </div>

      {mintaAlasan && (
        <Portal>
          <div className="modal-tirai">
            <div className="modal" style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <h3>Tolak transfer — {kartu.woNumber}</h3>
                <button className="modal-tutup" onClick={() => setMintaAlasan(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="kabar kabar-awas">
                  Sesi <b>{durasiJam(kartu.sessionHours)}</b> milik{' '}
                  <b>{kartu.dimintaOleh}</b> akan <b>hangus</b> dan tidak dibayar.
                  WO kembali ke tim semula.
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`alasan-tr-${kartu.woId}`}>
                    Alasan <span className="wajib">*</span>
                  </label>
                  <textarea
                    id={`alasan-tr-${kartu.woId}`}
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    placeholder="contoh: shift berikutnya kosong, kerjakan sampai selesai"
                    autoFocus
                  />
                  <p className="form-hint">
                    Minimal 5 huruf. Alasan ini dibaca mekanik yang mengajukan.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setMintaAlasan(false)} disabled={sibuk}>
                  Batal
                </button>
                <button
                  className="btn-reject"
                  disabled={sibuk || alasan.trim().length < 5}
                  onClick={() => void putuskan('tolak_transfer')}
                >
                  {sibuk ? 'Memproses…' : 'Tolak Transfer'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </article>
  );
}
