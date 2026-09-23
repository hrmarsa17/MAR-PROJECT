import { akuDari, tokenDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakBerhak, tidakDitemukan } from '../../../lib/errors.js';
import { pakaiAppsScript } from '../../../lib/backendConfig.js';
import { panggilAppsScript } from '../../../lib/appscript.js';
import {
  antreanApproval, katalog, rincianWo, statusKiriman, woSaya,
} from '../../../domain/kueri.js';
import {
  bekalOverride, hitunganTab, kartuApproval, type KartuApproval, type TabApproval,
} from '../../../domain/kueriApproval.js';
import { calonPenerima, kartuTransfer, type KartuTransfer } from '../../../domain/kueriTransfer.js';
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

function transformKartuApprovalAppsScript(w: any): KartuApproval {
  let timList: string[] = [];
  if (Array.isArray(w.team_names) && w.team_names.length > 0) {
    timList = w.team_names.map((t: any) => typeof t === 'string' ? t : (t?.name ?? t?.mechanic_name ?? String(t)));
  } else if (Array.isArray(w.team) && w.team.length > 0) {
    timList = w.team.map((t: any) => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') return t.name ?? t.mechanic_name ?? t.nama ?? (t.mechanic_id ? `Mekanik #${t.mechanic_id}` : '');
      return String(t);
    }).filter(Boolean);
  } else if (Array.isArray(w.tim) && w.tim.length > 0) {
    timList = w.tim.map((t: any) => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') return t.name ?? t.mechanic_name ?? t.nama ?? (t.id ? `Mekanik #${t.id}` : '');
      return String(t);
    }).filter(Boolean);
  } else if (w.mechanic_name) {
    timList = [String(w.mechanic_name)];
  }

  const st = String(w.status || 'pending_supervisor');
  let tahap = 'Aktif';
  if (st === 'pending_supervisor') tahap = 'Level 1';
  else if (st === 'pending_superintendent') tahap = 'Level 2';
  else if (st === 'approved') tahap = 'Approved';
  else if (st === 'rejected') tahap = 'Ditolak';
  else if (st === 'cancelled') tahap = 'Dibatalkan';
  else if (st === 'pending_transfer') tahap = 'Transfer';
  else if (w.tahap) tahap = String(w.tahap);

  let ketepatan: 'on_time' | 'late' | 'way_late' | null = null;
  if (w.timeliness && typeof w.timeliness === 'object') {
    ketepatan = w.timeliness.status ?? null;
  } else if (w.ketepatan) {
    ketepatan = w.ketepatan;
  } else if (w.actual_hours != null && w.target_hours != null && Number(w.target_hours) > 0) {
    const rasio = Number(w.actual_hours) / Number(w.target_hours);
    ketepatan = rasio <= 1.0 ? 'on_time' : rasio <= 1.5 ? 'late' : 'way_late';
  }

  const wc = String(w.work_condition ?? w.kondisi ?? 'normal').toLowerCase();
  const wcLabel = wc === 'difficult' ? 'Malam/Hujan' : wc === 'extreme' ? 'Resiko Tinggi' : 'Normal';

  const dibuatAt = w.dibuat_at ?? w.created_at ?? w.created_at_str ?? w.date ?? '';
  const dikirimAt = w.dikirim_at ?? w.submitted_at ?? w.submitted_at_str ?? null;

  const jobNama = w.job_nama
    ?? w.component_name
    ?? w.others_description
    ?? w.job_description
    ?? w.job_name
    ?? w.description
    ?? (w.is_others ? 'Job Manual (Others)' : '—');

  const jobCode = w.job_code
    ?? w.component_no
    ?? w.component_id
    ?? (w.is_others ? 'OTHERS' : null);

  const jobKategori = w.job_kategori
    ?? w.category
    ?? w.component_category
    ?? (w.is_others ? 'Custom Job' : null);

  const unitCode = w.unit_code ?? w.unit_id ?? w.unit_no ?? null;
  const unitNama = w.unit_nama ?? w.unit_name ?? w.unit_model ?? (unitCode ? `Unit ${unitCode}` : null);
  const lokasi = w.lokasi ?? w.location ?? null;

  return {
    id: Number(w.id ?? w.wo_id ?? (w.wo_number ? String(w.wo_number).replace(/\D/g, '') : 0)) || 0,
    wo_number: String(w.wo_number ?? w.woNumber ?? w.id ?? ''),
    status: st,
    tahap,
    dibuat_mekanik: Boolean(w.is_mechanic_created ?? w.dibuat_mekanik ?? false),
    ketepatan,

    job_code: jobCode ? String(jobCode) : null,
    job_nama: jobNama ? String(jobNama) : '—',
    job_kategori: jobKategori ? String(jobKategori) : null,

    unit_code: unitCode ? String(unitCode) : null,
    unit_nama: unitNama ? String(unitNama) : null,
    unit_factor: w.unit_factor != null ? Number(w.unit_factor) : (w.others_unit_factor != null ? Number(w.others_unit_factor) : 1),
    lokasi: lokasi ? String(lokasi) : null,

    dibuat_at: dibuatAt ? String(dibuatAt) : '',
    dikirim_at: dikirimAt ? String(dikirimAt) : null,
    kondisi: wcLabel,
    actual_hours: w.actual_hours != null ? Number(w.actual_hours) : null,
    target_hours: w.target_hours != null ? Number(w.target_hours) : (w.others_target_hours != null ? Number(w.others_target_hours) : null),
    base_points: w.base_points != null ? Number(w.base_points) : (w.others_base_points != null ? Number(w.others_base_points) : null),

    keterangan: w.keterangan ? String(w.keterangan) : (w.notes ? String(w.notes) : null),
    tim: timList,
    l1_oleh: w.l1_oleh ? String(w.l1_oleh) : (w.approved_by_spv_name ? String(w.approved_by_spv_name) : null),
    putaran: Number(w.putaran ?? w.round ?? 1),
    ada_override: Boolean(w.ada_override ?? w.has_override ?? w.has_override_spv ?? w.has_override_supt),
    kembar_dicurigai: Boolean(w.kembar_dicurigai ?? w.is_suspected_duplicate ?? false),
    final_points: w.final_points != null ? Number(w.final_points) : (w.points != null ? Number(w.points) : null),
  };
}

function transformKartuTransferAppsScript(w: any): KartuTransfer {
  const timRaw = Array.isArray(w.team) ? w.team : Array.isArray(w.tim) ? w.tim : [];
  const tim = timRaw.map((t: any, idx: number) => ({
    mechanicId: Number(t?.mechanic_id ?? t?.mechanicId ?? t?.id ?? idx + 1),
    nama: String(t?.name ?? t?.mechanic_name ?? t?.nama ?? t ?? ''),
  }));

  return {
    transferId: Number(w.transfer_id ?? w.id ?? 0),
    woId: Number(w.wo_id ?? w.id ?? 0),
    woNumber: String(w.wo_number ?? w.woNumber ?? w.id ?? ''),
    section: w.section ? String(w.section) : null,
    keterangan: w.keterangan ? String(w.keterangan) : null,
    dimintaOleh: String(w.transfer_requested_by_name ?? w.created_by_name ?? w.requested_by ?? 'Mekanik'),
    dimintaAt: String(w.transfer_requested_at ?? w.created_at ?? new Date().toISOString()),
    catatan: w.transfer_note ? String(w.transfer_note) : (w.catatan ? String(w.catatan) : null),
    sessionHours: Number(w.session_hours ?? w.actual_hours ?? 0),
    partialSekarang: Number(w.partial_hours ?? w.actual_hours ?? 0),
    partialSesudah: Number(w.partial_hours_after ?? w.actual_hours ?? 0),
    tim,
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
        const resObj = (gasRes.result as any) ?? {};
        const rawList = Array.isArray(resObj[dimintaTab]) ? resObj[dimintaTab]
                      : Array.isArray(resObj.pending) ? resObj.pending
                      : Array.isArray(resObj.active) ? resObj.active
                      : Array.isArray(resObj.approved) ? resObj.approved
                      : Array.isArray(resObj.rejected) ? resObj.rejected
                      : Array.isArray(gasRes.result) ? gasRes.result
                      : [];

        let kartu: KartuApproval[] = [];
        let transfer: KartuTransfer[] = [];

        if (dimintaTab === 'transfer') {
          const listTransfer = rawList.filter((w: any) => String(w.status) === 'pending_transfer');
          transfer = listTransfer.map(transformKartuTransferAppsScript);
        } else {
          const listKartu = dimintaTab === 'menunggu'
            ? rawList.filter((w: any) => String(w.status) !== 'pending_transfer')
            : rawList;
          kartu = listKartu.map(transformKartuApprovalAppsScript);
        }

        const total = dimintaTab === 'transfer' ? transfer.length : kartu.length;

        // Hitungan per tab
        const hitung = {
          menunggu: dimintaTab === 'menunggu' ? kartu.length : (Array.isArray(resObj.pending) ? resObj.pending.filter((w: any) => String(w.status) !== 'pending_transfer').length : 0),
          aktif: dimintaTab === 'aktif' ? kartu.length : 0,
          approved: dimintaTab === 'approved' ? kartu.length : 0,
          transfer: dimintaTab === 'transfer' ? transfer.length : (Array.isArray(resObj.pending) ? resObj.pending.filter((w: any) => String(w.status) === 'pending_transfer').length : 0),
          ditolak: dimintaTab === 'ditolak' ? kartu.length : 0,
        };

        return jawab({
          peran: aku.peran,
          tab: dimintaTab,
          semua: false,
          hitung,
          kartu,
          transfer,
          penerima: [],
          total,
        });
      }

      if (jenis === 'monitoring') {
        const gasRes = await panggilAppsScript(token, 'pull_monitoring');
        const hasil = gasRes.result ?? {};
        // Pastikan struktur data yang dikirim ke klien lengkap
        return jawab({
          sebagai: hasil.sebagai ?? 0,
          sendiri: hasil.sendiri ?? true,
          orang: hasil.orang ?? null,
          tab: hasil.tab ?? 'assigned',
          hitung: hasil.hitung ?? {},
          daftar: hasil.daftar ?? [],
          bekal: hasil.bekal ?? [],
          detail: hasil.detail ?? {},
        });
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
