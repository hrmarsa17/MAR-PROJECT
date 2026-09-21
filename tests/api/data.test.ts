import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/api/_bantu.js', () => ({
  akuDari: vi.fn(async () => ({ tenantId: 1, mechanicId: 10, peran: 'supervisor' })),
  jawab: vi.fn((data, status = 200) => Response.json({ ok: true, data }, { status })),
  jawabGalat: vi.fn((e) => Response.json({ ok: false, pesan: e.message }, { status: 400 })),
}));

vi.mock('../../src/domain/kueri.js', () => ({
  antreanApproval: vi.fn(async () => []),
  katalog: vi.fn(async () => ({ jobs: [], units: [] })),
  rincianWo: vi.fn(async () => ({})),
  statusKiriman: vi.fn(async () => ({})),
  woSaya: vi.fn(async () => []),
}));

import { GET } from '../../src/app/api/data/route.js';

describe('GET /api/data', () => {
  it('mengembalikan identitas untuk jenis aku', async () => {
    const req = new Request('http://localhost/api/data?jenis=aku');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.peran).toBe('supervisor');
  });

  it('mengembalikan katalog untuk jenis katalog', async () => {
    const req = new Request('http://localhost/api/data?jenis=katalog');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.jobs).toBeDefined();
  });
});
