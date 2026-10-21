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
  'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';

export const APPSCRIPT_URL: string =
  process.env['APPSCRIPT_URL']?.trim() || APPSCRIPT_URL_KMB;

export function dapatkanAppscriptUrl(_token?: string | null): string {
  if (process.env['APPSCRIPT_URL']?.trim()) {
    return process.env['APPSCRIPT_URL'].trim();
  }
  return APPSCRIPT_URL_KMB;
}

export function pakaiAppsScript(): boolean {
  return BACKEND_DRIVER === 'appscript';
}

