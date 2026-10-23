/**
 * MISIÓN 2026-10-23 (§7) — FILTRADO DEL LISTADO DE ÓRDENES DE TRABAJO.
 *
 * Drive the REAL GET /api/production-orders handler con un mock capturador
 * del cliente admin: antes los parámetros start_date/end_date/limit que el
 * Reporte de Entrega enviaba se DESCARTABAN (causa raíz: el reporte listaba
 * las 200 órdenes más recientes de cualquier estado/fecha — las cerradas
 * aparecían como pendientes). Ahora:
 *   · start_date/end_date → filtro por created_at (ventana ISO completa).
 *   · status_group=operative → solo draft/approved/in_progress/paused
 *     (cerradas/completadas/anuladas = históricos fuera del listado).
 *   · status_group=terminal → solo completed/closed/voided.
 *   · limit → respetado (cap 500) · sin parámetros → comportamiento previo.
 * No se toca la BD (mocks).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/production-orders/route';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => true),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => mockAdminClient,
}));

// ── Mock capturador: registra cada filtro aplicado a la query ──
type Filter = { op: string; args: unknown[] };
const filters: Filter[] = [];
let lastLimit = -1;
const mockAdminClient = {
  from: (table: string) => {
    if (table !== 'profiles' && table !== 'production_orders') {
      throw new Error(`tabla inesperada en mock: ${table}`);
    }
    const chain: Record<string, unknown> = {};
    const capture = (op: string) => (...args: unknown[]) => {
      if (table === 'production_orders') {
        if (op === 'limit') { lastLimit = args[0] as number; return chain; }
        filters.push({ op, args });
      }
      return chain;
    };
    for (const op of ['select', 'eq', 'order', 'in', 'gte', 'lte', 'limit']) chain[op] = capture(op);
    if (table === 'profiles') {
      chain.single = () => Promise.resolve({ data: { active_store_id: 'store-1' }, error: null });
    } else {
      chain.then = (onFulfilled: any) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
    }
    return chain;
  },
};

function req(query: string) {
  return new Request(`http://localhost/api/production-orders${query}`) as unknown as Parameters<typeof GET>[0];
}

const findFilter = (op: string) => filters.find(f => f.op === op);

describe('MISIÓN 2026-10-23 §7 — GET /api/production-orders respeta fecha/estado/limit', () => {
  beforeEach(() => { filters.length = 0; lastLimit = -1; });

  it('status_group=operative → .in(status, [draft, approved, in_progress, paused]) — las cerradas/completadas/anuladas quedan fuera', async () => {
    await GET(req('?status_group=operative'));
    const inFilter = findFilter('in');
    expect(inFilter).toBeTruthy();
    expect(inFilter!.args[0]).toBe('status');
    expect(inFilter!.args[1]).toEqual(['draft', 'approved', 'in_progress', 'paused']);
  });

  it('status_group=terminal → .in(status, [completed, closed, voided])', async () => {
    await GET(req('?status_group=terminal'));
    const inFilter = findFilter('in');
    expect(inFilter!.args[1]).toEqual(['completed', 'closed', 'voided']);
  });

  it('start_date/end_date → filtro por created_at (ventana ISO COMPLETA — como la envía fetchDiarioSummaries)', async () => {
    const s = encodeURIComponent('2026-10-21T00:00:00.000Z');
    const e = encodeURIComponent('2026-10-22T23:59:59.999Z');
    await GET(req(`?start_date=${s}&end_date=${e}`));
    expect(findFilter('gte')?.args).toEqual(['created_at', '2026-10-21T00:00:00.000Z']);
    expect(findFilter('lte')?.args).toEqual(['created_at', '2026-10-22T23:59:59.999Z']);
  });

  it('limit → respetado (Reporte Entrega pide 100; cap 500)', async () => {
    await GET(req('?limit=100'));
    expect(lastLimit).toBe(100);
    await GET(req('?limit=9999'));
    expect(lastLimit).toBe(500); // cap de seguridad
  });

  it('SIN parámetros → comportamiento previo (sin .in/.gte/.lte, límite 200)', async () => {
    await GET(req(''));
    expect(findFilter('in')).toBeUndefined();
    expect(findFilter('gte')).toBeUndefined();
    expect(findFilter('lte')).toBeUndefined();
    expect(lastLimit).toBe(200);
    // El filtro de tienda SIEMPRE presente
    expect(filters.some(f => f.op === 'eq' && f.args[0] === 'store_id')).toBe(true);
  });

  it('combinación real del Reporte Entrega: fechas + status_group=operative + limit=100', async () => {
    const s = encodeURIComponent('2026-10-21T00:00:00.000Z');
    const e = encodeURIComponent('2026-10-22T23:59:59.999Z');
    await GET(req(`?start_date=${s}&end_date=${e}&status_group=operative&limit=100`));
    expect(findFilter('in')!.args[1]).toEqual(['draft', 'approved', 'in_progress', 'paused']);
    expect(findFilter('gte')!.args[0]).toBe('created_at');
    expect(findFilter('lte')!.args[0]).toBe('created_at');
    expect(lastLimit).toBe(100);
  });
});
