import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/product-cost-sheets/route';

/**
 * FC-USR-TEMPLATE (seguridad, misión §6): endurecimiento del PATCH
 * (soft-delete / desconexión de FC).
 *
 * Antes el handler borraba por ID con service role sin validar la TIENDA del
 * cost sheet — un encargado de la tienda A podía desconectar FCs de la tienda
 * B con solo conocer el ID. Ahora: la FC debe pertenecer a una tienda donde el
 * caller tenga membresía activa admin/manager/encargado/costo (o admin global).
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';
const CS_ID = 'c3333333-3333-4333-8333-333333333333';
const USER_ID = 'd4444444-4444-4444-8444-444444444444';

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

// Cadena por tabla con resultado de escritura tras update
const tableChains: Record<string, any> = {};
function makeChain(result: { data: any; error: any }): any {
  const chain: any = {};
  let writeResult: { data: any; error: any } | null = null;
  chain.select = vi.fn().mockReturnThis();
  chain.eq = vi.fn().mockReturnThis();
  chain.is = vi.fn().mockReturnThis();
  chain.update = vi.fn(() => {
    writeResult = { data: null, error: null };
    return chain;
  });
  chain.single = vi.fn().mockImplementation(async () => writeResult ?? result);
  chain.maybeSingle = vi.fn().mockImplementation(async () => writeResult ?? result);
  return chain;
}
function setTable(table: string, result: { data: any; error: any }) {
  tableChains[table] = makeChain(result);
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (!tableChains[table]) tableChains[table] = makeChain({ data: null, error: null });
      return tableChains[table];
    }),
  })),
}));

function makeRequest(body: any): Request {
  return {
    method: 'PATCH',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/product-cost-sheets',
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  // La ruta construye el cliente admin inline desde env (patrón histórico)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  for (const t of Object.keys(tableChains)) delete tableChains[t];
  // FC objetivo pertenece a STORE_A, activa
  setTable('product_cost_sheets', { data: { id: CS_ID, store_id: STORE_A, deleted_at: null }, error: null });
  setTable('products', { data: null, error: null });
  // Caller por defecto: encargado en STORE_A
  mockSession.value = {
    user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_A, role: 'encargado', status: 'active' }] },
  };
});

describe('PATCH /api/product-cost-sheets (desconexión endurecida)', () => {
  it('permite desconectar una FC de la tienda con membresía autorizada', async () => {
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.soft_deleted).toBe(true);
    // Limpia el enlace en products
    expect(tableChains['products'].update).toHaveBeenCalled();
  });

  it('BLOQUEA desconectar una FC de OTRA tienda aunque se conozca el ID (403)', async () => {
    // Caller es encargado de STORE_B; la FC pertenece a STORE_A
    mockSession.value = {
      user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_B, role: 'encargado', status: 'active' }] },
    };
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(403);
    // No se marca deleted_at
    expect(tableChains['product_cost_sheets'].update).not.toHaveBeenCalled();
  });

  it('bloquea miembros de la tienda con rol sin privilegio de costo (clerk)', async () => {
    mockSession.value = {
      user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }] },
    };
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(403);
  });

  it('bloquea membresías revocadas', async () => {
    mockSession.value = {
      user: { id: USER_ID, role: 'usuario', memberships: [{ store_id: STORE_A, role: 'encargado', status: 'revoked' }] },
    };
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(403);
  });

  it('admin global puede desconectar de cualquier tienda', async () => {
    mockSession.value = { user: { id: USER_ID, role: 'admin', memberships: [] } };
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(200);
  });

  it('404 si la FC no existe', async () => {
    setTable('product_cost_sheets', { data: null, error: null });
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(404);
  });

  it('idempotente: FC ya desconectada responde 200 sin re-borrar', async () => {
    setTable('product_cost_sheets', { data: { id: CS_ID, store_id: STORE_A, deleted_at: '2026-11-01' }, error: null });
    const res = await PATCH(makeRequest({ cost_sheet_id: CS_ID }) as any);
    expect(res.status).toBe(200);
    expect(tableChains['product_cost_sheets'].update).not.toHaveBeenCalled();
  });
});
