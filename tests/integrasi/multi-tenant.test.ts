import { expect, test } from 'vitest';
import { sql } from '../../src/lib/db.js';
import { buatWorkOrder } from '../../src/domain/workOrder.js';
import { bersihkanTransaksi, siapkanBekal } from './bekal.js';

test('Isolasi Tenant & Batch Suffix SUM', async () => {
  await bersihkanTransaksi();
  const bekal = await siapkanBekal();

  // Buat tenant SUM (atau gunakan yang sudah ada)
  const sumTenantRows = await sql<{ id: number }[]>`
    INSERT INTO tenants (code, name) VALUES ('SUM', 'SUM Project')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  const sumTenantId = sumTenantRows[0]!.id;

  // Buat section untuk SUM
  const sectionSumRows = await sql<{ id: number }[]>`
    INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit)
    VALUES (${sumTenantId}, 'field', 'Field', 'cascade', true) RETURNING id
  `;
  const sectionSumId = sectionSumRows[0]!.id;

  // Buat tarif untuk SUM
  const rateSumRows = await sql<{ id: number }[]>`
    INSERT INTO pay_rates (tenant_id, position, label, idr_per_point)
    VALUES (${sumTenantId}, 'junior', 'Junior SUM', 2000) RETURNING id
  `;
  const rateSumId = rateSumRows[0]!.id;

  // Buat mekanik SUM
  const mechSumRows = await sql<{ id: number }[]>`
    INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id)
    VALUES (${sumTenantId}, 'SUM-M1', 'Sum Mekanik', 'mechanic', ${rateSumId}) RETURNING id
  `;
  const mechSumId = mechSumRows[0]!.id;

  // Buat unit model & unit untuk SUM
  const modelSumRows = await sql<{ id: number }[]>`
    INSERT INTO unit_models (tenant_id, code, name, section_id)
    VALUES (${sumTenantId}, 'sum-hauler', 'Hauler SUM', ${sectionSumId}) RETURNING id
  `;
  const modelSumId = modelSumRows[0]!.id;
  const unitSumRows = await sql<{ id: number }[]>`
    INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
    VALUES (${sumTenantId}, 'SUM-UNIT-1', 'XSUM0001', ${modelSumId}, 1.0, 'HM') RETURNING id
  `;
  const unitSumId = unitSumRows[0]!.id;

  // Buat 2 job untuk SUM
  const jobSumRows = await sql<{ id: number }[]>`
    INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, job_description, plan_hours, base_points)
    VALUES (${sumTenantId}, 'SUM-JOB-1', ${sectionSumId}, NULL, 'sum service 1', 8, 20),
           (${sumTenantId}, 'SUM-JOB-2', ${sectionSumId}, NULL, 'sum service 2', 4, 10)
    RETURNING id
  `;
  const jobSumId1 = jobSumRows[0]!.id;
  const jobSumId2 = jobSumRows[1]!.id;

  // Buat WO batch SUM
  const hasil = await buatWorkOrder({
    opId: 'test-batch-sum',
    tenantId: sumTenantId,
    actorId: mechSumId,
    sectionCode: 'field',
    grup: { mode: 'unit' },
    blok: [
      { jobId: jobSumId1, unitId: unitSumId, team: [{ mechanicId: mechSumId, share: 0.5 }] },
      { jobId: jobSumId2, unitId: unitSumId, team: [{ mechanicId: mechSumId, share: 0.5 }] }
    ]
  });

  expect(hasil.hasil.dibuat).toHaveLength(2);
  // Suffix batch harus ada untuk SUM (Opsi B)
  expect(hasil.hasil.dibuat[0]!.woNumber).toMatch(/-A$/);
  expect(hasil.hasil.dibuat[1]!.woNumber).toMatch(/-B$/);

  // Verifikasi KMB tetap normal (tanpa suffix)
  const [jobKmb] = await sql<{ sub_component_id: number; unit_model_id: number }[]>`
    SELECT sub_component_id, unit_model_id FROM jobs WHERE id = ${bekal.jobId}
  `;
  const jobKmb2Rows = await sql<{ id: number }[]>`
    INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points)
    VALUES (${bekal.tenantId}, 'UJI-JOB-KMB-2', ${bekal.sectionFieldId}, ${jobKmb!.unit_model_id}, ${jobKmb!.sub_component_id}, 'job 2', 4, 10)
    ON CONFLICT (tenant_id, section_id, job_code) DO UPDATE SET base_points = EXCLUDED.base_points
    RETURNING id
  `;
  const jobKmb2Id = jobKmb2Rows[0]!.id;

  const hasilKmb = await buatWorkOrder({
    opId: 'test-batch-kmb',
    tenantId: bekal.tenantId,
    actorId: bekal.mekanikA,
    sectionCode: 'field',
    grup: { mode: 'unit' },
    blok: [
      { jobId: bekal.jobId, unitId: bekal.unitId, teamMechanicIds: [bekal.mekanikA] },
      { jobId: jobKmb2Id, unitId: bekal.unitId, teamMechanicIds: [bekal.mekanikB] }
    ]
  });
  expect(hasilKmb.hasil.dibuat[0]!.woNumber).not.toMatch(/-A$/);
  expect(hasilKmb.hasil.dibuat[1]!.woNumber).not.toMatch(/-B$/);
});
