import { describe, expect, it, vi, beforeEach } from 'vitest';
import { dataPayrollAppsScript } from '../src/backends/appscript/payroll.js';
import type { Identitas } from '../src/lib/auth.js';

vi.mock('../src/backends/appscript/client.js', () => ({
  panggilAppsScript: vi.fn(),
}));

import { panggilAppsScript } from '../src/backends/appscript/client.js';

describe('dataPayrollAppsScript', () => {
  const dummyAku: Identitas = {
    tenantId: 1,
    tenantCode: 'test',
    mechanicId: 101,
    nama: 'Budi Mekanik',
    peran: 'mechanic',
    bolehLihat: { performa: true, teknis: true, report: true },
    bolehAdmin: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('berhasil memproses data approved WO menjadi ringkasan dan detail payroll', async () => {
    vi.mocked(panggilAppsScript).mockImplementation(async (_token, action) => {
      if (action === 'pull_create_refs') {
        return {
          success: true,
          result: {
            mechanics: [
              { id: 101, name: 'Budi Mekanik', role: 'Senior', rate: 3000 },
              { id: 102, name: 'Andi Mekanik', role: 'Junior', rate: 2500 },
            ],
          },
        };
      }
      if (action === 'pull_approved') {
        return {
          success: true,
          result: {
            approved: [
              {
                id: 'WO-1001',
                wo_number: 'WO-1001',
                section: 'field',
                approved_at: '2026-10-15T10:00:00.000Z',
                final_points: 10,
                team: [
                  { id: 101, share: 0.5 },
                  { id: 102, share: 0.5 },
                ],
              },
            ],
          },
        };
      }
      return { success: false, error: 'unknown' };
    });

    const hasil = await dataPayrollAppsScript('token-123', dummyAku, {
      mode: 'month',
      tahun: 2026,
      bulan: 10,
    });

    expect(hasil.periodeLabel).toContain('2026');
    expect(hasil.detail.length).toBe(2);
    expect(hasil.ringkas.length).toBe(2);

    const budi = hasil.ringkas.find((r) => r.mekanikId === 101);
    expect(budi).toBeDefined();
    expect(budi?.totalPoin).toBe(5);
    expect(budi?.totalIdr).toBe(15000); // 5 * 3000

    const andi = hasil.ringkas.find((r) => r.mekanikId === 102);
    expect(andi).toBeDefined();
    expect(andi?.totalPoin).toBe(5);
    expect(andi?.totalIdr).toBe(12500); // 5 * 2500
  });

  it('melempar aturanBisnis jika tidak ada WO yang disetujui pada periode terpilih', async () => {
    vi.mocked(panggilAppsScript).mockImplementation(async (_token, action) => {
      if (action === 'pull_create_refs') return { success: true, result: {} };
      if (action === 'pull_approved') return { success: true, result: { approved: [] } };
      return { success: false };
    });

    await expect(
      dataPayrollAppsScript('token-123', dummyAku, {
        mode: 'month',
        tahun: 2026,
        bulan: 10,
      }),
    ).rejects.toThrow(/Tidak ada work order yang disetujui/);
  });

  it('menyaring section dengan penormalan alias KMB V2 (vessel / maintenance / workshop)', async () => {
    vi.mocked(panggilAppsScript).mockImplementation(async (_token, action) => {
      if (action === 'pull_create_refs') {
        return {
          success: true,
          result: {
            mechanics: [{ id: 101, name: 'Budi Mekanik', role: 'Senior', rate: 3000 }],
          },
        };
      }
      if (action === 'pull_approved') {
        return {
          success: true,
          result: {
            approved: [
              {
                id: 'WO-1',
                wo_number: 'WO-1',
                section: 'vessel',
                approved_at: '2026-10-10T10:00:00.000Z',
                final_points: 5,
                team: [{ id: 101, share: 1 }],
              },
              {
                id: 'WO-2',
                wo_number: 'WO-2',
                section: 'maintenance',
                approved_at: '2026-10-10T10:00:00.000Z',
                final_points: 8,
                team: [{ id: 101, share: 1 }],
              },
            ],
          },
        };
      }
      return { success: false };
    });

    // Minta filter 'vessel' (Rekondisi Vessel)
    const hasilVessel = await dataPayrollAppsScript('token-123', dummyAku, {
      mode: 'month',
      tahun: 2026,
      bulan: 10,
      section: 'vessel',
    });

    expect(hasilVessel.detail.length).toBe(1);
    expect(hasilVessel.detail[0]?.woNumber).toBe('WO-1');
    expect(hasilVessel.sectionLabel).toBe('Rekondisi Vessel');
  });
});

