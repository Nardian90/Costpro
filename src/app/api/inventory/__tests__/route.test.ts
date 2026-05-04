import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn()
}));

const makeRequest = (url: string = 'http://localhost/api/inventory') => new NextRequest(url);

describe('GET /api/inventory', () => {
  const mockSession = {
    token: 'valid-token',
    user: { id: 'user-1' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autenticación', () => {
    it('retorna 401 si no hay sesión activa', async () => {
      const { getServerSession } = await import('@/lib/auth');
      (getServerSession as any).mockResolvedValueOnce(null);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 si session.token es undefined', async () => {
      const { getServerSession } = await import('@/lib/auth');
      (getServerSession as any).mockResolvedValueOnce({ token: undefined } as any);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe('paginación', () => {
    it('usa page=1 y pageSize=20 por defecto', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest();
      await GET(req);

      expect(mockRange).toHaveBeenCalledWith(0, 19);
    });

    it('calcula range correctamente para page=2, pageSize=10', async () => {
       const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest('http://localhost/api/inventory?page=2&pageSize=10');
      await GET(req);

      expect(mockRange).toHaveBeenCalledWith(10, 19);
    });
  });

  describe('filtros', () => {
    it('aplica filtro eq("store_id") cuando storeId está en query params', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockEq = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest('http://localhost/api/inventory?storeId=store-123');
      await GET(req);

      expect(mockEq).toHaveBeenCalledWith('store_id', 'store-123');
    });

    it('aplica filtro ilike en products.sku cuando sku está en query params', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockIlike = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        ilike: mockIlike,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest('http://localhost/api/inventory?sku=ABC');
      await GET(req);

      expect(mockIlike).toHaveBeenCalledWith('products.sku', '%ABC%');
    });
  });

  describe('respuesta', () => {
    it('retorna { data, pagination } en el body JSON', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockData = [
        { product_id: 'p1', quantity: 10, version: 1, products: { sku: 'S1', name: 'N1' } }
      ];
      const mockRange = vi.fn().mockResolvedValue({ data: mockData, error: null, count: 100 });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0]).toEqual({
        productId: 'p1',
        sku: 'S1',
        name: 'N1',
        quantity: 10,
        version: 1
      });
      expect(json.pagination).toEqual({
        totalItems: 100,
        currentPage: 1,
        pageSize: 20,
        totalPages: 5
      });
    });

    it('retorna status 500 si supabase devuelve error interno', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const mockRange = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' }, count: null });
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        range: mockRange
      });

      (getSupabaseAuthClient as any).mockReturnValue({
        from: mockFrom
      } as any);

      const req = makeRequest();
      const res = await GET(req);

      expect(res.status).toBe(500);
    });
  });
});
