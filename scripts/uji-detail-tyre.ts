import './muat-env.js';

/**
 * DETAIL TYRE — catatan teknis yang menempel pada WO ban.
 *
 * Dua batas mengikat seluruh fitur ini, dan keduanya diuji langsung:
 *
 *   1. Data teknis TIDAK mengubah poin maupun rupiah.
 *   2. Kegagalan detail tidak boleh menghilangkan jam kerja, status, atau tim.
 *
 * Plus satu yang paling mudah salah: nilai BEFORE adalah AFTER milik WO LAIN
 * yang terakhir. Kalau WO yang sedang dibuka ikut terhitung, angka yang baru
 * diketik mekanik muncul kembali sebagai Before miliknya sendiri dan selisihnya
 * selalu nol.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { bekalForm, detailUntukWo } = await import('../src/domain/kueriDetailForm.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function orang(peran: string, lewati: number[] = []) {
  const m = (
    await sql<{ id: number; tenant_id: number; name: string }[]>`
      SELECT id, tenant_id, name FROM mechanics
       WHERE role = ${peran} AND is_active AND is_test_account = false
         AND NOT (id = ANY(${lewati}::int[])) ORDER BY id LIMIT 1
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

const l2 = await orang('superintendent');
const mek = await orang('mechanic');
const lain = await orang('mechanic', [mek.id]);
const TENANT = mek.tenant_id;

async function perintah(t: string, aksi: string, data: unknown, opId = crypto.randomUUID()) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` },
    body: JSON.stringify({ aksi, op_id: opId, data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; kode?: string;
    data?: { hasil: Record<string, unknown> };
  }>;
}

/* ── Bekal: satu unit ban, satu job inspeksi yang terhubung form ───────────── */
const unit = (
  await sql<{ id: number }[]>`
    INSERT INTO units (tenant_id, unit_code, unit_name, unit_factor, odometer)
    VALUES ((SELECT id FROM tenants WHERE code='KMB'),
            ${'UJI-BAN-' + Date.now()}, 'CONTOH Unit Ban', 1.0, 'KM')
    RETURNING id
  `
)[0]!;

const jobInspeksi = (
  await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j
      JOIN job_detail_forms f ON f.id = j.detail_form_id
     WHERE f.code = 'tyre_inspeksi' ORDER BY j.id LIMIT 1
  `
)[0];

if (!jobInspeksi) {
  console.error('\nTak ada job yang terhubung ke form inspeksi ban.');
  console.error('Jalankan: npx tsx scripts/migrasi.ts db/migrasi/004-form-ban-lengkap.sql');
  console.error('dan pastikan katalog tyreman terisi (npm run db:katalog).\n');
  await sql`DELETE FROM units WHERE id = ${unit.id}`;
  await sql`DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[])`;
  await sql.end();
  process.exit(1);
}

const dibuat: number[] = [];
async function buatWoBan() {
  const j = await perintah(l2.token, 'buat_wo', {
    sectionCode: 'tyreman',
    blok: [{
      jobId: Number(jobInspeksi!.id), unitId: Number(unit.id),
      workCondition: 'normal', location: 'workshop', teamMechanicIds: [mek.id],
    }],
  });
  if (!j.ok) throw new Error(`gagal membuat WO ban: ${j.pesan}`);
  const id = Number((j.data?.hasil['dibuat'] as { id: number }[])[0]!.id);
  dibuat.push(id);
  return id;
}

console.log('\n─── 1. jenis form datang dari SERVER, bukan tebakan layar ───');
let woA = 0;
{
  woA = await buatWoBan();
  const bekal = await bekalForm(TENANT);
  const d = await detailUntukWo(TENANT, [woA]);
  const detail = d.get(woA);
  periksa('WO ban punya form', detail !== undefined);
  periksa('jenisnya inspeksi', detail?.jenis === 'tyre_inspeksi', detail?.jenis);

  const b = bekal.get(detail!.formId)!;
  periksa('sepuluh posisi, dari data bukan angka di kode', b.jumlahPos === 10, String(b.jumlahPos));
  periksa('tiga medan before/after: pressure, rtd, suhu',
    b.medan.filter((m) => m.hasBeforeAfter).map((m) => m.fieldKey).join(',') === 'pressure,rtd,suhu',
    b.medan.map((m) => m.fieldKey).join(','));
  periksa('ambang RTD kritis TIDAK ditebak — belum ada keputusannya',
    b.rtdKritis === null, String(b.rtdKritis));
}

console.log('\n─── 2. remove/instal punya EMPAT BELAS medan, bukan sembilan ───');
{
  const bekal = await bekalForm(TENANT);
  const ri = [...bekal.values()].find((b) => b.kode === 'tyre_remove_instal')!;
  periksa('empat belas medan', ri.medan.length === 14, `${ri.medan.length} medan`);
  for (const k of ['remove_remarks', 'instal_tyre', 'instal_inner', 'instal_flap',
                   'lokasi_breakdown']) {
    periksa(`medan ${k} ada`, ri.medan.some((m) => m.fieldKey === k));
  }
  const problem = ri.medan.find((m) => m.fieldKey === 'remove_problem')!;
  periksa('dropdown Problem terisi pilihannya',
    problem.pilihan.includes('Side wall cut'), JSON.stringify(problem.pilihan));
  const tyre = ri.medan.find((m) => m.fieldKey === 'instal_tyre')!;
  periksa('dropdown Tyre memakai daftar kondisi',
    tyre.pilihan.join(',') === 'Baru,Repair,Bekas', tyre.pilihan.join(','));
  periksa('labelnya label LAYAR, bukan label benih',
    ri.medan.find((m) => m.fieldKey === 'remove_sn')?.label === 'Serial No',
    ri.medan.find((m) => m.fieldKey === 'remove_sn')?.label);
}

console.log('\n─── 3. isian tersimpan dan kembali saat form dibuka lagi ───');
{
  const a = await perintah(mek.token, 'simpan_detail', {
    woId: woA,
    nilai: {
      '1': { pressure: '100', rtd: '25', suhu: '40' },
      '2': { pressure: '98' },
      '3': { pressure: '', rtd: '', suhu: '' },   // kosong seluruhnya
    },
  });
  periksa('penyimpanan diterima', a.ok === true, a.pesan);
  periksa('posisi kosong DILEWATI, bukan jadi baris hampa',
    Number(a.data?.hasil['dilewati']) === 1, String(a.data?.hasil['dilewati']));

  const d = (await detailUntukWo(TENANT, [woA])).get(woA)!;
  periksa('posisi 1 kembali utuh',
    d.isian['1']?.after['pressure'] === '100' && d.isian['1']?.after['rtd'] === '25',
    JSON.stringify(d.isian['1']));
  periksa('posisi 2 hanya pressure', d.isian['2']?.after['pressure'] === '98');
  periksa('posisi 3 tidak melahirkan baris', d.isian['3'] === undefined);
}

console.log('\n─── 4. kiriman ULANG menimpa, tidak menumpuk ───');
{
  await perintah(mek.token, 'simpan_detail', {
    woId: woA, nilai: { '1': { pressure: '105' } },
  });
  const n = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM work_order_detail_values
     WHERE work_order_id = ${woA} AND position = 1 AND field_key = 'pressure'
  `;
  periksa('tetap satu baris untuk posisi 1 pressure', Number(n[0]!.n) === 1, n[0]!.n);
  const d = (await detailUntukWo(TENANT, [woA])).get(woA)!;
  periksa('nilainya yang terbaru', d.isian['1']?.after['pressure'] === '105',
    d.isian['1']?.after['pressure']);
  periksa('medan lain di posisi itu TIDAK ikut terhapus',
    d.isian['1']?.after['rtd'] === '25', d.isian['1']?.after['rtd']);
}

console.log('\n─── 5. BEFORE = after WO LAIN yang terakhir ───');
{
  // WO kedua pada unit yang sama. Before-nya harus berasal dari woA.
  const woB = await buatWoBan();
  const d = (await detailUntukWo(TENANT, [woB])).get(woB)!;
  periksa('before posisi 1 datang dari WO sebelumnya',
    d.before['1']?.['pressure'] === '105', JSON.stringify(d.before['1']));
  periksa('ketiga medannya dari CATATAN yang sama, bukan tiga waktu berbeda',
    d.before['1']?.['rtd'] === '25' && d.before['1']?.['suhu'] === '40',
    JSON.stringify(d.before['1']));
  periksa('posisi yang belum pernah dicatat tetap kosong — bukan nol',
    d.before['9'] === undefined, JSON.stringify(d.before['9']));

  // Isi woB, lalu baca ulang woB: Before-nya TIDAK boleh berubah jadi isiannya
  // sendiri.
  await perintah(mek.token, 'simpan_detail', {
    woId: woB, nilai: { '1': { pressure: '88' } },
  });
  const d2 = (await detailUntukWo(TENANT, [woB])).get(woB)!;
  periksa('AFTER sendiri tidak muncul sebagai BEFORE sendiri',
    d2.before['1']?.['pressure'] === '105', JSON.stringify(d2.before['1']));
  periksa('isiannya sendiri tetap terbaca terpisah',
    d2.isian['1']?.after['pressure'] === '88', d2.isian['1']?.after['pressure']);

  // Dan dari sisi woA, Before-nya sekarang boleh datang dari woB.
  const d3 = (await detailUntukWo(TENANT, [woA])).get(woA)!;
  periksa('WO lama melihat catatan WO baru sebagai Before-nya',
    d3.before['1']?.['pressure'] === '88', JSON.stringify(d3.before['1']));
}

console.log('\n─── 6. pagar payload ───');
{
  const a = await perintah(mek.token, 'simpan_detail', {
    woId: woA, nilai: { '1': { remove_sn: 'SN-123' } },
  });
  periksa('medan milik form LAIN ditolak', a.ok === false, 'justru diterima');
  periksa('pesannya menyebut medannya', /remove_sn/.test(a.pesan ?? ''), a.pesan);

  const b = await perintah(mek.token, 'simpan_detail', {
    woId: woA, nilai: { '11': { pressure: '90' } },
  });
  periksa('posisi 11 di luar 1-10 ditolak', b.ok === false, 'justru diterima');

  const c = await perintah(mek.token, 'simpan_detail', {
    woId: woA, nilai: { '1': { pressure: 'seratus' } },
  });
  periksa('medan numerik diisi huruf ditolak', c.ok === false, 'justru diterima');

  const e = await perintah(lain.token, 'simpan_detail', {
    woId: woA, nilai: { '1': { pressure: '90' } },
  });
  periksa('orang di luar tim ditolak', e.ok === false, 'justru diterima');
}

console.log('\n─── 7. detail TIDAK menyentuh jam, status, tim, maupun uang ───');
{
  const wo = await buatWoBan();
  await perintah(mek.token, 'kirim_kerja',
    { woId: wo, startTime: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      endTime: new Date().toISOString() });

  const sebelum = (
    await sql<{ session_hours: string; status: string }[]>`
      SELECT session_hours, status::text AS status FROM work_orders WHERE id = ${wo}
    `
  )[0]!;

  // Detail TERLAMBAT: WO sudah di meja L1, antrean HP baru sampai sekarang.
  const a = await perintah(mek.token, 'simpan_detail', {
    woId: wo, nilai: { '4': { pressure: '95', rtd: '20' } },
  });
  periksa('detail terlambat TETAP diterima', a.ok === true, a.pesan);

  const sesudah = (
    await sql<{ session_hours: string; status: string }[]>`
      SELECT session_hours, status::text AS status FROM work_orders WHERE id = ${wo}
    `
  )[0]!;
  periksa('jam kerja tidak bergeser',
    sesudah.session_hours === sebelum.session_hours,
    `${sebelum.session_hours} → ${sesudah.session_hours}`);
  periksa('status tidak bergeser', sesudah.status === sebelum.status);

  // Sampai ke uang: approve, lalu bandingkan poin dengan WO tanpa detail.
  await perintah(l2.token, 'approve_l1', { woId: wo });
  const b = await perintah(l2.token, 'approve_l2', { woId: wo });
  periksa('approve lolos', b.ok === true, b.pesan);

  const poinDenganDetail = Number(b.data?.hasil['finalPoints'] ?? 0);

  const woPolos = await buatWoBan();
  await perintah(mek.token, 'kirim_kerja',
    { woId: woPolos, startTime: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      endTime: new Date().toISOString() });
  await perintah(l2.token, 'approve_l1', { woId: woPolos });
  const c = await perintah(l2.token, 'approve_l2', { woId: woPolos });
  const poinTanpaDetail = Number(c.data?.hasil['finalPoints'] ?? 0);

  periksa('POIN SAMA PERSIS dengan WO tanpa detail — data teknis bukan uang',
    poinDenganDetail === poinTanpaDetail && poinDenganDetail > 0,
    `${poinDenganDetail} vs ${poinTanpaDetail}`);
}

console.log('\n─── 8. form yang DIMATIKAN tidak bisa ditulis ───');
{
  const wo = await buatWoBan();
  await sql`UPDATE job_detail_forms SET is_enabled = false WHERE code = 'tyre_inspeksi'`;
  try {
    const a = await perintah(mek.token, 'simpan_detail', {
      woId: wo, nilai: { '1': { pressure: '90' } },
    });
    periksa('ditolak SERVER, bukan cuma disembunyikan layar', a.ok === false, 'justru diterima');

    const d = await detailUntukWo(TENANT, [wo]);
    periksa('dan tidak dibaca juga', d.get(wo) === undefined);
  } finally {
    await sql`UPDATE job_detail_forms SET is_enabled = true WHERE code = 'tyre_inspeksi'`;
  }
}

// Bersihkan jejak uji.
await sql`DELETE FROM work_orders WHERE id = ANY(${dibuat}::bigint[])`;
await sql`DELETE FROM units WHERE id = ${unit.id}`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
