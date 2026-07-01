import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTools, type ToolContext } from '@/lib/ai/tools';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Unit tests for the AI tools (Vercel AI SDK migration).
 *
 * Tests:
 *   1. Tool inventory (all 11 tools are registered)
 *   2. RBAC enforcement (requireRole throws for unauthorized roles)
 *   3. get_cost_summary logic (uses is_active, not deleted_at; sums cost_price)
 *   4. get_sales_summary logic (uses total_amount, not total)
 *   5. search_entity sanitization (ILIKE wildcard injection prevention)
 *   6. execute_action whitelist
 *
 * The Supabase client is mocked — we only test the tool logic, not the DB.
 */

// ─── Mock Supabase client (proper chaining) ──────────────────────────────────
/**
 * Creates a mock Supabase client where every chainable method returns the
 * same chain object. Specific methods can be overridden via `terminals`
 * to control what the final resolved value is.
 *
 * Example:
 *   const supabase = createMockSupabase({
 *     // When .limit(N) is called, resolve with this data
 *     limit: vi.fn().mockResolvedValue({ data: [], error: null }),
 *   });
 */
function createMockSupabase(terminals: Record<string, ReturnType<typeof vi.fn>> = {}): SupabaseClient {
  const chain: any = {};
  const chainable = ['select', 'eq', 'ilike', 'is', 'gte', 'gt', 'lt', 'order', 'range'];

  for (const method of chainable) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods (these return a Promise, not the chain)
  chain.limit = terminals.limit ?? vi.fn().mockResolvedValue({ data: [], error: null });
  chain.single = terminals.single ?? vi.fn().mockResolvedValue({ data: null, error: null });
  // head:true count queries resolve immediately
  // (the route uses select('id', { count: 'exact', head: true }) but our mock
  // treats select as chainable — for count queries, we override eq+single)

  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    supabase: createMockSupabase(),
    userId: 'test-user-001',
    userRole: 'admin',
    storeId: 'test-store-001',
    ...overrides,
  };
}

describe('AI Tools (Vercel AI SDK)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Tool inventory ────────────────────────────────────────────────
  describe('tool inventory', () => {
    it('registers all 11 expected tools', () => {
      const tools = buildTools(createContext());
      const expected = [
        'open_view',
        'explain_view',
        'fill_form',
        'submit_form',
        'search_entity',
        'execute_action',
        'export_document',
        'set_ui_mode',
        'run_system_health_check',
        'get_cost_summary',
        'get_sales_summary',
      ];
      expect(Object.keys(tools).sort()).toEqual(expected.sort());
    });

    it('every tool has inputSchema, description, and execute', () => {
      const tools = buildTools(createContext());
      for (const [name, t] of Object.entries(tools)) {
        expect(t, `tool "${name}"`).toBeDefined();
        expect((t as any).inputSchema, `tool "${name}" inputSchema`).toBeDefined();
        expect((t as any).description, `tool "${name}" description`).toBeTruthy();
        expect((t as any).execute, `tool "${name}" execute`).toBeTypeOf('function');
      }
    });
  });

  // ─── RBAC enforcement ──────────────────────────────────────────────
  describe('RBAC (requireRole)', () => {
    it('allows admin to call submit_form', async () => {
      const tools = buildTools(createContext({ userRole: 'admin' }));
      const result = await (tools.submit_form as any).execute({ formName: 'costSheet', data: { x: 1 } });
      expect(result.success).toBe(true);
    });

    it('allows manager to call submit_form', async () => {
      const tools = buildTools(createContext({ userRole: 'manager' }));
      const result = await (tools.submit_form as any).execute({ formName: 'costSheet', data: { x: 1 } });
      expect(result.success).toBe(true);
    });

    it('denies vendedor from calling submit_form (throws)', async () => {
      const tools = buildTools(createContext({ userRole: 'vendedor' }));
      await expect(
        (tools.submit_form as any).execute({ formName: 'costSheet', data: { x: 1 } })
      ).rejects.toThrow(/Acceso denegado/);
    });

    it('denies warehouse role from calling submit_form', async () => {
      const tools = buildTools(createContext({ userRole: 'warehouse' }));
      await expect(
        (tools.submit_form as any).execute({ formName: 'costSheet', data: { x: 1 } })
      ).rejects.toThrow(/Acceso denegado/);
    });
  });

  // ─── get_cost_summary ──────────────────────────────────────────────
  describe('get_cost_summary', () => {
    it('returns error when no storeId in args or context', async () => {
      const tools = buildTools(createContext({ storeId: '' }));
      const result = await (tools.get_cost_summary as any).execute({});
      expect(result.error).toMatch(/No se pudo determinar la tienda/);
    });

    it('uses is_active filter (NOT deleted_at) on products — schema correctness', async () => {
      // Mock the products query to return empty array
      const chain: any = {};
      const eqCalls: any[][] = [];
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((...args: any[]) => {
        eqCalls.push(args);
        return chain;
      });
      chain.is = vi.fn().mockReturnValue(chain);
      // Final resolve for the products query chain
      // The route does: .select('id, cost_price').eq('store_id', x).eq('is_active', true)
      // Since .eq returns chain, but the route awaits the chain — we need chain to be a Promise
      // Easier: make .eq('is_active', true) return a Promise directly
      chain.eq.mockImplementation((col: string, val: any) => {
        eqCalls.push([col, val]);
        if (col === 'is_active') {
          return Promise.resolve({ data: [], error: null });
        }
        return chain;
      });

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      await (tools.get_cost_summary as any).execute({});

      const filterColumns = eqCalls.map(c => c[0]);
      expect(filterColumns).toContain('is_active');
      expect(filterColumns).not.toContain('deleted_at');
    });

    it('sums cost_price from products and computes averages', async () => {
      const fakeProducts = [
        { id: 'p1', cost_price: 100 },
        { id: 'p2', cost_price: 200 },
        { id: 'p3', cost_price: 0 },
      ];
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((col: string) => {
        if (col === 'is_active') {
          return Promise.resolve({ data: fakeProducts, error: null });
        }
        return chain;
      });
      chain.is = vi.fn().mockReturnValue(chain);

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      const result = await (tools.get_cost_summary as any).execute({});
      expect(result.success).toBe(true);
      expect(result.summary.total_products).toBe(3);
      expect(result.summary.products_with_cost_price).toBe(2);
      expect(result.summary.products_without_cost_price).toBe(1);
      expect(result.summary.total_inventory_cost).toBe(300);
      expect(result.summary.avg_cost_price).toBe(100);
      expect(result.summary.coverage_pct).toBeCloseTo(66.67, 1);
    });
  });

  // ─── get_sales_summary ─────────────────────────────────────────────
  describe('get_sales_summary', () => {
    it('uses total_amount column (NOT total) — schema correctness', async () => {
      const fakeTxns = [
        { id: 't1', total_amount: 100, payment_method: 'cash', created_at: '2026-06-28T10:00:00Z' },
        { id: 't2', total_amount: 200, payment_method: 'card', created_at: '2026-06-28T11:00:00Z' },
      ];
      const chain: any = {};
      const selectCalls: any[] = [];
      chain.select = vi.fn().mockImplementation((...args: any[]) => {
        selectCalls.push(args[0]);
        return chain;
      });
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockResolvedValue({ data: fakeTxns, error: null });

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      const result = await (tools.get_sales_summary as any).execute({ date: '2026-06-28' });

      expect(result.success).toBe(true);
      expect(result.summary.total_transactions).toBe(2);
      expect(result.summary.total_amount).toBe(300);
      expect(result.summary.by_payment_method.cash.total).toBe(100);
      expect(result.summary.by_payment_method.card.total).toBe(200);

      // Verify the select() was called with 'total_amount' (not 'total')
      const selectArg = selectCalls[0];
      expect(selectArg).toContain('total_amount');
      // Must not contain 'total' as a standalone column (total_amount is OK)
      expect(selectArg).not.toMatch(/\btotal\b(?!\w)/);
    });

    it('defaults to "today" when no date provided', async () => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockResolvedValue({ data: [], error: null });

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      const result = await (tools.get_sales_summary as any).execute({});
      expect(result.success).toBe(true);
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ─── search_entity sanitization ────────────────────────────────────
  describe('search_entity', () => {
    it('sanitizes ILIKE wildcards in query to prevent injection', async () => {
      const chain: any = {};
      const ilikeCalls: any[][] = [];
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockImplementation((...args: any[]) => {
        ilikeCalls.push(args);
        return chain;
      });
      chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      await (tools.search_entity as any).execute({
        entity: 'product',
        query: '%DROP_TABLE%',
      });
      expect(ilikeCalls.length).toBe(1);
      const [column, pattern] = ilikeCalls[0];
      expect(column).toBe('name');
      expect(pattern).toContain('\\%DROP\\_TABLE\\%');
    });

    it('allows regular alphanumeric queries unchanged', async () => {
      const chain: any = {};
      const ilikeCalls: any[][] = [];
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockImplementation((...args: any[]) => {
        ilikeCalls.push(args);
        return chain;
      });
      chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

      const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
      const tools = buildTools(createContext({
        storeId: 'store-123',
        supabase,
      }));
      await (tools.search_entity as any).execute({
        entity: 'product',
        query: 'Pintura Blanca',
      });
      const [, pattern] = ilikeCalls[0];
      expect(pattern).toBe('%Pintura Blanca%');
    });
  });

  // ─── execute_action whitelist ──────────────────────────────────────
  describe('execute_action', () => {
    it('rejects action name not in whitelist', async () => {
      const tools = buildTools(createContext({ userRole: 'admin' }));
      const result = await (tools.execute_action as any).execute({
        actionName: 'rm_rf_root',
        parameters: {},
      });
      expect(result.error).toMatch(/no permitida/);
    });

    it('allows whitelisted action name', async () => {
      const tools = buildTools(createContext({ userRole: 'admin' }));
      const result = await (tools.execute_action as any).execute({
        actionName: 'recalculate_costs',
        parameters: {},
      });
      expect(result.success).toBe(true);
    });
  });
});
