import './muat-env.js';

/**
 * Uji asap Edit Override lewat HTTP sungguhan.
 *
 * Yang dibuktikan di sini adalah perilaku yang kalau salah akan mengubah gaji
 * orang diam-diam:
 *   - WO yang sudah approved TIDAK bisa dikoreksi lagi
 *   - level diambil dari identitas, bukan dari muatan
 *   - hanya yang berubah yang tertulis
 *   - jam transfer (partial_hours) tidak tersentuh picker
 *   - judgment kosong menghapus, bukan diabaikan
 *   - nilai efektif ikut berubah, jadi poin yang dihitung ikut berubah
 */
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis override. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

/**
 * Token sekali pakai untuk uji ini.
 *
 * Id barisnya DICATAT supaya pembersihan di akhir hanya menghapus yang dibuat
 * di sini. Percobaan pertama menghapus menurut waktu ("dibuat < 1 jam lalu")
 * dan ikut mencabut token L1/L2 yang Gabriel pakai untuk masuk — token yang
 * bukan miliknya. Pembersihan yang menebak sasaran bukan pembersihan.
 */
const tokenDibuat: string[] = [];
async function tokenUntuk(peran: string): Promise<{ token: string; id: number }> {
  const m = (
    await sql<{ id: number; tenant_id: number }[]>`
      SELECT id, tenant_id FROM mechanics
       WHERE role = ${peran} AND is_active ORDER BY id LIMIT 1
    `
  )[0]!;
  const t = buatToken();
  await sql`UPDATE api_tokens SET is_active = false, revoked_at = now()
             WHERE mechanic_id = ${m.id} AND is_active AND revoked_at IS NULL`;
  await sql`
    INSERT INTO api_tokens (tenant_id, mechanic_id, token)
    VALUES (${m.tenant_id}, ${m.id}, ${t})
  `;
  // Nilai tokennya yang dicatat, bukan id barisnya. Percobaan dengan
  // id = ANY($1::bigint[]) TIDAK pernah cocok — dan gagalnya DIAM, jadi token
  // uji menumpuk tanpa ada yang tahu. Ketahuan hanya karena Gabriel melihat
  // token yang dicatatnya berganti sendiri.
  tokenDibuat.push(t);
  return { token: t, id: m.id };
}

const l2 = await tokenUntuk('superintendent');
const l1 = await tokenUntuk('supervisor');
const kepala = (t: string) => ({ 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` });

async function simpan(t: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST', headers: kepala(t),
    body: JSON.stringify({ aksi: 'save_override', op_id: crypto.randomUUID(), data }),
  });
  return r.json() as Promise<{ ok: boolean; pesan?: string; data?: { hasil: { berubah: string[] } } }>;
}
async function bekal(t: string, woId: number) {
  const r = await fetch(`${ALAMAT}/api/data?jenis=override&wo_id=${woId}`, { headers: kepala(t) });
  return r.json();
}

/** WO segar yang masih boleh dikoreksi. */
const woPending = (
  await sql<{ id: number }[]>`
    SELECT id FROM work_orders WHERE status = 'pending_superintendent' ORDER BY id LIMIT 1
  `
)[0];
const woApproved = (
  await sql<{ id: number }[]>`
    SELECT id FROM work_orders WHERE status = 'approved' ORDER BY id LIMIT 1
  `
)[0];
if (!woPending || !woApproved) {
  console.error('Butuh minimal satu WO pending_superintendent dan satu approved.');
  console.error('Jalankan: npm run db:contoh');
  process.exit(1);
}
const woId = Number(woPending.id);

console.log('\n─── 1. penjaga status ───');
{
  const j = await simpan(l2.token, { woId: Number(woApproved.id), basePoints: 99 });
  periksa('WO approved DITOLAK', j.ok === false, 'justru diterima');
  periksa('pesannya menyebut poin sudah terbit',
    /sudah terbit|tidak bisa dikoreksi/i.test(j.pesan ?? ''), j.pesan);
}

console.log('\n─── 2. hanya yang berubah yang ditulis ───');
{
  const b = (await bekal(l2.token, woId)).data;
  // Kirim ULANG nilai yang sudah berlaku. Tidak boleh ada yang tertulis.
  const j = await simpan(l2.token, {
    woId,
    basePoints: b.efektif.basePoints,
    targetHours: b.efektif.targetHours,
    workCondition: b.efektif.workCondition,
    team: b.efektif.team,
  });
  periksa('mengirim nilai yang sama tidak menulis apa pun',
    j.ok === true && (j.data?.hasil.berubah.length ?? -1) === 0,
    JSON.stringify(j.data?.hasil ?? j.pesan));
}

console.log('\n─── 3. koreksi sungguhan tercatat ───');
{
  const j = await simpan(l2.token, { woId, basePoints: 12.5, judgment: 'part telat datang' });
  periksa('dua jenis berubah',
    j.ok === true && j.data?.hasil.berubah.length === 2, JSON.stringify(j.data?.hasil ?? j.pesan));

  const b = (await bekal(l2.token, woId)).data;
  periksa('nilai efektif ikut berubah', b.efektif.basePoints === 12.5, String(b.efektif.basePoints));
  periksa('nilai ASAL tidak ikut berubah', b.asal.basePoints !== 12.5, String(b.asal.basePoints));
  periksa('riwayat terisi', b.riwayat.length >= 2, String(b.riwayat.length));
  periksa('judgment tercatat milik L2', b.judgment.sumber === 'superintendent', b.judgment.sumber);
}

console.log('\n─── 4. level diambil dari identitas ───');
{
  await simpan(l1.token, { woId, basePoints: 7 });
  const baris = await sql<{ level: string; value: unknown }[]>`
    SELECT level::text, value FROM work_order_overrides
     WHERE work_order_id = ${woId} AND kind = 'base_points' ORDER BY level
  `;
  periksa('L1 dan L2 tersimpan TERPISAH', baris.length === 2, JSON.stringify(baris));
  const b = (await bekal(l2.token, woId)).data;
  periksa('L2 tetap menang atas L1', b.efektif.basePoints === 12.5, String(b.efektif.basePoints));
}

console.log('\n─── 5. judgment kosong MENGHAPUS ───');
{
  const j = await simpan(l2.token, { woId, judgment: '' });
  periksa('kosong diterima sebagai perubahan',
    j.ok === true && j.data?.hasil.berubah.includes('judgment') === true,
    JSON.stringify(j.data?.hasil ?? j.pesan));
  const b = (await bekal(l2.token, woId)).data;
  periksa('catatan jadi kosong', b.judgment.teks === '', JSON.stringify(b.judgment));
}

console.log('\n─── 6. pagar nilai ───');
{
  const a = await simpan(l2.token, { woId, basePoints: 99_999 });
  periksa('base points di atas batas ditolak', a.ok === false, 'justru diterima');
  const c = await simpan(l2.token, { woId, workCondition: 'ngawur' });
  periksa('kondisi kerja tak dikenal ditolak', c.ok === false, 'justru diterima');
  const d = await simpan(l2.token, { woId, team: [] });
  periksa('tim kosong ditolak', d.ok === false, 'justru diterima');
  const e = await simpan(l2.token, { woId, team: [999_999] });
  periksa('anggota tim tak dikenal ditolak', e.ok === false, 'justru diterima');
  const f = await simpan(l2.token, {
    woId, waktu: { startTime: '2026-09-15T10:00:00Z', endTime: '2026-09-15T08:00:00Z' },
  });
  periksa('jam selesai sebelum mulai ditolak', f.ok === false, 'justru diterima');
}

console.log('\n─── 7. jam transfer tidak tersentuh picker ───');
{
  await sql`UPDATE work_orders SET partial_hours = 3 WHERE id = ${woId}`;
  const j = await simpan(l2.token, {
    woId, waktu: { startTime: '2026-09-15T01:00:00Z', endTime: '2026-09-15T03:00:00Z' },
  });
  periksa('waktu tersimpan', j.ok === true && j.data?.hasil.berubah.includes('time') === true,
    j.pesan);
  const w = (
    await sql<{ partial_hours: string; actual_hours: string }[]>`
      SELECT partial_hours, actual_hours FROM work_orders WHERE id = ${woId}
    `
  )[0]!;
  periksa('partial_hours TETAP 3 jam', Number(w.partial_hours) === 3, w.partial_hours);

  // Nilai efektif harus menjumlahkan sesi picker (2 jam) + partial (3 jam).
  const { nilaiEfektif } = await import('../src/domain/nilaiEfektif.js');
  const ne = await sql.begin((tx) => nilaiEfektif(tx, woId));
  periksa('actual efektif = 2 jam picker + 3 jam transfer = 5', ne.actualHours === 5,
    String(ne.actualHours));
  await sql`UPDATE work_orders SET partial_hours = 0 WHERE id = ${woId}`;
}

console.log('\n─── 8. mekanik tidak boleh mengoreksi ───');
{
  const mek = await tokenUntuk('mechanic');
  const j = await simpan(mek.token, { woId, basePoints: 1 });
  periksa('ditolak', j.ok === false, 'justru diterima');
  periksa('alasannya wewenang', /L1 dan L2|berhak/i.test(j.pesan ?? ''), j.pesan);
}

// Bersihkan jejak uji supaya layar tidak menampilkan koreksi palsu.
await sql`DELETE FROM work_order_overrides WHERE work_order_id = ${woId}`;
/* Pembersihan yang gagal diam-diam adalah pembersihan yang tidak ada. Jumlah
   baris terhapus DIPERIKSA; kalau tak sama dengan yang dibuat, uji ini gagal
   walau seluruh pemeriksaan lain lulus. */
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan seluruhnya',
  terhapus.length === tokenDibuat.length,
  `dibuat ${tokenDibuat.length}, terhapus ${terhapus.length}`);
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
