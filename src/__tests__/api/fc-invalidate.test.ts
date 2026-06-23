import { describe, it, expect, vi, beforeEach } from 'vitest';

// First mock withTracing BEFORE importing POST
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => (req: any, context: any) => handler(req, context?.session || { user: { role: 'admin', id: 'admin-1' } }, context),
  withRole: (role: any, handler: any) => (req: any, context: any) => handler(req, context?.session || { user: { role: 'admin', id: 'admin-1' } }, context),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: msg || code, key: code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => mockFrom(table),
  })),
}));

import { POST } from '@/app/api/product-cost-sheets/invalidate/route';
import { getServerSession } from '@/lib/auth';

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: { get: (name: string) => (name === 'x-forwarded-for' ? '127.0.0.1' : (name === 'Authorization' ? 'Bearer token' : null)) },
    json: async () => body,
    url: 'http://localhost:3000/api/product-cost-sheets/invalidate',
  } as any;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('POST /api/product-cost-sheets/invalidate (F3-T05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (getServerSession as any).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' }, token: 'token' });
  });

  it('rechaza si storeId no es UUID válido', async () => {
    const req = makeRequest({ storeId: 'invalid-uuid' });
    const res = await POST(req as any, {} as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si el usuario no es admin ni miembro de la tienda', async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1', role: 'encargado', memberships: [] }, token: 'token' });
    const req = makeRequest({ storeId: VALID_UUID });
    const res = await POST(req as any, { session: { user: { id: 'u1', role: 'encargado', memberships: [] } } } as any);
    expect(res.status).toBe(403);
  });

  it('permite si el usuario es miembro con rol encargado de la tienda', async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1', role: 'encargado', memberships: [{ store_id: VALID_UUID, status: 'active', role: 'encargado' }] }, token: 'token' });
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'f1' }], error: null }),
    }));

    const req = makeRequest({ storeId: VALID_UUID });
    const res = await POST(req as any, { session: { user: { id: 'u1', role: 'encargado', memberships: [{ store_id: VALID_UUID, status: 'active', role: 'encargado' }] } } } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.affected).toBe(1);
  });

  it('usa service role (getAdminClient) para bypass RLS', async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const req = makeRequest({ storeId: VALID_UUID });
    await POST(req as any, { session: { user: { id: 'admin-1', role: 'admin' } } } as any);

    const { createClient } = await import('@supabase/supabase-js');
    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      'test-service-key',
      expect.any(Object)
    );
  });

  it('retorna 500 si el update falla', async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
    }));

    const req = makeRequest({ storeId: VALID_UUID });
    const res = await POST(req as any, { session: { user: { id: 'admin-1', role: 'admin' } } } as any);
    expect(res.status).toBe(500);
  });
});
