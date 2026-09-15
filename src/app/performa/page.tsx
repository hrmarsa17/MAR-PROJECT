import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { BelumDibangun } from '../BelumDibangun.js';

export const dynamic = 'force-dynamic';

export default async function Performa() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (!aku.bolehLihat.performa) redirect('/monitoring');

  return (
    <BelumDibangun
      ikon="📊"
      judul="Dashboard Performa"
      isi="Statistik, leaderboard, dan tren poin"
      dariKmbV2={[
        'Empat kartu: Total WO · Approved · Pending · Total Poin',
        'Tabel Work Order Terbaru dengan filter status',
        'Leaderboard periode gaji (16 → 15), urut poin',
        'Leaderboard harian per shift (06–18 / 18–06), dipisah Field dan Tyreman, dengan penanda "sebagian masih perkiraan"',
        'Tren poin 3 periode terakhir',
        'Quick Stats: mekanik aktif per jabatan, WO bulan ini, rata-rata waktu kerja',
      ]}
    />
  );
}
