'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { kirimPerintah } from '../../pwa/kirim.js';
import { ModalOverride } from './ModalOverride.js';
import { Portal } from '../Portal.js';

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
  woId, nomor, peran, terlihat,
}: {
  woId: number;
  nomor: string;
  peran: 'supervisor' | 'superintendent';
  /** Angka yang sedang tampil di kartu saat tombol ditekan. */
  terlihat?: Record<string, number | null>;
}) {
  const router = useRouter();
  const [minta, setMinta] = useState<Aksi | null>(null);
  const [alasan, setAlasan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [bukaOverride, setBukaOverride] = useState(false);
  const [hasil, setHasil] = useState<{ baik: boolean; teks: string } | null>(null);
  /* Pesan yang TIDAK mengakhiri hidup kartu ini — koreksi override, misalnya.
     Dipisah dari `hasil` karena keduanya berbeda arti: `hasil.baik` berarti WO
     ini sudah selesai diputuskan dan kartunya akan pergi dari tab ini;
     `kabarSingkat` cuma memberi tahu sesuatu tersimpan, dan tombolnya harus
     TETAP ADA karena WO-nya masih menunggu keputusan. */
  const [kabarSingkat, setKabarSingkat] = useState<string | null>(null);

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
      const k = await kirimPerintah(
        nama,
        BUTUH_ALASAN[aksi] ? { woId, alasan: alasan.trim() } : { woId },
        {
          opId,
          ringkas: nomor,
          /* Hanya untuk PERSETUJUAN, dan hanya karena persetujuan membekukan
             uang. Pembatalan dan penolakan tidak menghasilkan angka, jadi tidak
             ada yang bisa berbeda dan tidak ada yang perlu dibandingkan. */
          ...(aksi === 'approve' && terlihat ? { pratinjau: terlihat } : {}),
        },
      );

      /* Persetujuan yang masuk antrean BELUM membekukan uang — pembekuan
         terjadi di server saat ia akhirnya terkirim. Kalimatnya menyebut itu
         apa adanya, bukan "disetujui", supaya approver tidak mengira angkanya
         sudah final. Kalau ternyata berbeda, layar Antrean menyebutkannya. */
      if (k.keadaan === 'antre') {
        setHasil({
          baik: true,
          teks: `📮 Tersimpan! Keputusan untuk ${nomor} akan terkirim saat ada sinyal. `
            + 'Poinnya dihitung server saat itu — lihat menu Antrean.',
        });
        setMinta(null);
        return;
      }

      if (k.keadaan === 'berhasil') {
        const isi = (k.hasil?.hasil ?? {}) as {
          finalPoints?: number; dibayar?: unknown[];
        };
        setHasil({
          baik: true,
          teks:
            aksi === 'approve' && isi.finalPoints !== undefined
              ? `${nomor} disetujui — ${Number(isi.finalPoints).toFixed(2)} poin untuk `
                + `${isi.dibayar?.length ?? 0} mekanik. Kartunya pindah ke tab WO Approved.`
              : `${nomor}: ${JUDUL[aksi].toLowerCase()} berhasil`,
        });
        setMinta(null);
        router.refresh();
        return;
      }

      setHasil({ baik: false, teks: k.pesan ?? 'Gagal' });
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  /* Kartu yang keputusannya sudah diambil digantikan pesannya: ia akan hilang
     dari tab ini begitu halaman disegarkan, dan menawarkan tombol untuk WO yang
     sudah disetujui cuma mengundang klik yang akan ditolak. */
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
      {kabarSingkat && <div className="kabar kabar-benar">{kabarSingkat}</div>}

      {minta && (
        <Portal>
        {/* Tirai tidak menutup saat diklik — kotaknya berisi alasan yang baru
            diketik, dan alasan itu wajib minimal lima huruf. Menghilangkannya
            karena kursor meleset berarti mengetik ulang. Sama dengan KMB V2,
            yang tak memberi onclick pada tirai modal mana pun. */}
        <div className="modal-tirai">
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
        </Portal>
      )}

      {bukaOverride && (
        <ModalOverride
          woId={woId}
          onTutup={() => setBukaOverride(false)}
          onSimpan={() => {
            setBukaOverride(false);
            /* BUKAN `setHasil` — override tidak mengakhiri apa pun. WO-nya masih
               menunggu persetujuan, dan tombol Approve HARUS tetap ada.
               Sampai 15 Sep 2026 baris ini memakai setHasil({baik:true}), dan
               akibatnya kelima tombol lenyap begitu koreksi disimpan: approver
               menyimpan koreksinya lalu tak punya cara menyetujui WO-nya
               sendiri tanpa memuat ulang halaman. */
            setKabarSingkat(`Koreksi ${nomor} tersimpan — WO masih menunggu persetujuan.`);
            // Kartu digambar ulang: angka yang baru dikoreksi ikut menentukan
            // perkiraan poin yang tampil di kartu itu sendiri.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
