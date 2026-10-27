'use client';

import { useMemo, useState } from 'react';
import { tanggalJam } from '../../lib/format.js';
import type { DataTeknisTyre, KondisiTyre } from '../../domain/kueriTeknisTyre.js';

/**
 * DUNIA TYRE — port dari `Teknis.html:163-183` + enam panelnya.
 *
 * Enam tab dipisah supaya tidak sepuluh tab berebut tempat di satu baris
 * (`Teknis.html:92-98`). Berpindah tab TIDAK memanggil server lagi: seluruh
 * data datang sekali bersama halaman, dan penyaringan dikerjakan di sini.
 *
 * Tidak ada satu pun angka poin atau rupiah di berkas ini, dan itu disengaja.
 */

type Tab = 'kondisi' | 'problem' | 'riwayat' | 'repair' | 'life' | 'unit';

const TAB: { kunci: Tab; label: string }[] = [
  { kunci: 'kondisi', label: 'Kondisi Tyre Kini' },
  { kunci: 'problem', label: 'Problem' },
  { kunci: 'riwayat', label: 'Remove / Instal' },
  { kunci: 'repair', label: 'Repair per Tyre' },
  { kunci: 'life', label: 'Life Time' },
  { kunci: 'unit', label: 'Riwayat per Unit' },
];

const num = (n: number | null, satuan = '') =>
  n === null ? '–' : `${n.toLocaleString('id-ID')}${satuan}`;

export function DuniaTyre({ data }: { data: DataTeknisTyre }) {
  const [tab, setTab] = useState<Tab>('kondisi');

  return (
    <>
      <div className="stat-row">
        <Stat label="Unit tercatat" nilai={data.ringkas.unitTercatat} />
        <Stat label="Posisi tyre" nilai={data.ringkas.posisiTercatat} />
        <Stat label="Baris inspeksi" nilai={data.ringkas.barisInspeksi} />
        <Stat label="Remove / Instal" nilai={data.ringkas.barisRemove} />
        <Stat label="Repair" nilai={data.ringkas.barisRepair} />
      </div>

      <Tren data={data.mingguan} />

      <div className="tabs">
        {TAB.map((t) => (
          <button
            key={t.kunci} type="button"
            className={`tab${tab === t.kunci ? ' active' : ''}`}
            onClick={() => setTab(t.kunci)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'kondisi' && <PanelKondisi data={data} />}
      {tab === 'problem' && <PanelProblem data={data} />}
      {tab === 'riwayat' && <PanelRiwayat data={data} />}
      {tab === 'repair' && <PanelRepair data={data} />}
      {tab === 'life' && <PanelLife data={data} />}
      {tab === 'unit' && <PanelUnit data={data} />}
    </>
  );
}

function Stat({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="stat">
      <div className="stat-num">{nilai.toLocaleString('id-ID')}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Kosong({ judul, isi }: { judul: string; isi: string }) {
  return (
    <div className="hampa">
      <b>{judul}</b>
      <div className="hampa-ket">{isi}</div>
    </div>
  );
}

/* ── Tren mingguan ─────────────────────────────────────────────────────────
   SVG langsung, tanpa pustaka grafik. Alasannya dari sumber: grafik CDN yang
   gagal muat meninggalkan lubang kosong tepat saat dipresentasikan
   (`Teknis.html:79-81`). */
function Tren({ data }: { data: DataTeknisTyre['mingguan'] }) {
  if (data.length < 2) return null;
  const W = 720, H = 200, pad = 28;

  /* Sumbu Y MULAI DARI NOL, maksimum kelipatan lima. Sumbu yang dipotong
     membuat kenaikan tiga persen terlihat dua kali lipat (`:529-532`). */
  const tertinggi = Math.max(5, ...data.flatMap((d) => [d.inspeksi, d.removeInstal, d.problem]));
  const maks = Math.ceil(tertinggi / 5) * 5;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (data.length - 1);
  const y = (v: number) => H - pad - (v / maks) * (H - pad * 2);

  const seri = [
    { nama: 'Inspeksi', warna: '#94A3B8', ambil: (d: typeof data[number]) => d.inspeksi },
    { nama: 'Remove/Instal', warna: '#0EA5E9', ambil: (d: typeof data[number]) => d.removeInstal },
    { nama: 'Problem', warna: '#EF4444', ambil: (d: typeof data[number]) => d.problem },
  ];

  return (
    <div className="panel-tren">
      <div className="panel-judul">Pergerakan {data.length} minggu terakhir</div>
      <div className="panel-sub">
        Mg 1 sampai Mg {data.length} (minggu berjalan). Blok tujuh hari mundur dari
        hari ini, bukan Senin–Minggu.
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tren-svg" role="img"
           aria-label="Tren mingguan catatan ban">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#E5E7EB" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#E5E7EB" />
        <text x={4} y={pad + 4} className="tren-sumbu">{maks}</text>
        <text x={4} y={H - pad + 4} className="tren-sumbu">0</text>
        {seri.map((s) => (
          <polyline
            key={s.nama} fill="none" stroke={s.warna} strokeWidth={2}
            points={data.map((d, i) => `${x(i)},${y(s.ambil(d))}`).join(' ')}
          />
        ))}
        {seri.map((s) => data.map((d, i) => (
          <circle key={`${s.nama}-${i}`} cx={x(i)} cy={y(s.ambil(d))} r={3} fill={s.warna}>
            <title>{`${s.nama} ${d.label}: ${s.ambil(d)}`}</title>
          </circle>
        )))}
        {data.map((d, i) => (
          <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle" className="tren-sumbu">
            {d.label}
          </text>
        ))}
      </svg>
      <div className="tren-legenda">
        {seri.map((s) => (
          <span key={s.nama}>
            <i style={{ background: s.warna }} /> {s.nama}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Jejak RTD: seluruh titik, bukan rata-rata ─────────────────────────────
   Aus mendadak tidak tampak dari rata-rata; yang menunjukkannya adalah
   bentuk garisnya (`Teknis.html:595-616`). */
function JejakRtd({ titik, kritis }: { titik: number[]; kritis: boolean }) {
  if (titik.length < 2) return <span className="ro-kosong">-</span>;
  const W = 82, H = 22;
  const maks = Math.max(...titik), min = Math.min(...titik);
  const rentang = maks - min || 1;
  const pts = titik.map((v, i) =>
    `${(i * W) / (titik.length - 1)},${H - 2 - ((v - min) / rentang) * (H - 4)}`).join(' ');
  return (
    <svg width={W} height={H} className="jejak-rtd" role="img" aria-label="Jejak RTD">
      <polyline fill="none" strokeWidth={1.5}
                stroke={kritis ? '#991B1B' : '#64748B'} points={pts} />
    </svg>
  );
}

function PanelKondisi({ data }: { data: DataTeknisTyre }) {
  if (data.kondisi.length === 0) {
    return (
      <Kosong judul="Belum ada catatan inspeksi"
              isi="Layar ini terisi begitu mekanik mulai mengisi Detail Tyre saat mengirim WO." />
    );
  }
  return (
    <div className="panel">
      {data.rtdKritis === null && (
        <div className="catatan">
          <b>Ambang RTD kritis belum ditentukan.</b> Tidak ada baris yang ditandai
          merah — dan tiadanya warna merah <b>tidak berarti aman</b>.
        </div>
      )}
      <div className="tabel-gulir">
        <table className="table tabel-teknis">
          <thead>
            <tr>
              <th>Unit</th><th>Pos</th><th className="num">RTD kini</th>
              <th>Jejak RTD</th><th className="num">Umur pakai</th>
              <th className="num">Sisa KM</th><th>Perkiraan ganti</th>
              <th className="num">Pressure</th><th>Tercatat</th>
            </tr>
          </thead>
          <tbody>
            {data.kondisi.map((k) => <BarisKondisi key={`${k.unitId}:${k.pos}`} k={k} />)}
          </tbody>
        </table>
      </div>
      <div className="catatan-rumus">
        <b>Umur pakai</b> = KM unit sekarang − KM saat ban ini dipasang.
        <b> Sisa</b> = umur sasaran − umur pakai. <b>Perkiraan ganti</b> memakai laju
        ban <i>ini sendiri</i>, bukan rata-rata armada.
        <br />
        Dipakai KM, bukan HM: RTD hanya berubah ketika ban berputar. Dan RTD hanya
        berubah <i>ketika diukur</i> — pengukuran yang terlupa tidak boleh membuat
        ramalan seolah bannya berhenti aus. <b>Ini ramalan, bukan janji.</b>
      </div>
    </div>
  );
}

function BarisKondisi({ k }: { k: KondisiTyre }) {
  return (
    <tr className={k.kritis ? 'kritis' : ''}>
      <td>{k.unitNama}</td>
      <td>{k.pos}</td>
      <td className={`num${k.kritis ? ' rtd' : ''}`}>{num(k.rtd)}</td>
      <td><JejakRtd titik={k.jejakRtd} kritis={k.kritis} /></td>
      <td className="num">
        {k.lifeKm === null
          ? <span className="ro-kosong">KM belum diisi</span>
          : <>{num(k.lifeKm, ' KM')}<br /><span className="ro-kecil">hari ke-{k.umurHari}</span></>}
      </td>
      <td className="num">
        {k.sisaKm === null ? '–'
          : k.sisaKm <= 0
            ? <span className="lewat">lewat {num(Math.abs(k.sisaKm))}</span>
            : num(k.sisaKm)}
      </td>
      <td>
        {k.perkiraanGanti
          ? tanggalJam(k.perkiraanGanti).slice(0, 11)
          : <span className="ro-kosong">perlu 2 catatan</span>}
      </td>
      <td className="num">{num(k.pressure)}</td>
      {/* Tanggal DAN jam: satu posisi bisa dicatat berkali-kali sehari. */}
      <td>{tanggalJam(k.dicatatAt)}</td>
    </tr>
  );
}

/** Batang selalu disertai angkanya di sebelah kanan (`Teknis.html:59-65`). */
function Batang({ baris }: { baris: { label: string; jumlah: number }[] }) {
  const maks = Math.max(1, ...baris.map((b) => b.jumlah));
  return (
    <div className="bar-wrap">
      {baris.map((b) => (
        <div className="bar-row" key={b.label}>
          <span className="bar-label">{b.label}</span>
          <span className="bar-track">
            <span className="bar-isi" style={{ width: `${(b.jumlah / maks) * 100}%` }} />
          </span>
          <span className="bar-num">{b.jumlah}</span>
        </div>
      ))}
    </div>
  );
}

function PanelProblem({ data }: { data: DataTeknisTyre }) {
  if (data.problemJenis.length === 0) {
    /* Dua keadaan kosong yang berbeda, dan membedakannya penting: "belum ada
       remove/instal sama sekali" menyuruh orang menunggu data; "ada tapi
       problemnya tidak diisi" menyuruh orang memperbaiki cara mengisi. */
    return data.riwayat.length === 0 ? (
      <Kosong judul="Belum ada Remove / Instal"
              isi="Terisi saat mekanik mengisi form Remove/Instal." />
    ) : (
      <Kosong judul="Belum ada problem yang tercatat"
              isi={`Ada ${data.riwayat.length} catatan Remove / Instal, tapi tak satu pun `
                + 'mengisi kolom Problem. Kolom itu yang jadi dasar seluruh panel ini.'} />
    );
  }
  return (
    <div className="panel">
      <div className="panel-judul">Menurut jenis problem</div>
      <Batang baris={data.problemJenis} />
      <div className="panel-judul" style={{ marginTop: '1.2rem' }}>Menurut posisi ban</div>
      <Batang baris={data.problemPosisi} />
    </div>
  );
}

function PanelRiwayat({ data }: { data: DataTeknisTyre }) {
  if (data.riwayat.length === 0) {
    return (
      <Kosong judul="Belum ada Remove / Instal"
              isi="Terisi saat mekanik mengisi form Remove/Instal." />
    );
  }
  return (
    <div className="panel">
      <div className="tabel-gulir">
        <table className="table tabel-teknis">
          <thead>
            <tr>
              <th>Tanggal</th><th>Unit</th><th>Pos</th><th>SN dilepas</th>
              <th>Problem</th><th>Remarks</th><th>SN dipasang</th><th>Lokasi</th>
            </tr>
          </thead>
          <tbody>
            {data.riwayat.map((r, i) => (
              <tr key={`${r.at}-${r.unitId}-${r.pos}-${i}`}>
                <td>{tanggalJam(r.at)}</td>
                <td>{r.unitNama}</td>
                <td>{r.pos}</td>
                <td>{r.removeSn ?? '–'}</td>
                <td>{r.problem ?? '–'}</td>
                <td>{r.remarks ?? '–'}</td>
                <td>{r.instalSn ?? '–'}</td>
                <td>{r.lokasi ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelRepair({ data }: { data: DataTeknisTyre }) {
  if (data.repair.length === 0) {
    return (
      <Kosong judul="Belum ada repair tercatat"
              isi="Terisi saat mekanik mengisi form Repair." />
    );
  }
  return (
    <div className="panel">
      {/* Peringatan mutu, bukan basa-basi: SN diketik bebas di lapangan. */}
      <div className="catatan">
        📏 <b>Baca angka ini sebagai petunjuk, bukan angka pasti.</b> Nomor seri
        diketik bebas, jadi satu ban yang ditulis dua cara berbeda akan terbaca
        sebagai dua ban — dan riwayatnya pecah.
      </div>
      <div className="tabel-gulir">
        <table className="table tabel-teknis">
          <thead>
            <tr>
              <th>Serial No</th><th>Merk / Pattern</th><th>Size</th>
              <th className="num">Jumlah repair</th><th>Repair terakhir</th>
            </tr>
          </thead>
          <tbody>
            {data.repair.map((r) => (
              <tr key={r.sn}>
                <td>{r.sn}</td>
                <td>{[r.merk, r.pattern].filter(Boolean).join(' / ') || '–'}</td>
                <td>{r.size ?? '–'}</td>
                <td className="num"><b>{r.jumlah}</b></td>
                <td>{tanggalJam(r.terakhir)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelLife({ data }: { data: DataTeknisTyre }) {
  const l = data.life;
  if (l.selesai.length === 0) {
    return (
      <Kosong judul="Belum ada tyre yang selesai umurnya"
              isi="Terisi begitu ada tyre yang dipasang lalu dilepas dengan KM tercatat di keduanya." />
    );
  }
  return (
    <div className="panel">
      <div className="stat-row">
        <Stat label="Rata-rata umur pakai (KM)" nilai={l.rataRata ?? 0} />
        <Stat label="Tyre selesai umurnya" nilai={l.jumlah} />
        {l.target !== null && <Stat label="Umur sasaran (KM)" nilai={l.target} />}
      </div>
      {l.target === null && (
        <div className="catatan">
          <b>Umur sasaran belum ditentukan.</b> Umur yang tercapai tetap diukur —
          yang belum ada hanya pembandingnya.
        </div>
      )}

      <div className="panel-judul" style={{ marginTop: '1rem' }}>
        Rata-rata umur pakai menurut merk / pattern
      </div>
      <div className="panel-sub">
        Angka dalam kurung = berapa tyre yang jadi dasarnya. <b>Satu tyre bukan bukti.</b>
      </div>
      <Batang baris={l.rataMerk.map((m) => ({
        label: `${m.label} (${m.sampel})`, jumlah: m.nilai,
      }))} />

      <div className="panel-judul" style={{ marginTop: '1.2rem' }}>
        Rata-rata umur pakai menurut posisi
      </div>
      <div className="panel-sub">
        Posisi saat ban itu akhirnya dibuang. Posisi yang umurnya jauh lebih pendek
        biasanya soal alat, bukan soal bannya.
      </div>
      <Batang baris={l.rataPosisi.map((m) => ({
        label: `${m.label} (${m.sampel})`, jumlah: m.nilai,
      }))} />

      <div className="panel-judul" style={{ marginTop: '1.2rem' }}>
        Tyre yang sudah selesai umurnya
      </div>
      <div className="tabel-gulir">
        <table className="table tabel-teknis">
          <thead>
            <tr>
              <th>Serial No</th><th>Merk / Pattern</th><th>Size</th>
              <th className="num">Umur pakai</th><th className="num">Hari</th>
              <th>Problem</th><th>Dilepas</th>
            </tr>
          </thead>
          <tbody>
            {l.selesai.map((s, i) => (
              <tr key={`${s.sn}-${i}`}
                  className={l.target !== null && s.lifeKm >= l.target ? 'life-baik' : ''}>
                <td>{s.sn}</td>
                <td>{[s.merk, s.pattern].filter(Boolean).join(' / ') || '–'}</td>
                <td>{s.size ?? '–'}</td>
                <td className="num">{num(s.lifeKm, ' KM')}</td>
                <td className="num">{s.hari}</td>
                <td>{s.problem ?? '–'}</td>
                <td>{tanggalJam(s.dilepasAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="catatan-rumus">
        Umur dijumlahkan <b>per nomor seri melintasi rotasi</b> — pelepasan yang
        ber-remarks <i>rotasi</i> atau <i>repair</i> belum menutup umurnya. Menghitung
        per posisi akan membuat umur ban kembali dari nol setiap kali dirotasi.
      </div>
    </div>
  );
}

function PanelUnit({ data }: { data: DataTeknisTyre }) {
  const unit = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of data.kondisi) m.set(k.unitId, k.unitNama);
    for (const r of data.riwayat) m.set(r.unitId, r.unitNama);
    return [...m.entries()].map(([id, nama]) => ({ id, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [data]);

  const [pilih, setPilih] = useState<number | null>(unit[0]?.id ?? null);

  if (unit.length === 0) {
    return (
      <Kosong judul="Belum ada unit tercatat"
              isi="Terisi begitu ada WO tyre yang dikirim mekanik." />
    );
  }

  const posisi = data.kondisi.filter((k) => k.unitId === pilih)
    .sort((a, b) => a.pos - b.pos);
  const riwayat = data.riwayat.filter((r) => r.unitId === pilih);

  return (
    <div className="panel">
      <div className="form-group" style={{ maxWidth: 280 }}>
        <label className="form-label" htmlFor="pilih-unit-teknis">No lambung / unit</label>
        <select
          id="pilih-unit-teknis" className="form-control"
          value={pilih ?? ''} onChange={(e) => setPilih(Number(e.target.value))}
        >
          {unit.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
        </select>
      </div>

      <div className="panel-judul">Keadaan tiap posisi</div>
      <div className="tabel-gulir">
        <table className="table tabel-teknis">
          <thead>
            <tr>
              <th>Pos</th><th>SN terpasang</th><th className="num">RTD</th>
              <th>Jejak RTD</th><th className="num">Umur pakai</th>
              <th>Perkiraan ganti</th><th>Tercatat</th>
            </tr>
          </thead>
          <tbody>
            {posisi.map((k) => (
              <tr key={k.pos} className={k.kritis ? 'kritis' : ''}>
                <td>{k.pos}</td>
                <td>{k.snTerpasang ?? '–'}</td>
                <td className={`num${k.kritis ? ' rtd' : ''}`}>{num(k.rtd)}</td>
                <td><JejakRtd titik={k.jejakRtd} kritis={k.kritis} /></td>
                <td className="num">{k.lifeKm === null ? '–' : num(k.lifeKm, ' KM')}</td>
                <td>{k.perkiraanGanti ? tanggalJam(k.perkiraanGanti).slice(0, 11) : '–'}</td>
                <td>{tanggalJam(k.dicatatAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-judul" style={{ marginTop: '1.2rem' }}>
        Riwayat Remove / Instal unit ini
      </div>
      {riwayat.length === 0 ? (
        <div className="hampa-kecil">Belum ada Remove / Instal untuk unit ini.</div>
      ) : (
        <div className="tabel-gulir">
          <table className="table tabel-teknis">
            <thead>
              <tr>
                <th>Tanggal</th><th>Pos</th><th>SN dilepas</th><th>Problem</th>
                <th>Remarks</th><th>SN dipasang</th><th>Lokasi</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td>{tanggalJam(r.at)}</td>
                  <td>{r.pos}</td>
                  <td>{r.removeSn ?? '–'}</td>
                  <td>{r.problem ?? '–'}</td>
                  <td>{r.remarks ?? '–'}</td>
                  <td>{r.instalSn ?? '–'}</td>
                  <td>{r.lokasi ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
