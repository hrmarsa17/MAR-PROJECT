import { redirect } from 'next/navigation';
import { akuServer } from '../../../../lib/sesi.js';
import { FormWo } from '../../../wo/baru/FormWo.js';

/**
 * Buat WO, pintu lapangan.
 *
 * KOMPONEN YANG SAMA PERSIS dengan /wo/baru — bukan salinannya. Itulah satu
 * hal yang membedakan pintu kedua ini dari PWA KMB V2: di sana layar ini
 * ditulis dua kali, di `WorkOrder.html` dan di PWA-nya, dan tiap perbaikan
 * dikerjakan dua kali dengan yang satu selalu tertinggal.
 */
export const dynamic = 'force-dynamic';

export default async function BuatWoLapangan() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  return (
    <div className="container">
      <FormWo
        bolehManual={aku.peran !== 'mechanic'}
        bolehLihatPoin={aku.peran !== 'mechanic'}
        tenantCode={aku.tenantCode}
      />
    </div>
  );
}
