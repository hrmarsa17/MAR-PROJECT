import type { KartuApproval } from '../../domain/kueriApproval.js';
import { angka, durasiJam, tanggalJam } from '../../lib/format.js';
import { AksiKartu } from './AksiKartu.js';

/**
 * Kartu WO di layar Approval.
 *
 * Susunan baris mengikuti KMB V2 persis: COMPONENT → UNIT → WORK INFO →
 * KETERANGAN → TEAM → tombol. Approver membacanya dari atas ke bawah puluhan
 * kali sehari; urutannya sudah jadi hafalan otot, bukan preferensi.
 */

const KETEPATAN: Record<string, { teks: string; kelas: string }> = {
  on_time: { teks: '⏱ ON TIME', kelas: 'badge-success' },
  late: { teks: '⏱ TERLAMBAT', kelas: 'badge-warning' },
  way_late: { teks: '⏱ SANGAT TERLAMBAT', kelas: 'badge-danger' },
};

function Baris({
  label, nilai, sorot,
}: { label: string; nilai: React.ReactNode; sorot?: boolean }) {
  return (
    <div className="wo-baris">
      <span className="label">{label}</span>
      <span className={`nilai${sorot ? ' sorot' : ''}`}>{nilai}</span>
    </div>
  );
}

export function KartuApprovalTampil({
  wo, peran, bisaAksi,
}: {
  wo: KartuApproval;
  peran: 'supervisor' | 'superintendent';
  bisaAksi: boolean;
}) {
  const tepat = wo.ketepatan ? KETEPATAN[wo.ketepatan] : null;
  const lokasiLapangan = (wo.lokasi ?? '').toLowerCase().includes('lapangan');

  return (
    <article className="wo-card">
      <div className="wo-card-head">
        <span className="wo-nomor">{wo.wo_number}</span>
        <div className="wo-lencana">
          {wo.dibuat_mekanik && <span className="badge badge-warning">🔒 Dibuat Mekanik</span>}
          <span className="badge badge-purple">{wo.tahap}</span>
          {tepat && <span className={`badge ${tepat.kelas}`}>{tepat.teks}</span>}
          {wo.putaran > 1 && (
            <span className="badge badge-warning">↩ Kiriman ke-{wo.putaran}</span>
          )}
          {wo.kembar_dicurigai && (
            <span className="badge badge-danger" title="Unit & job sama, jam mulai berdekatan">
              ⚠ Mirip WO lain
            </span>
          )}
          {wo.ada_override && <span className="badge badge-blue">✏️ Ada override</span>}
        </div>
      </div>

      <div className="wo-bagian">
        <div className="wo-bagian-judul">📦 Component</div>
        <Baris label="No:" nilai={wo.job_code ?? '—'} />
        <Baris label="Name:" nilai={wo.job_nama ?? '—'} sorot />
        <Baris label="Category:" nilai={wo.job_kategori ?? '—'} />
      </div>

      <div className="wo-bagian">
        <div className="wo-bagian-judul">🚜 Unit</div>
        <Baris label="ID:" nilai={wo.unit_code ?? '—'} />
        <Baris label="Name:" nilai={wo.unit_nama ?? '—'} sorot />
        <Baris
          label="Location:"
          nilai={
            wo.lokasi ? (
              <span className={`badge ${lokasiLapangan ? 'badge-warning' : 'badge-grey'}`}>
                {lokasiLapangan ? '🚜 ' : '🏭 '}
                {wo.lokasi.toUpperCase()}
              </span>
            ) : '—'
          }
        />
      </div>

      <div className="wo-bagian">
        <div className="wo-bagian-judul">🔧 Work Info</div>
        <Baris label="Dibuat:" nilai={tanggalJam(wo.dibuat_at)} />
        <Baris label="Dikirim:" nilai={tanggalJam(wo.dikirim_at)} />
        <Baris label="Kondisi:" nilai={wo.kondisi} />
        {/* Jam nyata vs target berdampingan: itu satu-satunya cara approver
            bisa menilai kewajaran tanpa menghitung di kepala. */}
        <Baris label="Actual Hours:" nilai={durasiJam(wo.actual_hours)} sorot />
        <Baris label="Target Hours:" nilai={durasiJam(wo.target_hours)} />
        <Baris label="Base Points:" nilai={angka(wo.base_points, 2)} />
        <Baris
          label="Unit Factor:"
          nilai={<>{angka(wo.unit_factor, 2)} <span title="hanya bisa diubah lewat override">🔒</span></>}
        />
      </div>

      {wo.keterangan && (
        <div className="wo-bagian">
          <div className="wo-bagian-judul">📝 Keterangan</div>
          <div style={{ fontSize: '0.75rem' }}>{wo.keterangan}</div>
        </div>
      )}

      <div className="wo-bagian">
        <div className="wo-bagian-judul">👥 Team</div>
        <div className="wo-tim">
          {wo.tim.length === 0
            ? <span style={{ color: 'var(--text-secondary)' }}>belum ada anggota</span>
            : wo.tim.map((n) => <span key={n}>{n}</span>)}
        </div>
      </div>

      {wo.l1_oleh && <Baris label="Level 1 By:" nilai={wo.l1_oleh} />}
      {wo.final_points !== null && (
        <Baris label="Final Points:" nilai={angka(wo.final_points, 2)} sorot />
      )}

      {bisaAksi && (
        /* Angka yang SEDANG DILIHAT approver ikut turun. Persetujuan yang
           menunggu di antrean luring dibekukan server belakangan, dengan faktor
           yang berlaku saat itu — kalau berbeda dari yang di layar ini, layar
           Antrean menyebutkannya. Lihat src/pwa/bandingPratinjau.ts. */
        <AksiKartu
          woId={wo.id} nomor={wo.wo_number} peran={peran}
          terlihat={{
            base_points: wo.base_points === null ? null : Number(wo.base_points),
            unit_factor: wo.unit_factor === null ? null : Number(wo.unit_factor),
            actual_hours: wo.actual_hours === null ? null : Number(wo.actual_hours),
          }}
        />
      )}
    </article>
  );
}
