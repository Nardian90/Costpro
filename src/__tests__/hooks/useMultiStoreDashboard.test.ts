import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as RTL from '@testing-library/react';
const { renderHook, waitFor } = RTL as any;
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Store } from '@/types';
import { useMultiStoreDashboard, type StoreKPI } from '@/hooks/api/useMultiStoreDashboard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => mockFrom(table),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a Supabase-style thenable query builder.
 * Every chainable method (select, in, eq, gte, lte, etc.) returns `this`,
 * and `await`-ing the object resolves to `result`.
 */
function createQueryBuilder<T>(result: { data: T | null; error: unknown | null }) {
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    in() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    // Make thenable so `await` resolves
    then(resolve: (v: unknown) => void, _reject?: (v: unknown) => void) {
      return Promise.resolve(result).then(resolve, _reject);
    },
  };
  return builder;
}

/** Create stores for testing */
function makeStores(count: number): Store[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `store-${i}`,
    name: `Store ${i}`,
    slug: `store_${i}`,
    address: `Address ${i}`,
    is_active: true,
  }));
}

/** Standard RPC row shape */
function rpcRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    store_id: 'store-0',
    today_sales: 1000,
    today_transactions: 10,
    low_stock_count: 2,
    pending_transfers_out: 3,
    pending_receptions: 1,
    visible_products: 50,
    ...overrides,
  };
}

/** Create a fresh QueryClient per test to avoid shared state */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

/** Wrapper component for renderHook */
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Set up mockFrom to return appropriate data for Strategy 2 tables */
function setupStrategy2Mocks(
  transactions: { store_id: string; total_amount: number }[],
  transfers: { origin_store_id: string }[],
  products: { store_id: string }[],
) {
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'transactions':
        return createQueryBuilder({ data: transactions, error: null });
      case 'transfers':
        return createQueryBuilder({ data: transfers, error: null });
      case 'products':
        return createQueryBuilder({ data: products, error: null });
      default:
        return createQueryBuilder({ data: null, error: null });
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMultiStoreDashboard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRpc.mockReset();
    mockFrom.mockReset();
    queryClient = createQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ── RPC Strategy 1 success ──────────────────────────────────────────────

  it('maps RPC data correctly to StoreKPI when Strategy 1 succeeds', async () => {
    const stores = makeStores(2);
    const rpcData = [
      rpcRow({
        store_id: 'store-0',
        today_sales: '5000.50',
        today_transactions: '42',
        low_stock_count: '3',
        pending_transfers_out: '1',
        pending_receptions: '2',
        visible_products: '100',
      }),
      rpcRow({
        store_id: 'store-1',
        today_sales: '200',
        today_transactions: '5',
        low_stock_count: '0',
        pending_transfers_out: '0',
        pending_receptions: '0',
        visible_products: '30',
      }),
    ];

    mockRpc.mockResolvedValue({ data: rpcData, error: null });

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores, 'store-0'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];
    expect(kpis).toHaveLength(2);

    // store-0 (active)
    expect(kpis[0]).toEqual({
      storeId: 'store-0',
      storeName: 'Store 0',
      storeSlug: 'store_0',
      storeAddress: 'Address 0',
      isActive: true,
      todaySales: 5000.5,
      todayTransactions: 42,
      lowStockCount: 3,
      pendingTransfersOut: 1,
      pendingReceptions: 2,
      visibleProducts: 100,
    });

    // store-1 (not active)
    expect(kpis[1].storeId).toBe('store-1');
    expect(kpis[1].isActive).toBe(false);
    expect(kpis[1].todaySales).toBe(200);
    expect(kpis[1].visibleProducts).toBe(30);

    // Verify RPC was called with correct function name
    expect(mockRpc).toHaveBeenCalledWith(
      'get_batch_store_daily_kpis',
      expect.objectContaining({
        p_store_ids: ['store-0', 'store-1'],
      }),
    );
  });

  // ── RPC Strategy 1 error (function not found → fallback) ──────────────

  it('falls back to Strategy 2 when RPC returns 404 error', async () => {
    const stores = makeStores(2);

    // RPC returns 404
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '404', message: 'Could not find function' },
    });

    // Strategy 2: 3 bulk queries
    setupStrategy2Mocks(
      [{ store_id: 'store-0', total_amount: 500 }],   // transactions
      [{ origin_store_id: 'store-1' }],                // transfers
      [{ store_id: 'store-0' }, { store_id: 'store-0' }], // products
    );

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];
    expect(kpis).toHaveLength(2);

    // store-0: 500 sales, 1 txn, 2 visible products
    expect(kpis[0].todaySales).toBe(500);
    expect(kpis[0].todayTransactions).toBe(1);
    expect(kpis[0].visibleProducts).toBe(2);
    expect(kpis[0].pendingTransfersOut).toBe(0);

    // store-1: 0 sales, 1 transfer
    expect(kpis[1].todaySales).toBe(0);
    expect(kpis[1].pendingTransfersOut).toBe(1);
    expect(kpis[1].visibleProducts).toBe(0);

    // Strategy 2 fields that require RPC are zeroed
    expect(kpis[0].lowStockCount).toBe(0);
    expect(kpis[0].pendingReceptions).toBe(0);
  });

  // ── Strategy 2 fallback (bulk queries) ─────────────────────────────────

  it('uses 3 bulk queries correctly in Strategy 2', async () => {
    const stores = makeStores(3);

    // Force Strategy 2 by having RPC throw
    mockRpc.mockRejectedValue(new Error('RPC not available'));

    const transactions = [
      { store_id: 'store-0', total_amount: 100 },
      { store_id: 'store-0', total_amount: 200 },
      { store_id: 'store-2', total_amount: 300 },
    ];
    const transfers = [
      { origin_store_id: 'store-1' },
      { origin_store_id: 'store-1' },
    ];
    const products = [
      { store_id: 'store-0' },
      { store_id: 'store-1' },
      { store_id: 'store-2' },
    ];

    setupStrategy2Mocks(transactions, transfers, products);

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];

    // store-0: 300 sales (100+200), 2 txns, 1 product
    expect(kpis[0].todaySales).toBe(300);
    expect(kpis[0].todayTransactions).toBe(2);
    expect(kpis[0].visibleProducts).toBe(1);
    expect(kpis[0].pendingTransfersOut).toBe(0);

    // store-1: 0 sales, 2 transfers, 1 product
    expect(kpis[1].todaySales).toBe(0);
    expect(kpis[1].pendingTransfersOut).toBe(2);
    expect(kpis[1].visibleProducts).toBe(1);

    // store-2: 300 sales, 1 txn, 1 product
    expect(kpis[2].todaySales).toBe(300);
    expect(kpis[2].todayTransactions).toBe(1);
    expect(kpis[2].visibleProducts).toBe(1);

    // Verify `from` was called for the 3 tables
    expect(mockFrom).toHaveBeenCalledWith('transactions');
    expect(mockFrom).toHaveBeenCalledWith('transfers');
    expect(mockFrom).toHaveBeenCalledWith('products');
  });

  // ── Chunking: 55 stores → correct chunks ───────────────────────────────

  it('chunks 55 stores into 3 RPC calls (25+25+5)', async () => {
    const stores = makeStores(55);

    // Each RPC call returns empty array to succeed but produce zero-KPI results
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // RPC should have been called 3 times (3 chunks)
    expect(mockRpc).toHaveBeenCalledTimes(3);

    // Verify chunk sizes passed to RPC
    const calls = mockRpc.mock.calls;
    const chunkSizes = calls.map(
      (call: unknown[]) => (call[1] as { p_store_ids: string[] }).p_store_ids.length,
    );
    expect(chunkSizes).toEqual([25, 25, 5]);

    // All stores get zero-filled KPIs
    const kpis = result.current.data as StoreKPI[];
    expect(kpis).toHaveLength(55);
    expect(kpis.every(k => k.todaySales === 0)).toBe(true);
  });

  // ── Store zero-fill ─────────────────────────────────────────────────────

  it('zero-fills stores with no RPC data', async () => {
    const stores = [
      { id: 's1', name: 'Has Data', slug: 'has_data', address: 'A', is_active: true },
      { id: 's2', name: 'No Data', slug: 'no_data', address: null, is_active: true },
    ] as Store[];

    // Only s1 has data from RPC
    mockRpc.mockResolvedValue({
      data: [
        rpcRow({
          store_id: 's1',
          today_sales: 999,
          today_transactions: 7,
          low_stock_count: 1,
          pending_transfers_out: 0,
          pending_receptions: 0,
          visible_products: 20,
        }),
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores, 's1'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];

    // s1 has data
    expect(kpis[0].storeId).toBe('s1');
    expect(kpis[0].todaySales).toBe(999);
    expect(kpis[0].todayTransactions).toBe(7);

    // s2 is zero-filled
    expect(kpis[1].storeId).toBe('s2');
    expect(kpis[1].storeName).toBe('No Data');
    expect(kpis[1].storeSlug).toBe('no_data');
    expect(kpis[1].storeAddress).toBeUndefined();
    expect(kpis[1].isActive).toBe(false);
    expect(kpis[1].todaySales).toBe(0);
    expect(kpis[1].todayTransactions).toBe(0);
    expect(kpis[1].lowStockCount).toBe(0);
    expect(kpis[1].pendingTransfersOut).toBe(0);
    expect(kpis[1].pendingReceptions).toBe(0);
    expect(kpis[1].visibleProducts).toBe(0);
  });

  // ── Empty stores array → hook disabled ──────────────────────────────────

  it('is disabled when stores array is empty', () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useMultiStoreDashboard([]),
      { wrapper: createWrapper(queryClient) },
    );

    // Should be disabled — fetchStatus should be 'idle', not fetching
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();

    // RPC should never have been called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── RPC missing state: after 404, subsequent calls skip RPC ────────────

  it('skips RPC on subsequent calls after 404 (goes straight to Strategy 2)', async () => {
    const stores = makeStores(2);

    // First call: RPC returns 404
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '404', message: 'Could not find function' },
    });

    setupStrategy2Mocks(
      [{ store_id: 'store-0', total_amount: 100 }],
      [],
      [],
    );

    // First render
    const { result } = renderHook(
      ({ stores }: { stores: Store[] }) => useMultiStoreDashboard(stores),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { stores },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // RPC was called on first fetch
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Now reset mocks for the second fetch
    mockRpc.mockClear();
    mockFrom.mockClear();

    // Set up Strategy 2 mocks for the second fetch
    setupStrategy2Mocks(
      [{ store_id: 'store-0', total_amount: 200 }],
      [],
      [],
    );

    // Invalidate the query to trigger a refetch
    await queryClient.invalidateQueries({ queryKey: ['dashboard', 'multi-store'] });

    await waitFor(() => {
      // The hook should have succeeded again
      expect(result.current.isSuccess).toBe(true);
    });

    // RPC should NOT have been called on the second fetch
    // (it should skip directly to Strategy 2 because the missing state
    // was stored in queryClient meta)
    expect(mockRpc).not.toHaveBeenCalled();

    // Verify Strategy 2 was used by checking `from` was called
    expect(mockFrom).toHaveBeenCalled();
  });

  // ── Store lookup uses Map (implicit test via correct mapping) ───────────

  it('maps stores by ID correctly using Map-based lookup (not Array.find)', async () => {
    // Create stores where name ≠ order of RPC data to verify Map-based lookup
    const stores = [
      { id: 'z-store', name: 'Z Store', slug: 'z_store', address: 'Z Address', is_active: true },
      { id: 'a-store', name: 'A Store', slug: 'a_store', address: 'A Address', is_active: true },
    ] as Store[];

    // RPC returns data in different order than stores array
    mockRpc.mockResolvedValue({
      data: [
        rpcRow({ store_id: 'a-store', today_sales: 111 }),
        rpcRow({ store_id: 'z-store', today_sales: 999 }),
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];

    // Verify the store names match their IDs (not array index)
    // z-store is stores[0] but should have name "Z Store" and sales 999
    expect(kpis[0].storeId).toBe('z-store');
    expect(kpis[0].storeName).toBe('Z Store');
    expect(kpis[0].storeAddress).toBe('Z Address');
    expect(kpis[0].todaySales).toBe(999);

    // a-store is stores[1] but should have name "A Store" and sales 111
    expect(kpis[1].storeId).toBe('a-store');
    expect(kpis[1].storeName).toBe('A Store');
    expect(kpis[1].storeAddress).toBe('A Address');
    expect(kpis[1].todaySales).toBe(111);
  });

  // ── Strategy 2 chunking ─────────────────────────────────────────────────

  it('chunks Strategy 2 bulk queries for 55 stores', async () => {
    const stores = makeStores(55);

    // Force Strategy 2
    mockRpc.mockRejectedValue(new Error('RPC unavailable'));

    setupStrategy2Mocks([], [], []);

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Each of the 3 tables (transactions, transfers, products) should have
    // been queried in chunks. Since 55 stores → 3 chunks per table,
    // `from` should be called 9 times (3 tables × 3 chunks)
    const fromCalls = mockFrom.mock.calls;
    const txnCalls = fromCalls.filter((c: unknown[]) => c[0] === 'transactions');
    const transferCalls = fromCalls.filter((c: unknown[]) => c[0] === 'transfers');
    const productCalls = fromCalls.filter((c: unknown[]) => c[0] === 'products');

    expect(txnCalls.length).toBe(3);
    expect(transferCalls.length).toBe(3);
    expect(productCalls.length).toBe(3);
  });

  // ── isActive flag respects activeStoreId ────────────────────────────────

  it('marks only the activeStoreId as active', async () => {
    const stores = makeStores(3);

    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useMultiStoreDashboard(stores, 'store-1'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const kpis = result.current.data as StoreKPI[];
    expect(kpis[0].isActive).toBe(false);
    expect(kpis[1].isActive).toBe(true);
    expect(kpis[2].isActive).toBe(false);
  });
});
