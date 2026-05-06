import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') return new Response(JSON.stringify({ error: '401' }), { status: 401 });
    return handler(req, { user: { id: 'u1' } });
  }
}));

vi.mock('fs', () => ({
  default: {
    appendFileSync: vi.fn()
  }
}));

const makeRequest = (body: any, token: string | null = 'valid') => {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new NextRequest('http://localhost/api/logs', { method: 'POST', body: JSON.stringify(body), headers });
};

describe('POST /api/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const req = makeRequest({}, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna success: true y escribe en fs', async () => {
    const req = makeRequest({ context: 'TEST', error: { message: 'some error' } });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(fs.appendFileSync).toHaveBeenCalled();
  });

  it('ignora silenciosamente si falla fs (retorna 200)', async () => {
    vi.mocked(fs.appendFileSync).mockImplementationOnce(() => { throw new Error('No write perms'); });
    const req = makeRequest({ context: 'TEST', error: { message: 'err' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
