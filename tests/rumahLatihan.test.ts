import { afterEach, describe, expect, it, vi } from 'vitest';
import PROFIL_RUMAH, { adalahLatihan, AWALAN_LATIHAN } from '../workers/bersama/profil-rumah.js';
import ASLI from '../config/rumah.json';
import pintu from '../workers/pintu/src/index.js';
import { kesehatanRumah } from '../workers/pintu/src/migrasi.js';
import { buatWorkerRumah, PESAN_TUTUP_GAS } from '../workers/bersama/gas-rumah.js';

/**
 * RUMAH LATIHAN — uji kering prosedur Mulai migrasi / Kembali ke GAS di PRODUKSI (keputusan Gabriel 15 Nov 2026).
 * Kembaran latihan_<kode> setiap rumah asli: kode GAS dan aturan sama, data = salinan spreadsheet di skema
 * latihan_<skema>. Yang paling penting di berkas ini: rumah latihan TIDAK BOLEH ikut mengenali token pengguna,
 * karena salinan memuat token mekanik sungguhan (token terdaftar di dua rumah → login ditolak).
 */

const P: any = PROFIL_RUMAH;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('profil rumah latihan diturunkan dari rumah asli', () => {
  it('setiap rumah asli punya kembaran latihan_<kode> dengan skema latihan_<skema>', () => {
    for (const [kode, p] of Object.entries(ASLI as any)) {
      if (!p || !(p as any).gas) continue;
      const l = P[AWALAN_LATIHAN + kode];
      expect(l, kode).toBeTruthy();
      expect(l.skema).toBe(`latihan_${(p as any).skema}`);
      expect(l.latihan).toBe(true);
      expect(l.rumah_asli).toBe(kode);
      expect(l.nama).toBe(`${(p as any).nama} (LATIHAN)`);
      expect(l.gas.jalan_kembali_siap).toBe(true);
      // Kode dan aturan GAS sama persis dengan rumah asli (ikut berubah bila rumah asli berubah).
      expect(l.gas.aksi_worker).toEqual((p as any).gas.aksi_worker);
      expect(l.gas.aksi_tulis_worker).toEqual((p as any).gas.aksi_tulis_worker);
      expect(l.gas.versi).toBe((p as any).gas.versi);
      expect(adalahLatihan(AWALAN_LATIHAN + kode)).toBe(true);
      expect(adalahLatihan(kode)).toBe(false);
    }
  });
  it('profil rumah asli tidak berubah', () => {
    expect(P.kmbbupr).toBe((ASLI as any).kmbbupr);
    expect(P.kmbbupr.latihan).toBeUndefined();
    expect(P.kmbbupr.skema).toBe('kmbbupr');
  });
});

describe('pintu: rumah latihan tidak ikut mengenali token pengguna', () => {
  const GAS_ASLI = 'https://gas.uji/asli/exec';
  const GAS_LATIHAN = 'https://latihan-kmbbupr.uji/gas-tiruan';
  const env = {
    RUMAH: [
      { kode: 'kmbbupr', nama: 'BUPR', gas: GAS_ASLI, alamat: 'https://kmbbupr.uji/' },
      { kode: 'latihan_kmbbupr', nama: 'BUPR (LATIHAN)', gas: GAS_LATIHAN, alamat: 'https://latihan-kmbbupr.uji/' },
    ],
  };
  it('token yang juga ada di salinan tetap masuk ke rumah asli, dan GAS latihan tidak pernah ditanya', async () => {
    const dipanggil: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      dipanggil.push(String(url));
      // Keduanya akan menjawab "sah" bila ditanya: salinan memuat token yang sama.
      return new Response(JSON.stringify({ success: true, result: { name: 'Mekanik Uji' } }));
    }));
    const r = await pintu.fetch(new Request('https://abadiops.uji/api/pintu', { method: 'POST', body: JSON.stringify({ token: 'kmbp-token-uji' }) }), env as any);
    const j: any = await r.json();
    expect(j.success).toBe(true);
    expect(j.rumah).toBe('kmbbupr');
    expect(dipanggil).toContain(GAS_ASLI);
    expect(dipanggil.some((u) => u.includes('latihan'))).toBe(false);
  });
});

describe('kesehatan rumah latihan (syarat tombol Mulai)', () => {
  const pasangKesehatan = (meta: Record<string, string>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!/\/rpc\/cermin_kesehatan$/.test(String(url))) throw new Error('RPC tak terduga ' + url);
    return new Response(JSON.stringify({ meta: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { nilai: v }])) }));
  }));
  const env = { SUPABASE_URL: 'https://supa.uji', SUPABASE_SERVICE_ROLE_KEY: 'kunci-uji' };
  it('rumah latihan: syarat 7 hari dan umur sinkron tidak berlaku; periksa selisih tetap wajib', async () => {
    pasangKesehatan({ hari_tanpa_selisih: '0', periksa_hasil: '24/24 sama', periksa_terakhir: '2026-11-15T09:00:00.000Z', sinkron_terakhir: '2026-11-10T00:00:00.000Z' });
    const k = await kesehatanRumah(env, 'latihan_kmbbupr');
    expect(k.skema).toBe('latihan_kmbbupr');
    expect(k.hijau).toBe(true);
    pasangKesehatan({ hari_tanpa_selisih: '0', periksa_hasil: '23/24 sama', sinkron_terakhir: '2026-11-10T00:00:00.000Z' });
    const k2 = await kesehatanRumah(env, 'latihan_kmbbupr');
    expect(k2.hijau).toBe(false);
    expect(k2.syarat.filter((s: any) => !s.ok).map((s: any) => s.kunci)).toEqual(['periksa']);
  });
  it('rumah asli tetap wajib 7 hari', async () => {
    pasangKesehatan({ hari_tanpa_selisih: '3', periksa_hasil: '24/24 sama', periksa_terakhir: new Date().toISOString(), sinkron_terakhir: new Date().toISOString() });
    const k = await kesehatanRumah(env, 'kmbbupr');
    expect(k.hijau).toBe(false);
    expect(k.syarat.filter((s: any) => !s.ok).map((s: any) => s.kunci)).toEqual(['hari']);
  });
});

describe('GAS tiruan rumah latihan (/gas-tiruan)', () => {
  const bundel = { gasKamar: () => ({}), INFO: { versi: 11, zonaSkrip: 'Asia/Jakarta' }, HTML: {} };
  const worker = buatWorkerRumah(bundel);
  const envDengan = (rumah: string, posisi: string) => ({
    RUMAH: rumah,
    GAS_URL: 'https://latihan-kmbbupr.uji/gas-tiruan',
    PINTU: { fetch: async () => new Response(JSON.stringify({ success: true, switches: { [rumah]: posisi } })) },
    ASSETS: { fetch: async () => new Response('aset', { status: 404 }) },
  });
  const ping = (env: any) => worker.fetch(new Request('https://latihan-kmbbupr.uji/gas-tiruan', { method: 'POST', body: JSON.stringify({ action: 'ping' }) }), env, {} as any);
  it('saklar gas: menjawab seperti GAS untuk token tidak sah; posisi lain: "sudah pindah ke abadiops"', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T01:00:00Z'));
    let j: any = await (await ping(envDengan('latihan_kmbbupr', 'gas'))).json();
    expect(j).toEqual({ success: false, error: 'Token tidak dikenal / nonaktif' });
    for (const posisi of ['menutup', 'supabase', 'membuka']) {
      vi.setSystemTime(Date.now() + 10_000);   // lewati simpanan posisi saklar 5 detik
      j = await (await ping(envDengan('latihan_kmbbupr', posisi))).json();
      expect(j.success).toBe(false);
      expect(j.error).toBe(PESAN_TUTUP_GAS);
      expect(j.error).toMatch(/sudah pindah ke abadiops/i);   // yang ditunggu langkah cek_gas prosedur Mulai
    }
  });
  it('API Worker latihan selama saklar gas dijawab GAS tiruan langsung (tanpa memanggil domainnya sendiri, 522)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T03:00:00Z'));
    const ambil = vi.fn(async () => { throw new Error('tidak boleh fetch keluar'); });
    vi.stubGlobal('fetch', ambil);
    const r = await worker.fetch(new Request('https://latihan-kmbbupr.uji/api', { method: 'POST', body: JSON.stringify({ action: 'ping', token: 'x' }) }), envDengan('latihan_kmbbupr', 'gas'), {} as any);
    expect(await r.json()).toEqual({ success: false, error: 'Token tidak dikenal / nonaktif' });
    expect(ambil).not.toHaveBeenCalled();
  });
  it('Worker rumah asli tidak punya titik ini', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T02:00:00Z'));
    const r = await ping(envDengan('kmbbupr', 'gas'));
    expect(r.status).toBe(404);   // jatuh ke aset PWA
  });
});
