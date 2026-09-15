/**
 * Uji asap lewat HTTP sungguhan — server harus sudah berjalan.
 *
 *   npx tsx scripts/uji-alur.ts <token_L1> <token_L2> [alamat]
 *
 * Berbeda dari uji di tests/: yang ini melewati pintu HTTP, Zod, cookie/bearer,
 * dan seluruh lapisan Next — jadi ia menangkap hal yang uji domain tidak bisa
 * lihat, seperti aksi yang lolos tanpa gerbang peran.
 */

export {}; // menandai berkas ini modul, supaya `await` di tingkat atas sah

const [tokenL1, tokenL2, alamatArg] = process.argv.slice(2);
const DASAR = alamatArg ?? 'http://127.0.0.1:3210';

if (!tokenL1 || !tokenL2) {
  console.error('Pakai: npx tsx scripts/uji-alur.ts <token_L1> <token_L2> [alamat]');
  process.exit(1);
}

let lolos = 0;
let gagal = 0;

function periksa(nama: string, benar: boolean, catatan = ''): void {
  if (benar) {
    lolos++;
    console.log(`  ✓ ${nama}`);
  } else {
    gagal++;
    console.log(`  ✗ ${nama}${catatan ? ' — ' + catatan : ''}`);
  }
}

async function baca(token: string, jenis: string, tambahan = '') {
  const r = await fetch(`${DASAR}/api/data?jenis=${jenis}${tambahan}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

async function perintah(token: string, aksi: string, data: unknown, opId: string) {
  const r = await fetch(`${DASAR}/api/perintah`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ aksi, op_id: opId, data }),
  });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}

const op = (nama: string) => `asap-${nama}-${Math.random().toString(36).slice(2, 12)}`;

console.log(`\nMenguji ${DASAR}\n`);

// ── identitas ───────────────────────────────────────────────────────────────
console.log('Identitas');
{
  const { body } = await baca(tokenL2, 'aku');
  periksa('token L2 dikenali', body['ok'] === true, JSON.stringify(body));
  periksa(
    'perannya superintendent',
    (body['data'] as { peran?: string } | undefined)?.peran === 'superintendent',
  );

  const palsu = await fetch(`${DASAR}/api/data?jenis=aku`, {
    headers: { Authorization: 'Bearer token-karangan-sepanjang-ini' },
  });
  periksa('token karangan ditolak 403', palsu.status === 403, `dapat ${palsu.status}`);

  const kosong = await fetch(`${DASAR}/api/data?jenis=aku`);
  periksa('tanpa token ditolak 403', kosong.status === 403, `dapat ${kosong.status}`);
}

// ── katalog ─────────────────────────────────────────────────────────────────
console.log('\nKatalog');
const { body: katBody } = await baca(tokenL1, 'katalog');
const kat = katBody['data'] as {
  jobs: { id: number; unit_model: string | null; section: string; base_points: string | null }[];
  units: { id: number; unit_model: string | null; unit_name: string }[];
  mekanik: { id: number; name: string }[];
};
periksa('katalog terbaca', katBody['ok'] === true);

const job = kat.jobs.find((j) => j.section === 'field' && j.unit_model !== null);
// Unit yang model-nya COCOK dengan job — bukan unit pertama yang kebetulan ada.
const unit = kat.units.find((u) => u.unit_model === job?.unit_model);
const mekanik = kat.mekanik[0];
periksa('ada job field ber-model', !!job);
periksa('ada unit yang cocok modelnya', !!unit, `model job = ${job?.unit_model}`);

// L1 bukan superintendent, jadi poin katalog TIDAK boleh ikut terkirim.
periksa(
  'base_points disembunyikan dari non-L2',
  kat.jobs.every((j) => j.base_points === null),
);

if (!job || !unit || !mekanik) {
  console.log('\nTidak bisa lanjut tanpa job/unit/mekanik.');
  process.exit(1);
}

// ── buat WO ─────────────────────────────────────────────────────────────────
console.log('\nBuat WO');
const opBuat = op('buat');
const isiBuat = {
  sectionCode: 'field',
  blok: [{ jobId: job.id, unitId: unit.id, teamMechanicIds: [mekanik.id] }],
};
const buat = await perintah(tokenL1, 'buat_wo', isiBuat, opBuat);
periksa('WO terbuat', buat.body['ok'] === true, JSON.stringify(buat.body).slice(0, 160));
const woId: number | undefined = buat.body['data']?.hasil?.dibuat?.[0]?.id;
const nomor: string | undefined = buat.body['data']?.hasil?.dibuat?.[0]?.woNumber;
periksa('dapat nomor WO', !!nomor, String(nomor));

// Inilah inti pertahanan terhadap 502: kirim ulang PERSIS sama.
const ulang = await perintah(tokenL1, 'buat_wo', isiBuat, opBuat);
periksa('kiriman ulang dilayani struk', ulang.body['data']?.diulang === true);
periksa(
  'nomor WO tidak berubah',
  ulang.body['data']?.hasil?.dibuat?.[0]?.woNumber === nomor,
);

// ── gerbang peran ───────────────────────────────────────────────────────────
console.log('\nGerbang peran');
{
  const salahTahap = await perintah(tokenL2, 'approve_l2', { woId }, op('tahap'));
  periksa(
    'approve L2 atas WO yang belum sampai L2 ditolak sebagai konflik',
    salahTahap.status === 409,
    `dapat ${salahTahap.status} ${JSON.stringify(salahTahap.body).slice(0, 120)}`,
  );
}

// ── masukan ngawur ──────────────────────────────────────────────────────────
console.log('\nMasukan tidak sah');
{
  const timKosong = await perintah(
    tokenL1, 'buat_wo',
    { sectionCode: 'field', blok: [{ jobId: job.id, unitId: unit.id, teamMechanicIds: [] }] },
    op('kosong'),
  );
  periksa('tim kosong ditolak', timKosong.body['kode'] === 'MASUKAN_TIDAK_SAH');
  periksa(
    'penolakannya menjelaskan apa yang kurang',
    JSON.stringify(timKosong.body['detail'] ?? '').includes('teamMechanicIds'),
  );

  const tanpaOp = await fetch(`${DASAR}/api/perintah`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenL1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ aksi: 'buat_wo', data: isiBuat }),
  });
  periksa('tulis tanpa op_id ditolak', tanpaOp.status === 400, `dapat ${tanpaOp.status}`);

  const unitSalah = kat.units.find((u) => u.unit_model !== job.unit_model);
  if (unitSalah) {
    const silang = await perintah(
      tokenL1, 'buat_wo',
      { sectionCode: 'field', blok: [{ jobId: job.id, unitId: unitSalah.id, teamMechanicIds: [mekanik.id] }] },
      op('silang'),
    );
    periksa('job dari model unit lain ditolak', silang.body['kode'] === 'ATURAN_BISNIS');
  }
}

console.log(`\nlolos ${lolos} · gagal ${gagal}\n`);
process.exit(gagal === 0 ? 0 : 1);
