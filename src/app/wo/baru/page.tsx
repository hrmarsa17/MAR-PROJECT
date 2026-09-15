import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { FormWo } from './FormWo.js';

export const dynamic = 'force-dynamic';

export default async function BuatWo() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  return (
    <div className="container-sempit">
      <div className="page-header">
        <h1 className="page-title">📝 Create Work Order</h1>
        <p className="page-subtitle">
          Pilih section, unit, lalu pekerjaannya bertingkat sampai ketemu.
        </p>
      </div>
      <FormWo bolehManual={aku.peran !== 'mechanic'} />
    </div>
  );
}
