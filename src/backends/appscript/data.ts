import { panggilAppsScript } from './client.js';
import type { Identitas } from '../../lib/auth.js';
import type { KartuApproval } from '../../domain/kueriApproval.js';
import type { KartuTransfer } from '../../domain/kueriTransfer.js';

export function transformKatalogAppsScript(refs: any, tenantCode: string) {
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

  const jobs = Array.isArray(refs?.components)
    ? refs.components.map((c: any) => ({
        id: c.component_no || c.id,
        job_code: String(c.component_no || ''),
        job_description: String(c.component_name || ''),
        unit_model: String(c.unit_model || ''),
        component: String(c.category || 'General'),
        sub_component: String(c.sub_category || c.component_name || ''),
        base_points: Number(c.base_points) || 0,
        plan_hours: Number(c.target_hours || c.plan_hours) || 0,
        section: String(c.section || 'field'),
        job_type: String(c.job_type || c.category || ''),
      }))
    : [];

  const mechanics = Array.isArray(refs?.mechanics) ? refs.mechanics : [];
  const mekanik = mechanics.map((m: any) => ({
    id: Number(m.mechanic_id || m.id),
    name: String(m.mechanic_name || m.name || ''),
    jabatan: String(m.jabatan_aktual || m.role || ''),
    sections: Array.isArray(m.sections) ? m.sections.map(String) : [],
  }));

  const workConditions = Array.isArray(refs?.work_conditions)
    ? refs.work_conditions
    : [
        { key: 'normal', label: 'Normal', faktor: 1.0 },
        { key: 'difficult', label: 'Malam/Hujan', faktor: 1.2 },
        { key: 'extreme', label: 'Resiko Tinggi', faktor: 1.5 },
      ];

  const kondisi = workConditions.map((w: any) => ({
    kunci: String(w.key || w.value || 'normal'),
    label: String(w.label || w.key || 'Normal'),
    faktor: Number(w.faktor || w.factor || 1.0),
  }));

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

export function bandingkanTerbaru(a: any, b: any): number {
  const tA = new Date(a.created_at || a.submitted_at || a.dibuat_at || a.date || 0).getTime();
  const tB = new Date(b.created_at || b.submitted_at || b.dibuat_at || b.date || 0).getTime();
  if (!isNaN(tA) && !isNaN(tB) && tA > 0 && tB > 0 && tA !== tB) {
    return tB - tA; // tanggal terbaru di awal
  }
  const idA = Number(a.id || a.wo_id || (typeof a.wo_number === 'string' ? a.wo_number.replace(/\D/g, '') : 0)) || 0;
  const idB = Number(b.id || b.wo_id || (typeof b.wo_number === 'string' ? b.wo_number.replace(/\D/g, '') : 0)) || 0;
  return idB - idA;
}

export function transformKartuApprovalAppsScript(w: any): KartuApproval {
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

export function transformKartuTransferAppsScript(w: any): KartuTransfer {
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

/**
 * Handler utama pembacaan data via Google Apps Script backend.
 */
export async function handleDataAppsScript(
  jenis: string | null,
  url: URL,
  aku: Identitas,
  token: string | null | undefined,
): Promise<any> {
  if (jenis === 'aku') return aku;

  if (jenis === 'katalog') {
    const gasRes = await panggilAppsScript(token, 'pull_create_refs');
    const refs = (gasRes.result as any)?.refs ?? gasRes.result ?? {};
    return transformKatalogAppsScript(refs, aku.tenantCode);
  }

  if (jenis === 'wo_saya') {
    const gasRes = await panggilAppsScript(token, 'pull_my_wos');
    const wos = (gasRes.result as any)?.wos ?? gasRes.result ?? [];
    return wos;
  }

  if (jenis === 'approval') {
    const dimintaTab = url.searchParams.get('tab') ?? 'menunggu';
    const semua = url.searchParams.get('semua') === '1';
    const batas = semua ? 100 : 10;

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
    let total = 0;

    if (dimintaTab === 'transfer') {
      const listTransfer = rawList
        .filter((w: any) => String(w.status) === 'pending_transfer')
        .sort(bandingkanTerbaru);
      total = listTransfer.length;
      transfer = listTransfer.slice(0, batas).map(transformKartuTransferAppsScript);
    } else {
      const listKartu = (dimintaTab === 'menunggu'
        ? rawList.filter((w: any) => String(w.status) !== 'pending_transfer')
        : rawList
      ).sort(bandingkanTerbaru);
      total = listKartu.length;
      kartu = listKartu.slice(0, batas).map(transformKartuApprovalAppsScript);
    }

    const hitung = {
      menunggu: dimintaTab === 'menunggu' ? total : (Array.isArray(resObj.pending) ? resObj.pending.filter((w: any) => String(w.status) !== 'pending_transfer').length : 0),
      aktif: dimintaTab === 'aktif' ? total : 0,
      approved: dimintaTab === 'approved' ? total : 0,
      transfer: dimintaTab === 'transfer' ? total : (Array.isArray(resObj.pending) ? resObj.pending.filter((w: any) => String(w.status) === 'pending_transfer').length : 0),
      ditolak: dimintaTab === 'ditolak' ? total : 0,
    };

    return {
      peran: aku.peran,
      tab: dimintaTab,
      semua,
      hitung,
      kartu,
      transfer,
      penerima: [],
      total,
    };
  }

  if (jenis === 'monitoring') {
    const gasRes = await panggilAppsScript(token, 'pull_monitoring');
    const hasil = gasRes.result ?? {};
    return {
      sebagai: hasil.sebagai ?? 0,
      sendiri: hasil.sendiri ?? true,
      orang: hasil.orang ?? null,
      tab: hasil.tab ?? 'assigned',
      hitung: hasil.hitung ?? {},
      daftar: hasil.daftar ?? [],
      bekal: hasil.bekal ?? [],
      detail: hasil.detail ?? {},
    };
  }

  return null;
}
