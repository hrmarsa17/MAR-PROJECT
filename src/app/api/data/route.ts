import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakBerhak, tidakDitemukan } from '../../../lib/errors.js';
import {
  antreanApproval, katalog, rincianWo, statusKiriman, woSaya,
} from '../../../domain/kueri.js';
import { bekalOverride } from '../../../domain/kueriApproval.js';
import { pratinjauSurut } from '../../../domain/terapkanSurut.js';
import { pratinjauFaktorSurut } from '../../../domain/surutFaktor.js';
import { pratinjauTarifSurut } from '../../../domain/surutTarif.js';

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
      case 'override': {
        const id = Number(url.searchParams.get('wo_id'));
        if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter wo_id tidak sah');
        const b = await bekalOverride(aku, id);
        if (!b) throw tidakDitemukan('Work order', id);
        return jawab(b);
      }
      /**
       * Pratinjau "terapkan ke semua WO". Membaca saja, tapi yang dibacanya
       * adalah RUPIAH YANG SUDAH DIBAYAR per periode — karena itu gerbangnya
       * sama dengan menu Admin, bukan sekadar "sudah login".
       */
      case 'pratinjau_surut': {
        if (!aku.bolehAdmin) throw tidakBerhak('Pratinjau ini hanya untuk admin.');
        const jobId = Number(url.searchParams.get('job_id'));
        const bp = Number(url.searchParams.get('base_points'));
        const ph = Number(url.searchParams.get('plan_hours'));
        if (!Number.isInteger(jobId) || jobId <= 0) {
          throw masukanTidakSah('Parameter job_id tidak sah');
        }
        if (!(bp > 0) || !(ph > 0)) {
          throw masukanTidakSah('base_points dan plan_hours wajib lebih dari 0');
        }
        return jawab(await pratinjauSurut(aku.tenantId, jobId, bp, ph));
      }
      /**
       * Pratinjau dampak untuk FAKTOR dan TARIF — bentuk jawabannya sama dengan
       * `pratinjau_surut` supaya layar memakai satu komponen. Gerbangnya juga
       * sama: yang dibacanya rupiah yang sudah dibayar.
       */
      case 'pratinjau_faktor': {
        if (!aku.bolehAdmin) throw tidakBerhak('Pratinjau ini hanya untuk admin.');
        const id = Number(url.searchParams.get('id'));
        const nilai = Number(url.searchParams.get('nilai'));
        if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter id tidak sah');
        if (!Number.isFinite(nilai) || nilai < 0) {
          throw masukanTidakSah('Parameter nilai tidak sah');
        }
        return jawab(await pratinjauFaktorSurut(aku.tenantId, id, nilai));
      }
      case 'pratinjau_tarif': {
        if (!aku.bolehAdmin) throw tidakBerhak('Pratinjau ini hanya untuk admin.');
        const id = Number(url.searchParams.get('id'));
        const nilai = Number(url.searchParams.get('nilai'));
        if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter id tidak sah');
        if (!(nilai > 0)) throw masukanTidakSah('Parameter nilai harus lebih dari 0');
        return jawab(await pratinjauTarifSurut(aku.tenantId, id, nilai));
      }
      case 'kiriman': {
        // Aman ditekan berkali-kali — itulah gunanya. Tidak menulis apa pun.
        const opId = url.searchParams.get('op_id');
        if (!opId || opId.length < 8) throw masukanTidakSah('Parameter op_id tidak sah');
        return jawab(await statusKiriman(aku, opId));
      }
      default:
        throw masukanTidakSah(
          'Parameter "jenis" wajib: aku | antrean | wo_saya | katalog | wo | kiriman '
          + '| override | pratinjau_surut',
        );
    }
  } catch (e) {
    return jawabGalat(e);
  }
}
