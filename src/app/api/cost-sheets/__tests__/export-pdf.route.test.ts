import { NextRequest } from 'next/server';
import { POST } from '../export-pdf/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock rate-limit
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
}));

// Mock lazy-pdf
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
      setPage: vi.fn(),
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

const makeRequest = (body: any) => {
  return new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
    method: 'POST',
    body: JSON.stringify(body)
  });
};

describe('POST /api/cost-sheets/export-pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: allow requests
    (rateLimit as any).mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it('retorna 429 si falla el rate limit', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    (rateLimit as any).mockResolvedValue({ allowed: false });

    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('retorna Content-Type: application/pdf en el header', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    const body = {
      result: {
        header: { name: 'Test' },
        rows: []
      }
    };
    const req = makeRequest(body);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('cuando exportMode = "comparison", usa orientación landscape', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
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

    const req = makeRequest(body);
    await POST(req);

    expect(createPDFDocument).toHaveBeenCalledWith('l', 'mm', 'a4');
  });

  it('retorna 500 si ocurre un error inesperado', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    const req = new NextRequest('http://localhost/api/cost-sheets/export-pdf', {
      method: 'POST',
      body: 'invalid-json'
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
