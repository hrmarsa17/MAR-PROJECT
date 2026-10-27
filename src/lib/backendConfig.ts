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

// Backend driver: 'appscript' (Google Sheets) atau 'supabase' (PostgreSQL)
export const BACKEND_DRIVER: BackendDriver = (process.env.BACKEND_DRIVER as BackendDriver) || 'appscript';

export const APPSCRIPT_URL_KMB =
  process.env['APPSCRIPT_URL_KMB'] ||
  process.env['APPSCRIPT_URL'] ||
  'https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec';

export const APPSCRIPT_URL_SUM =
  process.env['APPSCRIPT_URL_SUM'] ||
  'https://script.google.com/macros/s/AKfycbzB5EUJlpGRaDTFvfr3bl117hd_Oa2k4seCecTYy4Ct8_oYRefu8U9BqG6zu3M-BoFS/exec';

export const APPSCRIPT_URL: string = APPSCRIPT_URL_KMB;

export function dapatkanAppscriptUrl(token?: string | null, sistem?: string | null): string {
  const s = sistem?.toUpperCase();
  if (s === 'SUM') return APPSCRIPT_URL_SUM || APPSCRIPT_URL_KMB;
  if (s === 'KMB') return APPSCRIPT_URL_KMB;

  if (token) {
    const t = token.trim().toLowerCase();
    if (t.startsWith('sum-') || t.startsWith('sum_') || t === 'sum') {
      return APPSCRIPT_URL_SUM || APPSCRIPT_URL_KMB;
    }
  }

  return APPSCRIPT_URL_KMB;
}

export function dapatkanDatabaseUrl(sistem?: string | null): string {
  const s = sistem?.toUpperCase();
  if (s === 'SUM') {
    return process.env['DATABASE_URL_SUM'] || process.env['DATABASE_URL'] || '';
  }
  return process.env['DATABASE_URL_KMB'] || process.env['DATABASE_URL'] || '';
}

export function pakaiAppsScript(): boolean {
  return BACKEND_DRIVER === 'appscript';
}

