import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../adjust/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn()
}));

const VALID_PRODUCT_ID = '11111111-1111-4111-a111-111111111111';
const VALID_STORE_ID = '22222222-2222-4222-b222-222222222222';

const makeRequest = (body: any) => {
  return {
    json: async () => body,
    headers: {
      get: (name: string) => null
    }
  } as any;
};

describe('POST /api/inventory/adjust', () => {
  const mockSession = {
    token: 'valid-token',
    user: { id: '33333333-3333-4333-c333-333333333333' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    (getServerSession as any).mockResolvedValueOnce(null);

    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 200 con el nuevo version cuando el ajuste es exitoso', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    (getServerSession as any).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: { new_quantity: 15, new_version: 2 },
      error: null
    });

    (getSupabaseAuthClient as any).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: VALID_PRODUCT_ID,
      storeId: VALID_STORE_ID,
      quantity: 5,
      movementType: 'add',
      version: 1
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      productId: VALID_PRODUCT_ID,
      newQuantity: 15,
      newVersion: 2
    });
  });

  it('retorna 409 CONFLICT con serverVersion cuando la version enviada no coincide', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    (getServerSession as any).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Concurrency error' }
    });

    const mockSingle = vi.fn().mockResolvedValue({
      data: { quantity: 12, version: 5 },
      error: null
    });
    const mockEq = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle
    });

    (getSupabaseAuthClient as any).mockReturnValue({
      rpc: mockRpc,
      from: mockFrom
    } as any);

    const req = makeRequest({
      productId: VALID_PRODUCT_ID,
      storeId: VALID_STORE_ID,
      quantity: 5,
      movementType: 'add',
      version: 1
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('Conflict');
    expect(json.serverVersion).toBe(5);
    expect(json.currentQuantity).toBe(12);
  });

  it('retorna 400 si supabase devuelve ERR_INSUFFICIENT_STOCK', async () => {
     const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    (getServerSession as any).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'ERR_INSUFFICIENT_STOCK' }
    });

    (getSupabaseAuthClient as any).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: VALID_PRODUCT_ID,
      storeId: VALID_STORE_ID,
      quantity: -100,
      movementType: 'subtract',
      version: 1
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toContain('Negative stock');
  });

  it('retorna 500 si supabase falla por razón distinta al conflicto de versión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    (getServerSession as any).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Other DB Error' }
    });

    (getSupabaseAuthClient as any).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: VALID_PRODUCT_ID,
      storeId: VALID_STORE_ID,
      quantity: 5,
      movementType: 'set',
      version: 1
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
