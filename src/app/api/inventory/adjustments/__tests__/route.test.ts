import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockSession = {
  token: 'valid-token',
  user: { id: 'user-001' },
};

const VALID_STORE_ID = '22222222-2222-4222-b222-222222222222';
const VALID_PRODUCT_ID = '33333333-3333-4333-a333-333333333333';

const makeAuthRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/inventory/adjustments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    },
    body: JSON.stringify(body),
  });

const validBody = {
  storeId: VALID_STORE_ID,
  items: [
    {
      product_id: VALID_PRODUCT_ID,
      quantity: 10,
      movement_type: 'add',
      reason: 'Stock inicial',
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/inventory/adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autenticación', () => {
    it('retorna 401 si no hay sesión activa', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const req = makeAuthRequest(validBody);
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 si session.token es undefined', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce({ token: undefined } as any);

      const req = makeAuthRequest(validBody);
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('validación Zod', () => {
    it('retorna 400 con storeId que no es UUID', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const res = await POST(
        makeAuthRequest({ ...validBody, storeId: 'no-uuid' })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.details).toBeInstanceOf(Array);
    });

    it('retorna 400 con items vacío', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const res = await POST(
        makeAuthRequest({ storeId: VALID_STORE_ID, items: [] })
      );
      expect(res.status).toBe(400);
    });

    it('retorna 400 con product_id que no es UUID en un item', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const res = await POST(
        makeAuthRequest({
          storeId: VALID_STORE_ID,
          items: [{ product_id: 'bad', quantity: 5 }],
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe('happy path', () => {
    it('retorna 200 con saleId y saleItems cuando todo es válido', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockSaleItems = [{ id: 'si-1', product_id: VALID_PRODUCT_ID, quantity: 10 }];

      // Chain: from("sale_items") → select("*") → eq("sale_id", saleId)
      const mockEq = vi.fn().mockResolvedValue({ data: mockSaleItems, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: vi.fn().mockResolvedValue({ data: 'sale-001', error: null }),
      } as any);

      const res = await POST(makeAuthRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.saleId).toBe('sale-001');
      expect(json.saleItems).toEqual(mockSaleItems);
    });

    it('llama a RPC process_inventory_adjustment con los parámetros correctos', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockRpc = vi.fn().mockResolvedValue({ data: 'sale-002', error: null });

      const mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: mockRpc,
      } as any);

      await POST(makeAuthRequest(validBody));

      expect(mockRpc).toHaveBeenCalledWith('process_inventory_adjustment', {
        p_store_id: VALID_STORE_ID,
        p_cashier_id: 'user-001',
        p_items: validBody.items,
      });
    });
  });

  describe('manejo de errores', () => {
    it('retorna 500 si RPC process_inventory_adjustment falla', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Constraint violation' },
        }),
      } as any);

      const res = await POST(makeAuthRequest(validBody));
      expect(res.status).toBe(500);
    });

    it('retorna 500 si la consulta de sale_items falla', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockEq = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: vi.fn().mockResolvedValue({ data: 'sale-003', error: null }),
      } as any);

      const res = await POST(makeAuthRequest(validBody));
      expect(res.status).toBe(500);
    });
  });
});
