import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { value: { user: { id: "admin-1", role: "admin", memberships: [] } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: string, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
  getServerSession: async () => mockSession.value,
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/rate-limit/tenant-limiter', () => ({
  checkTenantRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitHeaders: () => ({}),
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: msg || code, key: code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit/tenant-limiter', () => ({
  checkTenantRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitHeaders: () => ({}),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: any) => mockRpc(name, args),
  })),
}));

import { POST } from '@/app/api/stores/bulk/route';
import { getServerSession } from '@/lib/auth';

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: { get: (name: string) => (name === 'x-forwarded-for' ? '127.0.0.1' : (name === 'Authorization' ? 'Bearer token' : null)) },
    json: async () => body,
    url: 'http://localhost:3000/api/stores/bulk',
  } as any;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('POST /api/stores/bulk (F4-T01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1', role: 'admin' }, token: 'token' });
  });

  it('rechaza si el rol no es admin', async () => {
    mockSession.value = { user: { id: 'clerk-1', role: 'clerk', memberships: [] } };
    const req = makeRequest({ storeIds: ['a1111111-1111-4111-8111-111111111111'], action: 'activate' });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('rechaza si el body es inválido (sin storeIds)', async () => {
    const req = makeRequest({ action: 'activate' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si action no es válido', async () => {
    const req = makeRequest({ storeIds: ['a1111111-1111-4111-8111-111111111111'], action: 'invalid' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('activa tiendas y retorna affected real (no inflado)', async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: VALID_UUID }], error: null, count: 1 }),
    }));

    const req = makeRequest({
      storeIds: ['a1111111-1111-4111-8111-111111111111'],
      action: 'activate',
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.affected).toBe(1);
    expect(body.action).toBe('activate');
  });

  it('deactivate cuenta solo tiendas realmente afectadas (FIX-DEUDA)', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue(
          callIdx === 1
            ? { error: null }           // primera tienda: éxito
            : { error: { message: 'RLS blocked' } }  // segunda: falla
        ),
      };
      return chain;
    });

    const req = makeRequest({
      storeIds: [
        'a1111111-1111-4111-8111-111111111111',
        'b2222222-2222-4222-8222-222222222222',
      ],
      action: 'deactivate',
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(body.affected).toBe(1);
    expect(body.failed).toBe(1);
  });
});
