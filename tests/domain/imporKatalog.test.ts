import { describe, expect, it, vi } from 'vitest';
import { terapkanImpor } from '../../src/domain/imporKatalog.js';

const mockJalankan = vi.fn();

vi.mock('../../src/domain/runCommand.js', () => ({
  jalankanPerintah: (...a: unknown[]) => mockJalankan(...a),
}));

vi.mock('../../src/domain/admin.js', () => ({
  pastikanAdmin: vi.fn(),
}));

describe('imporKatalog', () => {
  it('terapkanImpor menolak baris kosong', async () => {
    const tx = vi.fn() as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));

    await expect(terapkanImpor({
      opId: '12345678', tenantId: 1, actorId: 1, jenis: 'job', sectionCode: 'field', baris: []
    })).rejects.toThrow('Tidak ada baris untuk diterapkan');
  });

  it('terapkanImpor job menolak jika sectionCode kosong', async () => {
    const tx = vi.fn() as any;
    mockJalankan.mockImplementationOnce(async ({ jalankan }: any) =>
      ({ hasil: await jalankan({ tx, tenantId: 1, actorId: 1 }), diulang: false }));

    await expect(terapkanImpor({
      opId: '12345678', tenantId: 1, actorId: 1, jenis: 'job', sectionCode: null,
      baris: [{ job_id: 'J1', unit_model: '', component: '', sub_component: '', job_description: 'Test', plan_hours: 1, base_point: 10, job_type: '', is_active: true }]
    })).rejects.toThrow('Section wajib dipilih untuk impor job');
  });
});
