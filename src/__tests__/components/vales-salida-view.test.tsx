/**
 * ValesSalidaView — Tests del centro documental PROFESIONAL de Vales de Salida.
 *
 * Contrato verificado (brief de profesionalización PR #1381 + modelo REAL
 * issue_slips):
 *   1. Render: breadcrumb, header, botón «Crear Vale de Salida», listado RLS-scoped
 *      con paginación .range() («Cargar más» real, no limit(100) silencioso).
 *   2. Matriz de acciones por estado REAL (no existe borrador):
 *        completed  → [Ver] + [Devolver]
 *        reversed   → [Ver] únicamente
 *        voided     → [Ver] únicamente
 *   3. CREAR (requisito 1): abre el MODAL DEDICADO del módulo (no navega a
 *      'pos', no toca el carrito). La emisión usa el endpoint existente.
 *   4. VER (requisito 7/8): abre el documento real VALE DE SALIDA (encabezado
 *      documental + productos + trazabilidad + movimientos del vale).
 *   5. Modo tabla: toggle visible y persistido (requisito 5/6).
 *   6. Devolver: modal pide motivo (mín 3) → POST al endpoint EXISTENTE
 *      /api/vale-salida/[id]/reverse → invalida queries de la vista.
 *   7. Sin tienda activa → mensaje explícito (no consulta).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ValesSalidaView from '@/components/views/terminal/views/inventory/ValesSalidaView';
import {
  DocumentStatusBadge,
  canReverse,
  isTerminalStatus,
} from '@/components/ui/DocumentStatusBadge';

// ── Polyfills jsdom (mismos que inventory-row-actions.test.tsx) ──
beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (!(window as unknown as Record<string, unknown>).PointerEvent) {
    (window as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
      pointerId = 1; pointerType = 'mouse'; isPrimary = true;
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// ── Fixtures: 3 vales, uno por estado REAL ──
const VALES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    slip_number: 'VS-000001-2026',
    status: 'completed',
    notes: 'Consumo interno taller',
    total_cost: 150,
    created_by: 'u-2',
    created_at: '2026-10-01T10:00:00Z',
    voided_at: null, voided_by: null, void_reason: null,
    store_id: 'store-1', production_order_id: null,
    creator: { full_name: 'Ana Torres' },
    items: [
      { id: 'i-1', product_id: 'p-1', variant_id: null, production_order_item_id: null, quantity: 3, unit_cost: 50, total_cost: 150, products: { name: 'Tornillo M8', sku: 'SKU-001', unit_of_measure: 'UN' } },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    slip_number: 'VS-000002-2026',
    status: 'reversed',
    notes: 'Merma devuelta',
    total_cost: 40,
    created_by: 'u-2',
    created_at: '2026-10-02T11:00:00Z',
    voided_at: '2026-10-03T12:00:00Z', voided_by: 'u-3', void_reason: 'Emitido por error',
    store_id: 'store-1', production_order_id: null,
    creator: { full_name: 'Ana Torres' },
    voider: { full_name: 'Luis Vega' },
    items: [
      { id: 'i-2', product_id: 'p-2', variant_id: null, production_order_item_id: null, quantity: 2, unit_cost: 20, total_cost: 40, products: { name: 'Pintura Blanca', sku: null, unit_of_measure: 'GL' } },
    ],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    slip_number: 'VS-000003-2026',
    status: 'voided',
    notes: 'Vale anulado (estado defensivo)',
    total_cost: 10,
    created_by: 'u-2',
    created_at: '2026-10-04T10:00:00Z',
    voided_at: '2026-10-05T10:00:00Z', voided_by: 'u-3', void_reason: 'n/a',
    store_id: 'store-1', production_order_id: null,
    creator: { full_name: 'Ana Torres' },
    items: [],
  },
];

/** Movimientos del vale VS-000002 (stock_movements.reference_id = issue_slips.id). */
const MOVIMIENTOS = [
  {
    id: 'm-1',
    created_at: '2026-10-02T11:00:01Z',
    movement_type: 'issue_slip_out',
    quantity_change: -2,
    reference_doc: 'Vale de Salida VS-000002-2026',
    product: { name: 'Pintura Blanca', sku: null, unit_of_measure: 'GL' },
  },
  {
    id: 'm-2',
    created_at: '2026-10-03T12:00:01Z',
    movement_type: 'issue_slip_reverse',
    quantity_change: 2,
    reference_doc: 'Vale de Salida VS-000002-2026 (reversión)',
    product: { name: 'Pintura Blanca', sku: null, unit_of_measure: 'GL' },
  },
];

// ── MOCK: supabase client — cadena thenable genérica con dispatch por tabla ──
const fromMock = vi.fn();

function chain(result: { data: unknown; error: unknown | null } = { data: VALES, error: null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'order', 'in', 'neq', 'gte', 'lte']) {
    c[m] = vi.fn(() => c);
  }
  for (const m of ['limit', 'range', 'single']) {
    c[m] = vi.fn(() => terminal());
  }
  // thenable: cualquier final de cadena awaits correctamente
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// ── MOCK: useProducts (catálogo del POS — usado por el flujo dedicado) ──
const PRODUCTOS = [
  {
    id: 'aaaaaaaa-1111-1111-1111-111111111111',
    name: 'Tornillo M8',
    sku: 'SKU-001',
    unit_of_measure: 'UN',
    stock_current: 50,
    cost_average: 10,
  },
  {
    id: 'aaaaaaaa-2222-2222-2222-222222222222',
    name: 'Pintura Blanca',
    sku: 'SKU-002',
    unit_of_measure: 'GL',
    stock_current: 0,
    cost_average: 20,
  },
];

const useProductsMock = vi.fn(() => ({ data: PRODUCTOS, isLoading: false }));
vi.mock('@/hooks/api/useProducts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useProducts: () => useProductsMock() };
});

// ── MOCK: auth/ui stores (usuario mutable vía vi.hoisted) ──
const mockSetCurrentView = vi.fn();
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
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

// ── MOCK: apiFetch (endpoints de reversión y emisión EXISTENTES) ──
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// ── MOCK: sonner toasts ──
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ValesSalidaView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'stock_movements') return chain({ data: MOVIMIENTOS, error: null });
    if (table === 'production_orders' || table === 'production_order_items') {
      return chain({ data: [], error: null });
    }
    return chain();
  });
  apiFetchMock.mockReset();
  mockSetCurrentView.mockReset();
});

describe('ValesSalidaView — render y listado', () => {
  it('1 · header con título exacto, contador, botón Crear y SIN breadcrumb local duplicado', async () => {
    renderView();
    // FIX duplicado: el breadcrumb de ubicación lo renderiza el shell global
    // (NavigationBreadcrumb). La vista NO debe renderizar su copia interna
    // «Ubicación actual» (evidencia del usuario: ruta duplicada en pantalla).
    expect(screen.queryByLabelText('Ubicación actual')).toBeNull();
    expect(screen.queryByText('INICIO')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Vales de Salida' })).toBeTruthy();
    const createBtn = screen.getByRole('button', { name: /Crear Vale de Salida/i });
    expect(createBtn).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('VS-000001-2026')).toBeTruthy();
      expect(screen.getByText('VS-000002-2026')).toBeTruthy();
    });
    expect(screen.getByText(/3 vale\(s\)/)).toBeTruthy();
  });

  it('2 · consulta RLS-scoped a issue_slips de la tienda activa (range paginado, desc)', async () => {
    renderView();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('issue_slips'));
    const c = fromMock.mock.results[0]?.value;
    expect(c.select).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('store_id', 'store-1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    // Paginación real «Cargar más» — ya no limit(100) silencioso
    expect(c.range).toHaveBeenCalledWith(0, 49);
  });

  it('3 · badge por estado: Completado / Devuelto / Anulado', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000003-2026')).toBeTruthy());
    expect(screen.getByText('Completado')).toBeTruthy();
    expect(screen.getByText('Devuelto')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();
  });
});

describe('ValesSalidaView — matriz de acciones (estados REALES)', () => {
  it('4 · completed → botón Devolver visible con aria-label del número y ETIQUETA visible (fix contraste)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000001-2026')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' })).toBeTruthy();
    // FIX visibilidad: los botones de acción llevan etiqueta de texto además
    // del icono (antes icon-only outline casi invisible — evidencia usuario).
    expect(screen.getAllByText('Ver').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Devolver').length).toBeGreaterThanOrEqual(1);
  });

  it('5 · reversed y voided → SIN botón Devolver (matriz: solo Ver)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000002-2026')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Devolver vale VS-000002-2026' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver vale VS-000003-2026' })).toBeNull();
  });
});

describe('ValesSalidaView — CREAR abre el flujo DEDICADO del módulo', () => {
  it('6 · click en Crear abre el modal dedicado (sin navegar a Vender ni tocar el carrito)', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Crear Vale de Salida/i }));

    const dialog = await screen.findByRole('dialog', { name: /Crear Vale de Salida/i });
    expect(dialog).toBeTruthy();
    // Cabecera documental del flujo dedicado
    expect(screen.getByText(/se asignará al emitir/i)).toBeTruthy();
    expect(screen.getByText('Almacén Central')).toBeTruthy();
    // CERO navegación a Vender / carrito (requisito 1 del brief)
    expect(mockSetCurrentView).not.toHaveBeenCalled();
  });
});

describe('ValesSalidaView — VER muestra el DOCUMENTO REAL', () => {
  it('7 · Ver abre VALE DE SALIDA con productos, trazabilidad y movimientos del vale', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000002-2026')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Ver vale VS-000002-2026' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Vale de Salida');
    expect(dialog.textContent).toContain('VS-000002-2026');

    // Productos del documento con unidad REAL
    await waitFor(() => expect(screen.getByText('Pintura Blanca')).toBeTruthy());
    // Match EXACTO de la celda de cantidad ("2 GL"); evita colisión con
    // "+2 GL" / "−2 GL" de la lista de movimientos.
    expect(screen.getByText('2 GL')).toBeTruthy();

    // Trazabilidad documental (devolución con motivo)
    expect(screen.getByText('Devuelto por')).toBeTruthy();
    expect(screen.getByText('Luis Vega')).toBeTruthy();
    expect(screen.getByText(/Emitido por error/)).toBeTruthy();

    // Movimientos del vale (Documento ↔ Movimiento vía reference_id)
    await waitFor(() => expect(screen.getByText('Movimientos de inventario')).toBeTruthy());
    expect(screen.getByText('Vale de salida')).toBeTruthy();   // etiqueta dict central
    expect(screen.getByText('Reverso de vale')).toBeTruthy();  // issue_slip_reverse
  });

  it('8 · Ver funciona incluso con vale sin items (antes quedaba sin detalle)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000003-2026')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ver vale VS-000003-2026' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('VS-000003-2026');
    expect(screen.getByText(/no tiene líneas de producto/i)).toBeTruthy();
  });
});

describe('ValesSalidaView — Devolver usa el endpoint EXISTENTE', () => {
  it('9 · modal pide motivo, disabled < 3 chars, POST a /api/vale-salida/[id]/reverse', async () => {
    renderView();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' }));

    const modal = await screen.findByRole('dialog');
    expect(modal).toBeTruthy();
    expect(screen.getByText('Devolver Vale de Salida')).toBeTruthy();

    const submit = screen.getByRole('button', { name: /Devolver Vale$/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Motivo de la devolución/i), 'Emitido por error en el pedido');
    expect(submit).toBeEnabled();

    apiFetchMock.mockResolvedValueOnce({ status: 'success', slip_id: '11111111-1111-1111-1111-111111111111', slip_number: 'VS-000001-2026', new_status: 'reversed' });
    await user.click(submit);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/vale-salida/11111111-1111-1111-1111-111111111111/reverse',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const [, opts] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(String(opts.body))).toEqual({ reason: 'Emitido por error en el pedido' });
    // Modal cierra tras éxito
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('10 · error del backend queda visible en el modal (no cierra)', async () => {
    renderView();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' }));

    await user.type(screen.getByLabelText(/Motivo de la devolución/i), 'Motivo válido aquí');
    apiFetchMock.mockRejectedValueOnce(new Error('El vale no está en estado reversible'));
    await user.click(screen.getByRole('button', { name: /Devolver Vale$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/no está en estado reversible/i)).toBeTruthy();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('ValesSalidaView — modo tabla (requisito 5/6)', () => {
  it('11 · toggle a modo tabla renderiza tabla densa con columnas y orden', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000001-2026')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Documento' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Fecha/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Concepto' })).toBeTruthy();
    // Orden por fecha (aria-sort)
    expect(screen.getByRole('columnheader', { name: /Fecha/ }).getAttribute('aria-sort')).toBe('descending');
    // Persistencia del modo
    expect(window.localStorage.getItem('vales_salida_view_mode')).toBe('table');
  });
});

describe('ValesSalidaView — sin tienda activa', () => {
  it('12 · sin activeStoreId no consulta y muestra guía', async () => {
    const withStore = authState.user;
    authState.user = { ...withStore, activeStoreId: '' } as typeof withStore;
    try {
      renderView();
      await waitFor(() => expect(screen.getByText('Sin tienda activa')).toBeTruthy());
      expect(fromMock).not.toHaveBeenCalled();
    } finally {
      authState.user = withStore;
    }
  });
});

describe('DocumentStatusBadge — tipo issue_slip', () => {
  it('13 · labels correctos por estado y helper canReverse/isTerminal', () => {
    render(<DocumentStatusBadge type="issue_slip" status="completed" />);
    expect(screen.getByText('Completado')).toBeTruthy();
    cleanup();

    render(<DocumentStatusBadge type="issue_slip" status="reversed" />);
    expect(screen.getByText('Devuelto')).toBeTruthy();
    cleanup();

    render(<DocumentStatusBadge type="issue_slip" status="voided" />);
    expect(screen.getByText('Anulado')).toBeTruthy();
    cleanup();

    // Matriz normativa: solo 'completed' es devolvible; reversed/voided terminales
    expect(canReverse('issue_slip', 'completed')).toBe(true);
    expect(canReverse('issue_slip', 'reversed')).toBe(false);
    expect(canReverse('issue_slip', 'voided')).toBe(false);
    expect(canReverse('issue_slip', 'draft')).toBe(false); // no existe borrador
    expect(isTerminalStatus('issue_slip', 'reversed')).toBe(true);
    expect(isTerminalStatus('issue_slip', 'voided')).toBe(true);
    expect(isTerminalStatus('issue_slip', 'completed')).toBe(false);
  });

  it('14 · estado desconocido → badge crudo defensivo (no inventa estados)', () => {
    render(<DocumentStatusBadge type="issue_slip" status="weird_state" />);
    expect(screen.getByText('weird_state')).toBeTruthy();
  });
});
