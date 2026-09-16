'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { rupiah } from '../../lib/format.js';
import type { BekalAdmin } from '../../domain/admin.js';
import { Katalog } from './Katalog.js';
import { ModalDampak } from './ModalDampak.js';
import { Audit } from './Audit.js';

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

type Tab = 'orang' | 'katalog' | 'faktor' | 'tarif' | 'setelan' | 'riwayat' | 'sehat';

const TAB: { kunci: Tab; label: string }[] = [
  { kunci: 'orang', label: '👷 Orang & Token' },
  { kunci: 'katalog', label: '📋 Katalog Job' },
  { kunci: 'faktor', label: '⚙️ Faktor' },
  { kunci: 'tarif', label: '💰 Tarif' },
  { kunci: 'setelan', label: '🔧 Setelan' },
  { kunci: 'riwayat', label: '🕘 Riwayat Perubahan' },
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

  /**
   * SENGAJA TIDAK lewat `src/pwa/kirim.ts`, dan ini bukan yang terlewat.
   *
   * Seluruh layar lapangan sudah memakai antrean luring. Admin tidak, karena
   * yang dikerjakan di sini mengubah ATURAN, bukan melaporkan pekerjaan:
   * tarif, faktor, katalog job, hak orang.
   *
   * Aturan yang "tersimpan di antrean" adalah aturan yang belum berlaku —
   * sementara admin yang menutup layarnya sudah menganggap ia berlaku, dan
   * setiap WO yang disetujui sejak saat itu membeku dengan angka yang lama.
   * Selisihnya baru ketahuan saat payroll, dan saat itu uangnya sudah dibayar.
   *
   * Pekerjaan admin juga tidak pernah terjadi di pit tanpa sinyal. Gagal
   * dengan nyaring di sini jauh lebih murah daripada berhasil dengan diam.
   */
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

      {/* Kalimat ini pernah berbunyi "tidak mengubah WO yang sudah disetujui"
          tanpa syarat. Sejak ada tombol "Terapkan ke semua WO" di Katalog, itu
          jadi setengah benar — dan jaminan yang setengah benar lebih berbahaya
          daripada tidak ada jaminan sama sekali. */}
      <div className="kabar kabar-info">
        <b>Menyimpan perubahan di sini TIDAK mengubah WO yang sudah disetujui.</b>{' '}
        Angkanya sudah dibekukan saat approve, jadi laporan gaji yang sudah terbit
        tidak akan bergeser. Yang berubah hanya WO yang dibuat sesudah ini.{' '}
        <b>Satu-satunya pengecualian</b> ada di tab Katalog Job: tombol{' '}
        <i>Terapkan ke semua WO</i>, yang memang dibuat untuk menghitung ulang WO
        lama — dan selalu menyebutkan rupiahnya lebih dulu.
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
      {tab === 'riwayat' && <Audit akuId={akuId} />}
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
  const [surut, setSurut] = useState<{ id: number; kunci: string; nilai: number } | null>(null);

  return (
    <div className="panel">
      <div className="kabar kabar-awas">
        Faktor adalah <b>pengali poin</b>, dan ia berlaku <b>lintas section</b> —
        satu baris menyentuh field, workshop, dan tyreman sekaligus. <b>Simpan</b>{' '}
        hanya berlaku untuk WO yang dibuat sesudah ini; untuk membawanya mundur ke
        WO yang sudah disetujui, pakai tombol merah di sebelahnya.
      </div>
      <table className="table tabel-admin">
        <thead>
          <tr><th>Jenis</th><th>Kunci</th><th>Keterangan</th><th className="num">Nilai</th><th></th></tr>
        </thead>
        <tbody>
          {bekal.faktor.map((f) => {
            const v = ubah[f.id] ?? String(f.nilai);
            const sah = Number(v) >= 0 && v.trim() !== '';
            return (
              <tr key={f.id}>
                <td>{f.jenis}</td>
                <td><code>{f.kunci}</code></td>
                <td>{f.deskripsi ?? '–'}</td>
                <td className="num">
                  <input className="sel-angka" type="number" step="0.01" value={v}
                         onChange={(e) => setUbah({ ...ubah, [f.id]: e.target.value })} />
                </td>
                <td className="aksi-sel">
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || !sah || Number(v) === f.nilai}
                          onClick={async () => {
                            const h = await kirim('admin_faktor',
                              { id: f.id, nilai: Number(v) },
                              `${f.kunci}: ${f.nilai} → ${v} tersimpan — berlaku untuk WO baru.`);
                            if (h) setUbah((s) => { const t = { ...s }; delete t[f.id]; return t; });
                          }}
                  >Simpan</button>
                  {/* Sama seperti di Katalog Job: TIDAK disyaratkan ada suntingan
                      yang belum disimpan. Yang dibandingkan snapshot WO dengan
                      nilai yang diketik, bukan kotak isian dengan tabel. */}
                  <button className="btn-danger btn-sm" disabled={sibuk || !sah}
                          title={`Hitung ulang semua WO approved yang memakai ${f.kunci}`}
                          onClick={() => setSurut({ id: f.id, kunci: f.kunci, nilai: Number(v) })}
                  >Terapkan ke semua WO</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {surut && (
        <ModalDampak
          alamat={`/api/data?jenis=pratinjau_faktor&id=${surut.id}&nilai=${surut.nilai}`}
          labelTerapkan="Terapkan" sibuk={sibuk}
          onTutup={() => setSurut(null)}
          onTerapkan={async (d) => {
            const h = await kirim('terapkan_faktor_surut', {
              faktorId: surut.id, nilaiBaru: surut.nilai,
              rupiahSesudahDilihat: d.rupiahSesudah,
            }, `${surut.kunci}: ${d.terpengaruh} WO dihitung ulang — `
             + `${rupiah(d.rupiahSekarang)} → ${rupiah(d.rupiahSesudah)}.`);
            if (h) {
              setSurut(null);
              setUbah((s) => { const t = { ...s }; delete t[surut.id]; return t; });
            }
          }}
        />
      )}
    </div>
  );
}

/* ── TARIF ───────────────────────────────────────────────────────────────── */

function TabTarif({ kirim, sibuk, bekal }: Bersama) {
  const [ubah, setUbah] = useState<Record<number, string>>({});
  const [surut, setSurut] = useState<{ id: number; label: string; nilai: number } | null>(null);

  return (
    <div className="panel">
      <div className="kabar kabar-awas">
        <b>Simpan tidak menggeser poin yang sudah terbit</b> — rupiahnya dibekukan
        saat poin diterbitkan. Di KMB V2 tarif dibaca ulang setiap kali laporan
        disusun, dan itulah sebabnya satu penyuntingan tarif pernah menggeser gaji
        yang sudah dibayar sebesar <b>−Rp 17,6 juta</b> tanpa ada yang memintanya.{' '}
        Kalau memang itu yang Anda maksud, tombol merah melakukannya — dengan
        menyebutkan rupiah dan namanya lebih dulu.
      </div>
      <table className="table tabel-admin">
        <thead>
          <tr><th>Posisi</th><th>Label</th><th className="num">Rupiah / poin</th><th>Aktif</th><th></th></tr>
        </thead>
        <tbody>
          {bekal.tarif.map((t) => {
            const v = ubah[t.id] ?? String(t.idrPerPoint);
            const sah = Number(v) > 0;
            return (
              <tr key={t.id} className={t.aktif ? '' : 'nonaktif'}>
                <td><code>{t.posisi}</code></td>
                <td>{t.label}</td>
                <td className="num">
                  <input className="sel-angka lebar" type="number" step="1" value={v}
                         onChange={(e) => setUbah({ ...ubah, [t.id]: e.target.value })} />
                </td>
                <td>{t.aktif ? 'ya' : 'tidak'}</td>
                <td className="aksi-sel">
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || !sah || Number(v) === t.idrPerPoint}
                          onClick={async () => {
                            const h = await kirim('admin_tarif',
                              { id: t.id, idrPerPoint: Number(v), aktif: t.aktif },
                              `${t.label}: ${rupiah(t.idrPerPoint)} → ${rupiah(Number(v))} `
                              + 'tersimpan — berlaku untuk poin yang terbit sesudah ini.');
                            if (h) setUbah((s) => { const u = { ...s }; delete u[t.id]; return u; });
                          }}
                  >Simpan</button>
                  <button className="btn-danger btn-sm" disabled={sibuk || !sah}
                          title={`Hargai ulang semua poin ${t.label} yang sudah terbit`}
                          onClick={() => setSurut({ id: t.id, label: t.label, nilai: Number(v) })}
                  >Terapkan ke semua WO</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {surut && (
        <ModalDampak
          alamat={`/api/data?jenis=pratinjau_tarif&id=${surut.id}&nilai=${surut.nilai}`}
          labelTerapkan="Hargai ulang" sibuk={sibuk}
          onTutup={() => setSurut(null)}
          onTerapkan={async (d) => {
            const h = await kirim('terapkan_tarif_surut', {
              tarifId: surut.id, idrBaru: surut.nilai,
              rupiahSesudahDilihat: d.rupiahSesudah,
            }, `${surut.label}: ${d.terpengaruh} WO dihargai ulang — `
             + `${rupiah(d.rupiahSekarang)} → ${rupiah(d.rupiahSesudah)}.`);
            if (h) {
              setSurut(null);
              setUbah((s) => { const u = { ...s }; delete u[surut.id]; return u; });
            }
          }}
        />
      )}
    </div>
  );
}

/* ── SETELAN ─────────────────────────────────────────────────────────────── */

/**
 * SETELAN — satu-satunya tab yang SENGAJA tidak punya "Terapkan ke semua WO".
 *
 * Base point, faktor, dan tarif dibekukan saat approve; itu sebabnya ketiganya
 * butuh perintah terpisah untuk dibawa mundur. Setelan tidak dibekukan di mana
 * pun — ia dibaca langsung setiap kali layar disusun. Artinya mengubahnya SUDAH
 * berlaku surut, seketika, untuk seluruh riwayat.
 *
 * Memasang tombolnya di sini justru berbahaya: ia menyiratkan bahwa tanpa
 * menekannya, perubahan itu aman. Yang dibutuhkan keterangan, bukan tombol —
 * dan keterangannya per kunci, karena tidak semua kunci sama.
 */
function TabSetelan({ kirim, sibuk, bekal }: Bersama) {
  const [ubah, setUbah] = useState<Record<string, string>>({});
  const mati = bekal.setelanDampak.filter((s) => s.sifat === 'belum_dipakai').length;
  const hilang = bekal.setelanDampak.filter((s) => !s.adaBarisnya);

  return (
    <div className="panel">
      <div className="kabar kabar-awas">
        <b>Setelan tidak punya tombol &ldquo;Terapkan ke semua WO&rdquo;, dan itu
        disengaja.</b>{' '}
        Tidak seperti base point, faktor, dan tarif, nilainya <b>tidak pernah
        dibekukan</b> ke dalam WO — ia dibaca langsung setiap kali layar disusun.
        Jadi menyimpannya <b>sudah</b> berlaku surut untuk seluruh riwayat,
        seketika. Tombol tambahan hanya akan menyiratkan bahwa tanpa menekannya
        perubahan ini aman.
      </div>

      {mati > 0 && (
        <div className="kabar kabar-salah">
          <b>{mati} setelan di bawah ini belum dibaca kode mana pun.</b> Nilainya
          bisa disunting dan layar menjawab &ldquo;tersimpan&rdquo;, tapi tidak ada
          apa pun yang berubah. Baris yang begitu ditandai <b>tidak berdampak</b>.
        </div>
      )}

      {hilang.length > 0 && (
        <div className="kabar kabar-info">
          {hilang.length} setelan dibaca kode tapi <b>belum punya barisnya</b> di
          sini, jadi ia memakai nilai bawaan yang tak seorang pun pernah memilihnya:{' '}
          {hilang.map((h) => <code key={h.kunci}>{h.kunci}</code>)
            .reduce<React.ReactNode[]>((a, e, i) => (i ? [...a, ', ', e] : [e]), [])}.
        </div>
      )}

      <table className="table tabel-admin">
        <thead>
          <tr>
            <th>Kunci</th><th>Dampak kalau diubah</th><th>Nilai</th><th></th>
          </tr>
        </thead>
        <tbody>
          {bekal.setelanDampak.map((s) => {
            const v = ubah[s.kunci] ?? (s.nilai ?? '');
            const berdampak = s.sifat === 'langsung';
            return (
              <tr key={s.kunci} className={berdampak ? '' : 'nonaktif'}>
                <td className="kode-sel">
                  <code>{s.kunci}</code>
                  {!s.adaBarisnya && <span className="badge badge-grey">belum ada baris</span>}
                </td>
                <td className="sel-dampak">
                  <span className={`badge ${berdampak ? 'badge-warning' : 'badge-grey'}`}>
                    {berdampak ? 'berlaku seketika' : 'tidak berdampak'}
                  </span>
                  <div className="dampak-ket">{s.dampak}</div>
                  {s.pembaca && <div className="dampak-pembaca">dibaca: <code>{s.pembaca}</code></div>}
                </td>
                <td>
                  <input className="sel-angka lebar" value={v} disabled={!s.adaBarisnya}
                         onChange={(e) => setUbah({ ...ubah, [s.kunci]: e.target.value })} />
                </td>
                <td>
                  <button className="btn-primary btn-sm"
                          disabled={sibuk || !s.adaBarisnya || v === (s.nilai ?? '')}
                          onClick={async () => {
                            if (berdampak && !confirm(
                              `Ubah ${s.kunci} dari "${s.nilai}" jadi "${v}"?\n\n`
                              + `${s.dampak}\n\n`
                              + 'Setelan dibaca langsung — perubahan ini berlaku untuk '
                              + 'SELURUH riwayat begitu disimpan, tanpa tombol lain.',
                            )) return;
                            const h = await kirim('admin_setelan',
                              { kunci: s.kunci, nilai: v },
                              `${s.kunci}: ${s.nilai} → ${v} tersimpan.`);
                            if (h) setUbah((x) => { const y = { ...x }; delete y[s.kunci]; return y; });
                          }}
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
