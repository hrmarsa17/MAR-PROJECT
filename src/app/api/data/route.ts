import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakDitemukan } from '../../../lib/errors.js';
import { antreanApproval, katalog, rincianWo, woSaya } from '../../../domain/kueri.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bacaan. Tidak butuh op_id — tidak ada yang berubah. */
export async function GET(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    const url = new URL(req.url);
    const jenis = url.searchParams.get('jenis');

    switch (jenis) {
      case 'aku':
        return jawab(aku);
      case 'antrean':
        return jawab(await antreanApproval(aku));
      case 'wo_saya':
        return jawab(await woSaya(aku));
      case 'katalog':
        return jawab(await katalog(aku));
      case 'wo': {
        const id = Number(url.searchParams.get('id'));
        if (!Number.isInteger(id) || id <= 0) {
          throw masukanTidakSah('Parameter id tidak sah');
        }
        const r = await rincianWo(aku, id);
        if (!r) throw tidakDitemukan('Work order', id);
        return jawab(r);
      }
      default:
        throw masukanTidakSah(
          'Parameter "jenis" wajib: aku | antrean | wo_saya | katalog | wo',
        );
    }
  } catch (e) {
    return jawabGalat(e);
  }
}
