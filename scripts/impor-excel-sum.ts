import './muat-env.js';
import ExcelJS from 'exceljs';
import { sql } from '../src/lib/db.js';

const FILE_EXCEL = 'V2 PT SUM_Mechanic Activity Report.xlsx';

const alamat = process.env['DATABASE_URL'] ?? '';
if (!alamat) {
  console.error('\n❌ DATABASE_URL belum ditentukan.');
  process.exit(1);
}

if (!/:5433\//.test(alamat) && !process.argv.includes('--izinkan-luar') && !process.argv.includes('--jauh')) {
  console.error(
    '\n❌ DITOLAK. DATABASE_URL bukan basis data lokal (port 5433).\n' +
    '   Gunakan --izinkan-luar atau --jauh untuk melanjutkan.\n'
  );
  process.exit(1);
}

async function main() {
  console.log('Membaca file Excel SUM...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE_EXCEL);

  // 1. Pastikan Tenant SUM ada
  let tenant = (await sql<{ id: number }[]>`SELECT id FROM tenants WHERE code = 'SUM'`)[0];
  if (!tenant) {
    const res = await sql<{ id: number }[]>`
      INSERT INTO tenants (code, name, timezone) VALUES ('SUM', 'Semesta Usaha Mandiri', 'Asia/Jakarta') RETURNING id
    `;
    tenant = res[0]!;
    console.log('Tenant SUM dibuat dengan ID:', tenant.id);
  } else {
    console.log('Tenant SUM ditemukan, ID:', tenant.id);
  }
  const tenantId = tenant.id;

  // 2. Pastikan Default Section untuk SUM ada (misal: 'field' & 'workshop')
  let section = (await sql<{ id: number }[]>`SELECT id FROM sections WHERE tenant_id = ${tenantId} LIMIT 1`)[0];
  if (!section) {
    const res = await sql<{ id: number }[]>`
      INSERT INTO sections (tenant_id, code, name, picker_style, requires_unit, sort_order)
      VALUES (${tenantId}, 'field', 'Field', 'cascade', true, 1) RETURNING id
    `;
    section = res[0]!;
  }
  const sectionId = section.id;

  // 3. Impor Units (Config_Units)
  const wsUnits = wb.getWorksheet('Config_Units');
  if (wsUnits) {
    console.log('Mengimpor Units...');
    let count = 0;
    wsUnits.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Header
      const unitId = String(row.getCell(1).value ?? '').trim();
      const unitName = String(row.getCell(2).value ?? '').trim();
      const unitType = String(row.getCell(3).value ?? '').trim();
      const unitFactor = Number(row.getCell(4).value) || 1.0;
      if (!unitId) return;

      sql`
        INSERT INTO units (tenant_id, unit_code, unit_name, model_type, unit_factor, is_active)
        VALUES (${tenantId}, ${unitId}, ${unitName || unitId}, ${unitType}, ${unitFactor}, true)
        ON CONFLICT (tenant_id, unit_code)
        DO UPDATE SET unit_name = EXCLUDED.unit_name, unit_factor = EXCLUDED.unit_factor, model_type = EXCLUDED.model_type
      `.catch(e => console.error('Gagal unit:', unitId, e.message));
      count++;
    });
    console.log(`Selesai impor unit: ~${count} baris diproses.`);
  }

  // 4. Impor Pay Rates default jika belum ada
  let payRate = (await sql<{ id: number }[]>`SELECT id FROM pay_rates WHERE tenant_id = ${tenantId} LIMIT 1`)[0];
  if (!payRate) {
    const res = await sql<{ id: number }[]>`
      INSERT INTO pay_rates (tenant_id, position, label, idr_per_point)
      VALUES (${tenantId}, 'junior', 'Junior Mechanic', 2500) RETURNING id
    `;
    payRate = res[0]!;
  }
  const defaultPayRateId = payRate.id;

  // 5. Impor Mechanics & Tokens (Config_Mechanics & ApiTokens)
  const wsMech = wb.getWorksheet('Config_Mechanics');
  const wsTokens = wb.getWorksheet('ApiTokens');
  const tokenMap: Record<string, string> = {};
  if (wsTokens) {
    wsTokens.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const token = String(row.getCell(1).value ?? '').trim();
      const mechId = String(row.getCell(2).value ?? '').trim();
      if (token && mechId) {
        tokenMap[mechId] = token;
      }
    });
  }

  if (wsMech) {
    console.log('Mengimpor Mechanics...');
    let count = 0;
    const rows: any[] = [];
    wsMech.eachRow((row, rowNum) => { if (rowNum > 1) rows.push(row); });

    for (const row of rows) {
      const mechanicCode = String(row.getCell(1).value ?? '').trim();
      const mechanicName = String(row.getCell(2).value ?? '').trim();
      const email = String(row.getCell(3).value ?? '').trim();
      const roleStr = String(row.getCell(4).value ?? 'mechanic').trim().toLowerCase();
      const jabatan = String(row.getCell(7).value ?? '').trim();
      const golongan = String(row.getCell(8).value ?? '').trim();
      if (!mechanicCode) continue;

      let role = 'mechanic';
      if (roleStr.includes('supervisor')) role = 'supervisor';
      else if (roleStr.includes('superintendent') || roleStr.includes('manager')) role = 'superintendent';

      try {
        const mRes = await sql<{ id: number }[]>`
          INSERT INTO mechanics (tenant_id, mechanic_code, name, email, role, pay_rate_id, grade, is_active)
          VALUES (${tenantId}, ${mechanicCode}, ${mechanicName || mechanicCode}, ${email || null}, ${role}::user_role, ${defaultPayRateId}, ${jabatan || golongan || null}, true)
          ON CONFLICT (tenant_id, mechanic_code)
          DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, grade = EXCLUDED.grade
          RETURNING id
        `;
        const mId = mRes[0]?.id;
        if (mId && tokenMap[mechanicCode]) {
          let tVal = tokenMap[mechanicCode]!;
          if (!tVal.startsWith('SUM-')) tVal = `SUM-${tVal}`;
          await sql`
            INSERT INTO api_tokens (tenant_id, mechanic_id, token, is_active)
            VALUES (${tenantId}, ${mId}, ${tVal}, true)
            ON CONFLICT (token) DO NOTHING
          `;
        }
        count++;
      } catch (e: any) {
        console.error('Gagal mekanik:', mechanicCode, e.message);
      }
    }
    console.log(`Selesai impor mechanics: ${count} baris diproses.`);
  }

  // 6. Impor Components / Jobs (Config_Components)
  const wsComp = wb.getWorksheet('Config_Components');
  if (wsComp) {
    console.log('Mengimpor Katalog Components...');
    
    // Buat dummy unit model untuk SUM agar lolos constraint bentuk_cascade
    const resModel = await sql<{ id: number }[]>`
      INSERT INTO unit_models (tenant_id, code, name, section_id)
      VALUES (${tenantId}, 'SUM-GLOBAL', 'Global SUM', ${sectionId})
      ON CONFLICT (tenant_id, code, section_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    const dummyModelId = resModel[0]!.id;

    let count = 0;
    const rows: any[] = [];
    wsComp.eachRow((row, rowNum) => { if (rowNum > 1) rows.push(row); });

    for (const row of rows) {
      const compNo = String(row.getCell(1).value ?? '').trim();
      const compName = String(row.getCell(2).value ?? '').trim();
      const category = String(row.getCell(3).value ?? 'General').trim();
      const basePoints = Number(row.getCell(4).value) || 10;
      const targetHours = Number(row.getCell(5).value) || 4;
      if (!compNo) continue;

      try {
        let compRow = (await sql<{ id: number }[]>`SELECT id FROM job_components WHERE section_id = ${sectionId} AND name = ${category}`)[0];
        if (!compRow) {
          const cRes = await sql<{ id: number }[]>`
            INSERT INTO job_components (section_id, name) VALUES (${sectionId}, ${category}) RETURNING id
          `;
          compRow = cRes[0]!;
        }

        let subRow = (await sql<{ id: number }[]>`SELECT id FROM job_sub_components WHERE component_id = ${compRow.id} AND name = ${compName}`)[0];
        if (!subRow) {
          const sRes = await sql<{ id: number }[]>`
            INSERT INTO job_sub_components (component_id, name) VALUES (${compRow.id}, ${compName}) RETURNING id
          `;
          subRow = sRes[0]!;
        }

        await sql`
          INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id, sub_component_id, job_description, plan_hours, base_points, is_active)
          VALUES (${tenantId}, ${compNo}, ${sectionId}, ${dummyModelId}, ${subRow.id}, ${compName}, ${targetHours}, ${basePoints}, true)
          ON CONFLICT (tenant_id, section_id, job_code)
          DO UPDATE SET job_description = EXCLUDED.job_description, base_points = EXCLUDED.base_points, plan_hours = EXCLUDED.plan_hours
        `;
        count++;
      } catch (e: any) {
        console.error('Gagal job:', compNo, e.message);
      }
    }
    console.log(`Selesai impor jobs: ${count} baris diproses.`);
  }

  console.log('Migrasi Master Data SUM selesai!');
  await sql.end();
}

main().catch(console.error);
