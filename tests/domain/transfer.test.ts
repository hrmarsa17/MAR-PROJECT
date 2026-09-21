import { describe, expect, it, vi } from 'vitest';
import { mintaTransfer } from '../../src/domain/transfer.js';

const mockJalankan = vi.fn();
const mockRebut = vi.fn();

vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: (...a: unknown[]) => mockJalankan(...a),
  rebutStatus: (...a: unknown[]) => mockRebut(...a),
}));

describe('transfer', () => {
  it('mintaTransfer menolak jika WO tidak ditemukan', async () => {
    const tx = vi.fn(async () => []) as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    
    await expect(mintaTransfer({
      opId: '12345678', tenantId: 1, actorId: 1, woId: 1, sessionStart: '2026-09-21T08:00:00Z'
    })).rejects.toThrow('Work order tidak ditemukan');
  });

  it('mintaTransfer menolak jika status tidak sah', async () => {
    // Return WO but NO menggantung (transfers)
    const tx = vi.fn()
      .mockResolvedValueOnce([{ id: 1, wo_number: 'WO1', status: 'approved' }]) // WO check
      .mockResolvedValueOnce([]); // menggantung check
    
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    
    await expect(mintaTransfer({
      opId: '12345678', tenantId: 1, actorId: 1, woId: 1, sessionStart: '2026-09-21T08:00:00Z'
    })).rejects.toThrow('Transfer hanya bisa dari WO yang sedang dikerjakan');
  });
});
