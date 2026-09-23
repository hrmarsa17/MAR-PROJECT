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

export const APPSCRIPT_URL: string =
  process.env['APPSCRIPT_URL']?.trim() ||
  'https://script.google.com/macros/s/AKfycbwlwlQvOGVF6FdKkYRNlbgdJCets5L-0AfufMB4_79_HzvoQkeE9aZAqkKZiXCZHXnG6Q/exec';

export function pakaiAppsScript(): boolean {
  return BACKEND_DRIVER === 'appscript';
}
