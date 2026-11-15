import { afterEach, describe, expect, it, vi } from 'vitest';
import * as modMigrasi from '../workers/pintu/src/migrasi.js';

const { jalankanLangkah, pulihkanGagal } = modMigrasi as any;

/**
 * PROSEDUR "MULAI MIGRASI" / "KEMBALI KE GAS" DI PRODUKSI (workers/pintu/src/migrasi.js, docs/SAKLAR.md).
 *
 * Langkah produksi dijalankan dengan fetch tiruan: RPC Supabase (antrean permintaan, kesehatan, izin tulis) dan
 * web app GAS (terbuka / sudah ditutup tambalan tutup GAS). Mesin langkahnya ditiru dari SaklarDO.alarm:
 * lanjut → tahap berikut, tunggu → tahap sama, selesai/gagal → berhenti (posisi aman ditentukan DO).
 */

const GAS = 'https://gas.uji/exec';
const env = {
  LINGKUNGAN: '', SUPABASE_URL: 'https://supa.uji', SUPABASE_SERVICE_ROLE_KEY: 'kunci-uji',
  RUMAH: [{ kode: 'kmbbupr', nama: 'BUPR', gas: GAS, alamat: 'https://kmbbupr.abadiops.com/' }],
};

type Dunia = {
  gasTutupSetelah: number;          // jumlah ping GAS sebelum GAS menjawab "sudah pindah ke abadiops"
  permintaan: Record<string, { pollSebelumSelesai: number; berhasil: boolean; hasil: string }>;
  meta: Record<string, string>;
  panggilan: Array<{ nama: string; args: any }>;
};

function pasang(d: Dunia) {
  let pingGas = 0, idBaru = 100;
  const antre: Record<number, { jenis: string; poll: number }> = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    if (url === GAS) {
      pingGas++;
      const tutup = pingGas > d.gasTutupSetelah;
      return new Response(JSON.stringify({ success: false, error: tutup ? 'Sistem MAR rumah ini sudah pindah ke abadiops. Buka https://abadiops.com' : 'Token tidak dikenal / nonaktif' }));
    }
    const m = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (!m) throw new Error('alamat tak terduga ' + url);
    const nama = m[1]!, args = JSON.parse(init.body || '{}');
    d.panggilan.push({ nama, args });
    const jawab = (x: any) => new Response(JSON.stringify(x));
    switch (nama) {
      case 'cermin_minta': { const id = idBaru++; antre[id] = { jenis: args.p_jenis, poll: 0 }; return jawab(String(id)); }
      case 'cermin_permintaan_status': {
        const a = antre[args.p_id]!; const atur = d.permintaan[a.jenis]!;
        a.poll++;
        const selesai = a.poll > atur.pollSebelumSelesai;
        return jawab({ id: args.p_id, jenis: a.jenis, mulai_at: a.poll > 1 ? '2026-11-15T01:00:00Z' : null, selesai_at: selesai ? '2026-11-15T01:05:00Z' : null, berhasil: selesai ? atur.berhasil : null, hasil: selesai ? atur.hasil : null });
      }
      case 'cermin_kesehatan': return jawab({ meta: Object.fromEntries(Object.entries(d.meta).map(([k, v]) => [k, { nilai: v }])) });
      case 'cermin_cadangkan': return jawab({ skema: 'cad_kmbbupr_20261115_0800', tabel: 28, baris: 15308 });
      case 'cermin_atur_izin_tulis': return jawab(null);
      case 'cermin_permintaan_batal': return jawab(true);
      default: throw new Error('RPC tak terduga ' + nama);
    }
  }));
}

// Mesin langkah seperti SaklarDO.alarm.
async function jalankan(job: any, maks = 60) {
  const log: string[] = [];
  for (let i = 0; i < maks; i++) {
    const h = await jalankanLangkah(env, job);
    if (h.gagal) return { akhir: 'gagal', sebab: h.gagal, log };
    if (h.selesai) return { akhir: 'selesai', posisi: h.posisi, log: [...log, job.tahap] };
    if (h.tunggu) continue;
    log.push(job.tahap);
    job.tahap = h.lanjut;
  }
  return { akhir: 'macet', log };
}

const MULAI_AT = '2026-11-15T00:59:00.000Z';
const jobMulai = () => ({ rumah: 'kmbbupr', jenis: 'mulai', tahap: 'cek_gas', mulai_at: MULAI_AT, oleh: 'uji', alasan: 'uji prosedur' });
const metaSehat = { periksa_terakhir: '2026-11-15T01:04:00.000Z', periksa_hasil: '24/24 sama', sheet_dilewati: '' };

afterEach(() => { vi.unstubAllGlobals(); });

describe('Mulai migrasi (produksi)', () => {
  it('jalur mulus: GAS tertutup → sinkron → periksa → cadangan → izin → cermin balik awal → supabase', async () => {
    const d: Dunia = { gasTutupSetelah: 2, meta: metaSehat, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 3, berhasil: true, hasil: 'kmbbupr: 24 sheet lulus · diperiksa 24/24 sama' },
      balik_awal: { pollSebelumSelesai: 2, berhasil: true, hasil: 'kmbbupr: 0 baris ditulis · periksa 24/24 sama' },
    } };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job);
    expect(h).toMatchObject({ akhir: 'selesai', posisi: 'supabase' });
    expect(h.log).toEqual(['cek_gas', 'sinkron', 'periksa', 'cadangan', 'buka_tulis', 'balik_awal']);
    expect(job.izin_dibuka).toBe(true);
    const urutan = d.panggilan.map((p) => p.nama).filter((n) => n !== 'cermin_permintaan_status');
    expect(urutan).toEqual(['cermin_minta', 'cermin_kesehatan', 'cermin_cadangkan', 'cermin_atur_izin_tulis', 'cermin_minta']);
    expect(d.panggilan.find((p) => p.nama === 'cermin_atur_izin_tulis')!.args).toMatchObject({ p_skema: 'kmbbupr', p_boleh: true });
    expect(d.panggilan.filter((p) => p.nama === 'cermin_minta').map((p) => p.args.p_jenis)).toEqual(['sinkron_akhir', 'balik_awal']);
  });

  it('GAS tidak kunjung tertutup (tambalan belum ter-deploy): gagal tanpa menyentuh Supabase', async () => {
    const d: Dunia = { gasTutupSetelah: 999, meta: metaSehat, panggilan: [], permintaan: {} };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job);
    expect(h.akhir).toBe('gagal');
    expect(h.sebab).toMatch(/belum tertutup/);
    expect(job.cek_gas).toBe(16);
    expect(d.panggilan).toEqual([]);
    expect(await pulihkanGagal(env, job)).toBe('');
  });

  it('sinkron terakhir melewati AuditLogs: gagal di periksa', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: { ...metaSehat, sheet_dilewati: 'AuditLogs' }, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'ok' },
    } };
    pasang(d);
    const h = await jalankan(jobMulai());
    expect(h.akhir).toBe('gagal');
    expect(h.sebab).toMatch(/AuditLogs/);
  });

  it('pemeriksaan selisih yang lebih tua dari jam mulai tidak dipakai', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: { ...metaSehat, periksa_terakhir: '2026-11-15T00:30:00.000Z' }, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'ok' },
    } };
    pasang(d);
    const h = await jalankan(jobMulai());
    expect(h.akhir).toBe('gagal');
    expect(h.sebab).toMatch(/sesudah GAS ditutup/);
  });

  it('cermin balik awal gagal (akun layanan belum Editor): izin tulis ditutup lagi oleh pemulihan', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'ok' },
      balik_awal: { pollSebelumSelesai: 1, berhasil: false, hasil: 'kmbbupr: Berhenti: akun layanan belum Editor di spreadsheet sasaran' },
    } };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job);
    expect(h.akhir).toBe('gagal');
    expect(h.sebab).toMatch(/belum Editor/);
    const catatan = await pulihkanGagal(env, job);
    expect(catatan).toMatch(/izin tulis kmbbupr ditutup lagi/);
    const izin = d.panggilan.filter((p) => p.nama === 'cermin_atur_izin_tulis').map((p) => p.args.p_boleh);
    expect(izin).toEqual([true, false]);
  });

  it('pemulihan membatalkan permintaan yang belum diambil pelaksana', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 999, berhasil: true, hasil: '' },
    } };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job, 10);
    expect(h.akhir).toBe('macet');            // DO akan menghentikannya di batas waktu
    expect(await pulihkanGagal(env, job)).toMatch(/permintaan sinkron_akhir #100 dibatalkan/);
  });
});

describe('Kembali ke GAS (produksi)', () => {
  it('cermin balik terakhir + periksa → izin tulis ditutup → gas', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], permintaan: {
      balik_akhir: { pollSebelumSelesai: 2, berhasil: true, hasil: 'kmbbupr: 12 baris ditulis · periksa 24/24 sama' },
    } };
    pasang(d);
    const job: any = { rumah: 'kmbbupr', jenis: 'kembali', tahap: 'cermin_balik', mulai_at: MULAI_AT, oleh: 'uji', alasan: 'uji kembali' };
    const h = await jalankan(job);
    expect(h).toMatchObject({ akhir: 'selesai', posisi: 'gas' });
    expect(d.panggilan.find((p) => p.nama === 'cermin_atur_izin_tulis')!.args).toMatchObject({ p_boleh: false });
  });

  it('cermin balik terakhir gagal: berhenti (DO mengembalikan saklar ke supabase), izin tetap terbuka', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], permintaan: {
      balik_akhir: { pollSebelumSelesai: 0, berhasil: false, hasil: 'periksa 23/24 sama' },
    } };
    pasang(d);
    const job: any = { rumah: 'kmbbupr', jenis: 'kembali', tahap: 'cermin_balik', mulai_at: MULAI_AT, oleh: 'uji', alasan: 'uji kembali' };
    const h = await jalankan(job);
    expect(h.akhir).toBe('gagal');
    await pulihkanGagal(env, job);
    expect(d.panggilan.some((p) => p.nama === 'cermin_atur_izin_tulis')).toBe(false);
  });
});
