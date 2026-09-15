import './muat-env.js';

/**
 * Uji asap jalur buat-WO lewat HTTP sungguhan.
 *
 * Yang dibuktikan di sini BUKAN "halamannya terbuka" melainkan perilaku yang
 * kalau salah akan membayar orang dua kali:
 *   - grup menolak baris kembar
 *   - op_id yang sama tidak pernah melahirkan WO kedua
 *   - status kiriman bisa ditanyakan sesudah sambungan putus
 *
 * Menulis ke basis data PENGEMBANGAN. Menolak jalan di tempat lain.
 */
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis WO. DATABASE_URL harus port 5433.');
  process.exit(1);
}

const { sql } = await import('../src/lib/db.js');
const { buatToken, hashToken, petunjukToken } = await import('../src/lib/auth.js');

// Token sekali pakai untuk uji ini, dicabut di akhir.
const l2 = (
  await sql<{ id: number; tenant_id: number }[]>`
    SELECT id, tenant_id FROM mechanics WHERE role = 'superintendent' AND is_active LIMIT 1
  `
)[0];
if (!l2) { console.error('Tidak ada akun L2 di basis data dev.'); process.exit(1); }

const token = buatToken();
const tokenBaris = (
  await sql<{ id: number }[]>`
    INSERT INTO api_tokens (tenant_id, mechanic_id, token_hash, token_hint)
    VALUES (${l2.tenant_id}, ${l2.id}, ${hashToken(token)}, ${petunjukToken(token)})
    RETURNING id
  `
)[0]!;

const kepala = { 'Content-Type': 'application/json', Cookie: `kmb_token=${token}` };

let lulus = 0;
let gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

async function perintah(opId: string, data: unknown) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST', headers: kepala,
    body: JSON.stringify({ aksi: 'buat_wo', op_id: opId, data }),
  });
  return r.json() as Promise<{ ok: boolean; pesan?: string; data?: { hasil: { dibuat: { woNumber: string }[] }; diulang: boolean } }>;
}

// Ambil dua job berbeda pada SATU model, dan dua unit pada model itu.
const kat = await (await fetch(`${ALAMAT}/api/data?jenis=katalog`, { headers: kepala })).json();
type J = { id: number; section: string; unit_model: string | null; job_description: string };
type U = { id: number; unit_model: string | null; section: string | null };
const jobs: J[] = kat.data.jobs;
const units: U[] = kat.data.units;
const model = 'contoh-hauler';
const jobHauler = jobs.filter((j) => j.unit_model === model);
const unitHauler = units.filter((u) => u.unit_model === model);
const jobDozer = jobs.find(
  (j) => j.unit_model === 'contoh-dozer' && j.job_description.includes('Cylinder Head'),
);
const unitDozer = units.find((u) => u.unit_model === 'contoh-dozer');

if (jobHauler.length < 2 || unitHauler.length < 2 || !jobDozer || !unitDozer) {
  console.error('Katalog contoh belum lengkap. Jalankan scripts/isi-katalog-contoh.ts');
  process.exit(1);
}
const tim = [
  (await sql<{ id: number }[]>`SELECT id FROM mechanics WHERE role='mechanic' LIMIT 1`)[0]!.id,
];

const blokDasar = (jobId: number, unitId: number) => ({
  jobId, unitId, workCondition: 'normal', location: 'field', teamMechanicIds: tim,
});

console.log('\n─── 1. WO tunggal ───');
{
  const op = crypto.randomUUID();
  const j = await perintah(op, { sectionCode: 'field', blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id)] });
  periksa('satu WO terbit', j.ok === true && j.data?.hasil.dibuat.length === 1, j.pesan);

  console.log('\n─── 2. op_id yang SAMA dikirim ulang ───');
  const ulang = await perintah(op, { sectionCode: 'field', blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id)] });
  periksa('ditandai diulang', ulang.data?.diulang === true);
  periksa('nomor WO sama, bukan WO baru',
    ulang.data?.hasil.dibuat[0]?.woNumber === j.data?.hasil.dibuat[0]?.woNumber);

  console.log('\n─── 3. status kiriman bisa ditanyakan ───');
  const s = await (await fetch(`${ALAMAT}/api/data?jenis=kiriman&op_id=${op}`, { headers: kepala })).json();
  periksa('keadaan = selesai', s.ok === true && s.data.keadaan === 'selesai', JSON.stringify(s).slice(0, 90));
  periksa('membawa nomor WO-nya', (s.data?.wo ?? []).length === 1);
}

console.log('\n─── 4. op_id yang belum pernah ada ───');
{
  const s = await (await fetch(`${ALAMAT}/api/data?jenis=kiriman&op_id=${crypto.randomUUID()}`, { headers: kepala })).json();
  periksa('keadaan = tidak_ada (aman dibuat ulang)', s.data?.keadaan === 'tidak_ada');
}

console.log('\n─── 5. grup unit: 1 unit · 2 job berbeda ───');
{
  const j = await perintah(crypto.randomUUID(), {
    sectionCode: 'field',
    grup: { mode: 'unit' },
    blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id),
           blokDasar(jobHauler[1]!.id, unitHauler[0]!.id)],
  });
  periksa('dua WO terbit', j.ok === true && j.data?.hasil.dibuat.length === 2, j.pesan);
}

console.log('\n─── 6. grup unit: job KEMBAR harus ditolak ───');
{
  const j = await perintah(crypto.randomUUID(), {
    sectionCode: 'field',
    grup: { mode: 'unit' },
    blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id),
           blokDasar(jobHauler[0]!.id, unitHauler[0]!.id)],
  });
  periksa('ditolak', j.ok === false, 'justru diterima');
  periksa('pesannya menyebut joblist mana', /joblist #2/i.test(j.pesan ?? ''), j.pesan);
}

console.log('\n─── 7. grup job: 1 job · 2 unit berbeda ───');
{
  const j = await perintah(crypto.randomUUID(), {
    sectionCode: 'field',
    grup: { mode: 'job' },
    blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id),
           blokDasar(jobDozer.id, unitDozer.id)],
  });
  periksa('dua WO terbit', j.ok === true && j.data?.hasil.dibuat.length === 2, j.pesan);
}

console.log('\n─── 8. grup job: unit KEMBAR harus ditolak ───');
{
  const j = await perintah(crypto.randomUUID(), {
    sectionCode: 'field',
    grup: { mode: 'job' },
    blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id),
           blokDasar(jobHauler[1]!.id, unitHauler[0]!.id)],
  });
  periksa('ditolak', j.ok === false, 'justru diterima');
}

console.log('\n─── 9. grup dengan 1 baris harus ditolak ───');
{
  const j = await perintah(crypto.randomUUID(), {
    sectionCode: 'field', grup: { mode: 'unit' },
    blok: [blokDasar(jobHauler[0]!.id, unitHauler[0]!.id)],
  });
  periksa('ditolak', j.ok === false, 'justru diterima');
}

console.log('\n─── 10. nomor WO tidak pernah bertabrakan ───');
{
  const semua = await sql<{ n: string; unik: string }[]>`
    SELECT count(*) AS n, count(DISTINCT wo_number) AS unik FROM work_orders
  `;
  periksa('semua nomor unik',
    semua[0]!.n === semua[0]!.unik, `${semua[0]!.n} WO, ${semua[0]!.unik} nomor`);
}

await sql`DELETE FROM api_tokens WHERE id = ${tokenBaris.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
