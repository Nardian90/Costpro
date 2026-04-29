import { vi } from 'vitest';
import type { Transfer, Store, Product, Receipt, CashClosure } from '@/types';

// ── Factories ────────────────────────────────────────────────────────────────

export const makeStore = (overrides: Partial<Store> = {}): Store => ({
  id: 'store-test-001',
  name: 'Tienda Test',
  address: 'Calle Falsa 123',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  logo_url: null,
  ...overrides,
});

export const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-test-001',
  name: 'Producto Test',
  sku: 'SKU-001',
  price: 100,
  cost_price: 60,
  cost_average: 60,
  stock_current: 50,
  min_stock: 10,
  category: 'general',
  store_id: 'store-test-001',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

export const makeTransfer = (overrides: Partial<Transfer> = {}): Transfer => ({
  id: 'txfr-test-001',
  origin_store_id: 'store-a',
  destination_store_id: 'store-b',
  status: 'pending',
  created_by: 'user-test-001',
  created_at: '2025-01-15T10:00:00Z',
  items: [
    { id: 'item-1', product_id: 'prod-test-001', quantity: 5, unit_cost: 60 }
  ],
  notes: null,
  ...overrides,
});

export const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: 'rcpt-test-001',
  store_id: 'store-test-001',
  supplier: 'Proveedor Test',
  reference_doc: 'FAC-0001',
  status: 'active',
  created_at: '2025-01-15T10:00:00Z',
  total_cost: 500,
  ...overrides,
});

export const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-test-001',
  email: 'test@costpro.com',
  full_name: 'Usuario Test',
  role: 'admin' as const,
  storeId: 'store-test-001',
  activeStoreId: 'store-test-001',
  ...overrides,
});

// ── Mock de Supabase ─────────────────────────────────────────────────────────

export const makeSupabaseMock = () => {
  const mock = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    // Helper para encadenar y resolver al final
    resolveWith: (data: any, error: any = null) => {
      mock.single.mockResolvedValue({ data, error });
      mock.insert.mockResolvedValue({ data, error });
      mock.update.mockResolvedValue({ data, error });
      mock.select.mockResolvedValue({ data, error });
      return mock;
    },
  };
  return mock;
};
