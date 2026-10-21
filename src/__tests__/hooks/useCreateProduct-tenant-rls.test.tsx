/**
 * Test de regresión — CP-CAT-004 (productos) — misión 2026-10-22.
 *
 * Defecto reportado: admin@demo (rol admin, mismo tenant, membresía activa)
 * recibía «No autorizado» al crear un producto en ENERVIDA-VITALLCONS.
 *
 * Causa raíz verificada en BD viva: useCreateProduct insertaba en `products`
 * SIN `tenant_id`. La única policy de INSERT es products_tenant_insert
 * (migración 20260827000005):
 *   WITH CHECK ((tenant_id = current_user_tenant_id())
 *               AND (store_id = ANY (current_user_store_ids())))
 * `NULL = uuid` → NULL → 42501 «new row violates row-level security policy
 * for table products» → el modal lo mostraba como error de permisos.
 *
 * Fix: resolver tenant_id leyendo stores.tenant_id con el JWT del usuario
 * (canon src/lib/store-tenant.ts, patrón RLS-FIX ya certificado en
 * useReceptionState / useSavePendingReception) e incluirlo en el payload.
 * Fail-closed: tienda ilegible / sin fila / tenant NULL → abort sin INSERT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock, rpc: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('./base', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/hooks/api/base')>();
  return {
    ...orig,
    // El wrapper de logging solo añade telemetría; passthrough directo.
    withTableLogging: (_op: any, _table: any, fn: any) => fn(),
  };
});

import { useCreateProduct, useBulkUpdateProducts } from '@/hooks/api/useProducts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Fixtures ────────────────────────────────────────────────────────────────
const TENANT_A = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';
const STORE_ENERVIDA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

type StoresBehaviour =
  | { kind: 'ok'; tenantId: string }
  | { kind: 'db_error' }
  | { kind: 'no_row' };

let storesBehaviour: StoresBehaviour = { kind: 'ok', tenantId: TENANT_A };

let productsInsertCalls: any[][] = [];
let productsUpsertCalls: any[][] = [];
let productsUpsertError: { message: string; code?: string } | null = null;

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
              if (storesBehaviour.kind === 'no_row') {
                return Promise.resolve({ data: null, error: null });
              }
              return Promise.resolve({ data: { tenant_id: storesBehaviour.tenantId }, error: null });
            },
          }),
        }),
      };
    }
    if (table === 'products') {
      return {
        insert: (payload: any[]) => {
          productsInsertCalls.push(payload);
          return Promise.resolve({
            data: payload.map((p, i) => ({ id: `prod-new-${productsInsertCalls.length}-${i + 1}`, ...p })),
            error: null,
          });
        },
        upsert: (payload: any[]) => {
          productsUpsertCalls.push(payload);
          return Promise.resolve({ data: null, error: productsUpsertError });
        },
      };
    }
    throw new Error(`tabla no mockeada en test: ${table}`);
  });
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const baseProductInput = {
  name: 'Producto Prueba Misión',
  sku: 'PPM-001',
  price: 350,
  cost_price: 200,
  store_id: STORE_ENERVIDA,
  unit_of_measure: 'unidad',
  is_service: false,
};

// ── Tests ───────────────────────────────────────────────────────────────────
describe('useCreateProduct — FIX CP-CAT-004 (RLS products_tenant_insert)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storesBehaviour = { kind: 'ok', tenantId: TENANT_A };
    productsInsertCalls = [];
    productsUpsertCalls = [];
    productsUpsertError = null;
    installSupabaseMocks();
  });

  it('1 · resuelve tenant_id de la BD y lo incluye en el INSERT (raíz del 403/42501)', async () => {
    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(baseProductInput as never);

    // Se leyó el tenant de stores con el store_id del usuario
    expect(h.fromMock).toHaveBeenCalledWith('stores');
    // El INSERT lleva el tenant verificado, no el del cliente
    expect(productsInsertCalls).toHaveLength(1);
    const row = productsInsertCalls[0][0];
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.store_id).toBe(STORE_ENERVIDA);
    expect(row.sku).toBe('PPM-001');
    expect(row.name).toBe('Producto Prueba Misión');
  });

  it('2 · NO confía en el tenant_id enviado por el cliente (lo ignora y usa el de la BD)', async () => {
    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ ...baseProductInput, tenant_id: OTHER_TENANT } as never);

    const row = productsInsertCalls[0][0];
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.tenant_id).not.toBe(OTHER_TENANT);
  });

  it('3 · fail-closed: tienda ilegible (error de BD) → aborta SIN insert y con error claro', async () => {
    storesBehaviour = { kind: 'db_error' };
    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync(baseProductInput as never)).rejects.toThrow(
      /No se pudo verificar la tienda activa para crear productos/i,
    );
    expect(productsInsertCalls).toHaveLength(0);
  });

  it('4 · fail-closed: tienda inexistente o sin tenant_id → aborta SIN insert', async () => {
    storesBehaviour = { kind: 'no_row' };
    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync(baseProductInput as never)).rejects.toThrow(
      /No se pudo verificar la tienda activa para crear productos/i,
    );
    expect(productsInsertCalls).toHaveLength(0);
  });

  it('5 · fail-closed: sin tienda activa → error inmediato, ni siquiera consulta stores', async () => {
    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ ...baseProductInput, store_id: undefined } as never),
    ).rejects.toThrow(/No hay una tienda activa seleccionada/i);
    expect(h.fromMock).not.toHaveBeenCalled();
    expect(productsInsertCalls).toHaveLength(0);
  });

  it('6 · si la RLS rechaza igualmente (42501), el error se propaga (no se traga)', async () => {
    h.fromMock.mockImplementation((table: string) => {
      if (table === 'stores') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { tenant_id: TENANT_A }, error: null }),
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          insert: (payload: any[]) => {
            productsInsertCalls.push(payload);
            return Promise.resolve({
              data: null,
              error: { message: 'new row violates row-level security policy for table "products"', code: '42501' },
            });
          },
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    });

    const { result } = renderHook(() => useCreateProduct(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync(baseProductInput as never)).rejects.toThrow(/row-level security/);
  });
});

describe('useBulkUpdateProducts — FIX CP-CAT-004 (upsert con tenant verificado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storesBehaviour = { kind: 'ok', tenantId: TENANT_A };
    productsInsertCalls = [];
    productsUpsertCalls = [];
    productsUpsertError = null;
    installSupabaseMocks();
  });

  it('7 · el upsert incluye tenant_id resuelto de la BD en cada fila', async () => {
    const { result } = renderHook(() => useBulkUpdateProducts(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      storeId: STORE_ENERVIDA,
      products: [
        { store_id: STORE_ENERVIDA, sku: 'A-1', name: 'Producto A', cost_price: 10, price: 20 },
        { store_id: STORE_ENERVIDA, sku: 'B-2', name: 'Producto B', cost_price: 5, price: 8 },
      ],
    } as never);

    expect(productsUpsertCalls).toHaveLength(1);
    const rows = productsUpsertCalls[0];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A);
      expect(row.store_id).toBe(STORE_ENERVIDA);
    }
  });

  it('8 · fail-closed: tienda ilegible en upsert → aborta SIN escribir filas', async () => {
    storesBehaviour = { kind: 'db_error' };
    const { result } = renderHook(() => useBulkUpdateProducts(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({
        storeId: STORE_ENERVIDA,
        products: [{ store_id: STORE_ENERVIDA, sku: 'A-1', name: 'Producto A', cost_price: 10, price: 20 }],
      } as never),
    ).rejects.toThrow(/No se pudo verificar la tienda activa para crear productos/i);
    expect(productsUpsertCalls).toHaveLength(0);
  });

  it('9 · error de la BD en el upsert se propaga (no se traga)', async () => {
    productsUpsertError = { message: 'conflict key', code: '23505' };
    const { result } = renderHook(() => useBulkUpdateProducts(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({
        storeId: STORE_ENERVIDA,
        products: [{ store_id: STORE_ENERVIDA, sku: 'A-1', name: 'Producto A', cost_price: 10, price: 20 }],
      } as never),
    ).rejects.toThrow(/conflict key/);
  });
});
