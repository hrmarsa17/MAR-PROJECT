import type { Identitas } from '../../lib/auth.js';
import { masukanTidakSah, tidakBerhak, tidakDitemukan } from '../../lib/errors.js';
import {
  antreanApproval, katalog, rincianWo, statusKiriman, woSaya,
} from '../../domain/kueri.js';
import {
  bekalOverride, hitunganTab, kartuApproval, type TabApproval,
} from '../../domain/kueriApproval.js';
import { calonPenerima, kartuTransfer } from '../../domain/kueriTransfer.js';
import { pratinjauSurut } from '../../domain/terapkanSurut.js';
import { pratinjauFaktorSurut } from '../../domain/surutFaktor.js';
import { pratinjauTarifSurut } from '../../domain/surutTarif.js';
import { riwayatAudit, type KategoriAudit } from '../../domain/kueriAudit.js';
import {
  bolehLihatMekanikLain, hitunganTabMekanik, mekanikDilihat, woMekanik,
  type TabWoMekanik,
} from '../../domain/kueriWoMekanik.js';
import { bekalForm, detailUntukWo } from '../../domain/kueriDetailForm.js';

/**
 * Handler utama pembacaan data via database PostgreSQL / Supabase.
 */
export async function handleDataSupabase(
  jenis: string | null,
  url: URL,
  aku: Identitas,
): Promise<any> {
  switch (jenis) {
    case 'aku':
      return aku;
    case 'antrean':
      return await antreanApproval(aku);
    case 'wo_saya':
      return await woSaya(aku);
    case 'katalog':
      return await katalog(aku);

    case 'approval': {
      if (aku.peran === 'mechanic') throw tidakBerhak('Layar ini untuk L1 dan L2.');

      const dimintaTab = url.searchParams.get('tab') ?? 'menunggu';
      const sahTab = ['menunggu', 'aktif', 'approved', 'transfer', 'ditolak'];
      const tab = (sahTab.includes(dimintaTab) ? dimintaTab : 'menunggu') as TabApproval;
      const semua = url.searchParams.get('semua') === '1';

      const [hitung, kartu, transfer, penerima] = await Promise.all([
        hitunganTab(aku),
        tab === 'transfer' ? Promise.resolve([]) : kartuApproval(aku, tab, semua ? 500 : 25),
        tab === 'transfer' ? kartuTransfer(aku) : Promise.resolve([]),
        tab === 'transfer' ? calonPenerima(aku) : Promise.resolve([]),
      ]);

      return {
        peran: aku.peran, tab, semua, hitung, kartu, transfer, penerima,
        total: hitung[tab],
      };
    }

    case 'monitoring': {
      const minta = url.searchParams.get('as');
      const sebagai = aku.peran === 'mechanic'
        ? aku.mechanicId
        : (minta ? Number(minta) : aku.mechanicId);
      if (!Number.isFinite(sebagai)) throw masukanTidakSah('as tidak sah');

      if (sebagai !== aku.mechanicId) {
        if (aku.peran === 'mechanic'
            || !(await bolehLihatMekanikLain(aku.mechanicId, sebagai))) {
          throw tidakBerhak('Mekanik itu di luar scope Anda.');
        }
      }

      const orang = await mekanikDilihat(aku.tenantId, sebagai);
      if (!orang) throw tidakDitemukan('Mekanik', sebagai);

      const dimintaTab = url.searchParams.get('tab');
      const tab: TabWoMekanik =
        dimintaTab === 'pending_approval' || dimintaTab === 'done'
          ? dimintaTab : 'assigned';

      const [hitung, daftar] = await Promise.all([
        hitunganTabMekanik(aku.tenantId, sebagai),
        woMekanik(aku.tenantId, sebagai, tab),
      ]);
      const [bekal, detail] = await Promise.all([
        bekalForm(aku.tenantId),
        detailUntukWo(aku.tenantId, daftar.map((w) => w.id)),
      ]);

      return {
        sebagai, sendiri: sebagai === aku.mechanicId, orang, tab, hitung, daftar,
        bekal: [...bekal.values()],
        detail: Object.fromEntries(detail),
      };
    }

    case 'wo': {
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        throw masukanTidakSah('Parameter id tidak sah');
      }
      const r = await rincianWo(aku, id);
      if (!r) throw tidakDitemukan('Work order', id);
      return r;
    }

    case 'override': {
      const id = Number(url.searchParams.get('wo_id'));
      if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter wo_id tidak sah');
      const b = await bekalOverride(aku, id);
      if (!b) throw tidakDitemukan('Work order', id);
      return b;
    }

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
      return await pratinjauSurut(aku.tenantId, jobId, bp, ph);
    }

    case 'pratinjau_faktor': {
      if (!aku.bolehAdmin) throw tidakBerhak('Pratinjau ini hanya untuk admin.');
      const id = Number(url.searchParams.get('id'));
      const nilai = Number(url.searchParams.get('nilai'));
      if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter id tidak sah');
      if (!Number.isFinite(nilai) || nilai < 0) {
        throw masukanTidakSah('Parameter nilai tidak sah');
      }
      return await pratinjauFaktorSurut(aku.tenantId, id, nilai);
    }

    case 'pratinjau_tarif': {
      if (!aku.bolehAdmin) throw tidakBerhak('Pratinjau ini hanya untuk admin.');
      const id = Number(url.searchParams.get('id'));
      const nilai = Number(url.searchParams.get('nilai'));
      if (!Number.isInteger(id) || id <= 0) throw masukanTidakSah('Parameter id tidak sah');
      if (!(nilai > 0)) throw masukanTidakSah('Parameter nilai harus lebih dari 0');
      return await pratinjauTarifSurut(aku.tenantId, id, nilai);
    }

    case 'audit': {
      if (!aku.bolehAdmin) throw tidakBerhak('Riwayat perubahan hanya untuk admin.');
      const k = url.searchParams.get('kategori');
      const aktor = url.searchParams.get('aktor');
      const sebelum = url.searchParams.get('sebelum');
      return await riwayatAudit(aku.tenantId, {
        kategori: (k as KategoriAudit | null) ?? 'semua',
        hanyaUang: url.searchParams.get('uang') === '1',
        aktorId: aktor && /^\d+$/.test(aktor) ? Number(aktor) : null,
        cari: url.searchParams.get('cari') ?? '',
        sebelum: sebelum && /^\d+$/.test(sebelum) ? Number(sebelum) : null,
        limit: Number(url.searchParams.get('limit') ?? 40),
      });
    }

    case 'kiriman': {
      const opId = url.searchParams.get('op_id');
      if (!opId || opId.length < 8) throw masukanTidakSah('Parameter op_id tidak sah');
      return await statusKiriman(aku, opId);
    }

    default:
      throw masukanTidakSah(
        'Parameter "jenis" wajib: aku | antrean | wo_saya | katalog | wo | kiriman '
        + '| override | pratinjau_surut',
      );
  }
}
