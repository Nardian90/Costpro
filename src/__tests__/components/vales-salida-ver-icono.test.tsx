/**
 * MISIÓN 2026-11-07 — Vales de Salida · botón «Visualizar vale» (modo tabla)
 * ===========================================================================
 * El botón icon-only de 32px se percibía como botón vacío (misma familia del
 * problema de contraste documentado en el propio archivo de la vista). El fix
 * lo alinea con sus botones hermanos (Confirmar/Devolver): icono Eye SIEMPRE
 * visible + etiqueta en pantallas anchas + tooltip y aria-label.
 *
 * Verifica (misión §8.B):
 *  - El icono Eye SE MUESTRA (svg lucide-eye renderizado dentro del botón).
 *  - El botón ejecuta la visualización (abre el modal de detalle).
 *  - Tooltip y accesibilidad correctos (title + aria-label).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ValesSalidaView from '@/components/views/terminal/views/inventory/ValesSalidaView';

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
];

function chain(result: { data: unknown; error: unknown | null } = { data: VALES, error: null }) {
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
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: vi.fn() }) : { setCurrentView: vi.fn() },
}));

vi.mock('@/hooks/api/useProducts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useProducts: () => ({ data: [], isLoading: false }),
  };
});

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
    if (table === 'stock_movements') return chain({ data: [], error: null });
    if (table === 'production_orders' || table === 'production_order_items') {
      return chain({ data: [], error: null });
    }
    return chain();
  });
});

describe('ValesSalidaView — botón Visualizar vale (misión 2026-11-07)', () => {
  it('modo tarjetas: el botón Ver muestra el icono Eye + etiqueta + tooltip/a11y', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000001-2026')).toBeTruthy());
    const btn = screen.getByRole('button', { name: 'Visualizar vale VS-000001-2026' });
    expect(btn).toBeTruthy();
    // Icono Eye RENDERIZADO (no un botón vacío): svg con clase lucide-eye
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('class') || '').toContain('lucide-eye');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // Tooltip identificable sin pulsar
    expect(btn.getAttribute('title')).toBe('Visualizar vale');
    // Etiqueta visible en pantallas sm+ (el span no está oculto por defecto en jsdom)
    expect(btn.textContent).toContain('Ver');
  });

  it('modo tabla: el botón Ver muestra el icono Eye y abre el detalle al pulsarlo', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('VS-000001-2026')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    expect(screen.getByRole('table')).toBeTruthy();

    const btn = screen.getByRole('button', { name: 'Visualizar vale VS-000001-2026' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('class') || '').toContain('lucide-eye');
    expect(btn.getAttribute('title')).toBe('Visualizar vale');

    // Ejecuta la visualización real (abre el modal de detalle del vale)
    fireEvent.click(btn);
    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    });
  });
});
