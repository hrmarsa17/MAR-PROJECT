import { describe, expect, it, vi } from 'vitest';
import { simpanJob, simpanTarif, simpanFaktor } from '../../src/domain/admin.js';

const mockJalankan = vi.fn();

vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: (...a: unknown[]) => mockJalankan(...a),
}));

describe('admin operasi tambahan', () => {
  it('simpanJob menolak basePoints <= 0', async () => {
    const tx = vi.fn().mockResolvedValueOnce([{ boleh: true }]) as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));

    await expect(simpanJob({
      opId: '12345678', tenantId: 1, actorId: 1,
      basePoints: 0, planHours: 5, aktif: true
    })).rejects.toThrow('Base point harus lebih dari 0');
  });

  it('simpanTarif menolak idrPerPoint <= 0', async () => {
    const tx = vi.fn().mockResolvedValueOnce([{ boleh: true }]) as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));

    await expect(simpanTarif({
      opId: '12345678', tenantId: 1, actorId: 1,
      id: 1, idrPerPoint: -100, aktif: true
    })).rejects.toThrow('Rupiah per poin harus lebih dari 0');
  });

  it('simpanFaktor menolak nilai negatif', async () => {
    const tx = vi.fn().mockResolvedValueOnce([{ boleh: true }]) as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));

    await expect(simpanFaktor({
      opId: '12345678', tenantId: 1, actorId: 1,
      id: 1, nilai: -0.5
    })).rejects.toThrow('Nilai faktor tidak boleh negatif');
  });
});
