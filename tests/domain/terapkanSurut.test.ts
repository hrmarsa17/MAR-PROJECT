import { describe, expect, it, vi } from 'vitest';
import { pratinjauSurut, terapkanSurut } from '../../src/domain/terapkanSurut.js';
import { sql } from '../../src/lib/db.js';

vi.mock('../../src/lib/db.js', () => {
  const mockTx: any = vi.fn().mockImplementation(() => Promise.resolve([]));
  mockTx.json = vi.fn((val) => val);
  return {
    sql: {
      begin: vi.fn((cb) => cb(mockTx)),
    },
    pakaiIdentitas: vi.fn(),
  };
});

vi.mock('../../src/domain/admin.js', () => ({
  pastikanAdmin: vi.fn(),
}));

describe('terapkanSurut', () => {
  it('pratinjauSurut menolak nilai <= 0', async () => {
    await expect(pratinjauSurut(1, 1, 0, 5)).rejects.toThrow('Base point harus lebih dari 0');
    await expect(pratinjauSurut(1, 1, 10, 0)).rejects.toThrow('Jam rencana harus lebih dari 0');
  });

  it('pratinjauSurut menghitung dampak perubahan job', async () => {
    const mockTx: any = vi.fn();
    mockTx.json = vi.fn((val) => val);
    (sql.begin as any).mockImplementationOnce((cb: any) => cb(mockTx));

    // Job query
    mockTx.mockResolvedValueOnce([{
      kode: 'JOB1', nama: 'Job 1', section: 'S1',
      base_points: '10', plan_hours: '5'
    }]);

    // WO query
    mockTx.mockResolvedValueOnce([{
      wo_id: 101, nomor: 'WO-101', disetujui: new Date('2026-09-01'),
      actual_hours: '5', unit_factor: '1.0', work_condition_factor: '1.0',
      timeliness_factor: '1.0', timeliness_status: 'on_time', safety_factor: '1.0',
      mtbf_factor: '1.0', final_points: '10'
    }]);

    // Dilewati query (count)
    mockTx.mockResolvedValueOnce([{ n: 0 }]);

    // Factors query
    mockTx.mockResolvedValueOnce([
      { factor_key: 'on_time', factor_value: '1.0' },
      { factor_key: 'late', factor_value: '0.8' }
    ]);

    // Payment (mechanic_points) query
    mockTx.mockResolvedValueOnce([
      { work_order_id: 101, idr_per_point: '2500', idr_value: '25000' }
    ]);

    const res = await pratinjauSurut(1, 1, 20, 5); // basePoint 10 -> 20

    expect(res.rupiahSekarang).toBe(25000);
    expect(res.rupiahSesudah).toBe(50000); // 20 * 2500
    expect(res.terpengaruh).toBe(1);
    expect(res.basePointLama).toBe(10);
    expect(res.basePointBaru).toBe(20);
  });
});
