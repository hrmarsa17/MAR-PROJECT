import './muat-env.js';
import ExcelJS from 'exceljs';

/**
 * MATRIKS WORKSHOP BARU (MARworkshop.xlsx) → katalog job section workshop.
 *
 *   npx tsx scripts/pindah-matriks-workshop.ts "<berkas.xlsx>" [--terapkan]
 *
 * ── DUA KOLOM YANG KOSONG DI BERKASNYA, DAN DARI MANA ISINYA DATANG ─────────
 *
 * `job_id` kosong di seluruh 52 baris. Kode dilanjutkan dari katalog workshop
 * yang sudah ada — ia berurutan JOB-1210 sampai JOB-1399, jadi yang baru mulai
 * dari JOB-1400. Bukan penomoran acak: kode job adalah identitas yang dipakai
 * WO selamanya, dan nomor yang menyambung membuat asal-usulnya bisa dibaca.
 *
 * `base_point` kosong juga — dan itu UANG, jadi tidak boleh ditebak.
 * Keputusan Gabriel 16 Sep 2026: **base_point = plan_hours × 2,0** untuk
 * seluruh 52 baris.
 *
 * Yang perlu diketahui tentang keputusan itu: katalog workshop KMB V2 TIDAK
 * seragam. Dari 190 job di sana, 94 memakai 2,0× dan 94 memakai 2,5× — dan
 * rasionya ditentukan NAMA pekerjaannya (Washing/Minor Repair/Mounting 2,0×;
 * Inspection/Testing/Assembling/Fabrikasi 2,5×), bukan modelnya. Memakai 2,0×
 * rata berarti pekerjaan teliti di matriks baru ini dihargai lebih rendah
 * daripada pekerjaan setara di matriks lama. Itu pilihan yang diambil sadar;
 * dicatat di sini supaya bisa ditinjau lagi, dan diubah lewat menu Admin
 * (Katalog Job) bila suatu saat memang perlu.
 *
 * ── UNIT ────────────────────────────────────────────────────────────────────
 * Section workshop tidak memakai unit sama sekali (`sections.requires_unit` =
 * false): pembuat WO memilih MODEL REBUILD, bukan nomor lambung. Karena itu
 * faktor unit yang dipakai perhitungan selalu 1,0 — `nilaiEfektif()` memakai
 * 1,0 begitu WO tak punya unit. Tidak ada baris `units` yang dibuat di sini,
 * dan itu sengaja: unit yang tak pernah bisa dipilih hanya jadi data mati.
 */

// Sama seperti pindah-katalog-v2: boleh ke produksi, tapi harus disebut.
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')
    && !process.argv.includes('--izinkan-luar')) {
  console.error(
    '\nDITOLAK. DATABASE_URL bukan basis data pengembangan (port 5433).\n\n'
    + 'Kalau ini memang basis data produksi:\n'
    + '    ... --terapkan --izinkan-luar\n\n'
    + 'Jalankan tanpa --terapkan lebih dulu untuk melihat apa yang akan terjadi.\n',
  );
  process.exit(1);
}

const berkas = process.argv[2];
const terapkan = process.argv.includes('--terapkan');
if (!berkas) {
  console.error('Pakai: npx tsx scripts/pindah-matriks-workshop.ts "<berkas.xlsx>" [--terapkan]');
  process.exit(1);
}

/** Keputusan Gabriel 16 Sep 2026. Lihat catatan panjang di atas. */
const PENGALI_POIN = 2.0;

const { sql } = await import('../src/lib/db.js');

function sel(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ('result' in o) return sel(o['result']);
    if ('text' in o) return String(o['text']);
    if (Array.isArray(o['richText'])) {
      return (o['richText'] as { text: string }[]).map((r) => r.text).join('');
    }
  }
  return String(v);
}

interface Baris {
  model: string; komponen: string; sub: string; nama: string; jam: number;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(berkas);
const ws = wb.getWorksheet(1)!;

const baris: Baris[] = [];
const masalah: string[] = [];
for (let i = 2; i <= ws.rowCount; i++) {
  const v = ((ws.getRow(i).values as unknown[]) ?? []).slice(1);
  const b: Baris = {
    model: sel(v[1]).trim(), komponen: sel(v[2]).trim(), sub: sel(v[3]).trim(),
    nama: sel(v[4]).trim(), jam: Number(sel(v[5]).trim()),
  };
  if (!b.model && !b.nama) continue;
  if (!b.model || !b.komponen || !b.sub || !b.nama) {
    masalah.push(`baris ${i}: model/komponen/sub/nama harus terisi keempatnya`);
    continue;
  }
  if (!Number.isFinite(b.jam) || b.jam <= 0) {
    masalah.push(`baris ${i}: plan_hours "${sel(v[5])}" bukan angka lebih dari 0`);
    continue;
  }
  baris.push(b);
}

const TENANT = (
  await sql<{ id: number }[]>`SELECT id FROM tenants ORDER BY id LIMIT 1`
)[0]!.id;
const section = (
  await sql<{ id: number }[]>`
    SELECT id FROM sections WHERE tenant_id = ${TENANT} AND code = 'workshop'`
)[0];
if (!section) { console.error('Section workshop tidak ada.'); process.exit(1); }

/* Kode dilanjutkan dari yang tertinggi DI SELURUH TENANT, bukan dari yang
   tertinggi di workshop saja.

   Melanjutkan dari workshop (JOB-1399 → JOB-1400) akan terlihat lebih rapi,
   tapi JOB-1400 sampai JOB-1451 sudah dipakai section FIELD — dan itu berarti
   melahirkan 52 kode kembar lintas section yang baru. Kekembaran semacam itu
   memang sah di skema kita sejak migrasi 007, tapi ia pula yang dulu menelan
   162 job field tanpa satu pun galat. Menambahnya dengan sengaja, demi nomor
   yang berurutan, bukan perdagangan yang sepadan.

   Dihitung dari MAX, bukan dari jumlah baris: kalau ada job yang pernah
   dihapus, menghitung dari jumlah akan menabrak kode yang masih dipakai WO. */
const tertinggi = (
  await sql<{ n: number }[]>`
    SELECT coalesce(max(substring(job_code::text from '^JOB-([0-9]+)$')::int), 0) AS n
      FROM jobs WHERE tenant_id = ${TENANT}`
)[0]!.n;

let urut = tertinggi;
const rencana = baris.map((b) => {
  urut += 1;
  return { ...b, kode: `JOB-${urut}`, poin: b.jam * PENGALI_POIN };
});

const modelBaru = new Set<string>();
const kompBaru = new Set<string>();
const subBaru = new Set<string>();
for (const r of rencana) {
  const m = await sql`SELECT 1 FROM unit_models
     WHERE tenant_id = ${TENANT} AND code = ${r.model} AND section_id = ${section.id}`;
  if (m.length === 0) modelBaru.add(r.model);
  const c = await sql`SELECT 1 FROM job_components
     WHERE section_id = ${section.id} AND name = ${r.komponen}`;
  if (c.length === 0) kompBaru.add(r.komponen);
  const s = await sql`
    SELECT 1 FROM job_sub_components sc JOIN job_components c ON c.id = sc.component_id
     WHERE c.section_id = ${section.id} AND c.name = ${r.komponen} AND sc.name = ${r.sub}`;
  if (s.length === 0) subBaru.add(`${r.komponen} / ${r.sub}`);
}

console.log(`\n${terapkan ? '▶  MENERAPKAN' : '👀 PRATINJAU (tidak menulis apa pun)'}`);
console.log(`   ${berkas}\n`);
console.log(`  ${rencana.length} job akan ditambahkan ke section workshop`);
console.log(`  kode ${rencana[0]?.kode} … ${rencana[rencana.length - 1]?.kode}`);
console.log(`  base_point = plan_hours × ${PENGALI_POIN}`);
console.log(`  total ${rencana.reduce((a, r) => a + r.jam, 0)} jam`
  + ` → ${rencana.reduce((a, r) => a + r.poin, 0)} poin\n`);

console.log('  Induk yang akan dibuat:');
for (const m of modelBaru) console.log(`     model unit   ${m}`);
for (const c of kompBaru) console.log(`     komponen     ${c}`);
for (const s of subBaru) console.log(`     sub-komponen ${s}`);

console.log('\n  Isi:');
for (const m of [...new Set(rencana.map((r) => r.model))]) {
  const d = rencana.filter((r) => r.model === m);
  console.log(`\n     ${m} — ${d.length} job`);
  for (const r of d) {
    console.log(`       ${r.kode}  ${r.sub.padEnd(22)} ${r.nama.padEnd(22)}`
      + ` ${String(r.jam).padStart(3)} jam → ${String(r.poin).padStart(4)} poin`);
  }
}

if (masalah.length > 0) {
  console.log(`\n  ⚠️ ${masalah.length} baris bermasalah, TIDAK akan dipindah:`);
  for (const m of masalah) console.log(`     • ${m}`);
}

const bentrok = await sql<{ kode: string }[]>`
  SELECT job_code::text AS kode FROM jobs
   WHERE tenant_id = ${TENANT} AND section_id = ${section.id}
     AND job_code = ANY(${rencana.map((r) => r.kode)}::text[])`;
if (bentrok.length > 0) {
  console.error(`\n❌ ${bentrok.length} kode sudah dipakai: `
    + bentrok.slice(0, 5).map((b) => b.kode).join(', '));
  await sql.end();
  process.exit(1);
}

if (!terapkan) {
  console.log('\n   Jalankan lagi dengan --terapkan untuk benar-benar memindahkannya.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const r of rencana) {
    const model = (
      await tx<{ id: number }[]>`
        INSERT INTO unit_models (tenant_id, code, name, section_id)
        VALUES (${TENANT}, ${r.model}, ${r.model}, ${section.id})
        ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`
    )[0]!;
    const komp = (
      await tx<{ id: number }[]>`
        INSERT INTO job_components (section_id, name) VALUES (${section.id}, ${r.komponen})
        ON CONFLICT (section_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`
    )[0]!;
    const sub = (
      await tx<{ id: number }[]>`
        INSERT INTO job_sub_components (component_id, name) VALUES (${komp.id}, ${r.sub})
        ON CONFLICT (component_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`
    )[0]!;
    await tx`
      INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id,
                        sub_component_id, job_description, plan_hours, base_points, is_active)
      VALUES (${TENANT}, ${r.kode}, ${section.id}, ${model.id}, ${sub.id},
              ${r.nama}, ${r.jam}, ${r.poin}, true)
    `;
  }

  const admin = (
    await tx<{ id: number }[]>`
      SELECT id FROM mechanics WHERE tenant_id = ${TENANT} AND may_admin ORDER BY id LIMIT 1`
  )[0];
  if (admin) {
    await tx`
      INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
      VALUES (${TENANT}, 'impor_katalog', 'job', 'workshop', ${admin.id},
              ${tx.json({
                berkas, baru: rencana.length, diubah: 0, induk_baru: modelBaru.size,
                pengali_poin: PENGALI_POIN,
                kode: `${rencana[0]?.kode} … ${rencana[rencana.length - 1]?.kode}`,
              } as never)})
    `;
  }
});

console.log(`\n✅ ${rencana.length} job workshop ditambahkan.\n`);
await sql.end();
