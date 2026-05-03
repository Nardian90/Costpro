import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') return new Response(null, { status: 401 });
    return handler(req, { user: { id: 'u1' } });
  }
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn()
  }
}));

describe('GET /api/system-health', () => {
  it('retorna 401 sin sesión', async () => {
    const req = new NextRequest('http://localhost/api/system-health', { headers: { 'Authorization': 'Bearer null' } });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('retorna métricas de salud con status 200', async () => {
    const req = new NextRequest('http://localhost/api/system-health', { headers: { 'Authorization': 'Bearer valid' } });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.shi).toBeDefined();
    expect(json.mri).toBeDefined();
  });
});
