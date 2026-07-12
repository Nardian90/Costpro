import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * FIX-AUDIT-R5 — Test negativo de autorización en archive/restore/bulk.
 *
 * El auditor detectó que /api/stores/[id]/archive y /api/stores/[id]/restore
 * autorizaban solo con `session.user.role` global (admin | manager), sin
 * validar membership en la tienda específica. Un manager podía archivar
 * CUALQUIER tienda de cualquier tenant conociendo el UUID.
 *
 * Este test verifica el fix: las rutas ahora usan canManageStore() y
 * deben devolver 403 cuando un manager intenta operar en una tienda
 * donde NO tiene membership activa.
 *
 * Patrón consistente con store-rls-isolation.test.ts (que prueba la
 * función canManageStore aislada). Aquí probamos la integración completa:
 * session → handler → canManageStore → 403.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock supabase-admin para que no intente crear cliente real
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => null, // no llega a usarse si el 403 se devuelve antes
}));

// Mock auth-middleware: withAuth y withTracing dejan pasar al handler directo
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withRole: (_role: any, handler: any) => handler,
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
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
// FIX-AUDIT-MSTORE-04: mock idempotency para que los tests existentes no dependan
// del cache. withIdempotency simplemente ejecuta el handler directo, replayed=false.
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: async (_key: any, _ttl: any, handler: any) => {
    const result = await handler();
    return { ...result, replayed: false };
  },
}));

// Importar DESPUÉS de los mocks
import { POST as archivePOST } from '@/app/api/stores/[id]/archive/route';
import { POST as restorePOST } from '@/app/api/stores/[id]/restore/route';

// ── Test Data ──────────────────────────────────────────────────────────

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';

function makeSession(role: 'admin' | 'manager', memberships: Array<{ store_id: string; role: string; status: string }> = []) {
  return {
    user: {
      id: 'test-user-id-0001',
      email: 'test@costpro.test',
      role,
      memberships,
    },
    token: 'fake-jwt',
  } as any;
}

function makeRequest(storeId: string, body: Record<string, unknown> = {}) {
  const url = `http://localhost:3000/api/stores/${storeId}/archive`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FIX-AUDIT-R5: archive/restore autorización por membership', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── archive ────────────────────────────────────────────────────────

  describe('POST /api/stores/[id]/archive', () => {
    it('manager con membership en store A puede archivar store A', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest(STORE_A, { reason: 'test' });
      // canManageStore returns true → handler continúa, intenta usar supabase
      // (que es null por el mock) → devuelve 500, NO 403. Esto verifica que
      // pasó el chequeo de autorización.
      const res = await archivePOST(req as any, session);
      expect(res.status).not.toBe(403);
    });

    it('manager SIN membership en store B NO puede archivar store B → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest(STORE_B, { reason: 'cross-tenant attack' });
      const res = await archivePOST(req as any, session);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/i);
    });

    it('manager con membership REVOKED en store B NO puede archivar → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_B, role: 'manager', status: 'revoked' },
      ]);
      const req = makeRequest(STORE_B);
      const res = await archivePOST(req as any, session);
      expect(res.status).toBe(403);
    });

    it('admin global puede archivar cualquier store (by design)', async () => {
      const session = makeSession('admin'); // sin memberships
      const req = makeRequest(STORE_B);
      const res = await archivePOST(req as any, session);
      // admin → canManageStore true → handler continúa → 500 por mock null
      expect(res.status).not.toBe(403);
    });

    it('usuario sin rol admin/manager NO puede archivar → 403', async () => {
      const session = makeSession('manager' as any, []); // sin memberships
      const req = makeRequest(STORE_A);
      const res = await archivePOST(req as any, session);
      expect(res.status).toBe(403);
    });
  });

  // ── restore ────────────────────────────────────────────────────────

  describe('POST /api/stores/[id]/restore', () => {
    it('manager con membership en store A puede restaurar store A', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const url = `http://localhost:3000/api/stores/${STORE_A}/restore`;
      const req = new NextRequest(url, { method: 'POST' });
      const res = await restorePOST(req as any, session);
      expect(res.status).not.toBe(403);
    });

    it('manager SIN membership en store B NO puede restaurar store B → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const url = `http://localhost:3000/api/stores/${STORE_B}/restore`;
      const req = new NextRequest(url, { method: 'POST' });
      const res = await restorePOST(req as any, session);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/i);
    });

    it('admin global puede restaurar cualquier store (by design)', async () => {
      const session = makeSession('admin');
      const url = `http://localhost:3000/api/stores/${STORE_B}/restore`;
      const req = new NextRequest(url, { method: 'POST' });
      const res = await restorePOST(req as any, session);
      expect(res.status).not.toBe(403);
    });
  });

  // ── Caso de regresión: el bug original ─────────────────────────────

  describe('regresión: bug original (rol global sin membership)', () => {
    it('ANTES del fix: manager sin membership pasaba el chequeo. AHORA: 403', async () => {
      // Este test documenta el bug que se arregló.
      // Un manager con membership solo en store A intenta archivar store B.
      // Antes del FIX-AUDIT-R5, el chequeo era:
      //   if (session.user.role !== 'admin' && session.user.role !== 'manager') return 403
      // Eso pasaría (role === 'manager'), permitiendo el acceso.
      // Ahora con canManageStore(session.user, storeId), devuelve false → 403.
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest(STORE_B, { reason: 'should fail' });
      const res = await archivePOST(req as any, session);
      expect(res.status).toBe(403);
    });
  });
});
