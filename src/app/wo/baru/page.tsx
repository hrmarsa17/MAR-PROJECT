import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { FormWo } from './FormWo.js';

export const dynamic = 'force-dynamic';

export default async function BuatWo() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  return (
    <>
      <h1>Buat Work Order</h1>
      <p className="sub">
        Pilih section, unit, lalu pekerjaannya bertingkat sampai ketemu.
      </p>
      <FormWo bolehManual={aku.peran !== 'mechanic'} />
    </>
  );
}
