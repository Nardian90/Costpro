import { describe, it, expect, vi, beforeEach } from 'vitest';

// First mock withTracing BEFORE importing POST
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => (req: any, context: any) => handler(req, context?.session || { user: { role: 'admin', id: 'u1' } }, context),
  withRole: (role: any, handler: any) => (req: any, context: any) => handler(req, context?.session || { user: { role: 'admin', id: 'u1' } }, context),
  AuthenticatedSession: {},
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
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1', role: 'admin' }, token: 'token' });
  });

  it('rechaza si el rol no es admin', async () => {
    const req = makeRequest({ storeIds: [VALID_UUID], action: 'activate' });
    const res = await POST(req as any, { session: { user: { role: 'clerk', id: 'u1' } } } as any);
    expect(res.status).toBe(403);
  });

  it('rechaza si el body es inválido (sin storeIds)', async () => {
    const req = makeRequest({ action: 'activate' });
    const res = await POST(req as any, { session: { user: { role: 'admin', id: 'u1' } } } as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si action no es válido', async () => {
    const req = makeRequest({ storeIds: [VALID_UUID], action: 'invalid' });
    const res = await POST(req as any, { session: { user: { role: 'admin', id: 'u1' } } } as any);
    expect(res.status).toBe(400);
  });

  it('activa tiendas y retorna affected real (no inflado)', async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: VALID_UUID }], error: null, count: 1 }),
    }));

    const req = makeRequest({
      storeIds: [VALID_UUID],
      action: 'activate',
    });
    const res = await POST(req as any, { session: { user: { role: 'admin', id: 'u1' } } } as any);

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
          ? { data: [{ id: VALID_UUID }], error: null, count: 1 }
          : { data: [], error: null, count: 0 }
      ),
    }));

    const req = makeRequest({
      storeIds: [
        VALID_UUID,
        '550e8400-e29b-41d4-a716-446655440001',
      ],
      action: 'deactivate',
    });
    const res = await POST(req as any, { session: { user: { role: 'admin', id: 'u1' } } } as any);
    const body = await res.json();

    expect(body.affected).toBe(1);
    expect(body.failed).toBe(1);
  });
});
