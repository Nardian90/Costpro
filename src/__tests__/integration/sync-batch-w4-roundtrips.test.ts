/**
 * W4 — sync/batch: reducción de round-trips sin alterar el orden de negocio.
 *
 * Valida con un mock de Supabase que simula RTT por llamada (entorno aislado, sin
 * tocar datos reales):
 *   1. Los RPCs de negocio se ejecutan EN SERIE (start[i+1] >= end[i]) — orden intacto.
 *   2. Los checks de idempotencia se prefetchean en paralelo: N selects por claves
 *      únicas (no por operación).
 *   3. Latencia total muy por debajo del equivalente secuencial con el mismo RTT.
 *   4. Dedupe de claves duplicadas dentro del batch: 1ª 'ok' → copia; 1ª 'error' →
 *      reintento (semántica del flujo secuencial original).
 *   5. Fallo parcial no aborta el batch.
 *   6. Los upserts de sync_log se resuelven antes de responder (durabilidad) y
 *      respetan el orden por clave (último estado persistido correcto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as syncBatchPOST } from '@/app/api/sync/batch/route';

const RTT_MS = 40;
const UUID_STORE = 'a1111111-1111-4111-8111-111111111111';
const USER = '11111111-2222-4333-8444-555555555555';

// Registro de llamadas con timeline
interface Call { kind: 'rpc' | 'select' | 'upsert'; name?: string; key?: string; start: number; end: number; status?: string }
const calls: Call[] = [];
const persistedRows: Array<Record<string, any>> = [];
const existingLogs = new Map<string, { status: string; response_data: any }>();
// rpcCallsByKey: cuántas veces se invocó un RPC por idempotency_key (via args)
const rpcFailures = new Map<string, number>(); // key -> nº de primeros fallos

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { mockClient } = vi.hoisted(() => ({
  mockClient: {} as any,
}));

// El mock se construye en runtime (necesita acceso a los contadores del módulo de test)
function buildClient() {
  return {
    rpc: async (name: string, args: any) => {
      const start = Date.now();
      await sleep(RTT_MS);
      const key = args?.p_idempotency_key ?? 'no-key';
      const failsLeft = rpcFailures.get(key) ?? 0;
      if (failsLeft > 0) {
        rpcFailures.set(key, failsLeft - 1);
        calls.push({ kind: 'rpc', name, start, end: Date.now() });
        return { data: null, error: { message: `RPC failed for ${key}`, code: 'XX111' } };
      }
      calls.push({ kind: 'rpc', name, start, end: Date.now() });
      return { data: `id-${key.slice(0, 8)}`, error: null };
    },
    from: (table: string) => {
      if (table !== 'sync_log') throw new Error(`unexpected table ${table}`);
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = (_col: string, key: string) => {
        builder.__key = key;
        return builder;
      };
      builder.single = async () => {
        const start = Date.now();
        await sleep(RTT_MS);
        calls.push({ kind: 'select', key: builder.__key, start, end: Date.now() });
        return { data: existingLogs.get(builder.__key) ?? null, error: null };
      };
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.upsert = async (row: any) => {
        const start = Date.now();
        await sleep(RTT_MS);
        calls.push({ kind: 'upsert', key: row.idempotency_key, status: row.status, start, end: Date.now() });
        // persistir al RESOLVER (para validar que el route espera antes de responder)
        persistedRows.push({ ...row, __persistedAt: Date.now() });
        existingLogs.set(row.idempotency_key, { status: row.status, response_data: row.response_data });
        return { data: null, error: null };
      };
      return builder;
    },
  };
}

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => (req: any) =>
    fn(req, {
      user: { id: USER, role: 'admin', memberships: [{ store_id: UUID_STORE, status: 'active' }] },
      token: 'test-token',
    }),
  withStoreAccess: (fn: any) => (req: any) => fn(req, {} as any),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg ?? code }),
}));
vi.mock('@/lib/receipt-items-validation', () => ({
  validateReceiptItemsTasa: vi.fn(() => ({ valid: true, error: null, details: null })),
}));
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn(() => mockClient),
  supabase: mockClient,
}));

// Delegar al builder en runtime
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
(getSupabaseAuthClient as any).mockImplementation(() => buildClient());

function makeReq(body: any): any {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/sync/batch',
    nextUrl: { pathname: '/api/sync/batch' },
  } as any;
}

const keyAt = (i: number) => `33333333-0000-0000-0000-${String(i).padStart(12, '0')}`;

function op(key: string, entity = 'sale', payload: any = null) {
  return {
    idempotencyKey: key,
    operationType: 'CREATE',
    entity,
    payload: payload ?? {
      p_store_id: UUID_STORE,
      p_items: [{ product_id: '99999999-0000-0000-0000-000000000001', quantity: 1, unit_price: 10 }],
    },
    createdAt: '2026-10-12T00:00:00.000Z',
    clientClock: 0,
    status: 'pending',
    attempts: 0,
  };
}

const batchOf = (ops: any[]) => ({
  clientInfo: { userId: 'sync-engine', deviceId: 'vitest' },
  operations: ops,
});

beforeEach(() => {
  calls.length = 0;
  persistedRows.length = 0;
  existingLogs.clear();
  rpcFailures.clear();
  vi.clearAllMocks();
});

describe('W4 — sync/batch round-trip reduction (orden intacto)', () => {
  it('1) RPCs de negocio en serie: start[i+1] >= end[i]', async () => {
    const ops = [0, 1, 2, 3, 4].map((i) => op(keyAt(i)));
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    expect(res.status).toBe(200);
    const rpcs = calls.filter((c) => c.kind === 'rpc');
    expect(rpcs).toHaveLength(5);
    for (let i = 1; i < rpcs.length; i++) {
      expect(rpcs[i].start).toBeGreaterThanOrEqual(rpcs[i - 1].end);
    }
  });

  it('2) Prefetch de idempotencia: N selects por claves ÚNICAS (no por op)', async () => {
    const duplicated = op(keyAt(1)); // misma clave que la op índice 1
    const ops = [op(keyAt(0)), op(keyAt(1)), op(keyAt(2)), duplicated, op(keyAt(3))];
    await syncBatchPOST(makeReq(batchOf(ops)));
    const selects = calls.filter((c) => c.kind === 'select');
    expect(selects).toHaveLength(4); // 5 ops, 4 claves únicas
    // el RPC del duplicado NO se re-ejecuta (resultado copiado)
    const rpcs = calls.filter((c) => c.kind === 'rpc');
    expect(rpcs).toHaveLength(4);
  });

  it('3) Latencia total < equivalente secuencial con el mismo RTT simulado', async () => {
    const ops = [0, 1, 2, 3, 4, 5].map((i) => op(keyAt(i)));
    const t0 = Date.now();
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    const duration = Date.now() - t0;
    expect(res.status).toBe(200);
    // Secuencial original: 6 ops × 3 llamadas × 40ms ≈ 720ms (+ overhead)
    // Optimizado: prefetch paralelo (~40ms) + 6 RPCs en serie (~240ms) +
    // upserts en pipeline (solapados con RPCs) ≈ 280-340ms.
    expect(duration).toBeGreaterThanOrEqual(6 * RTT_MS); // los RPCs no se paralelizaron
    expect(duration).toBeLessThan(480); // muy por debajo de ~720ms secuencial
  });

  it('4) Clave duplicada con 1ª ok: resultado copiado, mismo serverId', async () => {
    const ops = [op(keyAt(7)), op(keyAt(7))];
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].status).toBe('ok');
    expect(body.results[1].status).toBe('ok');
    expect(body.results[1].serverId).toBe(body.results[0].serverId);
    const rpcs = calls.filter((c) => c.kind === 'rpc');
    expect(rpcs).toHaveLength(1); // el duplicado no re-ejecuta
  });

  it('5) Clave duplicada con 1ª error: reintento (RPC ×2), ambos error', async () => {
    rpcFailures.set(keyAt(8), 99); // falla siempre
    const ops = [op(keyAt(8)), op(keyAt(8))];
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].status).toBe('error');
    expect(body.results[1].status).toBe('error');
    const rpcs = calls.filter((c) => c.kind === 'rpc');
    expect(rpcs).toHaveLength(2); // el duplicado reintenta (semántica original)
  });

  it('6) Fallo parcial no aborta el batch (op2 falla, op3 se ejecuta)', async () => {
    rpcFailures.set(keyAt(9), 1); // solo el 1er intento de esta clave falla
    const ops = [op(keyAt(0)), op(keyAt(9)), op(keyAt(2))];
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    const body = await res.json();
    expect(body.results.map((r: any) => r.status)).toEqual(['ok', 'error', 'ok']);
    const rpcs = calls.filter((c) => c.kind === 'rpc');
    expect(rpcs.map((c) => c.name)).toHaveLength(3);
  });

  it('7) Durabilidad: los upserts se resuelven ANTES de responder; orden por clave respetado', async () => {
    // 1ª intento de keyAt(10) falla, el duplicado reintenta con éxito →
    // dos upserts para la misma clave (error → ok). El último estado persistido
    // debe ser 'ok' (encadenamiento por clave), y todos persistidos al responder.
    rpcFailures.set(keyAt(10), 1);
    const ops = [op(keyAt(10)), op(keyAt(10)), op(keyAt(11))];
    const res = await syncBatchPOST(makeReq(batchOf(ops)));
    const body = await res.json();
    expect(body.results.map((r: any) => r.status)).toEqual(['error', 'ok', 'ok']);
    // todo persistido antes de responder
    expect(persistedRows).toHaveLength(3); // 10-error, 10-ok (retry), 11-ok
    const rowsFor10 = persistedRows.filter((r) => r.idempotency_key === keyAt(10));
    expect(rowsFor10.length).toBe(2);
    expect(rowsFor10[rowsFor10.length - 1].status).toBe('ok');
  });
});
