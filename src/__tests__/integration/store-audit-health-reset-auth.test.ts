import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * FIX-AUDIT-9.0 — Tests de autorización para audit, health-batch, y reset.
 *
 * El auditor identificó que los 3 endpoints recién corregidos no tenían tests
 * que ejercitar los caminos de auth nuevos:
 *   - audit: canManageStore gate nuevo
 *   - health-batch: UUID validation + tenant filter nuevos
 *   - reset: migración de .some() inline a canManageStore
 *
 * Sigue el mismo patrón que store-archive-restore-auth.test.ts.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => null,
}));

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

// Importar DESPUÉS de los mocks
import { GET as auditGET } from '@/app/api/stores/[id]/audit/route';
import { GET as healthBatchGET } from '@/app/api/stores/health-batch/route';
import { POST as resetPOST } from '@/app/api/stores/reset/route';

// ── Test Data ──────────────────────────────────────────────────────────

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';
const INVALID_ID = 'not-a-uuid';

function makeSession(role: 'admin' | 'manager' | 'encargado', memberships: Array<{ store_id: string; role: string; status: string }> = []) {
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

function makeRequest(path: string, method = 'GET', body?: Record<string, unknown>) {
  const url = `http://localhost:3000${path}`;
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FIX-AUDIT-9.0: auth gates en audit, health-batch, reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── audit: canManageStore gate ───────────────────────────────────

  describe('GET /api/stores/[id]/audit', () => {
    it('manager con membership en store A puede ver audit logs (no 403)', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest(`/api/stores/${STORE_A}/audit`);
      const context = { params: Promise.resolve({ id: STORE_A }) };
      const res = await (auditGET as any)(req, session, context);
      expect(res.status).not.toBe(403);
    });

    it('manager SIN membership en store B → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest(`/api/stores/${STORE_B}/audit`);
      const context = { params: Promise.resolve({ id: STORE_B }) };
      const res = await (auditGET as any)(req, session, context);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/i);
    });

    it('manager con membership REVOKED en store A → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'revoked' },
      ]);
      const req = makeRequest(`/api/stores/${STORE_A}/audit`);
      const context = { params: Promise.resolve({ id: STORE_A }) };
      const res = await (auditGET as any)(req, session, context);
      expect(res.status).toBe(403);
    });

    it('admin global puede ver audit de cualquier store (no 403)', async () => {
      const session = makeSession('admin');
      const req = makeRequest(`/api/stores/${STORE_B}/audit`);
      const context = { params: Promise.resolve({ id: STORE_B }) };
      const res = await (auditGET as any)(req, session, context);
      expect(res.status).not.toBe(403);
    });
  });

  // ── health-batch: UUID validation + tenant filter ────────────────

  describe('GET /api/stores/health-batch', () => {
    it('UUID inválido → 400', async () => {
      const session = makeSession('admin');
      const req = makeRequest(`/api/stores/health-batch?store_ids=${INVALID_ID}`);
      const res = await healthBatchGET(req as any, session);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/UUID/i);
    });

    it('UUID de tienda ajena → excluido del resultado (empty response)', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      // Pide STORE_B pero solo tiene acceso a STORE_A
      const req = makeRequest(`/api/stores/health-batch?store_ids=${STORE_B}`);
      const res = await healthBatchGET(req as any, session);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Como no tiene acceso a STORE_B, el resultado debe ser vacío
      expect(Object.keys(body).length).toBe(0);
    });

    it('admin global puede ver health de cualquier store (no 400)', async () => {
      const session = makeSession('admin');
      const req = makeRequest(`/api/stores/health-batch?store_ids=${STORE_A},${STORE_B}`);
      const res = await healthBatchGET(req as any, session);
      // canManageStore pasa para admin → handler continúa → supabase null → 500
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(403);
    });

    it('sin store_ids → 400', async () => {
      const session = makeSession('admin');
      const req = makeRequest('/api/stores/health-batch');
      const res = await healthBatchGET(req as any, session);
      expect(res.status).toBe(400);
    });
  });

  // ── reset: canManageStore gate (migrado de .some() inline) ───────

  describe('POST /api/stores/reset', () => {
    it('manager con membership REVOKED → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'revoked' },
      ]);
      const req = makeRequest('/api/stores/reset', 'POST', { storeId: STORE_A });
      const res = await (resetPOST as any)(req, session);
      expect(res.status).toBe(403);
    });

    it('manager SIN membership en store B → 403', async () => {
      const session = makeSession('manager', [
        { store_id: STORE_A, role: 'manager', status: 'active' },
      ]);
      const req = makeRequest('/api/stores/reset', 'POST', { storeId: STORE_B });
      const res = await (resetPOST as any)(req, session);
      expect(res.status).toBe(403);
    });

    it('admin global puede resetear (no 403)', async () => {
      const session = makeSession('admin');
      const req = makeRequest('/api/stores/reset', 'POST', { storeId: STORE_A });
      const res = await (resetPOST as any)(req, session);
      // canManageStore pasa para admin → handler continúa → supabase null → 500
      expect(res.status).not.toBe(403);
    });
  });
});
