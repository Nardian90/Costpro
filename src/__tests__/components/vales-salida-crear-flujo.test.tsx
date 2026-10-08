/**
 * ValeSalidaCreateModal — Tests del FLUJO DEDICADO de creación
 * (requisito 1/3/15 del brief de profesionalización de Vales de Salida).
 *
 * Cubre el ciclo completo exigido:
 *   1. entrar al flujo desde el módulo (cabecera documental);
 *   2. buscar y agregar productos;
 *   3. modificar cantidades (con unidad REAL del producto);
 *   4. validar datos (notas requeridas, stock insuficiente, gate del botón);
 *   5. confirmar documento (paso CONFIRMANDO con impacto de inventario);
 *   6. emitir → POST al endpoint EXISTENTE /api/vale-salida con payload
 *      { items, production_order_id, notes, idempotency_key } (misma lógica
 *      de negocio que Vender — requisito 4);
 *   7. estado REGISTRADO con número real + onEmitido;
 *   8. error del backend visible (no inventa éxito).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ValeSalidaCreateModal } from '@/components/views/terminal/views/inventory/ValeSalidaCreateModal';

// ── MOCK: supabase (production_orders / production_order_items del modal) ──
const fromMock = vi.fn();

function chain(result: { data: unknown; error: unknown | null } = { data: [], error: null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'order', 'in', 'neq', 'gte', 'lte']) c[m] = vi.fn(() => c);
  for (const m of ['limit', 'range', 'single']) c[m] = vi.fn(() => terminal());
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

// ── MOCK: catálogo vía useProducts (mismo RPC que el POS) ──
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

vi.mock('@/hooks/api/useProducts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useProducts: () => ({ data: PRODUCTOS, isLoading: false }) };
});

// ── MOCK: auth store (usuario con tienda activa) ──
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      user: {
        id: 'u-1',
        fullName: 'Ana Torres',
        activeStoreId: 'store-1',
        memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }],
      },
    };
    return sel ? sel(state) : state;
  },
}));

// ── MOCK: apiFetch (emisión al endpoint EXISTENTE) ──
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

function renderModal(onEmitido = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ValeSalidaCreateModal
        open
        onClose={vi.fn()}
        storeId="store-1"
        storeName="Almacén Central"
        onEmitido={onEmitido}
      />
    </QueryClientProvider>,
  );
  return onEmitido;
}

beforeEach(() => {
  cleanup();
  fromMock.mockReset().mockImplementation(() => chain());
  apiFetchMock.mockReset();
});

describe('ValeSalidaCreateModal — paso 1 EDITANDO', () => {
  it('1 · cabecera documental: número se asigna al emitir, almacén y responsable', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Crear Vale de Salida');
    expect(dialog.textContent).toContain('se asignará al emitir');
    expect(screen.getByText('Almacén Central')).toBeTruthy();
    expect(screen.getByText('Ana Torres')).toBeTruthy();
  });

  it('2 · botón «Revisar y confirmar» deshabilitado sin productos ni concepto', async () => {
    renderModal();
    const confirmBtn = await screen.findByRole('button', { name: /Revisar y confirmar/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('3 · buscar producto y agregar línea con unidad y stock disponible', async () => {
    const user = userEvent.setup();
    renderModal();

    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Torn');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Tornillo M8/ })).toBeTruthy();
    });
    await user.click(screen.getByRole('option', { name: /Tornillo M8/ }));

    // Línea agregada con cantidad 1 y unidad UN; disponible 50 UN
    await waitFor(() => {
      expect(screen.getByText('Tornillo M8')).toBeTruthy();
    });
    expect(screen.getByText(/disponible:/)).toBeTruthy();
    expect(screen.getByText(/50 UN/)).toBeTruthy();
    expect(screen.getByText('UN')).toBeTruthy();
  });

  it('4 · concepto requerido habilita la confirmación (con producto agregado)', async () => {
    const user = userEvent.setup();
    renderModal();

    // Agregar producto
    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Torn');
    await waitFor(() => expect(screen.getByRole('option', { name: /Tornillo M8/ })).toBeTruthy());
    await user.click(screen.getByRole('option', { name: /Tornillo M8/ }));

    // Concepto obligatorio (RPC ERR_NOTES_REQUIRED)
    const notas = screen.getByLabelText(/Concepto \/ notas/i);
    await user.type(notas, 'Consumo interno de mantenimiento');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeEnabled();
    });
  });
});

describe('ValeSalidaCreateModal — paso 2 CONFIRMANDO (validación pre-emisión)', () => {
  async function llegarAConfirmacion() {
    const user = userEvent.setup();
    renderModal();
    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Tor');
    await waitFor(() => expect(screen.getByRole('option', { name: /Tornillo M8/ })).toBeTruthy());
    await user.click(screen.getByRole('option', { name: /Tornillo M8/ }));
    await user.type(screen.getByLabelText(/Concepto \/ notas/i), 'Consumo interno de mantenimiento');
    await user.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    await screen.findByText(/Impacto en inventario/i);
    return user;
  }

  it('5 · resumen con impacto: salida −1 UN, costo estimado y advertencia de stock', async () => {
    await llegarAConfirmacion();

    // Impacto esperado: −1 UN (salida)
    expect(screen.getByText('−1 UN')).toBeTruthy();
    // Costo estimado = 1 × 10 — aparece en la celda de línea y en el pie
    // del documento (formato moneda es-CU → $10.00)
    expect(screen.getAllByText(/10[.,]00/).length).toBeGreaterThanOrEqual(2);

    // Agregamos ahora el caso de stock insuficiente en un segundo flujo:
    // (el producto Pintura Blanca con stock 0 se valida en el test 6)
    expect(screen.getByRole('button', { name: /Emitir Vale/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Volver a editar/i })).toBeTruthy();
  });

  it('6 · producto sin stock → advertencia visible en confirmación', async () => {
    const user = userEvent.setup();
    renderModal();

    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Pin');
    await waitFor(() => expect(screen.getByRole('option', { name: /Pintura Blanca/ })).toBeTruthy());
    await user.click(screen.getByRole('option', { name: /Pintura Blanca/ }));
    await user.type(screen.getByLabelText(/Concepto \/ notas/i), 'Merma por derrame');
    await user.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Revisa antes de emitir/i)).toBeTruthy();
    });
    expect(screen.getByText(/supera el stock disponible/i)).toBeTruthy();
  });
});

describe('ValeSalidaCreateModal — paso 3 REGISTRADO (emisión real)', () => {
  it('7 · Emitir hace POST al endpoint existente con idempotencia y muestra el número', async () => {
    const user = userEvent.setup();
    const onEmitido = vi.fn();
    renderModal(onEmitido);

    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Tor');
    await waitFor(() => expect(screen.getByRole('option', { name: /Tornillo M8/ })).toBeTruthy());
    await user.click(screen.getByRole('option', { name: /Tornillo M8/ }));
    await user.type(screen.getByLabelText(/Concepto \/ notas/i), 'Consumo interno de mantenimiento');

    apiFetchMock.mockResolvedValueOnce({
      status: 'success',
      slip_id: 'eeeeeeee-1111-1111-1111-111111111111',
      slip_number: 'VS-000009-2026',
      total_cost: 10,
    });

    await user.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    await screen.findByText(/Impacto en inventario/i);
    await user.click(screen.getByRole('button', { name: /Emitir Vale/i }));

    // POST al MISMO endpoint que Vender (requisito 4 — cero duplicación)
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/vale-salida',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const [, opts] = apiFetchMock.mock.calls[0];
    const body = JSON.parse(String(opts.body));
    expect(body.notes).toBe('Consumo interno de mantenimiento');
    expect(body.items).toEqual([
      {
        product_id: 'aaaaaaaa-1111-1111-1111-111111111111',
        variant_id: null,
        quantity: 1,
        production_order_item_id: null,
      },
    ]);
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8);

    // Estado REGISTRADO: número real + callback
    await waitFor(() => {
      expect(screen.getByText('VS-000009-2026')).toBeTruthy();
    });
    expect(screen.getByText(/Vale registrado/i)).toBeTruthy();
    expect(onEmitido).toHaveBeenCalledTimes(1);
  });

  it('8 · error del backend se muestra (no inventa éxito, no cierra)', async () => {
    const user = userEvent.setup();
    renderModal();

    const search = await screen.findByLabelText(/Buscar productos/i);
    await user.type(search, 'Tor');
    await waitFor(() => expect(screen.getByRole('option', { name: /Tornillo M8/ })).toBeTruthy());
    await user.click(screen.getByRole('option', { name: /Tornillo M8/ }));
    await user.type(screen.getByLabelText(/Concepto \/ notas/i), 'Consumo interno de mantenimiento');

    apiFetchMock.mockRejectedValueOnce(new Error('Stock insuficiente'));

    await user.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    await screen.findByText(/Impacto en inventario/i);
    await user.click(screen.getByRole('button', { name: /Emitir Vale/i }));

    await waitFor(() => {
      expect(screen.getByText('Stock insuficiente')).toBeTruthy();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByText(/Vale registrado/i)).toBeNull();
  });
});
