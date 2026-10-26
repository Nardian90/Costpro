/**
 * MISIÓN CP-CASH-OPENING-001 — CashClosureView · APERTURA DE TURNO.
 *
 * Contrato verificado (Fases C/F del brief — escenarios simulados, sin datos
 * reales ni BD):
 *   E1. Libro 3.000 CUP + conteo 0 → diferencia −3.000 documentada contra el
 *       LIBRO (no contra el canónico); apertura BLOQUEADA hasta causa ≥ 10
 *       caracteres; NUNCA un ingreso automático de 3.000.
 *   E2. Declarado 5.000 vs libro 3.000 → exceso +2.000 exige causa; sin
 *       ajuste automático del conteo ni movimientos compensatorios.
 *   E3. Declarado 3.000 = contado 3.000 → base inequívoca, sin nota exigida,
 *       sin documento de ingreso por abrir el turno.
 *   E4. Residuo de valoración 2.820 CUP con libro 0/0 (incidente real): el
 *       prefill del «Fondo Inicial de Efectivo (CUP)» es 0,00 (libro físico),
 *       NUNCA 2.820; el residuo vive en el bloque informativo «no es efectivo
 *       disponible»; «Otros Fondos Iniciales (opcional)» YA NO existe.
 *   E5. Reapertura tras cierre con efectivo heredado: prefill = libro físico
 *       acumulado (incluye el efectivo previo al último cierre), no la
 *       ventana canónica desde el cierre.
 *   E6. Sin movimientos y sin cierres previos: prefill 0; el acumulado
 *       canónico NO se convierte en fondo inicial ficticio.
 *   + Idempotencia: reintento con los mismos valores reutiliza la clave;
 *     cambio de valores la regenera.
 *   + Degradación: sin physical_cash (migración no aplicada) el prefill cae
 *     al saldo heredado estimado y el hint lo declara.
 *
 * Los hooks de datos se mockean a nivel módulo: esta suite prueba la LÓGICA
 * de la vista (bases, comparaciones, bloqueos, payloads). La vía autoritativa
 * (RPC open_cash_shift) y su fallback tienen suites propias (ruta + hook).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils';

// ── Estado compartido con las fábricas de mocks (hoisted) ──
const hoisted = vi.hoisted(() => ({
  expected: null as Record<string, unknown> | null,
  activeShift: null as Record<string, unknown> | null,
  openMutatePayloads: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/api/useCashClosures', () => ({
  useCashClosures: () => ({ data: [], isLoading: false, refetch: vi.fn(async () => ({})), isRefetching: false, error: null }),
  useCreateCashClosure: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCashClosure: () => ({ mutate: vi.fn(), isPending: false }),
  useSalesSinceLastClosure: () => ({ data: null, isLoading: false, refetch: vi.fn(async () => ({})), isRefetching: false, error: null }),
  useCashShiftExpected: () => ({ data: hoisted.expected, isLoading: false, refetch: vi.fn(async () => ({})), isRefetching: false, error: null }),
  useOpenCashShift: () => ({
    // Capturador: la suite inspecciona el payload que irá a /api/cash-closures/open
    mutate: (payload: Record<string, unknown>) => { hoisted.openMutatePayloads.push(payload); },
    isPending: false,
  }),
}));

vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: () => ({ data: hoisted.activeShift, isLoading: false }),
}));

const mockSetCurrentView = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      user: {
        id: 'u-1', role: 'admin', roles: ['admin'], fullName: 'Ana Torres',
        activeStoreId: 'store-1',
        memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }],
      },
    };
    return sel ? sel(state) : state;
  },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => (props: Record<string, unknown>) => React.createElement(tag, props),
  }),
}));

import CashClosureView from '@/components/views/terminal/views/cash_closure/CashClosureView';

beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

/** Fixture del RPC get_cash_shift_expected (sin turno abierto). */
function makeExpected(over: Record<string, unknown> = {}) {
  return {
    window_start: '1970-01-01T00:00:00Z',
    has_pending_shift: false,
    opening_balance: 0,
    total_sales: 0,
    cash_sales: 0,
    cash_outflows: 0,
    cash_production: 0,
    cash_commissions: 0,
    cash_flow_in: 0,
    cash_flow_out: 0,
    cash_refunds: 0,
    voucher_refunds: 0,
    expected_cash: 0,
    transfer_sales: 0,
    zelle_sales: 0,
    expected_total: 0,
    expected_cash_usd: 0,
    physical_cash: { CUP: 0, USD: 0 },
    valuation_residual_cup: 0,
    ...over,
  };
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CashClosureView />
    </QueryClientProvider>,
  );
}

const cupInput = () => screen.getByLabelText('Fondo Inicial de Efectivo (CUP)') as HTMLInputElement;
const usdInput = () => screen.getByLabelText('Fondo Inicial USD (físico)') as HTMLInputElement;
const btnAbrir = () => screen.getByTestId('btn-abrir-turno-vacio') as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  hoisted.expected = null;
  hoisted.activeShift = null;
  hoisted.openMutatePayloads.length = 0;
  mockSetCurrentView.mockReset();
});

describe('CP-CASH-OPENING-001 · E4 — residuo de valoración 2.820 con libro 0/0 (incidente real)', () => {
  it('el prefill del fondo inicial es 0,00 CUP / 0,00 USD (libro físico), no el canónico 2.820', () => {
    hoisted.expected = makeExpected({
      // Incidente ENERVIDA-VITALLCONS: canónico 2.820 (367 USD cobrados a
      // tasas históricas − entregados a 800), libro físico 0/0.
      expected_cash: 2820,
      cash_sales: 2820,
      physical_cash: { CUP: 0, USD: 0 },
      valuation_residual_cup: 2820,
    });
    renderView();
    expect(cupInput().value).toBe(''); // 0 prellenado → input vacío (|| '')
    expect(usdInput().value).toBe('');
    // El residuo vive clasificado como valoración contable, no como fondo
    const residual = screen.getByTestId('apertura-residual');
    expect(residual.textContent).toContain('no es efectivo disponible');
    expect(residual.textContent).toContain(formatCurrency(2820));
    expect(residual.textContent).toContain(formatCurrency(0));
  });

  it('«Otros Fondos Iniciales (opcional)» YA NO existe en la apertura (Fase D)', () => {
    hoisted.expected = makeExpected();
    renderView();
    expect(screen.queryByLabelText(/Otros Fondos Iniciales/i)).toBeNull();
    // En apertura no se declara el lado vouchers (solo existe en el cierre)
    expect(screen.queryByLabelText(/Transferencias Contadas/i)).toBeNull();
  });

  it('conciliación contra el libro con cuadre perfecto: sin motivo exigido y apertura habilitada', async () => {
    hoisted.expected = makeExpected({
      expected_cash: 2820,
      physical_cash: { CUP: 0, USD: 0 },
      valuation_residual_cup: 2820,
    });
    renderView();
    expect(screen.getByTestId('apertura-conciliacion')).toBeTruthy();
    expect(screen.queryByTestId('apertura-motivo')).toBeNull();
    expect(screen.queryByTestId('apertura-motivo-aviso')).toBeNull();
    // Abrir + confirmar → payload físico 0/0 sin diferencia
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const payload = hoisted.openMutatePayloads.at(-1)!;
    expect(payload.counted_cup).toBe(0);
    expect(payload.counted_usd).toBe(0);
    expect(payload.difference_note).toBeNull();
    // El legado (fallback) tampoco lleva vouchers ni residuo como fondo
    const legacy = payload.legacy_insert as Record<string, unknown>;
    expect(legacy.declared_vouchers).toBe(0);
    expect(legacy.opening_balance).toBe(0);
    expect(legacy.opening_balance_cup).toBe(0);
    expect(legacy.opening_difference_cup).toBeNull();
  });
});

describe('CP-CASH-OPENING-001 · E1 — declarar 0 con libro 3.000: discrepancia documentada, jamás ingreso automático', () => {
  it('bloquea la apertura hasta la causa (≥10 chars) y envía la diferencia documentada', async () => {
    hoisted.expected = makeExpected({
      expected_cash: 3000,
      physical_cash: { CUP: 3000, USD: 0 },
    });
    renderView();
    expect(Number(cupInput().value)).toBe(3000); // prefill = libro
    await userEvent.clear(cupInput());
    await userEvent.type(cupInput(), '0');
    expect(screen.getByTestId('apertura-motivo')).toBeTruthy();
    expect(screen.getByTestId('apertura-motivo-aviso')).toBeTruthy();
    expect(btnAbrir().disabled).toBe(true);
    // Causa insuficiente (<10) sigue bloqueada
    await userEvent.type(screen.getByLabelText('Causa de la diferencia de apertura'), 'corta');
    expect(btnAbrir().disabled).toBe(true);
    // Causa válida habilita
    await userEvent.clear(screen.getByLabelText('Causa de la diferencia de apertura'));
    await userEvent.type(screen.getByLabelText('Causa de la diferencia de apertura'), 'Faltan billetes por entrega no registrada');
    expect(btnAbrir().disabled).toBe(false);
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const payload = hoisted.openMutatePayloads.at(-1)!;
    expect(payload.counted_cup).toBe(0);
    expect(payload.difference_note).toBe('Faltan billetes por entrega no registrada');
    const legacy = payload.legacy_insert as Record<string, unknown>;
    expect(legacy.opening_difference_cup).toBe(-3000);
    expect(legacy.opening_difference_note).toBe('Faltan billetes por entrega no registrada');
  });
});

describe('CP-CASH-OPENING-001 · E2 — declarado 5.000 vs contado/libro 3.000: exceso documentado sin autoajuste', () => {
  it('exige causa para el exceso de 2.000 y envía la diferencia tal cual', async () => {
    hoisted.expected = makeExpected({
      expected_cash: 3000,
      physical_cash: { CUP: 3000, USD: 0 },
    });
    renderView();
    await userEvent.clear(cupInput());
    await userEvent.type(cupInput(), '5000');
    expect(screen.getByTestId('apertura-motivo')).toBeTruthy();
    expect(btnAbrir().disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Causa de la diferencia de apertura'), 'Sobrante por vuelto sin registrar');
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const payload = hoisted.openMutatePayloads.at(-1)!;
    expect(payload.counted_cup).toBe(5000);
    expect(payload.difference_note).toBe('Sobrante por vuelto sin registrar');
    const legacy = payload.legacy_insert as Record<string, unknown>;
    expect(legacy.opening_difference_cup).toBe(2000);
    // El conteo declarado NO se ajusta al libro (sin autoajuste silencioso)
    expect(legacy.opening_balance_cup).toBe(5000);
  });
});

describe('CP-CASH-OPENING-001 · E3 — declarado = contado = 3.000: base inequívoca, sin nota, sin duplicación', () => {
  it('la apertura cuadra sin motivo y el fondo entra UNA sola vez (sin documentos de caja)', async () => {
    hoisted.expected = makeExpected({
      expected_cash: 3000,
      physical_cash: { CUP: 3000, USD: 0 },
    });
    renderView();
    expect(Number(cupInput().value)).toBe(3000);
    expect(screen.queryByTestId('apertura-motivo')).toBeNull();
    await userEvent.click(btnAbrir());
    // El modal confirma fondo POR MONEDA contra el libro, sin sumar monedas
    expect(screen.getByText('Fondo inicial declarado (por moneda)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const payload = hoisted.openMutatePayloads.at(-1)!;
    expect(payload.counted_cup).toBe(3000);
    expect(payload.difference_note).toBeNull();
    expect(hoisted.openMutatePayloads.length).toBe(1); // una sola apertura
  });
});

describe('CP-CASH-OPENING-001 · E5 — reapertura tras cierre: el prefill hereda el LIBRO acumulado', () => {
  it('prefilla 4.000 (libro acumulado) y no 1.000 (ventana canónica desde el último cierre)', () => {
    hoisted.expected = makeExpected({
      // Tras un cierre: ventana canónica = solo ventas del turno anterior
      // (1.000), pero el cajón contiene el efectivo heredado (4.000).
      window_start: '2026-10-25T21:00:00Z',
      expected_cash: 1000,
      physical_cash: { CUP: 4000, USD: 100 },
      expected_cash_usd: 100,
    });
    renderView();
    expect(Number(cupInput().value)).toBe(4000);
    expect(Number(usdInput().value)).toBe(100);
  });
});

describe('CP-CASH-OPENING-001 · E6 — sin movimientos y sin cierres previos: fondo 0, sin fondo ficticio', () => {
  it('con libro 0/0 el prefill es 0 y la apertura queda habilitada sin nota', async () => {
    hoisted.expected = makeExpected();
    renderView();
    expect(cupInput().value).toBe('');
    expect(usdInput().value).toBe('');
    expect(screen.queryByTestId('apertura-residual')).toBeNull();
    expect(screen.queryByTestId('apertura-motivo')).toBeNull();
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const payload = hoisted.openMutatePayloads.at(-1)!;
    expect(payload.counted_cup).toBe(0);
    expect(payload.difference_note).toBeNull();
  });
});

describe('CP-CASH-OPENING-001 · idempotencia de la apertura lógica', () => {
  it('reintento con los mismos valores reutiliza la clave; cambiar valores la regenera', async () => {
    hoisted.expected = makeExpected({ expected_cash: 3000, physical_cash: { CUP: 3000, USD: 0 } });
    renderView();
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const key1 = (hoisted.openMutatePayloads.at(-1)!.idempotency_key as string);
    expect(key1).toMatch(/^open-[0-9a-f-]{36}$/);
    // Reintento con los mismos valores → misma clave (deduplicación 501/timeout)
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    expect(hoisted.openMutatePayloads.at(-1)!.idempotency_key).toBe(key1);
    // Cambio de valor declarado → nueva apertura lógica → nueva clave
    await userEvent.clear(cupInput());
    await userEvent.type(cupInput(), '3100');
    await userEvent.type(screen.getByLabelText('Causa de la diferencia de apertura'), 'Ajuste por conteo billetes');
    await userEvent.click(btnAbrir());
    await userEvent.click(screen.getByRole('button', { name: /sí, abrir turno/i }));
    const key3 = (hoisted.openMutatePayloads.at(-1)!.idempotency_key as string);
    expect(key3).toMatch(/^open-[0-9a-f-]{36}$/);
    expect(key3).not.toBe(key1);
  });
});

describe('CP-CASH-OPENING-001 · degradación sin physical_cash (migración no aplicada)', () => {
  it('el prefill cae al saldo heredado estimado y el hint lo declara explícitamente', () => {
    hoisted.expected = makeExpected({
      expected_cash: 2820,
      physical_cash: undefined, // entorno sin 20261026200000
      valuation_residual_cup: undefined,
    });
    renderView();
    expect(Number(cupInput().value)).toBe(2820);
    expect(screen.getByText(/libro físico no disponible en este entorno/i)).toBeTruthy();
    expect(screen.queryByTestId('apertura-residual')).toBeNull();
  });
});
