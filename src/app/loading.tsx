/**
 * Yang tampil selagi halaman berikutnya disiapkan server.
 *
 * Tanpa berkas ini, berpindah menu terasa membeku: menu yang ditekan sudah
 * berganti keadaan, tapi isinya bertahan pada halaman LAMA sampai server
 * selesai — dan selama itu tak ada tanda apa pun bahwa sesuatu sedang terjadi.
 * Orang menekannya dua kali.
 *
 * Bentuknya kerangka, bukan pemutar berputar: kerangka menempati ruang yang
 * kira-kira sama dengan isinya, jadi saat datanya tiba tata letaknya tidak
 * melompat.
 */
export default function Memuat() {
  return (
    <div className="container" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>

      <div className="page-header">
        <div className="rangka" style={{ width: '18rem', height: '2rem' }} />
        <div className="rangka" style={{ width: '12rem', height: '1rem', marginTop: '0.5rem' }} />
      </div>

      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat-card" key={i}>
            <div className="rangka" style={{ width: '5rem', height: '0.75rem' }} />
            <div className="rangka" style={{ width: '4rem', height: '2rem', marginTop: '0.75rem' }} />
          </div>
        ))}
      </div>

      <div className="card card-body" style={{ marginTop: 'var(--spacing-lg)' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rangka"
            style={{ height: '1.25rem', marginBottom: '0.75rem', width: `${100 - i * 9}%` }}
          />
        ))}
      </div>
    </div>
  );
}
