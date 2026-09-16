import './muat-env.js';

/**
 * TOKEN — kapan ia berubah, dan kapan ia TIDAK boleh berubah.
 *
 * Berkas ini lahir dari pertanyaan Gabriel, 16 Sep 2026: "kenapa token ini
 * terus berganti, dan apakah itu akan terjadi saat sudah jalan dengan ribuan
 * WO?" Token yang berubah sendiri adalah gangguan operasional yang nyata —
 * mekanik di lapangan tiba-tiba tidak bisa masuk, dan tak seorang pun tahu
 * kenapa.
 *
 * Yang dikunci di sini:
 *
 *   1. Token TIDAK punya umur. Tak ada satu pun kode yang mengisi `expires_at`,
 *      jadi ia tidak pernah kedaluwarsa sendiri.
 *   2. Menekan "Terbitkan token" pada orang yang SUDAH punya token akan
 *      mengembalikan token yang SAMA — bukan menerbitkan yang baru.
 *   3. Yang ditampilkan layar Admin WAJIB token yang benar-benar bisa dipakai
 *      masuk. Inilah yang dulu salah: kueri tanpa saringan mengembalikan token
 *      yang sudah dicabut, dan dari lapangan itu terbaca persis seperti token
 *      yang berubah sendiri.
 *   4. Mengganti token MENCABUT yang lama, bukan menghapus barisnya — riwayat
 *      "siapa memegang apa sampai kapan" harus tetap bisa dibaca.
 *   5. Basis data menolak dua token berlaku untuk satu orang.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken, identitasDariToken } = await import('../src/lib/auth.js');
const { bekalAdmin } = await import('../src/domain/admin.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

const l2 = (await sql<{ id: number; tenant_id: number; name: string }[]>`
  SELECT id, tenant_id, name FROM mechanics
   WHERE role = 'superintendent' AND is_active ORDER BY id LIMIT 1`)[0]!;
const TENANT = Number(l2.tenant_id);
const adminSemula = (await sql<{ may_admin: boolean }[]>`
  SELECT may_admin FROM mechanics WHERE id = ${l2.id}`)[0]!.may_admin;
await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;

const tokAdmin = buatToken();
await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
           WHERE mechanic_id = ${l2.id} AND is_active AND revoked_at IS NULL`;
await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
          VALUES (${TENANT}, ${l2.id}, ${tokAdmin})`;

async function perintah(aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${tokAdmin}` },
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

const CAP = Date.now().toString().slice(-6);
let orangId = 0;

console.log('\n─── 1. token tidak punya umur ───');
{
  const n = (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM api_tokens WHERE expires_at IS NOT NULL`)[0]!.n;
  /* Kalau suatu hari ada kode yang mulai mengisi expires_at, mekanik akan
     terkunci di tengah shift tanpa ada yang mengubah apa pun. */
  periksa('tak satu pun token punya tanggal kedaluwarsa', n === 0, `${n} token`);
}

console.log('\n─── 2. terbitkan token dua kali = token yang SAMA ───');
{
  const tarif = (await sql<{ id: number }[]>`
    SELECT id FROM pay_rates WHERE tenant_id=${TENANT} ORDER BY id LIMIT 1`)[0]!;
  const a = await perintah('admin_orang', {
    kode: `UJI-TOK${CAP}`, nama: 'CONTOH Orang Token', peran: 'mechanic',
    payRateId: Number(tarif.id), aktif: true, akunUji: true,
    bolehPerforma: false, bolehTeknis: false, bolehReport: false, bolehAdmin: false,
  });
  orangId = Number(a.data?.hasil['id']);

  const t1 = await perintah('admin_token', { mechanicId: orangId });
  const token1 = String(t1.data?.hasil['token']);
  periksa('token pertama terbit', t1.ok === true, t1.pesan);

  const t2 = await perintah('admin_token', { mechanicId: orangId });
  periksa('ditekan lagi mengembalikan token yang SAMA',
    String(t2.data?.hasil['token']) === token1,
    `${token1} vs ${t2.data?.hasil['token']}`);
  periksa('dan tidak mengaku mengganti', t2.data?.hasil['menggantiLama'] === false);

  const aku = await identitasDariToken(token1);
  periksa('token itu benar-benar bisa dipakai masuk', aku.mechanicId === orangId);
}

console.log('\n─── 3. layar Admin menampilkan token yang BENAR-BENAR berlaku ───');
{
  /* Ini akar keluhannya. Dulu kueri layar Admin tidak menyaring is_active,
     jadi ia bisa menampilkan token yang sudah dicabut — L1 membacakannya,
     mekanik memasukkannya, dan ditolak. Dari lapangan itu terbaca sebagai
     token yang berubah sendiri. */
  const t = await perintah('admin_token', { mechanicId: orangId, ganti: true });
  const tokenBaru = String(t.data?.hasil['token']);
  periksa('token diganti', t.ok === true && t.data?.hasil['menggantiLama'] === true);

  const b = await bekalAdmin(TENANT);
  const o = b.orang.find((x) => x.id === orangId)!;
  periksa('layar Admin menampilkan token yang BARU', o.token === tokenBaru,
    `layar: ${o.token}  ·  sebenarnya: ${tokenBaru}`);

  const aku = await identitasDariToken(o.token!);
  periksa('dan token yang ditampilkan itu bisa dipakai masuk',
    aku.mechanicId === orangId);

  // Seluruh orang, bukan cuma yang baru dibuat.
  let cocok = 0, tidak = 0;
  for (const p of b.orang) {
    if (!p.token) continue;
    try { await identitasDariToken(p.token); cocok++; } catch { tidak++; }
  }
  periksa('SETIAP token yang tampil di layar Admin bisa dipakai masuk',
    tidak === 0, `${tidak} dari ${cocok + tidak} tidak berlaku`);
}

console.log('\n─── 4. mengganti token MENCABUT, bukan menghapus riwayatnya ───');
{
  const semua = await sql<{ token: string; is_active: boolean; revoked_at: Date | null }[]>`
    SELECT token, is_active, revoked_at FROM api_tokens
     WHERE mechanic_id = ${orangId} ORDER BY created_at`;
  periksa('barisnya masih ada dua — yang lama TIDAK dihapus',
    semua.length === 2, `${semua.length} baris`);
  periksa('yang lama ditandai dicabut, lengkap dengan waktunya',
    semua[0]!.is_active === false && semua[0]!.revoked_at !== null,
    JSON.stringify(semua[0]));
  periksa('hanya satu yang berlaku',
    semua.filter((s) => s.is_active && !s.revoked_at).length === 1);

  let ditolak = false;
  try { await identitasDariToken(semua[0]!.token); } catch { ditolak = true; }
  periksa('token lama benar-benar tidak bisa dipakai lagi', ditolak);
}

console.log('\n─── 5. basis data menolak dua token berlaku untuk satu orang ───');
{
  let gagalSesuaiHarapan = false;
  try {
    await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
              VALUES (${TENANT}, ${orangId}, ${buatToken()})`;
  } catch { gagalSesuaiHarapan = true; }
  /* Tanpa index ini, satu orang bisa punya banyak token berlaku sekaligus —
     dan "token mana yang benar" tidak punya jawaban. */
  periksa('penyisipan token kedua DITOLAK basis data', gagalSesuaiHarapan,
    'justru diterima');
}

console.log('\n─── 6. cabut token juga meninggalkan jejaknya ───');
{
  const a = await perintah('admin_token_cabut', { mechanicId: orangId });
  periksa('pencabutan lolos', a.ok === true, a.pesan);
  periksa('dilaporkan berapa yang dicabut', Number(a.data?.hasil['dicabut']) === 1,
    String(a.data?.hasil['dicabut']));

  const sisa = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM api_tokens WHERE mechanic_id = ${orangId}`;
  periksa('barisnya tetap ada sebagai riwayat', sisa[0]!.n === 2, `${sisa[0]!.n}`);
  const berlaku = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM api_tokens
     WHERE mechanic_id = ${orangId} AND is_active AND revoked_at IS NULL`;
  periksa('dan tidak ada lagi yang berlaku', berlaku[0]!.n === 0);

  const b = await bekalAdmin(TENANT);
  periksa('layar Admin menampilkannya sebagai belum punya token',
    b.orang.find((x) => x.id === orangId)?.token === null);
}

// ── Bersihkan ───────────────────────────────────────────────────────────────
await sql`DELETE FROM api_tokens WHERE mechanic_id = ${orangId}`;
await sql`DELETE FROM mechanic_sections WHERE mechanic_id = ${orangId}`;
await sql`DELETE FROM audit_logs WHERE entity_id = ${String(orangId)} AND entity_type = 'mechanic'`;
await sql`DELETE FROM mechanics WHERE id = ${orangId}`;
await sql`UPDATE api_tokens SET is_active = false, revoked_at = now() WHERE token = ${tokAdmin}`;
await sql`UPDATE mechanics SET may_admin = ${adminSemula} WHERE id = ${l2.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
