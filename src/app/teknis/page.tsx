import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { BelumDibangun } from '../BelumDibangun.js';

export const dynamic = 'force-dynamic';

export default async function Teknis() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (!aku.bolehLihat.teknis) redirect('/monitoring');

  return (
    <BelumDibangun
      ikon="🔧"
      judul="Dashboard Teknis"
      isi="Kondisi ban dan ketersediaan unit — tanpa satu pun angka poin atau rupiah"
      dariKmbV2={[
        'Tyre: kondisi per posisi, RTD kritis, problem per jenis, riwayat remove/instal, repair per SN, life time per merk',
        'Field: PA, MTTR, MTBF per unit; breakdown UB0/UB1/SB0; pareto penyebab downtime',
        'Sengaja tanpa angka uang — supaya tidak berubah jadi alat penilaian orang, yang membuat isian jadi tidak jujur',
      ]}
    />
  );
}
