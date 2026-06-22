import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/stores/bulk/route';

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => fn,
  withRole: (_role: string, fn: any) => fn,
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: any) => mockRpc(name, args),
  })),
}));

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/stores/bulk',
  } as any;
}

function makeSession(role: string = 'admin') {
  return { user: { id: 'admin-1', role, memberships: [] } } as any;
}

describe('POST /api/stores/bulk (F4-T01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('rechaza si el rol no es admin', async () => {
    const req = makeRequest({ storeIds: ['s1'], action: 'activate' });
    const res = await POST(req as any, makeSession('clerk'), {} as any);
    expect(res.status).toBe(403);
  });

  it('rechaza si el body es inválido (sin storeIds)', async () => {
    const req = makeRequest({ action: 'activate' });
    const res = await POST(req as any, makeSession('admin'), {} as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si action no es válido', async () => {
    const req = makeRequest({ storeIds: ['s1'], action: 'invalid' });
    const res = await POST(req as any, makeSession('admin'), {} as any);
    expect(res.status).toBe(400);
  });

  it('activa tiendas y retorna affected real (no inflado)', async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null, count: 1 }),
    }));

    const req = makeRequest({
      storeIds: ['00000000-0000-0000-0000-000000000001'],
      action: 'activate',
    });
    const res = await POST(req as any, makeSession('admin'), {} as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.affected).toBe(1);
    expect(body.action).toBe('activate');
  });

  it('deactivate cuenta solo tiendas realmente afectadas (FIX-DEUDA)', async () => {
    let callIdx = 0;
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue(
        callIdx++ === 0
          ? { data: [{ id: 's1' }], error: null, count: 1 }
          : { data: [], error: null, count: 0 }
      ),
    }));

    const req = makeRequest({
      storeIds: [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ],
      action: 'deactivate',
    });
    const res = await POST(req as any, makeSession('admin'), {} as any);
    const body = await res.json();

    expect(body.affected).toBe(1);
    expect(body.failed).toBe(1);
  });
});
