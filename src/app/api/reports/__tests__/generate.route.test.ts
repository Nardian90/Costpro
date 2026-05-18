import { NextRequest } from 'next/server';
import { POST } from '../generate/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: vi.fn().mockImplementation((handler) => handler),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withRole: vi.fn().mockImplementation((role, handler) => {
    return async (req: any, context: any) => {
       const mockSession = { user: { id: 'u1', role: 'admin', roles: ['admin'], memberships: [] }, token: 'token' };
       return handler(req, mockSession);
    };
  }),
  withAuth: vi.fn().mockImplementation((handler) => {
    return async (req: any, context: any) => {
       const mockSession = { user: { id: 'u1', role: 'admin', roles: ['admin'], memberships: [] }, token: 'token' };
       return handler(req, mockSession);
    };
  }),
}));

vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn().mockReturnValue(true),
  hasRole: vi.fn().mockReturnValue(true),
}));


vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'u1' }, token: 'token' })
}));

vi.mock('@/lib/supabaseClient', () => {
  const mock: any = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://pdf' } })
      })
    }
  };
  return {
    getSupabaseAuthClient: vi.fn().mockReturnValue(mock)
  };
});

// Mock lazy-pdf
vi.mock('@/lib/export/lazy-pdf', () => {
  const MockDoc: any = vi.fn().mockImplementation(function() {
    return {
      internal: {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
      },
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
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
    createPDFDocument: vi.fn().mockImplementation(async () => new MockDoc()),
  };
});

vi.mock('date-fns', () => ({
  format: vi.fn().mockReturnValue('2025-01-01 00:00:00'),
}));
vi.mock('date-fns/locale', () => ({
  es: {},
}));

describe('POST /api/reports/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('genera reporte exitosamente', async () => {
    const req = new NextRequest('http://localhost/api/reports/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({ type: 'inventory', name: 'Test', columns: ['id'] })
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.url).toBe('http://pdf');
  });

  it('genera reporte de ficha de costo exitosamente', async () => {
    const req = new NextRequest('http://localhost/api/reports/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({
        type: 'cost-sheet',
        data: {
          header: { name: 'Test Pizza', code: 'P01', date: '2025-01-01', unit: 'U', quantity: 1, currency: 'CUP', category: 'Food' },
          sections: []
        },
        calculatedValues: {},
        calculatedAnnexes: []
      })
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
