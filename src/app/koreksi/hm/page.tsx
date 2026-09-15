import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { BelumDibangun } from '../../BelumDibangun.js';

export const dynamic = 'force-dynamic';

export default async function KoreksiHm() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (aku.peran === 'mechanic') redirect('/monitoring');

  return (
    <BelumDibangun
      ikon="⏱"
      judul="Koreksi HM"
      isi="Perbaiki bacaan jam mesin yang salah ketik"
      dariKmbV2={[
        'Perbaiki nilai HM pada satu WO, atau kosongkan bila nilai benarnya tidak diketahui',
        'Catat penggantian panel — hitungan mulai dari nol tanpa dianggap mundur',
        'Alasan wajib minimal 5 huruf, tersimpan sebagai jejak',
        'Hanya L1 dan L2. Pagar naik-saja sudah aktif di jalur pembuatan WO.',
      ]}
    />
  );
}
