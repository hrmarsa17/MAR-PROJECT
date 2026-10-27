import { periksaKesehatan } from '../../domain/kesehatan.js';
import { tanggalJam } from '../../lib/format.js';

/**
 * Komponen SERVER: dihitung saat halaman dimuat, bukan lewat tombol Periksa.
 * Laporan kesehatan yang harus diminta dulu adalah laporan yang tidak pernah
 * dibaca.
 */
export async function Kesehatan({ tenantId }: { tenantId: number }) {
  const k = await periksaKesehatan(tenantId);
  const tanda = { baik: '✅', awas: '⚠️', salah: '❌' } as const;

  return (
    <div className="panel">
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{k.ringkas.salah}</div>
          <div className="stat-label">perlu ditindak</div></div>
        <div className="stat"><div className="stat-num">{k.ringkas.awas}</div>
          <div className="stat-label">perlu dilihat</div></div>
        <div className="stat"><div className="stat-num">{k.ringkas.baik}</div>
          <div className="stat-label">sehat</div></div>
      </div>

      {/* Yang bermasalah di ATAS. Daftar yang diurut abjad membuat satu baris
          merah tenggelam di antara dua belas baris hijau. */}
      {['salah', 'awas', 'baik'].map((t) => (
        k.butir.filter((b) => b.tingkat === t).map((b, i) => (
          <div className={`sehat-baris ${b.tingkat}`} key={`${t}-${i}`}>
            <span className="sehat-tanda">{tanda[b.tingkat]}</span>
            <span className="sehat-isi">
              <span className="sehat-judul">{b.judul}</span>
              <div className="sehat-ket">{b.keterangan}</div>
            </span>
          </div>
        ))
      ))}

      <p className="form-hint">Diperiksa {tanggalJam(k.diperiksaAt)}.</p>
    </div>
  );
}
