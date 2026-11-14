/**
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — contrato de la ruta
 * PATCH /api/inventory/receptions/[id].
 *
 * Guard de estado de la cabecera: los campos económicos/documentales
 * (supplier, referenceDoc, itemUpdates) solo son editables en 'pending';
 * `notes` (anotación no económica) es editable en cualquier estado. Antes el
 * update directo (RLS no filtra por estado) permitía re-etiquetar facturas
 * de documentos terminados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionState = { value: { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => async (req: any, session: any) => fn(req, session),
}));

// ─── Session client: status lookup + updates + RPC ───
const receiptState = { value: { data: null as { status: string } | null, error: null as any } };
const updateCalls: Array<Record<string, any>> = [];
const rpcState = { value: { data: null as any, error: null as any } };
const rpcCalls: Array<{ name: string; args: any }> = [];

const receiptSelect = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve(receiptState.value)),
};
const receiptUpdate = {
  update: vi.fn((patch: Record<string, any>) => { updateCalls.push(patch); return receiptUpdate; }),
  eq: vi.fn().mockResolvedValue({ error: null }),
};

const mockSessionClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcState.value);
  },
  from: (table: string) => {
    if (table !== 'receipts') throw new Error(`tabla inesperada en session mock: ${table}`);
    return {
      select: () => receiptSelect,
      update: (patch: Record<string, any>) => receiptUpdate.update(patch),
    };
  },
};
vi.mock('@/lib/supabase-session', () => ({ getSupabaseForSession: () => mockSessionClient }));

import { PATCH } from '@/app/api/inventory/receptions/[id]/route';

function makeReq(body: any): Request {
  return {
    method: 'PATCH', headers: new Map(), json: async () => body,
    url: 'http://localhost:3000/api/inventory/receptions/rc-1',
    nextUrl: { pathname: '/api/inventory/receptions/rc-1' },
  } as any;
}
async function call(body: any) {
  const res = await PATCH(makeReq(body) as any, sessionState.value);
  const data = await res.json();
  return { status: res.status, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls.length = 0;
  rpcCalls.length = 0;
  receiptState.value = { data: { status: 'active' }, error: null };
  rpcState.value = { data: { updated_count: 1, new_total: 100 }, error: null };
  sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } };
});

describe('PATCH /api/inventory/receptions/[id] — guard de estado de cabecera', () => {
  it('409 ERR_NOT_EDITABLE para supplier sobre recepción active', async () => {
    const { status, data } = await call({ supplier: 'Nuevo proveedor' });
    expect(status).toBe(409);
    expect(data.code).toBe('ERR_NOT_EDITABLE');
    expect(data.campos_bloqueados).toContain('supplier');
    expect(updateCalls).toHaveLength(0);
  });

  it('409 para referenceDoc sobre active y para itemUpdates sobre active', async () => {
    expect((await call({ referenceDoc: 'OTRA-FACTURA' })).status).toBe(409);
    expect((await call({ itemUpdates: [{ id: 'x', quantity: 1, unit_cost: 5, deleted: false }] })).status).toBe(409);
    expect(updateCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('notes SI es editable en active (anotación no económica)', async () => {
    const { status } = await call({ notes: 'Nota aclaratoria posterior' });
    expect(status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].notes).toBe('Nota aclaratoria posterior');
    expect(updateCalls[0].supplier).toBeUndefined();
  });

  it('campos económicos + notes juntos: pending los acepta todos', async () => {
    receiptState.value = { data: { status: 'pending' }, error: null };
    const { status } = await call({ supplier: 'Prov', referenceDoc: 'F-2', notes: 'n' });
    expect(status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ supplier: 'Prov', reference_doc: 'F-2', notes: 'n' });
  });

  it('itemUpdates en pending delega en update_reception_items', async () => {
    receiptState.value = { data: { status: 'pending' }, error: null };
    const updates = [{ id: 'x', quantity: 2, unit_cost: 5, deleted: false }];
    const { status, data } = await call({ itemUpdates: updates });
    expect(status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('update_reception_items');
    expect(data.new_total).toBe(100);
  });

  it('ERR_NOT_EDITABLE de la RPC ahora es 409 (antes 400)', async () => {
    receiptState.value = { data: { status: 'pending' }, error: null };
    rpcState.value = { data: null, error: { message: 'ERR_NOT_EDITABLE: solo recepciones pendientes' } };
    const { status, data } = await call({ itemUpdates: [{ id: 'x', quantity: 1, unit_cost: 5, deleted: false }] });
    expect(status).toBe(409);
    expect(data.code).toBe('ERR_NOT_EDITABLE');
  });

  it('404 cuando la recepción no existe y se piden campos económicos', async () => {
    receiptState.value = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    const { status } = await call({ supplier: 'X' });
    expect(status).toBe(404);
  });

  it('403 para rol sin privilegio', async () => {
    sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'cajero' } };
    expect((await call({ notes: 'x' })).status).toBe(403);
  });

  it('voided/reversed también bloquean campos económicos', async () => {
    receiptState.value = { data: { status: 'voided' }, error: null };
    expect((await call({ supplier: 'X' })).status).toBe(409);
    receiptState.value = { data: { status: 'reversed' }, error: null };
    expect((await call({ referenceDoc: 'F' })).status).toBe(409);
  });
});
