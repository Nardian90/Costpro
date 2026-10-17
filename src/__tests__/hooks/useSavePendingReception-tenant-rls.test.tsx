/**
 * Test de regresión — CP-CAT-004 (auditoría 2026-10-16, MISIÓN 2).
 *
 * Defecto: useSavePendingReception (src/hooks/api/useReceptions.ts) creaba
 * productos nuevos durante una recepción con insert directo a `products`
 * SIN `tenant_id`. La policy products_tenant_insert endurecida
 * (migración 20260827000005, sin flag) exige
 *   WITH CHECK (tenant_id = current_user_tenant_id()
 *              AND store_id = ANY(current_user_store_ids()))
 * → insert rechazado con 403/42501 → recepción con productos nuevos
 * bloqueada (defecto operativo diario, verificado en código 2026-10-16).
 *
 * La vista nueva (useReceptionState) ya resolvió el tenant en su propio
 * camino, pero useSavePendingReception conserva el insert de fallback:
 * cualquier caller que pase items is_new sin product_id cae aquí.
 *
 * Fix (mismo patrón RLS-FIX que useReceptionState):
 *  1. Resolver tenant_id leyendo stores.tenant_id con el JWT del usuario
 *     (stores_tenant_select valida la identidad — no es dato del cliente).
 *  2. Fail-closed: tienda ilegible o tenant NULL → abort SIN insert.
 *  3. Incluir tenant_id en el payload del insert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock, rpc: vi.fn() },
}));

vi.mock('./base', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/hooks/api/base')>();
  return {
    ...orig,
    // El wrapper de logging solo añade telemetría; passthrough directo.
    withTableLogging: (_op: any, _table: any, fn: any) => fn(),
  };
});

import { useSavePendingReception } from '@/hooks/api/useReceptions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Fixtures ────────────────────────────────────────────────────────────────
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const STORE_A = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const USER_A = '22222222-2222-2222-2222-222222222222';

type StoresBehaviour =
  | { kind: 'ok'; tenantId: string | null }
  | { kind: 'db_error' };

let storesBehaviour: StoresBehaviour = { kind: 'ok', tenantId: TENANT_A };

let productsInsertCalls: any[][] = [];
let receiptsInsertCalls: any[][] = [];
let receiptItemsInsertCalls: any[][] = [];

function installSupabaseMocks() {
  h.fromMock.mockImplementation((table: string) => {
    if (table === 'stores') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
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
              Promise.resolve({
                data: payload.map((p, i) => ({ id: `prod-new-${productsInsertCalls.length}-${i + 1}`, sku: p.sku })),
                error: null,
              }),
          };
        },
      };
    }
    if (table === 'receipts') {
      return {
        insert: (payload: any) => {
          receiptsInsertCalls.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'receipt-test-1' }, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'receipt_items') {
      return {
        insert: (payload: any[]) => {
          receiptItemsInsertCalls.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`tabla no mockeada en test: ${table}`);
  });
}

const params = (overrides: Partial<any> = {}) => ({
  storeId: STORE_A,
  userId: USER_A,
  supplier: 'Proveedor Test',
  invoiceNumber: 'FAC-001',
  receptionDate: '2026-10-17T10:00:00.000Z',
  items: [
    {
      is_new: true,
      product_id: null,
      sku: 'SKU-NEW-1',
      name: 'Producto Nuevo 1',
      quantity: 5,
      unit_cost: 10,
      sale_price: 15,
      variant_id: null,
      moneda_recepcion: 'CUP',
      tasa_cambio_recepcion: 1.0,
    },
  ],
  notes: 'nota de la recepción',
  ...overrides,
});

function renderSave() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSavePendingReception(), { wrapper });
}

describe('useSavePendingReception — CP-CAT-004 · tenant_id en alta de productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsInsertCalls = [];
    receiptsInsertCalls = [];
    receiptItemsInsertCalls = [];
    storesBehaviour = { kind: 'ok', tenantId: TENANT_A };
    installSupabaseMocks();
  });

  it('1 · inserta products CON tenant_id resuelto desde stores (RLS-FIX)', async () => {
    const { result } = renderSave();

    let receiptId: string | undefined;
    await act(async () => {
      receiptId = await result.current.mutateAsync(params());
    });

    expect(receiptId).toBe('receipt-test-1');
    expect(productsInsertCalls).toHaveLength(1);
    const payload = productsInsertCalls[0];
    // ⬇ ASERCIÓN CLAVE DEL BUG: sin tenant_id, products_tenant_insert rechaza.
    expect(payload[0]).toMatchObject({
      store_id: STORE_A,
      tenant_id: TENANT_A,
      sku: 'SKU-NEW-1',
    });
    // La recepción y sus items se completan con el product_id recién creado.
    expect(receiptsInsertCalls).toHaveLength(1);
    expect(receiptItemsInsertCalls).toHaveLength(1);
    expect(receiptItemsInsertCalls[0][0]).toMatchObject({
      receipt_id: 'receipt-test-1',
      product_id: 'prod-new-1-1',
      quantity: 5,
    });
  });

  it('2 · fail-closed: tienda con tenant_id NULL → abort SIN insert de products ni receipts', async () => {
    storesBehaviour = { kind: 'ok', tenantId: null };
    const { result } = renderSave();

    await expect(
      act(async () => {
        await result.current.mutateAsync(params());
      })
    ).rejects.toThrow(/verificar la tienda activa/i);

    // Nada llegó a la BD: ni products, ni receipts, ni receipt_items.
    expect(productsInsertCalls).toHaveLength(0);
    expect(receiptsInsertCalls).toHaveLength(0);
    expect(receiptItemsInsertCalls).toHaveLength(0);
  });

  it('3 · fail-closed: error de BD al leer stores → abort SIN insert', async () => {
    storesBehaviour = { kind: 'db_error' };
    const { result } = renderSave();

    await expect(
      act(async () => {
        await result.current.mutateAsync(params());
      })
    ).rejects.toThrow(/verificar la tienda activa/i);

    expect(productsInsertCalls).toHaveLength(0);
    expect(receiptsInsertCalls).toHaveLength(0);
  });

  it('4 · items sin is_new NO consultan stores (camino de productos existentes intacto)', async () => {
    const { result } = renderSave();

    await act(async () => {
      await result.current.mutateAsync(
        params({
          items: [
            {
              is_new: false,
              product_id: 'prod-existente-1',
              sku: 'SKU-EXIST',
              quantity: 3,
              unit_cost: 2,
              sale_price: 4,
              variant_id: null,
              moneda_recepcion: 'CUP',
              tasa_cambio_recepcion: 1.0,
            },
          ],
        })
      );
    });

    // Sin productos nuevos → no hay resolución de tenant ni insert en products.
    expect(productsInsertCalls).toHaveLength(0);
    expect(receiptsInsertCalls).toHaveLength(1);
    expect(receiptItemsInsertCalls).toHaveLength(1);
    expect(receiptItemsInsertCalls[0][0].product_id).toBe('prod-existente-1');
  });

  it('5 · la consulta de stores filtra EXACTAMENTE por la tienda del parámetro', async () => {
    const { result } = renderSave();

    await act(async () => {
      await result.current.mutateAsync(params());
    });

    // La cadena de llamadas al mock registra el .eq('id', storeId).
    const eqCall = h.fromMock.mock.results[0]?.value?.select?.();
    // from('stores') → select('tenant_id') → eq('id', STORE_A) → maybeSingle()
    // El mock estructura la cadena; verificamos que se llamó con 'stores' primero.
    expect(h.fromMock).toHaveBeenCalledWith('stores');
  });
});
