#!/usr/bin/env node
/**
 * Sinkron cermin: spreadsheet satu rumah → Supabase, skema milik rumah itu. Satu alat untuk semua rumah.
 * Menggantikan tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs (docs/BUG-DICATAT.md #29).
 * Format cermin sama dengan db/sum/cermin_sheet.sql; penjelasan di db/sum/README.md.
 *
 * Alat ini HANYA MEMBACA spreadsheet, memakai akun layanan Google yang diberi hak
 * Viewer. Ia tidak pernah menulis ke spreadsheet, dan tidak menyentuh GAS.
 *
 * Tidak ada daftar sheet yang tertanam. Alat membaca daftar sheet dari spreadsheet, lalu
 * menyalin setiap sheet ke tabel bernama snake_case dari nama sheetnya
 * (WorkOrders_Archive → work_orders_archive, HmKoreksi → hm_koreksi). Tabel yang belum ada
 * dibuat dengan bentuk cermin mentah (baris, nilai, data). Tabel yang sudah ada tapi bentuknya
 * lain tidak disentuh, dan sheet itu dilaporkan GAGAL.
 *
 * Penulisan per baris: sheet yang isinya sama dengan sinkron sebelumnya tidak ditulis ulang.
 * Untuk sheet yang berubah, hanya baris baru atau berubah yang ditulis, dan baris yang hilang
 * dihapus, supaya tabel tidak membengkak walaupun sinkron dijalankan tiap jam.
 *
 * Variabel lingkungan:
 *   GOOGLE_SA_KEY_FILE       path ke file JSON kunci akun layanan (simpan DI LUAR repo)
 *   <SKEMA>_SPREADSHEET_ID   ID spreadsheet rumah. Nama skema = awalannya dalam huruf kecil:
 *                            SUM_ → sum, KMB_ → kmb (KMB TRA), KMB_PROJEK_ → kmb_projek, KMBBUPR_ → kmbbupr
 *   DATABASE_URL             koneksi Postgres Supabase (tidak dipakai dengan --kering)
 *
 * Opsi:
 *   --skema=sum              rumah yang disinkron
 *   --semua                  semua rumah yang punya <SKEMA>_SPREADSHEET_ID di lingkungan, berurutan
 *   --sheet=WorkOrders       hanya menyinkronkan satu sheet
 *   --lewati=NamaSheet       sheet yang tidak disalin, dipisah koma. Bawaannya kosong: semua sheet disalin,
 *                            termasuk AuditLogs. (13 Nov AuditLogs dilewati demi batas 500 MB Gedung 1; sejak
 *                            14 Nov Gedung 1 paket Pro dan kode GAS di jalur Supabase menulis AuditLogs, BUG #42.)
 *   --kering                 baca dan hitung saja, tanpa menulis ke database
 *   --ringkas                satu baris per rumah, tanpa judul spreadsheet, ID, atau nama sheet yang lulus.
 *                            Dipakai di GitHub Actions, karena log repo publik bisa dibaca siapa saja.
 *   --periksa                laporan selisih: setiap sheet dimuat ulang walaupun tidak berubah, lalu SELURUH isi
 *                            tabel dibandingkan dengan isi sheet di dalam database (tanpa menarik data keluar).
 *                            Selisih yang tersisa sesudah ditulis berarti ada yang salah, dan sheet itu GAGAL.
 *   --periksa=harian         sama, tapi hanya sekali per hari kalender WIB per rumah, mulai pukul 02.00 WIB.
 *                            Hasilnya di cermin_log.selisih dan cermin_meta (periksa_terakhir, periksa_hasil,
 *                            hari_tanpa_selisih), bahan syarat saklar "7 hari tanpa selisih" (docs/SAKLAR.md).
 *   --akhir                  sinkron terakhir prosedur "Mulai migrasi" (hanya pelaksana tools/cermin/peralihan.mjs):
 *                            boleh menulis walaupun prosedur sudah mengunci sinkron maju (maju_dikunci,
 *                            db/bersama/cermin_maju.sql). Tanpa opsi ini putaran berhenti menulis rumah itu. Setelah
 *                            izin tulis terbuka, tidak ada putaran yang menulis, termasuk --akhir.
 *
 * Kunci: setiap transaksi sheet memegang kunci bersama 'cermin_maju:<skema>' (dibaca ulang izinnya) dan kunci
 * eksklusif 'cermin_sinkron:<skema>:<sheet>' (dua putaran tidak menulis sheet yang sama bersamaan).
 */
import {
  keTabel, aksesToken, gapi, bacaSheet, sidikDari,
} from './google.mjs';

const LEWATI_BAWAAN = '';

// Kolom yang biasa dipakai mencari baris. Kalau ada di header sebuah sheet, kolom itu diberi indeks.
const KOLOM_KUNCI = ['id', 'wo_id', 'wo_number', 'mechanic_id', 'token', 'op_id'];

// Catatan cermin_log disimpan sekian hari: cukup untuk syarat "7 hari tanpa selisih" dan perbandingan bulanan.
const SIMPAN_LOG_HARI = 35;

const BARIS_PER_INSERT = 1000;

const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function wajib(nama) {
  const v = process.env[nama];
  if (!v) throw new Error(`${nama} belum diisi. Lihat kepala berkas tools/cermin/sinkron.mjs.`);
  return v;
}

// Dengan --ringkas, ID spreadsheet disamarkan dari setiap pesan galat.
const idDisamarkan = new Set();
const samarkan = (pesan) => (arg.ringkas ? [...idDisamarkan].reduce((p, id) => p.split(id).join('<id>'), String(pesan)) : String(pesan));

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Tanggal dan jam WIB (UTC+7, tanpa musim panas).
const wib = (d) => {
  const w = new Date(d.getTime() + 7 * 3600e3);
  return { tanggal: w.toISOString().slice(0, 10), jam: w.getUTCHours() };
};

// Sheet yang rumusnya ikut dicermin (lihat bacaSheet).
const SHEET_BERUMUS = /^Config_/;

// Simpan rumus satu sheet ke <skema>.cermin_rumus. Hanya ditulis ulang bila berubah (rumus jarang berubah).
async function tulisRumus(tx, skema, judul, headers, rumus) {
  const lama = await tx`SELECT baris, kolom, rumus FROM ${tx(skema + '.cermin_rumus')} WHERE sheet = ${judul} ORDER BY baris, kolom`;
  const baru = [...rumus].sort((a, b) => a.baris - b.baris || a.kolom - b.kolom);
  const sama = lama.length === baru.length && lama.every((r, i) => r.baris === baru[i].baris && r.kolom === baru[i].kolom && r.rumus === baru[i].rumus);
  if (sama) return false;
  await tx`DELETE FROM ${tx(skema + '.cermin_rumus')} WHERE sheet = ${judul}`;
  for (let i = 0; i < baru.length; i += 500) {
    const potong = baru.slice(i, i + 500).map((r) => ({ sheet: judul, baris: r.baris, kolom: r.kolom, judul_kolom: headers[r.kolom] ?? null, rumus: r.rumus }));
    await tx`INSERT INTO ${tx(skema + '.cermin_rumus')} ${tx(potong, 'sheet', 'baris', 'kolom', 'judul_kolom', 'rumus')}`;
  }
  return true;
}

// ── Bentuk cermin di database, sama dengan db/sum/cermin_sheet.sql ───────────
async function siapkanSkema(sql, skema) {
  await sql`CREATE SCHEMA IF NOT EXISTS ${sql(skema)}`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_meta')} (
    kunci     text PRIMARY KEY,
    nilai     text NOT NULL,
    diubah_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_header')} (
    sheet        text PRIMARY KEY,
    tabel        text NOT NULL,
    headers      text[] NOT NULL,
    tipe         jsonb NOT NULL DEFAULT '{}'::jsonb,
    jumlah_baris integer NOT NULL,
    sidik        text NOT NULL,
    sinkron_at   timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_log')} (
    id           bigserial PRIMARY KEY,
    sheet        text NOT NULL,
    mulai_at     timestamptz NOT NULL,
    selesai_at   timestamptz NOT NULL DEFAULT now(),
    jumlah_baris integer,
    sidik        text,
    galat        text
  )`;
  // Rumus sheet config (SHEET_BERUMUS): satu baris per sel berumus. Dibaca pusat admin (hitung ulang) dan cermin balik.
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_rumus')} (
    sheet       text NOT NULL,
    baris       integer NOT NULL,
    kolom       integer NOT NULL,
    judul_kolom text,
    rumus       text NOT NULL,
    PRIMARY KEY (sheet, baris, kolom)
  )`;
  // Jumlah baris yang ditulis dan dihapus di setiap putaran, dan hasil --periksa (null kalau tidak diperiksa).
  await sql`ALTER TABLE ${sql(skema + '.cermin_log')}
              ADD COLUMN IF NOT EXISTS baris_berubah integer,
              ADD COLUMN IF NOT EXISTS baris_dihapus integer,
              ADD COLUMN IF NOT EXISTS selisih integer`;
  // Cermin hanya dibaca Worker lewat RPC bertoken. Pengguna anonim tidak boleh masuk skema ini.
  await sql`REVOKE ALL ON SCHEMA ${sql(skema)} FROM anon, authenticated`;
}

async function siapkanTabel(tx, skema, tabel, headers) {
  await tx`CREATE TABLE IF NOT EXISTS ${tx(`${skema}.${tabel}`)} (
    baris      integer PRIMARY KEY,
    nilai      jsonb   NOT NULL,
    data       jsonb   NOT NULL,
    sinkron_at timestamptz NOT NULL DEFAULT now()
  )`;
  const kolom = (await tx`SELECT column_name FROM information_schema.columns
                          WHERE table_schema = ${skema} AND table_name = ${tabel}`).map((r) => r.column_name);
  if (!['baris', 'nilai', 'data'].every((k) => kolom.includes(k))) {
    throw new Error(`tabel ${skema}.${tabel} sudah ada dengan bentuk lain (${kolom.join(', ')}), tidak disentuh`);
  }
  const indeks = (await tx`SELECT indexdef FROM pg_indexes WHERE schemaname = ${skema} AND tablename = ${tabel}`).map((r) => r.indexdef);
  for (const k of KOLOM_KUNCI.filter((k) => headers.includes(k) && !indeks.some((d) => d.includes(`'${k}'::text`)))) {
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS ${ident(`${tabel}_${k}_idx`)} ON ${ident(skema)}.${ident(tabel)} ((data->>'${k}'))`);
  }
}

// Tulis satu sheet per baris. `sama` berarti isinya tidak berubah sejak sinkron sebelumnya; tanpa `periksa`,
// sheet seperti itu tidak disentuh. Dengan `periksa`, seluruh isi tabel sesudah ditulis dibandingkan dengan isi
// sheet di dalam database; `selisih` adalah jumlah baris yang masih berbeda, dan seharusnya 0.
async function tulisSheet(tx, skema, tabel, judul, headers, rows, sidik, periksa) {
  const nama = `${skema}.${tabel}`;
  await siapkanTabel(tx, skema, tabel, headers);
  const lalu = await tx`SELECT sidik FROM ${tx(skema + '.cermin_header')} WHERE sheet = ${judul}`;
  const ada = (await tx`SELECT count(*)::int AS n FROM ${tx(nama)}`)[0].n;
  const sama = lalu.length > 0 && lalu[0].sidik === sidik && ada === rows.length;
  if (sama && !periksa) return { sama, berubah: 0, dihapus: 0, selisih: null };

  await tx`CREATE TEMP TABLE cermin_baru (baris integer PRIMARY KEY, nilai jsonb NOT NULL, data jsonb NOT NULL) ON COMMIT DROP`;
  for (let i = 0; i < rows.length; i += BARIS_PER_INSERT) {
    const batch = rows.slice(i, i + BARIS_PER_INSERT)
      .map((r) => ({ baris: r.baris, nilai: tx.json(r.nilai), data: tx.json(r.data) }));
    await tx`INSERT INTO cermin_baru ${tx(batch, 'baris', 'nilai', 'data')}`;
  }
  const hapus = await tx`DELETE FROM ${tx(nama)} AS t WHERE NOT EXISTS (SELECT 1 FROM cermin_baru b WHERE b.baris = t.baris)`;
  const tulis = await tx`
    INSERT INTO ${tx(nama)} AS t (baris, nilai, data) SELECT baris, nilai, data FROM cermin_baru
    ON CONFLICT (baris) DO UPDATE SET nilai = EXCLUDED.nilai, data = EXCLUDED.data, sinkron_at = now()
    WHERE t.nilai IS DISTINCT FROM EXCLUDED.nilai OR t.data IS DISTINCT FROM EXCLUDED.data`;
  let selisih = null;
  if (periksa) {
    selisih = (await tx`
      SELECT count(*)::int AS n FROM cermin_baru b FULL JOIN ${tx(nama)} t ON t.baris = b.baris
      WHERE b.baris IS NULL OR t.baris IS NULL OR b.nilai IS DISTINCT FROM t.nilai OR b.data IS DISTINCT FROM t.data`)[0].n;
  }
  return { sama, berubah: tulis.count, dihapus: hapus.count, selisih };
}

// --periksa selalu memeriksa. --periksa=harian hanya kalau rumah ini belum diperiksa pada hari WIB ini,
// dan baru mulai pukul 02.00 WIB.
async function perluPeriksa(sql, skema) {
  if (arg.periksa === true) return true;
  if (arg.periksa !== 'harian') return false;
  const sekarang = wib(new Date());
  if (sekarang.jam < 2) return false;
  const lalu = await sql`SELECT nilai FROM ${sql(skema + '.cermin_meta')} WHERE kunci = 'periksa_terakhir'`;
  return lalu.length === 0 || wib(new Date(lalu[0].nilai)).tanggal < sekarang.tanggal;
}

// Hari berturut-turut (WIB) sampai hari ini yang bersih: ada pemeriksaan, tidak ada selisih,
// dan tidak ada sinkron yang gagal pada hari itu.
function hitungBeruntun(hari) {
  const peta = new Map(hari.map((x) => [x.h, x]));
  let n = 0;
  for (let d = new Date(); ; d = new Date(d.getTime() - 86400e3)) {
    const x = peta.get(wib(d).tanggal);
    if (!x || x.diperiksa === 0 || x.beda > 0 || x.gagal > 0) return n;
    n++;
  }
}

// ── Kunci sinkron maju (db/bersama/cermin_maju.sql, docs/SAKLAR.md) ─────────────────────────────────────────────
// Putaran ini berhenti menulis cermin sebuah rumah bila izin tulis rumah itu terbuka (Supabase satu-satunya penulis),
// atau bila prosedur "Mulai migrasi" sudah mengunci sinkron maju dan putaran ini bukan sinkron terakhir pelaksana
// (--akhir). Tanpa itu, putaran yang membaca sheet sebelum GAS ditutup bisa menulis potret lama sesudah sinkron
// terakhir, atau menimpa tulisan Worker sesudah saklar `supabase`.
class Berhenti extends Error {}

async function bacaKunci(q, skema) {
  // to_jsonb: tetap jalan di basis data yang belum punya kolom maju_dikunci.
  const [r] = await q`SELECT to_jsonb(i) AS z FROM public.cermin_izin_tulis i WHERE i.skema = ${skema}`;
  const z = (r && r.z) || {};
  return { boleh: z.boleh === true, maju: z.maju_dikunci === true };
}

function alasanBerhenti(k) {
  if (k.boleh) return 'migrasi sudah dimulai, Supabase satu-satunya penulis; sinkron maju dari spreadsheet dimatikan (docs/SAKLAR.md).';
  if (k.maju && !arg.akhir) return 'prosedur "Mulai migrasi" sedang berjalan; hanya sinkron terakhir pelaksana (--akhir) yang boleh menulis cermin (docs/SAKLAR.md).';
  return null;
}

// Di awal setiap transaksi yang menulis cermin: kunci BERSAMA per rumah (cermin_kunci_maju dan cermin_atur_izin_tulis
// menunggu sampai transaksi ini selesai, dan transaksi sesudahnya membaca keadaan baru), lalu baca ulang izin.
async function jagaMaju(tx, skema) {
  await tx`SELECT pg_advisory_xact_lock_shared(hashtext(${'cermin_maju:' + skema}))`;
  const sebab = alasanBerhenti(await bacaKunci(tx, skema));
  if (sebab) throw new Berhenti(sebab);
}

// ── Satu rumah ───────────────────────────────────────────────────────────────
async function sinkronRumah(skema) {
  const kering = Boolean(arg.kering);
  const id = wajib(`${skema.toUpperCase()}_SPREADSHEET_ID`);
  idDisamarkan.add(id);
  const lewati = new Set(String(arg.lewati ?? LEWATI_BAWAAN).split(',').map((s) => s.trim()).filter(Boolean));

  const { token, email } = await aksesToken(wajib('GOOGLE_SA_KEY_FILE'));
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}`
    + '?fields=properties(title,timeZone),sheets(properties(title,gridProperties(rowCount)))', token);
  const zona = meta.properties.timeZone;
  if (!arg.ringkas) console.log(`Spreadsheet: "${meta.properties.title}" · skema ${skema} · zona waktu ${zona} · akun layanan ${email}`);
  if (zona !== 'Asia/Jakarta') console.log(`  PERHATIAN: zona waktu spreadsheet ${skema} ${zona}, sedangkan skrip GAS memakai Asia/Jakarta.`);

  const semua = meta.sheets.map((s) => ({
    judul: s.properties.title, grid: s.properties.gridProperties.rowCount, tabel: keTabel(s.properties.title),
  }));
  const target = arg.sheet ? semua.filter((s) => s.judul === arg.sheet) : semua;
  if (arg.sheet && target.length === 0) throw new Error(`sheet "${arg.sheet}" tidak ada di spreadsheet`);
  const kembar = new Set(semua.map((s) => s.tabel).filter((t, i, a) => a.indexOf(t) !== i));

  let sql = null;
  let periksa = false;
  let adaIzin = false;
  if (!kering) {
    const { default: postgres } = await import('postgres');
    sql = postgres(wajib('DATABASE_URL'), { max: 1, prepare: false, ssl: 'require', connect_timeout: 20, onnotice: () => {} });
    try {
      // Setelah tombol "Mulai migrasi" rumah ini (docs/SAKLAR.md), Supabase satu-satunya penulis: sinkron maju dari
      // spreadsheet TIDAK BOLEH menimpa cermin, karena pekerjaan di abadiops akan hilang. Arah sebaliknya adalah tugas
      // cermin balik. Izin tulis dan kunci sinkron maju diatur prosedur di panel (public.cermin_izin_tulis); keduanya
      // dibaca ulang di setiap transaksi sheet (jagaMaju), bukan hanya di sini.
      const [ada] = await sql`SELECT to_regclass('public.cermin_izin_tulis') IS NOT NULL AS ada`;
      adaIzin = ada.ada;
      if (adaIzin) {
        const sebab = alasanBerhenti(await bacaKunci(sql, skema));
        if (sebab) {
          console.log(`${skema}: DILEWATI — ${sebab}`);
          await sql.end({ timeout: 5 }).catch(() => {});
          return true;
        }
      }
      await siapkanSkema(sql, skema);
      periksa = await perluPeriksa(sql, skema);
    } catch (e) {
      await sql.end({ timeout: 5 }).catch(() => {});
      throw e;
    }
  }

  const hasil = [];
  const jumlah = { sama: 0, berubah: 0, dihapus: 0, diperiksa: 0, cocok: 0 };
  let berhenti = null;
  for (const { judul, grid, tabel } of target) {
    const mulaiAt = new Date();
    if (lewati.has(judul)) { hasil.push([judul, '-', 'dilewati (--lewati)']); continue; }
    if (!tabel || tabel.startsWith('cermin_') || kembar.has(tabel)) {
      hasil.push([judul, '-', `GAGAL: nama tabel "${tabel}" kosong, bentrok, atau kembar`]);
      continue;
    }
    try {
      const berumus = SHEET_BERUMUS.test(judul);
      const { headers, rows, tipe, rumus } = await bacaSheet(id, judul, grid, zona, token, { rumus: berumus });
      const sidik = sidikDari(headers, rows);
      let tulis = null;
      let rumusDitulis = false;
      if (!kering) {
        await sql.begin(async (tx) => {
          if (adaIzin) await jagaMaju(tx, skema);
          // Satu penulis per sheet: putaran tiap jam dan sinkron terakhir pelaksana tidak menulis sheet yang sama
          // bersamaan, sehingga periksa di tulisSheet hanya melihat tulisan transaksi ini (tanpa selisih palsu).
          await tx`SELECT pg_advisory_xact_lock(hashtext(${'cermin_sinkron:' + skema + ':' + judul}))`;
          tulis = await tulisSheet(tx, skema, tabel, judul, headers, rows, sidik, periksa);
          if (berumus) rumusDitulis = await tulisRumus(tx, skema, judul, headers, rumus);
          await tx`
            INSERT INTO ${tx(skema + '.cermin_header')} (sheet, tabel, headers, tipe, jumlah_baris, sidik, sinkron_at)
            VALUES (${judul}, ${tabel}, ${headers}, ${tx.json(tipe)}, ${rows.length}, ${sidik}, now())
            ON CONFLICT (sheet) DO UPDATE SET tabel = EXCLUDED.tabel, headers = EXCLUDED.headers,
              tipe = EXCLUDED.tipe, jumlah_baris = EXCLUDED.jumlah_baris, sidik = EXCLUDED.sidik,
              sinkron_at = EXCLUDED.sinkron_at`;
          await tx`INSERT INTO ${tx(skema + '.cermin_log')} (sheet, mulai_at, jumlah_baris, sidik, baris_berubah, baris_dihapus, selisih)
                   VALUES (${judul}, ${mulaiAt}, ${rows.length}, ${sidik}, ${tulis.berubah}, ${tulis.dihapus}, ${tulis.selisih})`;
        });
        if (tulis.sama) jumlah.sama++;
        jumlah.berubah += tulis.berubah;
        jumlah.dihapus += tulis.dihapus;
        if (periksa) {
          jumlah.diperiksa++;
          if (tulis.selisih === 0) jumlah.cocok++;
        }
      }
      if (tulis && tulis.selisih > 0) {
        hasil.push([judul, String(rows.length), `GAGAL: ${tulis.selisih} baris tabel ${tabel} masih berbeda dengan sheet sesudah ditulis`]);
        continue;
      }
      const campur = Object.entries(tipe).filter(([, t]) => t.startsWith('campur')).map(([h]) => h);
      const tulisan = !tulis ? '' : `${tulis.sama ? ' · tidak berubah' : ` · ${tulis.berubah} baris ditulis, ${tulis.dihapus} dihapus`}${periksa ? ' · selisih 0' : ''}`;
      const keteranganRumus = berumus && rumus.length ? ` · ${rumus.length} rumus${rumusDitulis ? ' (ditulis)' : ''}` : '';
      hasil.push([judul, String(rows.length), `${tabel} · ${headers.length} kolom · sidik ${sidik.slice(0, 12)}${tulisan}${keteranganRumus}${campur.length ? ` · tipe campur: ${campur.join(', ')}` : ''}`]);
    } catch (e) {
      // Kunci sinkron maju terpasang di tengah putaran: transaksi sheet ini sudah dibatalkan (tidak ada yang
      // tertulis), dan sheet sisanya tidak disentuh. Bukan kegagalan sinkron, jadi tidak dicatat sebagai galat.
      if (e instanceof Berhenti) { berhenti = e.message; break; }
      hasil.push([judul, '-', `GAGAL: ${e.message}`]);
      if (sql) await sql`INSERT INTO ${sql(skema + '.cermin_log')} (sheet, mulai_at, galat) VALUES (${judul}, ${mulaiAt}, ${e.message})`.catch(() => {});
    }
  }
  if (berhenti) {
    const ditulis = hasil.filter(([, , ket]) => !ket.startsWith('dilewati') && !ket.startsWith('GAGAL')).length;
    console.log(`${skema}: DILEWATI — ${berhenti} Putaran dihentikan sesudah ${ditulis} sheet; sisanya tidak ditulis.`);
    await sql.end({ timeout: 5 }).catch(() => {});
    return true;
  }

  const gagal = hasil.filter(([, , ket]) => ket.startsWith('GAGAL'));
  let beruntun = null;
  if (sql) {
    // `sinkron_terakhir` dan `periksa_terakhir` hanya dicatat kalau putaran penuh dan tidak ada sheet yang gagal.
    const isiMeta = [['spreadsheet_id', id], ['judul', meta.properties.title], ['zona_waktu', zona], ['sheet_dilewati', [...lewati].join(',')]];
    if (!arg.sheet && gagal.length === 0) isiMeta.push(['sinkron_terakhir', new Date().toISOString()]);
    try {
      // Dijaga kunci yang sama dengan transaksi sheet: putaran yang kalah cepat dari kunci prosedur Mulai tidak boleh
      // menimpa catatan sinkron terakhir (periksa_terakhir/periksa_hasil dipakai langkah periksa prosedur).
      await sql.begin(async (tx) => {
        if (adaIzin) await jagaMaju(tx, skema);
        if (periksa) {
          const hari = await tx`
            SELECT to_char(mulai_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS h,
                   count(*) FILTER (WHERE selisih IS NOT NULL)::int AS diperiksa,
                   count(*) FILTER (WHERE selisih > 0)::int AS beda,
                   count(*) FILTER (WHERE galat IS NOT NULL)::int AS gagal
            FROM ${tx(skema + '.cermin_log')} GROUP BY 1`;
          beruntun = hitungBeruntun(hari);
          isiMeta.push(['periksa_hasil', `${jumlah.cocok}/${jumlah.diperiksa} sama`], ['hari_tanpa_selisih', String(beruntun)]);
          if (!arg.sheet && gagal.length === 0) isiMeta.push(['periksa_terakhir', new Date().toISOString()]);
        }
        for (const [k, v] of isiMeta) {
          await tx`INSERT INTO ${tx(skema + '.cermin_meta')} (kunci, nilai, diubah_at) VALUES (${k}, ${v}, now())
                   ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()`;
        }
        await tx`DELETE FROM ${tx(skema + '.cermin_log')} WHERE mulai_at < now() - make_interval(days => ${SIMPAN_LOG_HARI})`;
      });
    } catch (e) {
      if (e instanceof Berhenti) {
        console.log(`${skema}: DILEWATI — ${e.message} Catatan putaran ini (cermin_meta) tidak disimpan.`);
        await sql.end({ timeout: 5 }).catch(() => {});
        return true;
      }
      const baris = ['(cermin_meta)', '-', `GAGAL: ${e.message}`];
      hasil.push(baris);
      gagal.push(baris);
    }
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  if (arg.ringkas) {
    const disalin = hasil.length - gagal.length - hasil.filter(([, , ket]) => ket.startsWith('dilewati')).length;
    const tulisan = kering ? 'kering' : `${jumlah.sama} tidak berubah, ${jumlah.berubah} baris ditulis, ${jumlah.dihapus} dihapus`;
    const periksaan = periksa ? ` · diperiksa ${jumlah.cocok}/${jumlah.diperiksa} sama, ${beruntun ?? '?'} hari berturut-turut tanpa selisih` : '';
    console.log(`${skema}: ${disalin} sheet lulus, ${gagal.length} gagal · ${tulisan}${periksaan}`);
    for (const [s, , ket] of gagal) console.log(`  GAGAL ${s}: ${samarkan(ket.replace(/^GAGAL: /, ''))}`);
  } else {
    console.log(`\n${kering ? 'MODE KERING, tidak ada yang ditulis ke database' : `Tersimpan ke skema ${skema}`}:`);
    for (const [s, n, ket] of hasil) console.log(`  ${s.padEnd(26)} ${n.padStart(7)}  ${ket}`);
    if (periksa) console.log(`Diperiksa: ${jumlah.cocok}/${jumlah.diperiksa} sheet sama persis dengan tabelnya; ${beruntun ?? '?'} hari berturut-turut tanpa selisih.`);
  }
  return gagal.length === 0;
}

// ── Utama ────────────────────────────────────────────────────────────────────
async function utama() {
  const daftar = arg.semua
    ? Object.keys(process.env).map((k) => k.match(/^([A-Z][A-Z0-9_]*)_SPREADSHEET_ID$/)).filter(Boolean).map((m) => m[1].toLowerCase()).sort()
    : [typeof arg.skema === 'string' ? arg.skema : ''];
  if (daftar.length === 0) throw new Error('tidak ada <SKEMA>_SPREADSHEET_ID di lingkungan');
  let lulus = true;
  for (const skema of daftar) {
    if (!/^[a-z][a-z0-9_]*$/.test(skema)) throw new Error('isi --skema, misalnya --skema=sum, atau pakai --semua');
    try {
      if (!(await sinkronRumah(skema))) lulus = false;
    } catch (e) {
      lulus = false;
      console.error(`${skema}: Berhenti: ${samarkan(e.message)}`);
    }
  }
  if (!lulus) process.exitCode = 1;
}

utama().catch((e) => { console.error(`Berhenti: ${samarkan(e.message)}`); process.exit(1); });
