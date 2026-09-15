import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakDitemukan } from '../../../lib/errors.js';
import {
  antreanApproval, katalog, rincianWo, statusKiriman, woSaya,
} from '../../../domain/kueri.js';

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
      case 'kiriman': {
        // Aman ditekan berkali-kali — itulah gunanya. Tidak menulis apa pun.
        const opId = url.searchParams.get('op_id');
        if (!opId || opId.length < 8) throw masukanTidakSah('Parameter op_id tidak sah');
        return jawab(await statusKiriman(aku, opId));
      }
      default:
        throw masukanTidakSah(
          'Parameter "jenis" wajib: aku | antrean | wo_saya | katalog | wo | kiriman',
        );
    }
  } catch (e) {
    return jawabGalat(e);
  }
}
