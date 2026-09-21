import { describe, expect, it, vi } from 'vitest';

const mockJalankan = vi.fn();
const mockRebut = vi.fn();

vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: (...a: unknown[]) => mockJalankan(...a),
  rebutStatus: (...a: unknown[]) => mockRebut(...a),
}));

vi.mock('../../src/domain/nilaiEfektif.js', () => ({
  nilaiEfektif: vi.fn(async () => ({
    basePoints: 10, targetHours: 5, actualHours: 5, unitFactor: 1,
    workCondition: 'normal', safetyIncident: false, mtbfRedoStatus: null,
    team: [{ mechanicId: 1, idrPerPoint: 2500 }], sectionId: 1,
  })),
  muatFaktor: vi.fn(async () => ({
    workCondition: {}, timeliness: { on_time: 1, late: 0.8, way_late: 0.5 },
    safety: { no_incident: 1, incident: 0 }, mtbf: { first_time: 1.2, redo: 0.8 },
  })),
}));

import { approveL1 } from '../../src/domain/approval.js';

describe('approval', () => {
  it('approveL1 menolak jika bukan supervisor', async () => {
    const tx = vi.fn(async () => [{ role: 'mechanic' }]) as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    await expect(approveL1({ opId: '12345678', tenantId: 1, actorId: 1, woId: 1 }))
      .rejects.toThrow('Hanya L1 atau L2');
  });

  it('approveL1 sukses ubah status', async () => {
    const tx: any = vi.fn()
      .mockResolvedValueOnce([{ role: 'supervisor' }])
      .mockResolvedValueOnce({ id: 101, section_id: 1 }) // rebutStatus returns
      .mockResolvedValueOnce([{ ada: true }]); // pastikanBolehSection
    tx.json = vi.fn((v) => v);
    mockRebut.mockResolvedValueOnce({ id: 101, section_id: 1 });
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    const r = await approveL1({ opId: '12345678', tenantId: 1, actorId: 1, woId: 101 });
    expect(r.hasil.status).toBe('pending_superintendent');
  });
});
