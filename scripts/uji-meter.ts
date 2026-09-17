import './muat-env.js';

/**
 * KOREKSI HM & KM.
 *
 * Yang dijaga di sini adalah sebab layar ini ada: angka yang TERLALU BESAR
 * lolos pagar justru karena ia lebih besar, lalu jadi acuan — dan sejak saat itu
 * setiap bacaan sah berikutnya ikut ditolak. Satu salah pencet meracuni riwayat
 * unit itu selamanya, dan satu-satunya obatnya adalah memperbaiki bacaan
 * TERTENTU, bukan menambah bacaan baru.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { acuanUnit, periksaMasuk, riwayatUnit, unitBermeter } =
  await import('../src/domain/meter.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function orang(peran: string) {
  const m = (
    await sql<{ id: number; tenant_id: number; name: string }[]>`
      SELECT id, tenant_id, name FROM mechanics
       WHERE role = ${peran} AND is_active AND is_test_account = false
       ORDER BY id LIMIT 1
    `
  )[0]!;
  const t = buatToken();
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${m.id} AND is_active AND revoked_at IS NULL`;
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return { ...m, token: t };
}

const l1 = await orang('supervisor');
const l2 = await orang('superintendent');
const mek = await orang('mechanic');
const TENANT = mek.tenant_id;

async function perintah(t: string, aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `mar_token=${t}` },
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

/* Job dipilih DULU, baru unitnya dibuat dengan model yang sama. Katalog
   memagari pasangan job–model unit, jadi unit uji tanpa model akan ditolak
   dengan alasan yang tak ada hubungannya dengan meter. */
const job = (await sql<{ id: number; unit_model_id: number | null }[]>`
  SELECT j.id, j.unit_model_id FROM jobs j JOIN sections s ON s.id = j.section_id
   WHERE s.code = 'field' AND j.is_active AND j.unit_model_id IS NOT NULL
   ORDER BY j.id LIMIT 1
`)[0];

// Unit sendiri, supaya riwayatnya bersih dan bisa diperiksa angka demi angka.
const unit = (
  await sql<{ id: number }[]>`
    INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor, odometer)
    VALUES ((SELECT id FROM tenants WHERE code='KMB'),
            ${'UJI-METER-' + Date.now()}, 'CONTOH Unit Meter',
            ${job?.unit_model_id ?? null}, 1.0, 'HM')
    RETURNING id
  `
)[0]!;
const UNIT = Number(unit.id);

const dibuat: number[] = [];
async function buatWo(hm: number | undefined) {
  const j = await perintah(l2.token, 'buat_wo', {
    sectionCode: 'field',
    blok: [{
      ...(job ? { jobId: Number(job.id) } : {
        manual: { description: 'CONTOH meter', basePoints: 2, targetHours: 3, unitFactor: 1 },
      }),
      unitId: UNIT, workCondition: 'normal', location: 'field',
      teamMechanicIds: [mek.id],
      ...(hm === undefined ? {} : { hourMeter: hm }),
    }],
  });
  if (!j.ok) return { ok: false as const, pesan: j.pesan };
  const id = Number((j.data?.hasil['dibuat'] as { id: number }[])[0]!.id);
  dibuat.push(id);
  return { ok: true as const, id };
}

console.log('\n─── 1. pagar naik-saja saat WO dibuat ───');
{
  const a = await buatWo(1000);
  periksa('bacaan pertama diterima', a.ok === true, a.ok ? '' : a.pesan);

  const b = await buatWo(1200);
  periksa('bacaan lebih besar diterima', b.ok === true, b.ok ? '' : b.pesan);

  const c = await buatWo(900);
  periksa('bacaan MUNDUR ditolak', c.ok === false, 'justru diterima');
  periksa('pesannya menyarankan menu koreksi',
    /Koreksi HM/i.test(c.ok ? '' : c.pesan ?? ''), c.ok ? '' : c.pesan);

  const d = await buatWo(undefined);
  periksa('HM KOSONG tidak ditolak — isian meter memang opsional',
    d.ok === true, d.ok ? '' : d.pesan);
}

console.log('\n─── 2. acuan = yang TERBESAR, bukan yang terbaru ───');
{
  // WO ini dibuat BELAKANGAN tapi ber-HM lebih kecil dari 1200. Kalau acuannya
  // "yang terbaru", angka 1200 akan tertimpa dan pagar bisa dilewati dengan
  // mengatur urutan pembuatan saja.
  await sql`
    INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
      status, created_by, hour_meter, created_at)
    VALUES (${TENANT}, ${'UJI-MTR-' + Date.now()},
            (SELECT id FROM sections WHERE tenant_id=${TENANT} AND code='field'),
            ${job ? Number(job.id) : null}, ${UNIT}, 'pending_mechanic_work',
            ${l2.id}, 1100, now())
    RETURNING id
  `.then((r) => dibuat.push(Number((r as unknown as { id: number }[])[0]!.id)));

  const acuan = await acuanUnit(UNIT, 'HM');
  periksa('acuan tetap 1200', acuan?.nilai === 1200, String(acuan?.nilai));

  const p = await periksaMasuk(UNIT, 1150, 'HM');
  periksa('1150 masih ditolak karena acuannya 1200', p.ok === false, JSON.stringify(p));

  /* Baris 1100 itu datang SESUDAH 1200 secara waktu, jadi ia mundur terhadap
     tertinggi yang berjalan. Ia harus bertanda — bukan karena berbahaya
     (yang mundur ketahuan langsung), tapi karena orang yang membuka layar ini
     sedang mencari yang janggal. */
  const r = await riwayatUnit(TENANT, UNIT, 'HM');
  periksa('bacaan yang mundur ditandai MUNDUR',
    r.bacaan.some((b) => b.nilai === 1100 && b.janggal === 'mundur'),
    JSON.stringify(r.bacaan.map((b) => [b.nilai, b.janggal])));
  periksa('yang terbaru di ATAS',
    r.bacaan.length > 1
      && new Date(r.bacaan[0]!.at) >= new Date(r.bacaan[r.bacaan.length - 1]!.at));
}

console.log('\n─── 3. angka RACUN: lolos pagar, lalu mengunci semuanya ───');
let woRacun = 0;
{
  const a = await buatWo(999999);
  periksa('999999 LOLOS pagar — justru karena lebih besar', a.ok === true,
    a.ok ? '' : a.pesan);
  woRacun = a.ok ? a.id : 0;

  const b = await buatWo(1300);
  periksa('sejak itu bacaan SAH pun ikut ditolak', b.ok === false, 'justru diterima');

  const r = await riwayatUnit(TENANT, UNIT, 'HM');
  const baris = r.bacaan.find((x) => x.woId === woRacun);
  periksa('barisnya ditandai MELOMPAT', baris?.janggal === 'melompat', baris?.janggal);
  periksa('ambangnya dari settings, bukan tetapan kode',
    r.ambangLompat === 2000, String(r.ambangLompat));
}

console.log('\n─── 4. koreksi memperbaiki BACAAN TERTENTU ───');
{
  const a = await perintah(mek.token, 'koreksi_meter',
    { woId: woRacun, jenis: 'HM', nilaiBaru: 1250, alasan: 'CONTOH salah ketik' });
  periksa('mekanik ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya wewenang', /hanya untuk L1 dan L2/i.test(a.pesan ?? ''), a.pesan);

  const b = await perintah(l1.token, 'koreksi_meter',
    { woId: woRacun, jenis: 'HM', nilaiBaru: 1250, alasan: 'oke' });
  periksa('alasan kurang 5 huruf ditolak', b.ok === false, 'justru diterima');

  const c = await perintah(l1.token, 'koreksi_meter', {
    woId: woRacun, jenis: 'HM', nilaiBaru: 1250,
    alasan: 'CONTOH salah ketik, seharusnya 1250 bukan 999999',
  });
  periksa('L1 boleh mengoreksi', c.ok === true, c.pesan);
  periksa('nilai lama ikut dilaporkan', Number(c.data?.hasil['lama']) === 999999,
    String(c.data?.hasil['lama']));

  const w = (await sql<{ hour_meter: string }[]>`
    SELECT hour_meter FROM work_orders WHERE id = ${woRacun}
  `)[0]!;
  periksa('yang disunting BARIS WO-nya sendiri', Number(w.hour_meter) === 1250, w.hour_meter);

  const jejak = (await sql<{ value_before: string; value_after: string; reason: string }[]>`
    SELECT value_before, value_after, reason FROM meter_corrections
     WHERE work_order_id = ${woRacun}
  `)[0]!;
  periksa('jejaknya menyimpan nilai LAMA dan BARU',
    Number(jejak.value_before) === 999999 && Number(jejak.value_after) === 1250,
    JSON.stringify(jejak));

  // Dan inilah gunanya seluruh layar ini.
  const d = await buatWo(1300);
  periksa('sesudah dikoreksi, bacaan sah bisa masuk lagi', d.ok === true,
    d.ok ? '' : d.pesan);
}

console.log('\n─── 5. meter_readings ikut dikoreksi, bukan jadi sumber kedua ───');
{
  const r = await sql<{ value: string }[]>`
    SELECT value FROM meter_readings
     WHERE work_order_id = ${woRacun} AND kind = 'HM'
  `;
  // Kalau tabel turunan ini tidak ikut dikoreksi, pagar naik-saja akan terus
  // membaca 999999 dan koreksinya tidak berpengaruh apa pun.
  periksa('turunannya ikut jadi 1250',
    r.length === 1 && Number(r[0]!.value) === 1250, JSON.stringify(r));
}

console.log('\n─── 6. dikosongkan: "lebih baik hilang daripada salah" ───');
{
  const wo = await buatWo(1400);
  const id = wo.ok ? wo.id : 0;
  const a = await perintah(l2.token, 'koreksi_meter', {
    woId: id, jenis: 'HM', nilaiBaru: null,
    alasan: 'CONTOH angka yang benar tidak diketahui',
  });
  periksa('dikosongkan diterima', a.ok === true, a.pesan);

  const w = (await sql<{ hour_meter: string | null }[]>`
    SELECT hour_meter FROM work_orders WHERE id = ${id}
  `)[0]!;
  periksa('kolomnya jadi NULL, bukan 0', w.hour_meter === null, String(w.hour_meter));

  const r = await sql`SELECT 1 FROM meter_readings WHERE work_order_id = ${id} AND kind='HM'`;
  periksa('turunannya ikut hilang', r.length === 0, `${r.length} baris`);

  const b = await perintah(l2.token, 'koreksi_meter',
    { woId: id, jenis: 'HM', nilaiBaru: 0, alasan: 'CONTOH nol tidak sah' });
  periksa('nol DITOLAK — beda dari dikosongkan', b.ok === false, 'justru diterima');
}

console.log('\n─── 7. penggantian panel ───');
{
  const a = await perintah(l1.token, 'ganti_panel_meter', {
    unitId: UNIT, jenis: 'HM', nilaiBaru: 0,
    // TEPAT SEKARANG, bukan semenit lalu: bacaan yang dibuat sesudah titik ini
    // memang milik panel baru, dan yang sebelumnya milik panel lama.
    berlakuAt: new Date().toISOString(),
    alasan: 'CONTOH panel jam rusak, diganti unit baru',
  });
  periksa('panel baru bernilai 0 DITERIMA', a.ok === true, a.pesan);

  const acuan = await acuanUnit(UNIT, 'HM');
  periksa('acuan turun ke 0 — bacaan panel lama tidak lagi berlaku',
    acuan?.nilai === 0, String(acuan?.nilai));
  periksa('acuannya ditandai berasal dari panel', acuan?.dariPanel === true);

  const b = await buatWo(5);
  periksa('bacaan kecil sesudah panel diganti DITERIMA', b.ok === true,
    b.ok ? '' : b.pesan);

  const c = await perintah(l1.token, 'ganti_panel_meter', {
    unitId: UNIT, jenis: 'HM', nilaiBaru: 100,
    berlakuAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    alasan: 'CONTOH tanggal masa depan',
  });
  periksa('tanggal di masa depan ditolak', c.ok === false, 'justru diterima');
}

console.log('\n─── 8. nilai panel jadi LANTAI, bukan cuma penanda waktu ───');
{
  const u2 = (
    await sql<{ id: number }[]>`
      INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, odometer)
      VALUES ((SELECT id FROM tenants WHERE code='KMB'),
              ${'UJI-METER2-' + Date.now()}, 'CONTOH Unit Meter 2', 1.0, 'HM')
      RETURNING id
    `
  )[0]!;
  await perintah(l1.token, 'ganti_panel_meter', {
    unitId: Number(u2.id), jenis: 'HM', nilaiBaru: 12500,
    berlakuAt: new Date(Date.now() - 60_000).toISOString(),
    alasan: 'CONTOH panel diganti dengan panel bekas ber-HM 12500',
  });

  const p = await periksaMasuk(Number(u2.id), 100, 'HM');
  /* Tanpa nilai panel sebagai lantai, 100 lolos hanya karena ia tercatat
     SESUDAH penggantian — padahal panelnya sendiri sudah menunjuk 12.500. */
  periksa('bacaan 100 sesudah panel 12500 DITOLAK', p.ok === false, JSON.stringify(p));
  const q = await periksaMasuk(Number(u2.id), 12600, 'HM');
  periksa('bacaan 12600 diterima', q.ok === true, JSON.stringify(q));

  await sql`DELETE FROM meter_panel_changes WHERE unit_id = ${u2.id}`;
  await sql`DELETE FROM units WHERE id = ${u2.id}`;
}

console.log('\n─── 9. HM dan KM tidak saling mencampuri ───');
{
  const acuanKm = await acuanUnit(UNIT, 'KM');
  periksa('unit ini tak punya acuan KM walau HM-nya banyak', acuanKm === null,
    JSON.stringify(acuanKm));

  const aksi = await sql<{ action: string }[]>`
    SELECT DISTINCT action FROM audit_logs
     WHERE action LIKE 'koreksi_%' OR action LIKE 'ganti_panel_%'
  `;
  // Di KMB V2 koreksi KM ikut tercatat sebagai KOREKSI_HM, sehingga menyaring
  // audit menurut aksi menyebut koreksi KM sebagai koreksi HM.
  periksa('aksi audit menyebut meternya sendiri',
    aksi.some((a) => a.action === 'koreksi_hm')
      && aksi.some((a) => a.action === 'ganti_panel_hm'),
    JSON.stringify(aksi.map((a) => a.action)));
}

console.log('\n─── 10. unit semu tidak muncul dan tidak bisa dipakai ───');
{
  const semu = (
    await sql<{ id: number }[]>`
      INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, is_virtual)
      VALUES ((SELECT id FROM tenants WHERE code='KMB'),
              ${'UJI-SEMU-' + Date.now()}, 'CONTOH Workshop', 1.0, true)
      RETURNING id
    `
  )[0]!;
  const daftar = await unitBermeter(TENANT);
  periksa('tidak ada di pemilih unit', !daftar.some((u) => u.id === Number(semu.id)));

  const a = await perintah(l1.token, 'ganti_panel_meter', {
    unitId: Number(semu.id), jenis: 'HM', nilaiBaru: 10,
    berlakuAt: new Date(Date.now() - 60_000).toISOString(),
    alasan: 'CONTOH unit semu',
  });
  periksa('penggantian panel untuk unit semu ditolak', a.ok === false, 'justru diterima');
  await sql`DELETE FROM units WHERE id = ${semu.id}`;
}

// Bersihkan jejak uji.
await sql`DELETE FROM work_orders WHERE id = ANY(${dibuat}::bigint[])`;
// meter_readings memakai ON DELETE SET NULL terhadap WO, jadi barisnya SELAMAT
// dari penghapusan WO dan masih memegang unitnya.
await sql`DELETE FROM meter_readings WHERE unit_id = ${UNIT}`;
await sql`DELETE FROM meter_panel_changes WHERE unit_id = ${UNIT}`;
await sql`DELETE FROM units WHERE id = ${UNIT}`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
