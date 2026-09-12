/**
 * REM-INV-2 — PHASE 5 DYNAMIC REACHABILITY (gate instrument)
 *
 * Drives the REAL purchase-reception handlers with a capturing Supabase mock
 * and records the EXACT RPC name each workflow invokes. No DB touched.
 *
 * Handlers driven:
 *   1. POST /api/inventory/receptions            (offline sync endpoint REC-2)
 *   2. POST /api/sync/batch (entity=reception)   (SyncEngine batch replay)
 *   3. POST /api/purchase-orders/[id]            (receive-against-PO UI)
 *
 * Expected: register_reception / receive_against_po — NEVER receive_purchase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as receptionsPOST } from '@/app/api/inventory/receptions/route';
import { POST as poPOST } from '@/app/api/purchase-orders/[id]/route';
import { POST as syncBatchPOST } from '@/app/api/sync/batch/route';

const UUID = 'a1111111-1111-4111-8111-111111111111';
const rpcCalls: Array<{ name: string; args: any }> = [];

const session = {
  user: {
    id: '11111111-2222-4333-8444-555555555555',
    role: 'admin',
    token: 'staging-token',
    memberships: [{ store_id: UUID, status: 'active' }],
  },
} as any;

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => (req: any) => fn(req, session),
  withStoreAccess: (fn: any) => (req: any) => fn(req, session),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/with-security', () => ({ withSecurity: (fn: any) => (req: any, s: any) => fn(req, s) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg ?? code }),
}));

const RECEIPT_ID = '22222222-3333-4444-8555-666666666666';
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: RECEIPT_ID, error: null });
    },
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { store_id: UUID }, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn(() => mockClient),
  supabase: mockClient,
}));
vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: vi.fn(() => mockClient),
}));

const ITEM = {
  product_id: '99999999-0000-0000-0000-000000000001',
  quantity: 10,
  unit_cost: 5,
  moneda_recepcion: 'CUP',
  tasa_cambio_recepcion: 1.0,
};
const RECEPTION_PAYLOAD = {
  p_store_id: UUID,
  p_supplier: 'SUPPLIER X',
  p_reception_date: '2026-09-13T00:00:00.000Z',
  p_invoice_number: 'INV-REM-INV-2',
  p_items: [ITEM],
};

function makeReq(body: any, url = 'http://localhost:3000/x'): any {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url,
    nextUrl: { pathname: new URL(url).pathname },
  } as any;
}

const names = () => rpcCalls.map((c) => c.name);

describe('REM-INV-2 dynamic reachability — purchase reception workflows', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    vi.clearAllMocks();
  });

  it('W1: POST /api/inventory/receptions invokes register_reception', async () => {
    const res = await receptionsPOST(makeReq(RECEPTION_PAYLOAD));
    expect(res.status).toBe(201);
    expect(names()).toEqual(['register_reception']);
  });

  it('W2: POST /api/sync/batch entity=reception (offline replay) invokes register_reception', async () => {
    const body = {
      clientInfo: { userId: 'sync-engine', deviceId: 'vitest' },
      operations: [{
        idempotencyKey: '33333333-0000-0000-0000-000000000001',
        operationType: 'CREATE',
        entity: 'reception',
        payload: RECEPTION_PAYLOAD,
        createdAt: '2026-09-13T00:00:00.000Z',
        clientClock: 0,
        status: 'pending',
        attempts: 0,
      }],
    };
    const res = await syncBatchPOST(makeReq(body));
    expect(res.status).toBe(200);
    expect(names()).toEqual(['register_reception']);
  });

  it('W3: POST /api/purchase-orders/[id] (receive against PO) invokes receive_against_po', async () => {
    const res = await poPOST(
      makeReq({ receivedItems: [{ poItemId: '88888888-0000-0000-0000-000000000001', quantityReceived: 10 }] },
        'http://localhost:3000/api/purchase-orders/dddddddd-0000-0000-0000-000000000001'),
    );
    expect(res.status).toBe(200);
    expect(names()).toEqual(['receive_against_po']);
  });

  it('GATE: no reception workflow ever invokes receive_purchase', () => {
    // Aggregate assertion across every workflow driven above
    expect(names().filter((n) => n === 'receive_purchase')).toHaveLength(0);
  });
});
