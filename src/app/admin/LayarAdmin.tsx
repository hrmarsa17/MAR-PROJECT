'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { rupiah } from '../../lib/format.js';
import type { BekalAdmin } from '../../domain/admin.js';
import { Katalog } from './Katalog.js';

/**
 * MENU ADMIN.
 *
 * Tidak meniru layar mana pun — di KMB V2 pekerjaan ini dilakukan dengan
 * menyunting spreadsheet langsung. Yang ditiru justru KEBIASAANNYA: satu tabel
 * per jenis, semuanya terlihat sekaligus, sunting di tempat.
 *
 * TIDAK ADA TOMBOL HAPUS untuk orang, dan itu disengaja. Mekanik punya poin,
 * WO, dan riwayat approval; menghapusnya memutus semuanya, dan basis data akan
 * menolaknya lewat foreign key. Yang benar adalah MENONAKTIFKAN — orangnya
 * hilang dari dropdown dan payroll, riwayatnya tetap bisa dijelaskan.
 */

type Tab = 'orang' | 'katalog' | 'faktor' | 'tarif' | 'setelan' | 'sehat';

const TAB: { kunci: Tab; label: string }[] = [
  { kunci: 'orang', label: '👷 Orang & Token' },
  { kunci: 'katalog', label: '📋 Katalog Job' },
  { kunci: 'faktor', label: '⚙️ Faktor' },
  { kunci: 'tarif', label: '💰 Tarif' },
  { kunci: 'setelan', label: '🔧 Setelan' },
  { kunci: 'sehat', label: '🩺 Kesehatan Sistem' },
];

type Kabar = { baik: boolean; teks: string } | null;

export function LayarAdmin({
  bekal, akuId, kesehatan,
}: {
  bekal: BekalAdmin;
  akuId: number;
  /* Dihitung di server dan dikirim sebagai children — layar klien tidak boleh
     menyentuh basis data, dan pemeriksaannya memang tidak perlu interaktif. */
  kesehatan: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('orang');
  const [kabar, setKabar] = useState<Kabar>(null);
  const [sibuk, setSibuk] = useState(false);
  const router = useRouter();

  async function kirim(aksi: string, data: unknown, sukses: string) {
    setSibuk(true);
    setKabar(null);
    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
      });
      const j = await r.json();
      if (j.ok) {
        setKabar({ baik: true, teks: sukses });
        router.refresh();
        return j.data?.hasil ?? {};
      }
      setKabar({ baik: false, teks: j.pesan ?? 'Gagal' });
      return null;
    } catch {
      setKabar({
        baik: false,
        teks: '⚠️ Sambungan terputus sebelum jawaban server sampai. Muat ulang dulu '
          + 'dan lihat keadaan sebenarnya.',
      });
      return null;
    } finally {
      setSibuk(false);
    }
  }

  const bersama = { kirim, sibuk, bekal, akuId };

  return (
    <div className="container layar-admin">
      <div className="page-header">
        <h1 className="page-title">🛠️ Admin</h1>
        <p className="page-subtitle">
          Pekerjaan yang dulu Anda lakukan dengan menyunting spreadsheet langsung.
          Semua perubahan di sini tercatat di audit log.
        </p>
      </div>

      <div className="kabar kabar-info">
        <b>Mengubah base point atau tarif TIDAK mengubah WO yang sudah disetujui.</b>{' '}
        Angkanya sudah dibekukan saat approve, jadi laporan gaji yang sudah terbit
        tidak akan bergeser. Yang berubah hanya WO yang dibuat sesudah ini.
      </div>

      <div className="tabs">
        {TAB.map((t) => (
          <button
            key={t.kunci} type="button"
            className={`tab${tab === t.kunci ? ' active' : ''}`}
            onClick={() => { setTab(t.kunci); setKabar(null); }}
          >{t.label}</button>
        ))}
      </div>

      {kabar && (
        <div className={`kabar ${kabar.baik ? 'kabar-benar' : 'kabar-salah'}`}>{kabar.teks}</div>
      )}

      {tab === 'orang' && <TabOrang {...bersama} />}
      {tab === 'katalog' && <Katalog bekal={bekal} kirim={kirim} sibuk={sibuk} />}
      {tab === 'faktor' && <TabFaktor {...bersama} />}
      {tab === 'tarif' && <TabTarif {...bersama} />}
      {tab === 'setelan' && <TabSetelan {...bersama} />}
      {tab === 'sehat' && kesehatan}
    </div>
  );
}

interface Bersama {
  kirim: (aksi: string, data: unknown, sukses: string) => Promise<Record<string, unknown> | null>;
  sibuk: boolean;
  bekal: BekalAdmin;
  akuId: number;
}

/* ── ORANG & TOKEN ───────────────────────────────────────────────────────── */

type FormOrang = BekalAdmin['orang'][number];

const ORANG_BARU = (payRateId: number): FormOrang => ({
  id: 0, kode: '', nama: '', email: null, peran: 'mechanic', payRateId,
  grade: null, aktif: true, akunUji: false, bolehPerforma: false,
  bolehTeknis: false, bolehReport: false, bolehAdmin: false,
  section: [], token: null, jejak: 0,
});

function TabOrang({ kirim, sibuk, bekal, akuId }: Bersama) {
  const [sunting, setSunting] = useState<FormOrang | null>(null);
  const [tersalin, setTersalin] = useState<number | null>(null);

  async function salin(teks: string, id: number) {
    try { await navigator.clipboard.writeText(teks); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = teks; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* menyerah dengan jujur */ }
      document.body.removeChild(ta);
    }
    setTersalin(id);
    setTimeout(() => setTersalin((v) => (v === id ? null : v)), 1500);
  }

  return (
    <div className="panel">
      <div className="admin-kepala">
        <div className="panel-judul">{bekal.orang.length} orang</div>
        <button
          className="btn-primary btn-sm" disabled={sibuk}
          onClick={() => setSunting(ORANG_BARU(bekal.tarif[0]?.id ?? 0))}
        >+ Tambah orang</button>
      </div>

      <div className="tabel-gulir">
        <table className="table tabel-admin">
          <thead>
            <tr>
              <th>Kode</th><th>Nama</th><th>Peran</th><th>Section</th>
              <th>Tarif</th><th>Token</th><th>Akses</th><th></th>
            </tr>
          </thead>
          <tbody>
            {bekal.orang.map((o) => (
              <tr key={o.id} className={o.aktif ? '' : 'nonaktif'}>
                <td>{o.kode}</td>
                <td>
                  {o.nama}
                  {!o.aktif && <span className="badge badge-grey">nonaktif</span>}
                  {o.akunUji && <span className="badge badge-warning">uji</span>}
                </td>
                <td>{o.peran}</td>
                <td>{o.section.length ? o.section.join(', ') : <i className="ro-kosong">semua</i>}</td>
                <td>{bekal.tarif.find((t) => t.id === o.payRateId)?.label ?? '–'}</td>
                <td>
                  {o.token ? (
                    <span className="token-sel">
                      <code>{o.token}</code>
                      <button
                        className="btn-secondary btn-sm" disabled={sibuk}
                        onClick={() => void salin(o.token!, o.id)}
                      >{tersalin === o.id ? '✅' : '📋'}</button>
                    </span>
                  ) : <i className="ro-kosong">belum ada</i>}
                </td>
                <td className="akses-sel">
                  {o.bolehAdmin && <span className="badge badge-danger">admin</span>}
                  {o.bolehPerforma && <span className="badge badge-blue">performa</span>}
                  {o.bolehTeknis && <span className="badge badge-blue">teknis</span>}
                  {o.bolehReport && <span className="badge badge-blue">report</span>}
                </td>
                <td className="aksi-sel">
                  <button className="btn-secondary btn-sm" disabled={sibuk}
                          onClick={() => setSunting({ ...o })}>Ubah</button>
                  <button
                    className="btn-secondary btn-sm" disabled={sibuk || !o.aktif}
                    title={o.token ? 'Cabut token lama, terbitkan yang baru' : 'Terbitkan token'}
                    onClick={() => {
                      if (o.token && !confirm(
                        `Ganti token ${o.nama}?\n\nToken lamanya langsung tidak berlaku, dan `
                        + 'ia harus memasukkan yang baru di HP-nya.',
                      )) return;
                      void kirim('admin_token', { mechanicId: o.id, ganti: !!o.token },
                        o.token ? `Token ${o.nama} diganti.` : `Token ${o.nama} diterbitkan.`);
                    }}
                  >{o.token ? 'Ganti token' : 'Terbitkan token'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sunting && (
        <ModalOrang
          awal={sunting} bekal={bekal} sibuk={sibuk} akuId={akuId}
          onTutup={() => setSunting(null)}
          onSimpan={async (f) => {
            const hasil = await kirim('admin_orang', {
              ...(f.id ? { id: f.id } : {}),
              kode: f.kode, nama: f.nama, email: f.email || null, peran: f.peran,
              payRateId: f.payRateId, grade: f.grade || null, section: f.section,
              aktif: f.aktif, akunUji: f.akunUji, bolehPerforma: f.bolehPerforma,
              bolehTeknis: f.bolehTeknis, bolehReport: f.bolehReport,
              bolehAdmin: f.bolehAdmin,
            }, f.id ? `${f.nama} tersimpan.` : `${f.nama} ditambahkan.`);
            if (hasil) setSunting(null);
          }}
        />
      )}
    </div>
  );
}

function ModalOrang({
  awal, bekal, sibuk, akuId, onTutup, onSimpan,
}: {
  awal: FormOrang; bekal: BekalAdmin; sibuk: boolean; akuId: number;
  onTutup: () => void; onSimpan: (f: FormOrang) => void;
}) {
  const [f, setF] = useState<FormOrang>(awal);
  const ubah = (b: Partial<FormOrang>) => setF({ ...f, ...b });
  const diriSendiri = f.id === akuId;

  return (
    <Portal>
      <div className="modal-tirai">
        <div className="modal modal-lebar">
          <div className="modal-header">
            <h3>{f.id ? `Ubah ${awal.nama}` : 'Tambah orang'}</h3>
            <button className="modal-tutup" onClick={onTutup}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="a-kode">Kode <span className="wajib">*</span></label>
                <input id="a-kode" value={f.kode} onChange={(e) => ubah({ kode: e.target.value })}
                       placeholder="cth: MECH-025" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="a-nama">Nama <span className="wajib">*</span></label>
                <input id="a-nama" value={f.nama} onChange={(e) => ubah({ nama: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="a-peran">Peran</label>
                <select id="a-peran" value={f.peran}
                        onChange={(e) => ubah({ peran: e.target.value as FormOrang['peran'] })}>
                  <option value="mechanic">Mekanik</option>
                  <option value="supervisor">Planner / PIC Lapangan (L1)</option>
                  <option value="superintendent">Manager (L2)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="a-tarif">Tarif <span className="wajib">*</span></label>
                <select id="a-tarif" value={f.payRateId}
                        onChange={(e) => ubah({ payRateId: Number(e.target.value) })}>
                  {bekal.tarif.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} — {rupiah(t.idrPerPoint)}/poin
                    </option>
                  ))}
                </select>
                {/* Tarif WAJIB dan tak ada nilai cadangan: mekanik tanpa tarif
                    akan menghasilkan poin yang tak bisa dijadikan rupiah. */}
                <p className="form-hint">Wajib. Tidak ada nilai cadangan.</p>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Section yang boleh dilihat</label>
              <div className="pilih-section">
                {bekal.section.map((s) => (
                  <label key={s} className="pilih-baris">
                    <input
                      type="checkbox" checked={f.section.includes(s)}
                      onChange={(e) => ubah({
                        section: e.target.checked
                          ? [...f.section, s] : f.section.filter((x) => x !== s),
                      })}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              <p className="form-hint">
                Tidak dicentang sama sekali = <b>boleh melihat semua section</b>.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Penanda</label>
              <div className="pilih-section">
                <Centang label="Aktif" nilai={f.aktif} mati={diriSendiri}
                         onUbah={(v) => ubah({ aktif: v })} />
                <Centang label="Akun uji" nilai={f.akunUji} onUbah={(v) => ubah({ akunUji: v })} />
                <Centang label="Boleh lihat Performa" nilai={f.bolehPerforma}
                         onUbah={(v) => ubah({ bolehPerforma: v })} />
                <Centang label="Boleh lihat Teknis" nilai={f.bolehTeknis}
                         onUbah={(v) => ubah({ bolehTeknis: v })} />
                <Centang label="Boleh lihat Reports" nilai={f.bolehReport}
                         onUbah={(v) => ubah({ bolehReport: v })} />
                <Centang label="Boleh buka Admin" nilai={f.bolehAdmin} mati={diriSendiri}
                         onUbah={(v) => ubah({ bolehAdmin: v })} />
              </div>
              {diriSendiri && (
                <p className="form-hint">
                  Aktif dan hak Admin Anda sendiri dikunci — kalau dicabut, tak ada
                  lagi yang bisa menyalakannya kembali dari dalam sistem.
                </p>
              )}
            </div>

            {f.id > 0 && f.jejak > 0 && (
              <div className="kabar kabar-info">
                Orang ini tercatat di <b>{f.jejak} WO</b>. Karena itu ia tidak bisa
                dihapus — yang benar adalah <b>menonaktifkan</b>, supaya ia hilang dari
                dropdown dan payroll tapi riwayatnya tetap bisa dijelaskan.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onTutup} disabled={sibuk}>Batal</button>
            <button
              className="btn-primary" disabled={sibuk || f.kode.trim().length < 2
                || f.nama.trim().length < 2 || !f.payRateId}
              onClick={() => onSimpan(f)}
            >{sibuk ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function Centang({
  label, nilai, onUbah, mati = false,
}: { label: string; nilai: boolean; onUbah: (v: boolean) => void; mati?: boolean }) {
  return (
    <label className="pilih-baris">
      <input type="checkbox" checked={nilai} disabled={mati}
             onChange={(e) => onUbah(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ── FAKTOR ──────────────────────────────────────────────────────────────── */

function TabFaktor({ kirim, sibuk, bekal }: Bersama) {
  const [ubah, setUbah] = useState<Record<number, string>>({});
  return (
    <div className="panel">
      <div className="kabar kabar-awas">
        Faktor adalah <b>pengali poin</b>. Mengubahnya mengubah poin semua WO yang
        dibuat sesudah ini — yang sudah disetujui tidak ikut bergerak.
      </div>
      <table className="table tabel-admin">
        <thead>
          <tr><th>Jenis</th><th>Kunci</th><th>Keterangan</th><th className="num">Nilai</th><th></th></tr>
        </thead>
        <tbody>
          {bekal.faktor.map((f) => {
            const v = ubah[f.id] ?? String(f.nilai);
            return (
              <tr key={f.id}>
                <td>{f.jenis}</td>
                <td><code>{f.kunci}</code></td>
                <td>{f.deskripsi ?? '–'}</td>
                <td className="num">
                  <input className="sel-angka" type="number" step="0.01" value={v}
                         onChange={(e) => setUbah({ ...ubah, [f.id]: e.target.value })} />
                </td>
                <td>
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || Number(v) === f.nilai || Number(v) < 0}
                          onClick={() => void kirim('admin_faktor',
                            { id: f.id, nilai: Number(v) },
                            `${f.kunci}: ${f.nilai} → ${v} tersimpan.`)}
                  >Simpan</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── TARIF ───────────────────────────────────────────────────────────────── */

function TabTarif({ kirim, sibuk, bekal }: Bersama) {
  const [ubah, setUbah] = useState<Record<number, string>>({});
  return (
    <div className="panel">
      <div className="kabar kabar-awas">
        <b>Poin yang sudah terbit tidak ikut berubah.</b> Rupiahnya dibekukan saat
        poin diterbitkan. Di KMB V2 tarif dibaca ulang saat laporan disusun, dan
        itulah sebabnya perubahan tarif pernah menggeser gaji yang sudah dibayar.
      </div>
      <table className="table tabel-admin">
        <thead>
          <tr><th>Posisi</th><th>Label</th><th className="num">Rupiah / poin</th><th>Aktif</th><th></th></tr>
        </thead>
        <tbody>
          {bekal.tarif.map((t) => {
            const v = ubah[t.id] ?? String(t.idrPerPoint);
            return (
              <tr key={t.id} className={t.aktif ? '' : 'nonaktif'}>
                <td><code>{t.posisi}</code></td>
                <td>{t.label}</td>
                <td className="num">
                  <input className="sel-angka lebar" type="number" step="1" value={v}
                         onChange={(e) => setUbah({ ...ubah, [t.id]: e.target.value })} />
                </td>
                <td>{t.aktif ? 'ya' : 'tidak'}</td>
                <td>
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || Number(v) === t.idrPerPoint || Number(v) <= 0}
                          onClick={() => void kirim('admin_tarif',
                            { id: t.id, idrPerPoint: Number(v), aktif: t.aktif },
                            `${t.label}: ${rupiah(t.idrPerPoint)} → ${rupiah(Number(v))} tersimpan.`)}
                  >Simpan</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── SETELAN ─────────────────────────────────────────────────────────────── */

function TabSetelan({ kirim, sibuk, bekal }: Bersama) {
  const [ubah, setUbah] = useState<Record<string, string>>({});
  return (
    <div className="panel">
      <table className="table tabel-admin">
        <thead>
          <tr><th>Kunci</th><th>Keterangan</th><th>Nilai</th><th></th></tr>
        </thead>
        <tbody>
          {bekal.setelan.map((s) => {
            const v = ubah[s.kunci] ?? (s.nilai ?? '');
            return (
              <tr key={s.kunci}>
                <td><code>{s.kunci}</code></td>
                <td>{s.keterangan ?? '–'}</td>
                <td>
                  <input className="sel-angka lebar" value={v}
                         onChange={(e) => setUbah({ ...ubah, [s.kunci]: e.target.value })} />
                </td>
                <td>
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || v === (s.nilai ?? '')}
                          onClick={() => void kirim('admin_setelan',
                            { kunci: s.kunci, nilai: v },
                            `${s.kunci}: ${s.nilai} → ${v} tersimpan.`)}
                  >Simpan</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="form-hint">
        Setelan baru belum bisa dibuat dari sini — hanya yang sudah ada yang bisa
        diubah. Menambah kunci baru berarti ada kode yang membacanya, dan itu
        pekerjaan yang berpasangan.
      </p>
    </div>
  );
}
