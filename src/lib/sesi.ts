import { cookies } from 'next/headers';
import { identitasDariToken, type Identitas } from './auth.js';

export const NAMA_COOKIE = 'mar_token';

/**
 * Identitas untuk komponen server.
 *
 * Mengembalikan null, bukan melempar — halaman yang memanggilnya memutuskan
 * sendiri apakah mengalihkan ke layar masuk atau menampilkan yang bisa dilihat
 * tanpa identitas.
 */
export async function akuServer(): Promise<Identitas | null> {
  const token = (await cookies()).get(NAMA_COOKIE)?.value;
  if (!token) return null;
  try {
    return await identitasDariToken(token);
  } catch {
    return null;
  }
}
