/**
 * ValesSalidaView — Tests del centro documental de Vales de Salida.
 *
 * Contrato verificado (brief VALES DE SALIDA + modelo REAL issue_slips):
 *   1. Render: header, botón "+ Crear Vale de Salida", listado RLS-scoped.
 *   2. Matriz de acciones por estado REAL (no existe borrador):
 *        completed  → [Ver] + [Devolver]
 *        reversed   → [Ver] únicamente
 *        voided     → [Ver] únicamente
 *   3. Crear: activa el MODO VALE del carrito existente (setOperationType
 *      'issue_slip') y navega a 'pos' — cero formulario duplicado.
 *   4. Devolver: modal pide motivo (mín 3) → POST al endpoint EXISTENTE
 *      /api/vale-salida/[id]/reverse → invalida queries de la vista.
 *   5. Estado desconocido → badge crudo (defensivo, no inventa estados).
 *   6. Sin tienda activa → mensaje explícito (no consulta).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ValesSalidaView from '@/components/views/terminal/views/inventory/ValesSalidaView';
import { DocumentStatusBadge, canReverse, isTerminalStatus } from '@/components/ui/DocumentStatusBadge';

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

// ── MOCK: supabase client (cadena exacta de la vista) ──
const fromMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// ── MOCK: auth/ui/cart stores (usuario mutable vía vi.hoisted) ──
const mockSetCurrentView = vi.fn();
const mockSetOperationType = vi.fn();
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    activeStoreId: 'store-1',
    memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }],
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));
vi.mock('@/store/cart', () => ({
  useCartStore: {
    getState: () => ({ setOperationType: mockSetOperationType }),
  },
}));

// ── MOCK: apiFetch (endpoint de reversión EXISTENTE) ──
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// ── MOCK: sonner toasts ──
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

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
      { id: 'i-1', product_id: 'p-1', variant_id: null, production_order_item_id: null, quantity: 3, unit_cost: 50, total_cost: 150, products: { name: 'Tornillo M8', sku: 'SKU-001' } },
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
      { id: 'i-2', product_id: 'p-2', variant_id: null, production_order_item_id: null, quantity: 2, unit_cost: 20, total_cost: 40, products: { name: 'Pintura Blanca', sku: null } },
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

function chain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: VALES, error: null }),
  };
}

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
  fromMock.mockReset().mockImplementation(() => chain());
  apiFetchMock.mockReset();
  mockSetCurrentView.mockReset();
  mockSetOperationType.mockReset();
});

describe('ValesSalidaView — render y listado', () => {
  it('1 · header con título exacto, contador y botón Crear', async () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Vales de Salida' })).toBeTruthy();
    const createBtn = screen.getByRole('button', { name: /Crear Vale de Salida/i });
    expect(createBtn).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('VS-000001-2026')).toBeTruthy();
      expect(screen.getByText('VS-000002-2026')).toBeTruthy();
    });
    expect(screen.getByText(/3 vale\(s\)/)).toBeTruthy();
  });

  it('2 · consulta RLS-scoped a issue_slips de la tienda activa (limit 100, desc)', async () => {
    renderView();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('issue_slips'));
    const c = fromMock.mock.results[0]?.value;
    expect(c.select).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('store_id', 'store-1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
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
  it('4 · completed → botón Devolver visible con aria-label del número', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000001-2026')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Devolver vale VS-000001-2026' })).toBeTruthy();
  });

  it('5 · reversed y voided → SIN botón Devolver (matriz: solo Ver)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000002-2026')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Devolver vale VS-000002-2026' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver vale VS-000003-2026' })).toBeNull();
  });

  it('6 · detalle expandible muestra items + trazabilidad con devolución', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000002-2026')).toBeTruthy());
    // Expandir el vale DEVUELTO (botón Eye)
    fireEvent.click(screen.getByRole('button', { name: 'Ver items del vale VS-000002-2026' }));
    await waitFor(() => {
      expect(screen.getByText('Pintura Blanca')).toBeTruthy();
      expect(screen.getByText('Devuelto por:')).toBeTruthy();
      expect(screen.getByText('Luis Vega')).toBeTruthy();
      expect(screen.getByText(/Emitido por error/i)).toBeTruthy();
    });
  });
});

describe('ValesSalidaView — Crear reutiliza el flujo del carrito (FASE 8)', () => {
  it('7 · click en Crear → setOperationType("issue_slip") + navegación a Vender', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Crear Vale de Salida/i }));
    expect(mockSetOperationType).toHaveBeenCalledWith('issue_slip');
    expect(mockSetCurrentView).toHaveBeenCalledWith('pos');
  });
});

describe('ValesSalidaView — Devolver usa el endpoint EXISTENTE (FASE 12)', () => {
  it('8 · modal pide motivo, disabled < 3 chars, POST a /api/vale-salida/[id]/reverse', async () => {
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

  it('9 · error del backend queda visible en el modal (no cierra)', async () => {
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

describe('ValesSalidaView — sin tienda activa', () => {
  it('10 · sin activeStoreId no consulta y muestra guía', async () => {
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
  it('11 · labels correctos por estado y helper canReverse/isTerminal', () => {
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

  it('12 · estado desconocido → badge crudo defensivo (no inventa estados)', () => {
    render(<DocumentStatusBadge type="issue_slip" status="weird_state" />);
    expect(screen.getByText('weird_state')).toBeTruthy();
  });
});
