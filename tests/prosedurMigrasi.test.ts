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
  kunciMenunggu?: number;           // berapa kali cermin_kunci_maju(true) menjawab "menunggu" (sinkron tiap jam menulis)
  izinMenunggu?: number;            // berapa kali cermin_atur_izin_tulis(true) menjawab "menunggu"
  izinSudahTerbuka?: boolean;       // keadaan janggal: izin tulis sudah terbuka sebelum prosedur
  lepasGagal?: boolean;             // cermin_kunci_maju(false) ditolak basis data
};

function pasang(d: Dunia) {
  let pingGas = 0, idBaru = 100;
  let kunciTunggu = d.kunciMenunggu || 0, izinTunggu = d.izinMenunggu || 0;
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
      case 'cermin_kunci_maju': {
        if (args.p_kunci && kunciTunggu > 0) { kunciTunggu--; return jawab({ skema: args.p_skema, menunggu: true }); }
        if (!args.p_kunci && (d.lepasGagal || d.izinSudahTerbuka)) {
          return new Response(JSON.stringify({ message: `izin tulis ${args.p_skema} masih terbuka (Supabase penulisnya); sinkron maju tidak boleh dibuka` }), { status: 400 });
        }
        return jawab({ skema: args.p_skema, maju_dikunci: args.p_kunci, boleh: Boolean(d.izinSudahTerbuka) });
      }
      case 'cermin_atur_izin_tulis': {
        if (args.p_boleh && izinTunggu > 0) { izinTunggu--; return jawab({ skema: args.p_skema, boleh: false, menunggu: true }); }
        return jawab({ skema: args.p_skema, boleh: args.p_boleh });
      }
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
    if (h.selesai) return { akhir: 'selesai', posisi: h.posisi, catatan: h.catatan, log: [...log, job.tahap] };
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
    expect(job.maju_dikunci).toBe(true);
    const urutan = d.panggilan.map((p) => p.nama).filter((n) => n !== 'cermin_permintaan_status');
    // Sinkron maju dikunci SEBELUM sinkron terakhir diminta; izin tulis baru dibuka sesudahnya.
    expect(urutan).toEqual(['cermin_kunci_maju', 'cermin_minta', 'cermin_kesehatan', 'cermin_cadangkan', 'cermin_atur_izin_tulis', 'cermin_minta']);
    expect(d.panggilan.find((p) => p.nama === 'cermin_kunci_maju')!.args).toMatchObject({ p_skema: 'kmbbupr', p_kunci: true });
    expect(d.panggilan.find((p) => p.nama === 'cermin_atur_izin_tulis')!.args).toMatchObject({ p_skema: 'kmbbupr', p_boleh: true });
    expect(d.panggilan.filter((p) => p.nama === 'cermin_minta').map((p) => p.args.p_jenis)).toEqual(['sinkron_akhir', 'balik_awal']);
  });

  it('sinkron tiap jam sedang menulis: kunci sinkron maju ditunggu, sinkron terakhir baru diminta sesudah terkunci', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], kunciMenunggu: 2, permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'kmbbupr: diperiksa 24/24 sama' },
      balik_awal: { pollSebelumSelesai: 0, berhasil: true, hasil: 'kmbbupr: periksa 24/24 sama' },
    } };
    pasang(d);
    const h = await jalankan(jobMulai());
    expect(h).toMatchObject({ akhir: 'selesai', posisi: 'supabase' });
    const urutan = d.panggilan.map((p) => p.nama).filter((n) => n !== 'cermin_permintaan_status');
    expect(urutan.slice(0, 4)).toEqual(['cermin_kunci_maju', 'cermin_kunci_maju', 'cermin_kunci_maju', 'cermin_minta']);
  });

  it('transaksi sinkron masih menulis saat izin dibuka: izin ditunggu, bukan gagal', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], izinMenunggu: 1, permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'kmbbupr: diperiksa 24/24 sama' },
      balik_awal: { pollSebelumSelesai: 0, berhasil: true, hasil: 'kmbbupr: periksa 24/24 sama' },
    } };
    pasang(d);
    const h = await jalankan(jobMulai());
    expect(h).toMatchObject({ akhir: 'selesai', posisi: 'supabase' });
    expect(d.panggilan.filter((p) => p.nama === 'cermin_atur_izin_tulis').map((p) => p.args.p_boleh)).toEqual([true, true]);
  });

  it('izin tulis sudah terbuka sebelum prosedur (keadaan janggal): gagal sebelum sinkron terakhir diminta', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], izinSudahTerbuka: true, permintaan: {} };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job);
    expect(h.akhir).toBe('gagal');
    expect(h.sebab).toMatch(/sudah terbuka/);
    expect(d.panggilan.some((p) => p.nama === 'cermin_minta')).toBe(false);
    expect(await pulihkanGagal(env, job)).toMatch(/PERHATIAN: sinkron maju kmbbupr masih dikunci/);
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
    expect(catatan).toMatch(/sinkron maju kmbbupr jalan lagi/);
    const izin = d.panggilan.filter((p) => p.nama === 'cermin_atur_izin_tulis').map((p) => p.args.p_boleh);
    expect(izin).toEqual([true, false]);
    // Izin ditutup DULU, baru sinkron maju dilepas (basis data menolak urutan sebaliknya).
    const akhir = d.panggilan.map((p) => `${p.nama}:${p.args.p_boleh ?? p.args.p_kunci ?? ''}`).filter((x) => /izin|kunci/.test(x));
    expect(akhir.slice(-2)).toEqual(['cermin_atur_izin_tulis:false', 'cermin_kunci_maju:false']);
  });

  it('pemulihan membatalkan permintaan yang belum diambil pelaksana', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], permintaan: {
      sinkron_akhir: { pollSebelumSelesai: 999, berhasil: true, hasil: '' },
    } };
    pasang(d);
    const job: any = jobMulai();
    const h = await jalankan(job, 10);
    expect(h.akhir).toBe('macet');            // DO akan menghentikannya di batas waktu
    const catatan = await pulihkanGagal(env, job);
    expect(catatan).toMatch(/permintaan sinkron_akhir #100 dibatalkan/);
    expect(catatan).toMatch(/sinkron maju kmbbupr jalan lagi/);
    expect(d.panggilan.some((p) => p.nama === 'cermin_atur_izin_tulis')).toBe(false);   // izin belum pernah dibuka
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
    expect(h.catatan).toMatch(/sinkron maju kmbbupr jalan lagi/);
    const urutan = d.panggilan.map((p) => p.nama).filter((n) => n !== 'cermin_permintaan_status');
    expect(urutan).toEqual(['cermin_minta', 'cermin_atur_izin_tulis', 'cermin_kunci_maju']);
    expect(d.panggilan.find((p) => p.nama === 'cermin_atur_izin_tulis')!.args).toMatchObject({ p_boleh: false });
    expect(d.panggilan.find((p) => p.nama === 'cermin_kunci_maju')!.args).toMatchObject({ p_kunci: false });
  });

  it('kunci sinkron maju gagal dilepas: GAS tetap dibuka, dengan PERHATIAN', async () => {
    const d: Dunia = { gasTutupSetelah: 0, meta: metaSehat, panggilan: [], lepasGagal: true, permintaan: {
      balik_akhir: { pollSebelumSelesai: 0, berhasil: true, hasil: 'kmbbupr: periksa 24/24 sama' },
    } };
    pasang(d);
    const job: any = { rumah: 'kmbbupr', jenis: 'kembali', tahap: 'cermin_balik', mulai_at: MULAI_AT, oleh: 'uji', alasan: 'uji kembali' };
    const h = await jalankan(job);
    expect(h).toMatchObject({ akhir: 'selesai', posisi: 'gas' });
    expect(h.catatan).toMatch(/PERHATIAN: sinkron maju kmbbupr masih dikunci/);
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
    // Supabase tetap penulis: izin tetap terbuka dan sinkron maju tetap dikunci.
    expect(d.panggilan.some((p) => p.nama === 'cermin_atur_izin_tulis' || p.nama === 'cermin_kunci_maju')).toBe(false);
  });
});
