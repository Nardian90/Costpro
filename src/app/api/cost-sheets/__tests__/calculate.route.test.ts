import { NextRequest } from 'next/server';
import { POST } from '../calculate/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock auth and rate limit
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }
    return handler(req, { user: { id: 'user-1' }, token: 'valid-token' });
  }
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() })
}));

vi.mock('@/lib/cost-engine', () => ({
  calculateFicha: vi.fn().mockReturnValue({ total: 100, rows: [] }),
  validateFicha: vi.fn().mockReturnValue({ valid: true, errors: [] })
}));

vi.mock('@/lib/cost-engine/schemas', () => ({
  FichaJSONSchema: {
    safeParse: vi.fn((data: any) => {
      if (data.invalid) return { success: false, error: { issues: [{ path: ['field'], message: 'invalid' }] } };
      return { success: true, data };
    })
  }
}));

const makeAuthenticatedRequest = (url: string, options: any = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer valid-token');
  return new NextRequest(`http://localhost${url}`, { ...options, headers });
};

describe('POST /api/cost-sheets/calculate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión válida', async () => {
    const req = new NextRequest('http://localhost/api/cost-sheets/calculate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer null' }
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  describe('rate limiting', () => {
    it('retorna 429 cuando el cliente excedió el límite', async () => {
      const { rateLimit } = await import('@/lib/rate-limit');
      const resetAt = new Date(Date.now() + 30000);
      vi.mocked(rateLimit).mockResolvedValueOnce({
        allowed: false, remaining: 0, resetAt
      });

      const req = makeAuthenticatedRequest('/api/cost-sheets/calculate', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' })
      });
      const res = await POST(req);

      expect(res.status).toBe(429);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(res.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('validación Zod', () => {
    it('retorna 400 con lista de errores cuando el body no cumple el schema', async () => {
      const req = makeAuthenticatedRequest('/api/cost-sheets/calculate', {
        method: 'POST',
        body: JSON.stringify({ invalid: true })
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.errors).toBeDefined();
    });
  });

  describe('cálculo', () => {
    it('retorna 200 con ok:true y los resultados del cálculo para una ficha válida', async () => {
      const fichaValida = { name: 'Ficha Test', sections: [] };
      const req = makeAuthenticatedRequest('/api/cost-sheets/calculate', {
        method: 'POST',
        body: JSON.stringify(fichaValida)
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.total).toBe(100);
    });

    it('retorna 400 si la validación semántica falla', async () => {
      const { validateFicha } = await import('@/lib/cost-engine');
      vi.mocked(validateFicha).mockReturnValueOnce({ valid: false, errors: ['Error semántico'] } as any);

      const req = makeAuthenticatedRequest('/api/cost-sheets/calculate', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ficha' })
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.errors).toContain('Error semántico');
    });

    it('retorna 500 si calculateFicha lanza excepción inesperada', async () => {
      const { calculateFicha } = await import('@/lib/cost-engine');
      vi.mocked(calculateFicha).mockImplementationOnce(() => { throw new Error('Crash'); });

      const req = makeAuthenticatedRequest('/api/cost-sheets/calculate', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ficha' })
      });
      const res = await POST(req);

      expect(res.status).toBe(500);
      expect((await res.json()).errors).toContain('Error interno en el motor de cálculo');
    });
  });
});
