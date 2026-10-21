/**
 * Penamaan dan penormalan Section selaras dengan KMB V2 (`D:\GAS\KMB v2`).
 *
 * Di KMB V2 (`Constants.js:57-62`, `Reports.html:288`, `WorkOrder.html:1056`):
 *   - vessel      -> 'Rekondisi Vessel' (ikon: 🛢️)
 *   - maintenance -> 'Maintenance'      (ikon: 🚜)
 *   - workshop    -> 'Workshop'         (ikon: 🏭)
 *
 * Alias warisan:
 *   - tyreman / tyre -> 'Rekondisi Vessel' (kode: vessel)
 *   - field          -> 'Maintenance'      (kode: maintenance)
 */

export const SECTION_LABELS: Record<string, string> = {
  vessel: 'Rekondisi Vessel',
  maintenance: 'Maintenance',
  workshop: 'Workshop',
  field: 'Maintenance',
  tyreman: 'Rekondisi Vessel',
  tyre: 'Rekondisi Vessel',
};

export const SECTION_ICONS: Record<string, string> = {
  vessel: '🛢️',
  tyreman: '🛢️',
  tyre: '🛢️',
  maintenance: '🚜',
  field: '🚜',
  workshop: '🏭',
};

export function normalisasiSectionCode(code: string): string {
  const c = code.toLowerCase().trim();
  if (c === 'tyreman' || c === 'tyre') return 'vessel';
  if (c === 'field') return 'maintenance';
  return c;
}

export function namaSection(code: string): string {
  const c = code.toLowerCase().trim();
  return SECTION_LABELS[c] || (c.charAt(0).toUpperCase() + c.slice(1));
}

export function ikonSection(code: string): string {
  const c = code.toLowerCase().trim();
  return SECTION_ICONS[c] || '🏭';
}

export function normalisasiSection(code: string, customName?: string): { code: string; name: string } {
  const normCode = normalisasiSectionCode(code);
  const name = customName && customName !== code ? customName : namaSection(normCode);
  return { code: normCode, name };
}

export const SECTIONS_BAKU_KMB = [
  { code: 'vessel', name: 'Rekondisi Vessel' },
  { code: 'maintenance', name: 'Maintenance' },
  { code: 'workshop', name: 'Workshop' },
];
