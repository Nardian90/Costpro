import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/product-cost-sheets/invalidate/route';

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

// Mock chain builder para supabase admin client
const mockChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  select: vi.fn(),
};

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(async () => ({
    from: vi.fn(() => mockChain),
  })),
}));

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/product-cost-sheets/invalidate',
  } as any;
}

function makeSession(role: string = 'admin', memberships: any[] = []) {
  return { user: { id: 'admin-1', role, memberships } } as any;
}

describe('POST /api/product-cost-sheets/invalidate (F3-T05 deuda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza si storeId no es UUID válido', async () => {
    const req = makeRequest({ storeId: 'not-a-uuid' });
    const res = await POST(req as any, makeSession('admin'), {} as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si el usuario no es admin ni miembro de la tienda', async () => {
    const req = makeRequest({ storeId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req as any, makeSession('clerk', []), {} as any);
    expect(res.status).toBe(403);
  });

  it('permite si el usuario es miembro con rol encargado de la tienda', async () => {
    mockChain.select.mockResolvedValueOnce({ data: [{ id: 'fc1' }, { id: 'fc2' }], error: null });

    const req = makeRequest({ storeId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req as any, makeSession('encargado', [
      { store_id: '00000000-0000-0000-0000-000000000001', status: 'active', role: 'encargado' },
    ]), {} as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affected).toBe(2);
  });

  it('usa service role (getAdminClient) para bypass RLS', async () => {
    mockChain.select.mockResolvedValueOnce({ data: [], error: null });

    const req = makeRequest({ storeId: '00000000-0000-0000-0000-000000000001' });
    await POST(req as any, makeSession('admin'), {} as any);

    const { getAdminClient } = await import('@/lib/supabase-admin');
    expect(getAdminClient).toHaveBeenCalled();
  });

  it('retorna 500 si el update falla', async () => {
    mockChain.select.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const req = makeRequest({ storeId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req as any, makeSession('admin'), {} as any);
    expect(res.status).toBe(500);
  });
});
