import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tanganiMigrasi } from '../workers/pintu/src/migrasi.js';
import { verifikasiKataSandi } from '../workers/pintu/src/saklar-auth.js';

/**
 * DUA SANDI PANEL SAKLAR (keputusan Gabriel 16 Nov 2026):
 *   - sandi panel (PANEL_SAKLAR_SECRET): masuk panel + Mulai/Kembali kartu rumah LATIHAN;
 *   - sandi migrasi asli (MIGRASI_ASLI_SECRET): diminta lagi untuk Mulai/Kembali rumah ASLI di produksi.
 * Keduanya disimpan sebagai SHA-256 hex di secret Worker; nilainya tidak pernah di repo.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const SANDI_ASLI = 'sandi-asli-uji-palsu';
const RUMAH = [
  { kode: 'kmbbupr', nama: 'BUPR', gas: 'https://gas.uji/exec', alamat: 'https://kmbbupr.uji/' },
  { kode: 'latihan_kmbbupr', nama: 'BUPR (LATIHAN)', gas: 'https://latihan.uji/gas-tiruan', alamat: 'https://latihan.uji/' },
];
const envDasar = { LINGKUNGAN: '', SUPABASE_URL: 'https://supa.uji', SUPABASE_SERVICE_ROLE_KEY: 'kunci-uji', MIGRASI_ASLI_SECRET: sha(SANDI_ASLI), RUMAH };
const jsonResp = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });

function siapkan() {
  // Kesehatan cermin hijau untuk semua rumah (supaya yang diuji hanya sandi).
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!/\/rpc\/cermin_kesehatan$/.test(String(url))) throw new Error('RPC tak terduga ' + url);
    const sekarang = new Date().toISOString();
    return jsonResp({ meta: { hari_tanpa_selisih: { nilai: '7' }, periksa_hasil: { nilai: '24/24 sama' }, periksa_terakhir: { nilai: sekarang }, sinkron_terakhir: { nilai: sekarang } } });
  }));
  const keDo: any[] = [];
  const stub = { fetch: vi.fn(async (_u: string, init: any) => { keDo.push(JSON.parse(init.body)); return jsonResp({ success: true }); }) };
  return { stub, keDo };
}

async function minta(env: any, stub: any, jenis: 'mulai' | 'kembali', isi: any, ip = '203.0.113.1') {
  const req = new Request(`https://abadiops.uji/saklar/api/migrasi/${jenis}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(isi),
  });
  const r = await tanganiMigrasi(req, env, new URL(req.url), jsonResp, async () => true, () => stub, (e: any) => e.RUMAH);
  return { status: r.status, j: await r.json() };
}

describe('sandi migrasi asli', () => {
  it('rumah asli: tanpa sandi atau sandi salah → 403, prosedur tidak dimulai', async () => {
    const { stub } = siapkan();
    const isi = { rumah: 'kmbbupr', alasan: 'uji sandi', konfirmasi: 'kmbbupr' };
    let h = await minta(envDasar, stub, 'mulai', isi, '203.0.113.10');
    expect(h.status).toBe(403);
    expect(h.j.perlu_sandi_asli).toBe(true);
    h = await minta(envDasar, stub, 'mulai', { ...isi, sandi_asli: 'salah' }, '203.0.113.10');
    expect(h.status).toBe(403);
    expect(h.j.error).toMatch(/salah/);
    h = await minta(envDasar, stub, 'kembali', isi, '203.0.113.10');
    expect(h.status).toBe(403);
    expect(stub.fetch).not.toHaveBeenCalled();
  });
  it('rumah asli: sandi benar → prosedur dimulai, sandi tidak diteruskan ke Durable Object', async () => {
    const { stub, keDo } = siapkan();
    const h = await minta(envDasar, stub, 'mulai', { rumah: 'kmbbupr', alasan: 'uji sandi', konfirmasi: 'kmbbupr', sandi_asli: SANDI_ASLI }, '203.0.113.11');
    expect(h.status).toBe(200);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(keDo)).not.toContain(SANDI_ASLI);
  });
  it('rumah latihan: cukup sesi panel (tanpa sandi kedua)', async () => {
    const { stub } = siapkan();
    const h = await minta(envDasar, stub, 'mulai', { rumah: 'latihan_kmbbupr', alasan: 'gladi', konfirmasi: 'latihan_kmbbupr' }, '203.0.113.12');
    expect(h.status).toBe(200);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
  });
  it('staging (simulasi): tanpa sandi kedua', async () => {
    const { stub } = siapkan();
    const h = await minta({ ...envDasar, LINGKUNGAN: 'staging' }, stub, 'mulai', { rumah: 'kmbbupr', alasan: 'uji staging', konfirmasi: 'kmbbupr' }, '203.0.113.13');
    expect(h.status).toBe(200);
  });
  it('secret belum dipasang: rumah asli tidak bisa dipindah (gagal tertutup)', async () => {
    const { stub } = siapkan();
    const h = await minta({ ...envDasar, MIGRASI_ASLI_SECRET: '' }, stub, 'mulai', { rumah: 'kmbbupr', alasan: 'uji sandi', konfirmasi: 'kmbbupr', sandi_asli: SANDI_ASLI }, '203.0.113.14');
    expect(h.status).toBe(403);
    expect(h.j.error).toMatch(/belum dipasang/);
    expect(stub.fetch).not.toHaveBeenCalled();
  });
  it('lima kali salah → dikunci, sandi benar pun ditolak sementara', async () => {
    const { stub } = siapkan();
    const isi = { rumah: 'kmbbupr', alasan: 'uji kunci', konfirmasi: 'kmbbupr' };
    for (let i = 0; i < 5; i++) await minta(envDasar, stub, 'mulai', { ...isi, sandi_asli: `salah-${i}` }, '203.0.113.15');
    const h = await minta(envDasar, stub, 'mulai', { ...isi, sandi_asli: SANDI_ASLI }, '203.0.113.15');
    expect(h.status).toBe(403);
    expect(h.j.error).toMatch(/Terlalu banyak/);
    expect(stub.fetch).not.toHaveBeenCalled();
  });
});

describe('sandi panel disimpan sebagai SHA-256', () => {
  it('sandi yang sidiknya cocok diterima; sandi lain ditolak', async () => {
    const env = { PANEL_SAKLAR_SECRET: sha('sandi-panel-uji-palsu') };
    expect((await verifikasiKataSandi('sandi-panel-uji-palsu', env, '198.51.100.1')).ok).toBe(true);
    expect((await verifikasiKataSandi('bukan', env, '198.51.100.2')).ok).toBe(false);
  });
});
