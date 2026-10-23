/**
 * devolutions-fecha.test.tsx — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Pruebas del selector de fecha operativa de «Nueva Devolución» (gap del
 * informe del PR #1422 §10.5 — la API soportaba operation_date desde esa
 * misión pero la UI nunca lo exponía):
 *   - El modal renderiza «Fecha de la devolución» con max = HOY (Habana) y
 *     min per-store (forward-only).
 *   - Default HOY → NO se envía operation_date (NOW() canónico del servidor).
 *   - Fecha ≠ hoy → se envía operation_date al MEDIODÍA local
 *     (resolvePosOperationDate, misma convención de Vender/Catálogo/Vales).
 *   - La preferencia de trabajo del usuario (si válida) es el default.
 *   - Una preferencia caducada NO bloquea: el default sigue siendo HOY.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import { useWorkDatePrefsStore } from '@/store/work-date-prefs';

const MIN_ISO = '2026-10-14T16:00:00+00:00'; // doc previo de la tienda (día 14 Habana)

vi.mock('@/hooks/api/useGlobalOperationDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/api/useGlobalOperationDate')>();
  return {
    ...actual,
    useGlobalOperationDate: () => ({
      data: { maxDate: MIN_ISO, maxDateFormatted: '14/10/2026 12:00', minAllowedDate: MIN_ISO },
      isLoading: false,
    }),
  };
});

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'u1', fullName: 'Tester', activeStoreId: 'store-1' } }),
  useUIStore: () => ({ setCurrentView: vi.fn() }),
  useCartStore: () => ({
    items: [],
    saleDate: null,
    setSaleDate: vi.fn(),
    addItem: vi.fn(),
    clearCart: vi.fn(),
    storeId: 'store-1',
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [string, RequestInit])),
}));

// MISIÓN CAJA v2.24.0 (§8-C): la devolución EXIGE venta original vinculada
// (el RPC create_devolution_v2 la rechaza sin ella y el botón «Crear
// Devolución» permanece deshabilitado). searchSales consulta
// supabase.from('transactions') con builder encadenable + thenable: mock
// mínimo que devuelve 1 venta completada para poder vincularla.
const saleSearch = vi.hoisted(() => {
  const ORIGINAL_SALE = {
    id: '9d2e0f6a-1111-4222-8333-444455556666',
    invoice_number: 'FA-2026-0042',
    total_amount: 100,
    customer_name: 'Cliente Mostrador',
    sale_currency: 'CUP',
    created_at: '2026-10-20T17:00:00+00:00',
  };
  function saleQueryChain() {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => api,
      ilike: () => api,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: [ORIGINAL_SALE], error: null }).then(res, rej),
    };
    return api;
  }
  return { ORIGINAL_SALE, saleQueryChain };
});
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (_table: string) => saleSearch.saleQueryChain() },
}));

// Buscador de productos: devuelve 1 producto real para poder armar la devolución.
apiFetchMock.mockImplementation(async (url: string) => {
  if (url.includes('/api/inventory/products')) {
    return { data: [{ id: 'p1', name: 'Producto Prueba', price: 100 }] };
  }
  return { success: true };
});

import { DevolutionsView } from '@/components/views/terminal/views/devolutions/DevolutionsView';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function localStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: () => store.clear(),
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DevolutionsView />
    </QueryClientProvider>,
  );
}

async function openCreateModal() {
  fireEvent.click(await screen.findByRole('button', { name: /Nueva Devolución/i }));
  // El modal es un div fijo sin role="dialog": esperar por su encabezado.
  await screen.findByText('Nueva Devolución', { selector: 'h2' });
}

async function fillMinimumFields() {
  fireEvent.change(screen.getByPlaceholderText('Ej: Producto defectuoso'), { target: { value: 'Producto defectuoso' } });
  // MISIÓN CAJA v2.24: vincular la VENTA ORIGINAL (obligatoria — sin ella el
  // botón «Crear Devolución» queda deshabilitado y el submit nunca dispara
  // el POST; ver devolutions-fecha suite tras el endurecimiento v2.24).
  fireEvent.change(screen.getByPlaceholderText('Nº de factura o ID de la venta…'), { target: { value: 'FA-2026' } });
  fireEvent.click((await screen.findByText('FA-2026-0042')).closest('button')!);
  // Agregar 1 producto (submit exige motivo + ≥1 item).
  fireEvent.change(screen.getByPlaceholderText('Nombre del producto...'), { target: { value: 'Producto' } });
  const productoBtn = await screen.findByText('Producto Prueba', { selector: 'button span' });
  fireEvent.click(productoBtn.closest('button')!);
}

describe('DevolutionsView — selector de fecha (misión fechas de trabajo)', () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal('localStorage', localStorageMock());
    useWorkDatePrefsStore.setState({ scope: null, prefs: {} });
    apiFetchMock.mockClear();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/inventory/products')) {
        return { data: [{ id: 'p1', name: 'Producto Prueba', price: 100 }] };
      }
      return { success: true };
    });
  });

  it('renderiza «Fecha de la devolución» con max = HOY (Habana)', async () => {
    renderView();
    await openCreateModal();
    const input = screen.getByLabelText(/Fecha de la devolución/i) as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe(todayBusinessDay());
    expect(input.max).toBe(todayBusinessDay());
    expect(input.min).toBe('2026-10-14'); // día de negocio del mínimo per-store
  });

  it('default HOY → NO envía operation_date (NOW() canónico)', async () => {
    renderView();
    await openCreateModal();
    await fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /Crear Devolución/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    )!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.operation_date).toBeUndefined();
    // REVISIÓN FINAL v2.24.1: idempotencia cooperativa — clave estable por
    // apertura del modal (el RPC v2.24.1 la compara contra el registry).
    expect(body.idempotency_key).toMatch(/^dev-/);
  });

  it('fecha ≠ hoy → envía operation_date al mediodía local', async () => {
    renderView();
    await openCreateModal();
    await fillMinimumFields();
    const input = screen.getByLabelText(/Fecha de la devolución/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-10-16' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Devolución/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    )!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.operation_date).toBe(new Date('2026-10-16T12:00:00').toISOString());
  });

  it('la preferencia de trabajo válida del usuario es el default del selector', async () => {
    localStorage.setItem(
      'costpro:work-date-pref:u1:store-1',
      JSON.stringify({ devolution: '2026-10-16' }),
    );
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { devolution: '2026-10-16' } });
    renderView();
    await openCreateModal();
    const input = screen.getByLabelText(/Fecha de la devolución/i) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('2026-10-16'));
  });

  it('una preferencia caducada (bajo el mínimo) NO bloquea: default sigue HOY', async () => {
    // El mínimo per-store del mock es 14/10 → una preferencia del 10/10 caducó.
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { devolution: '2026-10-10' } });
    renderView();
    await openCreateModal();
    const input = screen.getByLabelText(/Fecha de la devolución/i) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe(todayBusinessDay()));
  });
});
