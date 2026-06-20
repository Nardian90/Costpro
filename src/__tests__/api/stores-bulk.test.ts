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

vi.mock('@/lib/rate-limit/tenant-limiter', () => ({
  checkTenantRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/api-errors', () => ({
  createApiError: (c: string) => ({ error: c }),
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    select: mockSelect,
  }),
});
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
    rpc: mockRpc,
  })),
}));

import { POST } from '@/app/api/stores/bulk/route';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';

describe('POST /api/stores/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(validateOrigin).mockReturnValue(true);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  const createRequest = (body: any) => {
    return {
      json: async () => body,
      headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      url: 'http://localhost/api/stores/bulk',
      method: 'POST',
    } as unknown as NextRequest;
  };

  it('should return 403 if origin is invalid', async () => {
    vi.mocked(validateOrigin).mockReturnValue(false);
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ storeIds: ['550e8400-e29b-41d4-a716-446655440000'], action: 'activate' });

    const res = await POST(req, session);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('INVALID_ORIGIN');
  });

  it('should return 429 if rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false } as any);
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ storeIds: ['550e8400-e29b-41d4-a716-446655440000'], action: 'activate' });

    const res = await POST(req, session);
    expect(res.status).toBe(429);
  });

  it('should return 403 if user is not admin', async () => {
    const session = { user: { id: 'u1', role: 'clerk' } } as any;
    const req = createRequest({ storeIds: ['550e8400-e29b-41d4-a716-446655440000'], action: 'activate' });

    const res = await POST(req, session);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('FORBIDDEN');
  });

  it('should return 400 for invalid data', async () => {
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({ storeIds: [], action: 'invalid' });

    const res = await POST(req, session);
    expect(res.status).toBe(400);
  });

  it('should successfully activate stores', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 'uuid-1' }], error: null, count: 1 });
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({
      storeIds: ['550e8400-e29b-41d4-a716-446655440000'],
      action: 'activate'
    });

    const res = await POST(req, session);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.affected).toBe(1);
  });

  it('should successfully delete stores via RPC', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    const session = { user: { id: 'u1', role: 'admin' } } as any;
    const req = createRequest({
      storeIds: ['550e8400-e29b-41d4-a716-446655440000'],
      action: 'delete'
    });

    const res = await POST(req, session);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.affected).toBe(1);
    expect(mockRpc).toHaveBeenCalledWith('soft_delete_store', expect.objectContaining({
      p_store_id: '550e8400-e29b-41d4-a716-446655440000',
      p_deleted_by: 'u1'
    }));
  });
});
