/**
 * Tonggak 2: tombol "Mulai migrasi" dan "Kembali ke GAS" (docs/SAKLAR.md, keputusan Gabriel 14 Nov 2026).
 *
 * Prosedur dijalankan Durable Object saklar (saklar-do.js) sebagai mesin langkah yang dimajukan alarm, jadi tidak
 * bergantung pada browser panel tetap terbuka. Modul ini berisi:
 *   - kesehatan cermin per rumah (dibaca dari cermin ASLI: yang dinilai adalah cermin sungguhan);
 *   - rute panel /saklar/api/migrasi/* (hanya sesi panel);
 *   - langkah-langkah prosedur (dipanggil DO).
 *
 * Produksi (LINGKUNGAN bukan "staging"):
 *   mulai   : gas → menutup → GAS terbukti tertutup → sinkron maju dikunci + sinkron terakhir + periksa selisih
 *             (pelaksana GitHub) → cadangan skema jam mulai → izin tulis dibuka → cermin balik awal (penanda, uji hak
 *             Editor, periksa) → supabase
 *   kembali : supabase → membuka → cermin balik terakhir + periksa (pelaksana GitHub) → izin tulis ditutup + sinkron
 *             maju dibuka lagi → gas
 *   Kunci sinkron maju (db/bersama/cermin_maju.sql): sejak langkah sinkron, putaran sinkron tiap jam tidak menulis
 *   cermin rumah itu lagi (hanya sinkron terakhir pelaksana, --akhir), dan izin tulis hanya bisa dibuka sesudahnya.
 *   Tombol mulai terkunci sampai syarat kesehatan hijau, termasuk jalan kembali siap (config/rumah.json
 *   gas.jalan_kembali_siap, diisi sesudah latihan cermin balik). Gagal di tahap mana pun → posisi aman.
 * Staging/ruang uji (LINGKUNGAN = "staging"): simulasi di skema uji_*:
 *   sinkron terakhir = cermin_salin_ke_uji(<skema>), periksa = cermin_bandingkan(<skema>, uji_<skema>),
 *   cermin balik = hanya menghitung sheet yang akan ditulis balik (tidak menulis apa pun).
 */
import PROFIL_RUMAH from '../../../config/rumah.json';

export const POSISI_SAH = ['gas', 'menutup', 'supabase', 'membuka'];
export const HARI_MINIMAL = 7;
export const MENIT_SINKRON_MAKS = 120;

export const diStaging = (env) => String((env && env.LINGKUNGAN) || '').toLowerCase() === 'staging';

export async function rpc(env, nama, args) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase belum diatur di pintu ini.');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nama}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
  });
  const teks = await r.text();
  let j = null;
  try { j = JSON.parse(teks); } catch (_) {}
  if (!r.ok) throw new Error(`${nama}: HTTP ${r.status} ${(j && (j.message || j.error)) || teks.slice(0, 200)}`);
  return j;
}

export function profilMigrasi(kode) {
  const p = PROFIL_RUMAH[String(kode || '').toLowerCase()];
  if (!p || !p.gas || !p.skema) throw new Error(`Rumah ${kode} tidak punya profil GAS asli di config/rumah.json.`);
  return p;
}

// Waktu setempat rumah (SUM WITA, lainnya WIB) untuk catatan jam mulai.
export function jamSetempat(p, d = new Date()) {
  const zona = p.zona_waktu || 'Asia/Jakarta';
  const label = zona === 'Asia/Makassar' ? 'WITA' : zona === 'Asia/Jayapura' ? 'WIT' : 'WIB';
  return d.toLocaleString('id-ID', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' ' + label;
}

/**
 * Kesehatan cermin satu rumah untuk kartu panel dan syarat tombol mulai.
 * Dibaca dari cermin asli <skema> (bukan uji_*), termasuk di staging.
 */
export async function kesehatanRumah(env, kode) {
  const p = profilMigrasi(kode);
  const k = await rpc(env, 'cermin_kesehatan', { p_skema: p.skema });
  const meta = (k && k.meta) || {};
  const nilai = (x) => (meta[x] ? meta[x].nilai : null);
  const hari = Number(nilai('hari_tanpa_selisih') || 0);
  const periksa = String(nilai('periksa_hasil') || '');
  const m = periksa.match(/^(\d+)\/(\d+) sama$/);
  const periksaNol = !!m && m[1] === m[2];
  const sinkron = nilai('sinkron_terakhir');
  const menitSinkron = sinkron ? Math.round((Date.now() - Date.parse(sinkron)) / 60000) : null;
  const syarat = [
    { kunci: 'hari', ok: hari >= HARI_MINIMAL, teks: `Tidak ada selisih ${hari} hari berturut-turut (syarat ${HARI_MINIMAL})` },
    { kunci: 'periksa', ok: periksaNol, teks: `Pemeriksaan selisih terakhir: ${periksa || 'belum ada'}${nilai('periksa_terakhir') ? ` (${jamSetempat(p, new Date(nilai('periksa_terakhir')))})` : ''}` },
    { kunci: 'sinkron', ok: menitSinkron !== null && menitSinkron <= MENIT_SINKRON_MAKS, teks: menitSinkron === null ? 'Belum pernah sinkron' : `Sinkron terakhir ${menitSinkron} menit lalu (maks ${MENIT_SINKRON_MAKS})` },
    { kunci: 'jalan_kembali', ok: !!p.gas.jalan_kembali_siap, teks: p.gas.jalan_kembali_siap ? 'Jalan kembali ke GAS (cermin balik) siap dan sudah dilatih' : 'Jalan kembali ke GAS (cermin balik) belum siap' },
  ];
  return {
    rumah: kode,
    nama: p.nama,
    skema: p.skema,
    zona_waktu: p.zona_waktu || 'Asia/Jakarta',
    hijau: syarat.every((s) => s.ok),
    syarat,
    izin_tulis: (k && k.izin_tulis) || { boleh: false },
    hari_tanpa_selisih: hari,
  };
}

/// ── Langkah prosedur (dipanggil SaklarDO.alarm) ─────────────────────────────────
// Setiap langkah mengembalikan { lanjut: '<tahap berikut>' }, { tunggu: true } (tahap yang sama diulang pada alarm
// berikutnya), { selesai: true, posisi }, atau { gagal: '<sebab>' }. Kegagalan selalu berakhir di posisi aman:
// mulai → gas (belum ada yang ditulis di Supabase), kembali → supabase (Supabase tetap penulis; GAS tidak dibuka
// dengan data yang belum sama). Langkah boleh menyimpan keadaannya di `job` (disimpan DO setiap alarm).
//
// Pekerjaan yang butuh akun layanan Google (sinkron terakhir, cermin balik) diminta lewat public.cermin_permintaan
// (db/bersama/cermin_permintaan.sql) dan dikerjakan pelaksana GitHub Actions (.github/workflows/peralihan.yml).
// Jadwalnya tiap 5 menit, tetapi GitHub nyatanya menjalankannya ±1 jam sekali; karena itu workflow dijalankan manual
// tepat sebelum tombol ditekan (docs/SIAP-MULAI.md), dan putaran yang sudah mengerjakan satu permintaan tetap
// menunggu langkah berikutnya. Pintu tidak memegang kunci Google maupun token GitHub: panel hanya menampilkan
// tautan "Run workflow" (PELAKSANA_URL di wrangler.toml) bila permintaan belum diambil.
export const BATAS_PROSEDUR_MS = { staging: 30 * 60 * 1000, produksi: 90 * 60 * 1000 };
const CEK_GAS_MAKS = 16;   // × 15 detik: GAS menyimpan posisi saklar 30 detik di CacheService
export const MENIT_SARAN_PELAKSANA = 3;
const saranPelaksana = (env) => (env && env.PELAKSANA_URL ? ` Jalankan pelaksana sekarang: ${env.PELAKSANA_URL} → Run workflow.` : '');

export function daftarRumahEnv(env) {
  let r = env && env.RUMAH;
  try { r = typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { r = null; }
  return Array.isArray(r) ? r : [];
}

// Minta satu pekerjaan ke pelaksana lalu tunggu hasilnya. `akhir`: { lanjut } atau { selesai, posisi } bila berhasil.
async function mintaDanTunggu(env, job, p, jenis, akhir) {
  job.permintaan = job.permintaan || {};
  if (!job.permintaan[jenis]) {
    const id = await rpc(env, 'cermin_minta', { p_skema: p.skema, p_jenis: jenis, p_oleh: job.oleh, p_alasan: job.alasan });
    job.permintaan[jenis] = Number(id);
    return { tunggu: true, catatan: `Permintaan ${jenis} #${id} dikirim ke pelaksana (GitHub Actions).` };
  }
  const s = await rpc(env, 'cermin_permintaan_status', { p_id: job.permintaan[jenis] });
  if (!s) return { gagal: `Permintaan ${jenis} #${job.permintaan[jenis]} tidak ditemukan.` };
  if (!s.selesai_at) {
    if (s.mulai_at) return { tunggu: true, catatan: `${jenis} #${s.id} sedang dikerjakan pelaksana.` };
    const menit = Math.floor((Date.now() - Date.parse(s.diminta_at)) / 60000);
    return {
      tunggu: true,
      catatan: menit >= MENIT_SARAN_PELAKSANA
        ? `${jenis} #${s.id} belum diambil pelaksana sejak ${menit} menit lalu.${saranPelaksana(env)}`
        : `${jenis} #${s.id} menunggu diambil pelaksana.`,
    };
  }
  const hasil = String(s.hasil || '').replace(/\s+/g, ' ').slice(-400);
  if (!s.berhasil) return { gagal: `${jenis} #${s.id} gagal: ${hasil}` };
  return { ...akhir, catatan: `${jenis} #${s.id} berhasil: ${hasil}` };
}

// Dipanggil DO sebelum prosedur yang gagal/dibatalkan berakhir di posisi aman: tutup lagi izin tulis yang sudah
// dibuka prosedur mulai, dan batalkan permintaan yang belum diambil pelaksana. Kembalikan catatan (bisa kosong).
export async function pulihkanGagal(env, job) {
  if (diStaging(env)) return '';
  const catatan = [];
  const p = profilMigrasi(job.rumah);
  for (const [jenis, id] of Object.entries(job.permintaan || {})) {
    try {
      if (await rpc(env, 'cermin_permintaan_batal', { p_id: id, p_sebab: `prosedur ${job.jenis} berhenti` })) catatan.push(`permintaan ${jenis} #${id} dibatalkan`);
    } catch (_) {}
  }
  if (job.jenis === 'mulai' && job.izin_dibuka) {
    try {
      await rpc(env, 'cermin_atur_izin_tulis', { p_skema: p.skema, p_boleh: false, p_alasan: `prosedur mulai berhenti: ${job.alasan}`, p_oleh: job.oleh });
      job.izin_dibuka = false;
      catatan.push(`izin tulis ${p.skema} ditutup lagi`);
    } catch (e) {
      catatan.push(`PERHATIAN: izin tulis ${p.skema} gagal ditutup (${e.message}); tutup manual sebelum apa pun`);
    }
  }
  // Prosedur mulai yang berhenti kembali ke `gas`: GAS lagi-lagi satu-satunya penulis, jadi sinkron maju harus jalan
  // lagi. Dilepas juga bila jawaban penguncian tidak sempat diterima (maju_diminta); hanya bisa sesudah izin tertutup.
  if (job.jenis === 'mulai' && (job.maju_dikunci || job.maju_diminta) && !job.izin_dibuka) {
    try {
      await rpc(env, 'cermin_kunci_maju', { p_skema: p.skema, p_kunci: false, p_alasan: `prosedur mulai berhenti: ${job.alasan}`, p_oleh: job.oleh });
      job.maju_dikunci = false;
      job.maju_diminta = false;
      catatan.push(`sinkron maju ${p.skema} jalan lagi`);
    } catch (e) {
      catatan.push(`PERHATIAN: sinkron maju ${p.skema} masih dikunci (${e.message}); lepas manual: SELECT public.cermin_kunci_maju('${p.skema}', false, '<alasan>', '<nama>')`);
    }
  }
  return catatan.join('; ');
}

export async function jalankanLangkah(env, job) {
  const p = profilMigrasi(job.rumah);
  const staging = diStaging(env);
  const uji = `uji_${p.skema}`;
  if (job.jenis === 'mulai') {
    switch (job.tahap) {
      // GAS rumah ini harus benar-benar tertutup (tambalan tutup GAS ter-deploy dan sudah membaca saklar `menutup`)
      // sebelum sinkron terakhir: kalau tidak, GAS terus menerima tulisan sesudah jam mulai dan ada dua penulis.
      case 'cek_gas': {
        if (staging) return { lanjut: 'sinkron', catatan: 'Simulasi: GAS tiruan tidak ditutup (ruang uji).' };
        const r = daftarRumahEnv(env).find((x) => String(x.kode) === job.rumah);
        if (!r || !r.gas) return { gagal: 'Alamat GAS rumah ini tidak ada di RUMAH pintu.' };
        let teks = '';
        try {
          const res = await fetch(r.gas, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }), redirect: 'follow' });
          teks = await res.text();
        } catch (e) { teks = `(tidak terjangkau: ${e.message})`; }
        if (/sudah pindah ke abadiops/i.test(teks)) return { lanjut: 'sinkron', catatan: 'GAS rumah ini sudah tertutup (menjawab "sudah pindah ke abadiops").' };
        job.cek_gas = (job.cek_gas || 0) + 1;
        if (job.cek_gas >= CEK_GAS_MAKS) {
          return { gagal: 'GAS rumah ini belum tertutup sesudah ±4 menit. Tambalan tutup GAS belum ter-deploy (Deploy versi baru dari editor), atau GAS tidak bisa membaca saklar.' };
        }
        return { tunggu: true, catatan: 'Menunggu GAS tertutup (GAS menyimpan posisi saklar 30 detik).' };
      }
      case 'sinkron': {
        if (staging) {
          const s = await rpc(env, 'cermin_salin_ke_uji', { p_skema: p.skema });
          return { lanjut: 'periksa', catatan: `Simulasi sinkron terakhir: ${s.skema} disalin ulang dari ${p.skema} (${s.baris} baris).` };
        }
        // Kunci sinkron maju dulu (db/bersama/cermin_maju.sql): putaran sinkron tiap jam yang sedang menulis ditunggu
        // selesai, dan sesudahnya tidak ada putaran yang menulis cermin rumah ini kecuali sinkron terakhir (--akhir).
        // Tanpa itu, potret spreadsheet dari SEBELUM GAS ditutup bisa tertulis sesudah sinkron terakhir.
        if (!job.maju_dikunci) {
          job.maju_diminta = true;
          const k = await rpc(env, 'cermin_kunci_maju', { p_skema: p.skema, p_kunci: true, p_alasan: job.alasan, p_oleh: job.oleh });
          if (k && k.menunggu) return { tunggu: true, catatan: 'Menunggu putaran sinkron tiap jam yang sedang menulis rumah ini selesai, lalu sinkron maju dikunci.' };
          if (!k || k.maju_dikunci !== true) return { gagal: `Sinkron maju ${p.skema} tidak terkunci (${JSON.stringify(k)}).` };
          if (k.boleh) return { gagal: `Izin tulis ${p.skema} sudah terbuka sebelum sinkron terakhir; periksa keadaan rumah ini dulu.` };
          job.maju_dikunci = true;
          const h = await mintaDanTunggu(env, job, p, 'sinkron_akhir', { lanjut: 'periksa' });
          return { ...h, catatan: `Sinkron maju ${p.skema} dikunci: hanya sinkron terakhir pelaksana yang boleh menulis cermin. ${h.catatan || ''}`.trim() };
        }
        return mintaDanTunggu(env, job, p, 'sinkron_akhir', { lanjut: 'periksa' });
      }
      case 'periksa': {
        if (staging) {
          const b = await rpc(env, 'cermin_bandingkan', { p_a: p.skema, p_b: uji });
          if (!b.nol) return { gagal: `Selisih ${b.beda.length} sheet: ${b.beda.map((x) => x.sheet).join(', ')}` };
          return { lanjut: 'cadangan', catatan: `Periksa selisih: ${b.sama} sheet sama, selisih 0.` };
        }
        // Hasil sinkron terakhir di cermin_meta: diperiksa SESUDAH GAS ditutup, seluruh sheet sama, tanpa sheet dilewati.
        const k = await rpc(env, 'cermin_kesehatan', { p_skema: p.skema });
        const meta = (k && k.meta) || {};
        const nilai = (x) => (meta[x] ? meta[x].nilai : null);
        const waktu = Date.parse(nilai('periksa_terakhir') || '');
        if (!(waktu >= Date.parse(job.mulai_at))) return { gagal: 'Tidak ada pemeriksaan selisih sesudah GAS ditutup.' };
        const hasil = String(nilai('periksa_hasil') || '');
        const m = hasil.match(/^(\d+)\/(\d+) sama$/);
        if (!m || m[1] !== m[2]) return { gagal: `Selisih sesudah sinkron terakhir: ${hasil || 'tidak terbaca'}.` };
        if (nilai('sheet_dilewati')) return { gagal: `Sinkron terakhir melewati sheet ${nilai('sheet_dilewati')}; semua sheet wajib dicermin.` };
        return { lanjut: 'cadangan', catatan: `Periksa selisih sesudah GAS ditutup: ${hasil}.` };
      }
      case 'cadangan': {
        if (staging) return { lanjut: 'buka_tulis', catatan: 'Simulasi: cadangan dilewati (ruang uji).' };
        const c = await rpc(env, 'cermin_cadangkan', { p_skema: p.skema });
        return { lanjut: 'buka_tulis', catatan: `Cadangan jam mulai ${c.skema}: ${c.tabel} tabel, ${c.baris} baris.` };
      }
      case 'buka_tulis': {
        if (staging) return { selesai: true, posisi: 'supabase', catatan: 'Simulasi: ruang uji selalu boleh ditulis.' };
        // Ditandai sebelum dipanggil: bila jawabannya hilang, pemulihan tetap menutupnya (menutup selalu aman).
        job.izin_dibuka = true;
        const r = await rpc(env, 'cermin_atur_izin_tulis', { p_skema: p.skema, p_boleh: true, p_alasan: job.alasan, p_oleh: job.oleh });
        if (r && r.menunggu) return { tunggu: true, catatan: 'Menunggu transaksi sinkron yang masih menulis cermin selesai, lalu izin tulis dibuka.' };
        if (!r || r.boleh !== true) return { gagal: `Izin tulis ${p.skema} tidak terbuka (${JSON.stringify(r)}).` };
        return { lanjut: 'balik_awal', catatan: `Izin tulis ${p.skema} dibuka (saklar masih menutup: belum ada yang menulis).` };
      }
      // Penanda cermin balik + uji hak Editor akun layanan + periksa. Gagal → izin ditutup lagi, saklar ke gas.
      case 'balik_awal':
        return mintaDanTunggu(env, job, p, 'balik_awal', { selesai: true, posisi: 'supabase' });
      default:
        return { gagal: `Tahap tidak dikenal: ${job.tahap}` };
    }
  }
  if (job.jenis === 'kembali') {
    switch (job.tahap) {
      case 'cermin_balik': {
        if (staging) {
          const b = await rpc(env, 'cermin_bandingkan', { p_a: uji, p_b: p.skema });
          return { lanjut: 'tutup_tulis', catatan: `Simulasi cermin balik: ${b.beda.length} sheet akan ditulis balik ke spreadsheet (tidak ada yang ditulis).` };
        }
        // Cermin balik terakhir + periksa seluruh spreadsheet: selisih harus 0 sebelum GAS dibuka lagi.
        return mintaDanTunggu(env, job, p, 'balik_akhir', { lanjut: 'tutup_tulis' });
      }
      case 'tutup_tulis': {
        if (staging) return { selesai: true, posisi: 'gas', catatan: 'Simulasi selesai: GAS dibuka lagi.' };
        await rpc(env, 'cermin_atur_izin_tulis', { p_skema: p.skema, p_boleh: false, p_alasan: job.alasan, p_oleh: job.oleh });
        // Spreadsheet sudah sama dengan cermin (cermin balik terakhir) dan GAS kembali satu-satunya penulis: sinkron
        // maju jalan lagi. Gagal melepas kuncinya tidak menahan GAS dibuka (tidak ada yang hilang), tetapi cermin tidak
        // mengikuti spreadsheet sampai kuncinya dilepas manual.
        let maju = `sinkron maju ${p.skema} jalan lagi`;
        try {
          await rpc(env, 'cermin_kunci_maju', { p_skema: p.skema, p_kunci: false, p_alasan: job.alasan, p_oleh: job.oleh });
        } catch (e) {
          maju = `PERHATIAN: sinkron maju ${p.skema} masih dikunci (${e.message}); lepas manual: SELECT public.cermin_kunci_maju('${p.skema}', false, '<alasan>', '<nama>')`;
        }
        return { selesai: true, posisi: 'gas', catatan: `Izin tulis ${p.skema} ditutup; ${maju}; GAS dibuka lagi.` };
      }
      default:
        return { gagal: `Tahap tidak dikenal: ${job.tahap}` };
    }
  }
  return { gagal: `Jenis prosedur tidak dikenal: ${job.jenis}` };
}

// ── Rute panel ──────────────────────────────────────────────────────────────────
export async function tanganiMigrasi(request, env, url, json, validasiSesi, getSaklarStub, daftarRumah) {
  const valid = await validasiSesi(request, env);
  if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);
  const stub = getSaklarStub(env);
  if (!stub) return json({ success: false, error: 'Durable Object saklar tidak tersedia.' }, 500);

  if (url.pathname === '/saklar/api/migrasi/kesehatan' && request.method === 'GET') {
    const hasil = [];
    for (const r of daftarRumah(env)) {
      try {
        hasil.push(await kesehatanRumah(env, r.kode));
      } catch (e) {
        hasil.push({ rumah: r.kode, hijau: false, galat: e.message, syarat: [] });
      }
    }
    return json({ success: true, staging: diStaging(env), rumah: hasil });
  }

  if (url.pathname === '/saklar/api/migrasi/status' && request.method === 'GET') {
    const r = await stub.fetch('https://saklar.internal/?action=migrasi_status');
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  if ((url.pathname === '/saklar/api/migrasi/mulai' || url.pathname === '/saklar/api/migrasi/kembali') && request.method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) { return json({ success: false, error: 'Format JSON salah' }, 400); }
    const rumah = String(body.rumah || '').toLowerCase();
    const alasan = String(body.alasan || '').trim();
    if (!rumah || !alasan) return json({ success: false, error: 'Rumah dan alasan wajib diisi.' }, 400);
    if (String(body.konfirmasi || '').trim().toLowerCase() !== rumah) {
      return json({ success: false, error: `Ketik kode rumah "${rumah}" persis sebagai konfirmasi.` }, 400);
    }
    const jenis = url.pathname.endsWith('/mulai') ? 'mulai' : 'kembali';
    let kesehatan = null;
    if (jenis === 'mulai') {
      try { kesehatan = await kesehatanRumah(env, rumah); } catch (e) { return json({ success: false, error: `Kesehatan cermin tidak terbaca: ${e.message}` }, 503); }
      // Produksi: semua syarat wajib hijau. Staging: simulasi boleh jalan walau belum hijau (dicatat).
      if (!kesehatan.hijau && !diStaging(env)) {
        return json({ success: false, error: 'Belum boleh mulai: ' + kesehatan.syarat.filter((s) => !s.ok).map((s) => s.teks).join('; '), kesehatan }, 409);
      }
    } else if (!diStaging(env) && !profilMigrasi(rumah).gas.jalan_kembali_siap) {
      return json({ success: false, error: 'Jalan kembali (cermin balik) belum siap di produksi.' }, 409);
    }
    const r = await stub.fetch(`https://saklar.internal/?action=migrasi_${jenis}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rumah, alasan, oleh: body.oleh || 'Gabriel', hijau: kesehatan ? kesehatan.hijau : null }),
    });
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  return json({ success: false, error: 'Rute migrasi tidak dikenal' }, 404);
}
