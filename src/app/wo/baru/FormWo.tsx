'use client';

import { useEffect, useRef, useState } from 'react';
import { BlokJoblist } from './BlokJoblist.js';
import {
  blokBaru, grupBolehUntuk, meterUntuk,
  type Blok, type GrupMode, type Katalog,
} from './jenis.js';

const KUNCI_KIRIMAN = 'kmb_kiriman_wo';

interface BarisStruk { ok: boolean; no: string; sub: string }
interface Struk { judul: string; sub: string; baris: BarisStruk[]; catatan?: string }

export function FormWo({ bolehManual, bolehLihatPoin }: {
  bolehManual: boolean;
  bolehLihatPoin: boolean;
}) {
  const [kat, setKat] = useState<Katalog | null>(null);
  const [muatGagal, setMuatGagal] = useState<string | null>(null);

  const [grupMode, setGrupMode] = useState<GrupMode>('');
  const [blok, setBlok] = useState<Blok[]>([]);
  const [tampilSemuaUnit, setTampilSemuaUnit] = useState(false);

  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [struk, setStruk] = useState<Struk | null>(null);
  const [spanduk, setSpanduk] = useState<{ opId: string; pesan: string } | null>(null);
  const [hasilCek, setHasilCek] = useState<string | null>(null);

  const kunciBerikut = useRef(1);

  useEffect(() => {
    fetch('/api/data?jenis=katalog')
      .then((r) => r.json())
      .then((j) => {
        // Kegagalan TIDAK diringkas jadi daftar kosong — layar kosong yang
        // tampak normal lebih berbahaya daripada pesan galat.
        if (!j.ok) throw new Error(j.pesan ?? 'Gagal memuat katalog');
        const k: Katalog = j.data;
        setKat(k);
        const sec = k.sections[0]?.code ?? '';
        const kondisi = k.kondisi[0]?.kunci ?? 'normal';
        setBlok([blokBaru(kunciBerikut.current++, sec, kondisi)]);
      })
      .catch((e: Error) => setMuatGagal(e.message));
  }, []);

  /* Saat halaman dimuat: kalau ada kiriman yang belum dipastikan, munculkan
     spanduknya. Sesudah refresh formulirnya sudah hilang, jadi yang bisa
     dilakukan hanya MEMERIKSA — dan itu memang cukup. */
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KUNCI_KIRIMAN) ?? 'null');
      if (v?.opId) {
        setSpanduk({
          opId: v.opId,
          pesan: `Kiriman terakhir Anda (${v.jumlah ?? '?'} baris) belum dipastikan hasilnya. ` +
                 'Tekan Cek status sebelum membuat WO baru.',
        });
      }
    } catch { /* localStorage ditolak peramban — bukan alasan menggagalkan layar */ }
  }, []);

  if (muatGagal) {
    return <div className="kabar kabar-salah">Gagal memuat katalog: {muatGagal}</div>;
  }
  if (!kat || blok.length === 0) return <div className="kosong">Memuat katalog…</div>;

  const terkunci = grupMode !== '' && blok.length > 1;
  const acuan = blok[0]!;

  /* ── mode grup ──────────────────────────────────────────────────────────
     Grup hanya masuk akal bila barisnya punya DUA sumbu yang bisa
     divariasikan. Workshop cuma punya job, jadi tak ada yang bisa dijadikan
     acuan maupun variasi — ditolak di depan, bukan dibiarkan gagal saat kirim. */
  function gantiGrup(mode: GrupMode) {
    if (mode !== '' && !grupBolehUntuk(acuan.section)) {
      setKabar('Grup tidak berlaku untuk Workshop — di sana tidak ada unit untuk divariasikan.');
      return;
    }
    setGrupMode(mode);
    if (mode !== '' && blok.length > 1) setBlok(sebarkanAcuan(blok, mode));
  }

  /** Salin acuan blok #1 ke blok lain. Hanya blok #1 yang boleh jadi sumber. */
  function sebarkanAcuan(daftar: Blok[], mode: GrupMode): Blok[] {
    if (mode === '' || daftar.length < 2) return daftar;
    const a = daftar[0]!;
    return daftar.map((b, i) => {
      if (i === 0) return b;
      // Section ikut acuan: katalog job dan unit dipilah per section, dan grup
      // lintas-section menghasilkan baris yang tak sebanding.
      const dasar = { ...b, section: a.section };
      if (mode === 'unit') {
        return { ...dasar, unitId: a.unitId, model: a.model };
      }
      // mode 'job': job dikunci, unit bervariasi. Job dicocokkan lewat
      // job_description, BUKAN job_id — job_id berbeda per unit_model walau
      // pekerjaannya sama persis.
      const sumber = kat!.jobs.find((j) => String(j.id) === a.jobId);
      if (!sumber) return { ...dasar, komponen: a.komponen, subKomponen: a.subKomponen, jobId: '' };
      const modelTujuan =
        kat!.units.find((u) => String(u.id) === dasar.unitId)?.unit_model ?? '';
      const cocok = kat!.jobs.find(
        (j) => j.section === dasar.section
            && j.unit_model === modelTujuan
            && j.job_description === sumber.job_description,
      );
      return {
        ...dasar,
        komponen: cocok?.component ?? '',
        subKomponen: cocok?.sub_component ?? '',
        jobId: cocok ? String(cocok.id) : '',
      };
    });
  }

  function ubahBlok(i: number, tambalan: Partial<Blok>) {
    setBlok((lama) => {
      let baru = lama.map((b, j) => (j === i ? { ...b, ...tambalan } : b));
      // Pindah ke Workshop saat grup menyala membuat mode grup jadi mustahil.
      // Dikembalikan ke Bebas SEKARANG, bukan dibiarkan gagal saat kirim.
      if (i === 0 && tambalan.section && grupMode !== '' && !grupBolehUntuk(tambalan.section)) {
        setGrupMode('');
        setKabar('Mode grup dimatikan — Workshop tidak punya unit untuk divariasikan.');
        return baru;
      }
      if (i === 0 && grupMode !== '') baru = sebarkanAcuan(baru, grupMode);
      return baru;
    });
  }

  function tambahBlok() {
    setBlok((lama) => {
      const a = lama[0]!;
      const b = blokBaru(kunciBerikut.current++, a.section, a.kondisi);
      const baru = [...lama, b];
      return grupMode === '' ? baru : sebarkanAcuan(baru, grupMode);
    });
  }

  function hapusBlok(i: number) {
    // Turun ke 1 baris = grup bubar, acuan terbuka lagi. Inilah cara mengubah
    // acuan yang sudah dikunci: hapus joblist lain dulu.
    setBlok((lama) => (lama.length <= 1 ? lama : lama.filter((_, j) => j !== i)));
  }

  /** Orang berbeda di seluruh grup — satu mekanik di tiga baris tetap satu orang. */
  const orang = new Set<number>();
  let penugasan = 0;
  for (const b of blok) for (const t of b.tim) if (t > 0) { orang.add(t); penugasan++; }

  const acuanTeks =
    grupMode === 'unit'
      ? (kat.units.find((u) => String(u.id) === acuan.unitId)?.unit_name ?? '(belum dipilih)')
      : (kat.jobs.find((j) => String(j.id) === acuan.jobId)?.job_description ?? '(belum dipilih)');

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setKabar(null);

    const salah = periksa(blok, grupMode, kat!);
    if (salah) { setKabar(salah); return; }

    /* NOMOR KIRIMAN — dibuat SEKALI per submit, dipakai SAMA untuk setiap
       percobaan ulang. Membuat nomor baru tiap percobaan mematikan kunci
       idempotensinya: server tak punya cara mengenali bahwa ini kiriman yang
       sama. Disimpan di localStorage supaya bertahan melewati refresh —
       sesudah sambungan putus orang refleks menekan refresh. */
    const opId = crypto.randomUUID();
    try {
      localStorage.setItem(KUNCI_KIRIMAN,
        JSON.stringify({ opId, jumlah: blok.length, waktu: new Date().toISOString() }));
    } catch { /* abaikan */ }

    setSibuk(true);
    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'buat_wo',
          op_id: opId,
          data: {
            sectionCode: acuan.section,
            ...(grupMode === '' ? {} : { grup: { mode: grupMode } }),
            blok: blok.map(muatanBlok),
          },
        }),
      });
      const j = await r.json();
      setSibuk(false);

      if (!j.ok) {
        // Ditolak server dengan alasan yang jelas: TIDAK ada WO yang terbit,
        // jadi nomor kirimannya boleh dibuang dan formulirnya aman diperbaiki.
        try { localStorage.removeItem(KUNCI_KIRIMAN); } catch { /* abaikan */ }
        setKabar(j.pesan ?? 'Gagal membuat Work Order');
        return;
      }

      try { localStorage.removeItem(KUNCI_KIRIMAN); } catch { /* abaikan */ }
      setSpanduk(null);
      const dibuat: { id: number; woNumber: string }[] = j.data.hasil.dibuat ?? [];
      const diulang = j.data.diulang === true;
      setStruk({
        judul: `✅ ${dibuat.length} WO berhasil dibuat`,
        sub: diulang
          ? 'Kiriman ini sudah pernah masuk sebelumnya. Tidak ada WO yang dibuat dua kali.'
          : 'Semua nomor di bawah sudah tersimpan di sistem.',
        baris: dibuat.map((w, i) => ({
          ok: true, no: w.woNumber, sub: ringkasBlok(blok[i], kat!),
        })),
      });
    } catch {
      setSibuk(false);
      /* BUKAN "gagal". Sambungan putus bisa terjadi saat permintaan BERANGKAT
         (server tak pernah menerima) atau saat jawaban PULANG (server sudah
         menulis SEMUANYA) — dari sini keduanya terlihat persis sama. Mengaku
         tahu di sini membuat orang membuat ulang WO yang sebenarnya sudah
         terbit. */
      setSpanduk({
        opId,
        pesan: 'Sambungan terputus sebelum jawaban server sampai. WO Anda MUNGKIN ' +
               'sudah terbuat. JANGAN isi formulir baru — tekan Cek status di bawah.',
      });
    }
  }

  /** READ-ONLY. Tidak membuat apa pun. Aman ditekan berkali-kali. */
  async function cekStatus(opId: string) {
    setHasilCek('Memeriksa…');
    try {
      const r = await fetch(`/api/data?jenis=kiriman&op_id=${encodeURIComponent(opId)}`);
      const j = await r.json();
      if (!j.ok) { setHasilCek(`Gagal memeriksa: ${j.pesan ?? '?'}. Tekan Cek status lagi.`); return; }
      if (j.data.keadaan === 'selesai') {
        const no = (j.data.wo ?? []).map((w: { woNumber: string }) => w.woNumber).join(', ');
        setHasilCek(`✅ Kiriman ini SUDAH masuk${no ? `: ${no}` : ''}. Jangan dibuat ulang.`);
        try { localStorage.removeItem(KUNCI_KIRIMAN); } catch { /* abaikan */ }
      } else {
        setHasilCek('Tidak ada WO yang tercatat masuk untuk kiriman ini. Aman dibuat ulang.');
        try { localStorage.removeItem(KUNCI_KIRIMAN); } catch { /* abaikan */ }
      }
    } catch {
      setHasilCek('Sambungan masih bermasalah. Tekan Cek status lagi — aman ditekan berkali-kali.');
    }
  }

  return (
    <>
      {spanduk && (
        <div className="kiriman-spanduk">
          <strong>⚠️ Kiriman belum dipastikan</strong>
          <p style={{ margin: '4px 0 0' }}>{spanduk.pesan}</p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-kembalikan btn-sm" onClick={() => cekStatus(spanduk.opId)}>
              🔄 Cek status
            </button>
            <span style={{ fontSize: '0.75rem' }}>Nomor kiriman: {spanduk.opId}</span>
          </div>
          {hasilCek && <p style={{ marginTop: 8, marginBottom: 0 }}>{hasilCek}</p>}
        </div>
      )}

      <form onSubmit={kirim}>
        {/* ── Model pembuatan ────────────────────────────────────────────── */}
        <div className="grup-bar">
          <label className="form-label" style={{ margin: 0 }}>Model pembuatan</label>
          <div className="pilihan-grid" style={{ marginTop: 8 }}>
            {([
              ['', '📄 Bebas', 'tiap joblist berdiri sendiri'],
              ['unit', '🚜 1 unit · banyak job', 'unit dikunci'],
              ['job', '🔧 1 job · banyak unit', 'job dikunci'],
            ] as const).map(([v, judul, sub]) => (
              <button
                type="button" key={v || 'bebas'}
                className={grupMode === v ? 'pilihan terpilih' : 'pilihan'}
                onClick={() => gantiGrup(v)}
              >
                {judul}<span className="sub">{sub}</span>
              </button>
            ))}
          </div>
          <p className="form-hint" style={{ marginTop: 8 }}>{petunjukGrup(grupMode)}</p>

          <button
            type="button" className="btn-secondary btn-sm" style={{ marginTop: 10 }}
            onClick={() => setTampilSemuaUnit((v) => !v)}
          >
            {tampilSemuaUnit ? '🔽 Sembunyikan unit global' : '🌐 Tampilkan semua unit'}
          </button>

          {grupMode !== '' && (
            <div className="grup-ringkas">
              <div className="gr-baris">
                <span>{grupMode === 'unit' ? 'Unit acuan' : 'Job acuan'}</span>
                <span className="gr-nilai">{acuanTeks}</span>
              </div>
              <div className="gr-baris">
                <span>Jumlah baris</span>
                <span className="gr-nilai">{blok.length} joblist</span>
              </div>
              <div className="gr-baris">
                <span>Manpower</span>
                <span className="gr-nilai">
                  {orang.size} orang{penugasan !== orang.size ? ` · ${penugasan} penugasan` : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        {blok.map((b, i) => (
          <BlokJoblist
            key={b.kunci}
            blok={b} nomor={i + 1} total={blok.length}
            kat={kat}
            bolehManual={bolehManual}
            bolehLihatPoin={bolehLihatPoin}
            terkunciUnit={terkunci && grupMode === 'unit'}
            terkunciJob={terkunci && grupMode === 'job'}
            terkunciSection={terkunci}
            tampilSemuaUnit={tampilSemuaUnit}
            ubah={(t) => ubahBlok(i, t)}
            hapus={() => hapusBlok(i)}
          />
        ))}

        <button type="button" className="btn-secondary" onClick={tambahBlok}>
          + Add Joblist
        </button>

        {kabar && <div className="kabar kabar-salah" style={{ marginTop: 12 }}>{kabar}</div>}

        <div className="wo-aksi" style={{ marginTop: 16 }}>
          <button className="btn-primary" disabled={sibuk}>
            {sibuk ? 'Menyimpan Work Order…' : 'Create Work Order'}
          </button>
        </div>
      </form>

      {struk && (
        <div className="modal-tirai" onClick={() => setStruk(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{struk.judul}</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>{struk.sub}</p>
              {struk.baris.map((b, i) => (
                <div className={`struk-baris${b.ok ? '' : ' buruk'}`} key={i}>
                  <span>{b.ok ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{b.no}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{b.sub}</div>
                  </div>
                </div>
              ))}
              {struk.catatan && <div className="kabar kabar-salah">{struk.catatan}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => location.reload()}>
                + Buat Lagi
              </button>
              <button type="button" className="btn-primary" onClick={() => { location.href = '/monitoring'; }}>
                Lihat Monitoring →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function petunjukGrup(mode: GrupMode): string {
  if (mode === 'unit') {
    return 'Satu unit dikerjakan beberapa job. Unit joblist #1 jadi acuan dan dikunci ' +
           'untuk semua joblist; job tiap baris harus berbeda.';
  }
  if (mode === 'job') {
    return 'Satu job dikerjakan di beberapa unit. Job joblist #1 jadi acuan dan dikunci ' +
           'untuk semua joblist; unit tiap baris harus berbeda.';
  }
  return 'Bebas: setiap joblist boleh unit dan job berbeda, terbit sebagai WO terpisah ' +
         'tanpa ikatan grup.';
}

/**
 * Pemeriksaan di layar, SEBELUM dikirim.
 *
 * Server memeriksa ulang semuanya — ini hanya supaya orang tahu lebih awal,
 * tanpa menunggu bolak-balik jaringan. Bukan pengganti pagar server.
 */
function periksa(blok: Blok[], mode: GrupMode, kat: Katalog): string | null {
  const sectionPertama = blok[0]?.section;
  for (let i = 0; i < blok.length; i++) {
    const b = blok[i]!;
    const n = i + 1;
    const sec = kat.sections.find((s) => s.code === b.section);
    if (!b.kondisi) return `Joblist #${n}: pilih work condition`;

    if (b.others) {
      if (!b.othersDesc.trim()) return `Joblist #${n}: isi deskripsi job (Others)`;
      if (!(Number(b.mBase) > 0)) return `Joblist #${n}: Base Points harus > 0`;
      if (!(Number(b.mTarget) > 0)) return `Joblist #${n}: Target Hours harus > 0`;
      if (!(Number(b.mFaktor) > 0)) return `Joblist #${n}: Unit Factor harus > 0`;
    } else {
      if (sec?.requires_unit && !b.unitId) return `Joblist #${n}: pilih unit`;
      if (!b.jobId) return `Joblist #${n}: pilih job dari katalog`;
    }

    const tim = b.tim.filter((x) => x > 0);
    if (tim.length === 0) return `Joblist #${n}: tambah minimal 1 mekanik`;
    if (new Set(tim).size !== tim.length) return `Joblist #${n}: mekanik duplikat`;

    // Semua blok terbit di bawah satu sectionCode di sisi server.
    if (b.section !== sectionPertama) {
      return `Joblist #${n}: semua joblist harus di section yang sama (${sectionPertama}).`;
    }
  }

  if (mode !== '') {
    if (blok.length < 2) {
      return 'Mode grup butuh minimal 2 joblist — tambah joblist, atau pilih mode Bebas.';
    }
    const terlihat = new Map<string, number>();
    for (let i = 0; i < blok.length; i++) {
      const b = blok[i]!;
      const kunci = mode === 'unit' ? b.jobId : b.unitId;
      if (!kunci) continue;
      const sebelumnya = terlihat.get(kunci);
      if (sebelumnya !== undefined) {
        return `Joblist #${i + 1}: ${mode === 'unit' ? 'job' : 'unit'} ini sudah ada di grup ` +
               `(sama dengan joblist #${sebelumnya}).`;
      }
      terlihat.set(kunci, i + 1);
    }
  }
  return null;
}

/** Bentuk muatan satu blok. Kolom meter mengikuti section. */
function muatanBlok(b: Blok) {
  const M = meterUntuk(b.section);
  const angkaMeter = b.meter.trim() === '' ? undefined : Number(b.meter);
  return {
    ...(b.others
      ? {
          manual: {
            description: b.othersDesc.trim(),
            basePoints: Number(b.mBase),
            targetHours: Number(b.mTarget),
            unitFactor: Number(b.mFaktor),
          },
        }
      : { jobId: Number(b.jobId) }),
    ...(b.unitId && !b.others ? { unitId: Number(b.unitId) } : {}),
    workCondition: b.kondisi,
    location: b.lokasi,
    ...(b.keterangan.trim() ? { keterangan: b.keterangan.trim() } : {}),
    ...(angkaMeter !== undefined && Number.isFinite(angkaMeter)
      ? { [M.kunci]: angkaMeter }
      : {}),
    teamMechanicIds: b.tim.filter((x) => x > 0),
  };
}

/** Keterangan baris struk: yang dibaca orang adalah nama, bukan kode. */
function ringkasBlok(b: Blok | undefined, kat: Katalog): string {
  if (!b) return '(tanpa keterangan)';
  if (b.others) return `Others — ${b.othersDesc}`;
  const job = kat.jobs.find((j) => String(j.id) === b.jobId)?.job_description ?? '(job?)';
  const unit = kat.units.find((u) => String(u.id) === b.unitId)?.unit_name;
  return unit ? `${job} · ${unit}` : job;
}
