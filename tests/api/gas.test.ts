import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/backendConfig.js', () => ({
  pakaiAppsScript: vi.fn(() => false),
  dapatkanAppscriptUrl: vi.fn(() => 'https://script.google.com/test/exec'),
}));

vi.mock('../../src/lib/supabaseCerminReader.js', () => ({
  bacaPingSupabase: vi.fn(async (token: string) => ({
    success: true,
    result: {
      mechanic_id: 'SPV-001',
      name: 'Supervisor Maintenance',
      role: 'supervisor',
      email: 'spv@example.com',
      section: 'maintenance',
      tenant_code: 'KMB'
    },
    source: 'SUPABASE'
  })),
  bacaCreateRefsSupabase: vi.fn(async () => ({
    success: true,
    source: 'SUPABASE',
    result: {
      refs: {
        sections: ['maintenance'],
        units: [{ unit_id: 'DLCD50001', unit_name: 'DLCD50001' }],
        mechanics: [{ mechanic_id: 'MNT-002', mechanic_name: 'Mekanik Maintenance 2' }],
        components: [{ component_no: 'JOB-1001', component_name: 'Cleaning' }]
      }
    }
  })),
  bacaMonitoringSupabase: vi.fn(async () => ({
    success: true,
    source: 'SUPABASE',
    result: {
      overall: { total_mechanics: 20 },
      mechanics: []
    }
  })),
  bacaMyWosSupabase: vi.fn(async () => ({
    success: true,
    source: 'SUPABASE',
    result: { wos: [] }
  })),
  bacaWosByStatusSupabase: vi.fn(async () => ({
    success: true,
    source: 'SUPABASE',
    result: { wos: [] }
  })),
}));

import { POST } from '../../src/app/api/gas/route.js';

describe('POST /api/gas (Dual Engine Gateway)', () => {
  it('membaca data ping langsung dari Supabase saat BACKEND_DRIVER=supabase', async () => {
    const req = new Request('http://localhost/api/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '52fdb552231348ffb14a', action: 'ping' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-MAR-Backend')).toBe('SUPABASE');

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.source).toBe('SUPABASE');
    expect(json.result.name).toBe('Supervisor Maintenance');
    expect(json.result.role).toBe('supervisor');
  });

  it('membaca pull_create_refs langsung dari Supabase saat BACKEND_DRIVER=supabase', async () => {
    const req = new Request('http://localhost/api/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '52fdb552231348ffb14a', action: 'pull_create_refs' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-MAR-Backend')).toBe('SUPABASE');

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.source).toBe('SUPABASE');
    expect(json.result.refs.units.length).toBe(1);
  });

  it('beralih langsung ke Google Sheets (GAS) saat X-Active-Engine: SPREADSHEET diminta', async () => {
    // Mock global fetch for GAS endpoint
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: true, source: 'SPREADSHEET', result: { ping: 'ok from sheets' } }),
    })) as any;

    try {
      const req = new Request('http://localhost/api/gas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Active-Engine': 'SPREADSHEET',
        },
        body: JSON.stringify({ token: '52fdb552231348ffb14a', action: 'ping' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Active-Engine')).toBe('SPREADSHEET');
      expect(res.headers.get('X-MAR-Backend')).toBe('GAS');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.source).toBe('SPREADSHEET');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

