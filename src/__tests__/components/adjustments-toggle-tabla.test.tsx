/**
 * MISIÓN 2026-11-07 — Ajustes Documentales · toggle tabla/tarjetas + truncado
 * ===========================================================================
 * La vista solo tenía tarjetas. Ahora implementa el MISMO patrón que Vales de
 * Salida (toggle con preferencia persistida) y las descripciones largas ya no
 * ensanchan la tabla (truncado + tooltip con el contenido completo).
 *
 * Verifica (misión §8.C):
 *  - El toggle funciona en ambos sentidos y persiste el modo.
 *  - Los datos y acciones son equivalentes entre tabla y tarjetas.
 *  - Las descripciones largas van truncadas con tooltip (title).
 *  - Los filtros/búsqueda se conservan al cambiar de vista.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryAdjustmentsView from '@/components/views/terminal/views/inventory/InventoryAdjustmentsView';

beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});

const AJUSTES = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    store_id: 'store-1',
    status: 'pending',
    reason: 'DAMAGED_GOODS',
    notes: 'Descripción extremadamente larga del ajuste documental que históricamente ensanchaba toda la tabla y obligaba a desplazarse horizontalmente para poder leer el contenido completo del registro',
    created_at: '2026-11-05T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
    confirmed_at: null,
    reversed_at: null,
    reversal_reason: null,
    source_physical_inventory_id: null,
    source_physical_inventory: null,
    items: [
      { id: 'i-1', adjustment_id: 'a-1', product_id: 'p-1', expected_quantity: 10, counted_quantity: 8, products: { name: 'Cable Solar 4mm', sku: '87' } },
    ],
    creator: { full_name: 'Ana Torres' },
  },
];

function chain(result: { data: unknown; error: unknown | null } = { data: AJUSTES, error: null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'order', 'in', 'neq', 'gte', 'lte']) {
    c[m] = vi.fn(() => c);
  }
  for (const m of ['limit', 'range', 'single']) {
    c[m] = vi.fn(() => terminal());
  }
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

const fromMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    fullName: 'Ana Torres',
    activeStoreId: 'store-1',
    memberships: [
      { store_id: 'store-1', role: 'admin', status: 'active', store: { name: 'Almacén Central' } },
    ],
  },
}));
vi.mock('@/store', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useAuthStore: (sel?: (s: unknown) => unknown) =>
      sel ? sel({ user: authState.user }) : { user: authState.user },
  };
});

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InventoryAdjustmentsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  fromMock.mockReset().mockImplementation(() => chain());
});

describe('InventoryAdjustmentsView — toggle tabla/tarjetas (misión 2026-11-07)', () => {
  it('por defecto tarjetas; el toggle pasa a tabla y persiste la preferencia', async () => {
    renderView();
    await waitFor(() => expect(screen.getAllByText(/DAMAGED_GOODS|Descripción extrema/).length).toBeGreaterThan(0));
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Descripción / motivo' })).toBeTruthy();
    expect(window.localStorage.getItem('ajustes_documentales_view_mode')).toBe('table');

    // Vuelta a tarjetas (ambos sentidos)
    fireEvent.click(screen.getByRole('button', { name: 'Modo tarjetas' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(window.localStorage.getItem('ajustes_documentales_view_mode')).toBe('cards');
  });

  it('modo preferido restaurado desde localStorage', async () => {
    window.localStorage.setItem('ajustes_documentales_view_mode', 'table');
    renderView();
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('equivalencia de datos y acciones entre tabla y tarjetas', async () => {
    renderView();
    await waitFor(() => expect(screen.getAllByText(/DAMAGED_GOODS|Descripción extrema/).length).toBeGreaterThan(0));

    // Tarjetas: contador de acciones del ajuste pendiente (SC-2-16, ver, anular, confirmar, duplicar)
    const btnCards = screen.getAllByTitle('Confirmar ajuste (aplica al inventario)').length;
    expect(screen.getAllByTitle('Exportar como modelo oficial SC-2-16 Ajuste de Inventario (PDF)').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByTitle('Confirmar ajuste (aplica al inventario)').length).toBe(btnCards);
    expect(screen.getAllByTitle('Exportar como modelo oficial SC-2-16 Ajuste de Inventario (PDF)').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Duplicar ajuste').length).toBeGreaterThan(0);
  });

  it('descripción larga truncada con tooltip (no ensancha la tabla ni fuerza scroll)', async () => {
    renderView();
    await waitFor(() => expect(screen.getAllByText(/DAMAGED_GOODS|Descripción extrema/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));

    const celda = screen.getByTitle(/Descripción extremadamente larga/);
    expect(celda).toBeTruthy();
    // Truncado activo y ancho acotado: la celda nunca fuerza el ancho de la tabla.
    expect(celda.className).toContain('truncate');
    expect(celda.closest('td')?.className).toContain('max-w-[280px]');
  });

  it('los filtros y la búsqueda se conservan al cambiar de vista', async () => {
    renderView();
    await waitFor(() => expect(screen.getAllByText(/DAMAGED_GOODS|Descripción extrema/).length).toBeGreaterThan(0));

    // Buscar algo que NO coincide → vacía
    const search = screen.getByPlaceholderText('Buscar por motivo o nota...') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'zzz-sin-coincidencia' } });
    expect(screen.getByText('No hay ajustes documentales')).toBeTruthy();

    // Cambiar de vista mantiene el filtro activo (sigue vacía en tabla)
    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    expect(screen.getByText('No hay ajustes documentales')).toBeTruthy();
  });
});
