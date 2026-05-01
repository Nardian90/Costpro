import { NextRequest } from 'next/server';
import { GET } from '../route';
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

const makeRequest = (url: string = 'http://localhost/api/inventory/products') =>
  new NextRequest(url);

const VALID_STORE_ID = '22222222-2222-4222-b222-222222222222';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/inventory/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autenticación', () => {
    it('retorna 401 si no hay sesión activa', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 si session.token es undefined', async () => {
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce({ token: undefined } as any);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe('perfil de usuario', () => {
    it('retorna 400 si el usuario no tiene tienda asignada y no es admin', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockSingle = vi.fn().mockResolvedValue({
        data: { store_id: null, active_store_id: null, role: 'usuario' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: vi.fn(),
      } as any);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toMatch(/not assigned to a store/i);
    });

    it('retorna 500 si falla la consulta del perfil', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Profile query failed' },
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: vi.fn(),
      } as any);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });

  describe('happy path', () => {
    it('retorna productos del POS cuando el usuario tiene tienda asignada', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockProducts = [{ id: 'p1', name: 'Product A', price: 10 }];

      const mockRpc = vi.fn().mockResolvedValue({ data: mockProducts, error: null });
      const mockSingle = vi.fn().mockResolvedValue({
        data: { store_id: VALID_STORE_ID, active_store_id: null, role: 'usuario' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: mockRpc,
      } as any);

      const req = makeRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockProducts);
      expect(mockRpc).toHaveBeenCalledWith('get_products_for_pos', {
        p_store_id: VALID_STORE_ID,
      });
    });

    it('usa active_store_id como store efectivo cuando está presente', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const activeStoreId = '44444444-4444-4444-a444-444444444444';
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSingle = vi.fn().mockResolvedValue({
        data: { store_id: VALID_STORE_ID, active_store_id: activeStoreId, role: 'usuario' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: mockRpc,
      } as any);

      const req = makeRequest();
      await GET(req);

      expect(mockRpc).toHaveBeenCalledWith('get_products_for_pos', {
        p_store_id: activeStoreId,
      });
    });
  });

  describe('manejo de errores', () => {
    it('retorna 500 si el RPC get_products_for_pos falla', async () => {
      const { getServerSession } = await import('@/lib/auth');
      const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC function error' },
      });
      const mockSingle = vi.fn().mockResolvedValue({
        data: { store_id: VALID_STORE_ID, active_store_id: null, role: 'usuario' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(getSupabaseAuthClient).mockReturnValue({
        from: mockFrom,
        rpc: mockRpc,
      } as any);

      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });
});
