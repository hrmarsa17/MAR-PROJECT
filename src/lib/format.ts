/** Penulisan angka dan waktu dalam kebiasaan Indonesia. */

/**
 * Nama bulan pendek. `Agt`, bukan `Agu` — itu yang dipakai KMB V2 di seluruh
 * layarnya (`_PeriodePayroll.js:45`, `DashboardService.js:535`), jadi itu yang
 * sudah dibaca orang lapangan tiap hari. Keduanya sah dalam bahasa Indonesia;
 * yang tidak sah adalah dua ejaan berbeda di satu sistem.
 *
 * Diekspor supaya `periode.ts` memakai daftar yang SAMA. Label periode dan
 * label tanggal muncul berdampingan di layar Performa.
 */
export const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

/** "12 Sep 2026 16:35" — seperti di layar KMB V2. */
export function tanggalJam(nilai: string | Date | null | undefined): string {
  if (!nilai) return '—';
  const d = nilai instanceof Date ? nilai : new Date(nilai);
  if (Number.isNaN(d.getTime())) return '—';
  const jj = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()} ${jj}:${mm}`;
}

export function tanggalPanjang(d: Date): string {
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                 'Agustus','September','Oktober','November','Desember'][d.getMonth()];
  return `${hari}, ${d.getDate()} ${bulan} ${d.getFullYear()}`;
}

/**
 * "1 jam 12 menit" · "20 menit" · "2 jam"
 *
 * Jam desimal tidak pernah ditampilkan apa adanya ke approver. "1,2 jam" harus
 * dihitung di kepala sebelum bisa dinilai wajar atau tidak; "1 jam 12 menit"
 * tidak.
 */
export function durasiJam(jam: number | string | null | undefined): string {
  if (jam === null || jam === undefined || jam === '') return '—';
  const n = Number(jam);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0 menit';

  const totalMenit = Math.round(n * 60);
  const j = Math.floor(totalMenit / 60);
  const m = totalMenit % 60;
  if (j === 0) return `${m} menit`;
  if (m === 0) return `${j} jam`;
  return `${j} jam ${m} menit`;
}

export function angka(nilai: number | string | null | undefined, desimal = 2): string {
  if (nilai === null || nilai === undefined || nilai === '') return '—';
  const n = Number(nilai);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: desimal,
    maximumFractionDigits: desimal,
  });
}

export function rupiah(nilai: number | string | null | undefined): string {
  if (nilai === null || nilai === undefined || nilai === '') return '—';
  const n = Number(nilai);
  if (!Number.isFinite(n)) return '—';
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
