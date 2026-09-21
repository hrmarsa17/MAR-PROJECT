import { describe, expect, it, vi } from 'vitest';
import { pratinjauTarifSurut, terapkanTarifSurut } from '../../src/domain/surutTarif.js';
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

describe('surutTarif', () => {
  it('pratinjauTarifSurut menolak idrBaru <= 0', async () => {
    await expect(pratinjauTarifSurut(1, 1, 0)).rejects.toThrow('Rupiah per poin harus lebih dari 0');
  });

  it('terapkanTarifSurut menolak idrBaru <= 0', async () => {
    await expect(terapkanTarifSurut({
      opId: '123456789',
      tenantId: 1,
      actorId: 1,
      tarifId: 1,
      idrBaru: 0,
      rupiahSesudahDilihat: 1000
    })).rejects.toThrow('Rupiah per poin harus lebih dari 0');
  });

  it('pratinjauTarifSurut menghitung dampak dengan benar', async () => {
    const mockTx: any = vi.fn();
    mockTx.json = vi.fn((val) => val);
    (sql.begin as any).mockImplementationOnce((cb: any) => cb(mockTx));

    // Pay rates query
    mockTx.mockResolvedValueOnce([{
      posisi: 'junior',
      label: 'Junior Mechanic',
      idr_per_point: '2000'
    }]);

    // Mechanic points query
    mockTx.mockResolvedValueOnce([{
      work_order_id: 101,
      mechanic_id: 1,
      nama: 'Budi',
      disetujui: new Date('2026-09-01'),
      points: '10',
      idr_per_point: '2000',
      idr_value: '20000',
      final_points: '10'
    }]);

    const res = await pratinjauTarifSurut(1, 1, 2500);

    expect(res.rupiahSekarang).toBe(20000);
    expect(res.rupiahSesudah).toBe(25000); // 10 * 2500
    expect(res.adaGeser).toBe(true);
    expect(res.terpengaruh).toBe(1);
  });
});
