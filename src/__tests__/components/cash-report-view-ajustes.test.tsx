/**
 * MISIÓN 2026-10-23 (§8) — Ajuste extraordinario desactivado en la VISTA.
 *
 * Renderiza CashReportView (flujo real: tiendas + reporte aplicado) y verifica:
 *   · No administradores: el contenedor NO se renderiza (ni inputs ni envío).
 *   · Administradores: el apartado se MUESTRA en modo deshabilitado — aviso
 *     del flag central, inputs/select deshabilitados y zona de formulario
 *     inaccesible (pointer-events-none).
 *   · El control REAL vive en el backend (ver api/cash-report-adjustments-
 *     disabled.test.ts) — aquí se verifica la presentación coherente.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    fullName: 'Admin Demo',
    activeStoreId: 'store-1',
    memberships: [],
  } as null | { id: string; role: string; fullName: string; activeStoreId: string; memberships: unknown[] },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView: vi.fn(), commissionNavContext: null, setCommissionNavContext: vi.fn() })
      : { setCurrentView: vi.fn(), commissionNavContext: null, setCommissionNavContext: vi.fn() },
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import CashReportView from '@/components/views/terminal/views/cash/CashReportView';
import { CASH_ADJUSTMENT_DISABLED_MSG } from '@/lib/feature-flags';

// ── Fixture: reporte aplicado (mismo contrato que la API) ──
const REPORT = {
  sales: [
    { payment_method: 'cash', currency: 'CUP', transaction_count: 3, total: 20000 },
    { payment_method: 'transfer', currency: 'CUP', transaction_count: 1, total: 5000 },
  ],
  payments: [], commissions: [], production: [],
  totals: { sales_total_cup: 25000, payments_total_cup: 0, commissions_total_cup: 0, production_total_cup: 0, balance_cup: 20000 },
  cash_balance_cup: 20000,
  cash_breakdown: [{ denom: 1000, count: 20, total: 20000 }],
  period: { start: '2026-10-21', end: '2026-10-22' },
};

beforeAll(() => {
  if (!(window.URL as unknown as Record<string, unknown>).createObjectURL) {
    (window.URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:stub');
    (window.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  }
});

async function renderAndApply() {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/api/stores')) {
      return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
    }
    if (String(url).includes('/api/cash-report?')) {
      return Promise.resolve(REPORT);
    }
    return Promise.resolve({});
  });
  const user = userEvent.setup();
  await act(async () => { render(<CashReportView />); });
  const desde = document.getElementById('cr-sd') as HTMLInputElement;
  await act(async () => { fireEvent.change(desde, { target: { value: '2026-10-21' } }); });
  const hasta = document.getElementById('cr-ed') as HTMLInputElement;
  await act(async () => { fireEvent.change(hasta, { target: { value: '2026-10-22' } }); });
  await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
  return { user };
}

describe('MISIÓN 2026-10-23 §8 — Ajuste extraordinario desactivado (vista)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 'u-1', role: 'admin', fullName: 'Admin Demo', activeStoreId: 'store-1', memberships: [] };
    document.body.innerHTML = '';
  });

  it('ADMIN: el contenedor se muestra en modo DESHABILITADO con el aviso del flag central', async () => {
    await renderAndApply();
    const section = await waitFor(() => {
      const el = document.querySelector('[data-testid="ajustes-extraordinarios"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // Aviso visible con el MENSAJE ÚNICO del flag central (misma fuente que la API)
    const notice = document.querySelector('[data-testid="ajustes-extraordinarios-desactivado"]');
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toBe(CASH_ADJUSTMENT_DISABLED_MSG);
    // aria-disabled marca el apartado como inactivo
    expect(section.getAttribute('aria-disabled')).toBe('true');
  });

  it('ADMIN: los controles quedan deshabilitados (dirección/importe/nota)', async () => {
    await renderAndApply();
    await waitFor(() => {
      expect(document.querySelector('[data-testid="ajustes-extraordinarios"]')).toBeTruthy();
    });
    const select = document.querySelector('#adj-direction') as HTMLSelectElement | null;
    const amount = document.querySelector('#adj-amount') as HTMLInputElement | null;
    const note = document.querySelector('#adj-note') as HTMLInputElement | null;
    expect(select?.disabled).toBe(true);
    expect(amount?.disabled).toBe(true);
    expect(note?.disabled).toBe(true);
  });

  it('NO ADMIN: el contenedor NO se renderiza (oculto por completo — §8)', async () => {
    authState.user = { id: 'u-2', role: 'clerk', fullName: 'Clero Demo', activeStoreId: 'store-1', memberships: [] };
    await renderAndApply();
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    // El contenedor no existe para el rol no administrador
    expect(document.querySelector('[data-testid="ajustes-extraordinarios"]')).toBeNull();
    expect(document.querySelector('[data-testid="ajustes-extraordinarios-desactivado"]')).toBeNull();
  });
});
