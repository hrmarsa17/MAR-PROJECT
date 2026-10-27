'use client';

/**
 * Penyaring status tabel Work Order Terbaru.
 *
 * DI SISI KLIEN, sama dengan KMB V2 (`Main.html:664-684`): ia menyembunyikan
 * baris `<tr>`, tidak memanggil server. Tabelnya paling banyak 50 baris dan
 * sudah ada di layar — perjalanan ke server hanya menambah waktu tunggu untuk
 * data yang sama.
 *
 * Satu-satunya komponen klien di layar ini. Sisanya dirender di server.
 */
export function FilterStatus() {
  return (
    <select
      className="form-control"
      style={{ maxWidth: 200, minHeight: 36 }}
      defaultValue="all"
      aria-label="Saring menurut status"
      onChange={(e) => {
        const pilih = e.target.value;
        const tabel = document.getElementById('tabel-wo-terbaru');
        if (!tabel) return;
        for (const tr of tabel.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
          const st = tr.getAttribute('data-status') ?? '';
          const tampil =
            pilih === 'all' ? true
            : pilih === 'active' ? (st === 'pending_mechanic_work' || st === 'in_progress')
            : st === pilih;
          tr.style.display = tampil ? '' : 'none';
        }
      }}
    >
      <option value="all">🔍 Semua Status</option>
      <option value="active">Active</option>
      <option value="pending_supervisor">Level 1</option>
      <option value="pending_superintendent">Level 2</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
    </select>
  );
}
