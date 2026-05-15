import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../export-pdf/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn().mockImplementation(async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') {
      return null;
    }
    return { user: { id: 'user-1' }, token: 'valid-token' };
  }),
  authOptions: {}
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() })
}));

// Mock lazy-pdf
vi.mock('@/lib/export/lazy-pdf', () => {
  const MockDoc: any = vi.fn().mockImplementation(function(orientation?: string) {
    return {
      internal: {
        pageSize: {
          width: orientation === 'l' ? 297 : 210,
          height: orientation === 'l' ? 210 : 297,
        },
      },
      setFontSize: vi.fn(),
      setFont: vi.fn(),
      setTextColor: vi.fn(),
      text: vi.fn(),
      line: vi.fn(),
      addPage: vi.fn(),
      setDrawColor: vi.fn(),
      setPage: vi.fn(),
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

vi.mock('@/lib/observability', () => ({
  withTracing: (fn: any) => fn
}));

const validBody = {
  data: {
    header: { name: 'Test' },
    sections: []
  },
  calculatedValues: {}
};

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

  it('permite descarga sin sesión activa (fallback a IP/anonymous)', async () => {
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer null' },
      body: JSON.stringify(validBody)
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('retorna Content-Type: application/pdf en el header cuando está autenticado', async () => {
    const req = makeAuthenticatedRequest(validBody);
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

  it('retorna 400 si el cuerpo es inválido', async () => {
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'Authorization': 'Bearer valid-token' }
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
