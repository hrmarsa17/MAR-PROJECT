'use client';

import { kirimPerintah } from '../../pwa/kirim.js';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { PilihWaktu24 } from '../PilihWaktu24.js';
import { tanggalJam } from '../../lib/format.js';
import type { JenisMeter, RiwayatMeter } from '../../domain/meter.js';

/**
 * KOREKSI HM / KM — port dari `Hm.html` + `Km.html`, SATU komponen.
 *
 * Kedua halaman di sumber identik strukturnya dan berbeda hanya pada kata-kata
 * meternya. Menyalinnya jadi dua berkas berarti dua tempat yang harus diingat
 * bersamaan setiap kali aturannya berubah — dan sumbernya sendiri sudah membayar
 * harga itu: tiga salinan yang lupa diganti tertinggal di jalur KM, termasuk
 * "Jam mesin tidak pernah mundur" di halaman Koreksi KM.
 */

interface Kata {
  label: string; panjang: string;
  paragraf: string; panelJudul: string; panelLabel: string;
}

const KATA: Record<JenisMeter, Kata> = {
  HM: {
    label: 'HM', panjang: 'jam mesin',
    paragraf: 'Jam mesin tidak pernah mundur, jadi angka yang mundur ditolak saat WO '
      + 'dibuat. Halaman ini untuk dua hal yang tidak tertangkap pagar itu: angka '
      + 'yang salah ketik ke atas — yang justru lolos karena lebih besar — dan '
      + 'panel jam yang benar-benar diganti.',
    panelJudul: 'Panel jam diganti', panelLabel: 'HM panel baru',
  },
  KM: {
    label: 'KM', panjang: 'kilometer',
    /* Sumbernya menulis "Jam mesin tidak pernah mundur" DI HALAMAN KM
       (`Km.html:95`) — salinan dari halaman HM yang lupa diganti. Begitu juga
       judul kartu "Panel jam diganti" (`:194`). Keduanya diperbaiki di sini;
       menyalin kekeliruan bukan bagian dari 1:1. */
    paragraf: 'Kilometer tidak pernah mundur, jadi angka yang mundur ditolak saat WO '
      + 'dibuat. Halaman ini untuk dua hal yang tidak tertangkap pagar itu: angka '
      + 'yang salah ketik ke atas — yang justru lolos karena lebih besar — dan '
      + 'panel kilometer yang benar-benar diganti.',
    panelJudul: 'Panel kilometer diganti', panelLabel: 'KM panel baru',
  },
};

export function LayarKoreksi({
  jenis, unit, unitTerpilih, riwayat,
}: {
  jenis: JenisMeter;
  unit: { id: number; kode: string; nama: string }[];
  unitTerpilih: number | null;
  riwayat: RiwayatMeter | null;
}) {
  const router = useRouter();
  const k = KATA[jenis];
  /* Unit yang dipilih IKUT saat berpindah jenis meter. Sebuah unit punya HM dan
     KM sekaligus, dan orang yang sedang memeriksa XTN01 hampir pasti ingin
     memeriksa XTN01 juga di tab sebelah — memaksanya memilih ulang dari 109
     nama adalah biaya yang tidak perlu. */
  const rute = (j: JenisMeter, unit: number | null) =>
    `/koreksi?jenis=${j}${unit ? `&unit=${unit}` : ''}`;

  const [perbaiki, setPerbaiki] = useState<
    { woId: number; woNumber: string; lama: number } | null>(null);
  const [nilaiBaru, setNilaiBaru] = useState('');
  const [alasan, setAlasan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<{ baik: boolean; teks: string } | null>(null);

  const [gpNilai, setGpNilai] = useState('');
  const [gpAt, setGpAt] = useState('');
  const [gpAlasan, setGpAlasan] = useState('');

  async function kirim(aksi: string, data: unknown, sukses: string) {
    setSibuk(true);
    setKabar(null);
    try {
      /* `h`, bukan `k` — di luar fungsi ini `k` sudah dipakai untuk KATA[jenis],
         dan menaunginya di sini membuat kata-kata meternya mendadak tak
         terjangkau bagi siapa pun yang kelak menambah baris di dalam sini. */
      const h = await kirimPerintah(aksi, data, { ringkas: sukses });

      /* Koreksi meter justru dikerjakan saat seseorang berdiri di sebelah
         unitnya membaca panel — tempat sinyal paling buruk di seluruh alur. */
      if (h.keadaan === 'antre') {
        setKabar({
          baik: true,
          teks: '📮 Tersimpan! Koreksi akan terkirim saat ada sinyal. '
            + 'Jangan dikoreksi ulang — lihat menu Antrean.',
        });
        setPerbaiki(null);
        return true;
      }

      if (h.keadaan === 'berhasil') {
        setKabar({ baik: true, teks: sukses });
        setPerbaiki(null);
        router.refresh();
        return true;
      }

      setKabar({ baik: false, teks: h.pesan ?? 'Gagal' });
      return false;
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="container-sempit layar-koreksi">
      <div className="page-header">
        <h1 className="page-title">Koreksi Meter</h1>
      </div>

      {/* Dua jenis meter, satu layar. Tabnya memakai gaya `.tabs` yang sama
          dengan Admin dan Monitoring — bukan gaya baru, supaya tak ada yang
          perlu belajar bentuk kontrol yang lain lagi. */}
      <div className="tabs">
        {(['HM', 'KM'] as const).map((j) => (
          <button
            key={j} type="button"
            className={`tab${jenis === j ? ' active' : ''}`}
            onClick={() => router.push(rute(j, unitTerpilih))}
          >
            {j === 'HM' ? '⏱ Hour Meter' : '🛞 Kilometer'}
          </button>
        ))}
      </div>

      <p className="page-subtitle koreksi-sub">{k.paragraf}</p>

      <div className="kartu">
        <label className="form-label" htmlFor="pilih-unit">No lambung</label>
        <select
          id="pilih-unit" className="form-control"
          value={unitTerpilih ?? ''}
          onChange={(e) => router.push(rute(jenis, e.target.value ? Number(e.target.value) : null))}
        >
          {/* Unit SEMU tidak ada di daftar ini — di KMB V2 yang dilewati
              bernama OTHERS dan WORKSHOP; keduanya bukan unit sungguhan dan
              tak punya meter. */}
          <option value="">— pilih no lambung —</option>
          {unit.map((u) => (
            <option key={u.id} value={u.id}>{u.nama} ({u.kode})</option>
          ))}
        </select>
      </div>

      {kabar && (
        <div className={`kabar ${kabar.baik ? 'kabar-benar' : 'kabar-salah'}`}>{kabar.teks}</div>
      )}

      {!riwayat ? null : (
        <>
          {/* ── Acuan sekarang ───────────────────────────────────────────── */}
          <div className="kartu">
            <div className="kartu-judul">Acuan sekarang</div>
            {riwayat.acuan ? (
              <div className="acuan">
                <b>{riwayat.acuan.nilai}</b> — tercatat {tanggalJam(riwayat.acuan.at)}
                {riwayat.acuan.oleh && <> oleh {riwayat.acuan.oleh}</>}
                {riwayat.acuan.woNumber && <> &middot; {riwayat.acuan.woNumber}</>}
                {riwayat.acuan.dariPanel && <> &middot; <i>dari penggantian panel</i></>}
                <br />
                <span className="acuan-kecil">
                  WO berikutnya pada unit ini harus ber-{k.label} sama atau lebih besar
                  daripada angka ini.
                </span>
              </div>
            ) : (
              <div className="acuan">
                Belum ada bacaan {k.label} untuk unit ini. Angka pertama yang masuk akan
                jadi acuannya.
              </div>
            )}
          </div>

          {/* ── Panel diganti ────────────────────────────────────────────── */}
          <div className="kartu">
            <div className="kartu-judul">{k.panelJudul}</div>
            <p className="kartu-ket">
              Sesudah dicatat, hitungan dimulai lagi dari angka baru — bacaan panel lama
              tidak lagi jadi acuan, dan jam kerja tidak dihitung menyeberangi titik ini.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="gp-nilai">{k.panelLabel}</label>
                {/* `0` DIPERBOLEHKAN — panel baru memang mulai dari nol. */}
                <input
                  id="gp-nilai" type="number" step="any" min="0" placeholder="cth: 0"
                  value={gpNilai} onChange={(e) => setGpNilai(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="gp-at">Berlaku sejak</label>
                {/* Picker 24 jam sendiri, bukan datetime-local. Tanggal ini
                    menentukan bacaan mana yang masih dihitung: salah dua belas
                    jam karena AM/PM bisa memasukkan atau membuang bacaan
                    sepanjang setengah hari. Keputusan lama, dipakai lagi. */}
                <PilihWaktu24 id="gp-at" nilai={gpAt} onUbah={setGpAt} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="gp-alasan">Alasan</label>
              <textarea
                id="gp-alasan" rows={2}
                placeholder={`cth: panel ${jenis === 'HM' ? 'jam' : 'kilometer'} rusak, diganti unit baru 1 Sep`}
                value={gpAlasan} onChange={(e) => setGpAlasan(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              disabled={sibuk || !unitTerpilih || gpNilai === '' || !gpAt || alasanKurang(gpAlasan)}
              onClick={() => void kirim('ganti_panel_meter', {
                unitId: unitTerpilih, jenis,
                nilaiBaru: Number(gpNilai),
                berlakuAt: new Date(gpAt).toISOString(),
                alasan: gpAlasan.trim(),
              }, 'Penggantian panel tercatat.').then((ok) => {
                if (ok) { setGpNilai(''); setGpAt(''); setGpAlasan(''); }
              })}
            >
              Catat penggantian
            </button>
            {riwayat.panel.length > 0 && (
              <div className="panel-riwayat">
                Sudah tercatat:{' '}
                {riwayat.panel.map((p, i) => (
                  <span key={p.at}>
                    {i > 0 && ' · '}
                    <b>{p.nilai}</b> sejak {tanggalJam(p.at)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Riwayat bacaan ───────────────────────────────────────────── */}
          <div className="kartu">
            <div className="kartu-judul">Riwayat bacaan {k.label}</div>
            {riwayat.bacaan.length === 0 ? (
              <div className="hampa">Belum ada bacaan {k.label} untuk unit ini.</div>
            ) : (
              <>
                <div className="catatan">
                  <b>Yang bertanda MELOMPAT paling perlu diperiksa.</b> Angka yang kelewat
                  besar lolos pagar justru karena ia lebih besar — lalu ia jadi acuan, dan
                  setiap bacaan sah sesudahnya ikut tertolak. Satu salah pencet bisa
                  meracuni seluruh riwayat unit ini.
                </div>
                <div className="tabel-gulir">
                  <table className="table tabel-meter">
                    <thead>
                      <tr>
                        <th>WO</th><th>Tanggal</th><th>Section</th><th>Oleh</th>
                        <th className="num">{k.label}</th><th></th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {riwayat.bacaan.map((b) => (
                        <tr key={b.woId} className={b.janggal}>
                          <td>{b.woNumber}</td>
                          <td>{tanggalJam(b.at)}</td>
                          <td>{b.section ?? '–'}</td>
                          <td>{b.oleh ?? '–'}</td>
                          <td className="num"><b>{b.nilai}</b></td>
                          <td>
                            {b.janggal && (
                              <span className={`tag tag-${b.janggal}`}>{b.janggal}</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setNilaiBaru(String(b.nilai));
                                setAlasan('');
                                setPerbaiki({ woId: b.woId, woNumber: b.woNumber, lama: b.nilai });
                              }}
                            >Perbaiki</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Modal, bukan dua `prompt()` berurutan seperti sumbernya. Kalimat
          keduanya panjang dan `prompt` memotongnya di sebagian peramban —
          padahal justru kalimat itu yang menjelaskan hal yang tidak jelas
          dengan sendirinya. Teksnya tetap; yang berubah wadahnya. */}
      {perbaiki && (
        <Portal>
          <div className="modal-tirai">
            <div className="modal" style={{ maxWidth: 460 }}>
              <div className="modal-header">
                <h3>{k.label} baru untuk {perbaiki.woNumber}</h3>
                <button className="modal-tutup" onClick={() => setPerbaiki(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="kor-nilai">
                    {k.label} baru <span className="wajib">*</span>
                  </label>
                  <input
                    id="kor-nilai" type="number" step="any" autoFocus
                    value={nilaiBaru} onChange={(e) => setNilaiBaru(e.target.value)}
                  />
                  <p className="form-hint">
                    Sekarang: <b>{perbaiki.lama}</b>. Kosongkan sama sekali kalau angka
                    yang benar tidak diketahui — <b>lebih baik hilang daripada salah</b>.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="kor-alasan">
                    Alasan koreksi <span className="wajib">*</span>
                  </label>
                  <textarea
                    id="kor-alasan" rows={3}
                    value={alasan} onChange={(e) => setAlasan(e.target.value)}
                    placeholder="cth: salah ketik, seharusnya 12500 bukan 125000"
                  />
                  <p className="form-hint">
                    Wajib, minimal 5 huruf. Angka {k.label} yang berubah tanpa sebab
                    tertulis mustahil dijelaskan nanti.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setPerbaiki(null)} disabled={sibuk}>
                  Batal
                </button>
                <button
                  className="btn-primary"
                  disabled={sibuk || alasanKurang(alasan)}
                  onClick={() => void kirim('koreksi_meter', {
                    woId: perbaiki.woId, jenis,
                    nilaiBaru: nilaiBaru.trim() === '' ? null : Number(nilaiBaru),
                    alasan: alasan.trim(),
                  }, 'Tersimpan.')}
                >
                  {sibuk ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

const alasanKurang = (s: string) => s.trim().length < 5;
