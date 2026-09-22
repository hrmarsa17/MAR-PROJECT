import { redirect } from 'next/navigation';
import { akuServer } from '../../../lib/sesi.js';
import { FormWo } from './FormWo.js';

export const dynamic = 'force-dynamic';

export default async function BuatWo() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Create Work Order 📝</h1>
        <p className="page-subtitle">
          Tambahkan satu atau beberapa pekerjaan sekaligus. Setiap blok di bawah
          akan terbit sebagai 1 work order dengan nomor sendiri.
        </p>
      </div>
      {/* Angka poin hanya untuk L2. Mekanik dan L1 memilih pekerjaan
          berdasarkan APA yang dikerjakan, bukan berapa nilainya. Penyaringnya
          ada DI SERVER juga (`katalog()` tidak mengirim base_points ke
          non-L2) — ini cuma menghentikan tampilannya. */}
      <FormWo
        bolehManual={aku.peran !== 'mechanic'}
        bolehLihatPoin={aku.peran === 'superintendent'}
        tenantCode={aku.tenantCode}
      />
    </div>
  );
}
