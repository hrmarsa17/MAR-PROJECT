import { akuDari, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakBerhak } from '../../../lib/errors.js';
import { dataPayroll, type PeriodePermintaan } from '../../../domain/kueriPayroll.js';
import { workbookPayroll } from '../../../domain/excelPayroll.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export payroll sebagai berkas XLSX.
 *
 * GET karena ia BACAAN: tidak ada yang berubah, tidak butuh op_id, dan tautannya
 * boleh dibuka ulang. Yang tidak boleh dibuka ulang adalah perintah — dan ini
 * bukan perintah.
 *
 * Gerbangnya `may_view_report` DI SINI, bukan cuma di menu. Di KMB V2 halaman
 * reports dibatasi L2 sementara fungsi di belakangnya menerima L1 juga —
 * gerbang layar bukan gerbang data.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    if (!aku.bolehLihat.report) {
      throw tidakBerhak('Anda tidak berhak mengunduh laporan payroll.');
    }

    const u = new URL(req.url);
    const mode = u.searchParams.get('mode');
    if (mode !== 'month' && mode !== 'range') {
      throw masukanTidakSah('Parameter mode wajib: month | range');
    }

    const minta: PeriodePermintaan = {
      mode,
      ...(u.searchParams.get('tahun') ? { tahun: Number(u.searchParams.get('tahun')) } : {}),
      ...(u.searchParams.get('bulan') ? { bulan: Number(u.searchParams.get('bulan')) } : {}),
      ...(u.searchParams.get('mulai') ? { mulai: u.searchParams.get('mulai')! } : {}),
      ...(u.searchParams.get('akhir') ? { akhir: u.searchParams.get('akhir')! } : {}),
      ...(u.searchParams.get('section') ? { section: u.searchParams.get('section')! } : {}),
    };

    const data = await dataPayroll(aku, minta);

    // `ringkas` saja tidak cukup untuk memutuskan berkasnya layak: laporan
    // boleh berisi nol mekanik kalau seluruh poinnya nol, dan itu BUKAN galat.
    if (u.searchParams.get('pratinjau') === '1') {
      return Response.json({
        ok: true,
        data: {
          periodeLabel: data.periodeLabel,
          statistik: data.statistik,
          dikecualikan: data.dikecualikan,
          barisDetail: data.detail.length,
        },
      });
    }

    const buf = await workbookPayroll(data);

    /* NAMA BERKAS PUNYA DUA BENTUK, dan itu bukan kerapian.
       Header HTTP hanya menerima Latin-1. Label periode memuat EN DASH
       ("16 Agt – 15 Sep 2026") yang di luar jangkauan itu, dan menaruhnya
       apa adanya membuat seluruh permintaan gagal dengan galat yang sama
       sekali tidak menyebut-nyebut nama berkas.

         filename=   bentuk ASCII, untuk peramban lama
         filename*=  bentuk UTF-8 (RFC 5987), yang sebenarnya dipakai

       Karakter yang haram di nama berkas Windows ikut dibuang — berkas ini
       mendarat di Unduhan, bukan di server. */
    const bersih = data.periodeLabel.replace(/[\/:*?"<>|]/g, '-');
    const utf8 = `Payroll ${bersih}.xlsx`;
    const ascii = utf8.replace(/[^ -~]/g, '-');

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          `attachment; filename="${ascii}"; `
          + `filename*=UTF-8''${encodeURIComponent(utf8)}`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return jawabGalat(e);
  }
}
