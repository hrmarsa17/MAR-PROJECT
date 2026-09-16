import './muat-env.js';
import ExcelJS from 'exceljs';

/**
 * PINDAH KATALOG KMB V2 → KMB Project.
 *
 *   npx tsx scripts/pindah-katalog-v2.ts "<ekspor V2.xlsx>" [--terapkan]
 *
 * Tanpa `--terapkan` ia hanya MELAPORKAN apa yang akan terjadi. Itu bawaannya
 * dengan sengaja: berkas ini membawa ribuan angka yang menentukan poin, dan
 * pemindahan yang langsung menulis tidak memberi siapa pun kesempatan melihat.
 *
 * Empat lembar yang dibaca, mengikuti pembagian spreadsheet-nya sendiri:
 *
 *   Config_Jobs_Field      → job section field
 *   Config_Jobs_Workshop   → job section workshop
 *   Config_Components      → job section tyreman (jalur lama: komponen = job)
 *   Config_Units           → unit
 *
 * ── DUA HAL YANG TIDAK DISALIN APA ADANYA ───────────────────────────────────
 * 1. `unit_scope` di Config_Units berisi daftar section yang dipisah koma
 *    ("tyreman,field"). Di sini ia jadi baris-baris `unit_sections`.
 * 2. Tyreman di V2 tidak punya joblist tersendiri — pekerjaannya adalah baris
 *    `Config_Components` (`JobCatalogService.js:5`). Ia dipindah jadi job DATAR
 *    (tanpa model unit & sub-komponen), bukan dipaksa masuk bentuk cascade.
 */

if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: skrip ini menulis katalog. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const berkas = process.argv[2];
const terapkan = process.argv.includes('--terapkan');
if (!berkas) {
  console.error('Pakai: npx tsx scripts/pindah-katalog-v2.ts "<ekspor V2.xlsx>" [--terapkan]');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { bacaLingkup } = await import('../src/domain/katalogInduk.js');

/** Sel berumus mengembalikan {formula, result}; katalog KMB penuh dengan itu. */
function nilaiSel(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ('result' in o) return nilaiSel(o['result']);
    if ('text' in o) return o['text'];
    if (Array.isArray(o['richText'])) {
      return (o['richText'] as { text: string }[]).map((r) => r.text).join('');
    }
  }
  return v;
}
const teks = (v: unknown) => String(nilaiSel(v) ?? '').trim();
const angka = (v: unknown) => {
  const n = Number(teks(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const bool = (v: unknown, bawaan = true) => {
  const s = teks(v).toLowerCase();
  if (s === '') return bawaan;
  return !(s === 'false' || s === 'tidak' || s === '0' || s === 'no');
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(berkas);

const tenant = (
  await sql<{ id: number }[]>`SELECT id FROM tenants WHERE code = 'KMB'`
)[0]!;
const TENANT = Number(tenant.id);

const section = new Map(
  (await sql<{ id: number; code: string }[]>`
    SELECT id, code::text FROM sections WHERE tenant_id = ${TENANT}
  `).map((s) => [s.code, Number(s.id)]),
);

const admin = (
  await sql<{ id: number }[]>`
    SELECT id FROM mechanics WHERE tenant_id = ${TENANT} AND may_admin AND is_active
     ORDER BY id LIMIT 1
  `
)[0];

interface Hitung { baru: number; ubah: number; lewat: number; masalah: string[] }
const kosong = (): Hitung => ({ baru: 0, ubah: 0, lewat: 0, masalah: [] });

function baris(namaLembar: string): Record<string, unknown>[] {
  const ws = wb.getWorksheet(namaLembar);
  if (!ws) return [];
  const kepala = ((ws.getRow(1).values as unknown[]) ?? [])
    .slice(1).map((v) => teks(v).toLowerCase());
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o: Record<string, unknown> = {};
    kepala.forEach((k, i) => { if (k) o[k] = (row.getCell(i + 1) as { value: unknown }).value; });
    out.push(o);
  });
  return out;
}

/* ── JOB ──────────────────────────────────────────────────────────────────── */

async function pindahJob(lembar: string, kodeSection: string): Promise<Hitung> {
  const h = kosong();
  const secId = section.get(kodeSection);
  if (!secId) { h.masalah.push(`Section ${kodeSection} tidak ada di basis data`); return h; }

  for (const r of baris(lembar)) {
    const kode = teks(r['job_id']);
    if (!kode) { h.lewat++; continue; }
    const ph = angka(r['plan_hours']);
    const bp = angka(r['base_point']);
    const desc = teks(r['job_description']);
    if (!desc) { h.masalah.push(`${kode}: job_description kosong`); continue; }
    if (!Number.isFinite(ph) || ph < 0) { h.masalah.push(`${kode}: plan_hours "${teks(r['plan_hours'])}"`); continue; }
    if (!Number.isFinite(bp) || bp < 0) { h.masalah.push(`${kode}: base_point "${teks(r['base_point'])}"`); continue; }

    const um = teks(r['unit_model']);
    const comp = teks(r['component']);
    const sub = teks(r['sub_component']);
    const cascade = !!(um && comp && sub);
    if (!cascade && (um || comp || sub)) {
      h.masalah.push(`${kode}: cascade separuh (model="${um}" komponen="${comp}" sub="${sub}")`);
      continue;
    }

    if (!terapkan) {
      const ada = await sql`SELECT 1 FROM jobs
        WHERE tenant_id=${TENANT} AND section_id=${secId} AND job_code=${kode}`;
      if (ada.length) h.ubah++; else h.baru++;
      continue;
    }

    let modelId: number | null = null;
    let subId: number | null = null;
    if (cascade) {
      modelId = await pastikan(
        sql`SELECT id FROM unit_models WHERE tenant_id=${TENANT} AND code=${um} AND section_id=${secId}`,
        sql`INSERT INTO unit_models (tenant_id, code, name, section_id)
            VALUES (${TENANT}, ${um}, ${um}, ${secId}) RETURNING id`);
      const kompId = await pastikan(
        sql`SELECT id FROM job_components WHERE section_id=${secId} AND name=${comp}`,
        sql`INSERT INTO job_components (section_id, name) VALUES (${secId}, ${comp}) RETURNING id`);
      subId = await pastikan(
        sql`SELECT id FROM job_sub_components WHERE component_id=${kompId} AND name=${sub}`,
        sql`INSERT INTO job_sub_components (component_id, name)
            VALUES (${kompId}, ${sub}) RETURNING id`);
    }

    const hasil = await sql<{ tindakan: string }[]>`
      INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id,
                        job_description, plan_hours, base_points, job_type, is_active)
      VALUES (${TENANT}, ${kode}, ${secId}, ${modelId}, ${subId}, ${desc},
              ${ph}, ${bp}, ${teks(r['job_type']) || null}, ${bool(r['is_active'])})
      ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET
        section_id = EXCLUDED.section_id, unit_model_id = EXCLUDED.unit_model_id,
        sub_component_id = EXCLUDED.sub_component_id,
        job_description = EXCLUDED.job_description, plan_hours = EXCLUDED.plan_hours,
        base_points = EXCLUDED.base_points, job_type = EXCLUDED.job_type,
        is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING CASE WHEN xmax = 0 THEN 'baru' ELSE 'ubah' END AS tindakan
    `;
    if (hasil[0]?.tindakan === 'baru') h.baru++; else h.ubah++;
  }
  return h;
}

async function pastikan(cari: Promise<unknown>, buat: Promise<unknown>): Promise<number> {
  const ada = (await cari) as { id: number }[];
  if (ada.length > 0) return Number(ada[0]!.id);
  const r = (await buat) as { id: number }[];
  return Number(r[0]!.id);
}

/* ── TYREMAN: Config_Components jadi job DATAR ────────────────────────────── */

async function pindahTyreman(): Promise<Hitung> {
  const h = kosong();
  const secId = section.get('tyreman');
  if (!secId) { h.masalah.push('Section tyreman tidak ada'); return h; }

  for (const r of baris('Config_Components')) {
    const kode = teks(r['component_no']);
    const nama = teks(r['component_name']);
    if (!kode || !nama) { h.lewat++; continue; }
    const bp = angka(r['base_points']);
    const th = angka(r['target_hours']);
    if (!Number.isFinite(bp) || !Number.isFinite(th)) {
      h.masalah.push(`${kode}: base_points/target_hours tidak sah`); continue;
    }
    /* `notes` berisi "Active"/"Inactive" di lembar ini, bukan keterangan bebas.
       Kolom `is_active` tidak ada di sana. */
    const aktif = teks(r['notes']).toLowerCase() !== 'inactive';

    if (!terapkan) {
      const ada = await sql`SELECT 1 FROM jobs
        WHERE tenant_id=${TENANT} AND section_id=${secId} AND job_code=${kode}`;
      if (ada.length) h.ubah++; else h.baru++;
      continue;
    }
    const hasil = await sql<{ tindakan: string }[]>`
      INSERT INTO jobs (tenant_id, job_code, section_id, job_description,
                        plan_hours, base_points, is_active)
      VALUES (${TENANT}, ${kode}, ${secId}, ${nama}, ${th}, ${bp}, ${aktif})
      ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET
        section_id = EXCLUDED.section_id, job_description = EXCLUDED.job_description,
        plan_hours = EXCLUDED.plan_hours, base_points = EXCLUDED.base_points,
        is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING CASE WHEN xmax = 0 THEN 'baru' ELSE 'ubah' END AS tindakan
    `;
    if (hasil[0]?.tindakan === 'baru') h.baru++; else h.ubah++;
  }
  return h;
}

/* ── UNIT ─────────────────────────────────────────────────────────────────── */

async function pindahUnit(): Promise<Hitung> {
  const h = kosong();
  for (const r of baris('Config_Units')) {
    const kode = teks(r['unit_id']);
    const nama = teks(r['unit_name']);
    if (!kode || !nama) { h.lewat++; continue; }
    const uf = angka(r['unit_factor']);
    if (!Number.isFinite(uf) || uf <= 0) { h.masalah.push(`${kode}: unit_factor tidak sah`); continue; }
    const odo = teks(r['odometer_type']).toUpperCase();
    if (odo && odo !== 'KM' && odo !== 'HM') { h.masalah.push(`${kode}: odometer "${odo}"`); continue; }

    if (!terapkan) {
      const ada = await sql`SELECT 1 FROM units WHERE tenant_id=${TENANT} AND unit_code=${kode}`;
      if (ada.length) h.ubah++; else h.baru++;
      continue;
    }

    /* UNIT SEMU. Di V2 ada baris seperti `UNIT-OTHERS` ber-unit_type "OTHERS"
       — "📝 Job Manual (di luar katalog)". Ia bukan alat: tidak punya meter,
       tidak punya faktor yang berarti, dan tidak boleh bisa dipilih sebagai
       unit sungguhan. Skema kita menandainya `is_virtual`, dan `workOrder.ts`
       menolak WO yang memakainya. Memindahkannya sebagai unit biasa akan
       membuat faktor unitnya ikut masuk perhitungan uang. */
    const jenisUnit = teks(r['unit_type']).toUpperCase();
    const semu = jenisUnit === 'OTHERS' || jenisUnit === 'WORKSHOP'
      || /^(UNIT-)?(OTHERS|WORKSHOP)$/i.test(kode);

    const um = teks(r['unit_model']);
    let modelId: number | null = null;
    if (um) {
      const m = await sql<{ id: number }[]>`
        SELECT id FROM unit_models WHERE tenant_id=${TENANT} AND code=${um} ORDER BY id LIMIT 1`;
      modelId = m[0] ? Number(m[0].id) : null;
    }

    /* `global` PUNYA KOLOM SENDIRI sejak db/migrasi/008. Sebelum itu ia ikut
       dipindahkan sebagai "tanpa baris unit_sections" — yang di skema kita
       berarti "milik semua section", kebalikan dari maksudnya. 16 unit sewa
       karena itu sempat berdiri sejajar dengan alat pegangan harian. */
    const lingkupSel = semu ? 'others' : teks(r['unit_scope']);
    const lingkup = bacaLingkup(lingkupSel);

    const hasil = await sql<{ id: number; tindakan: string }[]>`
      INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor,
                         odometer, brand, model_type, mtbf_eligible, is_active,
                         is_virtual, is_global)
      VALUES (${TENANT}, ${kode}, ${nama}, ${modelId}, ${uf},
              ${odo || null}::odometer_type, ${teks(r['brand']) || null},
              ${teks(r['type']) || null}, ${bool(r['mtbf_eligible'], false)},
              ${bool(r['is_active'])}, ${semu || lingkup.semu}, ${lingkup.global})
      ON CONFLICT (tenant_id, unit_code) DO UPDATE SET
        unit_name = EXCLUDED.unit_name,
        unit_model_id = coalesce(EXCLUDED.unit_model_id, units.unit_model_id),
        unit_factor = EXCLUDED.unit_factor,
        odometer = coalesce(EXCLUDED.odometer, units.odometer),
        brand = coalesce(EXCLUDED.brand, units.brand),
        model_type = coalesce(EXCLUDED.model_type, units.model_type),
        mtbf_eligible = EXCLUDED.mtbf_eligible, is_active = EXCLUDED.is_active,
        is_virtual = EXCLUDED.is_virtual, is_global = EXCLUDED.is_global
      RETURNING id, CASE WHEN xmax = 0 THEN 'baru' ELSE 'ubah' END AS tindakan
    `;
    if (hasil[0]?.tindakan === 'baru') h.baru++; else h.ubah++;

    /* Daftar section diganti UTUH mengikuti lembarnya — termasuk saat ia jadi
       kosong, karena unit yang dipindahkan dari tyreman ke global memang harus
       kehilangan baris tyreman-nya. Sebelumnya penghapusan hanya dijalankan
       kalau daftarnya tidak kosong, sehingga scope lama tidak pernah bisa
       dicabut lewat pemindahan ulang. */
    if (hasil[0]) {
      await sql`DELETE FROM unit_sections WHERE unit_id = ${hasil[0].id}`;
      for (const s of lingkup.section) {
        const sid = section.get(s);
        if (!sid) { h.masalah.push(`${kode}: section "${s}" tidak dikenal`); continue; }
        await sql`INSERT INTO unit_sections (unit_id, section_id) VALUES (${hasil[0].id}, ${sid})
                  ON CONFLICT DO NOTHING`;
      }
    }
  }
  return h;
}

/* ── JALAN ────────────────────────────────────────────────────────────────── */

console.log(`\n${terapkan ? '▶  MENERAPKAN' : '👀 PRATINJAU (tidak menulis apa pun)'}`);
console.log(`   ${berkas}\n`);

/* `--hanya=unit` memindahkan SATU lembar saja.
   Alasannya nyata: memulihkan lingkup unit dari sebuah backup tidak boleh
   memaksa ikut memindahkan joblistnya juga. Backup yang dipakai memulihkan
   lingkup bisa saja berumur berbeda dari ekspor yang dipakai memindahkan job —
   dan 164 job yang ikut terbawa adalah perubahan yang tak seorang pun minta. */
const hanya = (process.argv.find((a) => a.startsWith('--hanya='))?.split('=')[1] ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const pakai = (nama: string) => hanya.length === 0 || hanya.includes(nama);
if (hanya.length > 0) console.log(`   hanya lembar: ${hanya.join(', ')}\n`);

const hasil: [string, Hitung][] = [];
if (pakai('field')) {
  hasil.push(['Job — field (Config_Jobs_Field)',
    await pindahJob('Config_Jobs_Field', 'field')]);
}
if (pakai('workshop')) {
  hasil.push(['Job — workshop (Config_Jobs_Workshop)',
    await pindahJob('Config_Jobs_Workshop', 'workshop')]);
}
if (pakai('tyreman')) {
  hasil.push(['Job — tyreman (Config_Components)', await pindahTyreman()]);
}
if (pakai('unit')) hasil.push(['Unit (Config_Units)', await pindahUnit()]);

let totalMasalah = 0;
for (const [nama, h] of hasil) {
  console.log(`  ${nama}`);
  console.log(`     baru ${String(h.baru).padStart(5)}   diperbarui ${String(h.ubah).padStart(5)}`
    + `   dilewati ${String(h.lewat).padStart(4)}   bermasalah ${String(h.masalah.length).padStart(4)}`);
  for (const m of h.masalah.slice(0, 5)) console.log(`       • ${m}`);
  if (h.masalah.length > 5) console.log(`       • …dan ${h.masalah.length - 5} lagi`);
  totalMasalah += h.masalah.length;
  console.log('');
}

if (terapkan && admin) {
  await sql`
    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
    VALUES (${TENANT}, 'pindah_katalog_v2', 'katalog', '-', ${admin.id},
            ${sql.json({ berkas, hasil: hasil.map(([n, h]) =>
              ({ lembar: n, baru: h.baru, ubah: h.ubah, masalah: h.masalah.length })) } as never)})
  `;
}

console.log(terapkan
  ? `✅ Selesai.${totalMasalah ? ` ${totalMasalah} baris bermasalah TIDAK dipindah.` : ''}\n`
  : '   Jalankan lagi dengan --terapkan untuk benar-benar memindahkannya.\n');

await sql.end();
