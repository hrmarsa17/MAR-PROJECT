import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/perintah/route.js';

vi.mock('../../src/app/api/_bantu.js', () => ({
  akuDari: vi.fn(async () => ({ tenantId: 1, mechanicId: 10, peran: 'supervisor' })),
  jawab: vi.fn((data, status = 200) => Response.json({ ok: true, data }, { status })),
  jawabGalat: vi.fn((e) => Response.json({ ok: false, pesan: e.message }, { status: 400 })),
  pasangCookieSesi: vi.fn(),
}));

vi.mock('../../src/domain/workOrder.js', () => ({
  buatWorkOrder: vi.fn(async () => ({ hasil: { dibuat: [{ id: 1, woNumber: 'WO-001' }] }, diulang: false })),
}));

describe('POST /api/perintah', () => {
  it('menolak body yang tidak valid', async () => {
    const req = new Request('http://localhost/api/perintah', {
      method: 'POST',
      body: JSON.stringify({ aksi: 'aksi_palsu' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('menjalankan aksi buat_wo dengan sukses', async () => {
    const req = new Request('http://localhost/api/perintah', {
      method: 'POST',
      body: JSON.stringify({
        aksi: 'buat_wo',
        op_id: '12345678',
        data: {
          sectionCode: 'field',
          blok: [{
            jobId: 1,
            unitId: 2,
            teamMechanicIds: [10],
          }],
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
