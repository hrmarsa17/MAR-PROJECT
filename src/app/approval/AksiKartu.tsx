'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalOverride } from './ModalOverride.js';

/**
 * Lima tombol, urutan sama persis dengan KMB V2:
 *   ✏️ Edit · 🗑 Batal · ✓ Approve · ↩ Kembalikan · ✗ Reject
 *
 * Posisinya tidak digeser walau warnanya berubah. Approver menekan tombol ini
 * puluhan kali sehari tanpa membacanya lagi.
 */

type Aksi = 'approve' | 'kembalikan' | 'reject' | 'batal';

const BUTUH_ALASAN: Record<Aksi, boolean> = {
  approve: false, kembalikan: true, reject: true, batal: true,
};

const JUDUL: Record<Aksi, string> = {
  approve: 'Setujui',
  kembalikan: 'Kembalikan ke mekanik',
  reject: 'Tolak WO',
  batal: 'Batalkan WO',
};

export function AksiKartu({
  woId, nomor, peran,
}: {
  woId: number;
  nomor: string;
  peran: 'supervisor' | 'superintendent';
}) {
  const router = useRouter();
  const [minta, setMinta] = useState<Aksi | null>(null);
  const [alasan, setAlasan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [bukaOverride, setBukaOverride] = useState(false);
  const [hasil, setHasil] = useState<{ baik: boolean; teks: string } | null>(null);

  async function kirim(aksi: Aksi) {
    setSibuk(true);
    setHasil(null);

    // op_id lahir sekali. Kalau jawabannya hilang di jalan dan tombol ditekan
    // lagi, server mengenali permintaan yang sama — tidak menyetujui dua kali.
    const opId = crypto.randomUUID();
    const nama =
      aksi === 'approve'
        ? peran === 'superintendent' ? 'approve_l2' : 'approve_l1'
        : aksi === 'batal' ? 'batal_wo' : aksi;

    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: nama,
          op_id: opId,
          data: BUTUH_ALASAN[aksi] ? { woId, alasan: alasan.trim() } : { woId },
        }),
      });
      const j = await r.json();

      if (j.ok) {
        const poin = j.data?.hasil?.finalPoints;
        setHasil({
          baik: true,
          teks:
            aksi === 'approve' && poin !== undefined
              ? `${nomor} disetujui — ${Number(poin).toFixed(2)} poin untuk ${j.data.hasil.dibayar.length} mekanik`
              : `${nomor}: ${JUDUL[aksi].toLowerCase()} berhasil`,
        });
        setMinta(null);
        router.refresh();
        return;
      }

      setHasil({ baik: false, teks: j.pesan ?? 'Gagal' });
      if (j.kode === 'KONFLIK_KEADAAN') router.refresh();
    } catch {
      setHasil({
        baik: false,
        teks: 'Sambungan terputus. Keputusan Anda belum tentu gagal — muat ulang dulu sebelum menekan lagi.',
      });
    } finally {
      setSibuk(false);
    }
  }

  if (hasil?.baik) return <div className="kabar kabar-benar">{hasil.teks}</div>;

  return (
    <>
      <div className="wo-aksi">
        <button
          className="btn-edit btn-ikon btn-sm"
          title="Edit Override"
          disabled={sibuk}
          onClick={() => setBukaOverride(true)}
        >✏️</button>
        <button
          className="btn-secondary btn-ikon btn-sm"
          title="Batalkan WO"
          disabled={peran !== 'superintendent' || sibuk}
          onClick={() => { setAlasan(''); setMinta('batal'); }}
        >🗑</button>
        <button className="btn-approve btn-sm" disabled={sibuk} onClick={() => kirim('approve')}>
          ✓ Approve
        </button>
        <button
          className="btn-kembalikan btn-sm"
          disabled={sibuk}
          onClick={() => { setAlasan(''); setMinta('kembalikan'); }}
        >↩ Kembalikan</button>
        <button
          className="btn-reject btn-sm"
          disabled={sibuk}
          onClick={() => { setAlasan(''); setMinta('reject'); }}
        >✗ Reject</button>
      </div>

      {hasil && !hasil.baik && <div className="kabar kabar-salah">{hasil.teks}</div>}

      {minta && (
        <div className="modal-tirai" onClick={() => !sibuk && setMinta(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{JUDUL[minta]} — {nomor}</h3>
              <button className="btn-ikon btn-sm" onClick={() => setMinta(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor={`alasan-${woId}`}>
                  Alasan <span className="wajib">*</span>
                </label>
                <textarea
                  id={`alasan-${woId}`}
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  placeholder={
                    minta === 'kembalikan'
                      ? 'contoh: jam mulai belum diisi, tolong lengkapi'
                      : 'contoh: WO kembar dengan WO-20260912-505'
                  }
                  autoFocus
                />
                <p className="form-hint">
                  {/* Di KMB V2 kotak Catatan approval dihapus karena isinya tak
                      pernah tampil di layar mana pun. Alasan di sini disimpan
                      dan terbaca oleh mekaniknya. */}
                  Minimal 5 huruf. Alasan ini dibaca mekanik yang bersangkutan.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setMinta(null)} disabled={sibuk}>
                Batal
              </button>
              <button
                className={minta === 'reject' ? 'btn-reject' : 'btn-primary'}
                disabled={sibuk || alasan.trim().length < 5}
                onClick={() => kirim(minta)}
              >
                {sibuk ? 'Mengirim…' : JUDUL[minta]}
              </button>
            </div>
          </div>
        </div>
      )}

      {bukaOverride && (
        <ModalOverride
          woId={woId}
          onTutup={() => setBukaOverride(false)}
          onSimpan={() => {
            setBukaOverride(false);
            setHasil({ baik: true, teks: `Koreksi ${nomor} tersimpan.` });
            // Kartu harus digambar ulang: angka yang baru dikoreksi ikut
            // menentukan perkiraan poin yang tampil di kartu itu sendiri.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
