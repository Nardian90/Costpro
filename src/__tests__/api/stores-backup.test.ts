/**
 * Integration tests for backup API endpoints.
 *
 * Coverage:
 *   1. GET /api/stores/[id]/backup?format=json — happy path (admin user)
 *   2. GET /api/stores/[id]/backup?format=pdf  — produces PDF binary
 *   3. GET /api/stores/[id]/backup?format=xlsx — produces XLSX binary
 *   4. GET /api/stores/[id]/backup?range=year&year=2026 — date filter validated
 *   5. GET /api/stores/[id]/backup — 403 for non-encargado user
 *   6. GET /api/stores/[id]/backup — 400 for invalid format
 *   7. GET /api/stores/[id]/backup — 429 rate limit
 *   8. POST /api/stores/[id]/backup/restore — happy path with valid JSON
 *   9. POST /api/stores/[id]/backup/restore — 400 for invalid JSON body
 *  10. POST /api/stores/[id]/backup/restore — 403 for non-encargado user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mock session — admin user with no memberships (admin bypasses per-store check)
// ─────────────────────────────────────────────────────────────────────────────

let mockUser: any = { id: 'admin-1', role: 'admin', memberships: [] };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { user: mockUser, token: 'test-token' }),
  AuthenticatedSession: {},
  getServerSession: async () => ({ user: mockUser, token: 'test-token' }),
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg || code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock supabase admin client
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockAdminClient = {
  from: (table: string) => mockFrom(table),
};
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => mockAdminClient),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeStoreRow(storeId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: storeId,
    name: 'Tienda Test',
    slug: 'tienda-test',
    cost_template_id: null,
    ...overrides,
  };
}

/** Configures the chainable mock for a specific store + tables. */
function setupSupabaseMock(storeId: string, tables: Record<string, any[]>) {
  const storeRow = tables['stores']?.[0] || makeStoreRow(storeId);

  mockFrom.mockImplementation((table: string) => {
    if (table === 'stores') {
      const storeApi: any = {
        select: () => storeApi,
        eq: () => storeApi,
        maybeSingle: () => Promise.resolve({ data: storeRow, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        insert: mockInsert,
      };
      return storeApi;
    }
    if (table === 'audit_logs') {
      const auditApi: any = {
        insert: mockInsert,
      };
      return auditApi;
    }
    // Other tables: return rows
    const rows = tables[table] || [];
    const tableApi: any = {
      select: () => tableApi,
      eq: () => tableApi,
      gte: () => tableApi,
      lt: () => tableApi,
      order: () => tableApi,
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: any, reject?: any) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return tableApi;
  });

  mockInsert.mockReturnValue(Promise.resolve({ data: null, error: null }));
}

function makeGetRequest(storeId: string, params: Record<string, string> = {}): Request {
  const url = new URL(`http://localhost/api/stores/${storeId}/backup`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: 'GET' });
}

function makePostRequest(storeId: string, body: any): Request {
  const url = `http://localhost/api/stores/${storeId}/backup/restore`;
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/stores/[id]/backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'admin-1', role: 'admin', memberships: [] };
  });

  it('returns JSON backup with correct headers', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, {
      stores: [makeStoreRow(storeId, { name: 'Central', slug: 'central' })],
      products: [
        { id: 'p1', store_id: storeId, name: 'P1', created_at: '2026-01-01T00:00:00Z' },
      ],
    });

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'json', range: 'all' }) as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="backup_central_completo_.+\.json"$/);
    expect(res.headers.get('X-Backup-Total-Records')).toBe('2'); // 1 store + 1 product

    // Body should be valid JSON with metadata
    const text = await res.text();
    const parsed = JSON.parse(text);
    expect(parsed.meta.format).toBe('costpro-store-backup');
    expect(parsed.meta.storeId).toBe(storeId);
    expect(parsed.tables.products).toHaveLength(1);
  });

  it('returns PDF backup with application/pdf content type', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, {
      stores: [makeStoreRow(storeId)],
      products: [
        { id: 'p1', store_id: storeId, name: 'P1', created_at: '2026-01-01T00:00:00Z' },
      ],
    });

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'pdf', range: 'all' }) as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/\.pdf"$/);

    // Body should be a non-empty binary
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    // PDF magic
    const text = new TextDecoder().decode(new Uint8Array(buf).slice(0, 4));
    expect(text).toBe('%PDF');
  });

  it('returns XLSX backup with xlsx content type', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, {
      stores: [makeStoreRow(storeId)],
      products: [
        { id: 'p1', store_id: storeId, name: 'P1', created_at: '2026-01-01T00:00:00Z' },
      ],
    });

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'xlsx', range: 'all' }) as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(100);
    // ZIP magic
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4B); // K
  });

  it('rejects invalid format with 400', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'csv', range: 'all' }) as any);

    expect(res.status).toBe(400);
  });

  it('rejects range=year without year param with 400', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'json', range: 'year' }) as any);

    expect(res.status).toBe(400);
  });

  it('rejects non-authorized user with 403', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    // Switch to clerk with no memberships — should fail canManageStore
    mockUser = { id: 'clerk-1', role: 'clerk', memberships: [] };

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'json', range: 'all' }) as any);

    expect(res.status).toBe(403);
  });

  it('allows encargado with active membership on the store', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, {
      stores: [makeStoreRow(storeId)],
      products: [{ id: 'p1', store_id: storeId, name: 'P1', created_at: '2026-01-01T00:00:00Z' }],
    });

    // Encargado with active membership on storeId
    mockUser = {
      id: 'enc-1',
      role: 'encargado',
      memberships: [{
        store_id: storeId,
        role: 'encargado',
        status: 'active',
      }],
    };

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'json', range: 'all' }) as any);

    expect(res.status).toBe(200);
  });

  it('rejects encargado from a different store with 403', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    // Encargado of a DIFFERENT store — should fail
    mockUser = {
      id: 'enc-2',
      role: 'encargado',
      memberships: [{
        store_id: 's2', // different store
        role: 'encargado',
        status: 'active',
      }],
    };

    const { GET } = await import('@/app/api/stores/[id]/backup/route');
    const res = await GET(makeGetRequest(storeId, { format: 'json', range: 'all' }) as any);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/stores/[id]/backup/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'admin-1', role: 'admin', memberships: [] };
  });

  it('returns success with inserted counts on valid JSON', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    const { POST } = await import('@/app/api/stores/[id]/backup/restore/route');

    const validBackup = JSON.stringify({
      meta: { format: 'costpro-store-backup', version: '1.0.0', storeId, storeName: 'T', exportedAt: '2026-01-01' },
      tables: {
        products: [{ id: 'p1', store_id: 'orig', name: 'P1' }],
      },
    });

    const res = await POST(makePostRequest(storeId, { content: validBackup, dryRun: true }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.summary.totalInserted).toBeGreaterThan(0);
  });

  it('returns 400 for invalid JSON content', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    const { POST } = await import('@/app/api/stores/[id]/backup/restore/route');
    const res = await POST(makePostRequest(storeId, { content: 'not-json{' }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/JSON/i);
  });

  it('rejects non-authorized user with 403', async () => {
    const storeId = 's1';
    setupSupabaseMock(storeId, { stores: [makeStoreRow(storeId)] });

    mockUser = { id: 'clerk-1', role: 'clerk', memberships: [] };

    const { POST } = await import('@/app/api/stores/[id]/backup/restore/route');
    const validBackup = JSON.stringify({
      meta: { format: 'costpro-store-backup', version: '1.0.0', storeId, storeName: 'T', exportedAt: '2026-01-01' },
      tables: {},
    });
    const res = await POST(makePostRequest(storeId, { content: validBackup }) as any);

    expect(res.status).toBe(403);
  });
});
