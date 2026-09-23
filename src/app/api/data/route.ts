import { akuDari, tokenDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakBerhak, tidakDitemukan } from '../../../lib/errors.js';
import { pakaiAppsScript } from '../../../lib/backendConfig.js';
import { panggilAppsScript } from '../../../lib/appscript.js';
import {
  antreanApproval, katalog, rincianWo, statusKiriman, woSaya,
} from '../../../domain/kueri.js';
import {
  bekalOverride, hitunganTab, kartuApproval, type TabApproval,
} from '../../../domain/kueriApproval.js';
import { calonPenerima, kartuTransfer } from '../../../domain/kueriTransfer.js';
import { pratinjauSurut } from '../../../domain/terapkanSurut.js';
import { pratinjauFaktorSurut } from '../../../domain/surutFaktor.js';
import { pratinjauTarifSurut } from '../../../domain/surutTarif.js';
import { riwayatAudit, type KategoriAudit } from '../../../domain/kueriAudit.js';
import {
  bolehLihatMekanikLain, hitunganTabMekanik, mekanikDilihat, woMekanik,
  type TabWoMekanik,
} from '../../../domain/kueriWoMekanik.js';
import { bekalForm, detailUntukWo } from '../../../domain/kueriDetailForm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function transformKatalogAppsScript(refs: any, tenantCode: string) {
  const sections = Array.isArray(refs?.sections)
    ? refs.sections.map((s: any) =>
        typeof s === 'string'
          ? { code: s, name: s.charAt(0).toUpperCase() + s.slice(1) }
          : { code: String(s.code || s.id), name: String(s.name || s.code) },
      )
    : [];

  const units = Array.isArray(refs?.units)
    ? refs.units.map((u: any) => ({
        id: u.unit_id || u.id,
        unit_code: String(u.unit_id || u.code || ''),
        unit_name: String(u.unit_name || u.name || ''),
        unit_factor: Number(u.unit_factor) || 1,
        unit_model: String(u.unit_model || ''),
        is_global: Boolean(u.is_global),
        is_virtual: Boolean(u.is_virtual),
        sections: Array.isArray(u.unit_scope)
          ? u.unit_scope.map(String)
          : Array.isArray(u.sections)
            ? u.sections.map(String)
            : [],
      }))
    : [];

  const rawJobsField = Array.isArray(refs?.jobs_field)
    ? refs.jobs_field.map((j: any) => ({ ...j, section: 'field' }))
    : [];
  const rawJobsWorkshop = Array.isArray(refs?.jobs_workshop)
    ? refs.jobs_workshop.map((j: any) => ({ ...j, section: 'workshop' }))
    : [];
  const rawJobsGeneric = Array.isArray(refs?.jobs) ? refs.jobs : [];
  const allJobs = [...rawJobsField, ...rawJobsWorkshop, ...rawJobsGeneric];

  const jobs = allJobs.map((j: any) => ({
    id: j.job_id || j.id,
    job_code: String(j.job_id || j.code || ''),
    section: String(j.section || 'field'),
    unit_model: String(j.unit_model || ''),
    component: String(j.component || ''),
    sub_component: String(j.sub_component || ''),
    job_type: String(j.job_type || ''),
    job_description: String(j.job_description || j.description || j.nama || ''),
    plan_hours: Number(j.plan_hours) || 1,
    base_points: Number(j.base_point || j.base_points) || 1,
  }));

  const mekanik = Array.isArray(refs?.mechanics)
    ? refs.mechanics.map((m: any) => ({
        id: m.mechanic_id || m.id,
        name: String(m.mechanic_name || m.name || ''),
        role: String(m.role || 'mechanic'),
        sections: Array.isArray(m.sections)
          ? m.sections.map(String)
          : m.section
            ? [String(m.section)]
            : [],
        jabatan: String(m.position || m.jabatan || ''),
      }))
    : [];

  const kondisi = Array.isArray(refs?.work_conditions)
    ? refs.work_conditions.map((k: any) => ({
        kunci: String(k.key || k.kunci),
        faktor: Number(k.factor || k.faktor) || 1,
        label: String(k.label || k.key || ''),
      }))
    : [
        { kunci: 'normal', faktor: 1, label: 'Shift 1' },
        { kunci: 'difficult', faktor: 1.1, label: 'Shift 2' },
        { kunci: 'extreme', faktor: 1.2, label: 'Kondisi Ekstrim' },
      ];

  return {
    sections,
    units,
    jobs,
    mekanik,
    kondisi,
    meter: (refs?.meter && typeof refs.meter === 'object') ? refs.meter : {},
    tenantCode: tenantCode || 'KMB',
  };
}

/** Bacaan. Tidak butuh op_id — tidak ada yang berubah. */
export async function GET(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    const url = new URL(req.url);
    const jenis = url.searchParams.get('jenis');

    if (pakaiAppsScript()) {
      const token = await tokenDari(req);
      if (jenis === 'aku') return jawab(aku);

      if (jenis === 'katalog') {
        const gasRes = await panggilAppsScript(token, 'pull_create_refs');
        const refs = (gasRes.result as any)?.refs ?? gasRes.result ?? {};
        const katalogHasil = transformKatalogAppsScript(refs, aku.tenantCode);
        return jawab(katalogHasil);
      }

      if (jenis === 'wo_saya') {
        const gasRes = await panggilAppsScript(token, 'pull_my_wos');
        const wos = (gasRes.result as any)?.wos ?? gasRes.result ?? [];
        return jawab(wos);
      }

      if (jenis === 'approval') {
        const dimintaTab = url.searchParams.get('tab') ?? 'menunggu';
        const aksi = dimintaTab === 'aktif' ? 'pull_active'
                   : dimintaTab === 'approved' ? 'pull_approved'
                   : dimintaTab === 'ditolak' ? 'pull_rejected'
                   : 'pull_pending';
        const gasRes = await panggilAppsScript(token, aksi);
        const kartu = (gasRes.result && ((gasRes.result as any)[dimintaTab] || (gasRes.result as any).pending || (gasRes.result as any).active || (gasRes.result as any).approved || (gasRes.result as any).rejected)) || gasRes.result || [];
        const kartuArr = Array.isArray(kartu) ? kartu : [];
        return jawab({
          peran: aku.peran,
          tab: dimintaTab,
          semua: false,
          hitung: { menunggu: kartuArr.length, aktif: 0, approved: 0, transfer: 0, ditolak: 0 },
          kartu: kartuArr,
          transfer: [],
          penerima: [],
          total: kartuArr.length,
        });
      }

      if (jenis === 'monitoring') {
        const gasRes = await panggilAppsScript(token, 'pull_monitoring');
        return jawab(gasRes.result ?? {});
      }
    }

    switch (jenis) {
      case 'aku':
        return jawab(aku);
      case 'antrean':
        return jawab(await antreanApproval(aku));
      case 'wo_saya':
        return jawab(await woSaya(aku));
      case 'katalog':
        return jawab(await katalog(aku));

      /* SELURUH bekal layar Monitoring untuk satu orang, dalam SATU jawaban.
         Sebelumnya semua ini dirender di server, yang berarti layar Monitoring
         tidak bisa dibuka sama sekali tanpa sinyal — padahal ia justru layar
         yang dipakai mekanik di pit untuk melapor.

         Dikumpulkan jadi satu, bukan empat panggilan: di sinyal lapangan,
         empat perjalanan bolak-balik adalah empat kesempatan untuk putus di
         tengah dan meninggalkan layar setengah terisi. */
      /* Bekal layar Approval, satu jawaban untuk satu tab. Alasannya sama
         dengan `monitoring`: layar yang dirender server tidak bisa dibuka tanpa
         sinyal, dan approval dari lapangan termasuk yang Gabriel minta bisa
         luring. */
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

        return jawab({
          peran: aku.peran, tab, semua, hitung, kartu, transfer, penerima,
          total: hitung[tab],
        });
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

        return jawab({
          sebagai, sendiri: sebagai === aku.mechanicId, orang, tab, hitung, daftar,
          bekal: [...bekal.values()],
          detail: Object.fromEntries(detail),
        });
      }
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
      /**
       * Riwayat perubahan. Isinya menyebut siapa mengubah apa jadi berapa —
       * termasuk nilai lama orang dan tarif — jadi gerbangnya menu Admin.
       */
      case 'audit': {
        if (!aku.bolehAdmin) throw tidakBerhak('Riwayat perubahan hanya untuk admin.');
        const k = url.searchParams.get('kategori');
        const aktor = url.searchParams.get('aktor');
        const sebelum = url.searchParams.get('sebelum');
        return jawab(await riwayatAudit(aku.tenantId, {
          kategori: (k as KategoriAudit | null) ?? 'semua',
          hanyaUang: url.searchParams.get('uang') === '1',
          aktorId: aktor && /^\d+$/.test(aktor) ? Number(aktor) : null,
          cari: url.searchParams.get('cari') ?? '',
          sebelum: sebelum && /^\d+$/.test(sebelum) ? Number(sebelum) : null,
          limit: Number(url.searchParams.get('limit') ?? 40),
        }));
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
