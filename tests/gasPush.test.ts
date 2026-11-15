import { describe, expect, it, vi } from 'vitest';
// Modul JS bersama Worker rumah; JSDoc-nya bukan anotasi tipe, jadi dipakai sebagai any.
import * as modLayanan from '../workers/bersama/gas-layanan.js';
import * as modHost from '../workers/bersama/gas-host.js';
import * as modRumah from '../workers/bersama/gas-rumah.js';

const { buatLayanan } = modLayanan as any;
const { buatHost } = modHost as any;
const { kirimPush, matikanLangganan, rapikanPem, LAYANAN_PUSH } = modRumah as any;

/**
 * NOTIFIKASI PUSH DI WORKER (wajib sebelum KMB Projek, KMB V2, SUM; docs/KEPUTUSAN.md 15 Nov).
 *
 * PushService.gs keempat rumah identik: kunci VAPID di Script Properties (VAPID_PRIVATE_PEM, VAPID_PUBLIC_B64URL),
 * JWT ES256 ditandatangani jsrsasign di kode GAS, lalu UrlFetchApp.fetch POST ke endpoint langganan (PushSubs).
 * 2xx → last_ok (kolom 8) diisi; 404/410 → is_active (kolom 9) = false. Kode GAS sinkron, jaringan Worker tidak:
 * shim mencatat permintaan (jawaban 201) dan Worker mengirimnya sesudah tulisan tersimpan.
 */

const KEPALA = ['id', 'mechanic_id', 'email', 'endpoint', 'p256dh', 'auth', 'created_at', 'last_ok', 'is_active'];
const FCM = 'https://fcm.googleapis.com/fcm/send/langganan-a';
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/langganan-b';
const KEPALA_PUSH = { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=jwt.uji.tanda, k=kunci-publik-uji' };

function layanan(properti?: Record<string, string>, pushSubs?: unknown[][]) {
  const sheets: Record<string, unknown> = {};
  if (pushSubs) sheets.PushSubs = { headers: KEPALA, tanggal: [], rows: pushSubs };
  return buatLayanan({ zonaSkrip: 'Asia/Jakarta', sheets, dilewati: [], properti }, buatHost());
}

describe('shim: Script Properties dan web push', () => {
  it('Script Properties berisi kunci VAPID dari D.properti; properti lain tetap kosong', () => {
    const L = layanan({ VAPID_PRIVATE_PEM: 'pem-uji', VAPID_PUBLIC_B64URL: 'pub-uji', KOSONG: '' });
    const sp = L.PropertiesService.getScriptProperties();
    expect(sp.getProperty('VAPID_PRIVATE_PEM')).toBe('pem-uji');
    expect(sp.getProperty('VAPID_PUBLIC_B64URL')).toBe('pub-uji');
    expect(sp.getProperty('KOSONG')).toBeNull();
    expect(L.PropertiesService.getUserProperties().getProperty('VAPID_PRIVATE_PEM')).toBeNull();
    // Tanpa D.properti: kosong seperti sebelumnya, jadi sendPushToEmails GAS diam (return 0).
    expect(layanan().PropertiesService.getScriptProperties().getProperty('VAPID_PRIVATE_PEM')).toBeNull();
  });

  it('web push dicatat apa adanya dan dijawab 201', () => {
    const L = layanan();
    const r = L.UrlFetchApp.fetch(FCM, { method: 'post', headers: KEPALA_PUSH, payload: '', muteHttpExceptions: true });
    expect(r.getResponseCode()).toBe(201);
    expect(r.getContentText()).toBe('');
    expect(L.__CATAT.keluar).toEqual([{ url: FCM, headers: KEPALA_PUSH, payload: '' }]);
    expect(L.__CATAT.layanan.join()).toMatch(/web push, dikirim sesudah simpan/);
    expect(L.__ekspor()).toEqual({});
  });

  it('Utilities.newBlob(teks).getBytes(): byte UTF-8 bertanda seperti GAS (dipakai JWT VAPID)', () => {
    const L = layanan();
    const teks = JSON.stringify({ typ: 'JWT', alg: 'ES256', é: 'ü€' });
    const byte = L.Utilities.newBlob(teks).getBytes();
    expect(byte).toEqual([...Buffer.from(teks, 'utf8')].map((x) => (x > 127 ? x - 256 : x)));
    // Persis _pushB64UrlStr GAS: base64 aman-URL tanpa "=".
    expect(L.Utilities.base64EncodeWebSafe(byte).replace(/=+$/, '')).toBe(Buffer.from(teks, 'utf8').toString('base64url'));
    expect(L.Utilities.newBlob(byte, 'text/plain', 'a.txt').getDataAsString()).toBe(teks);
    expect(L.Utilities.newBlob('x', 'text/plain', 'a.txt').getName()).toBe('a.txt');
    expect(L.__CATAT.tak_dikenal).toEqual([]);
  });

  it('UrlFetchApp.fetchAll (PushService.gs SUM): tiap permintaan dicatat dan dijawab 201', () => {
    const L = layanan();
    const q = (url: string) => ({ url, method: 'post', headers: KEPALA_PUSH, payload: '', muteHttpExceptions: true });
    const r = L.UrlFetchApp.fetchAll([q(FCM), q(MOZ)]);
    expect(r.map((x: any) => x.getResponseCode())).toEqual([201, 201]);
    expect(L.__CATAT.keluar.map((k: any) => k.url)).toEqual([FCM, MOZ]);
    expect(() => L.UrlFetchApp.fetchAll([q(FCM), { url: 'https://contoh.invalid/x', method: 'post' }])).toThrow(/tidak tersedia/);
  });

  it('selain web push, UrlFetchApp tetap tidak tersedia', () => {
    const L = layanan();
    expect(() => L.UrlFetchApp.fetch('https://contoh.invalid/api', { method: 'post', payload: 'x' })).toThrow(/tidak tersedia/);
    expect(() => L.UrlFetchApp.fetch(FCM, { method: 'get', headers: KEPALA_PUSH })).toThrow(/tidak tersedia/);
    expect(() => L.UrlFetchApp.fetch('http://fcm.googleapis.com/x', { method: 'post', headers: KEPALA_PUSH })).toThrow(/tidak tersedia/);
    expect(L.__CATAT.keluar).toEqual([]);
  });
});

describe('rapikanPem', () => {
  const isi = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg' + 'A'.repeat(70);
  const baku = `-----BEGIN PRIVATE KEY-----\r\n${isi.slice(0, 64)}\r\n${isi.slice(64)}\r\n-----END PRIVATE KEY-----\r\n`;
  it('PEM satu baris (disalin dari tabel Script Properties) menjadi PEM baku', () => {
    expect(rapikanPem(`-----BEGIN PRIVATE KEY----- ${isi.slice(0, 40)} ${isi.slice(40)} -----END PRIVATE KEY-----`)).toBe(baku);
  });
  it('urutan \\n tertulis dan PEM yang sudah baku', () => {
    expect(rapikanPem(`-----BEGIN PRIVATE KEY-----\\n${isi}\\n-----END PRIVATE KEY-----`)).toBe(baku);
    expect(rapikanPem(baku)).toBe(baku);
  });
});

describe('kirimPush', () => {
  const keluar = (...url: string[]) => url.map((u) => ({ url: u, headers: KEPALA_PUSH, payload: '' }));

  it('produksi: hanya ke layanan push; 2xx dibiarkan, 404/410 mematikan langganan', async () => {
    const ambil = vi.fn(async (u: string) => ({ status: u.endsWith('-mati') ? 410 : u.endsWith('-hilang') ? 404 : 201 }));
    const matikan = vi.fn(async () => ({ ok: true, ringkas: 'PushSubs:2' }));
    const h = await kirimPush({ RUMAH: 'kmbbupr' }, {}, new URL('https://x.uji/'),
      keluar(FCM, `${FCM}-mati`, `${MOZ}-hilang`, 'https://contoh.invalid/bukan-push'), { ambil, matikan });
    expect(ambil).toHaveBeenCalledTimes(3);
    expect(ambil.mock.calls[0]).toEqual([FCM, { method: 'POST', headers: KEPALA_PUSH, body: '' }]);
    expect(h.mati).toEqual([`${FCM}-mati`, `${MOZ}-hilang`]);
    expect(matikan).toHaveBeenCalledWith([`${FCM}-mati`, `${MOZ}-hilang`]);
    expect(h.hasil[3]).toEqual({ tujuan: 'contoh.invalid', dilewati: 'bukan layanan push' });
    // Endpoint langganan tidak dicatat utuh.
    expect(JSON.stringify(h.hasil)).not.toMatch(/langganan-a/);
  });

  it('ruang uji: PushSubs salinan berisi HP sungguhan, jadi hanya penerima uji yang dikirimi', async () => {
    const ambil = vi.fn(async () => ({ status: 201 }));
    const env = { RUMAH: 'kmbbupr', SKEMA_AWALAN: 'uji_' };
    const a = await kirimPush(env, {}, new URL('https://x.uji/'), keluar(FCM, MOZ), { ambil });
    expect(ambil).not.toHaveBeenCalled();
    expect(a.hasil.every((x: any) => /ruang uji/.test(x.dilewati))).toBe(true);
    const b = await kirimPush({ ...env, PUSH_UJI_AWALAN: 'https://staging.abadiops.com/__uji-push/' }, {}, new URL('https://x.uji/'),
      keluar(FCM, 'https://staging.abadiops.com/__uji-push/satu'), { ambil });
    expect(ambil).toHaveBeenCalledTimes(1);
    expect(b.hasil[0].dilewati).toMatch(/ruang uji/);
    expect(b.hasil[1]).toEqual({ tujuan: 'staging.abadiops.com', status: 201 });
  });

  it('galat jaringan satu endpoint tidak menghentikan yang lain, dan tidak mematikan langganan', async () => {
    const ambil = vi.fn(async (u: string) => { if (u === FCM) throw new Error('putus'); return { status: 201 }; });
    const matikan = vi.fn();
    const h = await kirimPush({ RUMAH: 'sum' }, {}, new URL('https://x.uji/'), keluar(FCM, MOZ), { ambil, matikan });
    expect(h.hasil[0]).toMatchObject({ galat: 'putus' });
    expect(h.hasil[1]).toMatchObject({ status: 201 });
    expect(matikan).not.toHaveBeenCalled();
  });

  it('pola layanan push: endpoint langganan yang dikenal saja', () => {
    for (const u of [FCM, MOZ, 'https://web.push.apple.com/QGz', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://android.googleapis.com/gcm/send/x']) {
      expect(LAYANAN_PUSH.test(u)).toBe(true);
    }
    for (const u of ['https://fcm.googleapis.com.contoh.invalid/x', 'http://fcm.googleapis.com/x', 'https://apple.com/push', 'https://abadiops.com/api']) {
      expect(LAYANAN_PUSH.test(u)).toBe(false);
    }
  });
});

describe('matikanLangganan (sama dengan sendPushToEmails GAS untuk 404/410)', () => {
  it('kolom is_active baris endpoint yang mati menjadi false; baris lain tidak berubah', () => {
    const L = layanan({}, [
      ['1', 'MECH-001', 'a@contoh.invalid', FCM, 'p', 'a', '', '', true],
      ['2', 'SPT-001', 'b@contoh.invalid', `${FCM}-mati`, 'p', 'a', '', '', true],
    ]);
    expect(matikanLangganan(L, [`${FCM}-mati`])).toBe(1);
    const e = L.__ekspor();
    expect(Object.keys(e)).toEqual(['PushSubs']);
    expect(e.PushSubs.rows[0][8]).toBe(true);
    expect(e.PushSubs.rows[1][8]).toBe(false);
  });
  it('tanpa sheet PushSubs: tidak ada yang ditulis', () => {
    const L = layanan({});
    expect(matikanLangganan(L, [FCM])).toBe(0);
    expect(L.__ekspor()).toEqual({});
  });
});
