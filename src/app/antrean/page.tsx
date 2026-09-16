import { LayarAntrean } from './LayarAntrean.js';

/**
 * Layar Antrean SENGAJA tidak memeriksa sesi di server.
 *
 * Isinya tidak datang dari basis data sama sekali — ia dibaca dari IndexedDB di
 * HP orang itu sendiri. Kalau halaman ini menuntut sesi, ia akan mengalihkan ke
 * layar masuk justru pada saat tidak ada sinyal, yaitu satu-satunya saat ia
 * benar-benar dibutuhkan: ketika seseorang ingin memastikan jam kerjanya tidak
 * hilang.
 *
 * Tidak ada yang bocor karenanya: yang ditampilkan adalah antrean milik
 * peramban itu sendiri, dan tanpa cookie yang sah tidak satu pun dari antrean
 * itu bisa dikirim ke server.
 */
export const dynamic = 'force-static';

export default function Antrean() {
  return <LayarAntrean />;
}
