/**
 * CP-CI-006 · U1 — Estados canónicos en vistas de datos (módulo cxc/cxp)
 * =======================================================================
 * AccountsPayableView y AccountsReceivableView migradas a StateRenderer
 * (patrón canónico del repo, p. ej. InventoryView). Este test verifica a
 * nivel E4 (Vitest + Testing Library) los 4 estados canónicos de cada vista:
 *   - cargando: splash de marca ViewLoadingSplash (label CARGANDO)
 *   - error:    tarjeta canónica "Ha ocurrido un error" con Reintentar funcional
 *   - vacío:    mensaje contextual por vista
 *   - datos:    contenido real renderizado
 * Limitación documentada en el informe del ciclo: la verificación E2 en
 * navegador no fue ejecutable en este entorno (sin credenciales de sesión;
 * producción no es banco de pruebas) — se sustituye por render de componente.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import AccountsPayableView from '@/components/views/terminal/views/accounts_payable/AccountsPayableView';
import AccountsReceivableView from '@/components/views/terminal/views/accounts_receivable/AccountsReceivableView';

beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});

// ── Hijos de AccountsPayableView con efectos de red al montar (fuera del alcance U1) ──
vi.mock('@/components/views/terminal/views/accounts_payable/PaymentModal', () => ({ default: () => null }));
vi.mock('@/components/views/terminal/views/accounts_payable/PaymentHistoryRow', () => ({ default: () => null }));

// ── Auth store: usuario con tienda activa (incluye getState() que usan ambas vistas) ──
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    fullName: 'Ana Torres',
    activeStoreId: 'store-1',
  },
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

// ── Hook de cuentas por pagar: controlable por test ──
const payableState = vi.hoisted(() => ({
  data: [] as unknown[],
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/api/useAccountsPayable', () => ({
  useAccountsPayable: () => ({
    data: payableState.data,
    totals: null,
    kpis: { totalOverdue: 0, totalUpcoming: 0, totalPending: 0, totalPaid: 0 },
    summary: null,
    count: payableState.data.length,
    loading: payableState.loading,
    error: payableState.error,
    refetch: payableState.refetch,
  }),
}));

// ── fetch global: usado por AccountsReceivableView (no usa hook) ──
const fetchMock = vi.fn();

const KPIS = { totalOverdue: 0, totalUpcoming: 0, totalPending: 1000, totalPaid: 0 };

// El hook devuelve GroupedPayable[] en modo 'grouped' (default) y UnifiedPayable[] en 'list';
// el mock cubre ambas formas (union real del hook) para poder renderizar en los dos modos.
const UNIFIED_PAYABLE = {
  id: 'p-1',
  ref_type: 'receipt',
  ref_id: 'r-1',
  supplier: 'Proveedor Uno',
  reference: 'REC-0001',
  count: 1,
  total: 500,
  total_cup: 500,
  paid_cup: 0,
  balance_cup: 500,
  currency: 'CUP',
  exchange_rate: 1,
  payment_status: 'unpaid',
  due_date: '2026-11-30',
  is_overdue: false,
  days_until_due: 6,
  aging: { current: 500, upcoming7: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 },
};

const RECEIVABLE = {
  id: 'r-1',
  order_number: 'OT-1001',
  customer_name: 'Cliente Uno',
  customer_phone: null,
  customer_ci: null,
  description: 'Instalación de equipo',
  budget_total: 1000,
  budget_currency: 'CUP',
  paid_amount: 0,
  balance: 1000,
  balance_cup: 1000,
  payment_status: 'unpaid',
  status: 'confirmed',
  order_date: '2026-11-01',
  age_days: 10,
  aging_bucket: '0-30',
};

function mockCxcFetch(payload: { data: unknown; kpis?: unknown }) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
}

beforeEach(() => {
  cleanup();
  payableState.data = [];
  payableState.loading = false;
  payableState.error = null;
  payableState.refetch = vi.fn();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('AccountsPayableView — 4 estados canónicos via StateRenderer (CP-CI-006 U1)', () => {
  it('cargando: splash de marca (ViewLoadingSplash), no tabla', () => {
    payableState.loading = true;
    render(<AccountsPayableView />);
    expect(screen.getByText('CARGANDO')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('error: tarjeta canónica con Reintentar funcional (llama refetch)', () => {
    payableState.loading = false;
    payableState.error = 'Fallo de red simulado';
    render(<AccountsPayableView />);
    expect(screen.getByText('Ha ocurrido un error')).toBeTruthy();
    expect(screen.getByText('Fallo de red simulado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(payableState.refetch).toHaveBeenCalledTimes(1);
  });

  it('vacío: mensaje contextual en modo agrupado (default)', () => {
    payableState.loading = false;
    payableState.data = [];
    render(<AccountsPayableView />);
    expect(screen.getByText('No hay cuentas por pagar en esta categoría')).toBeTruthy();
  });

  it('datos (agrupado, default): aging por proveedor con documento cargado', async () => {
    payableState.loading = false;
    payableState.data = [UNIFIED_PAYABLE];
    render(<AccountsPayableView />);
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('datos (lista): tabla de detalle tras alternar a "Detalle"', async () => {
    payableState.loading = false;
    payableState.data = [UNIFIED_PAYABLE];
    render(<AccountsPayableView />);
    fireEvent.click(screen.getByRole('button', { name: /Detalle/ }));
    await waitFor(() => expect(screen.getByText('Proveedor Uno')).toBeTruthy());
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });
});

describe('AccountsReceivableView — 4 estados canónicos via StateRenderer (CP-CI-006 U1)', () => {
  it('cargando: splash de marca (ViewLoadingSplash), no tabla', () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // fetch nunca resuelve → loading persistente
    render(<AccountsReceivableView />);
    expect(screen.getByText('CARGANDO')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('error: tarjeta canónica con Reintentar funcional (reintenta el fetch)', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    render(<AccountsReceivableView />);
    await waitFor(() => expect(screen.getByText('Ha ocurrido un error')).toBeTruthy());
    expect(screen.getByText('HTTP 500')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('vacío: mensaje contextual "Sin cobros pendientes"', async () => {
    mockCxcFetch({ data: [], kpis: KPIS });
    render(<AccountsReceivableView />);
    await waitFor(() => expect(screen.getByText('Sin cobros pendientes')).toBeTruthy());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('datos: tabla con la orden de cobro cargada', async () => {
    mockCxcFetch({ data: [RECEIVABLE], kpis: KPIS });
    render(<AccountsReceivableView />);
    await waitFor(() => expect(screen.getByText('OT-1001')).toBeTruthy());
    expect(screen.getByRole('table')).toBeTruthy();
  });
});
