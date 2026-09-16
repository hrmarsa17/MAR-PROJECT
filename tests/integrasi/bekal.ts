import { sql } from '../../src/lib/db.js';

/**
 * Data uji. Dibuat sekali, dipakai semua berkas uji integrasi.
 *
 * Master data (tenant, section, faktor, tarif) datang dari db/seed.sql —
 * sengaja: uji yang memakai benih yang sama dengan produksi ikut membuktikan
 * benihnya benar.
 */

export interface Bekal {
  tenantId: number;
  sectionFieldId: number;
  unitId: number;
  jobId: number;
  jobBasePoints: number;
  jobPlanHours: number;
  mekanikA: number;
  mekanikB: number;
  supervisor: number;
  superintendent: number;
}

/**
 * Menghapus SELURUH data transaksi, membiarkan master data utuh.
 *
 * ⚠️ Ini MENGOSONGKAN work_orders — termasuk data contoh yang sedang dipakai
 * memeriksa layar dengan tangan. Setelah `npm test`, daftar WO di layar akan
 * kosong sampai `npm run db:contoh` dijalankan lagi. Itu bukan bug layar; 16
 * Sep 2026 saya sempat mengira begitu dan mencari sebabnya di tempat yang
 * salah.
 *
 * Pagar port ada di `tests/muat-env.ts`, dijalankan sebelum modul mana pun
 * dimuat. Diulang di sini karena fungsi ini bisa dipanggil dari mana saja, dan
 * jarak antara pemanggil dan pagarnya adalah tempat kecelakaan berikutnya
 * lahir.
 */
export async function bersihkanTransaksi(): Promise<void> {
  if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
    throw new Error('DITOLAK: TRUNCATE hanya boleh di basis data pengembangan (port 5433).');
  }
  await sql`
    TRUNCATE work_orders, processed_ops, audit_logs,
             meter_readings, meter_panel_changes, wo_number_counters
    RESTART IDENTITY CASCADE
  `;
}

export async function siapkanBekal(): Promise<Bekal> {
  const tenantId = Number(
    (await sql<{ id: number }[]>`SELECT id FROM tenants WHERE code = 'KMB'`)[0]!.id,
  );
  const sectionFieldId = Number(
    (
      await sql<{ id: number }[]>`
        SELECT id FROM sections WHERE tenant_id = ${tenantId} AND code = 'field'
      `
    )[0]!.id,
  );

  const tarif = await sql<{ id: number; position: string }[]>`
    SELECT id, position::text FROM pay_rates WHERE tenant_id = ${tenantId}
  `;
  const tarifJunior = tarif.find((t) => t.position === 'junior')!.id;
  const tarifSenior = tarif.find((t) => t.position === 'senior')!.id;

  // Mekanik. pay_rate_id NOT NULL — mekanik tanpa tarif tidak bisa ada.
  const buatMekanik = async (kode: string, nama: string, peran: string, tarifId: number) =>
    Number(
      (
        await sql<{ id: number }[]>`
          INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id)
          VALUES (${tenantId}, ${kode}, ${nama}, ${peran}::user_role, ${tarifId})
          ON CONFLICT (tenant_id, mechanic_code)
            DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `
      )[0]!.id,
    );

  const mekanikA = await buatMekanik('UJI-M1', 'Mekanik Satu', 'mechanic', tarifJunior);
  const mekanikB = await buatMekanik('UJI-M2', 'Mekanik Dua', 'mechanic', tarifSenior);
  const supervisor = await buatMekanik('UJI-L1', 'Planner Uji', 'supervisor', tarifSenior);
  const superintendent = await buatMekanik('UJI-L2', 'Manager Uji', 'superintendent', tarifSenior);

  // Katalog: model unit → unit, dan component → sub_component → job.
  const unitModelId = Number(
    (
      await sql<{ id: number }[]>`
        INSERT INTO unit_models (tenant_id, code, name, section_id)
        VALUES (${tenantId}, 'uji-hauler', 'Hauler Uji', ${sectionFieldId})
        ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `
    )[0]!.id,
  );

  const unitId = Number(
    (
      await sql<{ id: number }[]>`
        INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
        VALUES (${tenantId}, 'UJI-UNIT-1', 'XUJI0001', ${unitModelId}, 1.0, 'HM')
        ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
        RETURNING id
      `
    )[0]!.id,
  );

  const componentId = Number(
    (
      await sql<{ id: number }[]>`
        INSERT INTO job_components (section_id, name)
        VALUES (${sectionFieldId}, 'engine')
        ON CONFLICT (section_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `
    )[0]!.id,
  );

  const subId = Number(
    (
      await sql<{ id: number }[]>`
        INSERT INTO job_sub_components (component_id, name)
        VALUES (${componentId}, 'cylinder head')
        ON CONFLICT (component_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `
    )[0]!.id,
  );

  const jobBasePoints = 16;
  const jobPlanHours = 8;
  const jobId = Number(
    (
      await sql<{ id: number }[]>`
        INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id,
                          sub_component_id, job_description, plan_hours, base_points)
        VALUES (${tenantId}, 'UJI-JOB-1', ${sectionFieldId}, ${unitModelId},
                ${subId}, 'remove and install', ${jobPlanHours}, ${jobBasePoints})
        ON CONFLICT (tenant_id, job_code) DO UPDATE SET base_points = EXCLUDED.base_points
        RETURNING id
      `
    )[0]!.id,
  );

  return {
    tenantId, sectionFieldId, unitId, jobId,
    jobBasePoints, jobPlanHours,
    mekanikA, mekanikB, supervisor, superintendent,
  };
}

/** Membawa WO sampai tepat sebelum approve L2. */
export async function siapkanWoSampaiL2(
  bekal: Bekal,
  opts: { jamKerja?: number; tim?: number[] } = {},
): Promise<number> {
  const tim = opts.tim ?? [bekal.mekanikA];
  const jam = opts.jamKerja ?? 8;

  const wo = (
    await sql<{ id: number }[]>`
      INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
                               status, created_by, session_hours, start_time, end_time)
      VALUES (${bekal.tenantId},
              next_wo_number(${bekal.tenantId}::smallint, current_date),
              ${bekal.sectionFieldId}, ${bekal.jobId}, ${bekal.unitId},
              'pending_superintendent', ${bekal.supervisor}, ${jam},
              now() - make_interval(hours => ${jam}), now())
      RETURNING id
    `
  )[0]!.id;

  for (const m of tim) {
    await sql`
      INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (${wo}, ${m})
    `;
  }
  return Number(wo);
}
