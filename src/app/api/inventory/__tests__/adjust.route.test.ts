import { NextRequest } from 'next/server';
import { POST } from '../adjust/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn()
}));

const makeRequest = (body: any) => new NextRequest('http://localhost/api/inventory/adjust', {
  method: 'POST',
  body: JSON.stringify(body)
});

describe('POST /api/inventory/adjust', () => {
  const mockSession = {
    token: 'valid-token',
    user: { id: 'user-1' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 400 si el body no tiene los campos requeridos', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const req = makeRequest({ productId: 'p1' }); // Faltan storeId, version
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('retorna 200 con el nuevo version cuando el ajuste es exitoso', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: { new_quantity: 15, new_version: 2 },
      error: null
    });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: 'p1',
      storeId: 's1',
      quantity: 5,
      movementType: 'IN',
      version: 1
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      productId: 'p1',
      newQuantity: 15,
      newVersion: 2
    });
  });

  it('retorna 409 CONFLICT con serverVersion cuando la version enviada no coincide', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

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

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      rpc: mockRpc,
      from: mockFrom
    } as any);

    const req = makeRequest({
      productId: 'p1',
      storeId: 's1',
      quantity: 5,
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

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'ERR_INSUFFICIENT_STOCK' }
    });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: 'p1',
      storeId: 's1',
      quantity: -100,
      version: 1
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('Negative stock');
  });

  it('retorna 500 si supabase falla por razón distinta al conflicto de versión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Other DB Error' }
    });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      rpc: mockRpc
    } as any);

    const req = makeRequest({
      productId: 'p1',
      storeId: 's1',
      quantity: 5,
      version: 1
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
