import './muat-env.js';

/**
 * WO OTHERS — pekerjaan di luar katalog.
 *
 * Dibuat setelah ketahuan Others TIDAK BISA dibuat di section field maupun
 * tyreman: pagar `requires_unit` berlaku juga untuknya, padahal Others memang
 * tidak dikerjakan pada satu unit. Fiturnya ada di layar, ditolak server, dan
 * tak ada satu pun uji yang menyentuhnya.
 *
 * Yang dijaga di sini, dari ujung ke ujung:
 *   - siapa boleh membuatnya (L1/L2 saja, ditegakkan SERVER)
 *   - angkanya masuk kolom sendiri, tidak menumpang kolom override
 *   - unit semu tidak bisa dipakai sebagai unit sungguhan
 *   - poin & rupiahnya terbit benar sampai ke slip gaji
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken, identitasDariToken } = await import('../src/lib/auth.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function tokenUntuk(peran: string) {
  const m = (
    await sql<{ id: number; tenant_id: number }[]>`
      SELECT id, tenant_id FROM mechanics WHERE role = ${peran} AND is_active ORDER BY id LIMIT 1
    `
  )[0]!;
  const t = buatToken();
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${m.id} AND is_active AND revoked_at IS NULL`;
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return t;
}

const l2 = await tokenUntuk('superintendent');
const mek = await tokenUntuk('mechanic');
const kepala = (t: string) => ({ 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` });

async function perintah(t: string, aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST', headers: kepala(t),
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{ ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> } }>;
}

const tim = [
  (await sql<{ id: number }[]>`
    SELECT id FROM mechanics WHERE role='mechanic' AND is_active
      AND is_test_account = false ORDER BY id LIMIT 1
  `)[0]!.id,
];
const blokOthers = (desc: string) => ({
  manual: { description: desc, basePoints: 3, targetHours: 4, unitFactor: 1.2 },
  workCondition: 'normal', location: 'workshop', teamMechanicIds: tim,
});

console.log('\n─── 1. Others bisa dibuat di SETIAP section ───');
const woOthers: number[] = [];
for (const sec of ['field', 'tyreman', 'workshop']) {
  const j = await perintah(l2, 'buat_wo', { sectionCode: sec, blok: [blokOthers(`CONTOH Bersih gudang ${sec}`)] });
  periksa(`section ${sec}`, j.ok === true, j.pesan);
  const d = (j.data?.hasil['dibuat'] as { id: number }[] | undefined) ?? [];
  if (d[0]) woOthers.push(Number(d[0].id));
}

console.log('\n─── 2. angkanya di kolom SENDIRI, bukan menumpang override ───');
{
  const w = (
    await sql<{
      is_manual: boolean; manual_base_points: string | null;
      manual_target_hours: string | null; manual_unit_factor: string | null;
      unit_id: number | null; job_id: number | null;
    }[]>`
      SELECT is_manual, manual_base_points, manual_target_hours,
             manual_unit_factor, unit_id, job_id
        FROM work_orders WHERE id = ${woOthers[0]!}
    `
  )[0]!;
  periksa('ditandai is_manual', w.is_manual === true);
  periksa('base/target/faktor di kolom manual',
    Number(w.manual_base_points) === 3 && Number(w.manual_target_hours) === 4
      && Number(w.manual_unit_factor) === 1.2,
    JSON.stringify(w));
  periksa('tanpa unit dan tanpa job', w.unit_id === null && w.job_id === null);

  /* Inilah yang ditutup dengan memberi kolom sendiri. Di KMB V2 angka manual
     ditulis ke override_base_points_supervisor, sehingga SETIAP WO Others
     tampak sudah di-override L1 — dan sumbernya butuh EMPAT penjaga `!isOthers`
     yang berserakan untuk membatalkan kesan itu lagi. */
  const ov = await sql`
    SELECT 1 FROM work_order_overrides WHERE work_order_id = ${woOthers[0]!}
  `;
  periksa('TIDAK meninggalkan baris override palsu', ov.length === 0,
    `${ov.length} baris override muncul dari WO yang tak pernah dikoreksi`);
}

console.log('\n─── 3. mekanik tidak boleh membuat Others ───');
{
  const j = await perintah(mek, 'buat_wo', { sectionCode: 'workshop', blok: [blokOthers('Coba-coba')] });
  periksa('ditolak', j.ok === false, 'justru diterima');
  periksa('alasannya wewenang, bukan galat teknis',
    /L1 atau L2/i.test(j.pesan ?? ''), j.pesan);
}

console.log('\n─── 4. Others tidak boleh terikat unit ───');
{
  const u = (await sql<{ id: number }[]>`
    SELECT id FROM units WHERE is_virtual = false AND is_active ORDER BY id LIMIT 1
  `)[0]!;
  const j = await perintah(l2, 'buat_wo', {
    sectionCode: 'field',
    blok: [{ ...blokOthers('Bersih gudang'), unitId: Number(u.id) }],
  });
  periksa('ditolak', j.ok === false, 'justru diterima');
}

console.log('\n─── 5. unit SEMU tidak bisa dipakai sebagai unit sungguhan ───');
{
  const semu = (
    await sql<{ id: number }[]>`
      INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, is_virtual)
      VALUES ((SELECT id FROM tenants WHERE code='KMB'),
              ${'UJI-SEMU-' + Date.now()}, 'CONTOH Job Manual', 1.0, true)
      RETURNING id
    `
  )[0]!;
  const job = (await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
     WHERE s.code = 'tyreman' AND j.is_active ORDER BY j.id LIMIT 1
  `)[0];
  if (job) {
    const j = await perintah(l2, 'buat_wo', {
      sectionCode: 'tyreman',
      blok: [{ jobId: Number(job.id), unitId: Number(semu.id),
               workCondition: 'normal', teamMechanicIds: tim }],
    });
    periksa('ditolak', j.ok === false, 'justru diterima');
    periksa('pesannya menyebut jalan pintas job manual',
      /bukan unit sungguhan/i.test(j.pesan ?? ''), j.pesan);
  }
  await sql`DELETE FROM units WHERE id = ${semu.id}`;
}

console.log('\n─── 6. poin Others terbit benar ───');
{
  const id = woOthers[0]!;
  await sql`
    UPDATE work_orders
       SET status = 'pending_supervisor', submitted_at = now(),
           start_time = now() - interval '4 hours', end_time = now(),
           session_hours = 4
     WHERE id = ${id}
  `;
  const a = await perintah(l2, 'approve_l1', { woId: id });
  periksa('L1 lolos', a.ok === true, a.pesan);
  const b = await perintah(l2, 'approve_l2', { woId: id });
  periksa('L2 lolos', b.ok === true, b.pesan);

  // base 3 × unit 1,2 × kondisi 1,0 × tepat waktu × safety × mtbf
  const poin = Number(b.data?.hasil['finalPoints'] ?? 0);
  periksa('poin memakai base & faktor manual', poin > 0, `finalPoints=${poin}`);

  const snap = (
    await sql<{ base_points: string; unit_factor: string }[]>`
      SELECT base_points, unit_factor FROM scoring_snapshots WHERE work_order_id = ${id}
    `
  )[0];
  periksa('snapshot membekukan base 3', Number(snap?.base_points) === 3, JSON.stringify(snap));
  periksa('snapshot membekukan faktor manual 1,2',
    Number(snap?.unit_factor) === 1.2, JSON.stringify(snap));
}

console.log('\n─── 7. Others tampil benar di slip gaji ───');
{
  const aku = await identitasDariToken(l2);
  const { dataPayroll } = await import('../src/domain/kueriPayroll.js');
  const hari = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = await dataPayroll(aku, { mode: 'range', mulai: iso(hari), akhir: iso(hari) });
  const baris = d.detail.find((x) => x.deskripsi.includes('Bersih gudang'));
  periksa('barisnya ada di detail payroll', baris !== undefined,
    `${d.detail.length} baris, tak satu pun Others`);
  periksa('kolom komponen berbunyi "Others"', baris?.komponen === 'Others', baris?.komponen);
  periksa('deskripsinya yang diketik pembuat',
    baris?.deskripsi.startsWith('CONTOH Bersih gudang') === true, baris?.deskripsi);
  periksa('unitnya "-", bukan kosong atau nol', baris?.unitKode === '-', baris?.unitKode);
}

// Bersihkan jejak uji.
await sql`DELETE FROM work_orders WHERE id = ANY(${woOthers}::bigint[])`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
