import { describe, expect, it, vi } from 'vitest';
import { buatWorkOrder } from '../../src/domain/workOrder.js';

vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: async ({ jalankan }: { jalankan: any }) => {
    const mockTx: any = vi.fn().mockImplementation(() => Promise.resolve([]));
    return { hasil: await jalankan({ tx: mockTx, tenantId: 1, actorId: 1 }), diulang: false };
  },
  rebutStatus: vi.fn(),
}));

describe('workOrder', () => {
  it('buatWorkOrder menolak jika blok kosong', async () => {
    await expect(buatWorkOrder({
      opId: '12345678',
      tenantId: 1,
      actorId: 1,
      sectionCode: 'field',
      blok: []
    })).rejects.toThrow('Tidak ada WO untuk dibuat');
  });

  it('buatWorkOrder menolak jika pembuat tidak aktif', async () => {
    const mockTx: any = vi.fn().mockResolvedValueOnce([]); // No mechanic found

    await expect(buatWorkOrder({
      opId: '12345678',
      tenantId: 1,
      actorId: 1,
      sectionCode: 'field',
      blok: [{ teamMechanicIds: [1] }]
    })).rejects.toThrow('Mekanik tidak ditemukan');
  });
});
