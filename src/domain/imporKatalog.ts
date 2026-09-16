import ExcelJS from 'exceljs';
import { sql, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { pastikanAdmin } from './admin.js';

/**
 * IMPOR & EKSPOR KATALOG — lewat Excel, seperti yang sudah dikerjakan Gabriel.
 *
 * ── KENAPA HARUS ADA ────────────────────────────────────────────────────────
 * Katalog KMB V2 berisi 1.399 baris, dan Gabriel menyerahkan joblist SESUDAH
 * sistemnya jadi. Mengetiknya satu per satu lewat formulir bukan pekerjaan yang
 * bisa diminta dari siapa pun. Menu Admin yang hanya bisa menyunting satu job
 * berarti katalognya tidak akan pernah masuk.
 *
 * ── NAMA KOLOMNYA MILIK GABRIEL, BUKAN MILIK SKEMA ──────────────────────────
 * Templatnya memakai nama kolom yang SUDAH ADA di spreadsheet-nya
 * (`JobCatalogService.js:40-48`): `job_id`, `unit_model`, `component`,
 * `sub_component`, `job_description`, `plan_hours`, `base_point`, `job_type`,
 * `is_active`. Dengan begitu sheet yang sudah ia punya bisa ditempel langsung,
 * tanpa memetakan ulang satu per satu.
 *
 * Pembagiannya pun mengikuti spreadsheet: joblist DIPISAH PER SECTION, persis
 * seperti `Config_Jobs_Field` dan `Config_Jobs_Workshop`.
 *
 * ── PRATINJAU WAJIB, DAN ITU BUKAN KESOPANAN ────────────────────────────────
 * `base_points` adalah uang. Impor yang langsung menulis berarti satu berkas
 * salah kolom bisa mengubah ribuan angka sekaligus, dan yang menyadarinya
 * adalah orang yang menerima slip gajinya. Maka alurnya dua langkah: unggah →
 * LIHAT apa yang akan berubah → baru terapkan.
 */

export type JenisImpor = 'job' | 'unit';

/** Nama kolom persis seperti di spreadsheet KMB V2. */
const KOLOM_JOB = [
  'job_id', 'unit_model', 'component', 'sub_component', 'job_description',
  'plan_hours', 'base_point', 'job_type', 'is_active',
] as const;

const KOLOM_UNIT = [
  'unit_code', 'unit_name', 'unit_model', 'unit_factor', 'odometer',
  'brand', 'model_type', 'mtbf_eligible', 'is_active',
] as const;

export interface BarisJob {
  job_id: string; unit_model: string; component: string; sub_component: string;
  job_description: string; plan_hours: number; base_point: number;
  job_type: string; is_active: boolean;
}

export interface BarisUnit {
  unit_code: string; unit_name: string; unit_model: string; unit_factor: number;
  odometer: string; brand: string; model_type: string;
  mtbf_eligible: boolean; is_active: boolean;
}

export interface Pratinjau {
  jenis: JenisImpor;
  section: string | null;
  baru: number;
  diubah: { kode: string; medan: string; lama: string; baru: string }[];
  takBerubah: number;
  /** Katalog perlu induk yang belum ada — akan dibuat, dan disebut lebih dulu. */
  indukBaru: { jenis: string; nama: string }[];
  masalah: { baris: number; pesan: string }[];
  /** Muatan yang sudah dinormalisasi, dikirim balik saat menerapkan. */
  baris: (BarisJob | BarisUnit)[];
}

const teks = (v: unknown) => String(v ?? '').trim();
const angka = (v: unknown) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
/* "FALSE", "tidak", "0", dan kosong semuanya berarti tidak aktif. Spreadsheet
   menulis boolean dengan banyak cara, dan menganggap semua yang bukan TRUE
   sebagai aktif akan menghidupkan kembali job yang sengaja dimatikan. */
const boolDari = (v: unknown, bawaan = true) => {
  const s = teks(v).toLowerCase();
  if (s === '') return bawaan;
  return !(s === 'false' || s === 'tidak' || s === '0' || s === 'no' || s === 'n');
};

// ────────────────────────────────────────────────────────────────────────────
// EKSPOR: templat atau isi yang sekarang
// ────────────────────────────────────────────────────────────────────────────

export async function eksporKatalog(
  tenantId: number, jenis: JenisImpor, sectionCode: string | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const nama = jenis === 'job'
    ? `Jobs_${(sectionCode ?? 'semua').replace(/[^\w]/g, '')}`
    : 'Units';
  const ws = wb.addWorksheet(nama);
  const kolom = jenis === 'job' ? KOLOM_JOB : KOLOM_UNIT;

  ws.addRow([...kolom]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' },
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  if (jenis === 'job') {
    const baris = await sql<Record<string, unknown>[]>`
      SELECT j.job_code::text AS job_id,
             coalesce(um.code::text, '') AS unit_model,
             coalesce(c.name::text, '') AS component,
             coalesce(sc.name::text, '') AS sub_component,
             j.job_description, j.plan_hours, j.base_points AS base_point,
             coalesce(j.job_type::text, '') AS job_type, j.is_active
        FROM jobs j
        JOIN sections s ON s.id = j.section_id
        LEFT JOIN unit_models um ON um.id = j.unit_model_id
        LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
        LEFT JOIN job_components c ON c.id = sc.component_id
       WHERE j.tenant_id = ${tenantId}
         AND (${sectionCode}::text IS NULL OR s.code::text = ${sectionCode})
       ORDER BY j.job_code
    `;
    for (const b of baris) {
      ws.addRow(KOLOM_JOB.map((k) => (k === 'is_active' ? (b[k] ? 'TRUE' : 'FALSE') : b[k])));
    }
  } else {
    const baris = await sql<Record<string, unknown>[]>`
      SELECT u.unit_code::text, u.unit_name, coalesce(um.code::text, '') AS unit_model,
             u.unit_factor, coalesce(u.odometer::text, '') AS odometer,
             coalesce(u.brand, '') AS brand, coalesce(u.model_type, '') AS model_type,
             u.mtbf_eligible, u.is_active
        FROM units u
        LEFT JOIN unit_models um ON um.id = u.unit_model_id
       WHERE u.tenant_id = ${tenantId} AND NOT u.is_virtual
       ORDER BY u.unit_code
    `;
    for (const b of baris) {
      ws.addRow(KOLOM_UNIT.map((k) =>
        (k === 'is_active' || k === 'mtbf_eligible' ? (b[k] ? 'TRUE' : 'FALSE') : b[k])));
    }
  }

  ws.columns.forEach((c) => { c.width = 18; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ────────────────────────────────────────────────────────────────────────────
// BACA BERKAS → PRATINJAU
// ────────────────────────────────────────────────────────────────────────────

export async function bacaUntukPratinjau(
  tenantId: number, jenis: JenisImpor, sectionCode: string | null, isi: Buffer,
): Promise<Pratinjau> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(isi as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw aturanBisnis('Berkas tidak punya satu pun lembar kerja');

  const kepala = (ws.getRow(1).values as unknown[]).slice(1).map((v) => teks(v).toLowerCase());
  const wajib = jenis === 'job' ? KOLOM_JOB : KOLOM_UNIT;
  const hilang = wajib.filter((k) => !kepala.includes(k));
  /* Kolom yang hilang ditolak di pintu, bukan diisi nilai bawaan diam-diam.
     Berkas yang salah kolom lalu diterima separuh adalah cara paling halus
     mengubah ribuan angka tanpa ada yang menyadarinya. */
  if (hilang.length > 0) {
    throw aturanBisnis(
      `Kolom wajib tidak ada di berkas: ${hilang.join(', ')}. `
      + 'Unduh templatnya lebih dulu, lalu isi di bawah baris kepalanya.',
    );
  }
  const idx = (k: string) => kepala.indexOf(k) + 1;

  const masalah: Pratinjau['masalah'] = [];
  const baris: (BarisJob | BarisUnit)[] = [];
  const kodeTerlihat = new Set<string>();

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const ambil = (k: string) => row.getCell(idx(k)).value;
    const kunci = teks(ambil(jenis === 'job' ? 'job_id' : 'unit_code'));
    if (!kunci) return;                       // baris kosong dilewati diam-diam

    if (kodeTerlihat.has(kunci.toLowerCase())) {
      masalah.push({ baris: n, pesan: `${kunci} muncul lebih dari sekali di berkas ini` });
      return;
    }
    kodeTerlihat.add(kunci.toLowerCase());

    if (jenis === 'job') {
      const ph = angka(ambil('plan_hours'));
      const bp = angka(ambil('base_point'));
      if (!Number.isFinite(ph) || ph < 0) {
        masalah.push({ baris: n, pesan: `${kunci}: plan_hours tidak sah` }); return;
      }
      if (!Number.isFinite(bp) || bp < 0) {
        masalah.push({ baris: n, pesan: `${kunci}: base_point tidak sah` }); return;
      }
      const desc = teks(ambil('job_description'));
      if (!desc) {
        masalah.push({ baris: n, pesan: `${kunci}: job_description kosong` }); return;
      }
      const um = teks(ambil('unit_model'));
      const comp = teks(ambil('component'));
      const sub = teks(ambil('sub_component'));
      /* Bentuk cascade dan flat keduanya sah, TAPI tidak boleh separuh:
         skema menolaknya lewat CHECK, dan galat CHECK bukan pesan yang layak
         dibaca orang yang sedang mengimpor 1.399 baris. */
      const adaCascade = !!um || !!comp || !!sub;
      if (adaCascade && !(um && comp && sub)) {
        masalah.push({
          baris: n,
          pesan: `${kunci}: unit_model, component, dan sub_component harus terisi `
            + 'bertiga, atau kosong bertiga',
        });
        return;
      }
      baris.push({
        job_id: kunci, unit_model: um, component: comp, sub_component: sub,
        job_description: desc, plan_hours: ph, base_point: bp,
        job_type: teks(ambil('job_type')), is_active: boolDari(ambil('is_active')),
      });
    } else {
      const uf = angka(ambil('unit_factor'));
      if (!Number.isFinite(uf) || uf <= 0) {
        masalah.push({ baris: n, pesan: `${kunci}: unit_factor harus lebih dari 0` }); return;
      }
      const nama = teks(ambil('unit_name'));
      if (!nama) {
        masalah.push({ baris: n, pesan: `${kunci}: unit_name kosong` }); return;
      }
      const odo = teks(ambil('odometer')).toUpperCase();
      if (odo && odo !== 'KM' && odo !== 'HM') {
        masalah.push({ baris: n, pesan: `${kunci}: odometer harus KM atau HM` }); return;
      }
      baris.push({
        unit_code: kunci, unit_name: nama, unit_model: teks(ambil('unit_model')),
        unit_factor: uf, odometer: odo, brand: teks(ambil('brand')),
        model_type: teks(ambil('model_type')),
        mtbf_eligible: boolDari(ambil('mtbf_eligible'), false),
        is_active: boolDari(ambil('is_active')),
      });
    }
  });

  return bandingkan(tenantId, jenis, sectionCode, baris, masalah);
}

/** Apa yang akan berubah kalau ini diterapkan. Tidak menulis apa pun. */
async function bandingkan(
  tenantId: number, jenis: JenisImpor, sectionCode: string | null,
  baris: (BarisJob | BarisUnit)[], masalah: Pratinjau['masalah'],
): Promise<Pratinjau> {
  const diubah: Pratinjau['diubah'] = [];
  const indukBaru: Pratinjau['indukBaru'] = [];
  let baru = 0, takBerubah = 0;

  if (jenis === 'job') {
    const isi = baris as BarisJob[];
    const lama = new Map(
      (await sql<Record<string, unknown>[]>`
        SELECT j.job_code::text AS kode, j.job_description AS desc_,
               j.plan_hours, j.base_points, j.is_active,
               coalesce(j.job_type::text,'') AS job_type
          FROM jobs j WHERE j.tenant_id = ${tenantId}
      `).map((r) => [String(r['kode']).toLowerCase(), r]),
    );
    const modelAda = new Set((await sql<{ code: string }[]>`
      SELECT code::text FROM unit_models WHERE tenant_id = ${tenantId}
    `).map((r) => r.code.toLowerCase()));
    const kompAda = new Set((await sql<{ name: string }[]>`
      SELECT c.name::text FROM job_components c
        JOIN sections s ON s.id = c.section_id WHERE s.tenant_id = ${tenantId}
    `).map((r) => r.name.toLowerCase()));
    /* Sub-komponen ikut diperiksa, dan itu bukan kelengkapan belaka: ia SATU-
       SATUNYA induk yang paling sering baru — komponen "engine" sudah ada sejak
       lama, tapi tiap joblist membawa puluhan sub-komponen yang belum pernah
       tercatat. Pratinjau yang diam soal itu menyembunyikan justru bagian yang
       paling banyak dibuat. */
    const subAda = new Set((await sql<{ kunci: string }[]>`
      SELECT (c.name::text || '' || sc.name::text) AS kunci
        FROM job_sub_components sc
        JOIN job_components c ON c.id = sc.component_id
        JOIN sections s ON s.id = c.section_id WHERE s.tenant_id = ${tenantId}
    `).map((r) => r.kunci.toLowerCase()));

    const modelBaru = new Set<string>();
    const kompBaru = new Set<string>();
    const subBaru = new Set<string>();
    for (const b of isi) {
      if (b.unit_model && !modelAda.has(b.unit_model.toLowerCase())) modelBaru.add(b.unit_model);
      if (b.component && !kompAda.has(b.component.toLowerCase())) kompBaru.add(b.component);
      if (b.component && b.sub_component
          && !subAda.has(`${b.component}${b.sub_component}`.toLowerCase())) {
        subBaru.add(`${b.component} › ${b.sub_component}`);
      }

      const l = lama.get(b.job_id.toLowerCase());
      if (!l) { baru++; continue; }
      let ada = false;
      const bedakan = (medan: string, lamaNilai: unknown, baruNilai: unknown) => {
        if (String(lamaNilai) !== String(baruNilai)) {
          diubah.push({
            kode: b.job_id, medan, lama: String(lamaNilai), baru: String(baruNilai),
          });
          ada = true;
        }
      };
      bedakan('base_point', Number(l['base_points']), b.base_point);
      bedakan('plan_hours', Number(l['plan_hours']), b.plan_hours);
      bedakan('job_description', l['desc_'], b.job_description);
      bedakan('is_active', l['is_active'], b.is_active);
      if (!ada) takBerubah++;
    }
    for (const m of modelBaru) indukBaru.push({ jenis: 'Model unit', nama: m });
    for (const k of kompBaru) indukBaru.push({ jenis: 'Komponen', nama: k });
    for (const s of subBaru) indukBaru.push({ jenis: 'Sub-komponen', nama: s });
  } else {
    const isi = baris as BarisUnit[];
    const lama = new Map(
      (await sql<Record<string, unknown>[]>`
        SELECT unit_code::text AS kode, unit_name, unit_factor, is_active
          FROM units WHERE tenant_id = ${tenantId}
      `).map((r) => [String(r['kode']).toLowerCase(), r]),
    );
    for (const b of isi) {
      const l = lama.get(b.unit_code.toLowerCase());
      if (!l) { baru++; continue; }
      let ada = false;
      if (String(l['unit_name']) !== b.unit_name) {
        diubah.push({ kode: b.unit_code, medan: 'unit_name',
          lama: String(l['unit_name']), baru: b.unit_name }); ada = true;
      }
      if (Number(l['unit_factor']) !== b.unit_factor) {
        diubah.push({ kode: b.unit_code, medan: 'unit_factor',
          lama: String(l['unit_factor']), baru: String(b.unit_factor) }); ada = true;
      }
      if (Boolean(l['is_active']) !== b.is_active) {
        diubah.push({ kode: b.unit_code, medan: 'is_active',
          lama: String(l['is_active']), baru: String(b.is_active) }); ada = true;
      }
      if (!ada) takBerubah++;
    }
  }

  return { jenis, section: sectionCode, baru, diubah, takBerubah, indukBaru, masalah, baris };
}

// ────────────────────────────────────────────────────────────────────────────
// TERAPKAN
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanImpor {
  opId: string;
  tenantId: number;
  actorId: number;
  jenis: JenisImpor;
  sectionCode: string | null;
  baris: (BarisJob | BarisUnit)[];
}

export async function terapkanImpor(
  m: MasukanImpor,
): Promise<HasilPerintah<{ baru: number; diubah: number; indukBaru: number }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'impor_katalog',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (m.baris.length === 0) throw aturanBisnis('Tidak ada baris untuk diterapkan');
      if (m.baris.length > 5000) {
        throw aturanBisnis('Lebih dari 5.000 baris sekali impor — pecah berkasnya');
      }

      let baru = 0, diubah = 0, indukBaru = 0;

      if (m.jenis === 'job') {
        if (!m.sectionCode) throw aturanBisnis('Section wajib dipilih untuk impor job');
        const sec = (
          await tx<{ id: number }[]>`
            SELECT id FROM sections WHERE tenant_id = ${m.tenantId} AND code = ${m.sectionCode}
          `
        )[0];
        if (!sec) throw tidakDitemukan('Section', m.sectionCode);

        for (const b of m.baris as BarisJob[]) {
          let modelId: number | null = null;
          let subId: number | null = null;

          if (b.unit_model && b.component && b.sub_component) {
            modelId = await pastikanModel(tx, m.tenantId, sec.id, b.unit_model, () => { indukBaru++; });
            const kompId = await pastikanKomponen(tx, sec.id, b.component, () => { indukBaru++; });
            subId = await pastikanSub(tx, kompId, b.sub_component, () => { indukBaru++; });
          }

          const r = await tx<{ tindakan: string }[]>`
            INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id,
                              sub_component_id, job_description, plan_hours,
                              base_points, job_type, is_active)
            VALUES (${m.tenantId}, ${b.job_id}, ${sec.id}, ${modelId}, ${subId},
                    ${b.job_description}, ${b.plan_hours}, ${b.base_point},
                    ${b.job_type || null}, ${b.is_active})
            ON CONFLICT (tenant_id, job_code) DO UPDATE SET
              section_id = EXCLUDED.section_id,
              unit_model_id = EXCLUDED.unit_model_id,
              sub_component_id = EXCLUDED.sub_component_id,
              job_description = EXCLUDED.job_description,
              plan_hours = EXCLUDED.plan_hours,
              base_points = EXCLUDED.base_points,
              job_type = EXCLUDED.job_type,
              is_active = EXCLUDED.is_active,
              updated_at = now()
            RETURNING CASE WHEN xmax = 0 THEN 'baru' ELSE 'ubah' END AS tindakan
          `;
          if (r[0]?.tindakan === 'baru') baru++; else diubah++;
        }
      } else {
        for (const b of m.baris as BarisUnit[]) {
          let modelId: number | null = null;
          if (b.unit_model) {
            const um = (
              await tx<{ id: number }[]>`
                SELECT id FROM unit_models
                 WHERE tenant_id = ${m.tenantId} AND code = ${b.unit_model} LIMIT 1
              `
            )[0];
            modelId = um ? Number(um.id) : null;
          }
          const r = await tx<{ tindakan: string }[]>`
            INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id,
                               unit_factor, odometer, brand, model_type,
                               mtbf_eligible, is_active)
            VALUES (${m.tenantId}, ${b.unit_code}, ${b.unit_name}, ${modelId},
                    ${b.unit_factor},
                    ${b.odometer ? b.odometer : null}::odometer_type,
                    ${b.brand || null}, ${b.model_type || null},
                    ${b.mtbf_eligible}, ${b.is_active})
            ON CONFLICT (tenant_id, unit_code) DO UPDATE SET
              unit_name = EXCLUDED.unit_name,
              unit_model_id = coalesce(EXCLUDED.unit_model_id, units.unit_model_id),
              unit_factor = EXCLUDED.unit_factor,
              odometer = coalesce(EXCLUDED.odometer, units.odometer),
              brand = coalesce(EXCLUDED.brand, units.brand),
              model_type = coalesce(EXCLUDED.model_type, units.model_type),
              mtbf_eligible = EXCLUDED.mtbf_eligible,
              is_active = EXCLUDED.is_active
            RETURNING CASE WHEN xmax = 0 THEN 'baru' ELSE 'ubah' END AS tindakan
          `;
          if (r[0]?.tindakan === 'baru') baru++; else diubah++;
        }
      }

      /* Yang TIDAK disertakan berkas tidak disentuh sama sekali — tidak
         dinonaktifkan, tidak dihapus. Impor sebagian adalah hal yang wajar
         (satu section, satu model), dan menganggap "tidak ada di berkas" =
         "harus mati" akan mematikan seluruh katalog begitu ada yang mengimpor
         satu lembar kecil. */
      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'impor_katalog', ${m.jenis},
                ${m.sectionCode ?? '-'}, ${m.actorId},
                ${tx.json({ baru, diubah, induk_baru: indukBaru,
                            total: m.baris.length } as never)})
      `;

      return { baru, diubah, indukBaru };
    },
  });
}

async function pastikanModel(
  tx: Tx, tenantId: number, sectionId: number, kode: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM unit_models
       WHERE tenant_id = ${tenantId} AND code = ${kode} AND section_id = ${sectionId}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO unit_models (tenant_id, code, name, section_id)
      VALUES (${tenantId}, ${kode}, ${kode}, ${sectionId})
      RETURNING id
    `
  )[0]!;
  return Number(r.id);
}

async function pastikanKomponen(
  tx: Tx, sectionId: number, nama: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM job_components WHERE section_id = ${sectionId} AND name = ${nama}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO job_components (section_id, name) VALUES (${sectionId}, ${nama})
      RETURNING id
    `
  )[0]!;
  return Number(r.id);
}

async function pastikanSub(
  tx: Tx, componentId: number, nama: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM job_sub_components WHERE component_id = ${componentId} AND name = ${nama}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO job_sub_components (component_id, name)
      VALUES (${componentId}, ${nama}) RETURNING id
    `
  )[0]!;
  return Number(r.id);
}
