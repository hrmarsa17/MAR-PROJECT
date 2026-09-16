import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { riwayatUnit, unitBermeter, type JenisMeter } from '../../domain/meter.js';
import { LayarKoreksi } from './LayarKoreksi.js';

/**
 * Satu halaman untuk dua rute. `/koreksi/hm` dan `/koreksi/km` hanya berbeda
 * satu argumen — persis seperti `_KoreksiHm.js` dan `_KoreksiKm.js` di sumber,
 * yang masing-masing cuma delapan baris pemetaan nama.
 */
export async function HalamanKoreksi({
  jenis, searchParams,
}: {
  jenis: JenisMeter;
  searchParams: Promise<{ unit?: string }>;
}) {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const menu = jenis === 'HM' ? 'Koreksi HM' : 'Koreksi KM';
  if (aku.peran === 'mechanic') {
    return (
      <div className="container-sempit">
        <div className="page-header"><h1 className="page-title">{menu}</h1></div>
        <div className="kosong">{menu} hanya untuk L1 dan L2.</div>
      </div>
    );
  }

  const sp = await searchParams;
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
