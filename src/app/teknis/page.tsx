import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { dataTeknisTyre } from '../../domain/kueriTeknisTyre.js';
import { DuniaTyre } from './DuniaTyre.js';

export const dynamic = 'force-dynamic';

/**
 * DASHBOARD TEKNIS.
 *
 * Gerbangnya penanda per-orang `may_view_technical`, BUKAN sekadar L1/L2 —
 * sumbernya memeriksanya lagi di setiap handler walau halamannya sudah dijaga
 * (`_DashboardTeknis.js:689-703`).
 *
 * ── DUNIA FIELD BELUM ADA DI SINI, DAN ITU DISENGAJA ────────────────────────
 * PA / MTTR / MTBF berdiri di atas `unit_down_at` dan `unit_rfu_at`. Di seluruh
 * repo sumber kedua nama itu muncul DUA KALI, keduanya dibaca — tak ada satu
 * pun kode yang mengisinya, dan `_DashboardField.js:140` melewati WO yang
 * kolomnya kosong. Artinya angka itu diketik tangan di spreadsheet.
 *
 * Membangun layarnya tanpa memutuskan siapa yang mencatat jam unit turun dan
 * jam siap pakai berarti memasang dashboard yang selamanya kosong, atau — lebih
 * buruk — mengarang `down = start_time`, yang menghapus UB1 (masa menunggu
 * mekanik) padahal justru itu yang diukur. Keputusannya milik Gabriel.
 */
export default async function Teknis() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  if (!aku.bolehLihat.teknis) redirect('/monitoring');

  const data = await dataTeknisTyre(aku);

  return (
    <div className="container layar-teknis">
      <div className="page-header">
        <h1 className="page-title">🔧 Dashboard Teknis</h1>
        {/* Kalimat ini bukan hiasan. Begitu poin masuk ke layar ini,
            pencatatan berubah jadi usaha terlihat bagus — dan angka ban yang
            dikarang membuat seluruh dashboard tak berguna. */}
        <p className="page-subtitle">
          Keadaan alat, bukan kinerja orang. Tidak ada poin maupun rupiah di layar ini.
        </p>
      </div>

      <div className="baris-dunia">
        <span className="dunia on">Tyre</span>
        <span
          className="dunia mati"
          title="Menunggu keputusan: siapa yang mencatat jam unit turun & jam siap pakai"
        >Field — belum aktif</span>
      </div>

      <DuniaTyre data={data} />
    </div>
  );
}
