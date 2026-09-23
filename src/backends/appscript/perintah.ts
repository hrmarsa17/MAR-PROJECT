import { panggilAppsScript } from './client.js';

/**
 * Meneruskan eksekusi perintah (mutasi data) ke Google Apps Script Web App.
 */
export async function handlePerintahAppsScript(
  aksi: string,
  data: unknown,
  opId: string,
  token: string | null | undefined,
): Promise<any> {
  const res = await panggilAppsScript(token, aksi, data, opId);
  if (!res.success) {
    throw new Error(res.error || `Operasi "${aksi}" ditolak oleh Google Apps Script`);
  }
  return res.result ?? { ok: true };
}
