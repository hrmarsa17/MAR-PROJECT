import { cookies } from 'next/headers';
import { z } from 'zod';
import { identitasDariToken } from '../../../lib/auth.js';
import { NAMA_COOKIE, jawab, jawabGalat, pasangCookieSesi } from '../_bantu.js';
import { masukanTidakSah } from '../../../lib/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Masuk = z.object({
  token: z.string().min(8).max(200),
  sistem: z.enum(['PKMB', 'KMB', 'SUM']).optional().default('PKMB'),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const isi = Masuk.safeParse(await req.json().catch(() => null));
    if (!isi.success) throw masukanTidakSah('Token wajib diisi');

    // Simpan sistem ke session untuk routing
    (await cookies()).set('mar_sistem', isi.data.sistem, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    });

    const aku = await identitasDariToken(isi.data.token, isi.data.sistem);

    // httpOnly: JavaScript halaman tidak bisa membaca token. Ini menutup satu
    // kelas kebocoran yang di KMB V2 malah dibuka lebar — tab Monitoring
    // menampilkan token setiap mekanik ke layar approver.
    await pasangCookieSesi(isi.data.token);

    return jawab({ ...aku, sistem: isi.data.sistem });
  } catch (e) {
    return jawabGalat(e);
  }
}

export async function DELETE(): Promise<Response> {
  (await cookies()).delete(NAMA_COOKIE);
  return jawab({ keluar: true });
}
