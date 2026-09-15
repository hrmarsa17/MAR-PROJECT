/**
 * Penanda jujur untuk layar yang sudah ada di menu tapi belum dibangun.
 *
 * Menu ditampilkan lengkap sejak awal dengan sengaja — supaya bentuk
 * navigasinya sudah sama dengan KMB V2 sejak hari pertama, dan tidak ada yang
 * perlu membiasakan diri dua kali. Tapi tautan yang membawa ke halaman rusak
 * lebih buruk daripada tautan yang mengatakan "belum".
 */
export function BelumDibangun({
  judul, ikon, isi, dariKmbV2,
}: {
  judul: string;
  ikon: string;
  isi: string;
  dariKmbV2: string[];
}) {
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">{ikon} {judul}</h1>
        <p className="page-subtitle">{isi}</p>
      </div>

      <div className="card">
        <div className="card-title">Belum dibangun</div>
        <p className="card-subtitle" style={{ marginTop: 8 }}>
          Yang akan ada di sini, mengikuti KMB V2:
        </p>
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: '0.875rem', lineHeight: 1.9 }}>
          {dariKmbV2.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </div>
    </div>
  );
}
