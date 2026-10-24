/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — FASE 2/9: contrato de la asignación de
 * empresa (RPC assign_user_organization vía /api/users/[id]/assign-organization).
 *
 * Invariantes (misión FASE 2 §3):
 *   · Consecuencias visibles ANTES de aplicar: si hay membresías de otra
 *     empresa, la primera llamada devuelve requires_confirmation con el
 *     detalle y NO aplica nada.
 *   · Con confirmación: aplica atómicamente (RPC) y audita.
 *   · Rechazos de regla de negocio: actor sin permiso, org inactiva,
 *     usuario superadmin intocable — el servidor decide, no el cliente.
 *   · El CSRF se valida antes del handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentSession = {
  token: 'test-token',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@costpro.dev', role: 'admin' },
};

let sessionOverride = { ...currentSession };
let csrfResult = true;
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

const calls = {
  csrf: [] as unknown[],
  rpc: [] as Array<{ name: string; params: unknown }>,
};

vi.mock('@/lib/auth-middleware', () => ({
  withRole: (_role: unknown, fn: any) => async (req: any) => fn(req, sessionOverride),
}));

vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: async () => { calls.csrf.push(1); return csrfResult; } }));
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() } }));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_DEST = 'aaaaaaa1-0000-4000-8000-00000000000a';

const state: { memberships: Array<Record<string, unknown>>; stores: Array<Record<string, unknown>> } = {
  memberships: [],
  stores: [],
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      if (table === 'user_store_memberships') {
        return {
          select: () => ({
            eq: (_c: string, v: unknown) => ({
              eq: (_c2: string, _v2: unknown) =>
                Promise.resolve({ data: state.memberships }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: () => ({
            in: (_c: string, _ids: unknown[]) => Promise.resolve({ data: state.stores }),
          }),
        };
      }
      return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
    },
    rpc: async (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return rpcResult;
    },
  }),
}));

import { POST } from '@/app/api/users/[id]/assign-organization/route';

function makeReq(body: unknown) {
  return {
    url: `http://localhost:3000/api/users/${USER_ID}/assign-organization`,
    nextUrl: new URL(`http://localhost:3000/api/users/${USER_ID}/assign-organization`),
    method: 'POST',
    json: async () => body,
  } as any;
}

describe('MISIÓN ORGANIZACIONES — asignación de empresa (FASE 2 §3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    csrfResult = true;
    calls.csrf.length = 0;
    calls.rpc.length = 0;
    state.memberships = [];
    state.stores = [];
    rpcResult = { data: null, error: null };
  });

  it('CSRF se valida ANTES de cualquier consulta', async () => {
    csrfResult = false;
    const res = await POST(makeReq({ organization_id: ORG_DEST }));
    expect(res.status).toBe(403);
    expect(calls.csrf).toHaveLength(1);
    expect(calls.rpc).toHaveLength(0);
  });

  it('Primera llamada SIN confirmación: devuelve requires_confirmation con las tiendas que perderá el usuario', async () => {
    state.memberships = [
      { user_id: USER_ID, store_id: 's1', role: 'clerk', status: 'active', store: [{ id: 's1', name: 'Tienda Ajena' }] },
    ];
    state.stores = [
      { id: 's1', name: 'Tienda Ajena', tenant_id: 'other-org' },
    ];
    rpcResult = {
      data: [{ applied: false, requires_confirmation: true, removed_memberships: 1, reason: 'confirmar' }],
      error: null,
    };

    const res = await POST(makeReq({ organization_id: ORG_DEST, confirm_removals: false }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.requires_confirmation).toBe(true);
    expect(body.memberships_to_remove).toEqual([
      { store_id: 's1', store_name: 'Tienda Ajena', role: 'clerk' },
    ]);
  });

  it('Con confirmación: aplica la RPC atómica y reporta las membresías retiradas', async () => {
    rpcResult = {
      data: [{ applied: true, requires_confirmation: false, removed_memberships: 2, reason: null }],
      error: null,
    };
    const res = await POST(makeReq({ organization_id: ORG_DEST, confirm_removals: true }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.applied).toBe(true);
    expect(body.removed_memberships).toBe(2);
    expect(calls.rpc[0].params).toMatchObject({
      p_user_id: USER_ID,
      p_tenant_id: ORG_DEST,
      p_confirm_removals: true,
      p_actor_id: currentSession.user.id,
    });
  });

  it('Rechazo de regla de negocio (org inactiva / actor sin permiso) → 409 con motivo', async () => {
    rpcResult = {
      data: [{ applied: false, requires_confirmation: false, removed_memberships: 0, reason: 'La organización está inactiva' }],
      error: null,
    };
    const res = await POST(makeReq({ organization_id: ORG_DEST }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('La organización está inactiva');
  });

  it('organization_id null = dejar sin asignar (pasa p_tenant_id null a la RPC)', async () => {
    rpcResult = {
      data: [{ applied: true, requires_confirmation: false, removed_memberships: 0, reason: null }],
      error: null,
    };
    await POST(makeReq({ organization_id: null, confirm_removals: true }));
    expect(calls.rpc[0].params).toMatchObject({ p_tenant_id: null });
  });

  it('RPC con error de base de datos → 500 sin detalles internos en la respuesta', async () => {
    rpcResult = { data: null, error: { message: 'internal db detail' } };
    const res = await POST(makeReq({ organization_id: ORG_DEST }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('No se pudo asignar la organización');
    expect(JSON.stringify(body)).not.toContain('internal db detail');
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
