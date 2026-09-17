import { sql } from '../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TITIK PERIKSA KESEHATAN — dipanggil mesin, bukan orang.
 *
 * Dipakai healthcheck Docker dan pemeriksa hulu (Caddy) untuk memutuskan apakah
 * wadah ini layak menerima permintaan. Karena itu ia TIDAK boleh menuntut
 * token: pemeriksanya tidak punya satu pun, dan aplikasi yang menolak
 * pemeriksanya akan terus-menerus dinyatakan mati lalu dimulai ulang.
 *
 * ── YANG DIPERIKSA, DAN KENAPA BUKAN SEKADAR "SERVER HIDUP" ─────────────────
 * Proses Next yang hidup tapi tidak bisa menyentuh basis data sama sekali tidak
 * berguna — setiap layar akan galat. Jadi yang ditanyakan justru pertanyaan
 * yang paling murah sekaligus paling menentukan: apakah kueri bisa jalan.
 *
 * ── YANG SENGAJA TIDAK DIBOCORKAN ───────────────────────────────────────────
 * Titik ini terbuka untuk siapa pun yang bisa menjangkau porta ini. Maka ia
 * TIDAK menyebut versi Postgres, nama basis data, alamat, jumlah WO, maupun
 * pesan galat aslinya. Yang keluar cuma "bisa" atau "tidak", dan berapa migrasi
 * yang tercatat — angka yang berguna saat menerapkan, dan tidak berarti apa pun
 * bagi orang luar.
 *
 * ── KENAPA `komit` BOLEH IKUT, 17 Sep 2026 ──────────────────────────────────
 * Ia tampak melanggar alinea di atas, tapi tidak: tujuh huruf sidik commit
 * adalah penanda buram. Bagi orang luar ia tidak berarti apa-apa — tidak
 * menyebut teknologi, tidak menyebut versi, tidak bisa dipakai menyusun
 * serangan. Bagi yang punya repo, ia menjawab satu pertanyaan yang selama ini
 * hanya bisa dijawab dasbor Vercel: KODE MANA YANG SEDANG TAYANG.
 *
 * Itu penting karena yang menulis kode di sini belum tentu punya akun Vercel —
 * anggota Vercel berbayar, dan repo ini dikerjakan berdua. Tanpa baris ini,
 * orang kedua mendorong perubahan lalu tidak punya satu pun cara memastikan
 * perubahannya benar-benar terbit; ia harus menunggu orang lain membukakan
 * dasbor. Dua perubahan pertamanya persis mengalami itu.
 *
 * `VERCEL_GIT_COMMIT_SHA` diisi Vercel sendiri saat membangun. Di laptop ia
 * tidak ada, dan jawabannya `lokal` — yang juga informasi berguna: berarti yang
 * sedang dibuka bukan hasil penerapan.
 */
export async function GET(): Promise<Response> {
  const komit = process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 7) || 'lokal';
  try {
    const [r] = await sql<{ migrasi: number }[]>`
      SELECT coalesce(
        (SELECT count(*)::int FROM schema_migrations), 0
      ) AS migrasi
    `;
    return Response.json(
      { ok: true, basisData: 'terhubung', migrasi: r?.migrasi ?? 0, komit },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    /* Galat aslinya sengaja tidak diteruskan: ia biasanya memuat alamat, nama
       basis data, dan kadang kata sandi. Yang perlu tahu sebabnya membaca log
       wadahnya, bukan jawaban HTTP terbuka ini. */
    /* `komit` ikut juga di cabang gagal — justru di sinilah ia paling
       dibutuhkan. Pertanyaan pertama saat produksi mati selalu sama: penerapan
       yang mana yang mematikannya. */
    return Response.json(
      { ok: false, basisData: 'tidak terhubung', komit },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
