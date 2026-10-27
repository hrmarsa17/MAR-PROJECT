import { panggilAppsScript } from './client.js';
import type { Identitas } from '../../lib/auth.js';
import type { KartuApproval } from '../../domain/kueriApproval.js';
import type { KartuTransfer } from '../../domain/kueriTransfer.js';
import type { KartuMekanik, RingkasMonitoring } from '../../domain/kueriMonitoring.js';
import type { KartuWoMekanik, TabWoMekanik } from '../../domain/kueriWoMekanik.js';
import type { DataTeknisTyre } from '../../domain/kueriTeknisTyre.js';
import type { JenisMeter, RiwayatMeter } from '../../domain/meter.js';


import { normalisasiSection, SECTIONS_BAKU_KMB } from '../../domain/sections.js';

export function transformKatalogAppsScript(refs: any, tenantCode: string) {
  const sections = Array.isArray(refs?.sections) && refs.sections.length > 0
    ? refs.sections.map((s: any) => {
        const rawCode = typeof s === 'string' ? s : String(s.code || s.id);
        const rawName = typeof s === 'string' ? '' : String(s.name || '');
        const norm = normalisasiSection(rawCode, rawName);
        return {
          code: norm.code,
          name: norm.name,
          picker_style: norm.code === 'vessel' ? 'flat' : 'cascade',
          requires_unit: norm.code !== 'workshop',
        };
      })
    : SECTIONS_BAKU_KMB.map((s) => ({
        code: s.code,
        name: s.name,
        picker_style: s.code === 'vessel' ? 'flat' : 'cascade',
        requires_unit: s.code !== 'workshop',
      }));

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
    const asParam = url.searchParams.get('as');
    const dimintaTab = url.searchParams.get('tab') ?? 'assigned';
    const tab: TabWoMekanik =
      dimintaTab === 'pending_approval' || dimintaTab === 'done'
        ? dimintaTab
        : 'assigned';

    let tokenToUse = token;
    let targetName = aku.nama;
    let targetMechId = aku.mechanicId;

    if (asParam) {
      try {
        const monRes = await panggilAppsScript(token, 'pull_monitoring');
        const mechanics = (monRes.result as any)?.mechanics || [];
        const match = mechanics.find((m: any, idx: number) => {
          const rawId = Number(String(m.id || '').replace(/\D/g, '')) || idx + 1;
          return String(rawId) === String(asParam) ||
                 String(m.id).toLowerCase() === String(asParam).toLowerCase() ||
                 String(m.mechanic_id || '').toLowerCase() === String(asParam).toLowerCase() ||
                 String(m.token || '').toLowerCase() === String(asParam).toLowerCase();
        });
        if (match && match.token) {
          tokenToUse = match.token;
          targetName = match.name || targetName;
          targetMechId = Number(String(match.id || '').replace(/\D/g, '')) || Number(asParam) || targetMechId;
        }
      } catch (err) {
        console.warn('Gagal mencari token mekanik untuk asParam:', asParam, err);
      }
    }

    // Untuk tampilan LayarMekanik (daftar WO mekanik), panggil pull_my_wos
    const gasRes = await panggilAppsScript(tokenToUse, 'pull_my_wos');
    const rawList = Array.isArray((gasRes.result as any)?.wos)
      ? (gasRes.result as any).wos
      : Array.isArray(gasRes.result)
      ? gasRes.result
      : [];

    const allWos: KartuWoMekanik[] = rawList.map((w: any, idx: number) => {
      const st = String(w.status || 'pending_mechanic_work');
      let statusGroup: TabWoMekanik = 'assigned';
      if (st === 'pending_mechanic_work') statusGroup = 'assigned';
      else if (st === 'approved') statusGroup = 'done';
      else statusGroup = 'pending_approval';

      let statusLabel = 'Assigned';
      if (st === 'pending_mechanic_work') statusLabel = 'Assigned';
      else if (st === 'pending_supervisor') statusLabel = 'L1 Approval';
      else if (st === 'pending_superintendent') statusLabel = 'L2 Approval';
      else if (st === 'approved') statusLabel = 'Approved';
      else if (st === 'pending_transfer') statusLabel = 'Transfer';
      else statusLabel = st;

      const rawId = Number(String(w.id || '').replace(/\D/g, '')) || idx + 1;

      const timList = Array.isArray(w.team) && w.team.length > 0 ? w.team.map((t: any, tidx: number) => ({
        mechanicId: Number(String(t.mechanic_id || t.id || tidx + 1).replace(/\D/g, '')) || tidx + 1,
        nama: String(t.name || t.mechanic_name || 'Mekanik'),
        akuSendiri: Boolean(t.is_me || (String(t.name || '').toLowerCase() === String(targetName || '').toLowerCase())),
      })) : [{ mechanicId: targetMechId, nama: targetName, akuSendiri: true }];

      return {
        id: rawId,
        woNumber: String(w.wo_number || w.id || `WO-${rawId}`),
        status: st,
        statusLabel,
        statusGroup,
        jobNama: w.component_name || w.job_nama || w.job_name || '—',
        unitNama: w.unit_name || w.unit_nama || null,
        targetHours: w.target_hours != null ? Number(w.target_hours) : null,
        partialHours: Number(w.partial_hours || 0),
        lokasi: w.location ? String(w.location) : null,
        keterangan: w.keterangan ? String(w.keterangan) : null,
        hourMeter: w.hour_meter != null ? Number(w.hour_meter) : null,
        kilometers: w.kilometers != null ? Number(w.kilometers) : null,
        partCategory: w.part_type || w.part_category || w.partCategory || null,
        safetyIncident: Boolean(w.safety_incident),
        woGroupId: w.wo_group_id ? String(w.wo_group_id) : null,
        woGroupMode: w.wo_group_mode ? String(w.wo_group_mode) : null,
        grupTotal: w.grup_total != null ? Number(w.grup_total) : null,
        grupSelesai: w.grup_selesai != null ? Number(w.grup_selesai) : null,
        tim: timList,
        bolehKirim: st === 'pending_mechanic_work',
        catatanTransfer: w.transfer_note ? String(w.transfer_note) : null,
      };
    });

    const hitung = {
      assigned: allWos.filter((w) => w.statusGroup === 'assigned').length,
      pending_approval: allWos.filter((w) => w.statusGroup === 'pending_approval').length,
      done: allWos.filter((w) => w.statusGroup === 'done').length,
    };

    const daftar = allWos.filter((w) => w.statusGroup === tab);

    return {
      sebagai: asParam ? targetMechId : aku.mechanicId,
      sendiri: !asParam,
      orang: { nama: targetName },
      tab,
      hitung,
      daftar,
      bekal: [],
      detail: {},
    };
  }

  if (jenis === 'teknis') {
    return await dataTeknisTyreAppsScript(token);
  }

  if (jenis === 'meter') {
    const unit = url.searchParams.get('unit') || '';
    const tipe = (url.searchParams.get('tipe') || 'HM').toUpperCase() as JenisMeter;
    return await riwayatMeterAppsScript(token, unit, tipe);
  }

  return null;
}

/**
 * Mengambil ringkasan dan kartu monitoring mekanik untuk approver via Google Apps Script.
 */
export async function pullMonitoringAppsScript(
  token: string | null | undefined,
): Promise<{ ringkas: RingkasMonitoring; kartu: KartuMekanik[] }> {
  try {
    const gasRes = await panggilAppsScript(token, 'pull_monitoring');
    const res = (gasRes.result as any) ?? {};
    const rawMek = Array.isArray(res.mechanics) ? res.mechanics : [];
    const ov = res.overall || {};

    const ringkas: RingkasMonitoring = {
      mekanik: Number(ov.mechanics || rawMek.length || 0),
      perlu_diisi: Number(ov.pending_mechanic_work || 0),
      menunggu_approval: Number((ov.pending_l1 || 0) + (ov.pending_l2 || 0)),
      approved: Number(ov.approved || 0),
      periodeLabel: String(res.periode || 'Periode Berjalan'),
    };

    const kartu: KartuMekanik[] = rawMek.map((m: any, idx: number) => {
      const rawId = Number(String(m.id || '').replace(/\D/g, '')) || idx + 1;
      return {
        id: rawId,
        kode: String(m.id || `MECH-${idx + 1}`),
        nama: String(m.name || m.nama || 'Mekanik'),
        section: m.section ? String(m.section) : null,
        jabatan: m.jabatan ? String(m.jabatan) : null,
        akun_uji: false,
        perlu_diisi: Number(m.pending_mechanic_work || 0),
        menunggu_l1: Number(m.pending_l1 || 0),
        menunggu_l2: Number(m.pending_l2 || 0),
        approved: Number(m.approved || 0),
        token: m.token ? String(m.token) : null,
      };
    });

    return { ringkas, kartu };
  } catch (e) {
    console.error('Galat pullMonitoringAppsScript:', e);
    return {
      ringkas: {
        mekanik: 0,
        perlu_diisi: 0,
        menunggu_approval: 0,
        approved: 0,
        periodeLabel: 'Periode Berjalan',
      },
      kartu: [],
    };
  }
}

/**
 * Mengambil data Dashboard Teknis Tyre via Google Apps Script.
 */
export async function dataTeknisTyreAppsScript(
  token: string | null | undefined,
  demo = false,
): Promise<DataTeknisTyre> {
  try {
    const gasRes = await panggilAppsScript(token, 'dataDashboardTeknis', { demo });
    const res = (gasRes.result as any) ?? gasRes.data ?? {};

    return {
      ringkas: {
        unitTercatat: Number(res.ringkas?.unit ?? res.ringkas?.unitTercatat ?? 0),
        posisiTercatat: Number(res.ringkas?.posisi ?? res.ringkas?.posisiTercatat ?? 0),
        barisInspeksi: Number(res.ringkas?.baris_inspeksi ?? res.ringkas?.barisInspeksi ?? 0),
        barisRemove: Number(res.ringkas?.baris_removeinstal ?? res.ringkas?.barisRemove ?? 0),
        barisRepair: Number(res.ringkas?.baris_repair ?? res.ringkas?.barisRepair ?? 0),
      },
      kondisi: (res.kondisi || []).map((k: any, idx: number) => ({
        unitId: Number(String(k.unit || k.unit_id || idx + 1).replace(/\D/g, '')) || idx + 1,
        unitNama: String(k.unit_nama || k.unit || ''),
        pos: Number(k.pos || 0),
        rtd: k.rtd != null ? Number(k.rtd) : null,
        jejakRtd: Array.isArray(k.titik)
          ? k.titik.map((t: any) => Number(t.rtd || t))
          : Array.isArray(k.jejakRtd) ? k.jejakRtd : [],
        pressure: k.pressure != null ? Number(k.pressure) : null,
        dicatatAt: String(k.dicatat_at || k.at || ''),
        snTerpasang: k.sn_terpasang || k.sn || null,
        lifeKm: k.life_km != null ? Number(k.life_km) : null,
        umurHari: k.umur_hari != null ? Number(k.umur_hari) : null,
        sisaKm: k.sisa_km != null ? Number(k.sisa_km) : null,
        perkiraanGanti: k.perkiraan_ganti || k.perkiraan || null,
        kritis: Boolean(k.kritis),
      })),
      problemJenis: Array.isArray(res.problem?.jenis)
        ? res.problem.jenis.map((p: any) => ({
            label: String(p.label || p.problem || ''),
            jumlah: Number(p.jumlah || p.count || 0),
          }))
        : [],
      problemPosisi: Array.isArray(res.problem?.posisi)
        ? res.problem.posisi.map((p: any) => ({
            label: String(p.label || p.pos || ''),
            jumlah: Number(p.jumlah || p.count || 0),
          }))
        : [],
      riwayat: (res.riwayat || []).map((r: any, idx: number) => ({
        at: String(r.at || r.dicatat_at || ''),
        unitId: Number(String(r.unit_id || r.unit || idx + 1).replace(/\D/g, '')) || idx + 1,
        unitNama: String(r.unit_nama || r.unit || ''),
        pos: Number(r.pos || 0),
        removeSn: r.remove_sn || null,
        problem: r.problem || r.remove_problem || null,
        remarks: r.remarks || r.remove_remarks || null,
        instalSn: r.instal_sn || null,
        lokasi: r.lokasi || null,
      })),
      repair: (res.repair || []).map((rp: any) => ({
        sn: String(rp.sn || ''),
        merk: rp.merk ? String(rp.merk) : null,
        pattern: rp.pattern ? String(rp.pattern) : null,
        size: rp.size ? String(rp.size) : null,
        jumlah: Number(rp.jumlah || 0),
        terakhir: String(rp.terakhir || rp.at || ''),
      })),
      life: {
        selesai: (res.life?.selesai || []).map((s: any) => ({
          sn: String(s.sn || ''),
          pos: Number(s.pos || 0),
          merk: s.merk ? String(s.merk) : null,
          pattern: s.pattern ? String(s.pattern) : null,
          size: s.size ? String(s.size) : null,
          lifeKm: Number(s.life_km || s.lifeKm || 0),
          hari: Number(s.hari || 0),
          problem: s.problem || null,
          dilepasAt: String(s.turun_at || s.dilepasAt || ''),
        })),
        rataRata: res.life?.rata != null ? Number(res.life.rata) : (res.life?.rataRata != null ? Number(res.life.rataRata) : null),
        jumlah: Number(res.life?.jumlah || 0),
        target: res.life?.target != null ? Number(res.life.target) : null,
        rataMerk: (res.life?.per_merk || res.life?.rataMerk || []).map((m: any) => ({
          label: String(m.nama || m.label || ''),
          nilai: Number(m.rata ?? m.nilai ?? 0),
          sampel: Number(m.jumlah ?? m.sampel ?? 0),
        })),
        rataPosisi: (res.life?.per_posisi || res.life?.rataPosisi || []).map((p: any) => ({
          label: String(p.pos || p.label || ''),
          nilai: Number(p.rata ?? p.nilai ?? 0),
          sampel: Number(p.jumlah ?? p.sampel ?? 0),
        })),
      },
      mingguan: (res.mingguan || []).map((m: any) => ({
        label: String(m.label || ''),
        inspeksi: Number(m.inspeksi || 0),
        removeInstal: Number(m.removeinstal || m.removeInstal || 0),
        problem: Number(m.problem || 0),
      })),
      rtdKritis: res.rtd_kritis != null ? Number(res.rtd_kritis) : 3,
      targetLifeKm: res.target_life_km != null ? Number(res.target_life_km) : 40000,
    };
  } catch (e) {
    console.error('Galat dataTeknisTyreAppsScript:', e);
    return {
      ringkas: { unitTercatat: 0, posisiTercatat: 0, barisInspeksi: 0, barisRemove: 0, barisRepair: 0 },
      kondisi: [],
      problemJenis: [],
      problemPosisi: [],
      riwayat: [],
      repair: [],
      life: { selesai: [], rataRata: null, jumlah: 0, target: null, rataMerk: [], rataPosisi: [] },
      mingguan: [],
      rtdKritis: 3,
      targetLifeKm: 40000,
    };
  }
}

/**
 * Mengambil daftar unit yang memiliki meter dari katalog Apps Script.
 */
export async function unitBermeterAppsScript(
  token: string | null | undefined,
): Promise<{ id: number; kode: string; nama: string }[]> {
  try {
    const gasRes = await panggilAppsScript(token, 'pull_create_refs');
    const refs = (gasRes.result as any)?.refs ?? gasRes.result ?? {};
    const units = Array.isArray(refs?.units) ? refs.units : [];
    return units
      .filter((u: any) => !u.is_virtual)
      .map((u: any, idx: number) => ({
        id: Number(u.unit_id || u.id) || idx + 1,
        kode: String(u.unit_id || u.code || ''),
        nama: String(u.unit_name || u.name || u.unit_id || ''),
      }));
  } catch (e) {
    console.error('Galat unitBermeterAppsScript:', e);
    return [];
  }
}

/**
 * Mengambil riwayat bacaan HM / KM unit via Google Apps Script.
 */
export async function riwayatMeterAppsScript(
  token: string | null | undefined,
  unitIdOrCode: string | number,
  jenis: JenisMeter,
): Promise<RiwayatMeter> {
  const isKm = jenis === 'KM';
  const action = isKm ? 'riwayatKmUnit' : 'riwayatHmUnit';
  try {
    const gasRes = await panggilAppsScript(token, action, { unit_id: String(unitIdOrCode) });
    const res = (gasRes.result as any) ?? gasRes.data ?? {};

    const acuan = res.acuan ? {
      nilai: Number(res.acuan.nilai || 0),
      at: res.acuan.at
        ? (typeof res.acuan.at === 'number' ? new Date(res.acuan.at).toISOString() : String(res.acuan.at))
        : '',
      oleh: String(res.acuan.oleh_nama || res.acuan.oleh || ''),
      woNumber: String(res.acuan.wo_number || res.acuan.wo_id || ''),
      dariPanel: Boolean(res.acuan.panel || res.acuan.dariPanel),
    } : null;

    const panel = (res.panel || []).map((p: any) => ({
      nilai: Number(p.nilai ?? p.value_after ?? 0),
      at: p.at
        ? (typeof p.at === 'number' ? new Date(p.at).toISOString() : String(p.at))
        : '',
      alasan: String(p.alasan || p.reason || 'Penggantian panel'),
      oleh: p.oleh ? String(p.oleh) : null,
    }));

    const bacaan = (res.bacaan || []).map((b: any) => ({
      woId: Number(String(b.wo_id || b.id || 0).replace(/\D/g, '')) || 0,
      woNumber: String(b.wo_number || b.id || ''),
      at: b.at
        ? (typeof b.at === 'number' ? new Date(b.at).toISOString() : String(b.at))
        : '',
      section: b.section ? String(b.section) : null,
      oleh: b.oleh_nama || b.oleh ? String(b.oleh_nama || b.oleh) : null,
      nilai: Number(b.nilai ?? b[jenis.toLowerCase()] ?? 0),
      janggal: String(b.janggal || ''),
    }));

    return {
      acuan,
      panel,
      bacaan,
      ambangLompat: isKm ? 20000 : 2000,
    };
  } catch (e) {
    console.error(`Galat riwayatMeterAppsScript (${action}):`, e);
    return {
      acuan: null,
      panel: [],
      bacaan: [],
      ambangLompat: isKm ? 20000 : 2000,
    };
  }
}

