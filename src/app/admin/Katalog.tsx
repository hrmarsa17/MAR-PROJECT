'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BekalAdmin } from '../../domain/admin.js';
import type { Pratinjau } from '../../domain/imporKatalog.js';

/**
 * KATALOG — DIBAGI SEPERTI SHEET DI SPREADSHEET.
 *
 * Bukan satu tabel raksasa. Spreadsheet KMB V2 memisahkannya begini
 * (`Constants.js:37-43`), dan pemisahan itu bukan kebetulan — joblist dipisah
 * PER SECTION karena orang yang mengurus field tidak pernah menyentuh baris
 * workshop:
 *
 *   Config_Jobs_Field      →  Job — field
 *   Config_Jobs_Workshop   →  Job — workshop
 *   Config_Units           →  Unit
 *   Config_Components      →  Komponen
 *
 * Nama kolom templat impornya pun nama kolom yang SUDAH ADA di sheet Gabriel
 * (`JobCatalogService.js:40-48`), supaya lembar yang ia punya bisa ditempel
 * langsung tanpa memetakan ulang satu per satu.
 */

type Lembar = { kunci: string; label: string; jenis: 'job' | 'unit'; section: string | null };

export function Katalog({
  bekal, kirim, sibuk,
}: {
  bekal: BekalAdmin;
  kirim: (aksi: string, data: unknown, sukses: string) => Promise<Record<string, unknown> | null>;
  sibuk: boolean;
}) {
  const lembar: Lembar[] = [
    ...bekal.section.map((s) => ({
      kunci: `job-${s}`, label: `Job — ${s}`, jenis: 'job' as const, section: s,
    })),
    { kunci: 'unit', label: 'Unit', jenis: 'unit', section: null },
  ];
  const [aktif, setAktif] = useState(lembar[0]?.kunci ?? 'unit');
  const l = lembar.find((x) => x.kunci === aktif) ?? lembar[0]!;

  return (
    <div className="panel">
      <div className="lembar-baris">
        {lembar.map((x) => (
          <button
            key={x.kunci} type="button"
            className={`lembar${x.kunci === aktif ? ' aktif' : ''}`}
            onClick={() => setAktif(x.kunci)}
          >{x.label}</button>
        ))}
      </div>

      <ImporLembar lembar={l} kirim={kirim} sibuk={sibuk} />

      {l.jenis === 'job'
        ? <TabelJob bekal={bekal} section={l.section!} kirim={kirim} sibuk={sibuk} />
        : <TabelUnitCatatan />}
    </div>
  );
}

/* ── Impor & ekspor satu lembar ───────────────────────────────────────────── */

function ImporLembar({
  lembar, kirim, sibuk,
}: {
  lembar: Lembar;
  kirim: (aksi: string, data: unknown, sukses: string) => Promise<Record<string, unknown> | null>;
  sibuk: boolean;
}) {
  const router = useRouter();
  const berkasRef = useRef<HTMLInputElement>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const alamatUnduh = `/api/katalog?jenis=${lembar.jenis}`
    + (lembar.section ? `&section=${encodeURIComponent(lembar.section)}` : '');

  async function unggah(f: File) {
    setMemuat(true); setGalat(null); setPratinjau(null);
    try {
      const fd = new FormData();
      fd.append('berkas', f);
      fd.append('jenis', lembar.jenis);
      if (lembar.section) fd.append('section', lembar.section);
      const r = await fetch('/api/katalog', { method: 'POST', body: fd });
      const j = await r.json();
      if (j.ok) setPratinjau(j.data as Pratinjau);
      else setGalat(j.pesan ?? 'Gagal membaca berkas');
    } catch {
      setGalat('Sambungan terputus saat mengunggah berkas.');
    } finally {
      setMemuat(false);
      if (berkasRef.current) berkasRef.current.value = '';
    }
  }

  const adaPerubahan = pratinjau
    && (pratinjau.baru > 0 || pratinjau.diubah.length > 0 || pratinjau.indukBaru.length > 0);

  return (
    <div className="impor-kotak">
      <div className="impor-baris">
        {/* Unduh lebih dulu, SELALU. Templat kosong kalau belum ada isinya,
            isi sekarang kalau sudah — dua-duanya berkolom sama, jadi yang
            diunduh selalu bisa diunggah balik. */}
        <a className="btn btn-secondary btn-sm" href={alamatUnduh}>
          ⬇️ Unduh {lembar.label}
        </a>
        <label className="btn btn-primary btn-sm impor-pilih">
          ⬆️ Unggah Excel
          <input
            ref={berkasRef} type="file" hidden
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void unggah(f); }}
          />
        </label>
        {memuat && <span className="impor-ket">Membaca berkas…</span>}
      </div>
      <p className="form-hint">
        Unduh dulu untuk mendapat kolom yang benar, isi di Excel, lalu unggah.
        <b> Mengunggah tidak langsung menyimpan</b> — Anda akan melihat apa yang
        berubah lebih dulu.
      </p>

      {galat && <div className="kabar kabar-salah">{galat}</div>}

      {pratinjau && (
        <div className="pratinjau-impor">
          <div className="panel-judul">Yang akan terjadi</div>

          <div className="stat-row">
            <div className="stat"><div className="stat-num">{pratinjau.baru}</div>
              <div className="stat-label">baris baru</div></div>
            <div className="stat"><div className="stat-num">{pratinjau.diubah.length}</div>
              <div className="stat-label">nilai berubah</div></div>
            <div className="stat"><div className="stat-num">{pratinjau.takBerubah}</div>
              <div className="stat-label">tidak berubah</div></div>
            <div className="stat"><div className="stat-num">{pratinjau.masalah.length}</div>
              <div className="stat-label">baris bermasalah</div></div>
          </div>

          {pratinjau.indukBaru.length > 0 && (
            <div className="kabar kabar-info">
              Akan dibuat juga: {pratinjau.indukBaru.length} induk baru —{' '}
              {pratinjau.indukBaru.slice(0, 8).map((i) => `${i.jenis} "${i.nama}"`).join(', ')}
              {pratinjau.indukBaru.length > 8 && `, dan ${pratinjau.indukBaru.length - 8} lagi`}.
            </div>
          )}

          {pratinjau.masalah.length > 0 && (
            <div className="kabar kabar-awas">
              <b>{pratinjau.masalah.length} baris dilewati</b> karena isinya tidak bisa
              dipakai. Sisanya tetap bisa diterapkan.
              <ul className="daftar-masalah">
                {pratinjau.masalah.slice(0, 10).map((p, i) => (
                  <li key={i}>Baris {p.baris}: {p.pesan}</li>
                ))}
                {pratinjau.masalah.length > 10 && (
                  <li>…dan {pratinjau.masalah.length - 10} lagi</li>
                )}
              </ul>
            </div>
          )}

          {pratinjau.diubah.length > 0 && (
            <>
              {/* Angka yang berubah ditampilkan SATU PER SATU, bukan cuma
                  jumlahnya. base_point adalah uang: "127 nilai berubah" tidak
                  memberi tahu siapa pun apa yang sebenarnya akan terjadi. */}
              <div className="panel-judul" style={{ marginTop: '0.8rem' }}>
                Nilai yang berubah
              </div>
              <div className="tabel-gulir">
                <table className="table tabel-admin">
                  <thead>
                    <tr><th>Kode</th><th>Medan</th><th>Sekarang</th><th>Jadi</th></tr>
                  </thead>
                  <tbody>
                    {pratinjau.diubah.slice(0, 100).map((d, i) => (
                      <tr key={i}>
                        <td>{d.kode}</td>
                        <td><code>{d.medan}</code></td>
                        <td className="riwayat-lama">{d.lama}</td>
                        <td className="riwayat-baru">{d.baru}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pratinjau.diubah.length > 100 && (
                <p className="form-hint">
                  Menampilkan 100 dari {pratinjau.diubah.length} perubahan.
                </p>
              )}
            </>
          )}

          <div className="impor-baris" style={{ marginTop: '0.9rem' }}>
            <button className="btn-secondary" onClick={() => setPratinjau(null)} disabled={sibuk}>
              Batal
            </button>
            <button
              className="btn-primary" disabled={sibuk || !adaPerubahan}
              onClick={async () => {
                const h = await kirim('impor_katalog', {
                  jenis: pratinjau.jenis, sectionCode: pratinjau.section,
                  baris: pratinjau.baris,
                }, 'Katalog diterapkan.');
                if (h) { setPratinjau(null); router.refresh(); }
              }}
            >
              {sibuk ? 'Menerapkan…' : `Terapkan — ${pratinjau.baru} baru, ${pratinjau.diubah.length} berubah`}
            </button>
          </div>
          {!adaPerubahan && (
            <p className="form-hint">Tidak ada yang berubah — berkasnya sama dengan isi sekarang.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tabel job per section ────────────────────────────────────────────────── */

function TabelJob({
  bekal, section, kirim, sibuk,
}: {
  bekal: BekalAdmin; section: string;
  kirim: (aksi: string, data: unknown, sukses: string) => Promise<Record<string, unknown> | null>;
  sibuk: boolean;
}) {
  const [cari, setCari] = useState('');
  const [ubah, setUbah] = useState<Record<number, { bp: string; ph: string }>>({});

  const milik = bekal.job.filter((j) => j.section === section);
  const hasil = milik.filter((j) =>
    !cari.trim()
    || j.kode.toLowerCase().includes(cari.toLowerCase())
    || j.nama.toLowerCase().includes(cari.toLowerCase()));

  if (milik.length === 0) {
    return (
      <div className="hampa">
        <b>Belum ada job untuk section {section}</b>
        <div className="hampa-ket">
          Unduh templatnya di atas, isi di Excel, lalu unggah. Katalog KMB V2
          berisi ribuan baris — memang tidak untuk diketik satu per satu di sini.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="admin-kepala">
        <div className="panel-judul">{milik.length} job di section {section}</div>
        <input className="form-control" style={{ maxWidth: 260 }} value={cari}
               onChange={(e) => setCari(e.target.value)} placeholder="🔍 Cari kode / nama job…" />
      </div>
      <div className="tabel-gulir">
        <table className="table tabel-admin">
          <thead>
            <tr>
              <th>Kode</th><th>Pekerjaan</th>
              <th className="num">Base point</th><th className="num">Jam rencana</th>
              <th>Aktif</th><th></th>
            </tr>
          </thead>
          <tbody>
            {hasil.slice(0, 200).map((j) => {
              const d = ubah[j.id] ?? { bp: String(j.basePoints), ph: String(j.planHours) };
              const berubah = Number(d.bp) !== j.basePoints || Number(d.ph) !== j.planHours;
              return (
                <tr key={j.id} className={j.aktif ? '' : 'nonaktif'}>
                  <td>{j.kode}</td>
                  <td>{j.nama}</td>
                  <td className="num">
                    <input className="sel-angka" type="number" step="any" value={d.bp}
                           onChange={(e) => setUbah({ ...ubah, [j.id]: { ...d, bp: e.target.value } })} />
                  </td>
                  <td className="num">
                    <input className="sel-angka" type="number" step="any" value={d.ph}
                           onChange={(e) => setUbah({ ...ubah, [j.id]: { ...d, ph: e.target.value } })} />
                  </td>
                  <td>{j.aktif ? 'ya' : 'tidak'}</td>
                  <td>
                    <button
                      className="btn-primary btn-sm"
                      disabled={sibuk || !berubah || Number(d.bp) <= 0 || Number(d.ph) <= 0}
                      onClick={() => void kirim('admin_job', {
                        jobId: j.id, basePoints: Number(d.bp), planHours: Number(d.ph),
                        aktif: j.aktif,
                      }, `${j.kode}: ${j.basePoints} → ${d.bp} poin tersimpan.`)}
                    >Simpan</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasil.length > 200 && (
        <p className="form-hint">
          Menampilkan 200 dari {hasil.length}. Persempit pencariannya, atau ubah
          borongan lewat Excel.
        </p>
      )}
    </>
  );
}

function TabelUnitCatatan() {
  return (
    <div className="kabar kabar-info">
      Daftar unit disunting lewat Excel — kolomnya <code>unit_code</code>,{' '}
      <code>unit_name</code>, <code>unit_model</code>, <code>unit_factor</code>,{' '}
      <code>odometer</code>, dan seterusnya. <b>unit_factor adalah pengali poin</b>,
      jadi perubahannya akan terlihat satu per satu di pratinjau sebelum diterapkan.
    </div>
  );
}
