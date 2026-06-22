import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: vi.fn((fn: any) => fn()),
    useState: vi.fn((initial: any) => [initial, vi.fn()]),
    useRef: vi.fn(() => ({ current: false })),
  };
});

const mockUser = { value: { id: 'user-1', role: 'admin', activeStoreId: 'store-1' } };
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: mockUser.value }),
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Stub setTimeout to run immediately
vi.stubGlobal('setTimeout', (fn: any) => { fn(); return 0; });

import { useStoreInactivityMonitor } from '@/hooks/ui/useStoreInactivityMonitor';

function createCountChain(count: number | null = 0, error: unknown = null) {
  const proxy: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };
  proxy.then = (resolve: (v: any) => void) => resolve({ data: null, error, count });
  return proxy;
}

describe('useStoreInactivityMonitor (F3-T06) — BUG-1 fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockUser.value = { id: 'user-1', role: 'admin', activeStoreId: 'store-1' };
  });

  it('consulta transactions (no sales) y receipts (no receptions)', async () => {
    const storesData = [{ id: 's1', name: 'Tienda Inactiva', created_at: '2020-01-01' }];
    const storesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: any) => void) => resolve({ data: storesData, error: null }),
    };

    const calledTables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      calledTables.push(table);
      if (table === 'stores') return storesChain;
      return createCountChain(0, null);
    });

    useStoreInactivityMonitor();
    await new Promise(r => process.nextTick(r));

    expect(calledTables).toContain('transactions');
    expect(calledTables).toContain('receipts');
    expect(calledTables).toContain('stock_movements');
  });

  it('no se ejecuta si el usuario no es admin', () => {
    mockUser.value = { id: 'user-1', role: 'clerk', activeStoreId: 'store-1' };
    useStoreInactivityMonitor();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
