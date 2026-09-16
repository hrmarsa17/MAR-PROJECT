import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { kartuMekanik, ringkasMonitoring } from '../../domain/kueriMonitoring.js';
import { CariMekanik } from './CariMekanik.js';
import { LayarMekanik } from './LayarMekanik.js';

export const dynamic = 'force-dynamic';

/**
 * SATU RUTE, DUA LAYAR — sama seperti `?page=mechanic` di KMB V2
 * (`MechanicDashboard.html:335`):
 *
 *   approver tanpa `?as=`  → selector: kartu mekanik + statistik pipeline
 *   mekanik, atau approver yang menekan "Buka →" → daftar WO orang itu
 */

export default async function Monitoring({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; as?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const sp = await searchParams;
  const mintaAs = sp.as ? Number(sp.as) : null;

  /* Siapa WO-nya yang ditampilkan. Mekanik selalu dirinya sendiri: `?as=` dari
     tangan mekanik diabaikan, bukan ditolak dengan galat — tak ada yang perlu
     ia lakukan dengan pesan itu. */
  const sebagai = aku.peran === 'mechanic' ? aku.mechanicId : mintaAs;

  /* Daftar WO diambil DI KLIEN — itulah yang membuatnya bisa dibuka tanpa
     sinyal. Halaman ini tinggal memastikan ada sesi, lalu menyerahkan sisanya.

     Pemilih mekanik di bawah TETAP dirender server: ia pekerjaan kantor, bukan
     pekerjaan pit, dan ia memuat token setiap orang — hal yang tidak ada
     gunanya disimpan di HP siapa pun. */
  if (sebagai !== null && Number.isFinite(sebagai)) {
    return (
      <LayarMekanik
        as={aku.peran === 'mechanic' ? null : sebagai}
        tab={sp.tab ?? 'assigned'}
      />
    );
  }

  const [ringkas, kartu] = await Promise.all([
    ringkasMonitoring(aku),
    kartuMekanik(aku),
  ]);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">📊 Monitoring Mekanik</h1>
        <p className="page-subtitle">
          Pencapaian &amp; progres WO tiap mekanik, berikut tokennya.
          Tekan <b>Copy Token</b> untuk mekanik yang lupa tokennya, atau{' '}
          <b>Buka</b> untuk melihat WO-nya.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{ringkas.mekanik}</div>
          <div className="stat-label">👷 Mekanik</div>
        </div>
        <div className="stat-card biru">
          <div className="stat-value">{ringkas.perlu_diisi}</div>
          <div className="stat-label">📝 Perlu diisi</div>
        </div>
        <div className="stat-card ungu">
          <div className="stat-value">{ringkas.menunggu_approval}</div>
          <div className="stat-label">⏳ Menunggu approval</div>
        </div>
        <div className="stat-card hijau">
          <div className="stat-value">{ringkas.approved}</div>
          {/* KMB V2 menulis "Approved (semua waktu)" di sini padahal angkanya
              periode berjalan (MechanicService.js:216). Labelnya yang salah,
              bukan angkanya — jadi labelnya yang diperbaiki. */}
          <div className="stat-label">✅ Approved</div>
          <div className="stat-subtitle">{ringkas.periodeLabel}</div>
        </div>
      </div>

      <CariMekanik daftar={kartu} bisaKelolaToken />
    </div>
  );
}
