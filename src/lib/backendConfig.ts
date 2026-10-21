/**
 * KONFIGURASI DRIVER BACKEND
 *
 * Mengatur apakah sistem sedang menggunakan:
 *   - 'appscript' : Google Apps Script & Google Sheets
 *   - 'supabase'  : PostgreSQL / Supabase
 *
 * Konfigurasi Supabase tetap tersimpan utuh dan tidak dihapus.
 */

export type BackendDriver = 'appscript' | 'supabase';

export const BACKEND_DRIVER: BackendDriver =
  process.env['BACKEND_DRIVER']?.toLowerCase() === 'supabase'
    ? 'supabase'
    : 'appscript';

export const APPSCRIPT_URL_KMB =
  'https://script.google.com/macros/s/AKfycbwlwlQvOGVF6FdKkYRNlbgdJCets5L-0AfufMB4_79_HzvoQkeE9aZAqkKZiXCZHXnG6Q/exec';

export const APPSCRIPT_URL_SUM =
  'https://script.google.com/macros/s/AKfycbzB5EUJlpGRaDTFvfr3bl117hd_Oa2k4seCecTYy4Ct8_oYRefu8U9BqG6zu3M-BoFS/exec';

export const APPSCRIPT_URL: string =
  process.env['APPSCRIPT_URL']?.trim() || APPSCRIPT_URL_SUM;

export function dapatkanAppscriptUrl(token?: string | null): string {
  if (process.env['APPSCRIPT_URL']?.trim()) {
    return process.env['APPSCRIPT_URL'].trim();
  }
  if (token && token.toLowerCase().startsWith('kmb')) {
    return APPSCRIPT_URL_KMB;
  }
  return APPSCRIPT_URL_SUM;
}

export function pakaiAppsScript(): boolean {
  return BACKEND_DRIVER === 'appscript';
}

