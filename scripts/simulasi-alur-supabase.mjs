/**
 * simulasi-alur-supabase.mjs
 * 
 * Skrip interaktif untuk menguji alur hidup lengkap Work Order langsung di Supabase:
 * 1. Create WO (Status: pending_mechanic_work)
 * 2. Mechanic Report Submission (Status: pending_l1)
 * 3. Supervisor Review & Approval (Status: pending_l2)
 * 4. Superintendent Final Approval & Poin Insentif (Status: approved)
 * 5. Verifikasi Audit Trail di PostgreSQL
 */

import postgres from 'file:///d:/marbaru/MARProject/node_modules/postgres/src/index.js';

const projectRef = 'sptgqsjgszwbreikxdph';
const pw = ',vykCbt$5tNV!z+';
const poolerUrl = `postgresql://postgres.${projectRef}:${encodeURIComponent(pw)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`;

const sql = postgres(poolerUrl, { max: 2, connect_timeout: 15 });

function jeda(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function jalankanSimulasi() {
  console.log('========================================================================');
  console.log('  🚀 SIMULASI ALUR PENUH WORK ORDER DI SUPABASE CLOUD (kmb_projek)      ');
  console.log('  Host: aws-0-ap-southeast-1.pooler.supabase.com (Region Singapura)     ');
  console.log('========================================================================\n');

  try {
    const timestamp = Date.now().toString().slice(-4);
    const woNumber = `WO-SB-20261027-${timestamp}`;
    const idInternal = `sb_kmb_${Date.now()}`;
    const leadMechanic = 'Gusti Raka Pamungkas';
    const leadId = 'VES-012';
    const unitCode = 'SDVS70011';
    const componentName = 'Welding & Fabrikasi — Vessel / Chasis & Body';

    // -------------------------------------------------------------------------
    // TAHAP 1: BUAT WORK ORDER BARU (CREATE WO)
    // -------------------------------------------------------------------------
    console.log(`📌 [TAHAP 1/5] Membuat Work Order Baru: ${woNumber}...`);
    const [woBaru] = await sql`
      INSERT INTO kmb_projek.work_orders (
        id,
        wo_number,
        date,
        shift,
        unit_code,
        component,
        activity,
        section,
        lead_mechanic_id,
        mechanic_ids,
        status,
        created_by,
        created_at,
        source
      ) VALUES (
        ${idInternal},
        ${woNumber},
        CURRENT_DATE,
        'Shift 1',
        ${unitCode},
        ${componentName},
        'Pengelasan dan perbaikan bracket landing gear trailer vessel',
        'vessel',
        ${leadId},
        ${leadId},
        'pending_mechanic_work',
        ${leadMechanic},
        NOW(),
        'supabase_direct'
      )
      RETURNING id, wo_number, unit_code, component, status, created_at;
    `;

    console.log(`✅ WO berhasil dibuat di Supabase!`);
    console.log(`   - ID: ${woBaru.id}`);
    console.log(`   - No WO: ${woBaru.wo_number}`);
    console.log(`   - Unit: ${woBaru.unit_code}`);
    console.log(`   - Status Saat Ini: [ ${woBaru.status} ] (Menunggu Mekanik Mengerjakan)\n`);

    await jeda(1500);

    // -------------------------------------------------------------------------
    // TAHAP 2: MEKANIK MENGISI LAPORAN & JAM KERJA (SUBMIT KERJA)
    // -------------------------------------------------------------------------
    console.log(`📌 [TAHAP 2/5] Mekanik (${leadMechanic}) Mengisi Jam Kerja & Menyelesaikan Pekerjaan...`);
    const [woSubmit] = await sql`
      UPDATE kmb_projek.work_orders
      SET 
        start_time = '08:00',
        end_time = '11:00',
        duration_hours = 3.0,
        notes = 'Pengerjaan pengelasan bracket selesai 3 jam. Visual check aman, cat touch-up rapi.',
        status = 'pending_l1',
        submitted_by = ${leadMechanic},
        submitted_at = NOW()
      WHERE id = ${idInternal}
      RETURNING wo_number, duration_hours, notes, status, submitted_at;
    `;

    console.log(`✅ Laporan mekanik berhasil dikirim ke Supabase!`);
    console.log(`   - Durasi Kerja: ${woSubmit.duration_hours} Jam`);
    console.log(`   - Catatan: "${woSubmit.notes}"`);
    console.log(`   - Status Saat Ini: [ ${woSubmit.status} ] (Menunggu Approval Supervisor L1)\n`);

    await jeda(1500);

    // -------------------------------------------------------------------------
    // TAHAP 3: SUPERVISOR REVIEW & APPROVAL (L1 APPROVAL)
    // -------------------------------------------------------------------------
    console.log(`📌 [TAHAP 3/5] Supervisor L1 (SPV-001 / L1 Test) Memeriksa & Menyetujui...`);
    const [woL1] = await sql`
      UPDATE kmb_projek.work_orders
      SET 
        approved_l1_by = 'SPV-001 (L1 Test)',
        approved_l1_at = NOW(),
        status = 'pending_l2'
      WHERE id = ${idInternal}
      RETURNING wo_number, approved_l1_by, status, approved_l1_at;
    `;

    console.log(`✅ Approval L1 Supervisor berhasil dicatat di Supabase!`);
    console.log(`   - Disetujui Oleh: ${woL1.approved_l1_by}`);
    console.log(`   - Waktu Approval L1: ${woL1.approved_l1_at.toISOString()}`);
    console.log(`   - Status Saat Ini: [ ${woL1.status} ] (Menunggu Approval Superintendent L2)\n`);

    await jeda(1500);

    // -------------------------------------------------------------------------
    // TAHAP 4: SUPERINTENDENT FINAL APPROVAL & HITUNG POIN (L2 APPROVAL)
    // -------------------------------------------------------------------------
    console.log(`📌 [TAHAP 4/5] Superintendent L2 (SUPT-001 / L2 Test) Menyetujui Final & Menghitung Poin...`);
    
    // Perhitungan Poin Standar KMB:
    // Base Point: 1.25, On-Time Factor: 1.0, Work Condition: 1.0, Safety: 1.0 -> Final: 1.25 poin
    // Rate Junior (Gusti Raka Pamungkas): Rp 2.500 / poin
    // Insentif Rupiah: 1.25 * Rp 2.500 = Rp 3.125
    const finalPoints = 1.25;
    const ratePerPoin = 2500;
    const finalIdr = finalPoints * ratePerPoin;

    const [woL2] = await sql`
      UPDATE kmb_projek.work_orders
      SET 
        approved_l2_by = 'SUPT-001 (L2 Test)',
        approved_l2_at = NOW(),
        status = 'approved',
        points = ${finalPoints},
        idr_value = ${finalIdr}
      WHERE id = ${idInternal}
      RETURNING wo_number, approved_l2_by, status, points, idr_value, approved_l2_at;
    `;

    console.log(`✅ Approval Final L2 & Poin Payroll berhasil disimpan di Supabase!`);
    console.log(`   - Disetujui Oleh: ${woL2.approved_l2_by}`);
    console.log(`   - Status Final: [ ${woL2.status} ] 🏆`);
    console.log(`   - Poin Final: ${woL2.points} Poin`);
    console.log(`   - Nilai Insentif: Rp ${Number(woL2.idr_value).toLocaleString('id-ID')}\n`);

    await jeda(1500);

    // -------------------------------------------------------------------------
    // TAHAP 5: AUDIT TRAIL LENGKAP DARI DATABASE POSTGRESQL
    // -------------------------------------------------------------------------
    console.log(`📌 [TAHAP 5/5] Memverifikasi Jejak Rekam (Audit Trail) Langsung dari Supabase...`);
    const [finalRecord] = await sql`
      SELECT 
        wo_number,
        unit_code,
        component,
        lead_mechanic_id,
        duration_hours,
        status,
        points,
        idr_value,
        created_at,
        submitted_at,
        approved_l1_at,
        approved_l2_at
      FROM kmb_projek.work_orders
      WHERE id = ${idInternal};
    `;

    console.log('\n📊 RINGKASAN DATA WORK ORDER DI SUPABASE POSTGRESQL:');
    console.table([{
      'NO WO': finalRecord.wo_number,
      'UNIT': finalRecord.unit_code,
      'KOMPONEN': finalRecord.component.slice(0, 25) + '...',
      'MEKANIK': finalRecord.lead_mechanic_id,
      'STATUS': finalRecord.status,
      'POIN': finalRecord.points,
      'INSENTIF (IDR)': `Rp ${Number(finalRecord.idr_value).toLocaleString('id-ID')}`,
    }]);

    console.log('⏱️ JEJAK AUDIT WAKTU (TIMESTAMPS):');
    console.log(`   1. Dibuat (Created):       ${finalRecord.created_at.toLocaleString('id-ID')}`);
    console.log(`   2. Dikerjakan (Submitted):  ${finalRecord.submitted_at.toLocaleString('id-ID')}`);
    console.log(`   3. Disetujui L1 (Spv):     ${finalRecord.approved_l1_at.toLocaleString('id-ID')}`);
    console.log(`   4. Disetujui L2 (Supt):    ${finalRecord.approved_l2_at.toLocaleString('id-ID')}`);

    console.log('\n========================================================================');
    console.log('  🎉 SIMULASI SELESAI 100% SUKSES!');
    console.log('  Supabase berfungsi sempurna untuk seluruh siklus transaksi Work Order!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('❌ Terjadi kesalahan saat simulasi Supabase:', err);
  } finally {
    await sql.end();
  }
}

jalankanSimulasi();
