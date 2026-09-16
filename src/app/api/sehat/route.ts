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
 */
export async function GET(): Promise<Response> {
  try {
    const [r] = await sql<{ migrasi: number }[]>`
      SELECT coalesce(
        (SELECT count(*)::int FROM schema_migrations), 0
      ) AS migrasi
    `;
    return Response.json(
      { ok: true, basisData: 'terhubung', migrasi: r?.migrasi ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    /* Galat aslinya sengaja tidak diteruskan: ia biasanya memuat alamat, nama
       basis data, dan kadang kata sandi. Yang perlu tahu sebabnya membaca log
       wadahnya, bukan jawaban HTTP terbuka ini. */
    return Response.json(
      { ok: false, basisData: 'tidak terhubung' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
