import { panggilAppsScript } from './client.js';
import type { Identitas } from '../../lib/auth.js';
import {
  batasPeriode,
  type HasilPayroll,
  type PeriodePermintaan,
  type BarisDetail,
  type BarisRingkas,
} from '../../domain/kueriPayroll.js';
import { aturanBisnis } from '../../lib/errors.js';
import { normalisasiSectionCode, namaSection } from '../../domain/sections.js';

function parseDateSmart(val: any): number | null {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  const s = String(val).trim();
  // Tangani format DD/MM/YYYY atau DD-MM-YYYY
  const mDmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if (mDmy) {
    const d = Number(mDmy[1]);
    const m = Number(mDmy[2]);
    const y = Number(mDmy[3]);
    return new Date(y, m - 1, d).getTime();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function formatYmd(val: any): string | null {
  const ms = parseDateSmart(val);
  if (!ms) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHhMm(val: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (m) return `${m[1]!.padStart(2, '0')}:${m[2]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return null;
}

export async function dataPayrollAppsScript(
  token: string | null | undefined,
  aku: Identitas,
  minta: PeriodePermintaan,
): Promise<HasilPayroll> {
  const batas = batasPeriode(minta);
  const batasMulai = new Date(batas.y1, batas.m1 - 1, batas.d1, 0, 0, 0, 0).getTime();
  const batasAkhir = new Date(batas.y2, batas.m2 - 1, batas.d2, 23, 59, 59, 999).getTime();

  // 1. Ambil data master mekanik (untuk mapping nama, id, role, rate)
  const mechMap = new Map<string, { id: number; name: string; role: string; rate: number }>();
  try {
    const refsRes = await panggilAppsScript(token, 'pull_create_refs');
    const refs = (refsRes.result as any)?.refs ?? refsRes.result ?? {};
    const mechs = Array.isArray(refs?.mechanics) ? refs.mechanics : [];
    for (const m of mechs) {
      const mId = Number(m.mechanic_id || m.id || 0);
      const mName = String(m.mechanic_name || m.name || '').trim();
      const mRole = String(m.jabatan_aktual || m.role || 'Junior').trim();
      const mRate = Number(m.pay_rate || m.rate || m.rate_poin || 2500);
      const entry = { id: mId, name: mName, role: mRole, rate: mRate };
      if (mId) mechMap.set(String(mId), entry);
      if (mName) mechMap.set(mName.toLowerCase(), entry);
    }
  } catch (e) {
    console.warn('Gagal memuat refs mekanik Apps Script:', e);
  }

  // 2. Ambil data approved work orders
  const gasRes = await panggilAppsScript(token, 'pull_approved');
  const resObj = (gasRes.result as any) ?? {};
  const rawList: any[] = Array.isArray(resObj.approved)
    ? resObj.approved
    : Array.isArray(gasRes.result)
    ? (gasRes.result as any[])
    : [];

  const pilihSection = minta.section?.trim() && minta.section.trim() !== 'all'
    ? normalisasiSectionCode(minta.section.trim())
    : null;

  // 3. Saring berdasarkan status, tanggal approval/pembuatan, dan section
  const lolos = rawList.filter((w: any) => {
    // Saring section bila diminta
    if (pilihSection) {
      const rawSec = String(w.section || w.section_code || '');
      const sec = normalisasiSectionCode(rawSec);
      if (sec && sec !== pilihSection) return false;
    }

    // Saring rentang tanggal (prioritas: approved_at -> submitted_at -> created_at -> date)
    const tglRaw = w.approved_at ?? w.l2_at ?? w.superintendent_approved_at ?? w.submitted_at ?? w.dikirim_at ?? w.created_at ?? w.dibuat_at ?? w.date;
    const tMs = parseDateSmart(tglRaw);
    if (tMs !== null) {
      if (tMs < batasMulai || tMs > batasAkhir) return false;
    }

    return true;
  });

  if (lolos.length === 0) {
    throw aturanBisnis(
      'Tidak ada work order yang disetujui pada periode ini. Tidak ada yang bisa diekspor.',
    );
  }

  // 4. Bangun BarisDetail
  const detail: BarisDetail[] = [];
  for (const w of lolos) {
    let tim = Array.isArray(w.team) ? w.team : Array.isArray(w.tim) ? w.tim : [];
    if (tim.length === 0 && w.mechanic_name) {
      tim = [{ name: w.mechanic_name, mechanic_id: w.mechanic_id }];
    } else if (tim.length === 0 && w.mechanic_id) {
      tim = [{ mechanic_id: w.mechanic_id }];
    } else if (tim.length === 0) {
      tim = [{ name: aku.nama, mechanic_id: aku.mechanicId }];
    }

    const totalWoPoints = Number(w.final_points ?? w.points ?? w.base_points ?? 0);
    const woNum = String(w.wo_number || w.id || 'WO-');

    for (const t of tim) {
      const tId = typeof t === 'object' ? Number(t.mechanic_id ?? t.id ?? 0) : Number(t) || 0;
      const tName = typeof t === 'object' ? String(t.name ?? t.mechanic_name ?? t.nama ?? '') : String(t);
      const prof = (tId ? mechMap.get(String(tId)) : null) || (tName ? mechMap.get(tName.toLowerCase()) : null);

      const finalId = prof?.id || tId || aku.mechanicId;
      const finalName = prof?.name || tName || aku.nama;
      const finalRole = prof?.role || (finalId === aku.mechanicId ? (aku.peran === 'superintendent' ? 'Superintendent' : aku.peran === 'supervisor' ? 'Supervisor' : 'Senior') : 'Junior');
      const finalRate = prof?.rate || 2500;

      const share = typeof t === 'object' && t.share != null ? Number(t.share) : (1 / (tim.length || 1));
      const poinMekanik = Math.round(totalWoPoints * share * 100) / 100;
      const idr = Math.round(poinMekanik * finalRate);

      detail.push({
        mekanikId: finalId,
        mekanikKode: prof ? `M-${prof.id}` : `M-${finalId}`,
        nama: finalName,
        jabatan: finalRole,
        posisi: finalRole.toLowerCase(),
        tglSubmit: formatYmd(w.submitted_at ?? w.created_at ?? w.date),
        tglApproved: formatYmd(w.approved_at ?? w.l2_at ?? w.created_at ?? w.date),
        jamMulai: formatHhMm(w.start_time),
        jamSelesai: formatHhMm(w.end_time),
        kondisiKunci: String(w.work_condition ?? 'normal').toLowerCase(),
        woNumber: woNum,
        unitKode: String(w.unit_code || w.unit_name || w.unit_id || '-'),
        komponen: String(w.component_name || w.job_nama || '-'),
        deskripsi: String(w.job_description || w.component_name || w.job_nama || '-'),
        kondisi: String(w.work_condition || 'Normal'),
        lokasi: String(w.location || '-'),
        mulai: w.start_time ? new Date(w.start_time).toISOString() : null,
        selesai: w.end_time ? new Date(w.end_time).toISOString() : null,
        actualHours: Number(w.actual_hours || 0),
        basePts: Number(w.base_points || 0),
        xUnit: Number(w.unit_factor || 1),
        xKondisi: Number(w.condition_factor || 1),
        xWaktu: 1,
        xSafety: 1,
        xRedo: 1,
        woPoin: totalWoPoints,
        poinMekanik,
        idr,
        idrPerPoint: finalRate,
      });
    }
  }

  // 5. Bangun BarisRingkas
  const peta = new Map<number, BarisRingkas & { tarif: Set<number> }>();
  for (const d of detail) {
    let g = peta.get(d.mekanikId);
    if (!g) {
      g = {
        mekanikId: d.mekanikId,
        mekanikKode: d.mekanikKode,
        nama: d.nama,
        jabatan: d.jabatan,
        posisi: d.posisi,
        totalWo: 0,
        totalPoin: 0,
        ratePoin: null,
        totalIdr: 0,
        tarif: new Set<number>(),
      };
      peta.set(d.mekanikId, g);
    }
    g.totalWo++;
    g.totalPoin += d.poinMekanik;
    g.totalIdr += d.idr;
    g.tarif.add(d.idrPerPoint);
  }

  const ringkas: BarisRingkas[] = [...peta.values()]
    .map(({ tarif, ...g }) => ({
      ...g,
      totalPoin: Math.round(g.totalPoin * 100) / 100,
      ratePoin: tarif.size === 1 ? [...tarif][0]! : null,
    }))
    .sort((a, b) => b.totalPoin - a.totalPoin || a.nama.localeCompare(b.nama));

  return {
    periodeLabel: batas.label,
    dibuatAt: new Date(),
    sectionLabel: pilihSection ? namaSection(pilihSection) : 'Semua section',
    detail,
    ringkas,
    statistik: {
      mekanik: ringkas.length,
      wo: new Set(detail.map((d) => d.woNumber)).size,
      idr: ringkas.reduce((a, b) => a + b.totalIdr, 0),
    },
    dikecualikan: { baris: 0, nama: [] },
  };
}
