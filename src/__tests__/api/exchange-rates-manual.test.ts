import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/exchange-rates/manual/route';

/**
 * F3-P1-01 — Pruebas de autorización/auditoría para tasas manuales.
 *
 * DECISION-FX-01: solo rol global 'admin' puede mutar la tasa global.
 * ENMIENDA H1/E3 (DECISION-AUD-02): la ÚNICA vía de escritura es la RPC
 * atómica upsert_manual_exchange_rate_with_audit (tasa + pista old/new en
 * una transacción). La ruta NO debe escribir tablas directamente.
 *
 * La suíte verifica:
 *   - orden de gates (CSRF → rol → zod) antes de cualquier privilegio,
 *   - que NUNCA hay escritura directa de tablas (from() lanza),
 *   - que la RPC recibe actor/currency/rate/date/IP correctos,
 *   - el mapeo del rechazo de BD (actor no admin) a 403.
 */

const mockOriginAllowed = { value: true };

const rpcCalls = { args: [] as any[] };
const rpcResolve = { value: { data: null as any, error: null as any } };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) =>
    fn(req, {
      token: 't',
      user: mockSession.value,
    }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/csrf', () => ({
  validateOrigin: () => mockOriginAllowed.value,
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    // Garantía dura de E3: ninguna escritura directa permitida.
    from: () => {
      throw new Error('DIRECT-TABLE-WRITE-BLOCKED: use upsert_manual_exchange_rate_with_audit');
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.args.push({ name, ...args });
      return Promise.resolve(rpcResolve.value);
    },
  })),
}));

const mockSession = {
  value: { id: 'a4411111-1111-4111-8111-111111111111', role: 'admin' } as any,
};

function makeRequest(body: unknown): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '10.0.0.9']]),
    json: async () => body,
    url: 'http://localhost:3000/api/exchange-rates/manual',
  } as any;
}

describe('POST /api/exchange-rates/manual · FIX F3-P1-01 + H1/E3 (RPC atómica)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.args = [];
    mockOriginAllowed.value = true;
    mockSession.value = { id: 'a4411111-1111-4111-8111-111111111111', role: 'admin' };
    rpcResolve.value = {
      data: {
        success: true,
        row_id: 'fx-row-1',
        audit_id: 'aud-1',
        old_rate: 320,
        old_rate_date: '2026-08-26',
        new_rate: 325.5,
      },
      error: null,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('clerk ordinario recibe 403 y la RPC NO se invoca', async () => {
    mockSession.value = { id: 'clerk-1', role: 'clerk' };
    const res = await POST(makeRequest({ currency: 'USD', rate: 320 }) as any);
    expect(res.status).toBe(403);
    expect(rpcCalls.args).toHaveLength(0);
  });

  it('rol manager recibe 403 (la tasa es dato global, no por tienda)', async () => {
    mockSession.value = { id: 'mgr-1', role: 'manager' };
    const res = await POST(makeRequest({ currency: 'EUR', rate: 350 }) as any);
    expect(res.status).toBe(403);
    expect(rpcCalls.args).toHaveLength(0);
  });

  it('origen inválido recibe 403 aunque sea admin (CSRF primero)', async () => {
    mockOriginAllowed.value = false;
    const res = await POST(makeRequest({ currency: 'USD', rate: 300 }) as any);
    expect(res.status).toBe(403);
    expect(rpcCalls.args).toHaveLength(0);
  });

  it('payload inválido (rate fuera de rango) recibe 400 sin tocar BD', async () => {
    const res = await POST(makeRequest({ currency: 'USD', rate: 999999 }) as any);
    expect(res.status).toBe(400);
    expect(rpcCalls.args).toHaveLength(0);
  });

  it('moneda fuera del enum recibe 400', async () => {
    const res = await POST(makeRequest({ currency: 'GBP', rate: 300 }) as any);
    expect(res.status).toBe(400);
    expect(rpcCalls.args).toHaveLength(0);
  });

  it('admin con origen válido invoca la RPC atómica con actor/currency/rate/date/ip', async () => {
    const res = await POST(
      makeRequest({ currency: 'USD', rate: 325.5, rate_date: '2026-08-27' }) as any
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    expect(rpcCalls.args).toHaveLength(1);
    expect(rpcCalls.args[0].name).toBe('upsert_manual_exchange_rate_with_audit');
    expect(rpcCalls.args[0]).toMatchObject({
      p_actor_id: 'a4411111-1111-4111-8111-111111111111',
      p_currency: 'USD',
      p_rate: 325.5,
      p_rate_date: '2026-08-27',
      p_source_ip: '10.0.0.9',
    });

    // H1: la respuesta expone old/new para el operador
    expect(body.audit).toMatchObject({
      audit_id: 'aud-1',
      old_rate: 320,
      old_rate_date: '2026-08-26',
      new_rate: 325.5,
      actor_id: 'a4411111-1111-4111-8111-111111111111',
    });
  });

  it('defensa en profundidad: si la BD desmiente al admin → 403 y sin respuesta exitosa', async () => {
    rpcResolve.value = {
      data: null,
      error: { message: 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: xyz no es admin global' },
    };
    const res = await POST(makeRequest({ currency: 'USD', rate: 300 }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(rpcCalls.args).toHaveLength(1); // sí se intentó; el rechazo lo hizo la BD
  });

  it('error genérico de la RPC mapea a 500 sin falsificar éxito', async () => {
    rpcResolve.value = { data: null, error: { message: 'connection refused' } };
    const res = await POST(makeRequest({ currency: 'USD', rate: 300 }) as any);
    expect(res.status).toBe(500);
  });
});
