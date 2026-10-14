/**
 * Test de regresión — RLS-FIX: alta manual de productos desde Recepción.
 *
 * Defecto: executeSubmit insertaba en `products` SIN `tenant_id`. La política
 * vigente `products_tenant_insert` (migración 20260827000005, endurecida) exige
 *   WITH CHECK (tenant_id = current_user_tenant_id()
 *              AND store_id = ANY(current_user_store_ids()))
 * → fila con tenant_id NULL → 403/42501 en producción.
 *
 * Fix (Alternativa A, mínima y fail-closed):
 *  1. Antes del insert se resuelve `tenant_id` leyendo stores.tenant_id de la
 *     tienda activa con el JWT del usuario (RLS de SELECT valida la identidad).
 *  2. Si no se verifica → abort sin INSERT.
 *  3. Clasificación de errores (RLS / duplicado / conexión) sin filtrar
 *     detalles internos de PostgreSQL.
 *  4. Guard anti re-entrada de executeSubmit (doble click).
 *
 * Los 8 escenarios ejercitan el flujo REAL del alta manual:
 * handleOpenForm → setters → handleAddManualProduct → executeSubmit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted (compartidos con las factories de vi.mock) ──────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  registerMock: vi.fn(),
  savePendingMock: vi.fn(),
  confirmPendingMock: vi.fn(),
  logReceptionMock: vi.fn(),
  userHolder: { current: null as any },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock },
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: h.userHolder.current }),
  useUIStore: () => ({ setCurrentView: vi.fn() }),
}));

vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: () => ({ data: undefined, isLoading: false }),
  useRegisterReception: () => ({ mutateAsync: h.registerMock, isPending: false }),
}));

vi.mock('@/hooks/api/useReceptions', () => ({
  useSavePendingReception: () => ({ mutateAsync: h.savePendingMock, isPending: false }),
  useConfirmPendingReception: () => ({ mutateAsync: h.confirmPendingMock, isPending: false }),
}));

vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({ data: null }),
  validateOperationDate: () => ({ valid: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/services/audit-service', () => ({
  auditService: { logReceptionCreated: h.logReceptionMock },
}));

import { toast } from 'sonner';
import { useReceptionState } from '@/components/views/terminal/views/inventory/useReceptionState';
import { UserFactory } from '@/contracts/user';

// ── Fixtures ────────────────────────────────────────────────────────────────
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const STORE_A = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (staging)
const USER_A = '22222222-2222-2222-2222-222222222222';

function setupUser() {
  h.userHolder.current = UserFactory.create({
    id: USER_A,
    email: 'admin@costpro.com',
    fullName: 'Operador Test',
    role: 'admin',
    roles: ['admin'],
    storeId: STORE_A,
    activeStoreId: STORE_A,
  });
}

/** Registro de llamadas al insert de products. */
let productsInsertCalls: any[][] = [];
let productsDeleteInCalls: any[][] = [];

type StoresBehaviour =
  | { kind: 'ok'; tenantId: string | null }
  | { kind: 'db_error' }
  | { kind: 'hang' };

let storesBehaviour: StoresBehaviour = { kind: 'ok', tenantId: TENANT_A };
let insertError: { code?: string; message: string } | null = null;
let resolveHang: ((v: any) => void) | null = null;

function installSupabaseMocks() {
  h.fromMock.mockImplementation((table: string) => {
    if (table === 'stores') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              if (storesBehaviour.kind === 'hang') {
                return new Promise(resolve => { resolveHang = resolve; });
              }
              if (storesBehaviour.kind === 'db_error') {
                return Promise.resolve({ data: null, error: { message: 'db down' } });
              }
              const tenantId = storesBehaviour.kind === 'ok' ? storesBehaviour.tenantId : null;
              return Promise.resolve({
                data: tenantId ? { tenant_id: tenantId } : null,
                error: null,
              });
            },
          }),
        }),
      };
    }
    if (table === 'products') {
      return {
        insert: (payload: any[]) => {
          productsInsertCalls.push(payload);
          return {
            select: () =>
              Promise.resolve(
                insertError
                  ? { data: null, error: insertError }
                  : {
                      data: payload.map((p, i) => ({ id: `prod-${productsInsertCalls.length}-${i + 1}`, sku: p.sku })),
                      error: null,
                    }
              ),
          };
        },
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            productsDeleteInCalls.push(ids);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`tabla no mockeada en test: ${table}`);
  });
}

function renderReception() {
  return renderHook(() => useReceptionState({}), {
    wrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  });
}

async function addManualItemViaHook(result: any, sku: string, name: string) {
  act(() => { result.current.handleOpenForm(); });
  // Lección aprendida: cada setState debe ir en su propio act para que el
  // siguiente handler lea el estado ya aplicado.
  act(() => { result.current.setManualName(name); });
  act(() => { result.current.setManualSku(sku); });
  act(() => { result.current.handleAddManualProduct(); });
}

describe('useReceptionState — RLS fix en alta manual de productos (products_tenant_insert)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsInsertCalls = [];
    productsDeleteInCalls = [];
    storesBehaviour = { kind: 'ok', tenantId: TENANT_A };
    insertError = null;
    resolveHang = null;
    setupUser();
    installSupabaseMocks();
    h.registerMock.mockReset();
    h.registerMock.mockResolvedValue('REC-TEST-1');
    h.logReceptionMock.mockReset();
    h.logReceptionMock.mockResolvedValue(undefined);
    localStorage.clear();
  });

  it('1 · inserta products CON tenant_id verificado por RLS y completa la recepción', async () => {
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-OK-1', 'Producto OK');

    await act(async () => { await result.current.executeSubmit(); });

    expect(productsInsertCalls).toHaveLength(1);
    const payload = productsInsertCalls[0];
    expect(payload).toHaveLength(1);
    // ⬇ ASERCIONES CLAVE DEL BUG: sin estas, products_tenant_insert rechaza 403.
    expect(payload[0]).toMatchObject({
      store_id: STORE_A,
      tenant_id: TENANT_A,
      sku: 'SKU-OK-1',
      name: 'Producto OK',
    });
    // La recepción continúa: register_reception llamado con el product_id recién creado.
    expect(h.registerMock).toHaveBeenCalledTimes(1);
    const rpcArgs = h.registerMock.mock.calls[0][0];
    expect(rpcArgs.p_store_id).toBe(STORE_A);
    expect(rpcArgs.p_items[0].product_id).toMatch(/^prod-1-/);
    // Estado final: comprobante visible y form limpio.
    expect(result.current.successData.open).toBe(true);
    expect(result.current.items).toHaveLength(0);
  });

  it('2 · fail-closed: tienda ajena (RLS no devuelve fila) → aborta SIN insert', async () => {
    storesBehaviour = { kind: 'ok', tenantId: null }; // 0 filas: store no pertenece al tenant
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-FOREIGN', 'Producto ajeno');

    await act(async () => { await result.current.executeSubmit(); });

    expect(productsInsertCalls).toHaveLength(0);          // nunca se insertó
    expect(h.registerMock).not.toHaveBeenCalled();        // ni se registró recepción
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo verificar la tienda activa')
    );
    expect(result.current.items).toHaveLength(1);         // el item permanece para reintento
  });

  it('3 · fail-closed: error de BD al leer stores → aborta SIN insert', async () => {
    storesBehaviour = { kind: 'db_error' };
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-DBERR', 'Producto dberr');

    await act(async () => { await result.current.executeSubmit(); });

    expect(productsInsertCalls).toHaveLength(0);
    expect(h.registerMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo verificar la tienda activa')
    );
  });

  it('4 · clasifica error RLS (42501) sin exponer detalles internos de PostgreSQL', async () => {
    insertError = { code: '42501', message: 'new row violates row-level security policy for table "products"' };
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-RLS-ERR', 'Producto rls');

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Permisos insuficientes')
    );
    // Fase 5: el mensaje de Postgres NO llega crudo al usuario.
    const shown = (toast.error as any).mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(shown).not.toContain('violates row-level');
    expect(shown).not.toContain('42501');
  });

  it('5 · clasifica error de SKU duplicado (23505)', async () => {
    insertError = { code: '23505', message: 'duplicate key value violates unique constraint "products_store_sku_key"' };
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-DUP', 'Producto dup');

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('SKU ya existe')
    );
  });

  it('6 · rollback REC-2: si register_reception falla, elimina los productos recién creados', async () => {
    h.registerMock.mockRejectedValueOnce(new Error('ERR_BACKDATED_DOCUMENT'));
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-RB-1', 'Producto rollback');

    await act(async () => { await result.current.executeSubmit(); });

    // El insert SÍ ocurrió (con tenant_id), pero el registro falló → rollback.
    expect(productsInsertCalls).toHaveLength(1);
    expect(productsDeleteInCalls).toHaveLength(1);
    expect(productsDeleteInCalls[0]).toEqual([expect.stringMatching(/^prod-1-1$/)]);
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('revertidos'),
      expect.anything()
    );
  });

  it('7 · guard anti re-entrada: doble invocación concurrente de executeSubmit → 1 solo insert', async () => {
    storesBehaviour = { kind: 'hang' };
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-DOUBLE', 'Producto doble');

    let first!: Promise<void>;
    act(() => { first = result.current.executeSubmit().then(() => {}); });
    // Segunda invocación mientras la primera está en curso → ignorada por el guard.
    act(() => { result.current.executeSubmit(); });

    await act(async () => {
      resolveHang?.({ data: { tenant_id: TENANT_A }, error: null });
      await first;
    });

    expect(productsInsertCalls).toHaveLength(1);          // una sola creación
    expect(h.registerMock).toHaveBeenCalledTimes(1);      // una sola recepción
  });

  it('8 · éxito: limpia el borrador (items vacíos) y muestra comprobante', async () => {
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-CLEAN', 'Producto limpio');
    act(() => { result.current.setSupplier('Proveedor Test'); });
    act(() => { result.current.setInvoiceNumber('FAC-RLS-1'); });

    await act(async () => { await result.current.executeSubmit(); });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.supplier).toBe('');
    expect(result.current.invoiceNumber).toBe('');
    expect(result.current.successData.open).toBe(true);
    expect(result.current.successData.receiptId).toBe('REC-TEST-1');
    expect(result.current.successData.newProductsCount).toBe(1);
    // Borrador persistente eliminado tras el registro.
    expect(localStorage.getItem(`reception-draft-${STORE_A}`)).toBeNull();
  });
});
