import { describe, expect, it, vi } from 'vitest';

const mockJalankan = vi.fn();
vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: (...a: unknown[]) => mockJalankan(...a),
}));
vi.mock('../../src/domain/nilaiEfektif.js', () => ({
  nilaiEfektif: vi.fn(async () => ({
    basePoints: 10, targetHours: 5, actualHours: 5, unitFactor: 1,
    workCondition: 'normal', safetyIncident: false, mtbfRedoStatus: null,
    team: [{ mechanicId: 1, idrPerPoint: 2500 }], sectionId: 1,
  })),
}));

import { simpanOverride } from '../../src/domain/override.js';

function txForOverride() {
  const fn: any = vi.fn(async (s: TemplateStringsArray) => {
    const q = s.join(' ');
    if (q.includes('SELECT role')) return [{ role: 'supervisor' }];
    if (q.includes('FOR UPDATE')) return [{ id: 1, status: 'pending_supervisor', wo_number: 'WO1', section_id: 1, partial_hours: '0', is_manual: false }];
    if (q.includes('mechanic_sections')) return [];
    if (q.includes('work_order_overrides')) return [];
    if (q.includes('start_time')) return [{ start_time: null, end_time: null, session_hours: null }];
    if (q.includes('SELECT EXISTS') && q.includes('factors')) return [{ ada: true }];
    return [];
  });
  fn.json = (v: unknown) => v;
  return fn;
}

describe('override', () => {
  it('menolak base points negatif', async () => {
    const tx = txForOverride();
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) => ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    await expect(simpanOverride({ opId: '12345678', tenantId: 1, actorId: 1, woId: 1, basePoints: -5 })).rejects.toThrow('tidak boleh negatif');
  });
  it('menolak target hours melampaui batas', async () => {
    const tx = txForOverride();
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) => ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    await expect(simpanOverride({ opId: '12345678', tenantId: 1, actorId: 1, woId: 1, targetHours: 5000 })).rejects.toThrow('melampaui batas wajar');
  });
  it('menolak tim kosong', async () => {
    const tx = txForOverride();
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) => ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));
    await expect(simpanOverride({ opId: '12345678', tenantId: 1, actorId: 1, woId: 1, team: [] })).rejects.toThrow('Tim tidak boleh kosong');
  });
});
