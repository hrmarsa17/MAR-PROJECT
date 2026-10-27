/**
 * Skrip Sinkronisasi Snapshot Cermin Google Sheets -> Supabase kmb_projek
 * Sesuai Tahap 2: Cermin pada docs/KEPUTUSAN.md & AGENTS.md §2
 *
 * Mengalirkan data satu arah dari GAS KMB Project ke tabel cermin Supabase:
 * - config_units
 * - config_components
 * - config_mechanics
 * - api_tokens
 * - work_orders (aktif & pending approval)
 * - work_orders_archive (approved & rejected)
 * - config_factors
 */

import postgres from 'postgres';
import fs from 'fs';

const GAS_URL = process.env.APPSCRIPT_URL_KMB || 'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';
const SPV_TOKEN = '52fdb552231348ffb14a';
const DB_URL = process.env.DATABASE_URL_KMB || process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌ DATABASE_URL_KMB belum disetel di environment!');
  process.exit(1);
}

const sql = postgres(DB_URL, { max: 3, connect_timeout: 15 });

async function fetchGas(action, data = {}) {
  const payload = { token: SPV_TOKEN, action, ...data };
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function sinkronisasi() {
  console.log('================================================================');
  console.log('🔄 MEMULAI SINKRONISASI CERMIN GAS -> SUPABASE (kmb_projek)');
  console.log('================================================================');

  try {
    // 1. Fetch pull_create_refs (units & components)
    console.log('\n[1/5] Menarik katalog unit & komponen dari GAS...');
    const refsRes = await fetchGas('pull_create_refs');
    if (refsRes.success && refsRes.result && refsRes.result.refs) {
      const { units, components } = refsRes.result.refs;
      
      // Sync Units
      if (Array.isArray(units) && units.length > 0) {
        console.log(`Menyimpan ${units.length} unit ke kmb_projek.config_units...`);
        for (const u of units) {
          const unitCode = u.unit_id || u.code || 'UNKNOWN';
          const model = u.unit_name || u.name || '';
          const section = u.unit_type || u.type || 'vessel';
          await sql`
            INSERT INTO kmb_projek.config_units (unit_code, model, section, status)
            VALUES (${unitCode}, ${model}, ${section}, 'ACTIVE')
            ON CONFLICT (unit_code) DO UPDATE 
            SET model = EXCLUDED.model, section = EXCLUDED.section, updated_at = NOW()
          `;
        }
        console.log(`✅ ${units.length} unit tersimpan di config_units.`);
      }

      // Sync Components
      if (Array.isArray(components) && components.length > 0) {
        console.log(`Menyimpan ${components.length} komponen ke kmb_projek.config_components...`);
        for (const c of components) {
          const compId = c.component_no || c.id || 'JOB-UNKNOWN';
          const name = c.component_name || c.name || 'Unnamed';
          await sql`
            INSERT INTO kmb_projek.config_components (component_id, name, section, status)
            VALUES (${compId}, ${name}, 'all', 'ACTIVE')
            ON CONFLICT (component_id) DO UPDATE 
            SET name = EXCLUDED.name
          `;
        }
        console.log(`✅ ${components.length} komponen tersimpan di config_components.`);
      }
    }

    // 2. Fetch pull_monitoring (mechanics & tokens)
    console.log('\n[2/5] Menarik data mekanik & token dari GAS...');
    const monRes = await fetchGas('pull_monitoring');
    if (monRes.success && monRes.result && Array.isArray(monRes.result.mechanics)) {
      const mechanics = monRes.result.mechanics;
      console.log(`Menyimpan ${mechanics.length} mekanik ke kmb_projek.config_mechanics & api_tokens...`);

      for (const m of mechanics) {
        const mechId = m.id;
        const name = m.name;
        const section = m.section || 'maintenance';
        const token = m.token || `kmb-${mechId.toLowerCase()}`;
        const email = `${mechId.toLowerCase()}@kmb.local`;

        // Simpan ke config_mechanics
        await sql`
          INSERT INTO kmb_projek.config_mechanics (mechanic_id, name, section, token, email, role, status)
          VALUES (${mechId}, ${name}, ${section}, ${token}, ${email}, 'mechanic', 'ACTIVE')
          ON CONFLICT (mechanic_id) DO UPDATE
          SET name = EXCLUDED.name, section = EXCLUDED.section, token = EXCLUDED.token
        `;

        // Simpan ke api_tokens
        await sql`
          INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status)
          VALUES (${token}, 'mechanic', ${mechId}, ${name}, 'ACTIVE')
          ON CONFLICT (token) DO UPDATE
          SET user_id = EXCLUDED.user_id, name = EXCLUDED.name
        `;
      }

      // Ambil profil Supervisor persis dari GAS ping
      const spvPing = await fetchGas('ping', SPV_TOKEN);
      const spvName = spvPing.result?.name || 'L1 Test';
      const spvEmail = spvPing.result?.email || 'l1est@gmail.com';
      const spvId = spvPing.result?.mechanic_id || 'SPV-001';

      await sql`
        INSERT INTO kmb_projek.config_mechanics (mechanic_id, name, section, token, email, role, status)
        VALUES (${spvId}, ${spvName}, 'vessel,maintenance', ${SPV_TOKEN}, ${spvEmail}, 'supervisor', 'ACTIVE')
        ON CONFLICT (mechanic_id) DO UPDATE 
        SET name = EXCLUDED.name, email = EXCLUDED.email, token = EXCLUDED.token
      `;
      await sql`
        INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status)
        VALUES (${SPV_TOKEN}, 'supervisor', ${spvId}, ${spvName}, 'ACTIVE')
        ON CONFLICT (token) DO UPDATE 
        SET role = 'supervisor', name = EXCLUDED.name, user_id = EXCLUDED.user_id
      `;
      console.log(`✅ ${mechanics.length} mekanik + 1 supervisor (${spvName}) tersimpan.`);
    }

    // 3. Simpan Config Factors
    console.log('\n[3/5] Menyiapkan nilai pengali di kmb_projek.config_factors...');
    const factors = [
      { type: 'rate_jabatan', key: '1a', value: 1.0, desc: 'Mekanik Junior 1a' },
      { type: 'rate_jabatan', key: '1b', value: 1.05, desc: 'Mekanik Junior 1b' },
      { type: 'rate_jabatan', key: '2a', value: 1.1, desc: 'Mekanik 2a' },
      { type: 'rate_jabatan', key: '3a', value: 1.2, desc: 'Mekanik Senior 3a' },
      { type: 'rate_jabatan', key: 'supervisor', value: 1.3, desc: 'Supervisor' },
      { type: 'rate_global', key: 'idr_per_point', value: 100000, desc: 'Nilai Rupiah per Poin' }
    ];
    for (const f of factors) {
      await sql`
        INSERT INTO kmb_projek.config_factors (factor_type, key, value, description)
        VALUES (${f.type}, ${f.key}, ${f.value}, ${f.desc})
        ON CONFLICT (factor_type, key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
    console.log(`✅ ${factors.length} faktor tersimpan di config_factors.`);

    // 4. Fetch Work Orders (Active & Pending)
    console.log('\n[4/5] Menarik Work Orders aktif & pending dari GAS...');
    const pendRes = await fetchGas('pull_pending');
    const pendingWos = pendRes.result?.pending || [];

    // Baca juga snapshot gas-active.json jika ada
    let activeWos = [];
    if (fs.existsSync('scripts/gas-active.json')) {
      activeWos = JSON.parse(fs.readFileSync('scripts/gas-active.json', 'utf8'));
    }

    const allLiveWos = [...pendingWos, ...activeWos];
    console.log(`Menyimpan ${allLiveWos.length} Work Orders aktif/pending ke kmb_projek.work_orders...`);

    for (const w of allLiveWos) {
      const woId = w.id || `WO-UNKNOWN-${Date.now()}`;
      const woNum = w.wo_number || woId;
      const woDate = w.created_at ? w.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const unitCode = w.unit_id || 'UNKNOWN';
      const compName = w.component_name || 'General';
      const activity = w.keterangan || compName;
      const status = w.status || 'pending_mechanic_work';
      const section = w.section || 'vessel';
      const createdBy = w.created_by || 'system';
      const duration = Number(w.actual_hours || w.target_hours || 0);
      const leadId = w.team?.[0]?.mechanic_id || (Array.isArray(w.team_names) ? w.team_names[0] : 'VES-012');
      const teamStr = w.team ? w.team.map(t => t.name || t.mechanic_id).join(',') : (Array.isArray(w.team_names) ? w.team_names.join(',') : '');

      await sql`
        INSERT INTO kmb_projek.work_orders (
          id, wo_number, date, unit_code, component, activity, start_time, end_time,
          duration_hours, job_type, section, lead_mechanic_id, mechanic_ids, status,
          notes, created_by, created_at, source
        )
        VALUES (
          ${woId}, ${woNum}, ${woDate}, ${unitCode}, ${compName}, ${activity},
          ${w.start_time || null}, ${w.end_time || null}, ${duration},
          ${w.is_others ? 'OTHERS' : 'KATALOG'}, ${section}, ${leadId}, ${teamStr},
          ${status}, ${w.keterangan || null}, ${createdBy}, ${w.created_at ? new Date(w.created_at) : new Date()},
          'GAS'
        )
        ON CONFLICT (id) DO UPDATE 
        SET status = EXCLUDED.status, notes = EXCLUDED.notes, duration_hours = EXCLUDED.duration_hours, synced_at = NOW()
      `;
    }
    console.log(`✅ ${allLiveWos.length} Work Orders tersimpan di work_orders.`);

    // 5. Simpan Work Orders Archive (Approved & Rejected)
    console.log('\n[5/5] Menyimpan arsip Work Orders dari snapshot GAS...');
    let approvedWos = [];
    let rejectedWos = [];
    if (fs.existsSync('scripts/gas-approved.json')) {
      approvedWos = JSON.parse(fs.readFileSync('scripts/gas-approved.json', 'utf8'));
    }
    if (fs.existsSync('scripts/gas-rejected.json')) {
      rejectedWos = JSON.parse(fs.readFileSync('scripts/gas-rejected.json', 'utf8'));
    }

    const archiveWos = [...approvedWos, ...rejectedWos];
    console.log(`Menyimpan ${archiveWos.length} Work Orders arsip ke kmb_projek.work_orders_archive...`);

    for (const w of archiveWos) {
      const woId = w.id || `WO-ARC-${Date.now()}`;
      const woNum = w.wo_number || woId;
      const woDate = w.created_at ? w.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const unitCode = w.unit_id || 'UNKNOWN';
      const compName = w.component_name || 'General';
      const activity = w.keterangan || compName;
      const status = w.status || 'APPROVED';
      const section = w.section || 'vessel';
      const createdBy = w.created_by || 'system';
      const duration = Number(w.actual_hours || w.target_hours || 0);
      const teamStr = Array.isArray(w.team_names) ? w.team_names.join(',') : '';

      await sql`
        INSERT INTO kmb_projek.work_orders_archive (
          id, wo_number, date, unit_code, component, activity, duration_hours,
          job_type, section, mechanic_ids, status, notes, created_by, created_at, source
        )
        VALUES (
          ${woId}, ${woNum}, ${woDate}, ${unitCode}, ${compName}, ${activity},
          ${duration}, ${w.is_others ? 'OTHERS' : 'KATALOG'}, ${section}, ${teamStr},
          ${status}, ${w.keterangan || null}, ${createdBy}, ${w.created_at ? new Date(w.created_at) : new Date()},
          'GAS'
        )
        ON CONFLICT (id) DO UPDATE 
        SET status = EXCLUDED.status, notes = EXCLUDED.notes, synced_at = NOW()
      `;
    }
    console.log(`✅ ${archiveWos.length} Work Orders arsip tersimpan.`);

    // Ringkasan Akhir
    console.log('\n================================================================');
    console.log('📊 STATUS TABEL CERMIN SUPABASE kmb_projek:');
    console.log('================================================================');
    const [uCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.config_units`;
    const [cCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.config_components`;
    const [mCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.config_mechanics`;
    const [tCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.api_tokens`;
    const [wCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.work_orders`;
    const [aCount] = await sql`SELECT count(*)::int as c FROM kmb_projek.work_orders_archive`;

    console.log(`• config_units          : ${uCount.c} baris`);
    console.log(`• config_components     : ${cCount.c} baris`);
    console.log(`• config_mechanics      : ${mCount.c} baris`);
    console.log(`• api_tokens            : ${tCount.c} baris`);
    console.log(`• work_orders           : ${wCount.c} baris`);
    console.log(`• work_orders_archive   : ${aCount.c} baris`);
    console.log('================================================================');
    console.log('🎉 SINKRONISASI TAHAP 2 CERMIN SELESAI DENGAN SUKSES!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Terjadi kesalahan saat sinkronisasi:', err);
  } finally {
    await sql.end();
  }
}

sinkronisasi();
