/**
 * REM-V2-3 — PHASE 6 DYNAMIC REACHABILITY (temporary gate instrument)
 *
 * Drives the REAL POST /api/reverse handler with a capturing supabase-admin
 * mock and records the exact RPC name invoked for each document type under
 * both flag states. This is application-boundary dynamic evidence:
 *   - USE_V2_REVERSE=true  -> only V2 RPC names (reverse_receipt_v2, reverse_inventory_adjustment_v2)
 *   - USE_V2_REVERSE=false (fail-closed code default) -> V1 names reachable
 *     (reverse_receipt, reverse_adjustment) — PROOF the V1 map entries are
 *     dynamically reachable unless neutralized (H5-B1 pattern).
 * No DB is touched (mock client). Production unaffected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/reverse/route';

const flagState = { v2Reverse: true };

const mockSession = { value: { user: { id: 'user-admin-1', role: 'admin', memberships: [] } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
  getServerSession: async () => mockSession.value,
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/config/features', () => ({
  FEATURES: {
    get USE_V2_REVERSE() { return flagState.v2Reverse; },
    USE_V2_CHECKOUT: true,
    V2_CHECKOUT_PILOT_STORES: [],
  },
  shouldUseV2Checkout: () => true,
}));

const UUID = 'a1111111-1111-4111-8111-111111111111';
const rpcCalls: Array<{ name: string; args: any }> = [];
const mockFrom = vi.fn();
const mockAdminClient = {
  from: (table: string) => mockFrom(table),
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    // authorization boundary helpers -> allow; final RPC -> success payload
    if (name === 'can_reverse_document' || name === 'can_admin_reverse_transaction') {
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve({ data: { ok: true, status: 'REVERSADA' }, error: null });
  },
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: vi.fn(() => mockAdminClient) }));

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/reverse',
  } as any;
}

async function drive(type: string) {
  rpcCalls.length = 0;
  const res = await POST(makeRequest({ type, id: UUID, reason: 'rem-v2-3 dynamic reachability probe' }));
  return { status: res.status, body: await res.json() };
}

// table mock for the boundary store lookup (REVERSE_ENTITY + transactions)
beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { store_id: 'store-a' }, error: null }),
  }));
});

describe('REM-V2-3 PHASE 6 — dynamic RPC selection at /api/reverse', () => {
  it('flag=true: receipt -> reverse_receipt_v2 (V2 exact)', async () => {
    flagState.v2Reverse = true;
    const { status } = await drive('receipt');
    expect(status).toBe(200);
    const final = rpcCalls[rpcCalls.length - 1];
    expect(final.name).toBe('reverse_receipt_v2');
    expect(final.args.p_receipt_id).toBe(UUID);
    expect(final.args.p_reason).toContain('rem-v2-3');
    expect(rpcCalls.some(c => c.name === 'reverse_receipt')).toBe(false);
  });

  it('flag=true: adjustment -> reverse_inventory_adjustment_v2 (V2 exact)', async () => {
    flagState.v2Reverse = true;
    const { status } = await drive('adjustment');
    expect(status).toBe(200);
    const final = rpcCalls[rpcCalls.length - 1];
    expect(final.name).toBe('reverse_inventory_adjustment_v2');
    expect(final.args.p_adjustment_id).toBe(UUID);
    expect(rpcCalls.some(c => c.name === 'reverse_adjustment')).toBe(false);
  });

  it('flag=false (fallback): receipt -> reverse_receipt_v2  [REM-V2-3: V1 inalcanzable]', async () => {
    flagState.v2Reverse = false;
    const { status } = await drive('receipt');
    expect(status).toBe(200);
    const final = rpcCalls[rpcCalls.length - 1];
    expect(final.name).toBe('reverse_receipt_v2');
    expect(rpcCalls.some(c => c.name === 'reverse_receipt')).toBe(false);
  });

  it('flag=false (fallback): adjustment -> reverse_inventory_adjustment_v2  [REM-V2-3: V1 inalcanzable]', async () => {
    flagState.v2Reverse = false;
    const { status } = await drive('adjustment');
    expect(status).toBe(200);
    const final = rpcCalls[rpcCalls.length - 1];
    expect(final.name).toBe('reverse_inventory_adjustment_v2');
    expect(rpcCalls.some(c => c.name === 'reverse_adjustment')).toBe(false);
  });

  it('H5-B1 pin holds BOTH flag states: transaction -> reverse_transaction_v2 (never V1)', async () => {
    flagState.v2Reverse = true;
    await drive('transaction');
    expect(rpcCalls[rpcCalls.length - 1].name).toBe('reverse_transaction_v2');
    flagState.v2Reverse = false;
    await drive('transaction');
    expect(rpcCalls[rpcCalls.length - 1].name).toBe('reverse_transaction_v2');
    expect(rpcCalls.some(c => c.name === 'reverse_transaction')).toBe(false);
  });

  it('authorization boundary precedes any RPC dispatch (B-10)', async () => {
    flagState.v2Reverse = true;
    await drive('receipt');
    expect(rpcCalls[0].name).toBe('can_reverse_document');
    expect(rpcCalls[0].args.p_operation).toBe('receipt');
  });
});
