#!/usr/bin/env node
/**
 * Langkah tengah latihan cermin balik (tools/cermin/latihan-balik.mjs, docs/SIAP-MULAI.md): satu siklus WO lengkap +
 * pemicu GAS di Worker UJI rumah itu (staging-<rumah>.abadiops.com), yang menulis ke uji_<skema> di Gedung 1.
 * Produksi tidak tersentuh, dan ruang uji tidak mengirim notifikasi push. Token tidak pernah dicetak.
 *
 *   SPV buat WO → mekanik kirim kerja (+ kiriman ulang op_id sama: dedup) → SPV L1 → SPT L2;
 *   WO kedua dibuat lalu dibatalkan; mekanik membuat WO (KMB V2 mengizinkannya, rumah lain menolak);
 *   kiriman tanpa op_id (ditolak); lalu pemicu GAS rumah itu (pemangkas menghapus baris lama → menguji pergeseran baris).
 *
 * Isian aksi meniru PWA rumah itu (pwa/<rumah>/app.js): keluarga KMB memakai section + job katalog untuk model unitnya;
 * SUM memakai component_no + work_condition dari pull_create_refs, part_type, dan hour meter/kilometer wajib > 0.
 * Pelaku bawaan di bawah = akun aktif bertoken di cermin 15 Nov 2026; ganti dengan --spv/--spt/--mekanik bila perlu.
 *
 * --latihan: rumah LATIHAN di produksi (uji kering prosedur migrasi, 15 Nov; workers/bersama/profil-rumah.js):
 *   Worker latihan-<rumah>.abadiops.com, skema latihan_<skema>. Hanya berguna sesudah saklar rumah latihan `supabase`
 *   (sebelumnya kiriman dijawab GAS tiruan). Pemicu tidak dijalankan (rumah latihan tanpa cron dan tanpa
 *   /api/uji-pemicu). Notifikasi push rumah latihan hanya dicatat.
 *
 * Variabel lingkungan: DATABASE_URL (Gedung 1). Pemakaian:
 *   node tools/cermin/siklus-latihan.mjs --rumah=kmbbupr|kmbprojek|kmbtra|sum [--latihan] [--mekanik=<id>] [--spv=<id>] [--spt=<id>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenMekanik } from '../kembar/gas-lokal.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const BAWAAN = {
  kmbbupr: { skema: 'uji_kmbbupr', dasar: 'https://staging-kmbbupr.abadiops.com', keluarga: 'kmb', section: 'maintenance', spv: 'SPV-P2-01', spt: 'SPT-P2-01', mekanik: 'MNT-002' },
  kmbprojek: { skema: 'uji_kmb_projek', dasar: 'https://staging-kmbprojek.abadiops.com', keluarga: 'kmb', section: 'maintenance', spv: 'SPV-001', spt: 'SUPT-001', mekanik: 'MNT-002' },
  kmbtra: { skema: 'uji_kmb', dasar: 'https://staging-kmbtra.abadiops.com', keluarga: 'kmb', section: 'field', spv: 'SPV-001', spt: 'SUPT-001', mekanik: 'MECH-001', mekanikBolehBuat: true },
  sum: { skema: 'uji_sum', dasar: 'https://staging-sum.abadiops.com', keluarga: 'sum', spv: 'SPV-000', spt: 'SUPT-000', mekanik: 'MECH-000' },
};
const kode = String(arg.rumah || '');
if (!BAWAAN[kode]) throw new Error('--rumah=kmbbupr|kmbprojek|kmbtra|sum');
const latihan = Boolean(arg.latihan);
const R = {
  ...BAWAAN[kode],
  ...(latihan ? { skema: BAWAAN[kode].skema.replace(/^uji_/, 'latihan_'), dasar: `https://latihan-${kode}.abadiops.com` } : {}),
  ...(arg.spv ? { spv: arg.spv } : {}), ...(arg.spt ? { spt: arg.spt } : {}), ...(arg.mekanik ? { mekanik: arg.mekanik } : {}),
};
const sah = latihan
  ? R.skema.startsWith('latihan_') && /^https:\/\/latihan-/.test(R.dasar)
  : R.skema.startsWith('uji_') && /^https:\/\/staging-/.test(R.dasar);
if (!sah) throw new Error('hanya ruang uji atau rumah latihan');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL (Gedung 1) wajib');

const { default: postgres } = await import('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 30, onnotice: () => {} });
const api = async (token, action, data, opId) => {
  const r = await fetch(`${R.dasar}/api`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, action, op_id: opId, data }) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_) {}
  const push = r.headers.get('x-abadi-push');
  return { status: r.status, j, t, jalur: r.headers.get('x-abadi-jalur'), tulis: `${r.headers.get('x-abadi-tulis') || '-'}${push && push !== '0' ? ` push=${push}` : ''}` };
};
const nomorWo = (j) => j && j.result && (j.result.wo_id || j.result.id || j.result.wo_number);
const ringkas = (j, t) => (j ? JSON.stringify({ success: j.success, error: j.error, wo: nomorWo(j) }) : String(t)).slice(0, 170);
const jam = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const T0 = Date.now();
const op = (n) => `uji-latihan-${kode}-${T0}-${n}`;

try {
  const tok = {};
  for (const id of new Set([R.spv, R.spt, R.mekanik])) {
    tok[id] = await tokenMekanik(sql, R.skema, id);
    if (!tok[id]) throw new Error(`token uji untuk ${id} tidak ada di ${R.skema}`);
  }
  const awalBaris = Object.fromEntries((await sql`SELECT sheet, jumlah_baris FROM ${sql(R.skema + '.cermin_header')}`).map((r) => [r.sheet, r.jumlah_baris]));
  const ref = await api(tok[R.spv], 'pull_create_refs');
  const refs = ref.j && ref.j.result && ref.j.result.refs;
  if (!refs) throw new Error(`pull_create_refs gagal: ${ringkas(ref.j, ref.t)}`);

  let buat; let kirim; let setuju;
  if (R.keluarga === 'kmb') {
    const cocok = (u) => (refs.jobs_field || []).find((x) => u.unit_model && String(x.unit_model).toLowerCase() === String(u.unit_model).toLowerCase());
    const unit = refs.units.find((u) => (u.unit_scope || []).includes(R.section) && cocok(u));
    const job = unit && cocok(unit);
    if (!job) throw new Error(`tidak ada unit section ${R.section} dengan job katalog`);
    console.log(`rujukan: section ${R.section}, unit ${unit.unit_id} (${unit.unit_model}), job ${job.job_id}`);
    buat = (m, ket) => ({ section: R.section, work_condition: 'normal', keterangan: ket, location: R.section === 'workshop' ? 'workshop' : 'field', job_id: job.job_id, unit_id: unit.unit_id, team: [{ mechanic_id: m }] });
    kirim = (wo, h1, h2) => ({ wo_id: wo, start_time: jam(h1), end_time: jam(h2), hour_meter: '', kilometers: '', part_category: '' });
    setuju = (wo) => ({ wo_id: wo, notes: 'uji latihan', safety_incident: false, mtbf_status: 'first_time' });
  } else {
    const unit = (refs.units || [])[0];
    const komp = (refs.components || []).find((c) => !/OTHERS/i.test(String(c.component_no)));
    const wc = (refs.work_conditions || [])[0];
    const kondisi = typeof wc === 'string' ? wc : wc && wc.key;
    console.log(`rujukan: unit ${unit && unit.unit_id}, komponen ${komp && komp.component_no}, kondisi ${kondisi}`);
    buat = (m, ket) => ({ work_condition: kondisi, keterangan: ket, location: 'workshop', component_id: komp.component_no, unit_id: unit.unit_id, team: [{ mechanic_id: m }] });
    kirim = (wo, h1, h2) => ({ wo_id: wo, start_time: jam(h1), end_time: jam(h2), hour_meter: 99999, kilometers: 99999, part_type: 'repair' });
    setuju = (wo) => ({ wo_id: wo, notes: 'uji latihan', safety_incident: false });
  }

  const hasil = {};
  const langkah = [
    ['C1 SPV buat WO', R.spv, 'create_wo', op('c1'), () => buat(R.mekanik, 'uji latihan cermin balik')],
    ['C2 mekanik kirim kerja', R.mekanik, 'submit_work', op('c2'), () => kirim(nomorWo(hasil.C1), 5, 4)],
    ['C2b kiriman ulang op_id sama', R.mekanik, 'submit_work', op('c2'), () => kirim(nomorWo(hasil.C1), 5, 4)],
    ['C3 SPV approve L1', R.spv, 'approve_l1', op('c3'), () => setuju(nomorWo(hasil.C1))],
    ['C4 SPT approve L2', R.spt, 'approve_l2', op('c4'), () => setuju(nomorWo(hasil.C1))],
    ['D1 SPV buat WO kedua', R.spv, 'create_wo', op('d1'), () => buat(R.mekanik, 'uji latihan (dibatalkan)')],
    ['E1 SPV batalkan WO kedua', R.spv, 'cancel_wo', op('e1'), () => ({ wo_id: nomorWo(hasil.D1), reason: 'uji pembatalan latihan' })],
    [`D3 mekanik buat WO (${R.mekanikBolehBuat ? 'diizinkan GAS rumah ini' : 'harus ditolak'})`, R.mekanik, 'create_wo', op('d3'), () => buat(R.mekanik, R.mekanikBolehBuat ? 'uji latihan (mekanik)' : '')],
    ['F1 tanpa op_id (harus ditolak)', R.mekanik, 'submit_work', undefined, () => kirim(nomorWo(hasil.D1), 2, 1)],
  ];
  for (const [nama, siapa, aksi, opId, data] of langkah) {
    const r = await api(tok[siapa], aksi, data(), opId);
    hasil[nama.split(' ')[0]] = r.j;
    console.log(`${nama.padEnd(40)} ${r.status} ${r.jalur || '-'} tulis=${r.tulis} | ${ringkas(r.j, r.t)}`);
  }
  const profil = JSON.parse(fs.readFileSync(path.join(AKAR, 'config/rumah.json'), 'utf8'))[kode];
  if (latihan) console.log('pemicu: dilewati (rumah latihan tanpa cron dan tanpa /api/uji-pemicu)');
  for (const fn of latihan ? [] : [...new Set((profil.gas.pemicu || []).map((x) => x.fungsi))]) {
    const r = await fetch(`${R.dasar}/api/uji-pemicu`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fungsi: fn }) });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch (_) {}
    console.log(`pemicu ${fn.padEnd(33)} ${r.status} | ${j ? JSON.stringify({ ok: j.ok, tulis: j.tulis, alasan: j.alasan }).slice(0, 170) : t.slice(0, 170)}`);
  }
  const akhirBaris = Object.fromEntries((await sql`SELECT sheet, jumlah_baris FROM ${sql(R.skema + '.cermin_header')}`).map((r) => [r.sheet, r.jumlah_baris]));
  console.log(`baris berubah di ${R.skema}: ${Object.keys(akhirBaris).filter((s) => akhirBaris[s] !== awalBaris[s]).map((s) => `${s} ${awalBaris[s]}→${akhirBaris[s]}`).join(', ') || '(tidak ada)'}`);
} finally { await sql.end({ timeout: 2 }); }
