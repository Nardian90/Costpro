/**
 * adn008-received-services-drafts.test.ts — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 *
 * Rutas /api/received-services:
 *  · POST save_as_draft → RPC create_received_service_draft (proveedor
 *    opcional, creation_key, SIN activación NI pagos).
 *  · POST confirmación → RPC create_received_service_v2 (intacto) + identidad
 *    del proveedor (supplier_id/master/snapshot) congelada.
 *  · PATCH action=update-draft → RPC update_received_service_draft (y mapeo
 *    de ERR_NOT_DRAFT → 409).
 *  · PATCH status → SIEMPRE set_received_service_status (gate de confirmación
 *    server-side), incluso con USE_V2_RECEIVED_SERVICES=false (el path legacy
 *    con UPDATE directo de columnas queda retirado para transiciones).
 *  · Gates de autorización intactos (canManageStore).
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
const eqMock = vi.fn();

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
  updateMock.mockClear();
  eqMock.mockClear();
  mockSession.value = sessionManager();
  resolvedServiceRow = { data: { id: 'srv-1', store_id: STORE_A }, error: null };
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

    // §3.1: sin PATCH de activación — el borrador NO se activa ni paga.
    expect(rpcMock.mock.calls.some(([f]) => f === 'set_received_service_status')).toBe(false);
  });

  it('borrador con identidad de proveedor del catálogo → supplier_id/master/meta llegan al RPC', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-draft-2', service_number: 'SRV-x-00002', draft: true }, error: null });
    await POST(makeRequest('POST', {
      ...BASE,
      save_as_draft: true,
      creation_key: 'creation-key-xyz98765',
      supplier_id: '11111111-1111-4111-8111-111111111101',
      supplier_master_party_id: null,
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: '55', address: 'calle' },
    }));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_supplier_id).toBe('11111111-1111-4111-8111-111111111101');
    expect(args.p_supplier_meta).toEqual({ code: 'TC', tax_id: 'NIT-1', phone: '55', address: 'calle' });
  });

  it('confirmación (sin save_as_draft) → create_received_service_v2 (intacto) + identidad congelada', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-new-1', service_number: 'SRV-x-00003' }, error: null });
    const res = await POST(makeRequest('POST', {
      ...BASE,
      supplier: 'TransCaribe S.A.',
      supplier_id: '11111111-1111-4111-8111-111111111101',
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: null, address: null },
      paymentRows: [],
    }));
    expect(res.status).toBe(201);

    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_received_service_v2');
    expect(args.p_supplier).toBe('TransCaribe S.A.');

    // §4.3: identidad real guardada (UPDATE por PK tras la creación).
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      supplier_id: '11111111-1111-4111-8111-111111111101',
      supplier_code: 'TC',
      supplier_tax_id: 'NIT-1',
    }));
  });

  it('sin save_as_draft NO se llama al RPC de borrador (flujo confirmación intacto)', async () => {
    rpcMock.mockResolvedValue({ data: { service_id: 'srv-new-2', service_number: 'SRV-x-00004' }, error: null });
    await POST(makeRequest('POST', { ...BASE, supplier: 'X' }));
    expect(rpcMock.mock.calls.some(([f]) => f === 'create_received_service_draft')).toBe(false);
  });
});

describe('PATCH /api/received-services · ADN-008', () => {
  it('action=update-draft → RPC update_received_service_draft con identidad completa', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'success', service_id: 'srv-1', draft: true }, error: null });
    const res = await PATCH(makeRequest('PATCH', {
      service_id: 'srv-1',
      action: 'update-draft',
      supplier: 'TransCaribe S.A.',
      supplier_id: '11111111-1111-4111-8111-111111111101',
      supplier_master_party_id: null,
      supplier_meta: { code: 'TC', tax_id: 'NIT-1', phone: null, address: null },
      service_type_id: '11111111-1111-4111-8111-111111111102',
      service_type_name: 'Transporte',
      total_amount: 500,
      receipt_ids: [],
      production_order_ids: [],
    }));
    expect(res.status).toBe(200);

    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('update_received_service_draft');
    expect(args.p_service_id).toBe('srv-1');
    expect(args.p_supplier_id).toBe('11111111-1111-4111-8111-111111111101');
    expect(args.p_supplier_master_party_id).toBeNull(); // reemplazo completo (limpia)
    expect(args.p_total_amount).toBe(500);
    expect(args.p_receipt_ids).toEqual([]);
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
