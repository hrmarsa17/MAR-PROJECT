import './muat-env.js';

/**
 * MENU ADMIN.
 *
 * Tiga hal yang dijaga di sini, dan ketiganya pernah jadi kecelakaan nyata di
 * sistem lain:
 *
 *   1. Mengubah base point / tarif TIDAK boleh menggeser WO yang sudah
 *      disetujui. Di KMB V2 tarif dibaca ulang saat laporan disusun, dan itu
 *      menggeser gaji yang sudah dibayar sebesar -Rp 17,6 juta (9 Sep 2026).
 *   2. Orang TIDAK bisa dihapus, hanya dinonaktifkan.
 *   3. Admin tidak bisa mengunci dirinya sendiri di luar.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { bekalAdmin } = await import('../src/domain/admin.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const tokenDibuat: string[] = [];
async function tokenUntuk(id: number, tenant: number) {
  const t = buatToken();
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${id} AND is_active AND revoked_at IS NULL`;
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token) VALUES (${tenant}, ${id}, ${t})`;
  tokenDibuat.push(t);
  return t;
}

const l2 = (
  await sql<{ id: number; tenant_id: number }[]>`
    SELECT id, tenant_id FROM mechanics WHERE role='superintendent' AND is_active
     ORDER BY id LIMIT 1
  `
)[0]!;
const bukanAdmin = (
  await sql<{ id: number }[]>`
    SELECT id FROM mechanics WHERE role='supervisor' AND is_active ORDER BY id LIMIT 1
  `
)[0]!;
const TENANT = Number(l2.tenant_id);

await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
await sql`UPDATE mechanics SET may_admin = false WHERE id = ${bukanAdmin.id}`;
const tokAdmin = await tokenUntuk(Number(l2.id), TENANT);
const tokBukan = await tokenUntuk(Number(bukanAdmin.id), TENANT);

async function perintah(t: string, aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` },
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

const orangBaru: number[] = [];

console.log('\n─── 1. gerbangnya penanda, BUKAN peran ───');
{
  const tarif = (await sql<{ id: number }[]>`
    SELECT id FROM pay_rates WHERE tenant_id=${TENANT} LIMIT 1`)[0]!;

  const a = await perintah(tokBukan, 'admin_orang', {
    kode: 'UJI-X1', nama: 'Coba Coba', peran: 'mechanic', payRateId: Number(tarif.id),
    aktif: true, akunUji: false, bolehPerforma: false, bolehTeknis: false,
    bolehReport: false, bolehAdmin: false,
  });
  periksa('L1 tanpa penanda ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menyebut hak admin', /hak admin/i.test(a.pesan ?? ''), a.pesan);

  // L2 pun ditolak kalau penandanya mati — peran tidak membawa hak admin.
  await sql`UPDATE mechanics SET may_admin = false WHERE id = ${l2.id}`;
  const b = await perintah(tokAdmin, 'admin_orang', {
    kode: 'UJI-X1', nama: 'Coba Coba', peran: 'mechanic', payRateId: Number(tarif.id),
    aktif: true, akunUji: false, bolehPerforma: false, bolehTeknis: false,
    bolehReport: false, bolehAdmin: false,
  });
  periksa('L2 dengan penanda MATI juga ditolak', b.ok === false, 'justru diterima');
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

console.log('\n─── 2. tambah orang, lalu terbitkan tokennya ───');
let orangId = 0;
{
  const tarif = (await sql<{ id: number }[]>`
    SELECT id FROM pay_rates WHERE tenant_id=${TENANT} LIMIT 1`)[0]!;
  const kode = 'UJI-ADM-' + Date.now().toString().slice(-6);

  const a = await perintah(tokAdmin, 'admin_orang', {
    kode, nama: 'CONTOH Orang Baru', peran: 'mechanic', payRateId: Number(tarif.id),
    section: ['field'], aktif: true, akunUji: true, bolehPerforma: false,
    bolehTeknis: false, bolehReport: false, bolehAdmin: false,
  });
  periksa('orang baru tersimpan', a.ok === true, a.pesan);
  periksa('ditandai sebagai baru', a.data?.hasil['baru'] === true);
  orangId = Number(a.data?.hasil['id']);
  orangBaru.push(orangId);

  const sec = await sql`SELECT 1 FROM mechanic_sections WHERE mechanic_id = ${orangId}`;
  periksa('section ikut tersimpan', sec.length === 1, `${sec.length} baris`);

  const t1 = await perintah(tokAdmin, 'admin_token', { mechanicId: orangId });
  periksa('token terbit', t1.ok === true, t1.pesan);
  const token1 = String(t1.data?.hasil['token']);
  periksa('tokennya terbaca utuh, bukan hash', token1.length === 20, token1);

  // Minta lagi TANPA ganti → harus mengembalikan yang SAMA. Menerbitkan token
  // kedua diam-diam membuat mekanik yang sudah menghafal tokennya ditolak.
  const t2 = await perintah(tokAdmin, 'admin_token', { mechanicId: orangId });
  periksa('minta lagi mengembalikan token yang SAMA',
    String(t2.data?.hasil['token']) === token1);
  periksa('dan tidak mengaku mengganti', t2.data?.hasil['menggantiLama'] === false);

  const t3 = await perintah(tokAdmin, 'admin_token', { mechanicId: orangId, ganti: true });
  periksa('ganti token menghasilkan yang BERBEDA',
    String(t3.data?.hasil['token']) !== token1);
  /* Sampai 16 Sep 2026 baris ini menuntut TEPAT SATU baris — karena mengganti
     token dulu MENGHAPUS yang lama. Itu membuat tabelnya rapi, dan sekaligus
     menghapus satu-satunya catatan siapa memegang token apa sampai kapan —
     justru catatan yang dibutuhkan saat ada yang bertanya "kenapa token saya
     berhenti bekerja". Yang dijaga sekarang: satu yang BERLAKU, sisanya
     tersimpan sebagai riwayat. */
  const berlaku = await sql`
    SELECT 1 FROM api_tokens
     WHERE mechanic_id = ${orangId} AND is_active AND revoked_at IS NULL`;
  periksa('hanya SATU token yang berlaku', berlaku.length === 1, `${berlaku.length}`);
  const riwayat = await sql`
    SELECT 1 FROM api_tokens
     WHERE mechanic_id = ${orangId} AND revoked_at IS NOT NULL`;
  periksa('token lamanya dicabut dan DISIMPAN sebagai riwayat, bukan dihapus',
    riwayat.length >= 1, `${riwayat.length} baris tercabut`);

  const audit = await sql<{ details: Record<string, unknown> }[]>`
    SELECT details FROM audit_logs
     WHERE entity_type='mechanic' AND entity_id=${String(orangId)}
       AND action LIKE 'admin_token%'
  `;
  // Token adalah kunci masuk. Menyalinnya ke tabel yang dibaca lebih banyak
  // orang memperluas siapa yang bisa masuk atas nama orang itu.
  periksa('TOKENNYA TIDAK ikut tercatat di audit log',
    audit.every((a2) => !JSON.stringify(a2.details).includes(token1)),
    JSON.stringify(audit.map((a2) => a2.details)));
}

console.log('\n─── 3. nonaktifkan, bukan hapus ───');
{
  const a = await perintah(tokAdmin, 'admin_orang', {
    id: orangId, kode: 'UJI-ADM-N', nama: 'CONTOH Orang Baru', peran: 'mechanic',
    payRateId: (await sql<{ id: number }[]>`
      SELECT id FROM pay_rates WHERE tenant_id=${TENANT} LIMIT 1`)[0]!.id,
    aktif: false, akunUji: true, bolehPerforma: false, bolehTeknis: false,
    bolehReport: false, bolehAdmin: false,
  });
  periksa('nonaktif tersimpan', a.ok === true, a.pesan);

  const w = (await sql<{ is_active: boolean }[]>`
    SELECT is_active FROM mechanics WHERE id = ${orangId}`)[0]!;
  periksa('orangnya masih ADA, hanya nonaktif', w.is_active === false);

  const b = await perintah(tokAdmin, 'admin_token', { mechanicId: orangId });
  periksa('orang nonaktif tidak bisa diberi token', b.ok === false, 'justru diterima');
  periksa('alasannya menyuruh mengaktifkan dulu',
    /aktifkan dulu/i.test(b.pesan ?? ''), b.pesan);
}

console.log('\n─── 4. admin tidak bisa mengunci dirinya sendiri di luar ───');
{
  const dasar = {
    id: Number(l2.id), kode: 'UJI-L2-ADM', nama: 'Manager Uji',
    peran: 'superintendent' as const,
    payRateId: (await sql<{ id: number }[]>`
      SELECT id FROM pay_rates WHERE tenant_id=${TENANT} LIMIT 1`)[0]!.id,
    akunUji: false, bolehPerforma: true, bolehTeknis: true, bolehReport: true,
  };
  const a = await perintah(tokAdmin, 'admin_orang',
    { ...dasar, aktif: true, bolehAdmin: false });
  periksa('mencabut hak admin sendiri ditolak', a.ok === false, 'justru diterima');

  const b = await perintah(tokAdmin, 'admin_orang',
    { ...dasar, aktif: false, bolehAdmin: true });
  periksa('menonaktifkan akun sendiri ditolak', b.ok === false, 'justru diterima');

  const c = await perintah(tokAdmin, 'admin_token_cabut', { mechanicId: Number(l2.id) });
  periksa('mencabut token sendiri ditolak', c.ok === false, 'justru diterima');
  periksa('alasannya menyebut terkunci di luar',
    /terkunci di luar/i.test(c.pesan ?? ''), c.pesan);
}

console.log('\n─── 5. ubah base point TIDAK menggeser WO yang sudah disetujui ───');
{
  const sebelum = (
    await sql<{ n: string }[]>`
      SELECT coalesce(sum(idr_value), 0)::text AS n FROM mechanic_points
    `
  )[0]!.n;

  const job = (await sql<{ id: number; base_points: string }[]>`
    SELECT id, base_points FROM jobs WHERE tenant_id=${TENANT} AND is_active ORDER BY id LIMIT 1
  `)[0]!;
  const a = await perintah(tokAdmin, 'admin_job', {
    jobId: Number(job.id), basePoints: Number(job.base_points) * 3,
    planHours: 9, aktif: true,
  });
  periksa('base point tersimpan', a.ok === true, a.pesan);
  periksa('nilai lamanya ikut dilaporkan',
    Number((a.data?.hasil['lama'] as { basePoints: number }).basePoints)
      === Number(job.base_points));

  const sesudah = (
    await sql<{ n: string }[]>`
      SELECT coalesce(sum(idr_value), 0)::text AS n FROM mechanic_points
    `
  )[0]!.n;
  periksa('TOTAL RUPIAH yang sudah terbit tidak bergerak satu pun',
    sebelum === sesudah, `${sebelum} → ${sesudah}`);

  await sql`UPDATE jobs SET base_points = ${job.base_points} WHERE id = ${job.id}`;
}

console.log('\n─── 6. ubah tarif juga tidak menggeser poin yang sudah terbit ───');
{
  const sebelum = (
    await sql<{ n: string }[]>`SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points`
  )[0]!.n;

  const tarif = (await sql<{ id: number; idr_per_point: string }[]>`
    SELECT id, idr_per_point FROM pay_rates WHERE tenant_id=${TENANT} ORDER BY id LIMIT 1`)[0]!;
  const a = await perintah(tokAdmin, 'admin_tarif', {
    id: Number(tarif.id), idrPerPoint: Number(tarif.idr_per_point) * 2, aktif: true,
  });
  periksa('tarif tersimpan', a.ok === true, a.pesan);

  const sesudah = (
    await sql<{ n: string }[]>`SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points`
  )[0]!.n;
  periksa('rupiah yang sudah terbit TETAP', sebelum === sesudah, `${sebelum} → ${sesudah}`);

  await sql`UPDATE pay_rates SET idr_per_point = ${tarif.idr_per_point} WHERE id = ${tarif.id}`;
}

console.log('\n─── 7. faktor & setelan ───');
{
  const f = (await sql<{ id: number; factor_value: string }[]>`
    SELECT id, factor_value FROM factors WHERE tenant_id=${TENANT} ORDER BY id LIMIT 1`)[0]!;
  const a = await perintah(tokAdmin, 'admin_faktor',
    { id: Number(f.id), nilai: Number(f.factor_value) + 0.1 });
  periksa('faktor tersimpan', a.ok === true, a.pesan);
  await sql`UPDATE factors SET factor_value = ${f.factor_value} WHERE id = ${f.id}`;

  const b = await perintah(tokAdmin, 'admin_faktor', { id: Number(f.id), nilai: -1 });
  periksa('faktor negatif ditolak', b.ok === false, 'justru diterima');

  const s = (await sql<{ setting_key: string; setting_value: string }[]>`
    SELECT setting_key::text, setting_value FROM settings
     WHERE tenant_id=${TENANT} AND setting_key='shift1_mulai'`)[0]!;
  const c = await perintah(tokAdmin, 'admin_setelan',
    { kunci: 'shift1_mulai', nilai: '07' });
  periksa('setelan tersimpan', c.ok === true, c.pesan);
  await sql`UPDATE settings SET setting_value = ${s.setting_value}
             WHERE tenant_id=${TENANT} AND setting_key='shift1_mulai'`;

  const d = await perintah(tokAdmin, 'admin_setelan',
    { kunci: 'kunci_yang_tidak_ada', nilai: 'x' });
  periksa('setelan yang tidak ada tidak bisa dibuat dari sini', d.ok === false,
    'justru diterima');
}

console.log('\n─── 8. bacaan admin membawa jejak, bukan cuma daftar ───');
{
  const b = await bekalAdmin(TENANT);
  periksa('daftar orang terisi', b.orang.length > 0);
  periksa('membawa berapa WO tiap orang — dasar kenapa tak boleh dihapus',
    b.orang.every((o) => typeof o.jejak === 'number'));
  periksa('tarif, faktor, setelan, section, job ikut',
    b.tarif.length > 0 && b.faktor.length > 0 && b.setelan.length > 0
      && b.section.length > 0);
  const adm = b.orang.find((o) => o.id === Number(l2.id));
  periksa('penanda admin terbaca di daftar', adm?.bolehAdmin === true);
}

// Bersihkan jejak uji.
await sql`DELETE FROM api_tokens WHERE mechanic_id = ANY(${orangBaru}::int[])`;
await sql`DELETE FROM mechanic_sections WHERE mechanic_id = ANY(${orangBaru}::int[])`;
await sql`DELETE FROM mechanics WHERE id = ANY(${orangBaru}::int[])`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
