import './muat-env.js';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MODE LURING, DARI UJUNG KE UJUNG
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   npm run uji:luring          (butuh dev server hidup)
 *
 * Yang diuji di sini adalah hal-hal yang TIDAK BISA dibuktikan oleh uji unit,
 * karena jawabannya ada di basis data:
 *
 *   - pekerjaan yang dikirim tanpa sinyal benar-benar sampai saat sinyal pulih
 *   - dan sampainya TEPAT SEKALI, walau antreannya dikosongkan berkali-kali
 *   - kiriman yang ditolak server berhenti dicoba, bukan berputar selamanya
 *   - persetujuan yang menunggu di antrean membekukan uang saat TERKIRIM, dan
 *     selisihnya terhadap yang dilihat approver benar-benar terbaca
 *
 * ── MENGGERAKKAN KODE YANG SUNGGUHAN ────────────────────────────────────────
 * Berkas ini mengimpor `src/pwa/kirim.ts` dan `src/pwa/simpanan.ts` apa adanya,
 * lalu menjalankannya di Node dengan IndexedDB palsu dan `fetch` yang diarahkan
 * ke dev server. Ia TIDAK menulis ulang logikanya — uji yang meniru ulang kode
 * yang diujinya hanya membuktikan bahwa tiruannya sepakat dengan dirinya
 * sendiri.
 */

if (!/:5433\//.test(process.env['DATABASE_URL'] ?? '')) {
  console.error('DITOLAK: uji ini menulis. DATABASE_URL harus port 5433.');
  process.exit(1);
}
const ALAMAT = process.env['UJI_URL'] ?? 'http://localhost:3000';

const { sql } = await import('../src/lib/db.js');
const { buatToken } = await import('../src/lib/auth.js');

let lulus = 0, gagal = 0;
function periksa(nama: string, ok: boolean, catatan = '') {
  if (ok) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama}${catatan ? ` — ${catatan}` : ''}`); }
}

/* ── Orang & token ──────────────────────────────────────────────────────── */
const tokenDibuat: string[] = [];
async function orang(peran: string) {
  const m = (await sql<{ id: number; tenant_id: number; name: string }[]>`
    SELECT id, tenant_id, name FROM mechanics
     WHERE role = ${peran} AND is_active AND is_test_account = false
     ORDER BY id LIMIT 1`)[0]!;
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
const TENANT = mek.tenant_id;

/* ── Peramban tiruan ────────────────────────────────────────────────────────
   `kirim.ts` memanggil `fetch('/api/perintah')` — alamat relatif, yang di Node
   tidak bisa diurai sama sekali. Kalau dibiarkan, `fetch` melempar dan
   `kirim.ts` menganggapnya "luring": seluruh uji akan HIJAU tanpa satu pun
   permintaan pernah berangkat. Jadi alamatnya dilengkapi di sini, berikut
   cookie yang di peramban sungguhan dibawa sendiri. */
const fetchAsli = globalThis.fetch;
let tokenAktif = mek.token;
let daring = true;

globalThis.fetch = ((masukan: string | URL | Request, opsi?: RequestInit) => {
  if (!daring) return Promise.reject(new Error('luring'));
  const alamat = String(masukan);
  const penuh = alamat.startsWith('/') ? `${ALAMAT}${alamat}` : alamat;
  return fetchAsli(penuh, {
    ...opsi,
    headers: { ...(opsi?.headers ?? {}), Cookie: `kmb_token=${tokenAktif}` },
  });
}) as typeof fetch;

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { get onLine() { return daring; } },
});

const { kirimPerintah: kirimAsli, kosongkanAntrean } = await import('../src/pwa/kirim.js');

/* Tiap op_id dicatat supaya pembersihan bisa menghapus TANDA TERIMA milik uji
   ini saja.

   Sebelumnya baris pembersihnya berbunyi `DELETE FROM processed_ops WHERE
   tenant_id = ...` — yang membuang tanda terima milik SELURUH tenant, termasuk
   milik uji lain. Tanda terima itulah yang mencegah kiriman terulang
   melahirkan WO kedua; menghapusnya diam-diam berarti uji berikutnya berjalan
   di atas basis data yang pagarnya baru saja dicabut. */
const opDipakai: string[] = [];
const kirimPerintah: typeof kirimAsli = async (aksi, data, opsi) => {
  const h = await kirimAsli(aksi, data, opsi);
  opDipakai.push(h.opId);
  return h;
};
const { antrean, bacaItem, lupakanKoneksi, simpanKv, bacaKv } =
  await import('../src/pwa/simpanan.js');
const { bedaPratinjau } = await import('../src/pwa/bandingPratinjau.js');

function hpBaru() {
  // "Aplikasi dipasang ulang" — IndexedDB kosong, koneksi dilupakan.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  lupakanKoneksi();
}

/* ── Bahan ──────────────────────────────────────────────────────────────── */
const woDibuat: number[] = [];
async function buatWo(): Promise<number> {
  tokenAktif = l2.token;
  daring = true;
  const job = (await sql<{ id: number }[]>`
    SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
     WHERE s.code = 'workshop' AND j.is_active ORDER BY j.id LIMIT 1`)[0];
  const h = await kirimPerintah('buat_wo', {
    sectionCode: 'workshop',
    blok: [{
      ...(job ? { jobId: Number(job.id) } : {
        manual: { description: 'CONTOH luring', basePoints: 6, targetHours: 3, unitFactor: 1 },
      }),
      workCondition: 'normal', location: 'workshop', teamMechanicIds: [mek.id],
    }],
  });
  if (h.keadaan !== 'berhasil') throw new Error(`gagal menyiapkan WO: ${h.pesan}`);
  const id = Number(((h.hasil?.hasil as { dibuat: { id: number }[] }).dibuat)[0]!.id);
  woDibuat.push(id);
  return id;
}

const JAM = (mundur: number) => new Date(Date.now() - mundur * 3_600_000).toISOString();

try {
  console.log('\n─── 1. WO yang dibuat tanpa sinyal ───');
  hpBaru();
  let opBuat = '';
  {
    tokenAktif = l2.token;
    const sebelum = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM work_orders WHERE tenant_id = ${TENANT}`)[0]!.n;

    daring = false;
    const job = (await sql<{ id: number }[]>`
      SELECT j.id FROM jobs j JOIN sections s ON s.id = j.section_id
       WHERE s.code = 'workshop' AND j.is_active ORDER BY j.id LIMIT 1`)[0];
    const h = await kirimPerintah('buat_wo', {
      sectionCode: 'workshop',
      blok: [{
        ...(job ? { jobId: Number(job.id) } : {
          manual: { description: 'CONTOH luring', basePoints: 6, targetHours: 3, unitFactor: 1 },
        }),
        workCondition: 'normal', location: 'workshop', teamMechanicIds: [mek.id],
      }],
    });
    opBuat = h.opId;

    periksa('dilaporkan ANTRE, bukan gagal', h.keadaan === 'antre', h.keadaan);

    const sesudah = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM work_orders WHERE tenant_id = ${TENANT}`)[0]!.n;
    /* Kalau ini gagal, `fetch`-nya sebenarnya berangkat dan seluruh uji luring
       di bawah tidak menguji apa pun. */
    periksa('TIDAK ada WO yang lahir selagi luring', sesudah === sebelum,
      `${sebelum} → ${sesudah}`);
  }

  console.log('\n─── 2. sinyal pulih ───');
  {
    daring = true;
    const h = await kosongkanAntrean();
    periksa('antrean terkirim', h.terkirim === 1 && h.sisa === 0, JSON.stringify(h));

    const it = await bacaItem(opBuat);
    periksa('itemnya ditandai terkirim', it?.status === 'terkirim', it?.status);

    const n = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM processed_ops WHERE op_id = ${opBuat}`)[0]!.n;
    periksa('server mencatat tanda terimanya', n === 1, String(n));

    const dibuat = (it?.hasil as { hasil?: { dibuat?: { id: number }[] } })?.hasil?.dibuat ?? [];
    periksa('nomor WO-nya pulang bersama jawaban', dibuat.length === 1);
    if (dibuat[0]) woDibuat.push(Number(dibuat[0].id));
  }

  console.log('\n─── 3. antrean dikosongkan berkali-kali ───');
  {
    /* Inilah yang membuat mode luring aman: peramban boleh membangunkan
       background sync kapan saja, dan orang boleh menekan "Kirim sekarang"
       berkali-kali. Tidak satu pun boleh melahirkan WO kedua. */
    const sebelum = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM work_orders WHERE tenant_id = ${TENANT}`)[0]!.n;
    await kosongkanAntrean();
    await kosongkanAntrean();
    const sesudah = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM work_orders WHERE tenant_id = ${TENANT}`)[0]!.n;
    periksa('tidak ada WO kedua yang lahir', sesudah === sebelum, `${sebelum} → ${sesudah}`);
  }

  console.log('\n─── 4. jam kerja yang dikirim tanpa sinyal ───');
  {
    const woId = await buatWo();
    hpBaru();
    tokenAktif = mek.token;

    daring = false;
    const h = await kirimPerintah('kirim_kerja', {
      woId, startTime: JAM(3), endTime: JAM(1),
    }, { ringkas: `WO ${woId}` });
    periksa('masuk antrean', h.keadaan === 'antre', h.keadaan);

    const belum = (await sql<{ s: string }[]>`
      SELECT status::text AS s FROM work_orders WHERE id = ${woId}`)[0]!.s;
    periksa('status WO belum bergerak', belum === 'pending_mechanic_work', belum);

    daring = true;
    await kosongkanAntrean();

    const kini = (await sql<{ s: string; a: string | null }[]>`
      SELECT status::text AS s, actual_hours::text AS a FROM work_orders WHERE id = ${woId}`)[0]!;
    periksa('sesudah sinyal pulih, WO pindah ke meja L1',
      kini.s === 'pending_supervisor', kini.s);
    periksa('jamnya benar-benar tercatat', Number(kini.a) === 2, String(kini.a));
  }

  console.log('\n─── 5. kiriman yang DITOLAK server ───');
  {
    const woId = await buatWo();
    hpBaru();
    tokenAktif = mek.token;
    daring = true;

    // Jam selesai mendahului jam mulai — ditolak dengan alasan yang jelas.
    const h = await kirimPerintah('kirim_kerja', {
      woId, startTime: JAM(1), endTime: JAM(3),
    });
    periksa('dilaporkan DITOLAK, bukan antre', h.keadaan === 'ditolak', h.keadaan);
    periksa('alasannya dibawa apa adanya', !!h.pesan && h.pesan.length > 5, h.pesan);

    const it = await bacaItem(h.opId);
    periksa('ditandai gagal', it?.status === 'gagal', it?.status);
    /* Yang penting: ia TIDAK ikut dicoba lagi. Mengulanginya hanya akan
       ditolak dengan alasan yang sama, selamanya, di tiap background sync. */
    periksa('tidak ikut antrean lagi', (await antrean()).length === 0);
  }

  console.log('\n─── 6. persetujuan yang menunggu di antrean ───');
  {
    const woId = await buatWo();
    tokenAktif = mek.token;
    daring = true;
    await kirimPerintah('kirim_kerja', { woId, startTime: JAM(3), endTime: JAM(1) });
    tokenAktif = l2.token;
    await kirimPerintah('approve_l1', { woId });

    hpBaru();

    /* Angka yang DILIHAT approver di kartu. Sengaja dibuat berbeda dari yang
       nanti dipakai server — itulah yang terjadi kalau admin menyetel ulang
       base point selagi persetujuannya menunggu di antrean. */
    const dilihat = { base_points: 999, unit_factor: 1, actual_hours: 2 };

    daring = false;
    const h = await kirimPerintah('approve_l2', { woId }, { pratinjau: dilihat });
    periksa('persetujuan masuk antrean', h.keadaan === 'antre', h.keadaan);

    const belumBeku = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM scoring_snapshots WHERE work_order_id = ${woId}`)[0]!.n;
    /* Ini yang membuat kalimat di layar approval harus berbunyi "belum
       final": uangnya memang BELUM membeku selama kiriman masih antre. */
    periksa('uang BELUM membeku selagi antre', belumBeku === 0, String(belumBeku));

    daring = true;
    await kosongkanAntrean();

    const beku = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM scoring_snapshots WHERE work_order_id = ${woId}`)[0]!.n;
    periksa('membeku begitu terkirim', beku === 1, String(beku));

    const it = await bacaItem(h.opId);
    const beda = bedaPratinjau(it?.pratinjau, it?.hasil);
    periksa('selisih terhadap yang dilihat approver TERBACA',
      beda.some((b) => b.kunci === 'base_points'),
      JSON.stringify(beda));
    periksa('dan yang berlaku adalah angka server, bukan yang di layar',
      beda.every((b) => String(b.jadi) !== '999'), JSON.stringify(beda));
  }

  console.log('\n─── 7. katalog bertahan sesudah aplikasi ditutup ───');
  {
    hpBaru();
    await simpanKv('katalog', { jobs: [{ id: 1 }], units: [], sections: [], kondisi: [] });
    lupakanKoneksi();   // aplikasi ditutup lalu dibuka lagi
    const k = await bacaKv<{ jobs: unknown[] }>('katalog');
    periksa('katalog masih ada tanpa menyentuh jaringan', (k?.jobs.length ?? 0) === 1);
  }
} finally {
  // ── Bersihkan ────────────────────────────────────────────────────────────
  globalThis.fetch = fetchAsli;
  for (const id of woDibuat) {
    await sql`DELETE FROM mechanic_points WHERE work_order_id = ${id}`;
    await sql`DELETE FROM scoring_snapshots WHERE work_order_id = ${id}`;
    await sql`DELETE FROM approvals WHERE work_order_id = ${id}`;
    await sql`DELETE FROM work_order_team WHERE work_order_id = ${id}`;
    await sql`DELETE FROM audit_logs WHERE entity_type = 'work_order' AND entity_id = ${String(id)}`;
    await sql`DELETE FROM work_orders WHERE id = ${id}`;
  }
  if (opDipakai.length > 0) {
    await sql`DELETE FROM processed_ops WHERE op_id = ANY(${opDipakai}::text[])`;
  }
  for (const t of tokenDibuat) {
    await sql`UPDATE api_tokens SET is_active = false, revoked_at = now() WHERE token = ${t}`;
  }
  console.log(`\n  (${woDibuat.length} WO uji dibersihkan)`);
  await sql.end();
}

console.log(`\n${gagal === 0 ? '✅' : '❌'}  ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
