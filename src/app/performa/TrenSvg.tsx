import type { TrenPoin } from '../../domain/kueriPerforma.js';

/**
 * Grafik tren, digambar sebagai SVG DI SERVER.
 *
 * KMB V2 memakai Chart.js 3.9.1 dari CDN (`Main.html:260`). Di sini tidak, dan
 * itu keputusan sadar — bentuknya tetap sama (garis merah, area terisi, titik
 * di tiap periode), yang berubah cara menggambarnya:
 *
 *   1. PWA ini harus bisa dibuka tanpa sinyal. Grafik yang menunggu pustaka
 *      265 KB dari CDN adalah satu-satunya bagian layar yang gagal saat jaringan
 *      buruk — dan justru layar inilah yang dibuka di lapangan.
 *   2. Tiga titik data tidak membutuhkan mesin grafik. Yang dibutuhkan cuma
 *      garis dan label.
 *   3. Tak ada JavaScript klien sama sekali: tak ada hidrasi, tak ada pergeseran
 *      tata letak saat pustaka akhirnya tiba.
 *
 * Yang HILANG dan perlu diketahui: tooltip saat kursor menyentuh titik. Angkanya
 * digantikan label tetap di atas tiap titik — untuk tiga titik itu lebih baik,
 * karena terbaca sekaligus tanpa perlu menyentuh apa pun. Kalau kelak trennya
 * jadi dua belas periode, keputusan ini perlu ditinjau ulang.
 */

const L = 44;   // ruang kiri untuk label sumbu Y
const R = 12;
const A = 18;   // ruang atas untuk label angka
const B = 34;   // ruang bawah untuk label periode
const W = 640;
const H = 260;

export function TrenSvg({ tren }: { tren: TrenPoin }) {
  const n = tren.data.length;
  if (n === 0) {
    return <div className="kosong">Belum ada poin disahkan di periode mana pun.</div>;
  }

  const maks = Math.max(...tren.data, 1);
  // Dibulatkan ke atas ke angka yang enak dibaca, supaya garis bantu teratas
  // tidak berbunyi "1.847,3".
  const atas = tingkatEnak(maks);
  const lebarPlot = W - L - R;
  const tinggiPlot = H - A - B;

  const x = (i: number) => (n === 1 ? L + lebarPlot / 2 : L + (lebarPlot * i) / (n - 1));
  const y = (v: number) => A + tinggiPlot - (tinggiPlot * v) / atas;

  const titik = tren.data.map((v, i) => ({ x: x(i), y: y(v), v }));
  const garis = titik.map((t) => `${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' ');
  const area =
    `${L},${A + tinggiPlot} ` + garis + ` ${titik[n - 1]!.x.toFixed(1)},${A + tinggiPlot}`;

  const bantu = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, nilai: atas * f }));

  return (
    <svg
      className="tren-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Tren poin ${n} periode terakhir: ` +
        tren.data.map((v, i) => `${tren.labelPenuh[i]} ${v} poin`).join(', ')}
    >
      {bantu.map(({ f, nilai }) => {
        const gy = A + tinggiPlot - tinggiPlot * f;
        return (
          <g key={f}>
            <line x1={L} y1={gy} x2={W - R} y2={gy} stroke="#F1F5F9" strokeWidth={1} />
            <text className="tren-label" x={L - 8} y={gy + 3} textAnchor="end">
              {ringkas(nilai)}
            </text>
          </g>
        );
      })}

      {n > 1 && (
        <polygon points={area} fill="rgba(79,99,63,0.08)" />
      )}
      {n > 1 && (
        <polyline
          points={garis}
          fill="none"
          stroke="#4F633F"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {titik.map((t, i) => (
        <g key={i}>
          <circle cx={t.x} cy={t.y} r={4} fill="#4F633F" />
          <text
            className="tren-label"
            x={t.x}
            y={t.y - 10}
            textAnchor="middle"
            style={{ fontWeight: 700, fill: '#111827' }}
          >
            {ringkas(t.v)}
          </text>
          <text className="tren-label" x={t.x} y={H - 12} textAnchor="middle">
            {tren.labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 1.250 → "1,3rb". Sumbu tak punya ruang untuk angka penuh. */
function ringkas(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  return (n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'rb';
}

/** Batas atas yang enak dibaca: 1, 2, atau 5 dikali pangkat sepuluh. */
function tingkatEnak(maks: number): number {
  const pangkat = 10 ** Math.floor(Math.log10(maks));
  for (const k of [1, 2, 2.5, 5, 10]) {
    if (maks <= k * pangkat) return k * pangkat;
  }
  return 10 * pangkat;
}
