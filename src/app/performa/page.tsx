import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import {
  statistikRingkas, woTerbaru, papanPeriode, papanHarian, trenPoin,
} from '../../domain/kueriPerforma.js';
import { tanggalPanjang, durasiJam } from '../../lib/format.js';
import { PapanPeringkat } from './PapanPeringkat.js';
import { TrenSvg } from './TrenSvg.js';
import { FilterStatus } from './FilterStatus.js';

export const dynamic = 'force-dynamic';

const JUMLAH_PERIODE_TREN = 3;

export default async function Performa() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (!aku.bolehLihat.performa) redirect('/monitoring');

  // Lima bacaan sekaligus. Tidak ada yang bergantung pada hasil yang lain, jadi
  // menjalankannya berurutan hanya menambah waktu tunggu tanpa menambah apa pun.
  const [stat, daftarWo, periode, harian, tren] = await Promise.all([
    statistikRingkas(aku),
    woTerbaru(aku, 50),
    papanPeriode(aku, 100),
    papanHarian(aku, 10),
    trenPoin(aku, JUMLAH_PERIODE_TREN),
  ]);

  const judul =
    aku.peran === 'mechanic' ? `Selamat datang, ${aku.nama}! 👋`
    : aku.peran === 'supervisor' ? 'Dashboard Performa — Planner/PIC Lapangan 📊'
    : 'Dashboard Performa 🎯';

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">{judul}</h1>
        <p className="page-subtitle">{tanggalPanjang(new Date())}</p>
      </div>

      {/* ── empat kartu ──────────────────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-label">Total WO</div>
          <div className="stat-value">{stat.totalWo}</div>
          {/* "& status" disebut gamblang: tanpa itu pembaca yang melihat angka
              ini lebih besar dari Approved akan mengira ada yang salah, alih-alih
              paham bahwa batal & ditolak memang ikut di sini. */}
          <div className="stat-subtitle">Semua waktu &amp; status</div>
        </div>
        <div className="stat-card hijau">
          <div className="stat-icon">✅</div>
          <div className="stat-label">Approved</div>
          <div className="stat-value">{stat.approved}</div>
          <div className="stat-subtitle">Selesai &amp; disetujui</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Pending</div>
          <div className="stat-value">{stat.pending}</div>
          <div className="stat-subtitle">Sedang berjalan</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Total Poin</div>
          <div className="stat-value">
            {stat.totalPoin.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
          </div>
          <div className="stat-subtitle">Terdistribusi</div>
        </div>
      </div>

      {/* ── Work Order Terbaru ───────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-header">
          <span className="card-title">📋 Work Order Terbaru</span>
          <FilterStatus />
        </div>
        {daftarWo.length === 0 ? (
          <div className="kosong">
            <div style={{ fontSize: '2.5rem', opacity: 0.5, marginBottom: '0.5rem' }}>📭</div>
            <div>Belum ada work order di jendela ini.</div>
          </div>
        ) : (
          <div className="tabel-gulir">
            <table className="table" id="tabel-wo-terbaru">
              <thead>
                <tr>
                  <th>WO Number</th>
                  <th>Component</th>
                  <th>Mekanik</th>
                  <th>Status</th>
                  <th>Judgment</th>
                  <th>Created By</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {daftarWo.map((w) => {
                  const b = lencana(w.status);
                  const jd = w.judgment;
                  const pendek = jd.length > 40 ? jd.slice(0, 40) + '…' : jd;
                  return (
                    <tr key={w.id} data-status={w.status}>
                      <td style={{ fontWeight: 700 }}>{w.woNumber}</td>
                      <td title={w.komponen}>{w.komponen}</td>
                      <td>{w.mekanik}</td>
                      <td><span className={`badge ${b.kelas}`}>{b.teks}</span></td>
                      <td className="sel-judgment" title={jd}>
                        {jd
                          ? `🗒️ ${pendek}${w.judgmentLevel ? ` (${w.judgmentLevel})` : ''}`
                          : <span className="sel-kosong">—</span>}
                      </td>
                      <td>{w.dibuatOleh}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(w.createdAt).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── tiga papan ───────────────────────────────────────────────────────
          Ditaruh DI ATAS grafik. Grafik tren menjawab "ke mana arahnya"; papan
          menjawab "siapa". Yang kedua itu yang dicari orang lebih dulu saat
          membuka halaman ini. */}
      <div className="grid-papan">
        <PapanPeringkat
          judul="🏆 Periode"
          sub={`${stat.periodeLabel} · dihitung saat disetujui L2`}
          baris={periode}
          kosong={{ ikon: '🏆', pesan: 'Belum ada poin disahkan di periode ini' }}
        />
        {/* Field lebih dulu, Tyreman kedua — urutan KMB V2. */}
        <PapanPeringkat
          judul={`🏆 Harian — ${harian.field.nama}`}
          sub={`${harian.label} · ${harian.field.jumlahWo} WO dikirim`}
          baris={harian.field.baris}
          taksir={harian.field.taksir}
          selaluTampilkanWo
          kosong={{ ikon: '🌙', pesan: `Belum ada kiriman ${harian.field.nama} di shift ini` }}
        />
        <PapanPeringkat
          judul={`🏆 Harian — ${harian.tyreman.nama}`}
          sub={`${harian.label} · ${harian.tyreman.jumlahWo} WO dikirim`}
          baris={harian.tyreman.baris}
          taksir={harian.tyreman.taksir}
          selaluTampilkanWo
          kosong={{ ikon: '🌙', pesan: 'Belum ada kiriman Tyreman di shift ini' }}
        />
      </div>

      {/* ── grafik + quick stats ─────────────────────────────────────────── */}
      <div className="grid-bawah">
        <div className="card">
          <div className="card-header">
            {/* Jumlahnya DIBACA dari data, bukan ditulis tangan. Di KMB V2
                judulnya pernah berbunyi "6 Bulan Terakhir" sementara isinya
                ditentukan kode server — dan yang terlupa selalu judulnya. */}
            <span className="card-title">
              📈 Tren Poin — {tren.jumlahPeriode} Periode Terakhir
            </span>
          </div>
          <div className="tren-isi"><TrenSvg tren={tren} /></div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Quick Stats</span>
          </div>
          <div style={{ padding: '0.5rem 1.25rem' }}>
            <div className="qs-butir">
              <div className="qs-label">Mekanik Aktif</div>
              <div className="qs-nilai">{stat.mekanikAktif}</div>
              {/* Jumlah baris di sini SELALU sama dengan angka di atas:
                  keduanya dari satu kali baca, jabatan kosong pun ikut. */}
              {stat.jabatan.length > 0 ? (
                <div className="qs-jabatan">
                  {stat.jabatan.map((j) => (
                    <div className="qs-jabatan-baris" key={j.jabatan}>
                      <span className="qs-jabatan-nama">{j.jabatan}</span>
                      <span className="qs-jabatan-titik" />
                      <span className="qs-jabatan-n">{j.jumlah}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="qs-jabatan-kosong">
                  {aku.peran === 'mechanic'
                    ? 'Tidak ditampilkan untuk mekanik'
                    : 'Jabatan belum diisi di master mekanik'}
                </div>
              )}
            </div>
            <div className="qs-butir">
              <div className="qs-label">Periode Ini</div>
              <div className="qs-nilai">{stat.bulanIni} WO</div>
            </div>
            <div className="qs-butir">
              <div className="qs-label">Rata-rata Waktu Kerja</div>
              {/* Jam & menit, bukan desimal — rumus yang SAMA dengan layar
                  Approval dan Create WO. Satu pekerjaan tidak boleh tampil
                  sebagai dua angka berbeda di tiga layar. */}
              <div className="qs-nilai">
                {stat.rataJam > 0 ? durasiJam(stat.rataJam) : '0 menit'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Peta status → lencana. Sama persis dengan Main.html:364-365. */
function lencana(status: string): { kelas: string; teks: string } {
  switch (status) {
    case 'approved':                return { kelas: 'badge-success', teks: 'Approved' };
    case 'rejected':                return { kelas: 'badge-danger',  teks: 'Rejected' };
    case 'cancelled':               return { kelas: 'badge-danger',  teks: 'Cancelled' };
    case 'pending_supervisor':      return { kelas: 'badge-warning', teks: 'Level 1' };
    case 'pending_superintendent':  return { kelas: 'badge-orange',  teks: 'Level 2' };
    default:                        return { kelas: 'badge-warning', teks: 'Active' };
  }
}
