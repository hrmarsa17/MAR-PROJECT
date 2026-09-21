import { describe, expect, it, vi } from 'vitest';
import { POST, DELETE } from '../../src/app/api/masuk/route.js';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    delete: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock('../../src/lib/auth.js', () => ({
  identitasDariToken: vi.fn(async (token: string) => {
    if (token === 'valid-token') return { id: 1, name: 'Budi' };
    throw new Error('Token tidak valid');
  }),
}));

describe('/api/masuk', () => {
  it('POST mengembalikan 200 untuk token valid', async () => {
    const req = new Request('http://localhost/api/masuk', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('Budi');
  });

  it('POST mengembalikan 400 untuk token invalid', async () => {
    const req = new Request('http://localhost/api/masuk', {
      method: 'POST',
      body: JSON.stringify({ token: 'invalid' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('DELETE menghapus cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
  });
});
