import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockWithAuth, mockWithTracing } = vi.hoisted(() => ({
  mockWithAuth: vi.fn((handler) => handler),
  mockWithTracing: vi.fn((handler) => handler),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: mockWithAuth,
  withRole: vi.fn((role, handler) => handler),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: mockWithTracing,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/api-errors', () => ({
  createApiError: (c: string) => ({ error: c }),
}));

const mockRpc = vi.fn().mockResolvedValue({ data: { affected: 1 }, error: null });

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

import { POST } from '@/app/api/users/[id]/memberships/bulk/route';
import { validateOrigin } from '@/lib/csrf';

describe('POST /api/users/[id]/memberships/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  const createRequest = (body: any) => {
    return {
      json: async () => body,
      headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      url: 'http://localhost/api/users/u2/memberships/bulk',
      method: 'POST',
    } as unknown as NextRequest;
  };

  it('should return 403 if user is not admin or manager', async () => {
    const session = { user: { id: 'u1', role: 'clerk' } } as any;
    const req = createRequest({
      assignments: [{ store_id: '550e8400-e29b-41d4-a716-446655440000', role: 'clerk' }]
    });

    const res = await (POST as any)(req, session, { params: Promise.resolve({ id: 'u2' }) });
    expect(res.status).toBe(403);
  });

  it('should return 200 and call RPC for admin user', async () => {
    mockRpc.mockResolvedValueOnce({ data: { affected: 2, failed: 0 }, error: null });
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const assignments = [
      { store_id: '550e8400-e29b-41d4-a716-446655440000', role: 'clerk' },
      { store_id: '550e8400-e29b-41d4-a716-446655440001', role: 'manager' }
    ];
    const req = createRequest({ assignments });

    const res = await (POST as any)(req, session, { params: Promise.resolve({ id: 'u2' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.affected).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith('bulk_assign_memberships', {
      p_user_id: 'u2',
      p_assignments: expect.arrayContaining([
        expect.objectContaining({ role: 'clerk' }),
        expect.objectContaining({ role: 'manager' })
      ]),
    });
  });

  it('should return 400 for invalid assignments', async () => {
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ assignments: [] });

    const res = await (POST as any)(req, session, { params: Promise.resolve({ id: 'u2' }) });
    expect(res.status).toBe(400);
  });
});
