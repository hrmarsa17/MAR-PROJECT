import { APPSCRIPT_URL } from '../../lib/backendConfig.js';
import { tidakBerhak, GalatAplikasi } from '../../lib/errors.js';

export interface GasResponse<T = unknown> {
  success: boolean;
  result?: T;
  data?: T;
  error?: string;
  me?: any;
}

/**
 * Memanggil Web App Google Apps Script via HTTP POST.
 *
 * Sesuai batasan:
 * 1. Hanya mengakses endpoint APPSCRIPT_URL yang ditentukan.
 * 2. Tidak menulis/mengubah data jika dipanggil dalam konteks pembacaan.
 */
export async function panggilAppsScript<T = any>(
  token: string | null | undefined,
  action: string,
  data?: unknown,
  opId?: string,
): Promise<GasResponse<T>> {
  const body = JSON.stringify({
    token: token || undefined,
    action,
    data: data || {},
    op_id: opId || undefined,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body,
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 404) {
        throw tidakBerhak('Google Apps Script 404: ID yang dipasang adalah Script ID. Diperlukan Web App Deployment URL (yang berawalan AKfycb...).');
      }
      throw tidakBerhak(`Google Apps Script HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as GasResponse<T>;
    } catch {
      throw tidakBerhak('Google Apps Script tidak mengembalikan format JSON. Pastikan Web App disetel "Execute as: Me" dan "Who has access: Anyone".');
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err instanceof GalatAplikasi) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw tidakBerhak('Koneksi ke Google Apps Script melampaui batas waktu (timeout).');
    }
    throw tidakBerhak(`Gagal terhubung ke Google Apps Script: ${err.message}`);
  }
}
