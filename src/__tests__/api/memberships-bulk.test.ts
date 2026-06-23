import { describe, it, expect, vi, beforeEach } from 'vitest';

// First mock withTracing BEFORE importing POST
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => (req: any, context: any) => handler(req, context?.session || { user: { role: 'admin', id: 'admin-1' } }, context),
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

const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: (name: string, args: any) => mockRpc(name, args),
  })),
}));

import { POST } from '@/app/api/users/[id]/memberships/bulk/route';
import { getServerSession } from '@/lib/auth';

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: { get: (name: string) => (name === 'x-forwarded-for' ? '127.0.0.1' : (name === 'Authorization' ? 'Bearer token' : null)) },
    json: async () => body,
    url: 'http://localhost:3000/api/users/u1/memberships/bulk',
  } as any;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('POST /api/users/[id]/memberships/bulk (F4-T02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (getServerSession as any).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' }, token: 'token' });
  });

  it('rechaza si el rol no es admin ni manager', async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: 'clerk-1', role: 'clerk' }, token: 'token' });
    const req = makeRequest({ assignments: [{ store_id: VALID_UUID, role: 'clerk' }] });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }), session: { user: { role: 'clerk', id: 'clerk-1' } } } as any);
    expect(res.status).toBe(403);
  });

  it('rechaza si assignments está vacío', async () => {
    const req = makeRequest({ assignments: [] });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }), session: { user: { role: 'admin', id: 'admin-1' } } } as any);
    expect(res.status).toBe(400);
  });

  it('rechaza si role en assignment es inválido', async () => {
    const req = makeRequest({ assignments: [{ store_id: VALID_UUID, role: 'invalid' }] });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }), session: { user: { role: 'admin', id: 'admin-1' } } } as any);
    expect(res.status).toBe(400);
  });

  it('invoca RPC bulk_assign_memberships (transaccional)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { affected: 3, failed: 0 }, error: null });

    const req = makeRequest({
      assignments: [
        { store_id: VALID_UUID, role: 'clerk' },
        { store_id: '550e8400-e29b-41d4-a716-446655440001', role: 'clerk' },
        { store_id: '550e8400-e29b-41d4-a716-446655440002', role: 'clerk' },
      ],
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }), session: { user: { role: 'admin', id: 'admin-1' } } } as any);

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('bulk_assign_memberships', {
      p_user_id: 'u1',
      p_assignments: expect.arrayContaining([
        expect.objectContaining({ store_id: VALID_UUID, role: 'clerk' }),
      ]),
    });
    const body = await res.json();
    expect(body.affected).toBe(3);
  });

  it('retorna 500 si el RPC falla', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB ERROR' } });

    const req = makeRequest({
      assignments: [{ store_id: VALID_UUID, role: 'clerk' }],
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }), session: { user: { role: 'admin', id: 'admin-1' } } } as any);
    expect(res.status).toBe(500);
  });
});
