import './muat-env.js';

/**
 * TERAPKAN SURUT untuk FAKTOR dan TARIF, serta DAMPAK SETELAN.
 *
 * Tiga hal yang dijaga:
 *
 *   1. FAKTOR hanya menyentuh WO yang memang memakai KUNCI itu. Snapshot
 *      membekukan nilainya, bukan kuncinya — jadi kuncinya harus dicocokkan
 *      kembali dari asalnya masing-masing. Salah cocok berarti WO yang tak ada
 *      hubungannya ikut dihitung ulang.
 *   2. TARIF hanya menggeser HARGA per poin. Poin dan snapshot tidak boleh
 *      bergerak satu angka pun — kalau ikut bergerak, tarif dan skor jadi dua
 *      hal yang saling menimpa.
 *   3. SETELAN tidak punya surut sama sekali, dan layar harus mengatakan mana
 *      kunci yang benar-benar dibaca kode dan mana yang tidak.
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3210';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { pratinjauFaktorSurut } = await import('../src/domain/surutFaktor.js');
const { pratinjauTarifSurut } = await import('../src/domain/surutTarif.js');
const { setelanBerdampak } = await import('../src/domain/dampakSetelan.js');

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
       ORDER BY id LIMIT 1`
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
const l1 = await orang('supervisor');
const mekA = await orang('mechanic');
const mekB = await orang('mechanic', [mekA.id]);
const TENANT = Number(l2.tenant_id);
const adminSemula = (
  await sql<{ may_admin: boolean }[]>`SELECT may_admin FROM mechanics WHERE id = ${l2.id}`
)[0]!.may_admin;
await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;

async function perintah(t: string, aksi: string, data: unknown, opId = crypto.randomUUID()) {
  const r = await fetch(`${ALAMAT}/api/perintah`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kmb_token=${t}` },
    body: JSON.stringify({ aksi, op_id: opId, data }),
  });
  return r.json() as Promise<{
    ok: boolean; pesan?: string; data?: { hasil: Record<string, unknown> };
  }>;
}

const CAP = Date.now().toString().slice(-6);
const jobDibuat: number[] = [];
const woDibuat: number[] = [];
const JAM_LALU = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

const rupiahSemua = async () => Number((
  await sql<{ n: string }[]>`SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points`
)[0]!.n);
const rupiahWo = async (ids: number[]) => Number((
  await sql<{ n: string }[]>`
    SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points
     WHERE work_order_id = ANY(${ids}::bigint[])`
)[0]!.n);

console.log('\n─── 0. siapkan dua WO: satu shift 1, satu shift 2 ───');
let woNormal = 0, woSulit = 0;
{
  const j = await perintah(l2.token, 'admin_job', {
    sectionCode: 'tyreman', kode: `UJI-F${CAP}`, nama: 'CONTOH Uji Faktor',
    basePoints: 10, planHours: 5, aktif: true,
  });
  if (!j.ok) throw new Error(`gagal membuat job: ${j.pesan}`);
  const jobId = Number(j.data?.hasil['jobId']);
  jobDibuat.push(jobId);

  // Tyreman menuntut unit. Diambil dari unit yang memang boleh dipilih tyreman.
  const unit = (await sql<{ id: number }[]>`
    SELECT u.id FROM units u
     WHERE u.is_active AND NOT u.is_virtual AND NOT u.is_global
       AND EXISTS (SELECT 1 FROM unit_sections us JOIN sections s ON s.id = us.section_id
                    WHERE us.unit_id = u.id AND s.code = 'tyreman')
     ORDER BY u.id LIMIT 1`)[0]!;

  for (const kondisi of ['normal', 'difficult']) {
    const w = await perintah(l2.token, 'buat_wo', {
      sectionCode: 'tyreman',
      blok: [{
        jobId, unitId: Number(unit.id), workCondition: kondisi, location: 'field',
        teamMechanicIds: [mekA.id, mekB.id],
      }],
    });
    if (!w.ok) throw new Error(`gagal membuat WO: ${w.pesan}`);
    const id = Number((w.data?.hasil['dibuat'] as { id: number }[])[0]!.id);
    woDibuat.push(id);
    if (kondisi === 'normal') woNormal = id; else woSulit = id;
  }

  for (const id of woDibuat) {
    // 4 jam atas rencana 5 → on_time, jauh dari ambang.
    const k = await perintah(mekA.token, 'kirim_kerja',
      { woId: id, startTime: JAM_LALU(5), endTime: JAM_LALU(1) });
    if (!k.ok) throw new Error(`gagal kirim kerja: ${k.pesan}`);
    const a = await perintah(l1.token, 'approve_l1', { woId: id });
    if (!a.ok) throw new Error(`gagal approve L1: ${a.pesan}`);
    const b = await perintah(l2.token, 'approve_l2', { woId: id });
    if (!b.ok) throw new Error(`gagal approve L2: ${b.pesan}`);
  }
  periksa('dua WO tersetujui', (await rupiahWo(woDibuat)) > 0);
}

console.log('\n─── 1. faktor: hanya WO berkunci itu yang ikut ───');
let faktorSulit = 0;
{
  const f = (await sql<{ id: number; factor_value: string }[]>`
    SELECT id, factor_value FROM factors
     WHERE tenant_id = ${TENANT} AND factor_type = 'work_condition' AND factor_key = 'difficult'`)[0]!;
  faktorSulit = Number(f.id);

  const p = await pratinjauFaktorSurut(TENANT, faktorSulit, Number(f.factor_value) * 2);
  const idKena = new Set(
    (await sql<{ work_order_id: number }[]>`
      SELECT s.work_order_id FROM scoring_snapshots s JOIN work_orders w ON w.id = s.work_order_id
       WHERE w.status = 'approved' AND w.work_condition = 'difficult'`)
      .map((r) => Number(r.work_order_id)),
  );
  periksa('jumlah WO terpengaruh = jumlah WO ber-kondisi difficult',
    p.terpengaruh === idKena.size, `${p.terpengaruh} vs ${idKena.size}`);
  periksa('WO shift 2 kita ikut terhitung', idKena.has(woSulit));
  periksa('WO shift 1 kita TIDAK ikut', !idKena.has(woNormal));
  periksa('pratinjau menyebut rupiah, bukan cuma jumlah WO',
    p.rupiahSekarang > 0 && p.rupiahSesudah > p.rupiahSekarang,
    `${p.rupiahSekarang} → ${p.rupiahSesudah}`);
  periksa('memberi tahu bahwa faktor berlaku lintas section',
    p.catatan.some((c) => /lintas section/i.test(c)), JSON.stringify(p.catatan));
  periksa('periode gaji disebut', p.periode.length >= 1);
}

console.log('\n─── 2. faktor: rupiah bergeser persis seperti dijanjikan ───');
{
  const f = (await sql<{ id: number; factor_value: string }[]>`
    SELECT id, factor_value FROM factors WHERE id = ${faktorSulit}`)[0]!;
  const nilaiBaru = Number(f.factor_value) * 2;
  const p = await pratinjauFaktorSurut(TENANT, faktorSulit, nilaiBaru);

  const semuaSebelum = await rupiahSemua();
  const normalSebelum = await rupiahWo([woNormal]);

  const a = await perintah(l2.token, 'terapkan_faktor_surut', {
    faktorId: faktorSulit, nilaiBaru, rupiahSesudahDilihat: p.rupiahSesudah,
  });
  periksa('diterapkan', a.ok === true, a.pesan);

  const geser = (await rupiahSemua()) - semuaSebelum;
  const janji = p.rupiahSesudah - p.rupiahSekarang;
  periksa('total sistem bergeser tepat sebesar yang dijanjikan',
    geser === janji, `${geser} vs janji ${janji}`);
  periksa('WO shift 1 TIDAK bergerak satu rupiah pun',
    (await rupiahWo([woNormal])) === normalSebelum);

  const s = (await sql<{ work_condition_factor: string }[]>`
    SELECT work_condition_factor FROM scoring_snapshots WHERE work_order_id = ${woSulit}`)[0]!;
  periksa('snapshot WO shift 2 ikut ditulis ulang',
    Number(s.work_condition_factor) === nilaiBaru, s.work_condition_factor);

  const katalog = (await sql<{ factor_value: string }[]>`
    SELECT factor_value FROM factors WHERE id = ${faktorSulit}`)[0]!;
  periksa('tabel faktor juga tersimpan', Number(katalog.factor_value) === nilaiBaru);

  const b = await perintah(l2.token, 'terapkan_faktor_surut', {
    faktorId: faktorSulit, nilaiBaru: 9.9, rupiahSesudahDilihat: 1,
  });
  periksa('pratinjau basi ditolak', b.ok === false, 'justru diterima');

  await sql`UPDATE factors SET factor_value = ${f.factor_value} WHERE id = ${faktorSulit}`;
}

console.log('\n─── 3. faktor mtbf: WO tanpa status MTBF tidak ikut ───');
{
  const f = (await sql<{ id: number; factor_value: string }[]>`
    SELECT id, factor_value FROM factors
     WHERE tenant_id = ${TENANT} AND factor_type = 'mtbf' AND factor_key = 'first_time'`)[0]!;
  const p = await pratinjauFaktorSurut(TENANT, Number(f.id), Number(f.factor_value) + 0.1);
  const punya = (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM work_orders w JOIN scoring_snapshots s ON s.work_order_id = w.id
     WHERE w.status = 'approved' AND w.mtbf_redo_status = 'first_time'`)[0]!.n;
  periksa('hanya WO ber-status first_time yang terhitung',
    p.terpengaruh === punya, `${p.terpengaruh} vs ${punya}`);
}

console.log('\n─── 3b. keempat jenis faktor mencocokkan kuncinya dengan benar ───');
{
  /* Tiap jenis faktor mencari kuncinya di tempat yang BERBEDA — timeliness di
     snapshot, safety & mtbf di kolom WO, work_condition lewat override. Empat
     cabang SQL, dan cabang yang tak pernah dijalankan satu uji pun adalah
     tempat paling nyaman bagi bug untuk menunggu. */
  const semua = await sql<{ id: number; jenis: string; kunci: string; nilai: string }[]>`
    SELECT id, factor_type::text AS jenis, factor_key::text AS kunci, factor_value AS nilai
      FROM factors WHERE tenant_id = ${TENANT} ORDER BY factor_type, factor_key`;

  for (const f of semua) {
    const p = await pratinjauFaktorSurut(TENANT, Number(f.id), Number(f.nilai) + 0.05);

    // Jumlah yang seharusnya, dihitung dengan kueri terpisah per jenis.
    const harus = Number((await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM work_orders w JOIN scoring_snapshots s ON s.work_order_id = w.id
       WHERE w.tenant_id = ${TENANT} AND w.status = 'approved'
         AND CASE ${f.jenis}
               WHEN 'timeliness' THEN s.timeliness_status::text = ${f.kunci}
               WHEN 'safety' THEN (CASE WHEN w.safety_incident THEN 'incident'
                                        ELSE 'no_incident' END) = ${f.kunci}
               WHEN 'mtbf' THEN w.mtbf_redo_status::text = ${f.kunci}
               ELSE w.work_condition::text = ${f.kunci}
             END`)[0]!.n);
    periksa(`${f.jenis}/${f.kunci}: ${p.terpengaruh} WO — cocok dengan hitungan terpisah`,
      p.terpengaruh === harus, `${p.terpengaruh} vs ${harus}`);
  }

  const insiden = semua.find((f) => f.jenis === 'safety' && f.kunci === 'incident')!;
  const p = await pratinjauFaktorSurut(TENANT, Number(insiden.id), 0.5);
  periksa('faktor insiden memberi peringatan sendiri — ia menghidupkan WO yang dinolkan',
    p.catatan.some((c) => /insiden/i.test(c)), JSON.stringify(p.catatan));
}

console.log('\n─── 4. tarif: hanya HARGA yang bergerak, poin tidak ───');
{
  const t = (await sql<{ id: number; idr_per_point: string; label: string }[]>`
    SELECT pr.id, pr.idr_per_point, pr.label FROM pay_rates pr
     WHERE pr.tenant_id = ${TENANT}
       AND EXISTS (SELECT 1 FROM mechanics m WHERE m.pay_rate_id = pr.id)
     ORDER BY pr.id LIMIT 1`)[0]!;
  const idrBaru = Number(t.idr_per_point) * 2;

  const p = await pratinjauTarifSurut(TENANT, Number(t.id), idrBaru);
  periksa('pratinjau menyebut siapa saja yang bayarannya bergeser',
    p.orangRingkas.length > 0, JSON.stringify(p.orangRingkas));
  periksa('memberi tahu bahwa poin tidak disentuh',
    p.catatan.some((c) => /poin tidak disentuh/i.test(c)), JSON.stringify(p.catatan));
  periksa('tarif dua kali lipat ⇒ rupiah dua kali lipat',
    p.rupiahSesudah === p.rupiahSekarang * 2,
    `${p.rupiahSekarang} → ${p.rupiahSesudah}`);

  const poinSebelum = (await sql<{ n: string }[]>`
    SELECT coalesce(sum(points),0)::text AS n FROM mechanic_points`)[0]!.n;
  const snapSebelum = (await sql<{ n: string }[]>`
    SELECT coalesce(sum(final_points),0)::text AS n FROM scoring_snapshots`)[0]!.n;
  const semuaSebelum = await rupiahSemua();

  const a = await perintah(l2.token, 'terapkan_tarif_surut', {
    tarifId: Number(t.id), idrBaru, rupiahSesudahDilihat: p.rupiahSesudah,
  });
  periksa('diterapkan', a.ok === true, a.pesan);

  const poinSesudah = (await sql<{ n: string }[]>`
    SELECT coalesce(sum(points),0)::text AS n FROM mechanic_points`)[0]!.n;
  const snapSesudah = (await sql<{ n: string }[]>`
    SELECT coalesce(sum(final_points),0)::text AS n FROM scoring_snapshots`)[0]!.n;
  /* Inilah yang membedakan surut tarif dari surut faktor. Kalau poin ikut
     bergerak, berarti ada jalur yang menghitung ulang skor padahal yang diminta
     cuma mengubah harganya. */
  periksa('POIN tidak bergerak satu angka pun', poinSebelum === poinSesudah,
    `${poinSebelum} → ${poinSesudah}`);
  periksa('SNAPSHOT juga tidak bergerak', snapSebelum === snapSesudah,
    `${snapSebelum} → ${snapSesudah}`);

  const geser = (await rupiahSemua()) - semuaSebelum;
  periksa('rupiah bergeser tepat sebesar yang dijanjikan',
    geser === p.rupiahSesudah - p.rupiahSekarang,
    `${geser} vs janji ${p.rupiahSesudah - p.rupiahSekarang}`);

  await perintah(l2.token, 'terapkan_tarif_surut', {
    tarifId: Number(t.id), idrBaru: Number(t.idr_per_point),
    rupiahSesudahDilihat: (await pratinjauTarifSurut(
      TENANT, Number(t.id), Number(t.idr_per_point))).rupiahSesudah,
  });
  periksa('bisa dikembalikan ke semula', (await rupiahSemua()) === semuaSebelum,
    `${semuaSebelum} → ${await rupiahSemua()}`);
}

console.log('\n─── 5. setelan: layar tahu mana yang berdampak dan mana yang tidak ───');
{
  const d = await setelanBerdampak(TENANT);
  periksa('menghasilkan daftar', d.length > 0);
  periksa('setiap butir menyebut dampaknya, bukan cuma nilainya',
    d.every((x) => x.dampak.length > 20));

  const mati = d.filter((x) => x.sifat === 'belum_dipakai');
  /* Ini temuan, bukan hipotesis: 5 dari 8 setelan tidak dibaca kode mana pun.
     Layar menjawab "tersimpan" dan tidak ada apa pun yang berubah. */
  periksa('setelan yang tidak dibaca kode mana pun ditandai', mati.length > 0,
    `${mati.length} setelan`);
  periksa('periode_payroll_mulai termasuk yang belum dipakai',
    mati.some((x) => x.kunci === 'periode_payroll_mulai'),
    JSON.stringify(mati.map((x) => x.kunci)));
  periksa('dan alasannya menyebut dari mana cut-off sebenarnya diambil',
    /CUTOFF_BAWAAN|periode\.ts/.test(
      d.find((x) => x.kunci === 'periode_payroll_mulai')?.dampak ?? ''));

  const hidup = d.filter((x) => x.sifat === 'langsung');
  periksa('meter_lompat_hm ditandai berlaku seketika',
    hidup.some((x) => x.kunci === 'meter_lompat_hm'));
  periksa('dan menyebut berkas pembacanya supaya bisa diperiksa',
    /meter\.ts/.test(d.find((x) => x.kunci === 'meter_lompat_hm')?.pembaca ?? ''));

  const tanpaBaris = d.filter((x) => !x.adaBarisnya);
  periksa('kunci yang dibaca kode tapi belum punya baris ikut dilaporkan',
    tanpaBaris.length > 0, JSON.stringify(tanpaBaris.map((x) => x.kunci)));
}

console.log('\n─── 6. gerbangnya tetap penanda admin ───');
{
  await sql`UPDATE mechanics SET may_admin = false WHERE id = ${l2.id}`;
  const a = await perintah(l2.token, 'terapkan_faktor_surut', {
    faktorId: faktorSulit, nilaiBaru: 1.5, rupiahSesudahDilihat: 0,
  });
  periksa('surut faktor tanpa penanda admin ditolak', a.ok === false, 'justru diterima');
  const r = await fetch(`${ALAMAT}/api/data?jenis=pratinjau_faktor&id=${faktorSulit}&nilai=1.5`,
    { headers: { Cookie: `kmb_token=${l1.token}` } });
  periksa('pratinjau faktor juga ditolak untuk bukan admin', r.status === 403, String(r.status));
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

// ── Bersihkan ───────────────────────────────────────────────────────────────
await sql`DELETE FROM work_orders WHERE id = ANY(${woDibuat}::bigint[])`;
await sql`DELETE FROM jobs WHERE id = ANY(${jobDibuat}::int[])`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);

await sql`UPDATE mechanics SET may_admin = ${adminSemula} WHERE id = ${l2.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
