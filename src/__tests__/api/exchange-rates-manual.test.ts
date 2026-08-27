import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/exchange-rates/manual/route';

/**
 * F3-P1-01 — Pruebas de autorización/auditoría para tasas manuales.
 * DECISION-FX-01: solo rol global 'admin' puede mutar la tasa global.
 * La suíte verifica también el orden de gates (CSRF antes de negocio) y la
 * inserción de auditoría en exchange_rate_audit.
 */

const mockOriginAllowed = { value: true };
const mockUpsertSingle = { value: { data: { id: 'fx-row-1' }, error: null } };
const auditCalls = { inserts: [] as any[] };

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

const upsertFn = vi.fn();
const auditInsertFn = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'exchange_rates') {
        const chain: any = {};
        chain.upsert = (...args: any[]) => { upsertFn(...args); return chain; };
        chain.select = () => chain;
        chain.single = async () => mockUpsertSingle.value;
        return chain;
      }
      // exchange_rate_audit
      return {
        insert: (payload: any) => { auditCalls.inserts.push(payload); return auditInsertFn(payload); },
      };
    },
  })),
}));

const mockSession = {
  value: { id: 'admin-actor', role: 'admin' } as any,
};

function makeRequest(body: unknown): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '10.0.0.9']]),
    json: async () => body,
    url: 'http://localhost:3000/api/exchange-rates/manual',
  } as any;
}

describe('POST /api/exchange-rates/manual · FIX F3-P1-01', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditCalls.inserts = [];
    mockOriginAllowed.value = true;
    mockUpsertSingle.value = { data: { id: 'fx-row-1' }, error: null };
    mockSession.value = { id: 'admin-actor', role: 'admin' };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('clerk ordinario recibe 403 y NO se ejecuta el upsert', async () => {
    mockSession.value = { id: 'clerk-1', role: 'clerk' };
    const res = await POST(makeRequest({ currency: 'USD', rate: 320 }) as any);
    expect(res.status).toBe(403);
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it('rol manager recibe 403 (la tasa es dato global, no por tienda)', async () => {
    mockSession.value = { id: 'mgr-1', role: 'manager' };
    const res = await POST(makeRequest({ currency: 'EUR', rate: 350 }) as any);
    expect(res.status).toBe(403);
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it('origen inválido recibe 403 aunque sea admin (CSRF primero)', async () => {
    mockOriginAllowed.value = false;
    const res = await POST(makeRequest({ currency: 'USD', rate: 300 }) as any);
    expect(res.status).toBe(403);
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it('payload inválido (rate fuera de rango) recibe 400 sin tocar BD', async () => {
    const res = await POST(makeRequest({ currency: 'USD', rate: 999999 }) as any);
    expect(res.status).toBe(400);
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it('moneda fuera del enum recibe 400', async () => {
    const res = await POST(makeRequest({ currency: 'GBP', rate: 300 }) as any);
    expect(res.status).toBe(400);
  });

  it('admin con origen válido muta la tasa y registra auditoría', async () => {
    const res = await POST(
      makeRequest({ currency: 'USD', rate: 325.5, rate_date: '2026-08-27' }) as any
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(upsertFn).toHaveBeenCalledTimes(1);
    expect(upsertFn.mock.calls[0][0]).toMatchObject({
      currency: 'USD',
      rate: 325.5,
      rate_date: '2026-08-27',
      source: 'elToque',
      capture_method: 'real',
    });
    // pista de auditoría persistente
    expect(auditCalls.inserts).toHaveLength(1);
    expect(auditCalls.inserts[0]).toMatchObject({
      actor_id: 'admin-actor',
      action: 'manual_upsert',
      currency: 'USD',
      new_rate: 325.5,
      rate_date: '2026-08-27',
      source_ip: '10.0.0.9',
    });
  });
});
