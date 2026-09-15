import './muat-env.js';

/**
 * Alur penuh: override → approve → ke mana WO-nya pergi.
 *
 * Dibuat setelah Gabriel melapor "setelah override dan save lalu approve, WO
 * itu hilang tidak ada". Yang diperiksa bukan satu fungsi melainkan
 * SAMBUNGANNYA: apakah koreksi benar-benar dipakai menghitung uang, dan apakah
 * WO-nya muncul di tab yang benar sesudahnya.
 */
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

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
  await sql`INSERT INTO api_tokens (tenant_id, mechanic_id, token)
            VALUES (${m.tenant_id}, ${m.id}, ${t})`;
  tokenDibuat.push(t);
  return t;
}

const l2 = await tokenUntuk('superintendent');
const kepala = { 'Content-Type': 'application/json', Cookie: `kmb_token=${l2}` };

async function perintah(aksi: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST', headers: kepala,
    body: JSON.stringify({ aksi, op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{ ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> } }>;
}

const wo = (
  await sql<{ id: number; wo_number: string }[]>`
    SELECT id, wo_number FROM work_orders
     WHERE status = 'pending_superintendent' ORDER BY id LIMIT 1
  `
)[0];
if (!wo) { console.error('Butuh satu WO pending_superintendent. Jalankan: npm run db:contoh'); process.exit(1); }
const woId = Number(wo.id);

// Mekanik pengganti yang BELUM ada di tim, supaya perubahan timnya terbukti.
const penggantiRow = (
  await sql<{ id: number; name: string }[]>`
    SELECT m.id, m.name FROM mechanics m
     WHERE m.role = 'mechanic' AND m.is_active AND m.is_test_account = false
       AND NOT EXISTS (SELECT 1 FROM work_order_team t
                        WHERE t.work_order_id = ${woId} AND t.mechanic_id = m.id)
     ORDER BY m.id LIMIT 1
  `
)[0]!;
const pengganti = Number(penggantiRow.id);

console.log(`\nWO uji: ${wo.wo_number}\n`);
console.log('─── 1. override base points + tim ───');
{
  const j = await perintah('save_override', {
    woId, basePoints: 30, team: [pengganti],
  });
  periksa('tersimpan', j.ok === true, j.pesan);
  periksa('dua jenis berubah',
    (j.data?.hasil['berubah'] as string[] | undefined)?.length === 2,
    JSON.stringify(j.data?.hasil));
}

console.log('\n─── 2. WO MASIH menunggu, bukan hilang ───');
{
  const s = (await sql<{ status: string }[]>`SELECT status::text FROM work_orders WHERE id = ${woId}`)[0]!;
  periksa('status tetap pending_superintendent', s.status === 'pending_superintendent', s.status);

  const kartu = await (await fetch(`${ALAMAT}/api/data?jenis=antrean`, { headers: kepala })).json();
  const ada = (kartu.data ?? []).some((k: { id: number }) => Number(k.id) === woId);
  periksa('masih muncul di antrean approval', ada === true, 'lenyap dari antrean');
}

console.log('\n─── 3. approve L2 memakai nilai yang DIKOREKSI ───');
{
  const j = await perintah('approve_l2', { woId });
  periksa('approve berhasil', j.ok === true, j.pesan);

  const poin = Number(j.data?.hasil['finalPoints'] ?? 0);
  // base 30 × unit × kondisi × ketepatan × safety × mtbf. Yang dibuktikan di
  // sini bukan angka pastinya melainkan bahwa 30 yang dipakai, bukan base asli.
  periksa('poin dihitung dari base 30 hasil koreksi, bukan katalog',
    poin >= 30 * 0.5 && poin <= 30 * 3, `finalPoints=${poin}`);

  const dibayar = (j.data?.hasil['dibayar'] as { mechanicId: number }[] | undefined) ?? [];
  periksa('dibayar ke tim hasil koreksi, satu orang',
    dibayar.length === 1 && Number(dibayar[0]!.mechanicId) === pengganti,
    JSON.stringify(dibayar));
}

console.log('\n─── 4. sesudah approve, WO ADA di tab Approved ───');
{
  const s = (await sql<{ status: string }[]>`SELECT status::text FROM work_orders WHERE id = ${woId}`)[0]!;
  periksa('status jadi approved', s.status === 'approved', s.status);

  const antrean = await (await fetch(`${ALAMAT}/api/data?jenis=antrean`, { headers: kepala })).json();
  const masihAntre = (antrean.data ?? []).some((k: { id: number }) => Number(k.id) === woId);
  periksa('sudah TIDAK di antrean (memang pindah tab)', masihAntre === false);

  const { kartuApproval } = await import('../src/domain/kueriApproval.js');
  const { identitasDariToken } = await import('../src/lib/auth.js');
  const aku = await identitasDariToken(l2);
  const approved = await kartuApproval(aku, 'approved', 100);
  periksa('MUNCUL di tab Approved',
    approved.some((k) => Number(k.id) === woId),
    `tab approved berisi ${approved.length} kartu, WO ${woId} tidak ada`);
}

console.log('\n─── 5. poin & rupiah benar-benar terbit ───');
{
  const p = await sql<{ mechanic_id: number; points: string; idr_value: string }[]>`
    SELECT mechanic_id, points, idr_value FROM mechanic_points WHERE work_order_id = ${woId}
  `;
  periksa('satu baris poin, milik mekanik pengganti',
    p.length === 1 && Number(p[0]!.mechanic_id) === pengganti, JSON.stringify(p));
  periksa('rupiah ikut terbit', Number(p[0]?.idr_value ?? 0) > 0, JSON.stringify(p));

  const snap = await sql<{ base_points: string }[]>`
    SELECT base_points FROM scoring_snapshots WHERE work_order_id = ${woId}
  `;
  periksa('snapshot membekukan base 30 hasil koreksi',
    Number(snap[0]?.base_points ?? 0) === 30, JSON.stringify(snap));
}

console.log('\n─── 6. WO approved tidak bisa dikoreksi lagi ───');
{
  const j = await perintah('save_override', { woId, basePoints: 1 });
  periksa('ditolak', j.ok === false, 'justru diterima');
}

const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
