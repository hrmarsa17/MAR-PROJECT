'use client';

import { useMemo, useState } from 'react';

/**
 * Layar export payroll. Bentuknya dari `Reports.html:131-270`; kontraknya di
 * docs/SPEK-LAYAR/07-REPORTS.md §2.
 *
 * ── DUA LANGKAH, BUKAN SATU ─────────────────────────────────────────────────
 * Menekan Generate TIDAK langsung mengunduh. Ia menampilkan dulu berapa mekanik,
 * berapa baris, berapa rupiah — baru tombol Download muncul. Itu bentuk sumber,
 * dan alasannya terasa saat angkanya salah: orang melihat "0 mekanik" sebelum
 * mengirim berkas kosong ke bagian keuangan, bukan sesudahnya.
 */

interface Props {
  sections: { code: string; name: string }[];
}

interface Pratinjau {
  periodeLabel: string;
  statistik: { mekanik: number; wo: number; idr: number };
  dikecualikan: { baris: number; nama: string[] };
  barisDetail: number;
}

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function FormLaporan({ sections }: Props) {
  const kini = new Date();
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [bulan, setBulan] = useState(kini.getMonth() + 1);
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [mulai, setMulai] = useState(awalBulan(kini));
  const [akhir, setAkhir] = useState(akhirBulan(kini));
  const [section, setSection] = useState('all');

  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Pratinjau | null>(null);

  const tahunPilihan = useMemo(
    () => [0, 1, 2, 3].map((n) => kini.getFullYear() - n),
    [kini],
  );

  /** Parameter yang sama dipakai pratinjau dan unduhan — satu sumber. */
  function parameter(): URLSearchParams {
    const p = new URLSearchParams({ mode });
    if (mode === 'month') {
      p.set('tahun', String(tahun));
      p.set('bulan', String(bulan));
    } else {
      p.set('mulai', mulai);
      p.set('akhir', akhir);
    }
    if (section !== 'all') p.set('section', section);
    return p;
  }

  function periksaIsian(): string | null {
    if (mode === 'month') {
      if (!bulan || !tahun) return 'Pilih bulan dan tahun terlebih dahulu.';
      return null;
    }
    if (!mulai || !akhir) return 'Isi tanggal awal dan akhir.';
    if (mulai > akhir) return 'Tanggal awal harus sebelum tanggal akhir.';
    return null;
  }

  async function generate() {
    setGalat(null);
    setHasil(null);
    const salah = periksaIsian();
    if (salah) { setGalat(salah); return; }

    setSibuk(true);
    try {
      const p = parameter();
      p.set('pratinjau', '1');
      const r = await fetch(`/api/laporan?${p.toString()}`);
      const j = await r.json();
      if (!j.ok) { setGalat(j.pesan ?? 'Gagal membuat laporan'); return; }
      setHasil(j.data);
    } catch (e) {
      setGalat(`Sambungan terputus: ${(e as Error).message}`);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="card-title">📥 Export Payroll Excel</div>
        <p className="card-subtitle" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Generate laporan insentif dalam format Excel (.xlsx) dengan 2 sheet:{' '}
          <b>Sheet 1</b> — Ringkasan per mekanik (Nama, Total Poin, Total IDR) |{' '}
          <b>Sheet 2</b> — Detail per WO
        </p>

        {/* ── saklar mode ───────────────────────────────────────────────── */}
        <div className="pilihan-grid" style={{ marginTop: 'var(--spacing-lg)' }}>
          {([
            ['month', '📅 Pilih Bulan & Tahun'],
            ['range', '📆 Rentang Tanggal'],
          ] as const).map(([v, label]) => (
            <button
              type="button" key={v}
              className={mode === v ? 'pilihan terpilih' : 'pilihan'}
              /* Mengganti saklar TIDAK menghapus isian yang lain — cuma
                 menyembunyikan hasil lama, yang sudah tidak menggambarkan
                 pilihan sekarang. Sama dengan sumber (`Reports.html:346-353`). */
              onClick={() => { setMode(v); setHasil(null); setGalat(null); }}
            >{label}</button>
          ))}
        </div>

        <div className="form-group" style={{ marginTop: 'var(--spacing-lg)', maxWidth: 360 }}>
          <label className="form-label" htmlFor="sec">Pilih Section</label>
          <select id="sec" value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.length !== 1 && (
              <option value="all">
                {sections.length === 0
                  ? 'Semua Section'
                  : `Semua Section (${sections.map((s) => s.name).join(', ')})`}
              </option>
            )}
            {sections.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>

        {mode === 'month' ? (
          <>
            {/* Kalimat ini yang mencegah kesalahpahaman paling mahal di layar
                ini: memilih "September" bukan berarti 1–30 September. */}
            <div className="kotak-jelas">
              <b>Periode gaji: tanggal 16 sampai 15 bulan berikutnya.</b><br />
              Bulan yang Anda pilih adalah bulan <b>penutup</b> — memilih{' '}
              <i>September</i> berarti <b>16 Agustus – 15 September</b>.
            </div>
            <div className="form-row" style={{ maxWidth: 480 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="bln">Bulan penutup</label>
                <select id="bln" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
                  {NAMA_BULAN.map((nm, i) => (
                    <option key={nm} value={i + 1}>{nm}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="thn">Tahun</label>
                <select id="thn" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
                  {tahunPilihan.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </>
        ) : (
          <div className="form-row" style={{ maxWidth: 480 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="dari">Dari Tanggal</label>
              <input id="dari" type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sampai">Sampai Tanggal</label>
              <input id="sampai" type="date" value={akhir} onChange={(e) => setAkhir(e.target.value)} />
            </div>
          </div>
        )}

        <button
          type="button" className="btn-export"
          disabled={sibuk}
          onClick={() => void generate()}
        >
          {sibuk ? '⏳ Membuat laporan…' : '📥 Generate & Download Excel'}
        </button>

        {galat && <div className="kabar kabar-salah">❌ {galat}</div>}

        {hasil && (
          <div className="kotak-hasil">
            <div className="hasil-kepala">
              <span style={{ fontSize: '1.25rem' }}>✅</span>
              <span style={{ fontWeight: 700 }}>Laporan berhasil dibuat!</span>
              <span className="hasil-periode">{hasil.periodeLabel}</span>
            </div>

            <div className="hasil-angka">
              <div><div className="hasil-nilai">{hasil.statistik.mekanik}</div>
                   <div className="hasil-label">Mekanik</div></div>
              <div><div className="hasil-nilai">{hasil.barisDetail}</div>
                   <div className="hasil-label">WO Selesai</div></div>
              <div><div className="hasil-nilai">{rupiah(hasil.statistik.idr)}</div>
                   <div className="hasil-label">Total IDR</div></div>
            </div>

            {/* Siapa yang TIDAK ikut dibayar, disebut namanya. Aturan akun uji
                memuat pola yang berlaku atas siapa pun; kalau suatu hari ia
                salah mengenai orang sungguhan, satu-satunya cara ketahuan
                adalah membacanya di sini. Tersembunyi saat nihil, supaya
                kemunculannya berarti sesuatu. */}
            {hasil.dikecualikan.baris > 0 && (
              <div className="kotak-kecuali">
                <b>⚠️ Tidak ikut dihitung — akun uji.</b>
                <div style={{ marginTop: 4 }}>
                  {hasil.dikecualikan.nama.join(', ')} — {hasil.dikecualikan.baris} baris poin.
                </div>
                <div style={{ marginTop: 6 }}>
                  Kalau ada nama mekanik sungguhan di situ, <b>jangan pakai berkas ini</b>.
                  Minta pengelola memperbaiki penanda akun uji, lalu buat ulang laporan.
                </div>
              </div>
            )}

            {/* Unduhan memanggil ulang endpoint yang sama tanpa `pratinjau`.
                Berkasnya dibentuk saat diminta, bukan disimpan di memori layar:
                laporan sebesar ini tak perlu dititipkan ke peramban. */}
            <a
              className="btn-download"
              href={`/api/laporan?${parameter().toString()}`}
            >⬇️ Download Excel</a>
          </div>
        )}
      </div>
    </div>
  );
}

function awalBulan(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function akhirBulan(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function rupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
