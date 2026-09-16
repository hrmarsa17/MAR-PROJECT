'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { rupiah } from '../../lib/format.js';
import type { BekalAdmin } from '../../domain/admin.js';
import type { Pratinjau } from '../../domain/imporKatalog.js';
import type { PratinjauSurut } from '../../domain/terapkanSurut.js';

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

type Kirim = (
  aksi: string, data: unknown, sukses: string,
) => Promise<Record<string, unknown> | null>;

export function Katalog({
  bekal, kirim, sibuk,
}: {
  bekal: BekalAdmin;
  kirim: Kirim;
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

type Job = BekalAdmin['job'][number];
type Suntingan = { bp: string; ph: string; nama: string; aktif: boolean };

function awal(j: Job): Suntingan {
  return {
    bp: String(j.basePoints), ph: String(j.planHours), nama: j.nama, aktif: j.aktif,
  };
}

function TabelJob({
  bekal, section, kirim, sibuk,
}: {
  bekal: BekalAdmin; section: string; kirim: Kirim; sibuk: boolean;
}) {
  const [cari, setCari] = useState('');
  const [ubah, setUbah] = useState<Record<number, Suntingan>>({});
  const [tambah, setTambah] = useState(false);
  const [surut, setSurut] = useState<{ job: Job; bp: number; ph: number } | null>(null);

  const picker = bekal.bentukSection.find((b) => b.code === section)?.picker ?? 'cascade';
  const milik = bekal.job.filter((j) => j.section === section);
  const hasil = milik.filter((j) =>
    !cari.trim()
    || j.kode.toLowerCase().includes(cari.toLowerCase())
    || j.nama.toLowerCase().includes(cari.toLowerCase()));

  const tombolTambah = (
    <button className="btn-primary btn-sm" disabled={sibuk} onClick={() => setTambah(true)}>
      + Tambah job
    </button>
  );

  const modal = (
    <>
      {tambah && (
        <ModalJobBaru
          bekal={bekal} section={section} picker={picker} sibuk={sibuk}
          onTutup={() => setTambah(false)}
          onSimpan={async (f) => {
            const h = await kirim('admin_job', {
              sectionCode: section, kode: f.kode, nama: f.nama,
              unitModel: f.model || null, komponen: f.komponen || null,
              subKomponen: f.subKomponen || null,
              basePoints: Number(f.bp), planHours: Number(f.ph), aktif: true,
            }, `Job ${f.kode} ditambahkan ke section ${section}.`);
            if (h) setTambah(false);
          }}
        />
      )}
      {surut && (
        <ModalSurut
          job={surut.job} bp={surut.bp} ph={surut.ph} sibuk={sibuk}
          onTutup={() => setSurut(null)}
          onTerapkan={async (p) => {
            const h = await kirim('terapkan_surut', {
              jobId: surut.job.id, basePointBaru: surut.bp, planHoursBaru: surut.ph,
              rupiahSesudahDilihat: p.rupiahSesudah,
            }, `${surut.job.kode}: ${p.terpengaruh} WO dihitung ulang — `
             + `${rupiah(p.rupiahSekarang)} → ${rupiah(p.rupiahSesudah)}.`);
            if (h) {
              setSurut(null);
              setUbah((v) => { const s = { ...v }; delete s[surut.job.id]; return s; });
            }
          }}
        />
      )}
    </>
  );

  if (milik.length === 0) {
    return (
      <>
        <div className="hampa">
          <b>Belum ada job untuk section {section}</b>
          <div className="hampa-ket">
            Unduh templatnya di atas, isi di Excel, lalu unggah — katalog KMB V2
            berisi ribuan baris dan memang tidak untuk diketik satu per satu.
            Untuk menambah <b>satu</b> pekerjaan, pakai tombol di bawah.
          </div>
          <div style={{ marginTop: '0.7rem' }}>{tombolTambah}</div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="admin-kepala">
        <div className="panel-judul">{milik.length} job di section {section}</div>
        <div className="admin-kepala-aksi">
          <input className="form-control" style={{ maxWidth: 260 }} value={cari}
                 onChange={(e) => setCari(e.target.value)} placeholder="🔍 Cari kode / nama job…" />
          {tombolTambah}
        </div>
      </div>

      {/* Dua kalimat yang menentukan cara orang memakai tabel ini. Tanpa
          keduanya, "Simpan" terlihat seperti tidak bekerja (WO lama tak
          bergerak) dan mengganti nama terasa menakutkan padahal aman. */}
      <div className="kabar kabar-info">
        <b>Mengganti nama pekerjaan aman.</b> WO menyimpan nomor jobnya, bukan
        tulisan namanya — nama baru langsung terbaca di semua WO lama tanpa
        menggeser poin atau rupiah siapa pun.{' '}
        <b>Mengubah angka hanya berlaku untuk WO baru</b>, karena WO yang sudah
        disetujui angkanya dibekukan. Untuk membawanya mundur, ada tombol
        terpisah di tiap baris.
      </div>

      <div className="tabel-gulir">
        <table className="table tabel-admin">
          <thead>
            <tr>
              <th>Kode</th><th>Pekerjaan</th>
              <th className="num">Base point</th><th className="num">Jam rencana</th>
              <th className="num">WO approved</th><th>Aktif</th><th></th>
            </tr>
          </thead>
          <tbody>
            {hasil.slice(0, 200).map((j) => {
              const d = ubah[j.id] ?? awal(j);
              const berubah = Number(d.bp) !== j.basePoints || Number(d.ph) !== j.planHours
                || d.nama.trim() !== j.nama || d.aktif !== j.aktif;
              const sah = Number(d.bp) > 0 && Number(d.ph) > 0 && d.nama.trim().length >= 3;
              const set = (b: Partial<Suntingan>) =>
                setUbah({ ...ubah, [j.id]: { ...d, ...b } });
              return (
                <tr key={j.id} className={j.aktif ? '' : 'nonaktif'}>
                  <td className="kode-sel">
                    {j.kode}
                    {j.komponen && (
                      <span className="cabang-ket">
                        {j.unitModel} · {j.komponen} · {j.subKomponen}
                      </span>
                    )}
                  </td>
                  <td>
                    <input className="sel-teks" value={d.nama}
                           onChange={(e) => set({ nama: e.target.value })} />
                  </td>
                  <td className="num">
                    <input className="sel-angka" type="number" step="any" value={d.bp}
                           onChange={(e) => set({ bp: e.target.value })} />
                  </td>
                  <td className="num">
                    <input className="sel-angka" type="number" step="any" value={d.ph}
                           onChange={(e) => set({ ph: e.target.value })} />
                  </td>
                  <td className="num">{j.woApproved || <i className="ro-kosong">–</i>}</td>
                  <td>
                    {/* Bisa dimatikan, tidak bisa dihapus — sama seperti orang.
                        Job yang pernah dipakai WO tak boleh lenyap, tapi job yang
                        terlanjur salah ditambah harus bisa disingkirkan dari
                        joblist tanpa menunggu impor Excel. */}
                    <label className="pilih-baris">
                      <input type="checkbox" checked={d.aktif}
                             onChange={(e) => set({ aktif: e.target.checked })} />
                      <span>{d.aktif ? 'ya' : 'tidak'}</span>
                    </label>
                  </td>
                  <td className="aksi-sel">
                    <button
                      className="btn-primary btn-sm"
                      disabled={sibuk || !sah || !berubah}
                      onClick={async () => {
                        const h = await kirim('admin_job', {
                          jobId: j.id, nama: d.nama.trim(),
                          basePoints: Number(d.bp), planHours: Number(d.ph),
                          aktif: d.aktif,
                        }, `${j.kode} tersimpan — berlaku untuk WO baru.`);
                        if (h) setUbah((v) => { const s = { ...v }; delete s[j.id]; return s; });
                      }}
                    >Simpan</button>
                    {/* Tombol kedua, SENGAJA terpisah dan berwarna lain. Ia
                        menggeser rupiah yang sudah dibayar; ia tidak boleh
                        terlihat seperti saudara kembar "Simpan".

                        TIDAK disyaratkan "ada perubahan yang belum disimpan":
                        yang dibandingkannya adalah katalog dengan SNAPSHOT WO,
                        bukan kotak isian dengan katalog. Kalau syaratnya itu,
                        orang yang menekan Simpan lebih dulu lalu berubah pikiran
                        akan menemukan tombol ini mati selamanya tanpa sebab yang
                        bisa ia lihat. */}
                    <button
                      className="btn-danger btn-sm"
                      disabled={sibuk || !sah || j.woApproved === 0}
                      title={j.woApproved === 0
                        ? 'Belum ada WO approved yang memakai job ini'
                        : `Hitung ulang ${j.woApproved} WO yang sudah disetujui`}
                      onClick={() => setSurut({ job: j, bp: Number(d.bp), ph: Number(d.ph) })}
                    >Terapkan ke semua WO</button>
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
      {modal}
    </>
  );
}

/* ── Job baru, satu per satu ──────────────────────────────────────────────── */

interface FormJobBaru {
  kode: string; nama: string; bp: string; ph: string;
  model: string; komponen: string; subKomponen: string;
}

function ModalJobBaru({
  bekal, section, picker, sibuk, onTutup, onSimpan,
}: {
  bekal: BekalAdmin; section: string; picker: string; sibuk: boolean;
  onTutup: () => void; onSimpan: (f: FormJobBaru) => void;
}) {
  const [f, setF] = useState<FormJobBaru>({
    kode: '', nama: '', bp: '', ph: '', model: '', komponen: '', subKomponen: '',
  });
  const ubah = (b: Partial<FormJobBaru>) => setF({ ...f, ...b });
  const cascade = picker === 'cascade';

  const cabang = useMemo(
    () => bekal.cabang.filter((c) => c.section === section),
    [bekal.cabang, section],
  );
  const model = useMemo(() => beda(cabang.map((c) => c.model)), [cabang]);
  const komponen = useMemo(
    () => beda(cabang.filter((c) => c.model === f.model).map((c) => c.komponen)),
    [cabang, f.model],
  );
  const sub = useMemo(
    () => beda(cabang
      .filter((c) => c.model === f.model && c.komponen === f.komponen)
      .map((c) => c.subKomponen)),
    [cabang, f.model, f.komponen],
  );

  const kodeBentrok = bekal.job.some(
    (j) => j.section === section && j.kode.toLowerCase() === f.kode.trim().toLowerCase(),
  );
  const cabangLengkap = !cascade
    || (f.model.trim() !== '' && f.komponen.trim() !== '' && f.subKomponen.trim() !== '');
  const bolehSimpan = f.kode.trim().length >= 2 && f.nama.trim().length >= 3
    && Number(f.bp) > 0 && Number(f.ph) > 0 && cabangLengkap && !kodeBentrok;

  return (
    <Portal>
      <div className="modal-tirai">
        <div className="modal modal-lebar">
          <div className="modal-header">
            <h3>Tambah job — section {section}</h3>
            <button className="modal-tutup" onClick={onTutup}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="jb-kode">
                  Kode job <span className="wajib">*</span>
                </label>
                <input id="jb-kode" value={f.kode} onChange={(e) => ubah({ kode: e.target.value })}
                       placeholder="cth: JOB-9001" />
                {/* Kode unik PER SECTION. Di KMB V2, 162 kode memang dipakai di
                    field DAN workshop untuk pekerjaan yang berbeda. */}
                {kodeBentrok
                  ? <p className="form-hint salah">Kode ini sudah dipakai di section {section}.</p>
                  : <p className="form-hint">Cukup unik di section ini saja.</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="jb-nama">
                  Nama pekerjaan <span className="wajib">*</span>
                </label>
                <input id="jb-nama" value={f.nama} onChange={(e) => ubah({ nama: e.target.value })}
                       placeholder="cth: Remove & Install Final Drive" />
              </div>
            </div>

            {cascade && (
              <>
                <div className="form-row">
                  <PilihAtauKetik
                    id="jb-model" label="Model unit" pilihan={model} nilai={f.model}
                    onUbah={(v) => ubah({ model: v, komponen: '', subKomponen: '' })}
                  />
                  <PilihAtauKetik
                    id="jb-komp" label="Komponen" pilihan={komponen} nilai={f.komponen}
                    onUbah={(v) => ubah({ komponen: v, subKomponen: '' })}
                  />
                </div>
                <div className="form-row">
                  <PilihAtauKetik
                    id="jb-sub" label="Sub-komponen" pilihan={sub} nilai={f.subKomponen}
                    onUbah={(v) => ubah({ subKomponen: v })}
                  />
                  <div className="form-group" />
                </div>
                <p className="form-hint">
                  Section <b>{section}</b> memilih job lewat Model → Komponen →
                  Sub-komponen. Ketiganya <b>wajib</b>: job tanpa cabang tersimpan
                  rapi tapi tidak akan pernah muncul di layar buat WO. Nama yang
                  belum ada akan dibuat sebagai cabang baru.
                </p>
              </>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="jb-bp">
                  Base point <span className="wajib">*</span>
                </label>
                <input id="jb-bp" type="number" step="any" value={f.bp}
                       onChange={(e) => ubah({ bp: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="jb-ph">
                  Jam rencana <span className="wajib">*</span>
                </label>
                <input id="jb-ph" type="number" step="any" value={f.ph}
                       onChange={(e) => ubah({ ph: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onTutup} disabled={sibuk}>Batal</button>
            <button className="btn-primary" disabled={sibuk || !bolehSimpan}
                    onClick={() => onSimpan(f)}>
              {sibuk ? 'Menyimpan…' : 'Tambah job'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * Daftar pilihan yang SEKALIGUS bisa diketik.
 *
 * `<datalist>` dipilih daripada dropdown + tombol "baru": cabang yang sudah ada
 * harus dipilih dengan ejaan yang persis sama (layar buat-WO menyaring dengan
 * mencocokkan nama), tapi cabang baru memang kadang perlu dibuat. Satu kotak
 * melakukan keduanya tanpa memaksa orang memutuskan lebih dulu yang mana.
 */
function PilihAtauKetik({
  id, label, pilihan, nilai, onUbah,
}: {
  id: string; label: string; pilihan: string[]; nilai: string; onUbah: (v: string) => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label} <span className="wajib">*</span></label>
      <input id={id} list={`${id}-opsi`} value={nilai} onChange={(e) => onUbah(e.target.value)}
             placeholder={pilihan.length ? `${pilihan.length} pilihan…` : 'ketik nama baru'} />
      <datalist id={`${id}-opsi`}>
        {pilihan.map((p) => <option key={p} value={p} />)}
      </datalist>
    </div>
  );
}

function beda(v: string[]): string[] {
  return [...new Set(v.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/* ── Terapkan ke semua WO ─────────────────────────────────────────────────── */

/**
 * Yang membuat layar ini layak ada bukan tombolnya, melainkan ANGKA DI ATASNYA.
 *
 * "127 WO akan dihitung ulang" tidak memberi tahu siapa pun apa yang akan
 * terjadi. Yang perlu dibaca sebelum menekan adalah: berapa rupiah sekarang,
 * jadi berapa, selisihnya berapa, dan periode gaji MANA saja yang bergeser —
 * karena sebagian dari periode itu slipnya sudah keluar.
 *
 * Pratinjau diambil dari server, bukan dihitung di sini. Kalau layar punya
 * rumusnya sendiri, suatu hari ia akan menjanjikan satu angka dan basis data
 * menuliskan angka lain.
 */
function ModalSurut({
  job, bp, ph, sibuk, onTutup, onTerapkan,
}: {
  job: Job; bp: number; ph: number; sibuk: boolean;
  onTutup: () => void; onTerapkan: (p: PratinjauSurut) => void;
}) {
  const [p, setP] = useState<PratinjauSurut | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [paham, setPaham] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/data?jenis=pratinjau_surut&job_id=${job.id}`
          + `&base_points=${bp}&plan_hours=${ph}`,
        );
        const j = await r.json();
        if (!hidup) return;
        if (j.ok) setP(j.data as PratinjauSurut);
        else setGalat(j.pesan ?? 'Gagal menghitung pratinjau');
      } catch {
        if (hidup) setGalat('Sambungan terputus saat menghitung pratinjau.');
      }
    })();
    return () => { hidup = false; };
  }, [job.id, bp, ph]);

  const selisih = p ? p.rupiahSesudah - p.rupiahSekarang : 0;
  const naik = selisih > 0;
  /* Yang menentukan "ada yang berubah" adalah POINnya, bukan rupiahnya.
     Perubahan base point yang sangat kecil bisa menghasilkan rupiah yang sama
     setelah dibulatkan ke rupiah penuh — dan snapshot tetap perlu ditulis
     supaya angka di katalog dan di WO tidak berselisih diam-diam. */
  const adaGeser = !!p && p.baris.some((b) => b.finalBaru !== b.finalLama);

  return (
    <Portal>
      <div className="modal-tirai">
        <div className="modal modal-lebar">
          <div className="modal-header">
            <h3>Terapkan ke semua WO — {job.kode}</h3>
            <button className="modal-tutup" onClick={onTutup}>✕</button>
          </div>
          <div className="modal-body">
            <div className="surut-judul">{job.nama}</div>
            <div className="surut-angka">
              <span>Base point <b>{job.basePoints}</b> → <b>{bp}</b></span>
              <span>Jam rencana <b>{job.planHours}</b> → <b>{ph}</b></span>
            </div>

            {galat && <div className="kabar kabar-salah">{galat}</div>}
            {!p && !galat && <div className="hampa">Menghitung dampaknya…</div>}

            {p && (
              <>
                <div className="stat-row">
                  <div className="stat"><div className="stat-num">{p.terpengaruh}</div>
                    <div className="stat-label">WO dihitung ulang</div></div>
                  <div className="stat"><div className="stat-num">{p.orang}</div>
                    <div className="stat-label">baris bayaran</div></div>
                  <div className="stat"><div className="stat-num">{p.dilewatiOverride}</div>
                    <div className="stat-label">dilewati (override)</div></div>
                  <div className="stat"><div className="stat-num">{p.statusBergeser}</div>
                    <div className="stat-label">ketepatan bergeser</div></div>
                </div>

                <div className={`surut-uang ${naik ? 'naik' : 'turun'}`}>
                  <div className="surut-uang-baris">
                    <span>Sekarang terbayar</span><b>{rupiah(p.rupiahSekarang)}</b>
                  </div>
                  <div className="surut-uang-baris">
                    <span>Sesudah diterapkan</span><b>{rupiah(p.rupiahSesudah)}</b>
                  </div>
                  <div className="surut-uang-baris selisih">
                    <span>Selisih</span>
                    <b>{naik ? '+' : ''}{rupiah(selisih)}</b>
                  </div>
                </div>

                {p.dilewatiOverride > 0 && (
                  <div className="kabar kabar-info">
                    <b>{p.dilewatiOverride} WO tidak disentuh</b> karena approver
                    pernah menyentuh base point atau jam rencananya sendiri. Itu
                    penilaian orang yang melihat pekerjaannya langsung — angka
                    katalog tidak menimpanya.
                  </div>
                )}

                {p.statusBergeser > 0 && (
                  <div className="kabar kabar-awas">
                    Jam rencana yang baru menggeser status ketepatan waktu{' '}
                    <b>{p.statusBergeser} WO</b> (mis. on time → late). Faktor untuk
                    status barunya diambil dari tabel Faktor <b>hari ini</b>, karena
                    snapshot hanya membekukan faktor untuk status yang dulu berlaku.
                  </div>
                )}

                {p.periode.length > 0 && (
                  <>
                    <div className="panel-judul" style={{ marginTop: '0.8rem' }}>
                      Periode gaji yang ikut bergeser
                    </div>
                    <div className="tabel-gulir">
                      <table className="table tabel-admin">
                        <thead>
                          <tr>
                            <th>Periode</th><th className="num">WO</th>
                            <th className="num">Sekarang</th><th className="num">Jadi</th>
                            <th className="num">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.periode.map((x) => {
                            const d = x.rupiahSesudah - x.rupiahSekarang;
                            return (
                              <tr key={x.kunci}>
                                <td>{x.label}</td>
                                <td className="num">{x.wo}</td>
                                <td className="num riwayat-lama">{rupiah(x.rupiahSekarang)}</td>
                                <td className="num riwayat-baru">{rupiah(x.rupiahSesudah)}</td>
                                <td className={`num ${d >= 0 ? 'riwayat-baru' : 'riwayat-lama'}`}>
                                  {d > 0 ? '+' : ''}{rupiah(d)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {p.terpengaruh === 0 && (
                  <div className="kabar kabar-info">
                    Tidak ada WO yang bisa dihitung ulang
                    {p.dilewatiOverride > 0
                      ? ' — semuanya angkanya pernah ditetapkan approver sendiri.'
                      : '.'}{' '}
                    Simpan saja lewat tombol biasa; ia berlaku untuk WO berikutnya.
                  </div>
                )}

                {p.terpengaruh > 0 && !adaGeser && (
                  <div className="kabar kabar-info">
                    <b>Tidak ada yang bergeser.</b> WO lama memang sudah dihitung
                    dengan angka ini. Tidak ada yang perlu diterapkan.
                  </div>
                )}

                {p.terpengaruh > 0 && adaGeser && (
                  <label className="pilih-baris surut-paham">
                    <input type="checkbox" checked={paham}
                           onChange={(e) => setPaham(e.target.checked)} />
                    <span>
                      Saya mengerti ini mengubah gaji periode yang <b>slipnya sudah
                      keluar</b>, sebesar {naik ? '+' : ''}{rupiah(selisih)}.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onTutup} disabled={sibuk}>Batal</button>
            <button
              className="btn-danger"
              disabled={sibuk || !p || !paham || p.terpengaruh === 0 || !adaGeser}
              onClick={() => p && onTerapkan(p)}
            >
              {sibuk ? 'Menerapkan…' : `Terapkan ke ${p?.terpengaruh ?? 0} WO`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
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
