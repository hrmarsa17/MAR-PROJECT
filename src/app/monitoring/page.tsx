import { redirect } from 'next/navigation';
import Link from 'next/link';
import { akuServer } from '../../lib/sesi.js';
import { kartuMekanik, ringkasMonitoring } from '../../domain/kueriMonitoring.js';
import {
  bolehLihatMekanikLain, hitunganTabMekanik, mekanikDilihat, woMekanik,
  type TabWoMekanik,
} from '../../domain/kueriWoMekanik.js';
import { CariMekanik } from './CariMekanik.js';
import { DaftarWoMekanik } from './DaftarWoMekanik.js';

export const dynamic = 'force-dynamic';

/**
 * SATU RUTE, DUA LAYAR — sama seperti `?page=mechanic` di KMB V2
 * (`MechanicDashboard.html:335`):
 *
 *   approver tanpa `?as=`  → selector: kartu mekanik + statistik pipeline
 *   mekanik, atau approver yang menekan "Buka →" → daftar WO orang itu
 */

const TAB: { kunci: TabWoMekanik; label: string }[] = [
  { kunci: 'assigned', label: 'Assigned' },
  { kunci: 'pending_approval', label: 'Pending' },
  { kunci: 'done', label: 'Done' },
];

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

  if (sebagai !== null && Number.isFinite(sebagai)) {
    return DaftarWo({ aku, sebagai, tab: sp.tab });
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

async function DaftarWo({
  aku, sebagai, tab: tabMinta,
}: {
  aku: NonNullable<Awaited<ReturnType<typeof akuServer>>>;
  sebagai: number;
  tab: string | undefined;
}) {
  const sendiri = sebagai === aku.mechanicId;

  if (!sendiri) {
    if (aku.peran === 'mechanic'
        || !(await bolehLihatMekanikLain(aku.mechanicId, sebagai))) {
      return (
        <div className="container">
          <div className="page-header"><h1 className="page-title">Monitoring</h1></div>
          <div className="kosong">Mekanik itu di luar scope Anda.</div>
        </div>
      );
    }
  }

  const orang = await mekanikDilihat(aku.tenantId, sebagai);
  if (!orang) {
    return (
      <div className="container">
        <div className="page-header"><h1 className="page-title">Monitoring</h1></div>
        <div className="kosong">Mekanik tidak ditemukan.</div>
      </div>
    );
  }

  const tab = (TAB.find((t) => t.kunci === tabMinta)?.kunci ?? 'assigned') as TabWoMekanik;
  const [hitung, daftar] = await Promise.all([
    hitunganTabMekanik(aku.tenantId, sebagai),
    woMekanik(aku.tenantId, sebagai, tab),
  ]);

  const tautan = (t: TabWoMekanik) =>
    sendiri ? `/monitoring?tab=${t}` : `/monitoring?as=${sebagai}&tab=${t}`;

  return (
    <div className="container layar-mekanik">
      {!sendiri && (
        <div className="impersonate-banner">
          <div className="impersonate-info">
            <div className="impersonate-icon">👤</div>
            <div className="impersonate-text">
              <h3>Viewing As</h3>
              <p>{orang.nama}</p>
            </div>
          </div>
          <Link href="/monitoring" className="btn-back-to-self">
            ← Kembali ke Monitoring
          </Link>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Monitoring</h1>
        <p className="page-subtitle">
          {sendiri ? 'Track and submit your assigned work' : 'Kelola work order mekanik ini'}
        </p>
      </div>

      {/* Tab mengganti RUTE, bukan menyaring di klien — sama dengan sumber
          (`changeFilter`, :977-981). Itulah sebabnya `grup_total` harus datang
          dari server: layar hanya memegang baris yang lolos tab ini. */}
      <div className="filter-tabs">
        {TAB.map((t) => (
          <Link
            key={t.kunci}
            href={tautan(t.kunci)}
            className={`filter-tab${t.kunci === tab ? ' active' : ''}`}
          >
            {t.label}
            <span className="count">{hitung[t.kunci]}</span>
          </Link>
        ))}
      </div>

      <DaftarWoMekanik daftar={daftar} />
    </div>
  );
}
