'use client';

/**
 * PICKER TANGGAL & JAM, SELALU 24 JAM. Port dari `DateTime24.html`.
 *
 * KENAPA bukan `<input type="datetime-local">`: format 12/24 jam picker bawaan
 * ditentukan LOCALE PERANGKAT, bukan HTML. Di ponsel ber-locale Inggris ia
 * memunculkan AM/PM — bentuk yang tidak dipakai di lapangan sini, dan sumber
 * salah isi yang mahal: jam 13.00 terbaca "1", tersimpan jadi 01.00, dan
 * `session_hours` meleset dua belas jam. Itu jalur uang.
 *
 * Tidak ada atribut HTML/CSS yang bisa memaksanya, jadi bagian jamnya dibuat
 * sendiri. Bagian TANGGAL tetap `<input type="date">` — di sana tidak ada
 * urusan AM/PM.
 *
 * Nilai keluar-masuk dalam bentuk `YYYY-MM-DDTHH:MM`, sama persis dengan
 * `datetime-local`, sehingga yang membacanya tidak perlu tahu bedanya.
 */

const DUA = (n: number) => String(n).padStart(2, '0');
const JAM = Array.from({ length: 24 }, (_, i) => DUA(i));
const MENIT = Array.from({ length: 60 }, (_, i) => DUA(i));

export function PilihWaktu24({
  id, nilai, onUbah, mati = false,
}: {
  id: string;
  nilai: string;
  onUbah: (baru: string) => void;
  mati?: boolean;
}) {
  const tgl = nilai.slice(0, 10);
  const jam = nilai.slice(11, 13);
  const mnt = nilai.slice(14, 16);

  // Belum lengkap = kosong. Separuh terisi tidak boleh jadi waktu tebakan —
  // lebih baik ditolak validasi daripada tersimpan sebagai jam ngawur.
  const susun = (t: string, j: string, m: string) =>
    onUbah(t && j !== '' && m !== '' ? `${t}T${j}:${m}` : '');

  return (
    <div className="dt24">
      <input
        type="date" className="form-control dtTgl" aria-label="Tanggal"
        id={id} value={tgl} disabled={mati}
        onChange={(e) => susun(e.target.value, jam, mnt)}
      />
      <select
        className="form-control dtJam" aria-label="Jam"
        value={jam} disabled={mati}
        onChange={(e) => susun(tgl, e.target.value, mnt)}
      >
        <option value="">--</option>
        {JAM.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="dtTitik">:</span>
      <select
        className="form-control dtMnt" aria-label="Menit"
        value={mnt} disabled={mati}
        onChange={(e) => susun(tgl, jam, e.target.value)}
      >
        <option value="">--</option>
        {MENIT.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
