import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests de regresión para FIX-AUDIT-AUTH-1 (bypass de autenticación).
 *
 * El bug: cuando supabase.auth.getUser(token) fallaba, el código caía a un
 * fallback que decodificaba el JWT sin verificar la firma. Solo chequeaba
 * que tuviera 3 segments, que el JSON parsee y que `exp` no hubiera vencido.
 * Eso permitía fabricar JWTs arbitrarios con `sub: <uuid-de-otro-usuario>`.
 *
 * El fix: FAIL CLOSED. Si getUser falla, retornar null. No hay decode sin
 * verificar firma. Estos tests garantizan que el fallback fue eliminado.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const getUserMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────

describe('FIX-AUDIT-AUTH-1: auth.ts fail closed', () => {
  beforeEach(() => {
    vi.resetModules();
    getUserMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    (process.env as any).NODE_ENV = 'test';
    process.env.ENABLE_DEV_BYPASS = 'false';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('retorna null cuando getUser falla (token inválido)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers({ Authorization: 'Bearer fake-token-123' }),
    } as any;

    const session = await getServerSession(req);
    expect(session).toBeNull();
  });

  it('NO acepta un JWT fabricado con payload válido pero sin firma', async () => {
    // Simular el JWT que el antiguo fallback aceptaría:
    // - 3 segments separados por '.'
    // - payload con sub + exp futuro
    // - Pero getUser falla (porque la firma es inválida)
    const payload = {
      sub: 'admin-uuid-stolen',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1h en el futuro
      role: 'admin',
      email: 'attacker@evil.com',
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedJwt = `header.${payloadB64}.fakesignature`;

    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid signature' },
    });

    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers({ Authorization: `Bearer ${forgedJwt}` }),
    } as any;

    const session = await getServerSession(req);

    // CRÍTICO: si el fallback existiera, devolvería un session con
    // user.id = 'admin-uuid-stolen'. Debe ser null.
    expect(session).toBeNull();
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it('acepta sesión válida cuando getUser funciona', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'real-user-001', email: 'real@costpro.test' } },
      error: null,
    });

    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers({ Authorization: 'Bearer valid-token' }),
    } as any;

    const session = await getServerSession(req);
    expect(session).not.toBeNull();
    expect(session!.user.id).toBe('real-user-001');
  });

  it('acepta dev-token-bypass cuando ENABLE_DEV_BYPASS=true y no es producción', async () => {
    process.env.ENABLE_DEV_BYPASS = 'true';
    (process.env as any).NODE_ENV = 'development';

    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers({ Authorization: 'Bearer dev-token-bypass' }),
    } as any;

    const session = await getServerSession(req);
    expect(session).not.toBeNull();
    expect(session!.user.id).toBe('dev-admin-001');
    expect(session!.user.role).toBe('admin');
    // No debe llamar a Supabase en modo bypass
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('rechaza dev-token-bypass en producción', async () => {
    process.env.ENABLE_DEV_BYPASS = 'true';
    (process.env as any).NODE_ENV = 'production';

    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers({ Authorization: 'Bearer dev-token-bypass' }),
    } as any;

    const session = await getServerSession(req);
    expect(session).toBeNull();
  });

  it('retorna null sin header Authorization', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const req = {
      headers: new Headers(),
    } as any;

    const session = await getServerSession(req);
    expect(session).toBeNull();
  });
});
