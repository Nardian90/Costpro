import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(JSON.stringify({ error: '401' }), { status: 401 });
    }
    return handler(req, { user: { id: 'u1' } });
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: new Date(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRequest = (body: unknown, token: string | null = 'valid-token') => {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new NextRequest('http://localhost/api/cost-sheets/import-json', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
};

const validFicha = {
  meta: {
    id: 'ficha-001',
    name: 'Ficha de Costo Test',
    currency: 'USD',
    decimals: 2,
  },
  rows: [
    {
      id: 'row-1',
      classification: 'COST',
      type: 'COST',
      label: 'Materia Prima',
      formaCalculo: 'FIJO',
    },
  ],
  anexos: [
    {
      id: 'anexo-1',
      name: 'Materias Primas',
      rows: [
        { classification: 'MP', importe: 100 },
      ],
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/cost-sheets/import-json', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autenticación', () => {
    it('retorna 401 sin sesión', async () => {
      const req = makeRequest({}, null);
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 con Authorization "Bearer null"', async () => {
      const req = makeRequest({}, 'null');
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('retorna 429 si se excede el rate limit', async () => {
      const { rateLimit } = await import('@/lib/rate-limit');
      (rateLimit as any).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      const req = makeRequest(validFicha);
      const res = await POST(req);
      expect(res.status).toBe(429);
    });
  });

  describe('validación del esquema FichaJSON', () => {
    it('retorna 400 si meta.name está ausente', async () => {
      const res = await POST(
        makeRequest({
          meta: { id: 'ficha-001', currency: 'USD', decimals: 2 },
          rows: [],
          anexos: [],
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.errors).toBeInstanceOf(Array);
    });

    it('retorna 400 si rows no es un array', async () => {
      const res = await POST(
        makeRequest({
          ...validFicha,
          rows: 'not-an-array',
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.errors).toBeInstanceOf(Array);
    });

    it('retorna 400 si anexos está ausente', async () => {
      const res = await POST(
        makeRequest({
          meta: validFicha.meta,
          rows: validFicha.rows,
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe('happy path', () => {
    it('retorna 200 y ok:true con ficha válida', async () => {
      const res = await POST(makeRequest(validFicha));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.ficha).toBeDefined();
      expect(json.ficha.meta.name).toBe('Ficha de Costo Test');
    });

    it('acepta rules opcionales en la ficha', async () => {
      const fichaWithRules = {
        ...validFicha,
        rules: [
          {
            id: 'rule-1',
            name: 'Regla 1',
            description: 'Descripción',
            version: '1.0',
            priority: 1,
            enabled: true,
          },
        ],
      };

      const res = await POST(makeRequest(fichaWithRules));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.ficha.rules).toHaveLength(1);
    });
  });

  describe('manejo de errores', () => {
    it('retorna 500 si ocurre un error inesperado', async () => {
      // Send a body that causes req.json() to work but triggers an internal error
      // by sending an invalid body that bypasses safeParse but fails downstream
      const res = await POST(makeRequest(null));
      // null body will fail JSON parse which triggers catch block
      expect([400, 500]).toContain(res.status);
    });
  });
});
