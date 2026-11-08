/**
 * CP-POS-002 (D4) — Descarte auditado de ventas: autorización server-side,
 * motivo obligatorio, auditoría PRIMERO, fail-closed si la auditoría falla.
 * Patrón de mocks del route: mismo que sync-batch-w4-roundtrips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER = '99999999-8888-4777-8666-555555555555';
const STORE = '11111111-2222-4333-8444-555555555555';
const OP_KEY = '00000000-0000-4000-8000-000000000001';

const auditInsert = vi.fn();

function mockClient() {
  return {
    from: (table: string) => {
      if (table !== 'audit_logs') throw new Error(`unexpected table ${table}`);
      return { insert: auditInsert };
    },
  };
}

vi.mock('@/lib/auth-middleware', () => ({
  // Firma real: withAuth(handler) → (req) => handler(req, session) —
  // la sesión se extrae del req mockeado (__session).
  withAuth: (fn: any) => (req: any) => fn(req, req.__session),
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
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => mockClient(),
}));

import { POST as discardPOST } from '@/app/api/sync/discard/route';

function makeReq(body: unknown, role = 'admin') {
  return {
    method: 'POST',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-forwarded-for' ? 'test-client' : null,
    },
    json: async () => body,
    // withAuth real es (req) => handler(req, session): el mock de
    // auth-middleware extrae la sesión de aquí.
    __session: {
      user: { id: USER, role, memberships: [] },
      token: 't',
    },
  } as never;
}

const baseBody = {
  operationKey: OP_KEY,
  storeId: STORE,
  entity: 'sale',
  errorCode: 'ERR_INSUFFICIENT_STOCK',
  reason: 'Venta duplicada por error del cajero, se anula manualmente.',
};

beforeEach(() => {
  auditInsert.mockReset();
  auditInsert.mockResolvedValue({ error: null });
});

describe('CP-POS-002 · D4 descarte auditado (server-side)', () => {
  const run = (role: string, body: unknown) =>
    discardPOST(makeReq(body, role));

  it('rol verificado EN EL SERVIDOR: cajero (worker) NO puede descartar', async () => {
    const res = await run('worker', baseBody);
    expect(res.status).toBe(403);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('rol del CLIENTE jamás se consulta: la sesión decide (worker con body "admin" igual rechazado)', async () => {
    const res = await run('worker', { ...baseBody, role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('admin con motivo válido: auditoría PRIMERO, confirmación después', async () => {
    const res = await run('admin', baseBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.discarded).toBe(true);
    // La auditoría se escribió con los campos exigidos.
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const row = auditInsert.mock.calls[0][0];
    expect(row.user_id).toBe(USER);
    expect(row.action).toBe('sync_sale_discarded');
    expect(row.store_id).toBe(STORE);
    expect(row.metadata.operation_key).toBe(OP_KEY);
    expect(row.metadata.reason).toBe(baseBody.reason);
    expect(row.metadata.source).toBe('server');
  });

  it('motivo obligatorio (<10 chars) → 400 SIN auditoría', async () => {
    const res = await run('admin', { ...baseBody, reason: 'corto' });
    expect(res.status).toBe(400);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('sin motivo → 400', async () => {
    const { reason: _r, ...noReason } = baseBody;
    const res = await run('admin', noReason);
    expect(res.status).toBe(400);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED: si la auditoría falla NO se confirma el descarte (500)', async () => {
    auditInsert.mockResolvedValue({ error: { message: 'insert failed' } });
    const res = await run('admin', baseBody);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain('se conserva');
  });

  it('la auditoría NO registra PII ni payload comercial', async () => {
    await run('admin', { ...baseBody, reason: 'Motivo suficientemente largo para el test.' });
    const row = auditInsert.mock.calls[0][0];
    const meta = JSON.stringify(row.metadata);
    // El evento lleva operation_key/entidad/código/motivo — no payload.
    expect(meta).not.toContain('p_items');
    expect(meta).not.toContain('customer');
    expect(meta).not.toContain('phone');
  });

  it('operationKey debe ser UUID de la cola (validación de forma)', async () => {
    const res = await run('admin', { ...baseBody, operationKey: 'no-un-uuid' });
    expect(res.status).toBe(400);
  });
});
