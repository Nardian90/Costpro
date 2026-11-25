/**
 * CP-AP-FORENSIC-RECONCILIATION-001 — Navegación y filtros de la vista
 * ============================================================================
 * Escenario D de la FASE 8 de la misión:
 *   D1/D3. Por proveedor → Detalle → regresar SIN error (carrera viewMode/data
 *          erradicada: la ventana intermedia se trata como carga).
 *   D4.   Drill-down por proveedor (fila → Detalles del proveedor → Volver).
 *   D5.   Aplicar fechas (fecha de corte) → la consulta recibe date_from/date_to.
 *   D6/D7. Entrar y salir de detalles preservando filtros.
 *   D8.   Cambio de categoría.
 * Además: guardas de forma (nunca renderizar grouped con filas sin .aging).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import AccountsPayableView from '@/components/views/terminal/views/accounts_payable/AccountsPayableView';
import { renderWithDialogs } from '../helpers/render-with-dialogs';

beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});

vi.mock('@/components/views/terminal/views/accounts_payable/PaymentModal', () => ({ default: () => null }));
vi.mock('@/components/views/terminal/views/accounts_payable/PaymentHistoryRow', () => ({ default: () => null }));
vi.mock('@/components/views/terminal/views/accounts_payable/LiquidationModal', () => ({
  LiquidationModal: () => null,
}));

// ── Auth store ──
const authState = vi.hoisted(() => ({
  user: { id: 'u-1', role: 'admin', fullName: 'Ana Torres', activeStoreId: 'store-1' },
  token: 't-1',
}));
vi.mock('@/store', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const useAuthStore = Object.assign(
    (sel?: (s: unknown) => unknown) => (sel ? sel(authState) : authState),
    { getState: () => authState },
  );
  return { ...actual, useAuthStore };
});

/**
 * Mock REALISTA del hook: réplica de la semántica `stale` (carrera D3).
 * El estado vive en el closure del mock con un emitter: los cambios desde el
 * test (setHook) fuerzan el re-render, como lo haría la respuesta del API.
 */
vi.mock('@/hooks/api/useAccountsPayable', () => {
  type HookState = {
    params: Record<string, unknown>;
    data: unknown[];
    loading: boolean;
    stale: boolean;
    error: string | null;
  };
  const state: HookState = { params: {}, data: [], loading: false, stale: false, error: null };
  const listeners = new Set<() => void>();
  const setHook = (patch: Partial<HookState>) => {
    Object.assign(state, patch);
    listeners.forEach(l => l());
  };
  const useAccountsPayable = (params: Record<string, unknown>) => {
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const l = () => force(x => x + 1);
      listeners.add(l);
      return () => { listeners.delete(l); };
    }, []);
    state.params = params;
    return {
      data: state.data,
      totals: null,
      kpis: { totalOverdue: 0, totalUpcoming: 0, totalPending: 0, totalPaid: 0 },
      summary: null,
      meta: { cutoff: '2026-11-25', date_from: null, date_to: null },
      count: state.data.length,
      loading: state.loading || state.stale,
      stale: state.stale,
      error: state.error,
      refetch: vi.fn(),
    };
  };
  return { useAccountsPayable, __cxpHookTest: { state, setHook } };
});

// Acceso tipado al estado del mock
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __cxpHookTest } = await import('@/hooks/api/useAccountsPayable') as unknown as {
  __cxpHookTest: {
    state: { params: Record<string, unknown>; data: unknown[]; loading: boolean; stale: boolean; error: string | null };
    setHook: (patch: Partial<{ params: Record<string, unknown>; data: unknown[]; loading: boolean; stale: boolean; error: string | null }>) => void;
  };
};

const GROUPED_ROW = {
  supplier: 'Proveedor Uno',
  total_cup: 500,
  paid_cup: 100,
  balance_cup: 400,
  aging: { current: 400, upcoming7: 0, overdue: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 },
  count: 1,
};

const LIST_ROW = {
  id: 'p-1',
  ref_type: 'receipt',
  ref_id: 'r-1',
  supplier: 'Proveedor Uno',
  supplier_key: 'Proveedor Uno',
  reference: 'REC-0001',
  doc_date: '2026-11-01',
  due_date: '2026-11-30',
  total: 500,
  total_cup: 500,
  paid_amount: 100,
  paid_cup: 100,
  balance: 400,
  balance_cup: 400,
  currency: 'CUP',
  exchange_rate: 1,
  payment_method: 'cash',
  days_until_due: 5,
  days_overdue: null,
  is_overdue: false,
  is_settled: false,
  aging_bucket: 'upcoming7',
  payment_status: 'partial',
  created_at: '2026-11-01T10:00:00Z',
};

beforeEach(() => {
  cleanup();
  __cxpHookTest.setHook({ data: [], loading: false, stale: false, error: null });
});

describe('D. Navegación Cuentas por Pagar (CP-AP-FORENSIC-RECONCILIATION-001)', () => {
  it('D1/D3. Por proveedor → Detalle → Por proveedor SIN error (la ventana de carrera es carga, no crash)', async () => {
    __cxpHookTest.setHook({ data: [GROUPED_ROW] });
    renderWithDialogs(<AccountsPayableView />);
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());

    // Cambiar a Detalle: mientras los datos siguen siendo los del modo grouped
    // (semántica exacta del bug original), la vista NO renderiza tabla con
    // forma incompatible — trata la ventana como carga (loading=true por stale).
    fireEvent.click(screen.getByRole('button', { name: /Detalle/ }));
    await act(async () => { __cxpHookTest.setHook({ stale: true }); });
    // Con datos viejos (grouped) en modo list + stale → CARGANDO, sin crash
    expect(screen.queryByText(/Error al cargar/i)).toBeNull();
    // Llegan los datos del modo list
    await act(async () => { __cxpHookTest.setHook({ stale: false, data: [LIST_ROW] }); });
    await waitFor(() => expect(screen.getByText('REC-0001')).toBeTruthy());

    // Regresar a Por proveedor: carrera en sentido inverso (el caso que crasheaba)
    fireEvent.click(screen.getByRole('button', { name: /Por Proveedor/i }));
    await act(async () => { __cxpHookTest.setHook({ stale: true }); }); // datos LIST aún presentes
    // LA ASERCIÓN CLAVE del bug original: ningún TypeError ni «Error al cargar»
    expect(screen.queryByText(/Error al cargar/i)).toBeNull();
    await act(async () => { __cxpHookTest.setHook({ stale: false, data: [GROUPED_ROW] }); });
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());
    expect(screen.queryByText(/Error al cargar/i)).toBeNull();
  });

  it('D1b. Guarda de forma: datos SIN .aging en modo grouped NO crashean (defensa en profundidad)', () => {
    __cxpHookTest.setHook({ data: [LIST_ROW] }); // forma incorrecta para grouped, loading=false, stale=false
    renderWithDialogs(<AccountsPayableView />);
    // Sin tabla agrupada rota: la vista cae a estado vacío, nunca a TypeError
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Error al cargar/i)).toBeNull();
  });

  it('D4. Drill-down: fila de proveedor → Detalles del proveedor → Volver a Por proveedor', async () => {
    __cxpHookTest.setHook({ data: [GROUPED_ROW] });
    renderWithDialogs(<AccountsPayableView />);
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());

    fireEvent.click(screen.getByTestId('cxp-fila-proveedor'));
    await waitFor(() => expect(__cxpHookTest.state.params.supplier).toBe('Proveedor Uno'));
    expect(__cxpHookTest.state.params.mode).toBe('list');

    // Datos del detalle del proveedor
    await act(async () => { __cxpHookTest.setHook({ data: [LIST_ROW] }); });
    await waitFor(() => expect(screen.getByText('REC-0001')).toBeTruthy());
    expect(screen.getByTestId('cxp-chip-proveedor').textContent).toContain('Proveedor Uno');

    // Volver: limpia el proveedor y regresa a grouped
    fireEvent.click(screen.getByTestId('cxp-volver-proveedores'));
    await waitFor(() => {
      expect(__cxpHookTest.state.params.supplier).toBeUndefined();
      expect(__cxpHookTest.state.params.mode).toBe('grouped');
    });
  });

  it('D5. Filtro de fechas: Aplicar envía date_from/date_to (fecha de corte) y Limpiar restaura', async () => {
    __cxpHookTest.setHook({ data: [GROUPED_ROW] });
    renderWithDialogs(<AccountsPayableView />);
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());

    // Banner de corte visible (misión §6.2)
    expect(screen.getByTestId('cxp-corte-banner').textContent).toContain('25/11/2026');

    const from = screen.getByLabelText('Fecha inicial del período de documentos');
    const to = screen.getByLabelText('Fecha final del período (fecha de corte)');
    fireEvent.change(from, { target: { value: '2026-10-01' } });
    fireEvent.change(to, { target: { value: '2026-11-25' } });
    fireEvent.click(screen.getByTestId('cxp-fechas-aplicar'));

    await waitFor(() => {
      expect(__cxpHookTest.state.params.dateFrom).toBe('2026-10-01');
      expect(__cxpHookTest.state.params.dateTo).toBe('2026-11-25');
    });

    // Limpiar restaura
    fireEvent.click(screen.getByTestId('cxp-fechas-limpiar'));
    await waitFor(() => {
      expect(__cxpHookTest.state.params.dateFrom).toBeUndefined();
      expect(__cxpHookTest.state.params.dateTo).toBeUndefined();
    });
  });

  it('D5b. Fecha inicial > final: bloquea Aplicar y muestra el aviso', () => {
    __cxpHookTest.setHook({ data: [] });
    renderWithDialogs(<AccountsPayableView />);
    const from = screen.getByLabelText('Fecha inicial del período de documentos');
    const to = screen.getByLabelText('Fecha final del período (fecha de corte)');
    fireEvent.change(from, { target: { value: '2026-11-30' } });
    fireEvent.change(to, { target: { value: '2026-11-01' } });
    const btn = screen.getByTestId('cxp-fechas-aplicar') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Inicial > final')).toBeTruthy();
  });

  it('D8. Cambio de categoría se propaga a la consulta', async () => {
    __cxpHookTest.setHook({ data: [] });
    renderWithDialogs(<AccountsPayableView />);
    fireEvent.change(screen.getByLabelText('Categoría de documentos'), { target: { value: 'services' } });
    await waitFor(() => expect(__cxpHookTest.state.params.category).toBe('services'));
    fireEvent.change(screen.getByLabelText('Categoría de documentos'), { target: { value: 'receipts' } });
    await waitFor(() => expect(__cxpHookTest.state.params.category).toBe('receipts'));
  });

  it('D9. Búsqueda por proveedor se propaga (debounce 400ms)', async () => {
    __cxpHookTest.setHook({ data: [] });
    renderWithDialogs(<AccountsPayableView />);
    const input = screen.getByPlaceholderText('Buscar por proveedor...');
    fireEvent.change(input, { target: { value: 'Vitallcons' } });
    await waitFor(
      () => expect(__cxpHookTest.state.params.search).toBe('Vitallcons'),
      { timeout: 2000 },
    );
  });
});
