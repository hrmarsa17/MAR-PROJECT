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
  'https://script.google.com/macros/s/17sBKK-x3qXzL7tRlejsXE1kQXGwF-CQtCoCdhA4ZWE4_E2NSq0ZUwtqo/exec';

export function pakaiAppsScript(): boolean {
  return BACKEND_DRIVER === 'appscript';
}
