import { describe, expect, it, vi } from 'vitest';
import { pratinjauFaktorSurut, terapkanFaktorSurut } from '../../src/domain/surutFaktor.js';
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

describe('surutFaktor', () => {
  it('pratinjauFaktorSurut menolak nilaiBaru < 0', async () => {
    await expect(pratinjauFaktorSurut(1, 1, -1)).rejects.toThrow('Nilai faktor tidak boleh negatif');
  });

  it('terapkanFaktorSurut menolak nilaiBaru < 0', async () => {
    await expect(terapkanFaktorSurut({
      opId: '123456789',
      tenantId: 1,
      actorId: 1,
      faktorId: 1,
      nilaiBaru: -1,
      rupiahSesudahDilihat: 1000
    })).rejects.toThrow('Nilai faktor tidak boleh negatif');
  });
});
