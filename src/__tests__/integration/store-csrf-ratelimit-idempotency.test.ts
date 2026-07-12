import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * FIX-AUDIT-MSTORE-02/03/04 — Tests de CSRF, rate-limiting e idempotency.
 *
 * Cubre los 3 fixes P1/P2 del módulo stores:
 *   - P1-CSRF (FIX-AUDIT-MSTORE-02): archive/restore rechazan 403 si Origin no matchea
 *   - P1-RateLimit (FIX-AUDIT-MSTORE-03): 429 al exceder el límite
 *   - P2-Idempotency (FIX-AUDIT-MSTORE-04): misma Idempotency-Key no ejecuta 2 veces
 *
 * Patrón consistente con store-archive-restore-auth.test.ts y store-audit-health-reset-auth.test.ts.
 */

// ── Mocks controlables ─────────────────────────────────────────────────
// A diferencia de los tests existentes que mockean validateOrigin/rateLimit
// siempre en true/allowed, aquí necesitamos controlarlos por-test.

const validateOriginMock = vi.fn<(req: Request) => boolean>(() => true);
const rateLimitMock = vi.fn<(identifier: string, options?: { windowMs?: number; maxRequests?: number }) => Promise<{ allowed: boolean; remaining: number; resetAt: Date }>>(async () => ({ allowed: true, remaining: 10, resetAt: new Date() }));
const withIdempotencyMock = vi.fn(
  async (_key: string | null, _ttl: number, handler: () => Promise<{ status: number; body: unknown }>) => {
    const result = await handler();
    return { ...result, replayed: false };
  }
);

// Mock supabase-admin: devuelve un cliente fake que simula UPDATE exitoso
const fakeSupabaseUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
const fakeSupabaseClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => fakeSupabaseUpdate()),
    })),
  })),
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => fakeSupabaseClient,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withRole: (_role: any, handler: any) => handler,
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/csrf', () => ({ validateOrigin: (req: Request) => validateOriginMock(req) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: (identifier: string, options?: { windowMs?: number; maxRequests?: number }) => rateLimitMock(identifier, options) }));
vi.mock('@/lib/rate-limit/tenant-limiter', () => ({
  checkTenantRateLimit: async () => ({ allowed: true }),
  rateLimitHeaders: () => ({}),
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string) => ({ error: code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (key: string | null, ttl: number, handler: () => Promise<{ status: number; body: unknown }>) => withIdempotencyMock(key, ttl, handler),
}));

// Importar DESPUÉS de los mocks
import { POST as archivePOST } from '@/app/api/stores/[id]/archive/route';
import { POST as restorePOST } from '@/app/api/stores/[id]/restore/route';

// ── Test Data ──────────────────────────────────────────────────────────

const STORE_A = '11111111-1111-1111-1111-111111111111';

function makeSession(role: 'admin' | 'manager' = 'admin') {
  return {
    user: {
      id: 'test-user-id-0001',
      email: 'test@costpro.test',
      role,
      memberships: [{ store_id: STORE_A, role, status: 'active' }],
    },
    token: 'fake-jwt',
  } as any;
}

function makeRequest(path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const url = `http://localhost:3000${path}`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FIX-AUDIT-MSTORE-02 (P1-CSRF): archive/restore rechazan Origin inválido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(true);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
  });

  it('archive devuelve 403 cuando validateOrigin retorna false', async () => {
    validateOriginMock.mockReturnValue(false);
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`, { reason: 'test' });
    const res = await archivePOST(req as any, session);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/INVALID_ORIGIN/i);
    expect(validateOriginMock).toHaveBeenCalledOnce();
  });

  it('restore devuelve 403 cuando validateOrigin retorna false', async () => {
    validateOriginMock.mockReturnValue(false);
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/restore`);
    const res = await restorePOST(req as any, session);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/INVALID_ORIGIN/i);
  });

  it('archive pasa el chequeo CSRF cuando validateOrigin retorna true', async () => {
    // Por defecto validateOriginMock = true → no debe retornar 403 por CSRF
    // (caerá en 500 por mock supabase null, pero NO 403 de CSRF)
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`, { reason: 'test' });
    const res = await archivePOST(req as any, session);
    expect(res.status).not.toBe(403);
    expect(validateOriginMock).toHaveBeenCalledOnce();
  });
});

describe('FIX-AUDIT-MSTORE-03 (P1-RateLimit): archive/restore aplican rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(true);
  });

  it('archive devuelve 429 cuando rateLimit dice allowed=false', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    const res = await archivePOST(req as any, session);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/RATE_LIMITED/i);
  });

  it('restore devuelve 429 cuando rateLimit dice allowed=false', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/restore`);
    const res = await restorePOST(req as any, session);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/RATE_LIMITED/i);
  });

  it('archive pasa el rate limit cuando allowed=true (no 429)', async () => {
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    const res = await archivePOST(req as any, session);
    expect(res.status).not.toBe(429);
  });
});

describe('FIX-AUDIT-MSTORE-04 (P2-Idempotency): header Idempotency-Key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(true);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
  });

  it('archive con header Idempotency-Key llama withIdempotency con key no-null', async () => {
    // El mock default ejecuta el handler directo, pero queremos verificar
    // que se llama con una key no-null cuando el header está presente.
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`, {}, {
      'Idempotency-Key': 'client-uuid-123',
    });
    await archivePOST(req as any, session);
    expect(withIdempotencyMock).toHaveBeenCalledOnce();
    const [firstArg] = withIdempotencyMock.mock.calls[0];
    expect(firstArg).not.toBeNull();
    expect(firstArg).toContain('archive:');
    expect(firstArg).toContain('client-uuid-123');
  });

  it('archive SIN header Idempotency-Key llama withIdempotency con key null (retrocompatible)', async () => {
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    await archivePOST(req as any, session);
    expect(withIdempotencyMock).toHaveBeenCalledOnce();
    const [firstArg] = withIdempotencyMock.mock.calls[0];
    expect(firstArg).toBeNull();
  });

  it('restore con header Idempotency-Key usa key compuesta con storeId + user', async () => {
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/restore`, {}, {
      'Idempotency-Key': 'abc-789',
    });
    await restorePOST(req as any, session);
    expect(withIdempotencyMock).toHaveBeenCalledOnce();
    const [firstArg] = withIdempotencyMock.mock.calls[0];
    expect(firstArg).toContain('restore:');
    expect(firstArg).toContain(STORE_A);
    expect(firstArg).toContain('abc-789');
  });

  it('cuando withIdempotency retorna replayed=true, la respuesta incluye header X-Idempotent-Replay', async () => {
    // Sobrescribir el mock para simular un replay
    withIdempotencyMock.mockResolvedValueOnce({
      status: 200,
      body: { success: true, message: 'Tienda archivada.' },
      replayed: true,
    });
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`, {}, {
      'Idempotency-Key': 'replayed-key',
    });
    const res = await archivePOST(req as any, session);
    expect(res.headers.get('X-Idempotent-Replay')).toBe('true');
  });

  it('cuando replayed=false, NO se incluye el header X-Idempotent-Replay', async () => {
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    const res = await archivePOST(req as any, session);
    expect(res.headers.get('X-Idempotent-Replay')).toBeNull();
  });
});

describe('FIX-AUDIT-MSTORE-03 (P1-Errores): no filtrar error.message crudo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(true);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
  });

  it('archive exitoso devuelve { success: true } sin exponer error.message', async () => {
    // Con el mock de supabase-admin devolviendo update exitoso, la respuesta
    // debe ser { success: true, message: ..., storeId, reason } — ningún error.
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    const res = await archivePOST(req as any, session);
    const body = await res.json();
    // No debe haber campo error (éxito)
    expect(body.error).toBeUndefined();
    expect(body.success).toBe(true);
    // Si por algún motivo hay error, no debe contener internals de Postgres
    if (body.error) {
      expect(body.error).not.toMatch(/PostgREST|PostgreSQL|relation|column|constraint/i);
    }
  });

  it('archive con error de Supabase devuelve createApiError (no error.message crudo)', async () => {
    // Simular que supabase devuelve error
    fakeSupabaseUpdate.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "public.stores" does not exist' },
    });
    const session = makeSession('admin');
    const req = makeRequest(`/api/stores/${STORE_A}/archive`);
    const res = await archivePOST(req as any, session);
    const body = await res.json();
    // Debe devolver createApiError('STORE_UPDATE_FAILED'), NO el mensaje crudo
    expect(body.error).toMatch(/STORE_UPDATE_FAILED/);
    expect(body.error).not.toMatch(/PostgREST|PostgreSQL|relation|column|constraint/i);
  });
});
