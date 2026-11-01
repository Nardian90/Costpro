/**
 * Tests de regresión — LIMITES-SUPABASE T4a: deduplicación de la consulta a
 * `profiles` entre getServerSession y withAuth.
 *
 * Antes: cada request de API con withAuth ejecutaba
 *   1. supabase.auth.getUser()            (Auth — verificación de identidad)
 *   2. profiles.select('role')            (getServerSession)
 *   3. profiles.select('role, roles')     (withAuth — MISMA fila re-consultada)
 *   4. user_store_memberships             (withAuth)
 * La consulta 3 es redundante cuando la 2 tuvo éxito: con 182 rutas envueltas
 * en withAuth/withRole, cada request de API gastaba 1 llamada PostgREST
 * (y su línea de log) de más.
 *
 * Ahora: getServerSession trae `role, roles` en su consulta y withAuth
 * reutiliza esos valores cuando existen, consultando solo membresías.
 * Si el profile no llegó (timeout de 3s de getServerSession o sin profile),
 * withAuth ejecuta la consulta completa como antes — fail-closed intacto y
 * getUser() (verificación de identidad) NO se toca.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  // getSupabaseAdmin: devuelve el cliente admin usado por withAuth
  getSupabaseAdmin: vi.fn(),
  getSupabaseAdminSafe: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: h.getSupabaseAdmin,
  getSupabaseAdminSafe: h.getSupabaseAdminSafe,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// withAutoTracking envuelve el handler final — mock mínimo passthrough
vi.mock('@/lib/with-usage-tracking', () => ({
  withAutoTracking: (handler: unknown) => handler,
}));

// rls-middleware: best-effort, no debe interferir
vi.mock('@/lib/rls-middleware', () => ({
  activateTenantRLS: vi.fn().mockResolvedValue(false),
}));

// getServerSession: mock controlable por test (withAuth la consume; su
// implementación real ya tiene sus propios tests — aquí aislamos la dedup).
const sessionState: { value: unknown } = { value: undefined };
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(async () => sessionState.value),
}));

import { withAuth } from '@/lib/auth-middleware';
import { NextRequest } from 'next/server';

/** Builder de supabase-js que cuenta las consultas por tabla. */
function makeClientWithCounts() {
  const calls: { table: string; columns?: string }[] = [];
  const client = {
    from: (table: string) => {
      const api: Record<string, unknown> = {};
      api.select = (columns?: string) => {
        calls.push({ table, columns });
        api.eq = () => api;
        api.single = async () => ({ data: { role: 'manager', roles: ['manager'] }, error: null });
        api.maybeSingle = async () => ({ data: null, error: null });
        api.then = (onFul: (r: unknown) => void, onRej?: (e: unknown) => void) =>
          Promise.resolve({ data: [], error: null }).then(onFul as never, onRej as never);
        return api;
      };
      return api;
    },
  };
  return { client, calls };
}

function makeReq() {
  return new NextRequest('http://localhost/api/example', {
    headers: { Authorization: 'Bearer token' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.value = undefined;
});

describe('LIMITES-SUPABASE T4a — withAuth deduplica la consulta a profiles', () => {
  it('reutiliza el profile de la sesión: consulta membresías pero NO re-consulta profiles', async () => {
    const { client, calls } = makeClientWithCounts();
    h.getSupabaseAdmin.mockReturnValue(client);
    h.getSupabaseAdminSafe.mockReturnValue(client);

    // sesión ya enriquecida por getServerSession (caso común)
    sessionState.value = {
      user: { id: 'u-1', email: 'x@x.com', role: 'manager', roles: ['manager'] },
      token: 'token',
    };
    const handler = vi.fn(async () => new Response('ok'));
    await withAuth(handler)(makeReq() as never) as never as Promise<Response>;

    const profileQueries = calls.filter(c => c.table === 'profiles');
    const membershipQueries = calls.filter(c => c.table === 'user_store_memberships');
    expect(profileQueries).toHaveLength(0); // ← la deduplicación
    expect(membershipQueries).toHaveLength(1); // membresías siguen consultándose
    expect(handler).toHaveBeenCalled();
  });

  it('sin profile en sesión (timeout de getServerSession): consulta profiles como antes (fail-closed)', async () => {
    const { client, calls } = makeClientWithCounts();
    h.getSupabaseAdmin.mockReturnValue(client);
    h.getSupabaseAdminSafe.mockReturnValue(client);

    // sin role — timeout del profile en getServerSession
    sessionState.value = {
      user: { id: 'u-1', email: 'x@x.com' },
      token: 'token',
    };
    const handler = vi.fn(async () => new Response('ok'));
    await withAuth(handler)(makeReq() as never) as never as Promise<Response>;

    const profileQueries = calls.filter(c => c.table === 'profiles');
    const membershipQueries = calls.filter(c => c.table === 'user_store_memberships');
    expect(profileQueries).toHaveLength(1); // se consulta — no se pierde el enriquecimiento
    expect(membershipQueries).toHaveLength(1);
  });

  it('la sesión sin usuario devuelve 401 antes de tocar la BD', async () => {
    // getServerSession devolvió null → withAuth corta con 401
    const { client, calls } = makeClientWithCounts();
    h.getSupabaseAdmin.mockReturnValue(client);
    h.getSupabaseAdminSafe.mockReturnValue(client);

    // Para forzar sesión null hacemos que getServerSession falle: se mockea
    // importando el módulo real de auth — más simple: probamos el camino con
    // Authorization ausente (getServerSession no encuentra Bearer → null).
    const req = new NextRequest('http://localhost/api/example');
    const handler = vi.fn(async () => new Response('ok'));
    const res = await withAuth(handler)(req as never) as never as Promise<Response>;
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0); // cero consultas — el 401 no gasta BD
  });
});
