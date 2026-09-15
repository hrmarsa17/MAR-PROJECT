'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Keadaan =
  | { jenis: 'diam' }
  | { jenis: 'kirim' }
  | { jenis: 'berhasil'; pesan: string }
  | { jenis: 'bentrok'; pesan: string }
  | { jenis: 'salah'; pesan: string };

export function AksiApproval({
  woId,
  nomor,
  peran,
}: {
  woId: number;
  nomor: string;
  peran: 'supervisor' | 'superintendent';
}) {
  const router = useRouter();
  const [k, setK] = useState<Keadaan>({ jenis: 'diam' });
  const [redo, setRedo] = useState<'first_time' | 'redo'>('first_time');

  async function kirim(aksi: 'approve_l1' | 'approve_l2') {
    setK({ jenis: 'kirim' });

    // op_id lahir SEKALI di sini. Kalau permintaan ini gagal di tengah jalan
    // dan dikirim ulang dengan op_id yang sama, server mengembalikan struk
    // lama — tidak menyetujui untuk kedua kalinya.
    const opId = crypto.randomUUID();

    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi, op_id: opId, data: { woId, mtbfRedoStatus: redo } }),
      });
      const j = await r.json();

      if (j.ok) {
        const poin = j.data?.hasil?.finalPoints;
        setK({
          jenis: 'berhasil',
          pesan:
            aksi === 'approve_l2' && poin !== undefined
              ? `${nomor} disetujui — ${Number(poin).toFixed(2)} poin terbit untuk ${j.data.hasil.dibayar.length} mekanik`
              : `${nomor} diteruskan ke L2`,
        });
        router.refresh();
        return;
      }

      // Konflik bukan kegagalan teknis: orang lain sudah memutuskan lebih dulu.
      // Approver kedua berhak tahu itu dengan kalimat biasa.
      setK({
        jenis: j.kode === 'KONFLIK_KEADAAN' ? 'bentrok' : 'salah',
        pesan: j.pesan ?? 'Gagal',
      });
      if (j.kode === 'KONFLIK_KEADAAN') router.refresh();
    } catch {
      setK({
        jenis: 'salah',
        pesan: 'Sambungan terputus. Keputusan Anda BELUM tentu gagal — muat ulang untuk memastikan sebelum menekan lagi.',
      });
    }
  }

  if (k.jenis === 'berhasil') return <div className="kabar benar">{k.pesan}</div>;

  return (
    <>
      {peran === 'superintendent' && (
        <div className="aksi" style={{ marginTop: 10 }}>
          <label style={{ margin: 0, alignSelf: 'center', fontWeight: 500 }}>
            Jenis pekerjaan:
          </label>
          <select
            value={redo}
            onChange={(e) => setRedo(e.target.value as 'first_time' | 'redo')}
            style={{ width: 'auto', minWidth: 160 }}
          >
            <option value="first_time">Perbaikan pertama</option>
            <option value="redo">Kerja ulang</option>
          </select>
        </div>
      )}

      <div className="aksi">
        <button
          className="utama"
          disabled={k.jenis === 'kirim'}
          onClick={() => kirim(peran === 'superintendent' ? 'approve_l2' : 'approve_l1')}
        >
          {k.jenis === 'kirim'
            ? 'Mengirim…'
            : peran === 'superintendent'
              ? 'Setujui & terbitkan poin'
              : 'Setujui, teruskan ke L2'}
        </button>
      </div>

      {k.jenis === 'bentrok' && <div className="kabar bentrok">{k.pesan}</div>}
      {k.jenis === 'salah' && <div className="kabar salah">{k.pesan}</div>}
    </>
  );
}
