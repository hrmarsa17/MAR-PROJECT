import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { BelumDibangun } from '../../BelumDibangun.js';

export const dynamic = 'force-dynamic';

export default async function KoreksiKm() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (aku.peran === 'mechanic') redirect('/monitoring');

  return (
    <BelumDibangun
      ikon="🛞"
      judul="Koreksi KM"
      isi="Perbaiki bacaan kilometer yang salah ketik"
      dariKmbV2={[
        'Perbaiki nilai KM pada satu WO, atau kosongkan bila nilai benarnya tidak diketahui',
        'Catat penggantian panel',
        'Alasan wajib minimal 5 huruf, tersimpan sebagai jejak',
        'KM menopang umur pakai ban — angka yang salah di sini menyesatkan Dashboard Teknis',
      ]}
    />
  );
}
