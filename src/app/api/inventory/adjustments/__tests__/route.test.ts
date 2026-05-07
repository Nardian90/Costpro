import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as auth from '@/lib/auth';

const mockRpc = vi.fn().mockResolvedValue({ data: 'sale-001', error: null });
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

vi.mock('@/lib/csrf', () => ({
  validateOrigin: vi.fn().mockReturnValue(true),
}));

const mockSession = {
  token: 'valid-token',
  user: { id: 'user-001' },
};

const VALID_STORE_ID = '22222222-2222-4222-b222-222222222222';
const VALID_PRODUCT_ID = '33333333-3333-4333-a333-333333333333';

const makeAuthRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/inventory/adjustments', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('POST /api/inventory/adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.getServerSession as any).mockResolvedValue(mockSession);
    mockFrom.mockReturnThis();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
  });

  const validBody = {
    storeId: VALID_STORE_ID,
    items: [{ product_id: VALID_PRODUCT_ID, quantity: 5, movement_type: 'add' }],
  };

  it('retorna 200 con saleId y saleItems cuando todo es válido', async () => {
    const mockSaleItems = [{ id: 'item-1', sale_id: 'sale-001' }];
    mockRpc.mockResolvedValueOnce({ data: 'sale-001', error: null });
    mockEq.mockResolvedValueOnce({ data: mockSaleItems, error: null });

    const res = await POST(makeAuthRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.saleId).toBe('sale-001');
    expect(json.saleItems).toEqual(mockSaleItems);
  });

  it('llama a RPC process_inventory_adjustment con los parámetros correctos', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'sale-001', error: null });
    mockEq.mockResolvedValueOnce({ data: [], error: null });

    await POST(makeAuthRequest(validBody));

    expect(mockRpc).toHaveBeenCalledWith('process_inventory_adjustment', {
      p_store_id: VALID_STORE_ID,
      p_cashier_id: 'user-001',
      p_items: validBody.items,
    });
  });
});
