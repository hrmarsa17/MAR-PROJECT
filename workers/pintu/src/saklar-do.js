/**
 * Durable Object untuk Menyimpan Nilai Saklar dan Riwayat Pembalikan
 * Sesuai docs/SAKLAR.md (rancangan 14 Nov 2026)
 *
 * Sifat:
 * - Strongly consistent seketika di semua lokasi Cloudflare edge.
 * - Nilai tersimpan persisten di storage Durable Object.
 * - Default posisi awal: 'gas' untuk semua rumah.
 * - Riwayat audit log tersimpan hingga 50 entri terakhir.
 * - Buku tamu kiriman (tabel SQLite buku_tamu): hanya untuk Worker rumah lewat ikatan Durable Object.
 * - Prosedur "Mulai migrasi" dan "Kembali ke GAS" (src/migrasi.js) berjalan sebagai mesin langkah yang dimajukan
 *   alarm Durable Object: tidak bergantung pada browser panel tetap terbuka.
 *
 * Posisi: gas | menutup | supabase | membuka. `menutup` dan `membuka` adalah posisi peralihan (tidak ada penulis).
 * Produksi: posisi hanya berpindah lewat prosedur; ubah manual hanya untuk membatalkan `menutup` kembali ke `gas`
 * (belum ada yang ditulis di Supabase). Staging: ubah manual bebas, untuk menyiapkan uji.
 */
import { POSISI_SAH, jalankanLangkah, pulihkanGagal, profilMigrasi, jamSetempat, diStaging, BATAS_PROSEDUR_MS } from './migrasi.js';

// Umur catatan buku tamu. Kiriman yang dikirim ulang lebih dari 30 hari kemudian diproses seperti kiriman baru.
const UMUR_BUKU_TAMU_MS = 30 * 24 * 60 * 60 * 1000;
const RIWAYAT_PROSEDUR = 20;
// Batas waktu satu prosedur (lewat dari ini, prosedur gagal ke posisi aman): produksi menunggu pelaksana GitHub.
const batasProsedurMs = (env) => (diStaging(env) ? BATAS_PROSEDUR_MS.staging : BATAS_PROSEDUR_MS.produksi);

const jsonResp = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

function waktuWib(d = new Date()) {
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) + ' WIB';
}

async function bacaBadan(request, init) {
  if (typeof request !== 'string' && request && typeof request.json === 'function') return request.json();
  if (init && init.body) return typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  return {};
}

export class SaklarDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  // Kode kamar yang aktif, dari RUMAH di wrangler.toml pintu (lingkungan Worker ini).
  kodeRumah() {
    let r = this.env && this.env.RUMAH;
    try { r = typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { r = null; }
    return Array.isArray(r) ? r.map((x) => String(x.kode)) : [];
  }

  // Saklar setiap kamar aktif. Kamar yang baru ditambahkan ke RUMAH otomatis mendapat posisi bawaan 'gas'.
  async getSwitches() {
    const tersimpan = (await this.ctx.storage.get('switches')) || {};
    const switches = {};
    let baru = false;
    for (const kode of this.kodeRumah()) {
      if (tersimpan[kode]) {
        switches[kode] = tersimpan[kode];
      } else {
        switches[kode] = { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Posisi bawaan' };
        baru = true;
      }
    }
    if (baru) await this.ctx.storage.put('switches', { ...tersimpan, ...switches });
    return switches;
  }

  async getHistory() {
    let history = await this.ctx.storage.get('history');
    if (!history) {
      history = [];
      await this.ctx.storage.put('history', history);
    }
    return history;
  }

  // Pindahkan posisi satu rumah dan catat riwayatnya. `tambahan` ikut disimpan di saklar (mis. jam mulai).
  async aturPosisi(rumah, posisi, oleh, alasan, tambahan = {}) {
    const switches = await this.getSwitches();
    const history = await this.getHistory();
    const dari = (switches[rumah] && switches[rumah].posisi) || 'gas';
    const now = new Date();
    const wib = waktuWib(now);
    switches[rumah] = { ...(switches[rumah] || {}), ...tambahan, posisi, diubah_at: wib, oleh: oleh || 'Gabriel', alasan: alasan || 'Pembalikan saklar via Panel Abadi' };
    const catatan = { waktu_wib: wib, timestamp: now.toISOString(), rumah, dari, ke: posisi, alasan: switches[rumah].alasan, oleh: switches[rumah].oleh };
    history.unshift(catatan);
    if (history.length > 50) history.pop();
    await this.ctx.storage.put('switches', switches);
    await this.ctx.storage.put('history', history);
    return { switches, history, catatan };
  }

  // Tabel buku tamu, sekali per instance. Catatan model lama (kunci 'op:<op_id>' tanpa rumah, pemilik,
  // dan umur) tidak terbaca lagi oleh kode ini, jadi dibuang sekalian.
  async siapkanBukuTamu() {
    if (this.bukuTamuSiap) return;
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS buku_tamu (
      rumah     TEXT    NOT NULL,
      op_id     TEXT    NOT NULL,
      pemilik   TEXT    NOT NULL,
      hasil     TEXT    NOT NULL,
      dibuat_at INTEGER NOT NULL,
      PRIMARY KEY (rumah, op_id)
    )`);
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS buku_tamu_umur ON buku_tamu (dibuat_at)');
    for (;;) {
      const lama = await this.ctx.storage.list({ prefix: 'op:', limit: 128 });
      if (lama.size === 0) break;
      await this.ctx.storage.delete([...lama.keys()]);
    }
    this.bukuTamuSiap = true;
  }

  // ── Prosedur migrasi ──────────────────────────────────────────────────────────
  async bacaProsedur() {
    return (await this.ctx.storage.get('prosedur')) || { aktif: {}, riwayat: [] };
  }

  async simpanProsedur(pr) {
    await this.ctx.storage.put('prosedur', pr);
  }

  async jadwalkan(ms) {
    const sekarang = await this.ctx.storage.getAlarm();
    const target = Date.now() + ms;
    if (!sekarang || sekarang > target) await this.ctx.storage.setAlarm(target);
  }

  async mulaiProsedur(jenis, body) {
    const rumah = String(body.rumah || '').toLowerCase();
    if (!this.kodeRumah().includes(rumah)) return jsonResp({ success: false, error: 'Kode rumah tidak dikenal: ' + rumah }, 400);
    try { profilMigrasi(rumah); } catch (e) { return jsonResp({ success: false, error: e.message }, 400); }
    const pr = await this.bacaProsedur();
    if (pr.aktif[rumah]) return jsonResp({ success: false, error: `Prosedur ${pr.aktif[rumah].jenis} rumah ini masih berjalan.` }, 409);
    const switches = await this.getSwitches();
    const kini = (switches[rumah] && switches[rumah].posisi) || 'gas';
    const harus = jenis === 'mulai' ? 'gas' : 'supabase';
    if (kini !== harus) return jsonResp({ success: false, error: `Posisi sekarang "${kini}"; prosedur ${jenis} hanya dari "${harus}".` }, 409);
    const job = {
      id: `${rumah}-${Date.now()}`,
      rumah, jenis,
      tahap: jenis === 'mulai' ? 'cek_gas' : 'cermin_balik',
      status: 'jalan',
      oleh: String(body.oleh || 'Gabriel'),
      alasan: String(body.alasan || ''),
      simulasi: diStaging(this.env),
      hijau_saat_mulai: body.hijau,
      mulai_at: new Date().toISOString(),
      batas_at: new Date(Date.now() + batasProsedurMs(this.env)).toISOString(),
      langkah: [],
    };
    const posisiPeralihan = jenis === 'mulai' ? 'menutup' : 'membuka';
    job.langkah.push({ waktu: waktuWib(), tahap: 'mulai', ok: true, pesan: `Saklar → ${posisiPeralihan}: tidak ada penulis, kiriman HP ditahan.${job.simulasi ? ' (simulasi ruang uji)' : ''}` });
    await this.aturPosisi(rumah, posisiPeralihan, job.oleh, `${job.alasan} (prosedur ${jenis})`);
    pr.aktif[rumah] = job;
    await this.simpanProsedur(pr);
    await this.jadwalkan(500);
    return jsonResp({ success: true, job });
  }

  async selesaikan(pr, job, status, posisi, pesan, tambahanSaklar = {}) {
    job.status = status;
    job.selesai_at = new Date().toISOString();
    job.langkah.push({ waktu: waktuWib(), tahap: status, ok: status === 'selesai', pesan });
    await this.aturPosisi(job.rumah, posisi, job.oleh, `${job.alasan} (prosedur ${job.jenis} ${status})`, tambahanSaklar);
    delete pr.aktif[job.rumah];
    pr.riwayat.unshift(job);
    if (pr.riwayat.length > RIWAYAT_PROSEDUR) pr.riwayat.length = RIWAYAT_PROSEDUR;
  }

  async alarm() {
    const pr = await this.bacaProsedur();
    for (const rumah of Object.keys(pr.aktif)) {
      const job = pr.aktif[rumah];
      const posisiAman = job.jenis === 'mulai' ? 'gas' : 'supabase';
      if (Date.now() > Date.parse(job.batas_at)) {
        const pulih = await pulihkanGagal(this.env, job).catch((e) => `pemulihan gagal: ${e.message}`);
        await this.selesaikan(pr, job, 'gagal', posisiAman, `Melewati batas waktu ${Math.round(batasProsedurMs(this.env) / 60000)} menit di tahap ${job.tahap}; saklar kembali ke ${posisiAman}.${pulih ? ` (${pulih})` : ''}`);
        continue;
      }
      let h;
      try {
        h = await jalankanLangkah(this.env, job);
      } catch (e) {
        h = { gagal: e.message };
      }
      if (h.gagal) {
        const pulih = await pulihkanGagal(this.env, job).catch((e) => `pemulihan gagal: ${e.message}`);
        await this.selesaikan(pr, job, 'gagal', posisiAman, `Gagal di tahap ${job.tahap}: ${h.gagal} Saklar kembali ke ${posisiAman}.${pulih ? ` (${pulih})` : ''}`);
      } else if (h.tunggu) {
        // Tahap yang sama diulang pada alarm berikutnya. Catatan hanya ditulis bila berubah, supaya riwayat tidak penuh.
        if (h.catatan && h.catatan !== job.menunggu) {
          job.langkah.push({ waktu: waktuWib(), tahap: job.tahap, ok: true, pesan: h.catatan });
          job.menunggu = h.catatan;
        }
      } else if (h.selesai) {
        const p = profilMigrasi(rumah);
        const tambahan = job.jenis === 'mulai'
          ? { jam_mulai: jamSetempat(p), jam_mulai_iso: new Date().toISOString(), zona_waktu: p.zona_waktu || 'Asia/Jakarta', simulasi: job.simulasi }
          : { jam_kembali: jamSetempat(p), jam_kembali_iso: new Date().toISOString() };
        job.langkah.push({ waktu: waktuWib(), tahap: job.tahap, ok: true, pesan: h.catatan || '' });
        await this.selesaikan(pr, job, 'selesai', h.posisi,
          job.jenis === 'mulai' ? `Migrasi dimulai pukul ${tambahan.jam_mulai}. Saklar → supabase.` : `Kembali ke GAS pukul ${tambahan.jam_kembali}. Saklar → gas.`, tambahan);
      } else {
        job.langkah.push({ waktu: waktuWib(), tahap: job.tahap, ok: true, pesan: h.catatan || '' });
        job.tahap = h.lanjut;
        job.menunggu = null;
      }
    }
    await this.simpanProsedur(pr);
    if (Object.keys(pr.aktif).length) await this.jadwalkan(diStaging(this.env) ? 1000 : 15000);
  }

  async fetch(request, init) {
    const reqUrl = typeof request === 'string' ? request : (request && request.url ? request.url : '');
    const url = new URL(reqUrl, 'https://saklar.internal');
    const action = url.searchParams.get('action');
    const method = (typeof request === 'string' ? init && init.method : request && request.method) || 'GET';

    if (action === 'status') {
      const switches = await this.getSwitches();
      const history = await this.getHistory();
      const pr = await this.bacaProsedur();
      return jsonResp({ success: true, switches, history, prosedur: pr.aktif });
    }

    if (action === 'migrasi_status') {
      const switches = await this.getSwitches();
      const pr = await this.bacaProsedur();
      return jsonResp({ success: true, switches, aktif: pr.aktif, riwayat: pr.riwayat });
    }

    if ((action === 'migrasi_mulai' || action === 'migrasi_kembali') && method === 'POST') {
      let body = {};
      try { body = await bacaBadan(request, init); } catch (_) { return jsonResp({ success: false, error: 'Bad JSON' }, 400); }
      return this.mulaiProsedur(action === 'migrasi_mulai' ? 'mulai' : 'kembali', body);
    }

    // Buku Tamu Kiriman (docs/SAKLAR.md). Hanya dipanggil Worker rumah lewat ikatan Durable Object;
    // pintu tidak punya rute publik untuknya. Catatan dikunci per rumah + op_id, dan hasilnya hanya
    // diberikan kepada pemilik token yang sama (sidik SHA-256 token, bukan tokennya).
    if ((action === 'buku_tamu_cek' || action === 'buku_tamu_simpan') && method === 'POST') {
      let body = {};
      try { body = await bacaBadan(request, init); } catch (_) {}
      const rumah = String(body.rumah || '').trim();
      const opId = String(body.op_id || '').trim();
      const pemilik = String(body.pemilik || '').trim();
      if (!rumah || !opId || !/^[0-9a-f]{64}$/.test(pemilik)) {
        return jsonResp({ success: false, error: 'rumah, op_id, dan sidik pemilik wajib' }, 400);
      }
      await this.siapkanBukuTamu();
      const sql = this.ctx.storage.sql;
      const batas = Date.now() - UMUR_BUKU_TAMU_MS;
      if (action === 'buku_tamu_cek') {
        const baris = sql.exec('SELECT pemilik, hasil, dibuat_at FROM buku_tamu WHERE rumah = ? AND op_id = ?', rumah, opId).toArray()[0];
        if (!baris || baris.dibuat_at < batas || baris.pemilik !== pemilik) return jsonResp({ found: false });
        const record = { op_id: opId, rumah, result: JSON.parse(baris.hasil), timestamp: new Date(baris.dibuat_at).toISOString() };
        return jsonResp({ found: true, record });
      }
      // Catatan pertama yang menang, seperti ProcessedOps. Catatan kedaluwarsa dibuang lebih dulu.
      sql.exec('DELETE FROM buku_tamu WHERE dibuat_at < ?', batas);
      sql.exec('INSERT OR IGNORE INTO buku_tamu (rumah, op_id, pemilik, hasil, dibuat_at) VALUES (?, ?, ?, ?, ?)',
        rumah, opId, pemilik, JSON.stringify(body.result === undefined ? null : body.result), Date.now());
      return jsonResp({ success: true });
    }

    if (action === 'ubah' && method === 'POST') {
      let body = {};
      try { body = await bacaBadan(request, init); } catch (_) { return jsonResp({ success: false, error: 'Bad JSON' }, 400); }
      const { rumah, posisi, oleh, alasan } = body;
      if (!rumah || typeof rumah !== 'string') return jsonResp({ success: false, error: 'Kode rumah wajib diisi' }, 400);
      if (!POSISI_SAH.includes(posisi)) return jsonResp({ success: false, error: 'Posisi saklar tidak sah: ' + posisi }, 400);
      if (!this.kodeRumah().includes(rumah)) return jsonResp({ success: false, error: 'Kode rumah tidak dikenal: ' + rumah }, 400);

      const pr = await this.bacaProsedur();
      const switches = await this.getSwitches();
      const kini = (switches[rumah] && switches[rumah].posisi) || 'gas';
      if (!diStaging(this.env)) {
        // Produksi: pindah ke supabase/membuka/menutup hanya lewat prosedur. Manual hanya membatalkan `menutup`
        // (belum ada yang ditulis di Supabase) kembali ke `gas`.
        if (!(posisi === 'gas' && (kini === 'gas' || kini === 'menutup'))) {
          return jsonResp({ success: false, error: `Di produksi saklar hanya berpindah lewat tombol "Mulai migrasi" / "Kembali ke GAS". Ubah manual hanya untuk membatalkan "menutup" ke "gas" (sekarang "${kini}").` }, 409);
        }
      }
      if (pr.aktif[rumah]) {
        const job = pr.aktif[rumah];
        // Ke gas dari prosedur mulai: izin tulis yang sudah dibuka ditutup lagi, permintaan yang belum diambil dibatalkan.
        const pulih = await pulihkanGagal(this.env, job).catch((e) => `pemulihan gagal: ${e.message}`);
        job.status = 'dibatalkan';
        job.selesai_at = new Date().toISOString();
        job.langkah.push({ waktu: waktuWib(), tahap: 'dibatalkan', ok: false, pesan: `Dibatalkan lewat ubah manual ke ${posisi}.${pulih ? ` (${pulih})` : ''}` });
        delete pr.aktif[rumah];
        pr.riwayat.unshift(job);
        if (pr.riwayat.length > RIWAYAT_PROSEDUR) pr.riwayat.length = RIWAYAT_PROSEDUR;
        await this.simpanProsedur(pr);
      }
      const h = await this.aturPosisi(rumah, posisi, oleh, alasan);
      return jsonResp({ success: true, ...h });
    }

    return jsonResp({ success: false, error: 'Aksi tidak dikenal' }, 404);
  }
}
