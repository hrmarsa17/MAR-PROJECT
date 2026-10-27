import type { BarisPapan } from '../../domain/kueriPerforma.js';

/**
 * Satu papan peringkat. Dipakai tiga kali: Periode, Harian-Field, Harian-Tyreman.
 *
 * Satu komponen, bukan tiga salinan — ketiganya menampilkan hal yang sama dan
 * harus tetap terlihat sama. Yang berbeda cuma kepalanya dan penanda taksiran.
 */
export function PapanPeringkat({
  judul, sub, baris, taksir = false, kosong, selaluTampilkanWo = false,
}: {
  judul: string;
  sub: string;
  baris: BarisPapan[];
  taksir?: boolean;
  kosong: { ikon: string; pesan: string };
  selaluTampilkanWo?: boolean;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-tumpuk">
          <span className="card-title">{judul}</span>
          <span className="card-sub">{sub}</span>
        </div>
      </div>
      <div className="papan-isi">
        {taksir && (
          <div className="taksir">
            ⚠️ <b>Sebagian masih perkiraan</b> — ada WO yang sudah dikirim tapi
            belum disetujui.
          </div>
        )}
        <div className="papan-gulir">
          {baris.length === 0 ? (
            <div className="kosong">
              <div style={{ fontSize: '2.5rem', opacity: 0.5, marginBottom: '0.5rem' }}>
                {kosong.ikon}
              </div>
              <div style={{ fontSize: '0.875rem' }}>{kosong.pesan}</div>
            </div>
          ) : (
            baris.map((b, i) => (
              <div className="papan-baris" key={b.mechanicId}>
                <div className="papan-rank">{peringkat(i)}</div>
                <div className="papan-info">
                  <div className="papan-nama">{b.nama}</div>
                  <div className="papan-grade">{b.grade || '—'}</div>
                  {(selaluTampilkanWo || b.jumlahWo > 0) && (
                    <div className="papan-wo">{b.jumlahWo} WO</div>
                  )}
                </div>
                {/* Poin besar, rupiah kecil. Alasannya di globals.css —
                    papan diurutkan menurut POIN, dan rupiah yang menonjol
                    membuat urutan yang benar tampak acak. */}
                <div className="papan-angka">
                  <div className="papan-poin">
                    {b.totalPoin.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    <span>poin</span>
                  </div>
                  <div className="papan-rupiah">
                    Rp {b.totalRupiah.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function peringkat(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
}
