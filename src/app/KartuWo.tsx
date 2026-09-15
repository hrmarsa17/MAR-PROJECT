import type { KartuWo } from '../domain/kueri.js';

const LABEL_STATUS: Record<string, string> = {
  pending_mechanic_work: 'Menunggu dikerjakan',
  in_progress: 'Sedang dikerjakan',
  pending_transfer: 'Menunggu transfer',
  pending_supervisor: 'Menunggu L1',
  pending_superintendent: 'Menunggu L2',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};

function jam(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(2)} jam`;
}

export function KartuWoTampil({
  wo,
  anak,
}: {
  wo: KartuWo;
  anak?: React.ReactNode;
}) {
  const lewatTarget =
    wo.actual_hours !== null &&
    wo.target_hours !== null &&
    Number(wo.actual_hours) > Number(wo.target_hours);

  return (
    <article className="kartu">
      <div className="judul">
        <span className="nomor">{wo.wo_number}</span>
        <span className="lencana">{LABEL_STATUS[wo.status] ?? wo.status}</span>
        {wo.kembar_dicurigai && (
          // Menandai, tidak memblokir: kerja ulang yang sah harus tetap lewat.
          <span className="lencana awas" title="Unit & job sama, jam mulai berdekatan">
            ⚠ mirip WO lain
          </span>
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        {wo.job_description ?? <em style={{ color: 'var(--redup)' }}>tanpa uraian</em>}
        {wo.unit_name && <> · {wo.unit_name}</>}
      </div>

      <div className="rinci">
        <span>Section <b>{wo.section}</b></span>
        <span>Tim <b>{wo.tim.length > 0 ? wo.tim.join(', ') : '—'}</b></span>
        <span>
          Jam <b style={lewatTarget ? { color: 'var(--hati-hati)' } : undefined}>
            {jam(wo.actual_hours)}
          </b>
          {wo.target_hours !== null && (
            <span style={{ color: 'var(--redup)' }}> / target {jam(wo.target_hours)}</span>
          )}
        </span>
        {wo.perkiraan_poin !== null && (
          <span>Poin <b>{Number(wo.perkiraan_poin).toFixed(2)}</b></span>
        )}
      </div>

      {anak}
    </article>
  );
}
