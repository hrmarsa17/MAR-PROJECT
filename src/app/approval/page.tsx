import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import {
  hitunganTab, kartuApproval, type TabApproval,
} from '../../domain/kueriApproval.js';
import { KartuApprovalTampil } from './KartuApprovalTampil.js';
import { calonPenerima, kartuTransfer } from '../../domain/kueriTransfer.js';
import { KartuTransferTampil } from './KartuTransferTampil.js';

export const dynamic = 'force-dynamic';

const TAB: { kunci: TabApproval; label: string; ikon: string }[] = [
  { kunci: 'menunggu', label: 'WO Approval', ikon: '✅' },
  { kunci: 'aktif', label: 'WO Aktif', ikon: '⏳' },
  { kunci: 'approved', label: 'WO Approved', ikon: '📋' },
  { kunci: 'transfer', label: 'Transfer WO', ikon: '🔄' },
  { kunci: 'ditolak', label: 'Ditolak', ikon: '❌' },
];

const BATAS_KARTU = 25;

export default async function Approval({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; semua?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const peran = aku.peran;
  if (peran === 'mechanic') {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">✅ WO Approval</h1>
        </div>
        <div className="kosong">Layar ini untuk L1 dan L2.</div>
      </div>
    );
  }

  const sp = await searchParams;
  const tab = (TAB.find((t) => t.kunci === sp.tab)?.kunci ?? 'menunggu') as TabApproval;
  const semua = sp.semua === '1';

  /* Tab Transfer punya bacaan SENDIRI, bukan kartu approval biasa. Yang
     dibutuhkan approver untuk memutuskan transfer — jam sesi, jam tercatat
     sekarang, catatan mekanik, dan daftar calon penerima — tak satu pun ada di
     kartu approval, dan tanpa angka-angka itu tombolnya cuma tebakan. */
  const [hitung, kartu, transfer, penerima] = await Promise.all([
    hitunganTab(aku),
    tab === 'transfer' ? Promise.resolve([]) : kartuApproval(aku, tab, semua ? 500 : BATAS_KARTU),
    tab === 'transfer' ? kartuTransfer(aku) : Promise.resolve([]),
    tab === 'transfer' ? calonPenerima(aku) : Promise.resolve([]),
  ]);

  const total = hitung[tab];
  const adaSisa = tab !== 'transfer' && !semua && total > kartu.length;

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">✅ WO Approval</h1>
        <p className="page-subtitle">
          Review dan approve work orders yang sudah dikerjakan mekanik
        </p>
      </div>

      {/* `.sub-nav-tab`, bukan `.filter-tab` — di KMB V2 pil ini bernama
          `sub-nav-tab` (`Approval.html:147`), sementara `.filter-tab` adalah
          tab bergaris bawah milik layar mekanik. Dua bentuk yang berbeda. */}
      <div className="sub-nav">
        {TAB.map((t) => (
          <a
            key={t.kunci}
            href={`/approval?tab=${t.kunci}`}
            className={`sub-nav-tab${t.kunci === tab ? ' active' : ''}`}
          >
            {t.ikon} {t.label}
            <span className="count">{hitung[t.kunci]}</span>
          </a>
        ))}
      </div>

      <div className="section-title">
        {TAB.find((t) => t.kunci === tab)!.ikon}{' '}
        {tab === 'menunggu' ? 'Pending Approvals' : TAB.find((t) => t.kunci === tab)!.label}
        <span className="badge badge-grey">{total}</span>
      </div>

      {/* Jujur soal apa yang BELUM ditampilkan. Layar yang memuat 25 dari 369
          tanpa mengatakannya membuat orang mengira antreannya sudah habis. */}
      {adaSisa && (
        <div className="kabar kabar-awas">
          Menampilkan <b>{kartu.length}</b> dari <b>{total}</b> WO. Sisanya naik
          dengan sendirinya begitu yang di atas selesai.{' '}
          <a href={`/approval?tab=${tab}&semua=1`}>
            <b>Tampilkan semua {total}</b>
          </a>{' '}
          — memuatnya butuh waktu lebih lama.
        </div>
      )}

      {tab === 'transfer' ? (
        transfer.length === 0 ? (
          <div className="kosong">
            ✅ Tidak ada permintaan transfer yang menunggu keputusan.
          </div>
        ) : (
          <div className="wo-grid">
            {transfer.map((t) => (
              <KartuTransferTampil key={t.transferId} kartu={t} mekanik={penerima} />
            ))}
          </div>
        )
      ) : kartu.length === 0 ? (
        <div className="kosong">
          {tab === 'menunggu' ? 'Antrean bersih — tidak ada yang menunggu.' : 'Tidak ada data.'}
        </div>
      ) : (
        <div className="wo-grid">
          {kartu.map((w) => (
            <KartuApprovalTampil
              key={w.id}
              wo={w}
              peran={peran}
              bisaAksi={tab === 'menunggu'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
