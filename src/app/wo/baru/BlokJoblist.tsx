'use client';

import { useMemo } from 'react';
import {
  beda, laciUntuk, meterUntuk,
  type Blok, type Katalog, type Job, type Unit,
} from './jenis.js';
import { durasiJam } from '../../../lib/format.js';

/**
 * Satu blok joblist — bentuknya diambil dari `buildBlockHtml()`
 * (`WorkOrder.html:988-1163`), bukan dari tampilan layar.
 *
 * Urutan elemennya sengaja sama persis dengan sumber: header · Section ·
 * HM/KM · Keterangan · checkbox Others · cascade · joblist datar · isian manual ·
 * Location + Work Condition · Preview · Team Composition.
 */
export function BlokJoblist({
  blok, nomor, total, kat, bolehManual, bolehLihatPoin,
  terkunciUnit, terkunciJob, terkunciSection, tampilSemuaUnit,
  ubah, hapus,
}: {
  blok: Blok;
  nomor: number;
  total: number;
  kat: Katalog;
  bolehManual: boolean;
  bolehLihatPoin: boolean;
  terkunciUnit: boolean;
  terkunciJob: boolean;
  terkunciSection: boolean;
  tampilSemuaUnit: boolean;
  ubah: (tambalan: Partial<Blok>) => void;
  hapus: () => void;
}) {
  const sec = kat.sections.find((s) => s.code === blok.section) ?? null;
  const datar = sec?.picker_style === 'flat';
  const butuhUnit = sec?.requires_unit ?? true;
  const M = meterUntuk(blok.section);

  /**
   * Dropdown unit dibagi EMPAT laci, sama seperti KMB V2.
   *
   * Yang tidak boleh diulang: sampai 16 Sep 2026 penyaringnya memakai section
   * MODEL unit, bukan section yang berhak memilihnya. Model Hauler milik field,
   * padahal 35 Hauler adalah pegangan tyreman — jadi tyreman melihat 6 unit dari
   * 50 miliknya, dan sisanya hanya muncul lewat tombol yang tak ada alasan ia
   * tekan.
   *
   * "Unit section lain" TIDAK disembunyikan, juga seperti V2: field sesekali
   * memang membantu unit tyreman, dan menyembunyikannya membuat orang mengira
   * unitnya hilang dari katalog. Yang disembunyikan hanya unit SEWA.
   */
  const laci = useMemo(() => {
    const kosong = { utama: [] as Unit[], lain: [] as Unit[], global: [] as Unit[], semu: [] as Unit[] };
    if (!sec) return kosong;
    for (const u of kat.units) kosong[laciUntuk(u, blok.section)].push(u);
    return kosong;
  }, [kat.units, sec, blok.section]);

  const grupUnit = useMemo(() => {
    const g: { label: string; unit: Unit[] }[] = [
      { label: `★ Unit ${sec?.name ?? blok.section}`, unit: laci.utama },
      { label: 'Unit section lain', unit: laci.lain },
    ];
    if (tampilSemuaUnit) {
      g.push({ label: '🌐 Global — bukan pegangan harian', unit: laci.global });
    }
    /* Unit semu bukan alat: memilihnya adalah cara V2 mengatakan "job manual".
       Ia hanya ditawarkan kepada yang memang boleh membuat job manual — server
       menolaknya untuk yang lain, dan menawarkan pilihan yang pasti ditolak
       adalah jebakan, bukan kelengkapan. */
    if (bolehManual && laci.semu.length > 0) {
      g.push({ label: '📝 Job manual', unit: laci.semu });
    }
    return g.filter((x) => x.unit.length > 0);
  }, [laci, sec, blok.section, tampilSemuaUnit, bolehManual]);

  const jobSection = useMemo(
    () => kat.jobs.filter((j) => j.section === blok.section),
    [kat, blok.section],
  );

  const modelTerpilih = useMemo(() => {
    if (!sec) return '';
    if (!butuhUnit) return blok.model;
    return kat.units.find((u) => String(u.id) === blok.unitId)?.unit_model ?? '';
  }, [sec, butuhUnit, blok.model, blok.unitId, kat.units]);

  const jobCocok = useMemo(
    () => (datar ? jobSection : jobSection.filter((j) => j.unit_model === modelTerpilih)),
    [datar, jobSection, modelTerpilih],
  );
  const daftarKomponen = useMemo(() => beda(jobCocok.map((j) => j.component)), [jobCocok]);
  const daftarSub = useMemo(
    () => beda(jobCocok.filter((j) => j.component === blok.komponen).map((j) => j.sub_component)),
    [jobCocok, blok.komponen],
  );
  const daftarJob = useMemo(
    () => (datar
      ? jobCocok
      : jobCocok.filter((j) => j.component === blok.komponen && j.sub_component === blok.subKomponen)),
    [datar, jobCocok, blok.komponen, blok.subKomponen],
  );

  const mekanikTersedia = useMemo(() => {
    if (blok.semuaMekanik || !blok.section) return kat.mekanik;
    // Mekanik TANPA section selalu tampil — kosong berarti milik semua section.
    return kat.mekanik.filter(
      (m) => m.sections.length === 0 || m.sections.includes(blok.section),
    );
  }, [kat.mekanik, blok.section, blok.semuaMekanik]);

  const unitDipilih = kat.units.find((u) => String(u.id) === blok.unitId) ?? null;
  const jobDipilih = daftarJob.find((j) => String(j.id) === blok.jobId) ?? null;
  const pratinjau = hitungPratinjau(blok, sec, jobDipilih, unitDipilih, kat);

  /* Mengganti tingkat atas mengosongkan yang di bawahnya. Tanpa ini, pilihan
     lama tertinggal dan WO bisa terkirim dengan job dari unit yang berbeda. */
  const gantiSection = (v: string) =>
    ubah({
      section: v, unitId: '', model: '', komponen: '', subKomponen: '', jobId: '',
      others: false, othersDesc: '',
      // Location ikut section, tapi TETAP bisa diubah manual sesudahnya.
      lokasi: v === 'field' ? 'field' : 'workshop',
    });

  return (
    <div className="wo-blok">
      <div className="wo-blok-kepala">
        <span className="wo-blok-judul">Joblist #{nomor}</span>
        {/* Tombol hapus disembunyikan saat tinggal satu blok — menghapus yang
            terakhir tidak pernah diizinkan, jadi menawarkannya cuma mengundang
            pesan galat. */}
        {total > 1 && (
          <button type="button" className="wo-blok-hapus" title="Hapus joblist" onClick={hapus}>
            ×
          </button>
        )}
      </div>

      {blok.others && (
        <div className="others-spanduk">
          ⚠️ <b>Others Mode:</b> custom job — isi semua field manual.
        </div>
      )}

      {/* ── Section ──────────────────────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">Section <span className="wajib">*</span></label>
        <div className="pilihan-grid">
          {kat.sections.map((s) => (
            <button
              type="button"
              key={s.code}
              disabled={terkunciSection}
              className={blok.section === s.code ? 'pilihan terpilih' : 'pilihan'}
              onClick={() => gantiSection(s.code)}
            >
              {ikonSection(s.code)} {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── HM / KM ──────────────────────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">
          {M.label} Unit{' '}
          <span className="form-hint" style={{ display: 'inline', fontWeight: 400 }}>
            {M.petunjuk}
          </span>
        </label>
        <input
          type="number" step="any" min="0" inputMode="decimal"
          style={{ maxWidth: 220 }}
          placeholder={M.contoh}
          value={blok.meter}
          onChange={(e) => ubah({ meter: e.target.value })}
        />
        <KakiMeter blok={blok} kat={kat} />
      </div>

      {/* ── Keterangan ───────────────────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">
          Keterangan untuk Mekanik{' '}
          <span className="form-hint" style={{ display: 'inline', fontWeight: 400 }}>
            (opsional)
          </span>
        </label>
        <textarea
          rows={2}
          placeholder="cth: unit parkir di pit 3, koordinasi dgn operator dulu"
          value={blok.keterangan}
          onChange={(e) => ubah({ keterangan: e.target.value })}
        />
      </div>

      {/* ── Others ───────────────────────────────────────────────────────────
          Dirender HANYA untuk L1/L2. Di sana pembuat mengetik base_points &
          target_hours sendiri, dan itu jalur uang. Ini cuma menyembunyikan;
          penegakannya ada di server (`workOrder.ts` menolak manual dari
          peran mechanic). */}
      {bolehManual && (
        <label className="others-baris">
          <input
            type="checkbox"
            checked={blok.others}
            onChange={(e) =>
              ubah({ others: e.target.checked, jobId: '', komponen: '', subKomponen: '' })
            }
          />
          📝 Job manual (Others) — di luar katalog
        </label>
      )}

      {/* ── Cascade / joblist datar ──────────────────────────────────────── */}
      {!blok.others && sec && (
        <>
          <div className="form-row">
            {butuhUnit ? (
              <div className="form-group">
                <label className="form-label">Unit <span className="wajib">*</span></label>
                <select
                  value={blok.unitId}
                  disabled={terkunciUnit}
                  onChange={(e) => {
                    /* Unit semu bukan alat — di V2 memilihnya adalah CARA
                       mengatakan "job manual" (`WorkOrder.html:570`). Kalau ia
                       cuma disimpan sebagai unitId biasa, server menolaknya saat
                       kirim dan yang terbaca pembuat WO adalah galat atas
                       pilihan yang layar sendiri tawarkan. */
                    const u = kat.units.find((x) => String(x.id) === e.target.value);
                    if (u?.is_virtual) {
                      ubah({ others: true, unitId: '', komponen: '', subKomponen: '', jobId: '' });
                      return;
                    }
                    ubah({ unitId: e.target.value, komponen: '', subKomponen: '', jobId: '' });
                  }}
                >
                  <option value="">-- Select Unit --</option>
                  {grupUnit.map((g) => (
                    <optgroup key={g.label} label={`${g.label} (${g.unit.length})`}>
                      {g.unit.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_name}
                          {u.unit_model ? ` · ${u.unit_model}` : ' · belum punya joblist'}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Tanpa baris ini orang mengira unitnya hilang dari katalog —
                    persis kalimat yang dipakai V2. */}
                {!tampilSemuaUnit && laci.global.length > 0 && (
                  <p className="form-hint">
                    🌐 {laci.global.length} unit global disembunyikan — tekan
                    &ldquo;Tampilkan semua unit&rdquo; bila perlu.
                  </p>
                )}
                {terkunciUnit && (
                  <p className="tanda-kunci">
                    🔒 Unit dikunci oleh grup — hapus joblist lain untuk mengubah
                  </p>
                )}
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Model Rebuild <span className="wajib">*</span></label>
                <select
                  value={blok.model}
                  disabled={terkunciJob}
                  onChange={(e) =>
                    ubah({ model: e.target.value, komponen: '', subKomponen: '', jobId: '' })
                  }
                >
                  <option value="">-- Select Model --</option>
                  {beda(jobSection.map((j) => j.unit_model)).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {!datar && (
              <div className="form-group">
                <label className="form-label">Component <span className="wajib">*</span></label>
                <select
                  value={blok.komponen}
                  disabled={terkunciJob || !modelTerpilih}
                  onChange={(e) => ubah({ komponen: e.target.value, subKomponen: '', jobId: '' })}
                >
                  <option value="">-- Component --</option>
                  {daftarKomponen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          {!datar && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sub Component <span className="wajib">*</span></label>
                <select
                  value={blok.subKomponen}
                  disabled={terkunciJob || !blok.komponen}
                  onChange={(e) => ubah({ subKomponen: e.target.value, jobId: '' })}
                >
                  <option value="">-- Sub Component --</option>
                  {daftarSub.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Job <span className="wajib">*</span></label>
                <select
                  value={blok.jobId}
                  disabled={terkunciJob || !blok.subKomponen}
                  onChange={(e) => ubah({ jobId: e.target.value })}
                >
                  <option value="">-- Job --</option>
                  {daftarJob.map((j) => (
                    <option key={j.id} value={j.id}>{labelJob(j, bolehLihatPoin)}</option>
                  ))}
                </select>
                {terkunciJob && (
                  <p className="tanda-kunci">
                    🔒 Job dikunci oleh grup — hapus joblist lain untuk mengubah
                  </p>
                )}
              </div>
            </div>
          )}

          {datar && (
            <div className="form-group">
              <label className="form-label">Joblist <span className="wajib">*</span></label>
              <select
                value={blok.jobId}
                disabled={terkunciJob}
                onChange={(e) => ubah({ jobId: e.target.value })}
              >
                <option value="">-- Select Joblist --</option>
                {daftarJob.map((j) => (
                  <option key={j.id} value={j.id}>{labelJob(j, bolehLihatPoin)}</option>
                ))}
              </select>
              {terkunciJob && (
                <p className="tanda-kunci">
                  🔒 Job dikunci oleh grup — hapus joblist lain untuk mengubah
                </p>
              )}
            </div>
          )}

          {daftarJob.length === 0 && (datar || blok.subKomponen) && (
            <p className="form-hint">Tidak ada pekerjaan untuk pilihan ini.</p>
          )}
        </>
      )}

      {/* ── Isian manual (Others) ────────────────────────────────────────── */}
      {blok.others && (
        <>
          <div className="form-group">
            <label className="form-label">Job Description <span className="wajib">*</span></label>
            <input
              maxLength={200}
              placeholder="e.g. Bersih gudang, Training mekanik"
              value={blok.othersDesc}
              onChange={(e) => ubah({ othersDesc: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Base Points <span className="wajib">*</span></label>
              <input
                type="number" min="0.1" step="0.1" placeholder="e.g. 3.0"
                value={blok.mBase} onChange={(e) => ubah({ mBase: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Target Hours <span className="wajib">*</span></label>
              <input
                type="number" min="0.01" step="any" placeholder="e.g. 4.0"
                value={blok.mTarget} onChange={(e) => ubah({ mTarget: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 280 }}>
            <label className="form-label">Unit Factor <span className="wajib">*</span></label>
            <input
              type="number" min="0.1" step="0.01" placeholder="e.g. 1.0"
              value={blok.mFaktor} onChange={(e) => ubah({ mFaktor: e.target.value })}
            />
            <p className="form-hint">Pengali kesulitan (mis. 1.0 standar, 1.2 kompleks)</p>
          </div>
        </>
      )}

      {/* ── Location + Work Condition ────────────────────────────────────── */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">📍 Location <span className="wajib">*</span></label>
          <div className="pilihan-grid">
            {([
              ['workshop', '🏭', 'Workshop', 'Di dalam bengkel'],
              ['field', '🚜', 'Field', 'Di lokasi lapangan'],
            ] as const).map(([v, ikon, judul, sub]) => (
              <button
                type="button" key={v}
                className={blok.lokasi === v ? 'pilihan terpilih' : 'pilihan'}
                onClick={() => ubah({ lokasi: v })}
              >
                {ikon} {judul}<span className="sub">{sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Work Condition <span className="wajib">*</span></label>
          <select value={blok.kondisi} onChange={(e) => ubah({ kondisi: e.target.value })}>
            {kat.kondisi.map((k) => (
              <option key={k.kunci} value={k.kunci}>
                {k.label} (×{Number(k.faktor)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Preview — L2 SAJA ────────────────────────────────────────────────
          Mekanik dan L1 memilih pekerjaan berdasarkan APA yang dikerjakan,
          bukan berapa nilainya. Menampilkan poin saat membuat WO mengundang
          pemilihan job berdasarkan bayarannya. */}
      {bolehLihatPoin && (
        <div className="pratinjau">
          <h4 className="pratinjau-judul">Preview</h4>
          <div className="pratinjau-kisi">
            <Butir label="Base Points:" nilai={pratinjau.base > 0 ? pratinjau.base.toFixed(2) : '-'} />
            <Butir label="Target Hours:" nilai={pratinjau.target > 0 ? durasiJam(pratinjau.target) : '-'} />
            <Butir label="Unit Factor:" nilai={pratinjau.unitTeks} />
            <Butir label="Work Condition:" nilai={pratinjau.wcTeks} />
            <Butir
              label="Estimated Points:"
              nilai={pratinjau.perkiraan === null ? '-' : `${pratinjau.perkiraan.toFixed(2)} points`}
              sorot={pratinjau.perkiraan !== null}
            />
          </div>
        </div>
      )}

      {/* ── Team Composition ─────────────────────────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">
          Team Composition <span className="wajib">*</span>{' '}
          <span className="form-hint" style={{ display: 'inline', fontWeight: 400 }}>
            (tiap mekanik dapat poin penuh)
          </span>
        </label>

        <div className="team-members">
          {blok.tim.map((idAnggota, i) => (
            <div className="team-member-row" key={i}>
              <select
                className="mechanic-select"
                value={idAnggota === 0 ? '' : String(idAnggota)}
                onChange={(e) => {
                  const baru = [...blok.tim];
                  baru[i] = Number(e.target.value || 0);
                  ubah({ tim: baru });
                }}
              >
                <option value="">-- Select Mechanic --</option>
                {mekanikTersedia.map((m) => (
                  <option
                    key={m.id} value={m.id}
                    disabled={blok.tim.includes(m.id) && blok.tim[i] !== m.id}
                  >
                    {m.name}{m.jabatan ? ` — ${m.jabatan}` : ''}
                    {blok.semuaMekanik && m.sections.length > 0
                      && !m.sections.includes(blok.section)
                      ? ` [${m.sections.join(',')}]` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button" className="btn-reject btn-ikon" title="Hapus anggota"
                onClick={() => ubah({ tim: blok.tim.filter((_, j) => j !== i) })}
              >✕</button>
            </div>
          ))}
        </div>

        <div className="pilihan-grid" style={{ marginTop: 8 }}>
          <button
            type="button" className="btn-secondary btn-sm" style={{ flex: '0 0 auto' }}
            onClick={() => ubah({ tim: [...blok.tim, 0] })}
          >+ Add Team Member</button>
          <label className="saklar-kecil">
            <input
              type="checkbox"
              checked={blok.semuaMekanik}
              onChange={(e) => ubah({ semuaMekanik: e.target.checked })}
            />
            🔓 Tampilkan mekanik semua section
          </label>
        </div>
      </div>
    </div>
  );
}

function Butir({ label, nilai, sorot = false }: { label: string; nilai: string; sorot?: boolean }) {
  return (
    <div className="pratinjau-butir">
      <span className="pratinjau-label">{label}</span>
      <span className={`pratinjau-nilai${sorot ? ' sorot' : ''}`}>{nilai}</span>
    </div>
  );
}

/**
 * Catatan kaki meter. TIGA keadaan, dan yang ketiga tidak boleh diam:
 * pekerjaan tak terikat unit memang tak punya pembanding, dan diam akan
 * terbaca sebagai "belum pernah tercatat".
 */
function KakiMeter({ blok, kat }: { blok: Blok; kat: Katalog }) {
  const M = meterUntuk(blok.section);
  if (blok.others || !blok.unitId) {
    return (
      <p className="kaki-meter bebas">
        Pekerjaan ini tidak terikat satu unit — tidak ada {M.label} sebelumnya untuk
        dibandingkan. Isi angka apa adanya.
      </p>
    );
  }
  const d = kat.meter[`${M.jenis}:${blok.unitId}`];
  if (!d) {
    return (
      <p className="kaki-meter bebas">
        Belum pernah ada {M.label} tercatat untuk unit ini. Angka yang Anda isi jadi
        yang pertama.
      </p>
    );
  }
  const t = new Date(d.at);
  const tgl = Number.isNaN(t.getTime())
    ? ''
    : `, ${t.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][t.getMonth()]} ${t.getFullYear()}`;
  return (
    <p className="kaki-meter ada">
      {M.label} terakhir tercatat: <b>{d.nilai}</b>
      {d.oleh ? ` — ${d.oleh}` : ''}{tgl}
    </p>
  );
}

function labelJob(j: Job, bolehLihatPoin: boolean): string {
  if (!bolehLihatPoin) return j.job_description;
  const poin = j.base_points === null ? '' : ` · ${Number(j.base_points)} pts`;
  return `${j.job_description} (${Number(j.plan_hours)} jam${poin})`;
}

function ikonSection(code: string): string {
  return code === 'tyreman' ? '🛢️' : code === 'field' ? '🚜' : '🏭';
}

/** Angka pratinjau. Sumbernya berbeda-beda menurut keadaan blok. */
function hitungPratinjau(
  blok: Blok,
  sec: { requires_unit: boolean } | null,
  job: Job | null,
  unit: { unit_factor: string | null } | null,
  kat: Katalog,
) {
  let base = 0, target = 0, unitFaktor = 0, unitTeks = '-';

  if (blok.others) {
    base = Number(blok.mBase) || 0;
    target = Number(blok.mTarget) || 0;
    unitFaktor = Number(blok.mFaktor) || 0;
    unitTeks = unitFaktor > 0 ? `${unitFaktor.toFixed(2)}x (Manual)` : '-';
  } else {
    base = job?.base_points == null ? 0 : Number(job.base_points);
    target = job ? Number(job.plan_hours) : 0;
    if (sec && !sec.requires_unit) {
      // Workshop tidak punya unit, jadi tak ada yang bisa mengalikan.
      unitFaktor = 1; unitTeks = '1.00x (Workshop)';
    } else if (unit) {
      unitFaktor = unit.unit_factor == null ? 1 : Number(unit.unit_factor);
      unitTeks = `${unitFaktor.toFixed(2)}x`;
    }
  }

  const k = kat.kondisi.find((x) => x.kunci === blok.kondisi);
  const wcFaktor = k ? Number(k.faktor) : null;
  const wcTeks = k ? `${k.label} (${Number(k.faktor).toFixed(2)}x)` : '-';

  const perkiraan =
    wcFaktor !== null && unitFaktor > 0 && base > 0 ? base * unitFaktor * wcFaktor : null;

  return { base, target, unitTeks, wcTeks, perkiraan };
}
