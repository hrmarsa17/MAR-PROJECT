/**
 * Durable Object untuk Menyimpan Nilai Saklar dan Riwayat Pembalikan
 * Sesuai docs/SAKLAR.md § Panel saklar di abadiops.com
 *
 * Sifat:
 * - Strongly consistent seketika di semua lokasi Cloudflare edge.
 * - Nilai tersimpan persisten di storage Durable Object.
 * - Default posisi awal: 'gas' untuk semua rumah.
 * - Riwayat audit log tersimpan hingga 50 entri terakhir.
 */

export class SaklarDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async getSwitches() {
    let switches = await this.ctx.storage.get('switches');
    if (!switches) {
      switches = {
        kmbprojek: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Posisi bawaan' },
        sum: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Posisi bawaan' },
        kmbtra: { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Posisi bawaan' },
      };
      await this.ctx.storage.put('switches', switches);
    }
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

  async fetch(request, init) {
    const reqUrl = typeof request === 'string' ? request : (request && request.url ? request.url : '');
    const url = new URL(reqUrl, 'https://saklar.internal');
    const action = url.searchParams.get('action');
    const method = (typeof request === 'string' ? init && init.method : request && request.method) || 'GET';

    if (action === 'status') {
      const switches = await this.getSwitches();
      const history = await this.getHistory();
      return new Response(JSON.stringify({ success: true, switches, history }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'ubah' && method === 'POST') {
      let body = {};
      try {
        if (typeof request !== 'string' && request && typeof request.json === 'function') {
          body = await request.json();
        } else if (init && init.body) {
          body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        }
      } catch (_) {
        return new Response(JSON.stringify({ success: false, error: 'Bad JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { rumah, posisi, oleh, alasan } = body;
      const validRumah = ['kmbprojek', 'sum', 'kmbtra'];
      const validPosisi = ['gas', 'dua_cabang', 'supabase'];

      if (!validRumah.includes(rumah)) {
        return new Response(JSON.stringify({ success: false, error: 'Kode rumah tidak sah: ' + rumah }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!validPosisi.includes(posisi)) {
        return new Response(JSON.stringify({ success: false, error: 'Posisi saklar tidak sah: ' + posisi }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const switches = await this.getSwitches();
      const history = await this.getHistory();
      const dari = (switches[rumah] && switches[rumah].posisi) || 'gas';

      // Format waktu WIB
      const now = new Date();
      const waktuWib = now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' WIB';

      switches[rumah] = {
        posisi,
        diubah_at: waktuWib,
        oleh: oleh || 'Gabriel',
        alasan: alasan || 'Pembalikan saklar via Panel Abadi',
      };

      const catatan = {
        waktu_wib: waktuWib,
        timestamp: now.toISOString(),
        rumah,
        dari,
        ke: posisi,
        alasan: alasan || 'Pembalikan saklar via Panel Abadi',
        oleh: oleh || 'Gabriel',
      };

      history.unshift(catatan);
      if (history.length > 50) history.pop();

      await this.ctx.storage.put('switches', switches);
      await this.ctx.storage.put('history', history);

      return new Response(JSON.stringify({ success: true, switches, history, catatan }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Aksi tidak dikenal' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
