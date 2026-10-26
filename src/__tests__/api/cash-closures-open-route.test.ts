/**
 * MISIÓN CP-CASH-OPENING-001 — POST /api/cash-closures/open.
 *
 * Drive del handler REAL: la apertura de turno pasa por el RPC autoritativo
 * open_cash_shift (service_role) con validación Zod, CSRF, rate-limit y
 * mapeo explícito de los códigos de negocio del RPC:
 *   · PGRST202 (RPC ausente) → 501 { fallback: true } para que el cliente
 *     degrade al INSERT legado bajo RLS — abrir caja nunca queda bloqueado.
 *   · ERR_SHIFT_ALREADY_OPEN → 409 (un solo turno pendiente por tienda).
 *   · ERR_OPENING_DIFFERENCE_NOTE_REQUIRED → 422 (diferencia contado vs
 *     libro físico exige causa ≥ 10 caracteres).
 *   · ERR_EXCHANGE_RATE_UNAVAILABLE → 409 (apertura en USD sin tasa).
 *   · ERR_FORBIDDEN_ROLE / ERR_UNAUTHORIZED → 403.
 *   · Éxito → 200 con el resultado del RPC (counted/expected/diferencias).
 * Cero conexiones reales: el admin client es un mock capturador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/csrf', () => ({ validateOrigin: vi.fn(() => true) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => adminClient),
}));

// ── Mock capturador del admin client (service_role) ──
const rpcCalls: Array<Record<string, unknown>> = [];
let rpcResult: { data: unknown; error: unknown } = { data: { status: 'success' }, error: null };
const adminClient = {
  rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return rpcResult;
  }),
};

import { POST } from '@/app/api/cash-closures/open/route';

const STORE = '11111111-1111-1111-1111-111111111111';

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/cash-closures/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = { data: { status: 'success' }, error: null };
});

describe('CP-CASH-OPENING-001 · /api/cash-closures/open — validación y mapeo de errores', () => {
  it('cuerpo válido → llama a open_cash_shift con el actor de sesión y devuelve 200', async () => {
    const res = await POST(jsonReq({
      store_id: STORE,
      counted_cup: 3000,
      counted_usd: 100,
      opening_note: 'Turno matutino',
      difference_note: 'Faltan billetes por entrega no registrada',
      idempotency_key: 'open-abc-123',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'success' });
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('open_cash_shift');
    expect(rpcCalls[0].args).toMatchObject({
      p_store_id: STORE,
      p_opening_balance_cup: 3000,
      p_opening_balance_usd: 100,
      p_opening_note: 'Turno matutino',
      p_difference_note: 'Faltan billetes por entrega no registrada',
      p_idempotency_key: 'open-abc-123',
      p_user_id: 'user-1', // actor-explícito de la sesión (paridad con close)
    });
  });

  it('store_id no-uuid / negativos / 3 decimales → 400 sin tocar el RPC', async () => {
    const r1 = await POST(jsonReq({ store_id: 'store-1', counted_cup: 10, counted_usd: 0 }));
    expect(r1.status).toBe(400);
    const r2 = await POST(jsonReq({ store_id: STORE, counted_cup: -5, counted_usd: 0 }));
    expect(r2.status).toBe(400);
    const r3 = await POST(jsonReq({ store_id: STORE, counted_cup: 10.005, counted_usd: 0 }));
    expect(r3.status).toBe(400);
    expect(rpcCalls.length).toBe(0);
  });

  it('counted_usd omitido → default 0 en el RPC (apertura solo CUP)', async () => {
    await POST(jsonReq({ store_id: STORE, counted_cup: 500 }));
    expect(rpcCalls[0].args).toMatchObject({ p_opening_balance_cup: 500, p_opening_balance_usd: 0 });
  });

  it('PGRST202 (RPC ausente del esquema) → 501 {fallback:true} — degradación, no bloqueo', async () => {
    rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.open_cash_shift in the schema cache' },
    };
    const res = await POST(jsonReq({ store_id: STORE, counted_cup: 500 }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.fallback).toBe(true);
  });

  it('ERR_SHIFT_ALREADY_OPEN → 409 con mensaje accionable (un turno por tienda)', async () => {
    rpcResult = { data: null, error: { message: 'ERR_SHIFT_ALREADY_OPEN: ya existe un turno pendiente (abierto 2026-10-26)' } };
    const res = await POST(jsonReq({ store_id: STORE, counted_cup: 500 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Ya existe un turno pendiente');
  });

  it('ERR_OPENING_DIFFERENCE_NOTE_REQUIRED → 422 (diferencia vs libro exige causa)', async () => {
    rpcResult = {
      data: null,
      error: { message: 'ERR_OPENING_DIFFERENCE_NOTE_REQUIRED: lo contado difiere del saldo del libro (CUP 0, USD 0) — documente la causa autorizada de la diferencia' },
    };
    const res = await POST(jsonReq({ store_id: STORE, counted_cup: 3000 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_OPENING_DIFFERENCE_NOTE_REQUIRED');
    expect(body.error).toContain('documente la causa');
  });

  it('ERR_EXCHANGE_RATE_UNAVAILABLE → 409 (USD sin tasa configurada)', async () => {
    rpcResult = { data: null, error: { message: 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda' } };
    const res = await POST(jsonReq({ store_id: STORE, counted_cup: 0, counted_usd: 50 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('tasa USD');
  });

  it('ERR_FORBIDDEN_ROLE → 403 (sin rol de caja en la tienda)', async () => {
    rpcResult = { data: null, error: { message: 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda' } };
    const res = await POST(jsonReq({ store_id: STORE, counted_cup: 500 }));
    expect(res.status).toBe(403);
  });
});
