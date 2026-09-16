import './muat-env.js';

/**
 * KATALOG JOB: TAMBAH SATUAN, GANTI NAMA, DAN "TERAPKAN KE SEMUA WO".
 *
 * Tiga perilaku yang diuji di sini, ketiganya menyangkut uang atau data yang
 * tidak boleh hilang:
 *
 *   1. MENGGANTI NAMA PEKERJAAN tidak boleh membuat satu pun WO kehilangan
 *      jobnya, dan tidak boleh menggeser rupiah siapa pun. WO menyimpan nomor
 *      jobnya, bukan tulisan namanya — dan uji ini yang membuktikannya, bukan
 *      keyakinan.
 *
 *   2. MENYIMPAN ANGKA BIASA hanya berlaku untuk WO baru. Rupiah yang sudah
 *      terbit tidak boleh bergerak satu pun.
 *
 *   3. TERAPKAN SURUT menggeser rupiah PERSIS sebesar yang dijanjikan
 *      pratinjaunya — tidak lebih, tidak kurang — dan tidak menyentuh WO yang
 *      angkanya pernah ditetapkan approver sendiri.
 *
 * Yang ketiga adalah satu-satunya jalan di seluruh sistem yang boleh menggeser
 * gaji yang sudah dibayar. Di SUM, tindakan serupa pernah menggeser pembayaran
 * -Rp 17,6 juta (9 Sep 2026).
 */
if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');
const { bekalAdmin } = await import('../src/domain/admin.js');
const { pratinjauSurut } = await import('../src/domain/terapkanSurut.js');

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
         AND NOT (id = ANY(${lewati}::int[]))
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
    ok: boolean; pesan?: string; kode?: string;
    data?: { hasil: Record<string, unknown> };
  }>;
}

/** Penanda unik supaya jejak uji ini bisa dibersihkan tanpa menyentuh yang lain. */
const CAP = Date.now().toString().slice(-6);
const KODE_UJI = `UJI-S${CAP}`;
const jobDibuat: number[] = [];
const woDibuat: number[] = [];

const rupiahSemua = async () => Number((
  await sql<{ n: string }[]>`SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points`
)[0]!.n);
const rupiahWo = async (ids: number[]) => Number((
  await sql<{ n: string }[]>`
    SELECT coalesce(sum(idr_value),0)::text AS n FROM mechanic_points
     WHERE work_order_id = ANY(${ids}::bigint[])`
)[0]!.n);

const JAM_LALU = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

console.log('\n─── 1. tombol "+ Tambah job" ───');
let jobId = 0;
{
  // Section workshop memilih job lewat cascade. Tanpa cabang, job tersimpan
  // rapi lalu TIDAK PERNAH muncul di layar buat WO — data mati tanpa tanda.
  const a = await perintah(l2.token, 'admin_job', {
    sectionCode: 'workshop', kode: KODE_UJI, nama: 'CONTOH Uji Surut',
    basePoints: 10, planHours: 5, aktif: true,
  });
  periksa('job cascade TANPA model/komponen/sub ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menyebut tidak akan muncul di layar buat WO',
    /tidak akan.*muncul/i.test(a.pesan ?? ''), a.pesan);

  const b = await perintah(l2.token, 'admin_job', {
    sectionCode: 'workshop', kode: KODE_UJI, nama: 'CONTOH Uji Surut',
    unitModel: `UJIMODEL${CAP}`, komponen: `UJI Komponen ${CAP}`,
    subKomponen: `UJI Sub ${CAP}`,
    basePoints: 10, planHours: 5, aktif: true,
  });
  periksa('job dengan cabang lengkap tersimpan', b.ok === true, b.pesan);
  periksa('dilaporkan sebagai baru', b.data?.hasil['baru'] === true);
  jobId = Number(b.data?.hasil['jobId']);
  jobDibuat.push(jobId);

  const bekal = await bekalAdmin(TENANT);
  const j = bekal.job.find((x) => x.id === jobId);
  periksa('terbaca di katalog dengan cabangnya',
    j?.komponen === `UJI Komponen ${CAP}` && j?.subKomponen === `UJI Sub ${CAP}`,
    JSON.stringify({ k: j?.komponen, s: j?.subKomponen }));
  periksa('tersambung ke model unit, bukan job datar',
    j?.unitModel === `UJIMODEL${CAP}`, String(j?.unitModel));

  const c = await perintah(l2.token, 'admin_job', {
    sectionCode: 'workshop', kode: KODE_UJI, nama: 'CONTOH Kembar',
    unitModel: `UJIMODEL${CAP}`, komponen: `UJI Komponen ${CAP}`,
    subKomponen: `UJI Sub ${CAP}`,
    basePoints: 1, planHours: 1, aktif: true,
  });
  periksa('kode yang sudah dipakai di section yang SAMA ditolak', c.ok === false,
    'justru diterima');

  /* Kode job unik PER SECTION, bukan per tenant. Di KMB V2, 162 kode dipakai
     di field DAN workshop untuk pekerjaan yang sama sekali berbeda. */
  const d = await perintah(l2.token, 'admin_job', {
    sectionCode: 'tyreman', kode: KODE_UJI, nama: 'CONTOH Kode Sama Section Lain',
    basePoints: 2, planHours: 1, aktif: true,
  });
  periksa('kode yang sama di SECTION LAIN diterima', d.ok === true, d.pesan);
  if (d.ok) jobDibuat.push(Number(d.data?.hasil['jobId']));
  periksa('section datar tidak menuntut model/komponen/sub', d.ok === true, d.pesan);
}

console.log('\n─── 2. WO dibuat dan disetujui memakai job itu ───');
{
  for (let i = 0; i < 3; i++) {
    const j = await perintah(l2.token, 'buat_wo', {
      sectionCode: 'workshop',
      blok: [{
        jobId, workCondition: 'normal', location: 'workshop',
        teamMechanicIds: [mekA.id, mekB.id],
      }],
    });
    if (!j.ok) throw new Error(`gagal membuat WO uji: ${j.pesan}`);
    woDibuat.push(Number((j.data?.hasil['dibuat'] as { id: number }[])[0]!.id));
  }

  for (const id of woDibuat) {
    // 4 jam atas rencana 5 jam → on time, jauh dari ambang. Penting: perubahan
    // jam rencana di bagian 5 memang dipilih supaya status ini TIDAK bergeser.
    const k = await perintah(mekA.token, 'kirim_kerja',
      { woId: id, startTime: JAM_LALU(5), endTime: JAM_LALU(1) });
    if (!k.ok) throw new Error(`gagal kirim kerja: ${k.pesan}`);
  }

  // WO ketiga: approver menetapkan base pointnya SENDIRI sebelum disetujui.
  // Itu penilaian orang yang melihat pekerjaannya — surut tidak boleh menimpanya.
  const ov = await perintah(l1.token, 'save_override',
    { woId: woDibuat[2]!, basePoints: 99 });
  periksa('approver bisa menetapkan base point satu WO', ov.ok === true, ov.pesan);

  for (const id of woDibuat) {
    const a = await perintah(l1.token, 'approve_l1', { woId: id });
    if (!a.ok) throw new Error(`gagal approve L1: ${a.pesan}`);
    const b = await perintah(l2.token, 'approve_l2', { woId: id });
    if (!b.ok) throw new Error(`gagal approve L2: ${b.pesan}`);
  }

  const n = (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM work_orders
     WHERE id = ANY(${woDibuat}::bigint[]) AND status = 'approved'`)[0]!.n;
  periksa('tiga WO tersetujui penuh', n === 3, `${n} dari 3`);

  const bayar = await rupiahWo(woDibuat);
  periksa('ketiganya sudah menghasilkan rupiah', bayar > 0, String(bayar));
}

console.log('\n─── 3. mengganti nama pekerjaan tidak memutus satu pun WO ───');
{
  const sebelum = await rupiahSemua();
  const namaBaru = `CONTOH Uji Surut — NAMA BARU ${CAP}`;

  const a = await perintah(l2.token, 'admin_job', {
    jobId, nama: namaBaru, basePoints: 10, planHours: 5, aktif: true,
  });
  periksa('nama tersimpan', a.ok === true, a.pesan);
  periksa('nama lamanya ikut dilaporkan',
    (a.data?.hasil['lama'] as { nama: string })?.nama === 'CONTOH Uji Surut',
    JSON.stringify(a.data?.hasil['lama']));

  const yatim = (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM work_orders w
     WHERE w.id = ANY(${woDibuat}::bigint[])
       AND (w.job_id IS NULL OR NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = w.job_id))`)[0]!.n;
  periksa('TIDAK ADA WO yang kehilangan jobnya', yatim === 0, `${yatim} yatim`);

  const terbaca = (await sql<{ nama: string }[]>`
    SELECT j.job_description AS nama FROM work_orders w JOIN jobs j ON j.id = w.job_id
     WHERE w.id = ${woDibuat[0]!}`)[0]!.nama;
  periksa('WO LAMA ikut membaca nama yang baru', terbaca === namaBaru, terbaca);

  periksa('dan tidak satu rupiah pun bergeser',
    (await rupiahSemua()) === sebelum, `${sebelum} → ${await rupiahSemua()}`);
}

console.log('\n─── 4. simpan biasa hanya berlaku untuk WO baru ───');
{
  const sebelum = await rupiahSemua();
  const a = await perintah(l2.token, 'admin_job', {
    jobId, basePoints: 40, planHours: 5, aktif: true,
  });
  periksa('base point naik 10 → 40 tersimpan', a.ok === true, a.pesan);

  const katalog = (await sql<{ base_points: string }[]>`
    SELECT base_points FROM jobs WHERE id = ${jobId}`)[0]!.base_points;
  periksa('katalog benar-benar berubah', Number(katalog) === 40, katalog);

  periksa('rupiah yang sudah terbit TETAP — inilah jaminan bekunya',
    (await rupiahSemua()) === sebelum, `${sebelum} → ${await rupiahSemua()}`);

  // Kembalikan ke 10 supaya bagian 5 berangkat dari keadaan yang jelas.
  await perintah(l2.token, 'admin_job', {
    jobId, basePoints: 10, planHours: 5, aktif: true,
  });
}

console.log('\n─── 5. pratinjau surut menyebut rupiahnya, bukan cuma jumlah WO ───');
let pratinjau: Awaited<ReturnType<typeof pratinjauSurut>>;
{
  pratinjau = await pratinjauSurut(TENANT, jobId, 20, 5);

  periksa('hanya dua WO yang dihitung ulang', pratinjau.terpengaruh === 2,
    String(pratinjau.terpengaruh));
  periksa('satu WO dilewati karena approver pernah menetapkan angkanya',
    pratinjau.dilewati === 1, String(pratinjau.dilewati));
  periksa('dan alasan dilewatinya ikut disebut, bukan cuma jumlahnya',
    /approver/i.test(pratinjau.alasanDilewati ?? ''), pratinjau.alasanDilewati ?? '(kosong)');
  periksa('empat baris bayaran ikut bergerak (2 WO × 2 mekanik)',
    pratinjau.orang === 4, String(pratinjau.orang));
  periksa('jam rencana tidak diubah, jadi tidak ada ketepatan yang bergeser',
    pratinjau.statusBergeser === 0, String(pratinjau.statusBergeser));

  const duaTanpaOverride = woDibuat.slice(0, 2);
  const nyata = await rupiahWo(duaTanpaOverride);
  periksa('"rupiah sekarang" sama dengan yang benar-benar tercatat',
    pratinjau.rupiahSekarang === nyata, `${pratinjau.rupiahSekarang} vs ${nyata}`);
  periksa('base point dua kali lipat ⇒ rupiah dua kali lipat',
    pratinjau.rupiahSesudah === pratinjau.rupiahSekarang * 2,
    `${pratinjau.rupiahSekarang} → ${pratinjau.rupiahSesudah}`);
  periksa('periodenya disebut, bukan cuma totalnya', pratinjau.periode.length >= 1,
    JSON.stringify(pratinjau.periode));
  periksa('label periodenya rentang 16–15, bukan nama bulan',
    /–/.test(pratinjau.periode[0]?.label ?? ''), pratinjau.periode[0]?.label);

  periksa('MEMBACA PRATINJAU TIDAK MENULIS APA PUN',
    (await rupiahWo(duaTanpaOverride)) === nyata);
}

console.log('\n─── 5b. pratinjau lewat jalur yang dipakai layar ───');
{
  /* Layar tidak memanggil domain langsung — ia memanggil rute ini. Menguji
     fungsinya saja meninggalkan satu-satunya jalan yang benar-benar dipakai
     tanpa penjaga. */
  async function baca(token: string, alamat: string) {
    const r = await fetch(`${ALAMAT}/api/data?${alamat}`, {
      headers: { Cookie: `kmb_token=${token}` },
    });
    return {
      status: r.status,
      body: await r.json() as { ok: boolean; pesan?: string; data?: Record<string, unknown> },
    };
  }
  const q = `jenis=pratinjau_surut&job_id=${jobId}&base_points=20&plan_hours=5`;

  const a = await baca(l2.token, q);
  periksa('rute menjawab', a.body.ok === true, a.body.pesan);
  periksa('angkanya sama dengan yang dihitung domain',
    Number(a.body.data?.['rupiahSesudah']) === pratinjau.rupiahSesudah,
    `${a.body.data?.['rupiahSesudah']} vs ${pratinjau.rupiahSesudah}`);
  periksa('membawa rincian per periode untuk ditampilkan',
    Array.isArray(a.body.data?.['periode']));

  // Pratinjau ini menyebut RUPIAH YANG SUDAH DIBAYAR. Gerbangnya harus sama
  // dengan menu Admin, bukan sekadar "sudah login".
  const b = await baca(l1.token, q);
  periksa('bukan admin tidak boleh membacanya', b.body.ok === false, 'justru diberi');
  periksa('dan ditolak dengan 403', b.status === 403, String(b.status));

  const c = await baca(l2.token, `jenis=pratinjau_surut&job_id=${jobId}&base_points=0&plan_hours=5`);
  periksa('base point 0 ditolak di pintu', c.body.ok === false, 'justru diterima');
}

console.log('\n─── 6. pratinjau yang sudah basi ditolak ───');
{
  const a = await perintah(l2.token, 'terapkan_surut', {
    jobId, basePointBaru: 20, planHoursBaru: 5,
    rupiahSesudahDilihat: pratinjau.rupiahSesudah + 1,
  });
  periksa('angka yang tidak cocok ditolak', a.ok === false, 'justru diterima');
  periksa('alasannya menyuruh melihat pratinjaunya sekali lagi',
    /pratinjau/i.test(a.pesan ?? ''), a.pesan);
}

console.log('\n─── 7. terapkan surut menggeser persis sebesar yang dijanjikan ───');
const OP = crypto.randomUUID();
{
  const semuaSebelum = await rupiahSemua();
  const woOverride = woDibuat[2]!;
  const overrideSebelum = await rupiahWo([woOverride]);
  const duaTanpaOverride = woDibuat.slice(0, 2);

  const a = await perintah(l2.token, 'terapkan_surut', {
    jobId, basePointBaru: 20, planHoursBaru: 5,
    rupiahSesudahDilihat: pratinjau.rupiahSesudah,
  }, OP);
  periksa('diterapkan', a.ok === true, a.pesan);
  periksa('dilaporkan berapa WO yang dihitung ulang',
    Number(a.data?.hasil['woDihitungUlang']) === 2, String(a.data?.hasil['woDihitungUlang']));

  const sesudah = await rupiahWo(duaTanpaOverride);
  periksa('rupiahnya PERSIS seperti yang dijanjikan pratinjau',
    sesudah === pratinjau.rupiahSesudah, `${sesudah} vs janji ${pratinjau.rupiahSesudah}`);

  const geser = (await rupiahSemua()) - semuaSebelum;
  const janji = pratinjau.rupiahSesudah - pratinjau.rupiahSekarang;
  periksa('TOTAL SELURUH SISTEM bergeser tepat sebesar selisih yang dijanjikan',
    geser === janji, `${geser} vs janji ${janji}`);

  periksa('WO yang di-override TIDAK ikut bergerak satu rupiah pun',
    (await rupiahWo([woOverride])) === overrideSebelum,
    `${overrideSebelum} → ${await rupiahWo([woOverride])}`);

  const snap = await sql<{ base_points: string; final_points: string }[]>`
    SELECT base_points, final_points FROM scoring_snapshots
     WHERE work_order_id = ANY(${duaTanpaOverride}::bigint[])`;
  periksa('snapshot ikut ditulis ulang, bukan cuma poin mekanik',
    snap.every((s) => Number(s.base_points) === 20), JSON.stringify(snap));

  const snapOv = (await sql<{ base_points: string }[]>`
    SELECT base_points FROM scoring_snapshots WHERE work_order_id = ${woOverride}`)[0]!;
  periksa('snapshot WO yang di-override tetap 99', Number(snapOv.base_points) === 99,
    snapOv.base_points);

  const wo = await sql<{ final_points: string }[]>`
    SELECT final_points FROM work_orders WHERE id = ANY(${duaTanpaOverride}::bigint[])`;
  const sp = await sql<{ final_points: string }[]>`
    SELECT final_points FROM scoring_snapshots
     WHERE work_order_id = ANY(${duaTanpaOverride}::bigint[]) ORDER BY work_order_id`;
  periksa('work_orders.final_points ikut, jadi layar tidak menampilkan angka lama',
    wo.map((x) => x.final_points).sort().join() === sp.map((x) => x.final_points).sort().join(),
    `${JSON.stringify(wo)} vs ${JSON.stringify(sp)}`);

  const audit = (await sql<{ details: Record<string, unknown> }[]>`
    SELECT details FROM audit_logs
     WHERE action = 'terapkan_surut' AND entity_id = ${String(jobId)}
     ORDER BY id DESC LIMIT 1`)[0];
  const woAudit = (audit?.details['wo'] ?? []) as unknown[];
  periksa('setiap WO tercatat nilai lama & barunya di audit log',
    woAudit.length === 2, `${woAudit.length} baris`);
  periksa('audit menyebut rupiah sebelum dan sesudah',
    JSON.stringify(audit?.details).includes('rupiah'));
}

console.log('\n─── 8. dikirim dua kali tidak menggeser dua kali ───');
{
  const sebelum = await rupiahSemua();
  const a = await perintah(l2.token, 'terapkan_surut', {
    jobId, basePointBaru: 20, planHoursBaru: 5,
    rupiahSesudahDilihat: pratinjau.rupiahSesudah,
  }, OP);
  periksa('kiriman ulang dengan op_id yang sama dijawab BERHASIL', a.ok === true, a.pesan);
  periksa('tapi tidak menggeser rupiah untuk kedua kalinya',
    (await rupiahSemua()) === sebelum, `${sebelum} → ${await rupiahSemua()}`);
}

console.log('\n─── 9. jam rencana yang berubah menggeser ketepatan waktu ───');
{
  // Sesi 4 jam. Rencana turun 5 → 2 jam ⇒ 200% ⇒ way_late. Ini satu-satunya
  // tempat angka WO lama bisa bergeser karena tabel Faktor HARI INI, jadi ia
  // harus terlihat di pratinjau — bukan diam-diam ikut.
  const p = await pratinjauSurut(TENANT, jobId, 20, 2);
  periksa('pratinjau menghitung berapa WO yang ketepatannya bergeser',
    p.statusBergeser === 2, String(p.statusBergeser));
  periksa('dan rupiahnya ikut turun karena faktornya lebih kecil',
    p.rupiahSesudah < p.rupiahSekarang, `${p.rupiahSekarang} → ${p.rupiahSesudah}`);

  const a = await perintah(l2.token, 'terapkan_surut', {
    jobId, basePointBaru: 20, planHoursBaru: 2,
    rupiahSesudahDilihat: p.rupiahSesudah,
  });
  periksa('diterapkan', a.ok === true, a.pesan);

  const s = await sql<{ timeliness_status: string; target_hours: string }[]>`
    SELECT timeliness_status::text, target_hours FROM scoring_snapshots
     WHERE work_order_id = ANY(${woDibuat.slice(0, 2)}::bigint[])`;
  periksa('status di snapshot ikut ditulis ulang, bukan tertinggal',
    s.every((x) => x.timeliness_status === 'way_late'), JSON.stringify(s));
  periksa('jam rencana di snapshot ikut',
    s.every((x) => Number(x.target_hours) === 2), JSON.stringify(s));

  const nyata = await rupiahWo(woDibuat.slice(0, 2));
  periksa('rupiahnya lagi-lagi persis seperti pratinjau',
    nyata === p.rupiahSesudah, `${nyata} vs janji ${p.rupiahSesudah}`);
}

console.log('\n─── 10. gerbangnya tetap penanda admin ───');
{
  await sql`UPDATE mechanics SET may_admin = false WHERE id = ${l2.id}`;
  const a = await perintah(l2.token, 'terapkan_surut', {
    jobId, basePointBaru: 30, planHoursBaru: 5, rupiahSesudahDilihat: 0,
  });
  periksa('tanpa penanda admin ditolak', a.ok === false, 'justru diterima');
  const b = await perintah(l2.token, 'admin_job', {
    sectionCode: 'workshop', kode: `${KODE_UJI}-Z`, nama: 'CONTOH Tak Boleh',
    unitModel: `UJIMODEL${CAP}`, komponen: `UJI Komponen ${CAP}`,
    subKomponen: `UJI Sub ${CAP}`, basePoints: 1, planHours: 1, aktif: true,
  });
  periksa('menambah job tanpa penanda admin juga ditolak', b.ok === false, 'justru diterima');
  await sql`UPDATE mechanics SET may_admin = true WHERE id = ${l2.id}`;
}

// ── Bersihkan jejak uji ─────────────────────────────────────────────────────
await sql`DELETE FROM work_orders WHERE id = ANY(${woDibuat}::bigint[])`;
await sql`DELETE FROM jobs WHERE id = ANY(${jobDibuat}::int[])`;
await sql`
  DELETE FROM job_sub_components sc
   USING job_components c
   WHERE c.id = sc.component_id AND c.name = ${`UJI Komponen ${CAP}`}
`;
await sql`DELETE FROM job_components WHERE name = ${`UJI Komponen ${CAP}`}`;
await sql`DELETE FROM unit_models WHERE code = ${`UJIMODEL${CAP}`}`;
const terhapus = await sql`
  DELETE FROM api_tokens WHERE token = ANY(${tokenDibuat}::text[]) RETURNING id
`;
periksa('token uji dibersihkan', terhapus.length === tokenDibuat.length,
  `${terhapus.length} dari ${tokenDibuat.length}`);
const sisa = (await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM jobs WHERE job_code LIKE ${`UJI-S${CAP}%`}`)[0]!.n;
periksa('job uji dibersihkan', sisa === 0, `${sisa} tersisa`);

await sql`UPDATE mechanics SET may_admin = ${adminSemula} WHERE id = ${l2.id}`;
await sql.end();

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
