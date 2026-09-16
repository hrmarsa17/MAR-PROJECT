import { LayarAntrean } from '../../antrean/LayarAntrean.js';

/**
 * Sengaja TIDAK memeriksa sesi — alasannya sama dengan /antrean: isinya dibaca
 * dari IndexedDB HP itu sendiri, dan halaman yang menuntut sesi akan
 * mengalihkan ke layar masuk justru saat tidak ada sinyal, yaitu satu-satunya
 * saat ia benar-benar dibutuhkan.
 */
export const dynamic = 'force-static';

export default function AntreanLapangan() {
  return <LayarAntrean />;
}
