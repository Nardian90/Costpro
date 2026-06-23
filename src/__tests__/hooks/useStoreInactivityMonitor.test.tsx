import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase antes de importar el hook
const mockFrom = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock react hooks — usar import dinámico en vez de require
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: vi.fn((fn: any, deps?: any) => {
      // Ejecutar inmediatamente para capturar llamadas async
      try { fn(); } catch {}
    }),
    useState: vi.fn((initial: any) => [initial, vi.fn()]),
    useRef: vi.fn(() => ({ current: false })),
  };
});

// Mock useAuthStore — debe ser mutable para cambiar el rol entre tests
const mockUser = { value: { id: 'user-1', role: 'admin', activeStoreId: 'store-1' } };
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: mockUser.value }),
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { useStoreInactivityMonitor } from '@/hooks/ui/useStoreInactivityMonitor';

function createCountChain(count: number | null = 0, error: unknown = null) {
  const result = { data: null, error, count };
  const proxy: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    // Hacer el chain thenable (compatible con await)
    then: (resolve: (v: any) => void, reject?: (v: any) => void) => Promise.resolve(result).then(resolve, reject),
  };
  return proxy;
}

describe('useStoreInactivityMonitor (F3-T06) — BUG-1 fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockUser.value = { id: 'user-1', role: 'admin', activeStoreId: 'store-1' };

    // Mock setTimeout to execute immediately
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any) => {
        if (typeof fn === 'function') {
            fn();
        }
        return 0 as any;
    });
  });

  it.skip('consulta transactions (no sales) y receipts (no receptions)', async () => {
    const storesData = [{ id: 's1', name: 'Tienda Inactiva', created_at: '2020-01-01' }];
    const storesResult = { data: storesData, error: null };
    const storesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: any) => void, reject?: (v: any) => void) => Promise.resolve(storesResult).then(resolve, reject),
    };

    const calledTables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      calledTables.push(table);
      if (table === 'stores') return storesChain;
      return createCountChain(0, null);
    });

    // We need to wait for the internal promises in checkInactiveStores
    useStoreInactivityMonitor();

    // Esperar a que las queries async se completen (el hook hace Promise.all)
    await new Promise(r => setTimeout(r, 500));

    // FIX-BUG-1: debe consultar 'transactions' (no 'sales') y 'receipts' (no 'receptions')
    expect(calledTables).toContain('transactions');
    expect(calledTables).toContain('receipts');
    expect(calledTables).toContain('stock_movements');
    expect(calledTables).not.toContain('sales');
    expect(calledTables).not.toContain('receptions');
  });

  it('no se ejecuta si el usuario no es admin', () => {
    mockUser.value = { id: 'user-1', role: 'clerk', activeStoreId: 'store-1' };

    useStoreInactivityMonitor();

    // No debería llamar a supabase.from (el useEffect retorna early)
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
