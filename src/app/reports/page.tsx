import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { sectionYangBoleh } from '../../domain/kueri.js';
import { sql } from '../../lib/db.js';
import { periodeSaatIni } from '../../domain/periode.js';
import { FormLaporan } from './FormLaporan.js';

export const dynamic = 'force-dynamic';

export default async function Reports() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  /* Gerbang layar. Gerbang DATA-nya ada lagi di /api/laporan — di KMB V2
     halaman reports dibatasi L2 sementara fungsi di belakangnya menerima L1
     juga, dan gerbang layar bukan gerbang data. */
  if (!aku.bolehLihat.report) redirect('/monitoring');

  const scope = await sectionYangBoleh(aku.mechanicId);
  const sections = await sql<{ code: string; name: string }[]>`
    SELECT code::text, name FROM sections
     WHERE tenant_id = ${aku.tenantId} AND is_active
       AND (${scope}::text[] IS NULL OR code::text = ANY(${scope}::text[]))
     ORDER BY sort_order
  `;

  /* Periode berjalan dihitung DI SERVER dan dikirim ke layar.
     Kalau layar menghitungnya sendiri, ia memakai jam peramban — dan jam
     peramban bukan zona bisnis. Satu definisi periode, dan yang memegangnya
     tetap `src/domain/periode.ts`. */
  const p = periodeSaatIni();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="container-sempit">
      <div className="page-header">
        <h1 className="page-title">📊 Reports</h1>
        <p className="page-subtitle">
          Angka di berkas ini dibaca dari nilai yang dibekukan saat poin terbit —
          bukan dihitung ulang dengan tarif hari ini.
        </p>
      </div>
      <FormLaporan
        sections={sections.map((s) => ({ code: s.code, name: s.name }))}
        periodeBerjalan={{
          label: p.label,
          mulai: iso(p.mulai),
          akhir: iso(p.akhir),
          bulanPenutup: p.akhir.getMonth() + 1,
          tahunPenutup: p.akhir.getFullYear(),
        }}
      />
    </div>
  );
}
