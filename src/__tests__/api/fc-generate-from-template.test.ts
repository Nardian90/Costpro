import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/product-cost-sheets/generate-from-template/route';
import reinicioTemplate from '@/lib/data/costpro-reinicio';

// ============================================
// Fixtures
// ============================================

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';
const PRODUCT_ID = 'c3333333-3333-4333-8333-333333333333';
const USER_ID = 'd4444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = 'e5555555-5555-4555-8555-555555555555';
const TEMPLATE_ID = 'f6666666-6666-4666-8666-666666666666';

const mockSession = { value: {} as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: string, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg }),
}));
vi.mock('@/lib/fc-pdf-cache', () => ({
  invalidateCache: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/services/audit-service', () => ({
  auditService: { logFCGenerated: vi.fn().mockResolvedValue(undefined) },
}));

// ── Mock supabase admin con cadenas por tabla ──

const tableChains: Record<string, any> = {};

function makeChain(result: { data: any; error: any }): any {
  const chain: any = {};
  // Tras un insert/update, single()/maybeSingle() devuelve la fila escrita
  // (emula el comportamiento real de PostgREST con .select().single()).
  let writeResult: { data: any; error: any } | null = null;

  chain.select = vi.fn().mockReturnThis();
  chain.eq = vi.fn().mockReturnThis();
  chain.is = vi.fn().mockReturnThis();
  chain.update = vi.fn((payload: any) => {
    writeResult = {
      data: { id: 'updated-cs-id', product_id: payload?.product_id ?? PRODUCT_ID, cost_price: payload?.cost_price ?? 0, sync_status: payload?.sync_status ?? 'synced' },
      error: null,
    };
    return chain;
  });
  chain.insert = vi.fn((payload: any) => {
    writeResult = {
      data: { id: 'new-cs-id', product_id: payload?.product_id ?? PRODUCT_ID, cost_price: payload?.cost_price ?? 0, sync_status: payload?.sync_status ?? 'synced' },
      error: null,
    };
    return chain;
  });
  chain.single = vi.fn().mockImplementation(async () => writeResult ?? result);
  chain.maybeSingle = vi.fn().mockImplementation(async () => writeResult ?? result);
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (!tableChains[table]) tableChains[table] = makeChain({ data: null, error: null });
      return tableChains[table];
    }),
  })),
}));

function setTable(table: string, result: { data: any; error: any }) {
  tableChains[table] = makeChain(result);
}

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/product-cost-sheets/generate-from-template',
  } as any;
}

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  name: 'Producto Test',
  sku: 'TST-001',
  cost_price: 100,
  price: 250,
  unit_of_measure: 'u',
  category: 'General',
  store_id: STORE_A,
  cost_sheet_id: null,
  fc_auto_enabled: true,
};

const PRIVATE_TEMPLATE_ROW = {
  id: TEMPLATE_ID,
  name: 'Mi Plantilla Guardada',
  description: 'Plantilla privada de prueba',
  category: 'General',
  data: reinicioTemplate,
  type: 'private',
  created_by: USER_ID,
  store_id: null,
};

// ============================================
// Tests
// ============================================

describe('POST /api/product-cost-sheets/generate-from-template (FC-USR-TEMPLATE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sesión por defecto: usuario operativo con membresía encargado en STORE_A
    mockSession.value = {
      user: {
        id: USER_ID,
        role: 'usuario',
        memberships: [{ store_id: STORE_A, role: 'encargado', status: 'active' }],
      },
    };
    // Reset cadenas por tabla
    for (const t of Object.keys(tableChains)) delete tableChains[t];
    // Defaults: producto de STORE_A + plantilla privada del usuario
    setTable('products', { data: PRODUCT_ROW, error: null });
    setTable('cost_sheet_templates', { data: PRIVATE_TEMPLATE_ROW, error: null });
    setTable('product_cost_sheets', { data: null, error: null });
  });

  // ── Validación de payload ──

  it('rechaza template_id desconocido (no UUID ni clave de sistema) → 404', async () => {
    // FC-SYS-TEMPLATES (2026-11-13): el schema acepta UUID o clave de sistema;
    // una clave arbitraria desconocida pasa Zod pero la ruta la rechaza
    // fail-closed (FC_TEMPLATE_NOT_FOUND — sin revelar qué existe).
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: 'plantilla-inexistente-xyz',
    }) as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('FC_TEMPLATE_NOT_FOUND');
  });

  it('rechaza template_id vacío (400)', async () => {
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: '',
    }) as any);
    expect(res.status).toBe(400);
  });

  it('rechaza modalidad inválida (400)', async () => {
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
      modalidad: 'otra' as any,
    }) as any);
    expect(res.status).toBe(400);
  });

  // ── Producto ──

  it('devuelve 404 si el producto no existe', async () => {
    setTable('products', { data: null, error: { message: 'not found' } });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(404);
  });

  it('bloquea productos de OTRA tienda — aislamiento multitienda (403)', async () => {
    // Producto pertenece a STORE_B; caller intenta con store_id=STORE_A
    setTable('products', { data: { ...PRODUCT_ROW, store_id: STORE_B }, error: null });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FC_PRODUCT_STORE_MISMATCH');
  });

  // ── Permisos ──

  it('rechaza usuario sin membresía en la tienda (403)', async () => {
    mockSession.value = {
      user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_B, role: 'encargado', status: 'active' }] },
    };
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('STORE_ACCESS_DENIED');
  });

  it('rechaza membresía con rol sin permiso de costo (403)', async () => {
    mockSession.value = {
      user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }] },
    };
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(403);
  });

  // ── FC-SYS-TEMPLATES: plantillas de SISTEMA desde el mismo endpoint ──

  it('conecta con una plantilla de SISTEMA por su clave (201, template_source=system)', async () => {
    // No consulta cost_sheet_templates: resuelve server-side TEMPLATE_REGISTRY.
    setTable('cost_sheet_templates', { data: null, error: null });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: 'costpro-reinicio',
    }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.generated).toBe(true);
    expect(body.data.fc_status).toBe('vigente');
    expect(body.data.template_source).toBe('system');
    expect(body.data.template_name).toBe('CostPro — Reinicio (General)');
    expect(body.data.template_id).toBe('costpro-reinicio');
  });

  it('persiste la clave de sistema en product_cost_sheets.template_id', async () => {
    setTable('cost_sheet_templates', { data: null, error: null });
    await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: 'costpro-ejemplo',
    }) as any);

    const pcs = tableChains['product_cost_sheets'];
    expect(pcs.insert).toHaveBeenCalled();
    const inserted = pcs.insert.mock.calls[0][0];
    expect(inserted.template_id).toBe('costpro-ejemplo');
    expect(inserted.store_id).toBe(STORE_A);
    expect(inserted.sync_status).toBe('synced');
  });

  it('aplica la modalidad explícita también con plantilla de sistema', async () => {
    setTable('cost_sheet_templates', { data: null, error: null });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: 'costpro-reinicio',
      modalidad: 'comercializacion',
    }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.modalidad).toBe('comercializacion');
  });

  it('alias sys-* del explorador NO se acepta (fail-closed: solo claves de registro)', async () => {
    setTable('cost_sheet_templates', { data: null, error: null });
    // TEMPLATE_ALIAS resuelve 'sys-pizza' → 'template-pizza' en getTemplateData,
    // pero la puerta fail-closed del endpoint SOLO admite las claves de registro
    // del catálogo (las que envía el picker). Un alias histórico del explorador
    // no es una procedencia del picker → 404 sin revelar qué existe.
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: 'sys-pizza',
    }) as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('FC_TEMPLATE_NOT_FOUND');
  });

  // ── Visibilidad de plantillas (espejo manual de RLS) ──

  it('devuelve 404 si la plantilla no existe', async () => {
    setTable('cost_sheet_templates', { data: null, error: null });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('FC_TEMPLATE_NOT_FOUND');
  });

  it('NO expone plantillas privadas de otra cuenta (404)', async () => {
    // Plantilla privada creada por OTRO usuario
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, created_by: OTHER_USER_ID },
      error: null,
    });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('FC_TEMPLATE_NOT_FOUND');
  });

  it('admite plantilla pública global para usuario con acceso a la tienda', async () => {
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, type: 'public', created_by: OTHER_USER_ID, store_id: null },
      error: null,
    });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.generated).toBe(true);
    expect(body.data.template_source).toBe('user');
  });

  it('admite plantilla pública de una tienda con membresía del usuario', async () => {
    // Pública de STORE_A; el usuario es encargado en STORE_A
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, type: 'public', created_by: OTHER_USER_ID, store_id: STORE_A },
      error: null,
    });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(201);
  });

  it('NO expone plantillas públicas de una tienda sin acceso (404)', async () => {
    // Pública de STORE_B; el usuario solo tiene acceso a STORE_A
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, type: 'public', created_by: OTHER_USER_ID, store_id: STORE_B },
      error: null,
    });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(404);
  });

  // ── Persistencia de la asociación ──

  it('crea product_cost_sheets con template_id = UUID de la plantilla y FC vigente', async () => {
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.generated).toBe(true);
    expect(body.data.fc_status).toBe('vigente');
    expect(body.data.template_name).toBe('Mi Plantilla Guardada');
    // template_id persistido = UUID de cost_sheet_templates (asociación explícita)
    expect(body.data.template_id).toBe(TEMPLATE_ID);
    expect(body.data.cost_price).toBeTypeOf('number');

    // INSERT en product_cost_sheets (sin FC previa)
    const pcs = tableChains['product_cost_sheets'];
    expect(pcs.insert).toHaveBeenCalled();
    const inserted = pcs.insert.mock.calls[0][0];
    expect(inserted.product_id).toBe(PRODUCT_ID);
    expect(inserted.store_id).toBe(STORE_A);
    expect(inserted.template_id).toBe(TEMPLATE_ID);
    expect(inserted.sync_status).toBe('synced');
  });

  it('actualiza la FC existente en lugar de duplicarla (upsert)', async () => {
    // FC activa previa
    setTable('product_cost_sheets', { data: { id: 'cs-existing-1' }, error: null });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(201);

    const pcs = tableChains['product_cost_sheets'];
    expect(pcs.update).toHaveBeenCalled();
    expect(pcs.insert).not.toHaveBeenCalled();
  });

  it('enlaza products.cost_sheet_id con la FC creada', async () => {
    await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);

    const products = tableChains['products'];
    expect(products.update).toHaveBeenCalled();
    const updateCall = products.update.mock.calls[0][0];
    expect(updateCall).toHaveProperty('cost_sheet_id');
  });

  it('invalida la caché de PDF del producto tras conectar', async () => {
    await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);

    const { invalidateCache } = await import('@/lib/fc-pdf-cache');
    expect(invalidateCache).toHaveBeenCalledWith(STORE_A, PRODUCT_ID);
  });

  it('registra auditoría de la generación', async () => {
    await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);

    const { auditService } = await import('@/services/audit-service');
    expect(auditService.logFCGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        productId: PRODUCT_ID,
        storeId: STORE_A,
        templateId: TEMPLATE_ID,
        isAutoGenerated: false,
      }),
    );
  });

  it('admin global puede conectar aunque no tenga membresía de la tienda', async () => {
    mockSession.value = { user: { id: OTHER_USER_ID, role: 'admin', memberships: [] } };
    // Plantilla privada del ADMIN (created_by = OTHER_USER_ID)
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, created_by: OTHER_USER_ID },
      error: null,
    });

    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    expect(res.status).toBe(201);
  });

  it('rechaza plantilla con data inválida (422)', async () => {
    setTable('cost_sheet_templates', {
      data: { ...PRIVATE_TEMPLATE_ROW, data: { header: {}, sections: 'no' } },
      error: null,
    });
    const res = await POST(makeRequest({
      product_id: PRODUCT_ID,
      store_id: STORE_A,
      template_id: TEMPLATE_ID,
    }) as any);
    // El pipeline de generación detecta estructura inválida → 422
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.data.error_code).toBe('TEMPLATE_LOAD_FAILED');
  });
});
