import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as auth from '@/lib/auth';

const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockEq = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();

const mockSupabaseClient = {
  from: mockFrom,
  select: mockSelect,
  eq: mockEq,
  single: mockSingle,
  rpc: mockRpc,
};

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
  getSupabaseAuthClient: vi.fn(() => mockSupabaseClient),
}));

const mockSession = {
  token: 'valid-token',
  user: { id: 'user-001' },
};

const makeRequest = (url: string = 'http://localhost/api/inventory/products') =>
  new NextRequest(url);

const VALID_STORE_ID = '22222222-2222-4222-b222-222222222222';

describe('GET /api/inventory/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.getServerSession as any).mockResolvedValue(mockSession);
    mockFrom.mockReturnThis();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockSingle.mockResolvedValue({ data: { store_id: VALID_STORE_ID, role: 'usuario' }, error: null });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('retorna 401 si no hay sesión activa', async () => {
    (auth.getServerSession as any).mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('retorna 400 si el usuario no tiene tienda asignada y no es admin', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { store_id: null, active_store_id: null, role: 'usuario' },
      error: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('retorna 500 si falla la consulta del perfil', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB Error' },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('retorna productos del POS cuando el usuario tiene tienda asignada', async () => {
    const mockProducts = [{ id: 'p1', name: 'Product 1' }];
    mockSingle.mockResolvedValueOnce({
      data: { store_id: VALID_STORE_ID, role: 'usuario' },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: mockProducts, error: null });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockProducts);
    expect(mockRpc).toHaveBeenCalledWith('get_products_for_pos', {
      p_store_id: VALID_STORE_ID,
    });
  });

  it('usa active_store_id como store efectivo cuando está presente', async () => {
    const activeStoreId = 'active-store-id';
    mockSingle.mockResolvedValueOnce({
      data: { store_id: VALID_STORE_ID, active_store_id: activeStoreId, role: 'usuario' },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(makeRequest());

    expect(mockRpc).toHaveBeenCalledWith('get_products_for_pos', {
      p_store_id: activeStoreId,
    });
  });
});
