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
 *   mulai   : gas → menutup → cadangan skema → sinkron terakhir + periksa selisih → izin tulis dibuka → supabase
 *   kembali : supabase → membuka → cermin balik terakhir → periksa → izin tulis ditutup → gas
 *   Tombol mulai terkunci sampai jalan kembali siap (config/rumah.json gas.jalan_kembali_siap). Sinkron terakhir
 *   lewat GitHub dan cermin balik belum dipasang: langkah itu gagal tertutup (kembali ke posisi aman).
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

// ── Langkah prosedur (dipanggil SaklarDO.alarm) ─────────────────────────────────
// Setiap langkah mengembalikan { lanjut: '<tahap berikut>' } atau { selesai: true, posisi } atau
// { gagal: '<sebab>' }. Kegagalan selalu berakhir di posisi aman: mulai → gas (belum ada yang ditulis di
// Supabase), kembali → supabase (Supabase tetap penulis; GAS tidak dibuka dengan data yang belum sama).
export async function jalankanLangkah(env, job) {
  const p = profilMigrasi(job.rumah);
  const staging = diStaging(env);
  const uji = `uji_${p.skema}`;
  if (job.jenis === 'mulai') {
    switch (job.tahap) {
      case 'cadangan': {
        if (staging) return { lanjut: 'sinkron', catatan: 'Simulasi: cadangan dilewati (ruang uji).' };
        const c = await rpc(env, 'cermin_cadangkan', { p_skema: p.skema });
        return { lanjut: 'sinkron', catatan: `Cadangan ${c.skema}: ${c.tabel} tabel, ${c.baris} baris.` };
      }
      case 'sinkron': {
        if (staging) {
          const s = await rpc(env, 'cermin_salin_ke_uji', { p_skema: p.skema });
          return { lanjut: 'periksa', catatan: `Simulasi sinkron terakhir: ${s.skema} disalin ulang dari ${p.skema} (${s.baris} baris).` };
        }
        return { gagal: 'Sinkron terakhir lewat GitHub belum dipasang di produksi.' };
      }
      case 'periksa': {
        if (staging) {
          const b = await rpc(env, 'cermin_bandingkan', { p_a: p.skema, p_b: uji });
          if (!b.nol) return { gagal: `Selisih ${b.beda.length} sheet: ${b.beda.map((x) => x.sheet).join(', ')}` };
          return { lanjut: 'buka_tulis', catatan: `Periksa selisih: ${b.sama} sheet sama, selisih 0.` };
        }
        return { gagal: 'Periksa selisih produksi belum dipasang.' };
      }
      case 'buka_tulis': {
        if (!staging) {
          await rpc(env, 'cermin_atur_izin_tulis', { p_skema: p.skema, p_boleh: true, p_alasan: job.alasan, p_oleh: job.oleh });
        }
        return { selesai: true, posisi: 'supabase', catatan: staging ? 'Simulasi: ruang uji selalu boleh ditulis.' : `Izin tulis ${p.skema} dibuka.` };
      }
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
        return { gagal: 'Cermin balik belum dipasang di produksi.' };
      }
      case 'tutup_tulis': {
        if (!staging) {
          await rpc(env, 'cermin_atur_izin_tulis', { p_skema: p.skema, p_boleh: false, p_alasan: job.alasan, p_oleh: job.oleh });
        }
        return { selesai: true, posisi: 'gas', catatan: staging ? 'Simulasi selesai: GAS dibuka lagi.' : `Izin tulis ${p.skema} ditutup; GAS dibuka lagi.` };
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
