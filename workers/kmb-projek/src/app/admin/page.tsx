import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { bekalAdmin } from '../../domain/admin.js';
import { LayarAdmin } from './LayarAdmin.js';
import { Kesehatan } from './Kesehatan.js';

export const dynamic = 'force-dynamic';

/**
 * Gerbangnya `mechanics.may_admin` — penanda TERSENDIRI, bukan peran.
 *
 * Menyetujui WO dan mengubah tarif rupiah per poin adalah dua kewenangan yang
 * berbeda; yang satu tidak seharusnya membawa yang lain. Gerbang layar ini
 * hanya penjaga pintu — penjaga datanya ada di `pastikanAdmin()` di lapisan
 * domain, tempat ia berlaku untuk semua pemanggil.
 */
export default async function Admin() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  /* Dibaca dari identitas, BUKAN kueri kedua di sini. Dua tempat yang
     menjawab pertanyaan yang sama adalah dua tempat yang suatu hari menjawab
     berbeda — dan yang satu ini menentukan siapa boleh mengubah tarif. */
  if (!aku.bolehAdmin) {
    return (
      <div className="container-sempit">
        <div className="page-header"><h1 className="page-title">🛠️ Admin</h1></div>
        <div className="kosong">
          Menu ini hanya untuk yang diberi hak admin.
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
            Haknya terpisah dari peran — L2 tidak otomatis mendapatkannya.
          </div>
        </div>
      </div>
    );
  }

  const bekal = await bekalAdmin(aku.tenantId);
  return (
    <LayarAdmin
      bekal={bekal}
      akuId={aku.mechanicId}
      kesehatan={<Kesehatan tenantId={aku.tenantId} />}
    />
  );
}
