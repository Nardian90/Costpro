import { NextRequest } from 'next/server';
import { POST } from '../export-pdf/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock auth middleware
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: (req: NextRequest, session: any) => Promise<Response>) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }
    return handler(req, { user: { id: 'user-1' }, token: 'valid-token' } as any);
  }
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() })
}));

// Mock lazy-pdf (the actual module used by the route)
vi.mock('@/lib/export/lazy-pdf', () => {
  const MockDoc: any = vi.fn().mockImplementation(function(orientation?: string, unit?: string, format?: string) {
    return {
      internal: {
        pageSize: {
          width: orientation === 'l' ? 297 : 210,
          height: orientation === 'l' ? 210 : 297,
          getWidth: () => orientation === 'l' ? 297 : 210,
          getHeight: () => orientation === 'l' ? 210 : 297,
        },
      },
      setFontSize: vi.fn(),
      setFont: vi.fn(),
      setTextColor: vi.fn(),
      text: vi.fn(),
      line: vi.fn(),
      addPage: vi.fn(),
      setDrawColor: vi.fn(),
      output: vi.fn().mockReturnValue(new ArrayBuffer(8)),
      getNumberOfPages: vi.fn().mockReturnValue(1),
      lastAutoTable: { finalY: 100 },
      autoTable: vi.fn(),
    };
  });
  return {
    createPDFDocument: vi.fn().mockImplementation(async (...args: unknown[]) => new MockDoc(...args)),
  };
});

vi.mock('@/lib/cost-engine/parser-factory', () => ({
  createSafeParser: vi.fn().mockReturnValue({
    evaluate: vi.fn().mockReturnValue(0),
  }),
}));

vi.mock('@/store/scenario-store', () => ({
  mergeScenarioValues: vi.fn().mockImplementation((data) => data),
}));

const makeAuthenticatedRequest = (body: Record<string, unknown>) => {
  const headers = new Headers();
  headers.set('Authorization', 'Bearer valid-token');
  return new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
    method: 'POST',
    body: JSON.stringify(body),
    headers
  });
};

describe('POST /api/cost-sheets/export-pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer null' }
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna Content-Type: application/pdf en el header', async () => {
    const body = {
      result: {
        header: { name: 'Test' },
        rows: []
      }
    };
    const req = makeAuthenticatedRequest(body);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('cuando exportMode = "comparison", usa orientación landscape', async () => {
    const { createPDFDocument } = await import('@/lib/export/lazy-pdf');
    const body = {
      exportMode: 'comparison',
      comparisonData: {
        sections: [],
        scenarios: [],
        calcs: {},
        baseId: 'v1'
      },
      activeScenarioIds: ['v1', 'v2']
    };

    const req = makeAuthenticatedRequest(body);
    await POST(req);

    expect(createPDFDocument).toHaveBeenCalledWith('l', 'mm', 'a4');
  });

  it('retorna 500 si ocurre un error inesperado', async () => {
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'Authorization': 'Bearer valid-token' }
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
