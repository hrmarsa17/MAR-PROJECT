'use client';

import { useEffect, useMemo, useState } from 'react';

interface Section { code: string; name: string; picker_style: string; requires_unit: boolean }
interface Unit { id: number; unit_code: string; unit_name: string; unit_model: string | null; section: string | null }
interface Job {
  id: number; job_code: string; section: string; unit_model: string | null;
  component: string | null; sub_component: string | null;
  job_description: string; plan_hours: string; base_points: string | null;
}
interface Mekanik { id: number; name: string; role: string; sections: string[]; jabatan: string | null }
interface Katalog { sections: Section[]; units: Unit[]; jobs: Job[]; mekanik: Mekanik[] }

/** Nilai berbeda saja, urut, tanpa yang kosong. */
function beda(nilai: (string | null)[]): string[] {
  return [...new Set(nilai.filter((v): v is string => !!v))].sort();
}

export function FormWo({ bolehManual }: { bolehManual: boolean }) {
  const [kat, setKat] = useState<Katalog | null>(null);
  const [muatGagal, setMuatGagal] = useState<string | null>(null);

  const [section, setSection] = useState('');
  const [unitId, setUnitId] = useState('');
  const [model, setModel] = useState('');
  const [komponen, setKomponen] = useState('');
  const [subKomponen, setSubKomponen] = useState('');
  const [jobId, setJobId] = useState('');
  const [tim, setTim] = useState<number[]>([]);
  const [semuaSection, setSemuaSection] = useState(false);
  const [kondisi, setKondisi] = useState('normal');
  const [lokasi, setLokasi] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<{ baik: boolean; teks: string } | null>(null);

  useEffect(() => {
    fetch('/api/data?jenis=katalog')
      .then((r) => r.json())
      .then((j) => {
        // Kegagalan TIDAK diringkas jadi daftar kosong — layar kosong yang
        // tampak normal lebih berbahaya daripada pesan galat.
        if (!j.ok) throw new Error(j.pesan ?? 'Gagal memuat katalog');
        setKat(j.data);
      })
      .catch((e: Error) => setMuatGagal(e.message));
  }, []);

  const sec = kat?.sections.find((s) => s.code === section) ?? null;

  const unitTersedia = useMemo(() => {
    if (!kat || !sec) return [];
    // Unit tanpa section (belum punya model) ikut tampil — perilaku KMB V2:
    // kosong berarti milik semua section.
    return kat.units.filter((u) => u.section === null || u.section === section);
  }, [kat, sec, section]);

  const modelTerpilih = useMemo(() => {
    if (!sec) return '';
    if (!sec.requires_unit) return model;
    const u = kat?.units.find((x) => String(x.id) === unitId);
    return u?.unit_model ?? '';
  }, [sec, model, kat, unitId]);

  const jobSection = useMemo(
    () => kat?.jobs.filter((j) => j.section === section) ?? [],
    [kat, section],
  );

  const datar = sec?.picker_style === 'flat';

  const jobCocokModel = useMemo(
    () => (datar ? jobSection : jobSection.filter((j) => j.unit_model === modelTerpilih)),
    [datar, jobSection, modelTerpilih],
  );

  const daftarKomponen = useMemo(
    () => beda(jobCocokModel.map((j) => j.component)),
    [jobCocokModel],
  );
  const daftarSub = useMemo(
    () => beda(jobCocokModel.filter((j) => j.component === komponen).map((j) => j.sub_component)),
    [jobCocokModel, komponen],
  );
  const daftarJob = useMemo(
    () =>
      datar
        ? jobCocokModel
        : jobCocokModel.filter(
            (j) => j.component === komponen && j.sub_component === subKomponen,
          ),
    [datar, jobCocokModel, komponen, subKomponen],
  );

  // Penyaringan mekanik per section. Mekanik TANPA section selalu tampil —
  // kosong berarti milik semua section, sama seperti KMB V2. Dulu daftar ini
  // dibandingkan sebagai satu string utuh, sehingga orang ber-section ganda
  // ("tyreman,field") tidak pernah cocok dan dropdown-nya kosong.
  const mekanikTersedia = useMemo(() => {
    if (!kat) return [];
    if (semuaSection || !section) return kat.mekanik;
    return kat.mekanik.filter(
      (m) => m.sections.length === 0 || m.sections.includes(section),
    );
  }, [kat, section, semuaSection]);

  // Mengganti tingkat atas mengosongkan yang di bawahnya. Tanpa ini, pilihan
  // lama tertinggal dan WO bisa terkirim dengan job dari unit yang berbeda.
  function gantiSection(v: string) {
    setSection(v); setUnitId(''); setModel('');
    setKomponen(''); setSubKomponen(''); setJobId('');
  }
  function gantiUnit(v: string) {
    setUnitId(v); setKomponen(''); setSubKomponen(''); setJobId('');
  }
  function gantiModel(v: string) {
    setModel(v); setKomponen(''); setSubKomponen(''); setJobId('');
  }
  function gantiKomponen(v: string) {
    setKomponen(v); setSubKomponen(''); setJobId('');
  }

  const jobDipilih = daftarJob.find((j) => String(j.id) === jobId) ?? null;
  const timTerisi = tim.filter((x) => x > 0);
  const siap =
    !!section && timTerisi.length > 0 && !!jobId && (!sec?.requires_unit || !!unitId);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!siap) return;
    setSibuk(true);
    setKabar(null);

    const opId = crypto.randomUUID();
    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'buat_wo',
          op_id: opId,
          data: {
            sectionCode: section,
            blok: [{
              jobId: Number(jobId),
              ...(unitId ? { unitId: Number(unitId) } : {}),
              workCondition: kondisi,
              ...(lokasi ? { location: lokasi } : {}),
              ...(keterangan ? { keterangan } : {}),
              teamMechanicIds: timTerisi,
            }],
          },
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setKabar({ baik: false, teks: j.pesan ?? 'Gagal membuat WO' });
        setSibuk(false);
        return;
      }
      const wo = j.data.hasil.dibuat[0];
      setKabar({ baik: true, teks: `${wo.woNumber} dibuat.` });
      setJobId(''); setKomponen(''); setSubKomponen(''); setKeterangan('');
      setSibuk(false);
    } catch {
      // Putus di jalan TIDAK berarti gagal — server mungkin sudah menulisnya.
      // Karena op_id sudah lahir, menekan kirim lagi aman: server mengenali
      // permintaan yang sama dan tidak membuat WO kedua.
      setKabar({
        baik: false,
        teks: 'Sambungan terputus. WO mungkin sudah masuk — muat ulang daftar sebelum membuat lagi.',
      });
      setSibuk(false);
    }
  }

  if (muatGagal) return <div className="kabar kabar-salah">Gagal memuat katalog: {muatGagal}</div>;
  if (!kat) return <div className="kosong">Memuat katalog…</div>;

  return (
    <form className="card" onSubmit={kirim}>
      <div className="form-group">
        <label className="form-label">Section</label>
        <div className="pilihan-grid">
          {kat.sections.map((s) => (
            <button
              type="button"
              key={s.code}
              className={section === s.code ? 'pilihan terpilih' : 'pilihan'}
              onClick={() => gantiSection(s.code)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {sec && (
        <>
          <div className="form-row">
            {sec.requires_unit ? (
              <div className="form-group">
                <label className="form-label" htmlFor="unit">Unit</label>
                <select id="unit" value={unitId} onChange={(e) => gantiUnit(e.target.value)}>
                  <option value="">— pilih unit —</option>
                  {unitTersedia.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_name}
                      {u.unit_model ? ` · ${u.unit_model}` : ' · belum punya joblist'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="model">Jenis pekerjaan</label>
                <select id="model" value={model} onChange={(e) => gantiModel(e.target.value)}>
                  <option value="">— pilih —</option>
                  {beda(jobSection.map((j) => j.unit_model)).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="kondisi">Kondisi kerja</label>
              <select id="kondisi" value={kondisi} onChange={(e) => setKondisi(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="difficult">Menyulitkan</option>
                <option value="extreme">Ekstrem</option>
              </select>
            </div>
          </div>

          {!datar && modelTerpilih && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="komp">Komponen</label>
                <select id="komp" value={komponen} onChange={(e) => gantiKomponen(e.target.value)}>
                  <option value="">— pilih —</option>
                  {daftarKomponen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sub">Sub komponen</label>
                <select
                  id="sub" value={subKomponen} disabled={!komponen}
                  onChange={(e) => { setSubKomponen(e.target.value); setJobId(''); }}
                >
                  <option value="">— pilih —</option>
                  {daftarSub.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {(datar || subKomponen) && (
            <div className="form-group">
              <label className="form-label" htmlFor="job">Pekerjaan</label>
              <select id="job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">— pilih pekerjaan —</option>
                {daftarJob.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_description} · target {Number(j.plan_hours).toFixed(1)} jam
                  </option>
                ))}
              </select>
              {daftarJob.length === 0 && (
                <p className="form-hint" style={{ marginTop: 6 }}>
                  Tidak ada pekerjaan untuk pilihan ini.
                </p>
              )}
            </div>
          )}

          {/* Team Composition — bentuknya diambil dari WorkOrder.html:1152-1162.
              Deretan baris, tiap baris satu dropdown + tombol hapus merah, lalu
              "+ Add Team Member" dan toggle "tampilkan semua section".

              Dropdown, bukan tombol: mekaniknya puluhan. */}
          <div className="form-group">
            <label className="form-label">
              Team Composition <span className="wajib">*</span>{' '}
              <span className="form-hint" style={{ display: 'inline', fontWeight: 400 }}>
                (tiap mekanik dapat poin penuh)
              </span>
            </label>

            <div className="team-members">
              {tim.map((idAnggota, i) => (
                <div className="team-member-row" key={i}>
                  <select
                    className="mechanic-select"
                    value={idAnggota === 0 ? '' : String(idAnggota)}
                    onChange={(e) => {
                      const baru = [...tim];
                      baru[i] = Number(e.target.value || 0);
                      setTim(baru);
                    }}
                  >
                    <option value="">-- Select Mechanic --</option>
                    {mekanikTersedia.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        // Orang yang sudah dipilih di baris lain disembunyikan,
                        // supaya tidak bisa masuk tim dua kali.
                        disabled={tim.includes(m.id) && tim[i] !== m.id}
                      >
                        {m.name}{m.jabatan ? ` — ${m.jabatan}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-reject btn-ikon"
                    title="Hapus anggota"
                    onClick={() => setTim(tim.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
            </div>

            <div className="pilihan-grid" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                style={{ flex: '0 0 auto' }}
                onClick={() => setTim([...tim, 0])}
              >+ Add Team Member</button>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: 400, fontSize: '0.8125rem', margin: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={semuaSection}
                  onChange={(e) => setSemuaSection(e.target.checked)}
                  style={{ width: 'auto', minHeight: 0 }}
                />
                🔓 Tampilkan mekanik semua section
              </label>
            </div>

            <p className="form-hint" style={{ marginTop: 6 }}>
              Setiap anggota menerima poin <b>penuh</b>, bukan dibagi — menambah orang
              menambah pengeluaran.
            </p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="lokasi">Lokasi</label>
              <input id="lokasi" value={lokasi} onChange={(e) => setLokasi(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ket">Keterangan</label>
              <input id="ket" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
            </div>
          </div>

          {jobDipilih && (
            <div className="kabar bentrok" style={{ background: 'transparent', border: '1px solid var(--garis)', color: 'var(--redup)' }}>
              {jobDipilih.job_description} · target {Number(jobDipilih.plan_hours).toFixed(1)} jam
              {jobDipilih.base_points !== null && <> · base {Number(jobDipilih.base_points).toFixed(2)} poin</>}
              {' · '}{timTerisi.length} mekanik
            </div>
          )}

          {kabar && <div className={`kabar ${kabar.baik ? "kabar-benar" : "kabar-salah"}`}>{kabar.teks}</div>}

          <button className="utama" disabled={!siap || sibuk}>
            {sibuk ? 'Mengirim…' : 'Buat WO'}
          </button>
          {bolehManual && (
            <p className="form-hint" style={{ marginTop: 10 }}>
              Pekerjaan di luar katalog belum tersedia di layar ini.
            </p>
          )}
        </>
      )}
    </form>
  );
}
