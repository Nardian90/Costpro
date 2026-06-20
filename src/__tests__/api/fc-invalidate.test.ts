import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockWithRole, mockWithTracing } = vi.hoisted(() => ({
  mockWithRole: vi.fn((role, handler) => handler),
  mockWithTracing: vi.fn((handler) => handler),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withRole: mockWithRole,
  withAuth: vi.fn((handler) => handler),
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

const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });
const mockUpdateChain = {
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  select: mockSelect,
};

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      update: vi.fn().mockReturnValue(mockUpdateChain),
    })),
  }),
}));

import { POST } from '@/app/api/product-cost-sheets/invalidate/route';

describe('POST /api/product-cost-sheets/invalidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: any) => {
    return {
      json: async () => body,
      headers: new Headers({
        'x-forwarded-for': '127.0.0.1',
        'content-type': 'application/json'
      }),
      url: 'http://localhost/api/product-cost-sheets/invalidate',
      method: 'POST',
    } as unknown as NextRequest;
  };

  it('should return 403 if user lacks store access', async () => {
    const session = {
      user: {
        id: 'u1',
        role: 'encargado',
        memberships: [{ store_id: 'other-store', status: 'active', role: 'encargado' }]
      }
    } as any;
    const req = createRequest({ storeId: '550e8400-e29b-41d4-a716-446655440000' });

    const res = await POST(req, session);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('STORE_ACCESS_DENIED');
  });

  it('should allow access if user is admin regardless of memberships', async () => {
    mockSelect.mockResolvedValueOnce({ data: [{ id: '1' }], error: null });
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ storeId: '550e8400-e29b-41d4-a716-446655440000' });

    const res = await POST(req, session);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should allow access if user has encargado role in that store', async () => {
    const storeId = '550e8400-e29b-41d4-a716-446655440000';
    mockSelect.mockResolvedValueOnce({ data: [{ id: '1' }], error: null });
    const session = {
      user: {
        id: 'u1',
        role: 'encargado',
        memberships: [{ store_id: storeId, status: 'active', role: 'encargado' }]
      }
    } as any;
    const req = createRequest({ storeId });

    const res = await POST(req, session);
    expect(res.status).toBe(200);
  });

  it('should return 400 for invalid UUID', async () => {
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ storeId: 'invalid-uuid' });

    const res = await POST(req, session);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('INVALID_DATA');
  });
});
