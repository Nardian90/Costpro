import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/users/[id]/memberships/bulk/route';

const mockSession = { value: { user: { id: "admin-1", role: "admin", memberships: [] } } as any };
const mockContext = { params: Promise.resolve({ id: 'u1' }) };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value, mockContext),
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

const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: (name: string, args: any) => mockRpc(name, args),
  })),
}));

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/users/u1/memberships/bulk',
  } as any;
}

function makeSession(role: string = 'admin') {
  return { user: { id: 'admin-1', role, memberships: [] } } as any;
}

describe('POST /api/users/[id]/memberships/bulk (F4-T02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks after clearAllMocks
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    mockRpc.mockResolvedValue({ data: { affected: 0, failed: 0 }, error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('rechaza si el rol no es admin ni manager', async () => {
    mockSession.value = { user: { id: 'clerk-1', role: 'clerk', memberships: [] } };
    const req = makeRequest({ assignments: [{ store_id: 'a1111111-1111-4111-8111-111111111111', role: 'clerk' }] });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('rechaza si assignments está vacío', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    const req = makeRequest({ assignments: [] });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si role en assignment es inválido', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    const req = makeRequest({ assignments: [{ store_id: 's1', role: 'invalid' }] });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('invoca RPC bulk_assign_memberships (transaccional)', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    mockRpc.mockResolvedValueOnce({ data: { affected: 3, failed: 0 }, error: null });

    const req = makeRequest({
      assignments: [
        { store_id: 'a1111111-1111-4111-8111-111111111111', role: 'clerk' },
        { store_id: 'b2222222-2222-4222-8222-222222222222', role: 'clerk' },
        { store_id: 'c3333333-3333-4333-8333-333333333333', role: 'clerk' },
      ],
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('bulk_assign_memberships', {
      p_user_id: 'u1',
      p_assignments: expect.arrayContaining([
        expect.objectContaining({ store_id: 'a1111111-1111-4111-8111-111111111111', role: 'clerk' }),
      ]),
    });
    const body = await res.json();
    expect(body.affected).toBe(3);
  });

  it('retorna 500 si el RPC falla', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'FORBIDDEN' } });

    const req = makeRequest({
      assignments: [{ store_id: 'a1111111-1111-4111-8111-111111111111', role: 'clerk' }],
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});
