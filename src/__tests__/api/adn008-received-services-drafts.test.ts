/**
 * adn008-received-services-drafts.test.ts — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 * (hardening ADN-009: identidad del proveedor resuelta server-side + PATCH tri-state)
 *
 * Rutas /api/received-services:
 *  · POST save_as_draft → resolveSupplierIdentity ANTES del RPC; el RPC
 *    create_received_service_draft recibe IDs validados + snapshot DE LA BD
 *    (proveedor opcional, creation_key, SIN activación NI pagos).
 *  · POST confirmación → RPC create_received_service_v2 (intacto) + identidad
 *    del proveedor (supplier_id/master/snapshot desde la fuente autorizada)
 *    congelada en el UPDATE por PK.
 *  · PATCH action=update-draft → RPC update_received_service_draft con firma
 *    tri-state (p_service_id, p_actor_id, p_patch): p_patch SOLO contiene las
 *    claves presentes en el body; identidad = bloque atómico resuelto.
 *  · PATCH status → SIEMPRE set_received_service_status (gate de confirmación
 *    server-side), incluso con USE_V2_RECEIVED_SERVICES=false.
 *  · Gates de autorización intactos (canManageStore).
 *  · ADN-009 §6: rechazos del resolver → 400 ERR_SUPPLIER_INVALID /
 *    ERR_SUPPLIER_IDENTITY_MISMATCH / ERR_SUPPLIER_MASTER_INVALID.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, PATCH } from '@/app/api/received-services/route';

const mockSession = { value: null as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: mockSession.value }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => fn,
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg }),
}));

const rpcMock = vi.fn();
const updateMock = vi.fn();

const SUPPLIER_ID = '11111111-1111-4111-8111-111111111101';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';

// ADN-009 §6: filas de la FUENTE AUTORIZADA consultadas por resolveSupplierIdentity.
// null = fila ausente (p.ej. proveedor de OTRA tienda / maestro inexistente).
let mockSuppliersRow: any = {
  id: SUPPLIER_ID,
  name: 'TransCaribe S.A.',
  // NOTA: suppliers NO tiene columna `code` (concepto del Clasificador Maestro).
  tax_id: 'NIT-BD',
  phone: '55-BD',
  address: 'calle-BD',
  master_party_id: null,
};
let mockMasterPartiesRow: any = null;
let mockStoresRow: any = { tenant_id: 'tenant-a' };

let resolvedServiceRow: { data: any; error: any };

const STORE_A = 'a1111111-1111-4111-8111-111111111111';

function awaitable(finalValue: unknown) {
  const obj: any = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.order = () => obj;
  obj.single = async () => ({ data: null, error: null });
  obj.then = (res?: any, rej?: any) => Promise.resolve(finalValue).then(res, rej);
  return obj;
}

// Cadena del resolver: .select(...).eq(...)(.eq(...)).maybeSingle() → fila configurable.
function maybeSingleChain(row: any) {
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: row, error: null });
  return chain;
}

function makeAdminMock() {
  return {
    from: (table: string) => {
      if (table === 'received_services') {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = async () => resolvedServiceRow;
        chain.update = (payload: any) => {
          updateMock(payload);
          return { eq: (..._a: any[]) => ({ error: null, then: (res?: any) => Promise.resolve({ error: null }).then(res) }) };
        };
        chain.then = (res?: any, rej?: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
        return chain;
      }
      // ADN-009 §6: tablas del resolver de identidad (solo se consultan si el
      // body envía IDs; sin IDs el resolver NO consulta nada).
      if (table === 'suppliers') return maybeSingleChain(mockSuppliersRow);
      if (table === 'master_parties') return maybeSingleChain(mockMasterPartiesRow);
      if (table === 'stores') return maybeSingleChain(mockStoresRow);
      return awaitable({ data: [], error: null });
    },
    rpc: rpcMock,
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => makeAdminMock()),
}));

function makeRequest(method: string, body: unknown): any {
  return {
    method,
    headers: new Map(),
    json: async () => body,
    url: 'http://localhost:3000/api/received-services',
  } as any;
}

function sessionManager() {
  return { id: 'actor-1', role: 'manager', memberships: [{ store_id: STORE_A, role: 'manager', status: 'active' }] } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.value = sessionManager();
  resolvedServiceRow = { data: { id: 'srv-1', store_id: STORE_A }, error: null };
  mockSuppliersRow = {
    id: SUPPLIER_ID,
    name: 'TransCaribe S.A.',
    tax_id: 'NIT-BD',
    phone: '55-BD',
    address: 'calle-BD',
    master_party_id: null,
  };
  mockMasterPartiesRow = null;
  mockStoresRow = { tenant_id: 'tenant-a' };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  delete process.env.USE_V2_RECEIVED_SERVICES;
});

const BASE = {
  store_id: STORE_A,
  service_type_id: 't-1',
  service_type_name: 'Transporte',
  total_amount: 1040,
  supplier: null,
};

describe('POST /api/received-services · ADN-008 borradores', () => {
  it('save_as_draft → RPC create_received_service_draft con creation_key y proveedor NULL; SIN activación', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-draft-1', service_number: 'SRV-x-00001', draft: true }, error: null });
    const res = await POST(makeRequest('POST', {
      ...BASE,
      save_as_draft: true,
      creation_key: 'creation-key-abc12345',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.status).toBe('draft');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_received_service_draft');
    expect(args.p_store_id).toBe(STORE_A);
    expect(args.p_supplier).toBeNull();
    expect(args.p_creation_key).toBe('creation-key-abc12345');
    expect(args.p_total_amount).toBe(1040);
    // Sin IDs en el body → identidad de texto libre (el resolver NO consulta nada).
    expect(args.p_supplier_id).toBeNull();
    expect(args.p_supplier_master_party_id).toBeNull();
    expect(args.p_supplier_meta).toBeNull();

    // §3.1: sin PATCH de activación — el borrador NO se activa ni paga.
    expect(rpcMock.mock.calls.some(([f]) => f === 'set_received_service_status')).toBe(false);
  });

  it('borrador con identidad de proveedor del catálogo → IDs validados + snapshot DESDE LA BD al RPC (ADN-009 §6)', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-draft-2', service_number: 'SRV-x-00002', draft: true }, error: null });
    await POST(makeRequest('POST', {
      ...BASE,
      save_as_draft: true,
      creation_key: 'creation-key-xyz98765',
      supplier_id: SUPPLIER_ID,
      supplier_master_party_id: null,
      // Meta del CLIENTE — ignorada: el snapshot sale de la fila de la BD.
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: '55', address: 'calle' },
    }));
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_received_service_draft');
    expect(args.p_supplier_id).toBe(SUPPLIER_ID);
    expect(args.p_supplier_master_party_id).toBeNull(); // resuelto: sin maestro en la fila local
    // ADN-009: p_supplier_meta = SNAPSHOT DE LA BD (mockSuppliersRow), no la meta del cliente.
    expect(args.p_supplier_meta).toEqual({
      code: null,   // suppliers sin columna code → code solo desde el maestro
      tax_id: 'NIT-BD',
      phone: '55-BD',
      address: 'calle-BD',
    });
    // El nombre también se resuelve desde la fuente autorizada.
    expect(args.p_supplier).toBe('TransCaribe S.A.');
  });

  it('confirmación (sin save_as_draft) → create_received_service_v2 (intacto) + identidad de la BD congelada', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-new-1', service_number: 'SRV-x-00003' }, error: null });
    const res = await POST(makeRequest('POST', {
      ...BASE,
      supplier: 'TransCaribe S.A.',
      supplier_id: SUPPLIER_ID,
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: null, address: null },
      paymentRows: [],
    }));
    expect(res.status).toBe(201);

    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_received_service_v2');
    expect(args.p_supplier).toBe('TransCaribe S.A.');

    // §4.3 + ADN-009 §6: identidad real desde la BD (UPDATE por PK tras la creación).
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      supplier_id: SUPPLIER_ID,
      supplier_master_party_id: null, // resuelto: la fila local no tiene maestro
      supplier_code: null,            // snapshot DE LA BD (code solo desde el maestro)
      supplier_tax_id: 'NIT-BD',
      supplier_phone: '55-BD',
      supplier_address: 'calle-BD',
    }));
  });

  it('sin save_as_draft NO se llama al RPC de borrador (flujo confirmación intacto)', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-new-2', service_number: 'SRV-x-00004' }, error: null });
    await POST(makeRequest('POST', { ...BASE, supplier: 'X' }));
    expect(rpcMock.mock.calls.some(([f]) => f === 'create_received_service_draft')).toBe(false);
  });

  it('ADN-009 §6: save_as_draft con supplier_id de OTRA tienda → 400 ERR_SUPPLIER_INVALID sin llamar al RPC', async () => {
    mockSuppliersRow = null; // fila ausente: el proveedor no pertenece a la tienda activa
    const res = await POST(makeRequest('POST', {
      ...BASE,
      save_as_draft: true,
      creation_key: 'creation-key-other-1',
      supplier_id: SUPPLIER_ID,
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: null, address: null },
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_SUPPLIER_INVALID');
    expect(json.error).toContain('no pertenece a la tienda activa');
    // El resolver falla ANTES de cualquier escritura: cero llamadas RPC.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('ADN-009 §6: save_as_draft con maestro de OTRO tenant → 400 ERR_SUPPLIER_MASTER_INVALID', async () => {
    mockSuppliersRow = { ...mockSuppliersRow, master_party_id: MASTER_ID };
    mockMasterPartiesRow = {
      id: MASTER_ID,
      name: 'Grupo TransCaribe',
      code: 'GTC',
      tax_id: 'NIT-M',
      phone: null,
      address: null,
      status: 'active',
      tenant_id: 'tenant-a',
    };
    mockStoresRow = { tenant_id: 'tenant-b' }; // la tienda activa pertenece a OTRO tenant
    const res = await POST(makeRequest('POST', {
      ...BASE,
      save_as_draft: true,
      creation_key: 'creation-key-tenant-1',
      supplier_id: SUPPLIER_ID,
      supplier_master_party_id: MASTER_ID,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_SUPPLIER_MASTER_INVALID');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/received-services · ADN-008 (ADN-009: contrato tri-state)', () => {
  it('action=update-draft → RPC update_received_service_draft (p_service_id, p_actor_id, p_patch) con identidad RESUELTA', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'success', service_id: 'srv-1', draft: true }, error: null });
    const res = await PATCH(makeRequest('PATCH', {
      service_id: 'srv-1',
      action: 'update-draft',
      supplier: 'TransCaribe S.A.',
      supplier_id: SUPPLIER_ID,
      supplier_master_party_id: null,
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: null, address: null },
      service_type_id: '11111111-1111-4111-8111-111111111102',
      service_type_name: 'Transporte',
      total_amount: 500,
      receipt_ids: [],
      production_order_ids: [],
    }));
    expect(res.status).toBe(200);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('update_received_service_draft');
    expect(args.p_service_id).toBe('srv-1');
    // 'actor-1' no es UUID → userId=null → p_actor_id null (el RPC revalida autoría).
    expect(args.p_actor_id).toBeNull();

    // ADN-009 §9: p_patch tri-state con identidad resuelta server-side.
    expect(args.p_patch).toEqual({
      supplier_id: SUPPLIER_ID,
      supplier_master_party_id: null, // resuelto — el proveedor mockeado no tiene maestro
      supplier_meta: { code: null, tax_id: 'NIT-BD', phone: '55-BD', address: 'calle-BD' }, // snapshot BD (code solo desde el maestro)
      supplier: 'TransCaribe S.A.',
      total_amount: 500,
      service_type_id: '11111111-1111-4111-8111-111111111102',
      service_type_name: 'Transporte',
      receipt_ids: [],
      production_order_ids: [],
    });
    // Claves AUSENTES del body → AUSENTES del patch.
    expect('service_date' in args.p_patch).toBe(false);
    expect('reference_doc' in args.p_patch).toBe(false);
    expect('observations' in args.p_patch).toBe(false);
    expect('distribution_method' in args.p_patch).toBe(false);
  });

  it('update-draft con SOLO {observations: null} → p_patch EXACTAMENTE {observations: null} (omitidas no viajan)', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'success', service_id: 'srv-1' }, error: null });
    const res = await PATCH(makeRequest('PATCH', {
      service_id: 'srv-1',
      action: 'update-draft',
      observations: null,
    }));
    expect(res.status).toBe(200);

    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('update_received_service_draft');
    expect(args.p_patch).toEqual({ observations: null });
    expect(Object.keys(args.p_patch)).toEqual(['observations']);
  });

  it('update-draft con {observations:"", reference_doc:""} → vacío VIAJA tal cual ("?? null" solo convierte null/undefined)', async () => {
    // Contrato REAL de la ruta: patch.X = d.X ?? null — '' no es nullish y se
    // conserva; null/undefined SÍ se convierten en null (limpiar; ver test anterior).
    rpcMock.mockResolvedValue({ data: { status: 'success', service_id: 'srv-1' }, error: null });
    const res = await PATCH(makeRequest('PATCH', {
      service_id: 'srv-1',
      action: 'update-draft',
      observations: '',
      reference_doc: '',
    }));
    expect(res.status).toBe(200);

    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_patch).toEqual({ reference_doc: '', observations: '' });
    expect(Object.keys(args.p_patch).sort()).toEqual(['observations', 'reference_doc']);
  });

  it('ERR_NOT_DRAFT del RPC → 409 accionable (no 500)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_NOT_DRAFT: solo los borradores pueden editarse aquí (estado actual: active)' } });
    const res = await PATCH(makeRequest('PATCH', { service_id: 'srv-1', action: 'update-draft', total_amount: 10 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('borradores');
  });

  it('transición de estado SIEMPRE por RPC incluso con USE_V2=false (gate de confirmación server-side)', async () => {
    process.env.USE_V2_RECEIVED_SERVICES = 'false';
    rpcMock.mockResolvedValue({ data: { status: 'success', service_status: 'active' }, error: null });
    const res = await PATCH(makeRequest('PATCH', { service_id: 'srv-1', status: 'active', reason: 'Confirmación' }));
    expect(res.status).toBe(200);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('set_received_service_status');
    expect(args.p_new_status).toBe('active');

    // El path legacy (UPDATE directo de columnas) NO debe ejecutarse para el
    // cambio de estado: sin update() sobre received_services.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('ERR_SUPPLIER_REQUIRED del gate de confirmación → 400 accionable', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_SUPPLIER_REQUIRED: completa el proveedor antes de confirmar el servicio' } });
    const res = await PATCH(makeRequest('PATCH', { service_id: 'srv-1', status: 'active' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('proveedor');
  });

  it('canManageStore sigue siendo obligatorio para update-draft (F3-P0-02 intacto)', async () => {
    mockSession.value = { id: 'u', role: 'clerk', memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }] } as any;
    const res = await PATCH(makeRequest('PATCH', { service_id: 'srv-1', action: 'update-draft', total_amount: 1 }));
    expect(res.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
