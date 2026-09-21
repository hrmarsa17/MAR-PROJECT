import { describe, expect, it, vi } from 'vitest';
import { nilaiEfektif } from '../../src/domain/nilaiEfektif.js';
import { tidakDitemukan } from '../../src/lib/errors.js';

describe('nilaiEfektif', () => {
  const mockTx = vi.fn();

  it('melempar error jika WO tidak ditemukan', async () => {
    mockTx.mockResolvedValueOnce([]);
    await expect(nilaiEfektif(mockTx as any, 123)).rejects.toThrow(tidakDitemukan('Work order', 123).message);
  });

  it('menggunakan nilai katalog jika tidak ada override', async () => {
    // Mock WO query
    mockTx.mockResolvedValueOnce([{
      id: 1,
      is_manual: false,
      job_base_points: '10',
      job_plan_hours: '5',
      unit_unit_factor: '1.2',
      work_condition: 'normal',
      session_hours: '3',
      partial_hours: '1',
      section_id: '101',
      safety_incident: false,
      mtbf_redo_status: null
    }]);
    // Mock Overrides query
    mockTx.mockResolvedValueOnce([]);
    // Mock Team query
    mockTx.mockResolvedValueOnce([{ mechanic_id: 1 }]);
    // Mock Pay Rate query - sekarang memakai single query dengan ANY
    mockTx.mockResolvedValueOnce([{ mechanic_id: 1, idr_per_point: '2500' }]);

    const hasil = await nilaiEfektif(mockTx as any, 1);

    expect(hasil.basePoints).toBe(10);
    expect(hasil.targetHours).toBe(5);
    expect(hasil.actualHours).toBe(4); // 3 + 1
    expect(hasil.unitFactor).toBe(1.2);
    expect(hasil.team).toEqual([{ mechanicId: 1, idrPerPoint: 2500 }]);
  });

  it('prioritas override L2 di atas L1', async () => {
    mockTx.mockResolvedValueOnce([{
      id: 1,
      is_manual: false,
      job_base_points: '10',
      job_plan_hours: '5',
      section_id: '101'
    }]);
    mockTx.mockResolvedValueOnce([
      { level: 'supervisor', kind: 'base_points', value: '15' },
      { level: 'superintendent', kind: 'base_points', value: '20' }
    ]);
    mockTx.mockResolvedValueOnce([{ mechanic_id: 1 }]);
    mockTx.mockResolvedValueOnce([{ idr_per_point: '2500' }]);

    const hasil = await nilaiEfektif(mockTx as any, 1);
    expect(hasil.basePoints).toBe(20);
  });

  it('menggunakan nilai manual untuk WO Others', async () => {
    mockTx.mockResolvedValueOnce([{
      id: 1,
      is_manual: true,
      manual_base_points: '50',
      manual_target_hours: '10',
      manual_unit_factor: '1.5',
      section_id: '101'
    }]);
    mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([{ mechanic_id: 1 }]);
    mockTx.mockResolvedValueOnce([{ idr_per_point: '2500' }]);

    const hasil = await nilaiEfektif(mockTx as any, 1);
    expect(hasil.basePoints).toBe(50);
    expect(hasil.targetHours).toBe(10);
    expect(hasil.unitFactor).toBe(1.5);
  });
});
