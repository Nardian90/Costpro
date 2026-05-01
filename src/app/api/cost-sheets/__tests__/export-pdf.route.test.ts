import { NextRequest } from 'next/server';
import { POST } from '../export-pdf/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock auth middleware
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
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() })
}));

// Mock jsPDF and autoTable
const MockJsPDF = vi.fn().mockImplementation(function() {
  return {
    internal: { pageSize: { width: 210, height: 297, getWidth: () => 210, getHeight: () => 297 } },
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    autoTable: vi.fn(),
    output: vi.fn().mockReturnValue(new ArrayBuffer(8)),
    lastAutoTable: { finalY: 100 }
  };
});

vi.mock('jspdf', () => ({
  jsPDF: MockJsPDF,
  default: MockJsPDF
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn()
}));

const makeAuthenticatedRequest = (body: any) => {
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
    const { default: jsPDF } = await import('jspdf');
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

    expect(jsPDF).toHaveBeenCalledWith('l', 'mm', 'a4');
  });

  it('retorna 500 si ocurre un error inesperado', async () => {
    // Simular error al parsear JSON por ejemplo
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'Authorization': 'Bearer valid-token' }
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
