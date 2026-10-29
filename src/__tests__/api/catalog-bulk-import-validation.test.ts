import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { POST } from '@/app/api/catalog/bulk-import/route';

/**
 * catalog-bulk-import-validation.test.ts — MISIÓN CONTINUA 2026-10-21 (CP-CAT-005)
 * + MISIÓN CATÁLOGO MAESTRO 2026-10-28 (autorización por fila en el servidor).
 *
 * Contrato de la validación Zod por fila de POST /api/catalog/bulk-import:
 *  · Filas fuera de contrato → 400 con detalle por fila (row/sku/issues).
 *  · Propiedades DESCONOCIDAS → 400 (`.strict()`): ninguna columna no
 *    documentada puede llegar al upsert (vector de escritura arbitraria
 *    si RLS/service_role falla — hallazgo original de la auditoría).
 *  · store_id debe ser UUID loose (CP-SEC-019: acepta UUID sintéticos de
 *    Tienda Central que el uuid() estricto rechazaba).
 *  · Precios negativos → 400 (nueva regla de negocio explícita).
 *  · Comportamiento preservado: no-products 400, límite 500 400,
 *    store sin membresía (no-admin) → 403.
 *  · NUEVO (CP-CATÁLOGO): el tenant_id se ESTAMPA desde stores.tenant_id
 *    leído en el servidor (nunca del cliente); tienda inexistente → 400;
 *    tienda con tenant nulo → 403 fail-closed; con USE_TENANT_RLS=true el
 *    admin ordinario no puede importar a otra organización (403
 *    STORE_TENANT_MISMATCH); superadmin conserva alcance de plataforma y
 *    el admin sin flag mantiene el alcance global (Decisión B.1).
 */

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

const mockSession = { value: null as any };

// Flag RLS controlable por test (por defecto OFF = comportamiento B.1)
const rlsFlag = { value: false };
vi.mock('@/lib/rls-middleware', () => ({
  isTenantRlsEnabled: () => rlsFlag.value,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: mockSession.value }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/observability/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

// ── Mock del cliente service-role que construye la ruta ──
const upsertCalls: any[] = [];
const upsertResult = { value: { data: [], error: null } };

// Estado multi-tabla para las lecturas de autorización (stores/profiles)
const dbState = {
  stores: [] as Array<{ id: string; tenant_id: string | null }>,
  profiles: [] as Array<{ id: string; tenant_id: string | null }>,
};

function makeProductsTable() {
  const t: any = {};
  t.upsert = (rows: any, opts: any) => {
    upsertCalls.push({ rows, opts });
    const obj: any = {
      ...upsertResult.value,
      then(res?: any, rej?: any) {
        return Promise.resolve({ data: upsertResult.value.data, error: upsertResult.value.error }).then(res, rej);
      },
    };
    return obj;
  };
  return t;
}

// Builder genérico para las lecturas .select().in() / .select().eq().maybeSingle()
// que la ruta endurecida ejecuta sobre stores y profiles.
function makeLookupTable(table: 'stores' | 'profiles') {
  const out: any = {
    select: (_cols?: string) => out,
    in: (_col: string, ids: string[]) =>
      Promise.resolve({
        data: dbState[table].filter(r => ids.includes(r.id)),
        error: null,
      }),
    eq: (_col: string, v: string) => {
      const row = dbState[table].find(r => r.id === v) ?? null;
      const pr: any = Promise.resolve({ data: row, error: null });
      pr.maybeSingle = () => Promise.resolve({ data: row, error: null });
      return pr;
    },
    maybeSingle: () =>
      Promise.resolve({ data: dbState[table][0] ?? null, error: null }),
  };
  return out;
}

// La implementación necesita un rest param: vi.fn(impl sin parámetros)
// infiere firma [] y CUALQUIER spread sobre ella es TS2556 (el patrón
// service-types funciona porque su vi.fn() va sin implementación).
const createClientMock = vi.fn((..._args: unknown[]) => ({
  from: (table: string) =>
    table === 'products' ? makeProductsTable() : makeLookupTable(table as 'stores' | 'profiles'),
}));
vi.mock('@supabase/supabase-js', () => ({
  // any[] (no unknown[]): el spread sobre createClientMock requiere tipo
  // tupla/rest — TS2556 en CI con unknown[] (mismo patrón que service-types.test.ts).
  createClient: (...args: any[]) => createClientMock(...args),
}));

function jsonReq(payload: unknown) {
  return new Request('http://localhost/api/catalog/bulk-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any;
}

function adminSession() {
  mockSession.value = {
    id: 'u-admin',
    role: 'admin',
    memberships: [{ store_id: 'store-1', status: 'active' }],
  };
}

function clerkSession() {
  mockSession.value = {
    id: 'u-clerk',
    role: 'usuario',
    memberships: [{ store_id: 'store-1', status: 'active' }],
  };
}

const STORE_MAIN = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'; // UUID suelto de Tienda Central (CP-SEC-019)
const TENANT_MAIN = '11111111-1111-4111-8111-111111111111';
const TENANT_OTHER = '22222222-2222-4222-8222-222222222222';

const VALID_ROW = {
  store_id: STORE_MAIN,
  sku: 'SKU-100',
  name: 'Tornillo M8',
  cost_price: 10,
  price: 15,
  image_url: null,
  category: 'Ferretería',
  is_service: false,
  unit_of_measure: 'unidad',
  description: 'Tornillo de acero inoxidable',
  is_active: true,
  barcode: '8501234567890',
  barcode_type: 'EAN13',
  min_stock: 5,
  supplier: 'Ferretería Central',
};

function seedDb({
  mainTenant = TENANT_MAIN,
  callerTenant = TENANT_MAIN,
  includeOtherStore = false,
  nullTenant = false,
} = {}) {
  dbState.stores = [{ id: STORE_MAIN, tenant_id: nullTenant ? null : mainTenant }];
  if (includeOtherStore) {
    dbState.stores.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenant_id: TENANT_OTHER });
  }
  dbState.profiles = [{ id: 'u-admin', tenant_id: callerTenant }, { id: 'u-clerk', tenant_id: callerTenant }];
}

afterAll(() => {
  // Higiene de aislamiento: sin unstubEnves en la config, los stubEnv
  // persisten en el process.env del worker y contaminan archivos
  // posteriores del mismo pool (lección de la corrida de CI 2026-10-22).
  vi.unstubAllEnvs();
});

beforeEach(() => {
  upsertCalls.length = 0;
  upsertResult.value = { data: [], error: null };
  mockSession.value = null;
  rlsFlag.value = false;
  seedDb();
});

describe('POST /api/catalog/bulk-import — validación por fila (CP-CAT-005)', () => {
  it('1 · fila con precio string → 400 con detalle por fila (row, sku, issues)', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, price: '15.00' }],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.bulkImportInvalidProduct');
    expect(json.sku).toBe('SKU-100');
    expect(Array.isArray(json.errors)).toBe(true);
    expect(json.errors[0].row).toBe(0);
    expect(json.errors[0].issues.join(' ')).toContain('price');
  });

  it('2 · propiedad DESCONOCIDA en la fila → 400 (strict: nada fuera de contrato llega al upsert)', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, tenant_id: '00000000-0000-0000-0000-000000000000' }],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors[0].issues.join(' ')).toContain('tenant_id');
    expect(upsertCalls.length).toBe(0);
  });

  it('3 · store_id no UUID → 400 (uuidLoose)', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: 'no-es-un-uuid' }],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors[0].issues.join(' ')).toContain('store_id');
  });

  it('4 · precio negativo → 400 (regla de negocio explícita)', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, cost_price: -1 }],
    }));
    expect(res.status).toBe(400);
  });

  it('5 · acumula TODAS las filas inválidas (no solo la primera) con índice y sku', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [
        { ...VALID_ROW, sku: 'SKU-A', price: null },
        { ...VALID_ROW, sku: 'SKU-B' },
        { ...VALID_ROW, sku: 'SKU-C', name: '' },
      ],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors).toHaveLength(2);
    expect(json.errors.map((e: any) => e.sku)).toEqual(['SKU-A', 'SKU-C']);
    expect(json.errors.map((e: any) => e.row)).toEqual([0, 2]);
  });

  it('6 · payload válido → 200 y el upsert recibe SOLO los campos del contrato', async () => {
    adminSession();
    const res = await POST(jsonReq({ products: [VALID_ROW] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);
    expect(upsertCalls.length).toBe(1);
    const sent = upsertCalls[0].rows[0];
    expect(Object.keys(sent).sort()).toEqual(
      ['barcode', 'barcode_type', 'category', 'cost_price', 'description', 'image_url',
       'is_active', 'is_service', 'min_stock', 'name', 'price', 'sku', 'store_id',
       'supplier', 'unit_of_measure', 'tenant_id'].sort(),
    );
    expect(sent.sku).toBe('SKU-100');
    // CP-CATÁLOGO: el tenant_id llega ESTAMPADO desde stores.tenant_id del servidor.
    expect(sent.tenant_id).toBe(TENANT_MAIN);
  });

  it('7 · contrato preservado: sin products → BULK_IMPORT_NO_PRODUCTS 400', async () => {
    adminSession();
    const res = await POST(jsonReq({ products: [] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.bulkImportNoProducts');
  });

  it('8 · contrato preservado: >500 filas → BULK_IMPORT_LIMIT 400 (antes de validar)', async () => {
    adminSession();
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...VALID_ROW, sku: `SKU-${i}` }));
    const res = await POST(jsonReq({ products: rows }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.bulkImportLimit');
  });

  it('9 · contrato preservado: no-admin sin membresía de la tienda → 403 STORE_ACCESS_DENIED', async () => {
    clerkSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: '99999999-9999-4999-8999-999999999999' }],
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.storeAccessDenied');
    expect(json.stores).toEqual(['99999999-9999-4999-8999-999999999999']);
  });

  it('10 · admin global (flag OFF) importa a tienda sin membresía propia (Decisión B.1) y la fila recibe el tenant de ESA tienda', async () => {
    adminSession();
    // Tienda existente de OTRA organización, sin membresía del admin.
    dbState.stores.push({ id: '99999999-9999-4999-8999-999999999999', tenant_id: TENANT_OTHER });
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: '99999999-9999-4999-8999-999999999999' }],
    }));
    expect(res.status).toBe(200);
    expect(upsertCalls[0].rows).toHaveLength(1);
    // El tenant_id estampado es el de la tienda destino (servidor), no el del llamante.
    expect(upsertCalls[0].rows[0].tenant_id).toBe(TENANT_OTHER);
  });

  it('11 · tienda inexistente en BD → 400 (nada se importa)', async () => {
    adminSession();
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: '99999999-9999-4999-8999-999999999999' }],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.bulkImportInvalidProduct');
    expect(json.stores).toEqual(['99999999-9999-4999-8999-999999999999']);
    expect(upsertCalls.length).toBe(0);
  });

  it('12 · tienda con tenant_id nulo → 403 fail-closed (no se generan filas huérfanas sin organización)', async () => {
    adminSession();
    seedDb({ nullTenant: true });
    const res = await POST(jsonReq({ products: [VALID_ROW] }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.storeAccessDenied');
    expect(upsertCalls.length).toBe(0);
  });

  it('13 · admin con USE_TENANT_RLS=true no puede importar a otra organización → 403 STORE_TENANT_MISMATCH', async () => {
    rlsFlag.value = true;
    adminSession();
    dbState.stores.push({ id: '99999999-9999-4999-8999-999999999999', tenant_id: TENANT_OTHER });
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: '99999999-9999-4999-8999-999999999999' }],
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.storeTenantMismatch');
    expect(json.stores).toEqual(['99999999-9999-4999-8999-999999999999']);
    expect(upsertCalls.length).toBe(0);
  });

  it('14 · superadmin conserva alcance de plataforma: importa a otra organización con tenant estampado', async () => {
    mockSession.value = { id: 'u-super', role: 'superadmin', memberships: [] };
    dbState.stores.push({ id: '99999999-9999-4999-8999-999999999999', tenant_id: TENANT_OTHER });
    dbState.profiles.push({ id: 'u-super', tenant_id: null });
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: '99999999-9999-4999-8999-999999999999' }],
    }));
    expect(res.status).toBe(200);
    expect(upsertCalls[0].rows[0].tenant_id).toBe(TENANT_OTHER);
  });

  it('15 · no-admin con membresía activa pero tienda de otra organización → 403 (defensa en profundidad)', async () => {
    const otherStore = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    mockSession.value = {
      id: 'u-clerk',
      role: 'usuario',
      memberships: [{ store_id: otherStore, status: 'active' }],
    };
    seedDb({ callerTenant: TENANT_MAIN, includeOtherStore: true });
    const res = await POST(jsonReq({
      products: [{ ...VALID_ROW, store_id: otherStore }],
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.key).toBe('apiErrors.storeTenantMismatch');
    expect(upsertCalls.length).toBe(0);
  });
});
