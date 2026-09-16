import { cookies } from 'next/headers';
import { identitasDariToken, type Identitas } from '../../lib/auth.js';
import { GalatAplikasi } from '../../lib/errors.js';

export const NAMA_COOKIE = 'kmb_token';

/**
 * Identitas pemanggil, dari header Bearer atau cookie.
 *
 * Dua jalan dengan sengaja: PWA menyimpan token di IndexedDB dan mengirimnya
 * sebagai Bearer (supaya service worker bisa mengosongkan antrean tanpa
 * bergantung pada cookie), sedangkan web memakai cookie httpOnly supaya token
 * tidak pernah tersentuh JavaScript halaman.
 */
export async function akuDari(req: Request): Promise<Identitas> {
  const header = req.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;
  const token = bearer ?? (await cookies()).get(NAMA_COOKIE)?.value ?? null;
  return identitasDariToken(token);
}

/**
 * Memasang cookie sesi. SATU tempat, dipakai saat masuk maupun saat seseorang
 * mengganti tokennya sendiri.
 *
 * Sebelumnya pilihan-pilihan ini hanya ada di rute /api/masuk. Begitu ada
 * tempat kedua yang perlu memasang cookie yang sama, menyalinnya berarti
 * `maxAge` atau `secure` bisa berubah di satu tempat saja — dan yang kedua
 * diam-diam jadi sesi dengan aturan berbeda.
 */
export async function pasangCookieSesi(token: string): Promise<void> {
  (await cookies()).set(NAMA_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

/** Satu bentuk amplop untuk semua jawaban. Klien tidak perlu menebak. */
export function jawab(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function jawabGalat(e: unknown): Response {
  if (e instanceof GalatAplikasi) {
    const status =
      e.kode === 'TIDAK_BERHAK' ? 403
      : e.kode === 'TIDAK_DITEMUKAN' ? 404
      : e.kode === 'KONFLIK_KEADAAN' ? 409
      : e.kode === 'SEDANG_SIBUK' ? 503
      : 400;
    return Response.json(
      {
        ok: false,
        kode: e.kode,
        pesan: e.message,
        detail: e.detail,
        boleh_coba_lagi: e.bolehCobaLagi,
      },
      { status },
    );
  }

  // Galat tak terduga TIDAK diringkas jadi daftar kosong atau pesan manis.
  // Di KMB V2, `catch → return []` membuat approver melihat "tidak ada WO
  // aktif" padahal ada 36 — layar kosong yang tampak normal.
  console.error('[galat tak terduga]', e);
  return Response.json(
    { ok: false, kode: 'GALAT_SERVER', pesan: 'Terjadi galat di server' },
    { status: 500 },
  );
}
