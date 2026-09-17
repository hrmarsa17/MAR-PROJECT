import './muat-env.js';

/**
 * UNIT DI MENU ADMIN — tambah, atur lingkup, hapus.
 *
 * Yang dijaga di sini:
 *
 *   1. LINGKUP (section mana yang boleh memilih) TERPISAH dari MODEL (joblist
 *      mana yang ditawarkan). Keduanya pernah tertukar, dan akibatnya tyreman
 *      melihat 6 unit dari 50 miliknya.
 *   2. Faktor unit adalah PENGALI POIN. Angka liar ditolak sebelum tersimpan.
 *   3. HAPUS hanya untuk baris yang belum pernah tersentuh. Yang sudah dipakai
 *      WO — atau punya catatan meter — ditolak dengan kalimat yang menyuruh
 *      menonaktifkan, bukan dengan galat foreign key.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { bekalAdmin } = await import('../src/domain/admin.js');
const { katalog } = await import('../src/domain/kueri.js');
const { identitasDariToken } = await import('../src/lib/auth.js');

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
       WHERE role = ${peran} AND is_active AND NOT (id = ANY(${lewati}::int[]))
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

const l2 = await orang('superintendent');
const mek = await orang('mechanic');
const TENANT = Number(l2.tenant_id);
const adminSemula = (
  await sql<{ may_admin: boolean }[]>`SELECT may_admin FROM mechanics WHERE id = ${l2.id}`
)[0]!.may_admin;
await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;

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

const CAP = Date.now().toString().slice(-6);
const KODE = `UJI-U${CAP}`;
const unitDibuat: number[] = [];
const woDibuat: number[] = [];

console.log('\n─── 1. tambah unit: lingkup dan model adalah DUA hal ───');
let unitId = 0;
{
  const a = await perintah(l2.token, 'admin_unit', {
    kode: KODE, nama: `XUJI${CAP}`, unitModel: 'Hauler',
    section: ['tyreman'], global: false, unitFactor: 1.2,
    odometer: 'KM', mtbfEligible: false, aktif: true,
  });
  periksa('unit baru tersimpan', a.ok === true, a.pesan);
  periksa('dilaporkan sebagai baru', a.data?.hasil['baru'] === true);
  unitId = Number(a.data?.hasil['unitId']);
  unitDibuat.push(unitId);

  const b = await bekalAdmin(TENANT);
  const u = b.unit.find((x) => x.id === unitId);
  periksa('lingkupnya tyreman', JSON.stringify(u?.section) === '["tyreman"]',
    JSON.stringify(u?.section));
  /* Modelnya milik FIELD. Kalau layar menurunkan lingkup dari model, baris di
     atas akan berbunyi ["field"] — dan unit ini lenyap dari tyreman. */
  periksa('sementara modelnya Hauler (milik field), dan itu TIDAK mengubah lingkupnya',
    u?.unitModel === 'Hauler', String(u?.unitModel));
  periksa('faktornya tersimpan apa adanya', u?.unitFactor === 1.2, String(u?.unitFactor));
}

console.log('\n─── 2. unit itu benar-benar muncul di dropdown tyreman ───');
{
  const aku = await identitasDariToken(l2.token);
  const kat = await katalog(aku!);
  const u = (kat.units as unknown as {
    id: number; sections: string[]; is_global: boolean; unit_model: string | null;
  }[]).find((x) => Number(x.id) === unitId);
  periksa('unit terbawa ke katalog layar buat WO', !!u);
  periksa('membawa daftar section, bukan satu section model',
    Array.isArray(u?.sections) && u?.sections.includes('tyreman'),
    JSON.stringify(u?.sections));
  periksa('dan modelnya tetap terbawa untuk memilih joblist',
    u?.unit_model === 'Hauler', String(u?.unit_model));

  // Inti perbaikannya: seluruh unit tyreman terlihat, bukan cuma yang tanpa model.
  const semua = kat.units as unknown as { sections: string[]; is_global: boolean }[];
  const utama = semua.filter((x) =>
    !x.is_global && (x.sections.length === 0 || x.sections.includes('tyreman')));
  periksa('tyreman melihat puluhan unit, bukan segelintir', utama.length > 40,
    `${utama.length} unit`);
  const global = semua.filter((x) => x.is_global);
  periksa('unit sewa ditandai terpisah supaya bisa disembunyikan', global.length > 0,
    `${global.length} unit global`);
}

console.log('\n─── 3. faktor unit adalah pengali poin — angka liar ditolak ───');
{
  const a = await perintah(l2.token, 'admin_unit', {
    kode: `${KODE}-X`, nama: 'CONTOH Faktor Liar', section: [], global: false,
    unitFactor: 15, mtbfEligible: false, aktif: true,
  });
  periksa('faktor 15 ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menyuruh memeriksa titik desimal',
    /desimal/i.test(a.pesan ?? ''), a.pesan);

  const b = await perintah(l2.token, 'admin_unit', {
    kode: `${KODE}-X`, nama: 'CONTOH Faktor Nol', section: [], global: false,
    unitFactor: 0, mtbfEligible: false, aktif: true,
  });
  periksa('faktor 0 ditolak', b.ok === false, 'justru diterima');
}

console.log('\n─── 4. kode unit kembar ditolak ───');
{
  const a = await perintah(l2.token, 'admin_unit', {
    kode: KODE, nama: 'CONTOH Kembar', section: [], global: false,
    unitFactor: 1, mtbfEligible: false, aktif: true,
  });
  periksa('kode yang sudah dipakai ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menyebut kode itu sudah dipakai',
    /sudah dipakai/i.test(a.pesan ?? ''), a.pesan);
}

console.log('\n─── 5. model yang tidak ada ditolak, tidak dibuat diam-diam ───');
{
  /* Model menentukan JOBLIST unit. Membuatnya otomatis di sini menghasilkan
     model kosong tanpa satu pun job — unit yang terlihat sah tapi tak punya
     pekerjaan, dan tak ada yang tahu kenapa. */
  const a = await perintah(l2.token, 'admin_unit', {
    unitId, nama: `XUJI${CAP}`, unitModel: `MODEL-HANTU-${CAP}`,
    section: ['tyreman'], global: false, unitFactor: 1.2,
    odometer: 'KM', mtbfEligible: false, aktif: true,
  });
  periksa('model yang belum ada ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menjelaskan model menentukan joblist',
    /joblist/i.test(a.pesan ?? ''), a.pesan);
}

console.log('\n─── 6. global menang atas daftar section ───');
{
  const a = await perintah(l2.token, 'admin_unit', {
    unitId, nama: `XUJI${CAP}`, unitModel: 'Hauler',
    section: ['tyreman'], global: true, unitFactor: 1.2,
    odometer: 'KM', mtbfEligible: false, aktif: true,
  });
  periksa('unit bisa ditandai global', a.ok === true, a.pesan);

  const aku = await identitasDariToken(l2.token);
  const kat = await katalog(aku!);
  const u = (kat.units as unknown as { id: number; is_global: boolean }[])
    .find((x) => Number(x.id) === unitId);
  periksa('penanda global terbawa ke layar', u?.is_global === true);

  // Kembalikan supaya bagian berikutnya berangkat dari keadaan yang jelas.
  await perintah(l2.token, 'admin_unit', {
    unitId, nama: `XUJI${CAP}`, unitModel: 'Hauler', section: ['tyreman'],
    global: false, unitFactor: 1.2, odometer: 'KM', mtbfEligible: false, aktif: true,
  });
}

console.log('\n─── 7. lingkup diganti UTUH, bukan ditambal ───');
{
  await perintah(l2.token, 'admin_unit', {
    unitId, nama: `XUJI${CAP}`, unitModel: 'Hauler', section: ['field'],
    global: false, unitFactor: 1.2, odometer: 'KM', mtbfEligible: false, aktif: true,
  });
  const b = await bekalAdmin(TENANT);
  const u = b.unit.find((x) => x.id === unitId);
  /* Kalau ditambal, unit yang dipindah dari tyreman ke field akan tetap
     terlihat di tyreman selamanya — dan tak ada cara mengeluarkannya. */
  periksa('tyreman benar-benar tercabut', JSON.stringify(u?.section) === '["field"]',
    JSON.stringify(u?.section));

  await perintah(l2.token, 'admin_unit', {
    unitId, nama: `XUJI${CAP}`, unitModel: 'Hauler', section: [],
    global: false, unitFactor: 1.2, odometer: 'KM', mtbfEligible: false, aktif: true,
  });
  const c = await bekalAdmin(TENANT);
  periksa('dikosongkan berarti boleh semua section',
    c.unit.find((x) => x.id === unitId)?.section.length === 0);
}

console.log('\n─── 8. hapus unit yang belum tersentuh ───');
{
  const a = await perintah(l2.token, 'admin_unit', {
    kode: `${KODE}-HAPUS`, nama: 'CONTOH Salah Ketik', section: [], global: false,
    unitFactor: 1, mtbfEligible: false, aktif: true,
  });
  const id = Number(a.data?.hasil['unitId']);
  const b = await perintah(l2.token, 'admin_hapus_unit', { unitId: id });
  periksa('unit tanpa jejak bisa dihapus', b.ok === true, b.pesan);
  const sisa = await sql`SELECT 1 FROM units WHERE id = ${id}`;
  periksa('benar-benar hilang dari basis data', sisa.length === 0);
}

console.log('\n─── 9. unit yang sudah dipakai WO TIDAK bisa dihapus ───');
{
  const job = (await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
     WHERE s.code = 'tyreman' AND j.is_active ORDER BY j.id LIMIT 1`)[0]!;
  const w = await perintah(l2.token, 'buat_wo', {
    sectionCode: 'tyreman',
    blok: [{
      jobId: Number(job.id), unitId, workCondition: 'normal',
      location: 'field', teamMechanicIds: [mek.id],
    }],
  });
  if (!w.ok) throw new Error(`gagal membuat WO uji: ${w.pesan}`);
  woDibuat.push(Number((w.data?.hasil['dibuat'] as { id: number }[])[0]!.id));

  const a = await perintah(l2.token, 'admin_hapus_unit', { unitId });
  periksa('ditolak', a.ok === false, 'justru dihapus');
  periksa('alasannya menyebut berapa WO', /1 WO/.test(a.pesan ?? ''), a.pesan);
  periksa('dan menyuruh menonaktifkan, bukan memaksa',
    /nonaktif|Aktif/i.test(a.pesan ?? ''), a.pesan);

  const b = await bekalAdmin(TENANT);
  periksa('layar juga tahu penahannya sebelum tombolnya ditekan',
    b.unit.find((x) => x.id === unitId)?.woTotal === 1);
}

console.log('\n─── 10. job: hapus dan penahannya ───');
{
  const a = await perintah(l2.token, 'admin_job', {
    sectionCode: 'tyreman', kode: `UJI-J${CAP}`, nama: 'CONTOH Job Salah Ketik',
    basePoints: 5, planHours: 2, aktif: true,
  });
  const jobId = Number(a.data?.hasil['jobId']);
  const b = await perintah(l2.token, 'admin_hapus_job', { jobId });
  periksa('job tanpa WO bisa dihapus', b.ok === true, b.pesan);

  const dipakai = (await sql<{ id: number; n: number }[]>`
    SELECT j.id, count(w.id)::int AS n FROM jobs j
      JOIN work_orders w ON w.job_id = j.id
     GROUP BY j.id ORDER BY 2 DESC LIMIT 1`)[0];
  if (dipakai) {
    const c = await perintah(l2.token, 'admin_hapus_job', { jobId: Number(dipakai.id) });
    periksa('job yang dipakai WO ditolak', c.ok === false, 'justru dihapus');
    periksa('alasannya menyebut WO lama membaca namanya dari baris itu',
      /membaca nama/i.test(c.pesan ?? ''), c.pesan);
  }
}

console.log('\n─── 11. gerbangnya tetap penanda admin ───');
{
  await sql`UPDATE mechanics SET may_admin = false WHERE id = ${l2.id}`;
  const a = await perintah(l2.token, 'admin_unit', {
    kode: `${KODE}-Z`, nama: 'CONTOH Tak Boleh', section: [], global: false,
    unitFactor: 1, mtbfEligible: false, aktif: true,
  });
  periksa('tambah unit tanpa penanda admin ditolak', a.ok === false, 'justru diterima');
  const b = await perintah(l2.token, 'admin_hapus_unit', { unitId });
  periksa('hapus unit tanpa penanda admin ditolak', b.ok === false, 'justru diterima');
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

// ── Bersihkan jejak uji ─────────────────────────────────────────────────────
await sql`DELETE FROM work_orders WHERE id = ANY(${woDibuat}::bigint[])`;
await sql`DELETE FROM jobs WHERE job_code LIKE ${`UJI-J${CAP}%`}`;
await sql`DELETE FROM units WHERE unit_code LIKE ${`${KODE}%`}`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
const sisaUnit = (await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM units WHERE unit_code LIKE ${`${KODE}%`}`)[0]!.n;
periksa('unit uji dibersihkan', sisaUnit === 0, `${sisaUnit} tersisa`);

await sql`UPDATE mechanics SET may_admin = ${adminSemula} WHERE id = ${l2.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
