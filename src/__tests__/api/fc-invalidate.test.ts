import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/product-cost-sheets/invalidate/route';

// Mutable session — tests pueden cambiar el rol/memberships antes de cada test
const mockSession = { value: { user: { id: 'admin-1', role: 'admin', memberships: [{ store_id: 'a1111111-1111-4111-8111-111111111111', role: 'admin' }] } } as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: string, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
  getServerSession: async () => mockSession.value,
  isDevBypassSession: () => false,
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

const STORE_ID = 'a1111111-1111-4111-8111-111111111111';

describe('POST /api/product-cost-sheets/invalidate (F3-T05 deuda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to admin session by default
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [{ store_id: STORE_ID, role: 'admin', status: 'active' }] } };
    // Reset mockChain.select to default success
    mockChain.select.mockResolvedValue({ data: [], error: null });
  });

  it('rechaza si storeId no es UUID válido', async () => {
    const req = makeRequest({ storeId: 'not-a-uuid' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si el usuario no es admin ni miembro de la tienda', async () => {
    // Cambiar sesión a clerk sin memberships
    mockSession.value = { user: { id: 'clerk-1', role: 'clerk', memberships: [] } };

    const req = makeRequest({ storeId: STORE_ID });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('permite si el usuario es miembro con rol encargado de la tienda', async () => {
    // Sesión encargado con membership activa en la tienda
    mockSession.value = { user: { id: 'enc-1', role: 'encargado', memberships: [{ store_id: STORE_ID, role: 'encargado', status: 'active' }] } };
    mockChain.select.mockResolvedValueOnce({ data: [{ id: 'fc1' }, { id: 'fc2' }], error: null });

    const req = makeRequest({ storeId: STORE_ID });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affected).toBe(2);
  });

  it('usa service role (getAdminClient) para bypass RLS', async () => {
    mockChain.select.mockResolvedValueOnce({ data: [], error: null });

    const req = makeRequest({ storeId: STORE_ID });
    await POST(req as any);

    const { getAdminClient } = await import('@/lib/supabase-admin');
    expect(getAdminClient).toHaveBeenCalled();
  });

  it('retorna 500 si el update falla', async () => {
    mockChain.select.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const req = makeRequest({ storeId: STORE_ID });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});
