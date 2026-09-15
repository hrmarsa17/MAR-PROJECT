import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { BelumDibangun } from '../BelumDibangun.js';

export const dynamic = 'force-dynamic';

export default async function Reports() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (!aku.bolehLihat.report) redirect('/monitoring');

  return (
    <BelumDibangun
      ikon="📊"
      judul="Reports"
      isi="Export data insentif mekanik untuk kebutuhan payroll"
      dariKmbV2={[
        'Export Payroll Excel 2 sheet — Sheet 1 ringkasan per mekanik, Sheet 2 detail per WO',
        'Pilihan periode: Bulan & Tahun (periode gaji 16 → 15) atau Rentang Tanggal bebas',
        'Filter per section',
        'Angka rupiah diambil dari nilai yang DIBEKUKAN saat approve — bukan dihitung ulang dengan tarif hari ini',
      ]}
    />
  );
}
