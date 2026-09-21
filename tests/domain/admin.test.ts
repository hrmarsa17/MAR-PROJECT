import { describe, expect, it, vi } from 'vitest';
import { pastikanAdmin } from '../../src/domain/admin.js';

describe('admin', () => {
  it('pastikanAdmin menolak jika may_admin false', async () => {
    const mockTx = vi.fn().mockResolvedValueOnce([{ boleh: false }]) as any;
    await expect(pastikanAdmin(mockTx, 1)).rejects.toThrow('Menu Admin hanya untuk yang diberi hak admin.');
  });

  it('pastikanAdmin lolos jika may_admin true', async () => {
    const mockTx = vi.fn().mockResolvedValueOnce([{ boleh: true }]) as any;
    await expect(pastikanAdmin(mockTx, 1)).resolves.toBeUndefined();
  });
});
