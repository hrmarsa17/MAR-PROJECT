import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { riwayatUnit, unitBermeter, type JenisMeter } from '../../domain/meter.js';
import { LayarKoreksi } from './LayarKoreksi.js';

export const dynamic = 'force-dynamic';

/**
 * KOREKSI METER — SATU menu, dua jenis meter.
 *
 * Di KMB V2 ini dua halaman (`Hm.html`, `Km.html`) dan dua menu, padahal isinya
 * identik kecuali kata meternya — dan salinannya bahkan sempat lupa diganti:
 * halaman KM menuliskan "Jam mesin tidak pernah mundur".
 *
 * Di sini layarnya memang sudah SATU komponen sejak awal. Jadi dua menu untuk
 * satu layar hanya menambah lebar navbar tanpa menambah apa pun. Digabung atas
 * permintaan Gabriel, 16 Sep 2026.
 *
 * Rute lama `/koreksi/hm` dan `/koreksi/km` tetap hidup dan mengalihkan ke sini
 * — tautan yang sudah disimpan orang tidak boleh mati hanya karena menunya
 * dirapikan.
 */
export default async function Koreksi({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string; unit?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  if (aku.peran === 'mechanic') {
    return (
      <div className="container-sempit">
        <div className="page-header"><h1 className="page-title">Koreksi Meter</h1></div>
        <div className="kosong">Koreksi Meter hanya untuk L1 dan L2.</div>
      </div>
    );
  }

  const sp = await searchParams;
  // Apa pun yang bukan KM dibaca sebagai HM — termasuk parameter yang hilang
  // atau diketik tangan. Tidak ada keadaan "jenis tak dikenal" yang perlu
  // ditangani layar.
  const jenis: JenisMeter = String(sp.jenis ?? '').toUpperCase() === 'KM' ? 'KM' : 'HM';

  const unitId = sp.unit ? Number(sp.unit) : null;
  const sah = unitId !== null && Number.isFinite(unitId);

  const [unit, riwayat] = await Promise.all([
    unitBermeter(aku.tenantId),
    sah ? riwayatUnit(aku.tenantId, unitId, jenis) : Promise.resolve(null),
  ]);

  return (
    <LayarKoreksi
      jenis={jenis}
      unit={unit}
      unitTerpilih={sah ? unitId : null}
      riwayat={riwayat}
    />
  );
}
