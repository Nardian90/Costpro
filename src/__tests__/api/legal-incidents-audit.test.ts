/**
 * F9.D — Contrato de seguridad de /api/legal/incidents (Decisión D ratificada).
 *
 * El middleware withRole('admin') del GET NO se mockea: se ejecuta el real
 * (src/lib/auth-middleware.ts), igual que en users-reset-password-authz.
 * Contrato demostrado:
 *   POST: sin sesión → 401; con sesión → 201 y UNA fila en audit_logs con
 *         action='legal_incident' (NADA en data/incidents.json — deprecado);
 *         body inválido → 400; rate limit → 429.
 *   GET : sin sesión → 401; rol no-admin → 403; admin → 200 paginado leyendo
 *         audit_logs (action='legal_incident').
 * Fronteras mockeadas: getServerSession, cliente admin de Supabase,
 * rate-limit, observability y supabaseClient (fallback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/legal/incidents/route';

// ─── Frontera: sesión ───────────────────────────────────────────────────────
const sessionValue = { value: null as any };
vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionValue.value,
}));

// ─── Frontera: rate limit controlable por caso ──────────────────────────────
const rlValue = { value: { allowed: true as boolean, resetAt: new Date(), remaining: 4 } };
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => rlValue.value,
}));

// ─── Frontera: observability (passthrough) ──────────────────────────────────
vi.mock('@/lib/observability', () => ({
  withTracing: (h: any) => h,
}));

// ─── Frontera: cliente admin (service_role) ─────────────────────────────────
const auditInserts: unknown[] = [];
const auditSelectResult = { value: { data: [] as unknown[], error: null as unknown, count: 0 } };
const profileRole = { value: null as string | null };

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        const afterEq: any = {};
        const singleImpl = async () =>
          profileRole.value
            ? { data: { role: profileRole.value, roles: [profileRole.value] }, error: null }
            : { data: null, error: { message: 'no rows' } };
        afterEq.is = () => ({ single: singleImpl });
        afterEq.single = singleImpl;
        return { select: () => ({ eq: () => afterEq }) };
      }
      if (table === 'user_store_memberships') {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.then = (res?: any, rej?: any) =>
          Promise.resolve({ data: [], error: null }).then(res, rej);
        return chain;
      }
      if (table === 'audit_logs') {
        return {
          insert: async (row: unknown) => {
            auditInserts.push(row);
            return { error: null };
          },
          select: (_cols: string, _opts?: unknown) => ({
            eq: () => ({
              order: () => ({
                range: async () => ({
                  data: auditSelectResult.value.data,
                  error: auditSelectResult.value.error,
                  count: auditSelectResult.value.count,
                }),
              }),
            }),
          }),
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  }),
}));

// ─── Frontera: supabaseClient (fallback — no debe usarse con admin ok) ──────
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: () => { throw new Error('fallback supabase NO debe usarse en estos tests'); } },
}));

import { NextRequest } from 'next/server';

function makeRequest(method: string, body?: unknown, url = 'http://localhost:3000/api/legal/incidents?limit=10&offset=0') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const session = (role = 'clerk') => ({
  token: 'jwt-test',
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'user@test.dev', role, roles: [role] },
});

beforeEach(() => {
  auditInserts.length = 0;
  profileRole.value = null;
  rlValue.value = { allowed: true, resetAt: new Date(), remaining: 4 };
  auditSelectResult.value = { data: [], error: null, count: 0 };
  sessionValue.value = null;
});

describe('POST /api/legal/incidents — 401/400/429/201 + audit_logs', () => {
  it('sin sesión → 401', async () => {
    const res = await POST(makeRequest('POST', { title: 'x'.repeat(10), description: 'y'.repeat(20), severity: 'low' }));
    expect(res.status).toBe(401);
    expect(auditInserts.length).toBe(0);
  });

  it('body inválido (title corto) → 400, sin escritura', async () => {
    sessionValue.value = session();
    const res = await POST(makeRequest('POST', { title: 'no', description: 'y'.repeat(20), severity: 'low' }));
    expect(res.status).toBe(400);
    expect(auditInserts.length).toBe(0);
  });

  it('rate limit agotado → 429', async () => {
    sessionValue.value = session();
    rlValue.value = { allowed: false, resetAt: new Date(Date.now() + 30_000), remaining: 0 };
    const res = await POST(makeRequest('POST', { title: 'x'.repeat(10), description: 'y'.repeat(20), severity: 'low' }));
    expect(res.status).toBe(429);
    expect(auditInserts.length).toBe(0);
  });

  it('con sesión → 201 + UNA fila audit_logs action=legal_incident (sin archivo JSON)', async () => {
    sessionValue.value = session();
    const res = await POST(makeRequest('POST', { title: 'Incidente de prueba', description: 'Descripción suficientemente larga', severity: 'high', reporter: 'Tester' }));
    expect(res.status).toBe(201);
    expect(auditInserts.length).toBe(1);
    const row = auditInserts[0] as Record<string, any>;
    expect(row.action).toBe('legal_incident');
    expect(row.table_name).toBe('legal_incidents');
    expect(row.user_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.record_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.new_data.incidentId).toMatch(/^INC-\d{8}-[0-9A-F]{8}$/);
    expect(row.new_data.status).toBe('open');
    expect(row.metadata.deprecated_file).toBe('data/incidents.json');
    const bodyJson = await res.json();
    expect(bodyJson.success).toBe(true);
    expect(bodyJson.incidentId).toMatch(/^INC-\d{8}-[0-9A-F]{8}$/);
  });
});

describe('GET /api/legal/incidents — contrato withRole(admin)', () => {
  it('sin sesión → 401 (withRole real)', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('perfil inexistente → 403', async () => {
    sessionValue.value = session();
    profileRole.value = null; // sin fila en profiles
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });

  it('rol clerk → 403 (autorización REAL de withRole)', async () => {
    sessionValue.value = session('clerk');
    profileRole.value = 'clerk';
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });

  it('rol admin → 200 paginado leyendo audit_logs', async () => {
    sessionValue.value = session('admin');
    profileRole.value = 'admin';
    auditSelectResult.value = {
      data: [
        {
          record_id: '22222222-2222-2222-2222-222222222222',
          user_id: '11111111-1111-1111-1111-111111111111',
          new_data: { incidentId: 'INC-20261020-TEST0001', title: 'T', description: 'D', severity: 'low', reporter: 'R', status: 'open' },
          metadata: { source: '/api/legal/incidents' },
          created_at: '2026-10-20T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    };
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].incidentId).toBe('INC-20261020-TEST0001');
    expect(body.pagination).toEqual({ total: 1, limit: 10, offset: 0 });
  });
});
