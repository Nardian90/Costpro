/**
 * MISIÓN DE CIERRE (2026-10-24) — contrato de la ruta /api/reverse:
 * p_recovery (recuperación explícita del dinero de devoluciones).
 * Drive del REAL POST handler con mock capturador del cliente admin:
 *  - recovery SOLO viaja cuando type='devolution' (las demás RPC no tienen
 *    el parámetro → PostgREST PGRST202 si llegara);
 *  - schema zod: array ≤2 de {currency, method, operation_date?, notes?};
 *  - ERR_DEVOLUTION_REFUND_NOT_RECOVERED → 422 accionable (el frontend
 *    muestra el formulario de recuperación).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as REVERSE } from '@/app/api/reverse/route';

const sessionState = {
  value: { user: { id: 'user-1', role: 'admin', memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));

const rpcCalls: Array<{ name: string; args: any }> = [];
const rpcResult = { value: { data: null as any, error: null as any } };
const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    // boundary normativo del API (la BD sigue siendo la última barrera)
    if (name === 'can_reverse_document' || name === 'can_admin_reverse_transaction') {
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve(rpcResult.value);
  },
  from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { store_id: 'store-1' }, error: null }) }) }) }),
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

// can_reverse_document → true (boundary del API: la BD es la última barrera)
vi.mock('@/lib/supabase-session', () => ({}));

function makeReq(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/reverse',
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult.value = { data: { status: 'success' }, error: null };
});

describe('POST /api/reverse — recuperación explícita (p_recovery)', () => {
  it('type=devolution con recovery → reverse_devolution con p_recovery jsonb', async () => {
    const res = await REVERSE(makeReq({
      type: 'devolution',
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'error operativo, cliente devolvió el dinero',
      recovery: [{ currency: 'CUP', method: 'cash' }],
    }));
    expect(res.status).toBe(200);
    expect(rpcCalls.length).toBeGreaterThan(0);
    const rev = rpcCalls.find(c => c.name === 'reverse_devolution');
    expect(rev).toBeDefined();
    expect(rev!.args.p_recovery).toEqual([{ currency: 'CUP', method: 'cash' }]);
    expect(rev!.args.p_user_id).toBe('user-1');
  });

  it('recovery multi-moneda: ambos componentes viajan (moneda+riel+fecha)', async () => {
    const res = await REVERSE(makeReq({
      type: 'devolution',
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'recuperación completa en ambos rieles',
      recovery: [
        { currency: 'CUP', method: 'cash', operation_date: '2026-10-24T12:00:00Z' },
        { currency: 'USD', method: 'zelle', notes: 'transferencia de vuelta' },
      ],
    }));
    expect(res.status).toBe(200);
    const rev = rpcCalls.find(c => c.name === 'reverse_devolution')!;
    expect(rev.args.p_recovery).toHaveLength(2);
    expect(rev.args.p_recovery[0].operation_date).toBe('2026-10-24T12:00:00Z');
    expect(rev.args.p_recovery[1].notes).toBe('transferencia de vuelta');
  });

  it('type≠devolution: recovery NO viaja (PGRST202 imposible) aunque llegue', async () => {
    const res = await REVERSE(makeReq({
      type: 'transaction',
      id: '22222222-2222-4222-8222-222222222222',
      reason: 'venta errónea',
      recovery: [{ currency: 'CUP', method: 'cash' }],
    }));
    expect(res.status).toBe(200);
    const tx = rpcCalls.find(c => c.name === 'reverse_transaction_v2');
    expect(tx).toBeDefined();
    expect(tx!.args.p_recovery).toBeUndefined();
  });

  it('ERR_DEVOLUTION_REFUND_NOT_RECOVERED → 422 accionable (mostrar formulario)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_REFUND_NOT_RECOVERED: la devolución tiene reembolso(s) liquidado(s) (1 componente CUP, 0 componente USD) y el dinero no ha vuelto a la caja. La reversión es ATÓMICA con la recuperación: envíe p_recovery = [{currency, method, operation_date?, notes?}] con la moneda y el riel reales de cobro (el importe lo fija el servidor). Una reversión documental no puede liberar el tope de reembolso como si el dinero hubiera regresado.' } };
    const res = await REVERSE(makeReq({
      type: 'devolution',
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'intentar revertir sin recuperar',
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('ERR_DEVOLUTION_REFUND_NOT_RECOVERED');
    expect(body.error).toContain('ATÓMICA');
  });

  it('guards de recuperación → 422/409 accionables', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_RECOVERY_COMPONENTS: los componentes de recuperación deben cubrir EXACTAMENTE las monedas reembolsadas (esperado: 1 CUP + 1 USD; recibido: 1 CUP + 0 USD). La recuperación de una moneda no compensa la otra.' } };
    const res = await REVERSE(makeReq({
      type: 'devolution',
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'recuperación incompleta',
      recovery: [{ currency: 'CUP', method: 'cash' }],
    }));
    expect(res.status).toBe(422);

    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_ALREADY_RECOVERED: ya existe una recuperación en USD para esta devolución (idempotencia dev-%-recovery-%)' } };
    const res2 = await REVERSE(makeReq({
      type: 'devolution',
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'doble recuperación',
      recovery: [{ currency: 'USD', method: 'cash' }],
    }));
    expect(res2.status).toBe(409);
  });

  it('schema: moneda/método inválidos y >2 componentes → 400 (nunca al RPC)', async () => {
    for (const badRecovery of [
      [{ currency: 'EUR' as any, method: 'cash' }],
      [{ currency: 'CUP', method: 'bitcoin' as any }],
      [{ currency: 'CUP', method: 'cash' }, { currency: 'USD', method: 'cash' }, { currency: 'CUP' as 'USD', method: 'cash' }],
    ]) {
      const res = await REVERSE(makeReq({
        type: 'devolution',
        id: '11111111-1111-4111-8111-111111111111',
        reason: 'validación de schema',
        recovery: badRecovery,
      }));
      expect(res.status).toBe(400);
      expect(rpcCalls.filter(c => c.name === 'reverse_devolution')).toHaveLength(0);
    }
  });
});
