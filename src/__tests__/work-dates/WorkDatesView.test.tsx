/**
 * WorkDatesView.test.tsx — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Pruebas de la vista «Fechas de trabajo» (OPERACIÓN → Control operativo):
 *   - Renderiza la matriz con los tipos del registro y las columnas de fecha.
 *   - Muestra los límites calculados por el servidor (hoy, mínimo per-store).
 *   - Distingue «fecha de trabajo actual» (preferencia/HOY) de «última fecha
 *     operativa» (dato real del tipo) — nunca las presenta como equivalentes.
 *   - Cambiar la fecha de un tipo NO contamina a otro tipo (aislamiento).
 *   - Cancelar el diálogo no modifica el estado.
 *   - Guardar actualiza la matriz + persiste la preferencia.
 *   - Un tipo fijo (caja) muestra su regla y NO ofrece cambio de fecha.
 *   - Estado de error con reintento; mensaje de alcance visible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkDatePrefsStore } from '@/store/work-date-prefs';

const TODAY = '2026-10-18';
const MIN_ISO = '2026-10-16T16:00:00+00:00'; // doc previo de la tienda (día 16 Habana)

let apiResponse: Record<string, unknown> = {};

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => apiResponse),
}));

vi.mock('@/hooks/api/useGlobalOperationDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/api/useGlobalOperationDate')>();
  return {
    ...actual,
    useGlobalOperationDate: () => ({
      data: { maxDate: MIN_ISO, maxDateFormatted: '16/10/2026 12:00', minAllowedDate: MIN_ISO },
      isLoading: false,
    }),
  };
});

const setViewMock = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: () => ({
    user: {
      id: 'u1',
      fullName: 'Tester',
      activeStoreId: 'store-1',
      memberships: [{ store_id: 'store-1', store: { name: 'Tienda Piloto' } }],
    },
  }),
  useUIStore: () => ({ setCurrentView: setViewMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import WorkDatesView from '@/components/views/terminal/views/work_dates/WorkDatesView';

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkDatesView />
    </QueryClientProvider>,
  );
}

function seedApiResponse(overrides: Record<string, unknown> = {}) {
  apiResponse = {
    today: TODAY,
    storeMinDate: '2026-10-16',
    floorDate: '2026-04-18',
    timezone: 'America/Havana',
    types: [
      { type: 'sale', lastOperativeDate: '2026-10-17T18:00:00+00:00', lastOperativeDay: '2026-10-17', documentCount: 42 },
      { type: 'reception', lastOperativeDate: '2026-10-16T16:00:00+00:00', lastOperativeDay: '2026-10-16', documentCount: 7 },
      { type: 'vale_salida', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
      { type: 'received_service', lastOperativeDate: '2026-10-15T00:00:00+00:00', lastOperativeDay: '2026-10-15', documentCount: 3 },
      { type: 'cash_shift', lastOperativeDate: '2026-10-18T14:00:00+00:00', lastOperativeDay: '2026-10-18', documentCount: 2 },
      { type: 'devolution', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
      { type: 'inventory_adjustment', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
      { type: 'transfer', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
      { type: 'catalog_sale', lastOperativeDate: '2026-10-17T18:00:00+00:00', lastOperativeDay: '2026-10-17', documentCount: 42 },
      { type: 'purchase_order', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
      { type: 'supplier_payment', lastOperativeDate: null, lastOperativeDay: null, documentCount: 0 },
    ],
    ...overrides,
  };
}

function localStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: () => store.clear(),
  };
}

describe('WorkDatesView — Fechas de trabajo', () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal('localStorage', localStorageMock());
    useWorkDatePrefsStore.setState({ scope: null, prefs: {} });
    seedApiResponse();
    setViewMock.mockClear();
  });

  it('renderiza la matriz con los tipos y las columnas de fecha', async () => {
    renderView();
    expect(await screen.findByText('Venta (POS / carrito / express)')).toBeInTheDocument();
    expect(screen.getByText('Recepción de mercancía')).toBeInTheDocument();
    expect(screen.getByText('Vale de Salida')).toBeInTheDocument();
    expect(screen.getByText('Servicio recibido')).toBeInTheDocument();
    expect(screen.getByText('Caja — turnos y arqueo')).toBeInTheDocument();
    // Columnas canónicas de la misión §3.2.
    for (const col of [
      'Tipo de movimiento', 'Fecha de trabajo actual', 'Última fecha operativa',
      'Mín. permitida', 'Máx. permitida', 'Estado',
    ]) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
  });

  it('muestra los límites del servidor: HOY máximo y mínimo per-store', async () => {
    renderView();
    await screen.findByText('Venta (POS / carrito / express)');
    // Resumen: hoy 18/10/2026 y mínimo 16/10/2026 (días de negocio) — varias
    // filas muestran HOY (máx. por tipo) → getAllByText.
    expect(screen.getAllByText('18/10/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('16/10/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Forward-only|política/i).length).toBeGreaterThan(0);
  });

  it('distingue fecha de trabajo actual (HOY implícito) de última operativa (real)', async () => {
    renderView();
    await screen.findByText('Venta (POS / carrito / express)');
    // Venta: trabajo actual = HOY implícito; última operativa = 17/10/2026.
    expect(screen.getAllByText(/\(hoy implícito\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('17/10/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sin preferencia → HOY/).length).toBeGreaterThan(0);
  });

  it('un tipo fijo (caja) muestra su regla y NO ofrece fijar fecha', async () => {
    renderView();
    await screen.findByText('Caja — turnos y arqueo');
    expect(screen.getByText('Fija')).toBeInTheDocument();
    const cajaRow = screen.getByText('Caja — turnos y arqueo').closest('tr')!;
    expect(cajaRow.textContent).toContain('No aplica');
    expect(cajaRow.textContent).not.toContain('Fijar fecha');
  });

  it('abre el diálogo, cancela y NO modifica el estado', async () => {
    renderView();
    const ventaRow = await screen.findByText('Venta (POS / carrito / express)');
    const fijarBtn = ventaRow.closest('tr')!.querySelector('button')!;
    fireEvent.click(fijarBtn);
    const dialog = await screen.findByRole('dialog', { name: /Fecha de trabajo/i });
    // Contexto de tienda visible (texto partido por <strong> → matcher flexible).
    expect(
      screen.getByText((_, el) => !!el?.textContent?.match(/Tienda:\s*Tienda Piloto/i) && el.tagName === 'P'),
    ).toBeInTheDocument();
    // Límites visibles en el diálogo (mínimo aparece en tile + hint del picker).
    expect(screen.getAllByText(/16\/10\/2026/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useWorkDatePrefsStore.getState().prefs['sale']).toBeUndefined();
  });

  it('guarda la fecha de un tipo y NO contamina a los demás tipos', async () => {
    renderView();
    const ventaRow = await screen.findByText('Venta (POS / carrito / express)');
    fireEvent.click(ventaRow.closest('tr')!.querySelector('button')!);
    await screen.findByRole('dialog', { name: /Fecha de trabajo/i });
    const input = screen.getByLabelText(/Fecha del próximo documento/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-10-17' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Preferencia guardada SOLO para 'sale'.
    const prefs = useWorkDatePrefsStore.getState().prefs;
    expect(prefs['sale']).toBe('2026-10-17');
    expect(prefs['reception']).toBeUndefined();
    expect(prefs['vale_salida']).toBeUndefined();
    // Persistida en localStorage del scope usuario+tienda.
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'costpro:work-date-pref:u1:store-1',
      JSON.stringify({ sale: '2026-10-17' }),
    );
    // La matriz refleja la nueva fecha de trabajo de venta.
    await waitFor(() =>
      expect(screen.getByText(/Tu preferencia para el próximo documento/)).toBeInTheDocument(),
    );
  });

  it('guardar HOY limpia la preferencia (hoy implícito canónico)', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { sale: '2026-10-17' } });
    renderView();
    const ventaRow = await screen.findByText('Venta (POS / carrito / express)');
    fireEvent.click(ventaRow.closest('tr')!.querySelector('button')!);
    await screen.findByRole('dialog', { name: /Fecha de trabajo/i });
    const input = screen.getByLabelText(/Fecha del próximo documento/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: TODAY } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useWorkDatePrefsStore.getState().prefs['sale']).toBeUndefined();
  });

  it('el botón «Ir al flujo» navega a la vista del tipo conservando contexto', async () => {
    renderView();
    const ventaRow = await screen.findByText('Venta (POS / carrito / express)');
    const botones = ventaRow.closest('tr')!.querySelectorAll('button');
    const irBtn = Array.from(botones).find((b) => b.textContent?.includes('Ir al flujo'))!;
    fireEvent.click(irBtn);
    expect(setViewMock).toHaveBeenCalledWith('pos');
  });

  it('explica el alcance de la selección (usuario + tienda + tipo)', async () => {
    renderView();
    await screen.findByText('Venta (POS / carrito / express)');
    expect(screen.getByText(/Alcance de la selección/i)).toBeInTheDocument();
    expect(screen.getByText(/No cambia la fecha\s+de trabajo de otros usuarios, ni de otras tiendas, ni de otros tipos de movimiento/i)).toBeInTheDocument();
  });

  it('marca una preferencia caducada (bajo el mínimo) sin bloquear la matriz', async () => {
    useWorkDatePrefsStore.setState({
      scope: 'u1:store-1',
      prefs: { sale: '2026-10-10' }, // bajo el mínimo 16/10
    });
    renderView();
    await screen.findByText('Venta (POS / carrito / express)');
    expect(screen.getByText(/Caducada: quedó bajo el mínimo/i)).toBeInTheDocument();
    expect(screen.getByText(/El formulario usará HOY/i)).toBeInTheDocument();
  });

  it('estado de error accionable con reintento', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    (apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('RPC caído'));
    renderView();
    expect(await screen.findByText(/No se pudieron consultar las fechas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });

  it('filtra por área y por búsqueda', async () => {
    renderView();
    await screen.findByText('Venta (POS / carrito / express)');
    fireEvent.click(screen.getByRole('button', { name: 'Logística' }));
    expect(screen.getByText('Recepción de mercancía')).toBeInTheDocument();
    expect(screen.queryByText('Venta (POS / carrito / express)')).not.toBeInTheDocument();
    // Búsqueda dentro del área.
    fireEvent.change(screen.getByLabelText(/Buscar tipo de movimiento/i), { target: { value: 'transferencia' } });
    expect(screen.getByText('Transferencia entre tiendas')).toBeInTheDocument();
    expect(screen.queryByText('Recepción de mercancía')).not.toBeInTheDocument();
  });
});
