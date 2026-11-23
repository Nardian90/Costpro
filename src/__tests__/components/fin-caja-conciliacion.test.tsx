/**
 * ADNEGOCIO-UI 2026-11-23 — Bloques de caja centralizados en Conciliación
 * (misión §2: orden 1 Valoración · 2 Caja física).
 *
 * Porta las reglas de la MISIÓN P0 «EFECTIVO FANTASMA» (2026-10-26), cuyo
 * componente original (CajaStatusStrip del Inicio) se retiró de ahí:
 *  · El KPI PRINCIPAL de disponibilidad es el SALDO FÍSICO DEL LIBRO por
 *    moneda (physical_cash del RPC get_cash_shift_expected). CUP y USD se
 *    muestran SEPARADOS — nunca sumados como equivalentes.
 *  · El esperado canónico NO se presenta como billetes; su diferencia frente
 *    al libro vive en el bloque 1 «Diferencia de valoración contable CUP —
 *    no representa efectivo disponible», con las TRES cifras del estado
 *    (diferencia, esperado, libro físico), ventana identificada y trazabilidad.
 *
 * Regla inviolable conservada: con libro físico CUP = 0 y USD = 0 (caso
 * ENERVIDA), la disponibilidad mostrada es 0,00 CUP y 0,00 USD — aunque el
 * residuo de valoración canónico sea 2.820,00 CUP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinCajaFisicaBlock } from '@/components/views/terminal/views/financial_statements/FinCajaFisicaBlock';
import { FinValoracionBlock } from '@/components/views/terminal/views/financial_statements/FinValoracionBlock';

// ── MOCK: supabase client ──
const fromMock = vi.fn();
const rpcMock = vi.fn();

function chain(result: { data: unknown; error: unknown | null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'order', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  for (const m of ['range', 'single', 'maybeSingle']) {
    c[m] = vi.fn(() => terminal());
  }
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const mockSetCurrentView = vi.fn();
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    roles: ['admin'],
    fullName: 'Ana Torres',
    activeStoreId: 'store-1',
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView: mockSetCurrentView, setFinancialOpeningNavContext: vi.fn() })
      : { setCurrentView: mockSetCurrentView, setFinancialOpeningNavContext: vi.fn() },
}));

function renderWithQc(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const SHIFT_EXPECTED_BASE = {
  window_start: '2026-10-26T14:00:00Z',
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
  opening_balance_usd: 0,
  expected_cash_usd: 0,
};

const FLOW_SUMMARY_BASE = {
  window_start: '1970-01-01T00:00:00Z',
  has_pending_shift: false,
  opening_balance: 0,
  expected_cash: 0,
  fondo_vigente: 0,
  fondo_ingresado: 0,
  fondo_devuelto: 0,
};

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  mockSetCurrentView.mockClear();
  fromMock.mockReset().mockImplementation((table: string) => {
    // useActiveShift: sin turno abierto (caso ENERVIDA al 2026-10-26)
    if (table === 'cash_closures') return chain({ data: null, error: null });
    return chain({ data: [], error: null });
  });
  rpcMock.mockReset().mockImplementation((fn: string) => {
    if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
    return Promise.resolve({ data: SHIFT_EXPECTED_BASE, error: null });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ADNEGOCIO-UI · Bloque 2 «Caja — Respaldo físico y disponibilidad» (Conciliación)', () => {
  it('muestra el respaldo físico POR MONEDA (CUP y USD del libro, sin sumarlos)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: { ...SHIFT_EXPECTED_BASE, physical_cash: { CUP: 1500.5, USD: 100 } },
        error: null,
      });
    });
    renderWithQc(<FinCajaFisicaBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-caja-fisico-cup')).toHaveTextContent('$1,500.50'));
    expect(screen.getByTestId('fin-caja-fisico-usd')).toHaveTextContent('100.00 USD en billetes');
    // El USD es un renglón separado por moneda, NUNCA sumado al CUP
    expect(screen.getByText('Efectivo físico disponible')).toBeTruthy();
    expect(screen.queryByText(/CUP \+ USD/)).toBeNull();
  });

  it('CASO ENERVIDA: libro 0/0 → disponibilidad 0,00 CUP y 0.00 USD (aunque el residuo canónico sea 2.820)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: {
          ...SHIFT_EXPECTED_BASE,
          expected_cash: 2819.997799999995,
          physical_cash: { CUP: 0, USD: 0 },
          valuation_residual_cup: 2820,
        },
        error: null,
      });
    });
    renderWithQc(<FinCajaFisicaBlock />);
    // REGLA INVOLABLE: la disponibilidad principal es 0,00 CUP — no 2.820
    await waitFor(() => expect(screen.getByTestId('fin-caja-fisico-cup')).toHaveTextContent('$0.00'));
    expect(screen.getByTestId('fin-caja-fisico-usd')).toHaveTextContent('0.00 USD en billetes');
  });

  it('fondo de cambio vigente + mensaje sin turno (declarar al abrir o vía Ingresos/Egresos)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: { ...FLOW_SUMMARY_BASE, fondo_vigente: 250 }, error: null });
      return Promise.resolve({ data: SHIFT_EXPECTED_BASE, error: null });
    });
    renderWithQc(<FinCajaFisicaBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-caja-fondo')).toHaveTextContent('$250.00'));
    expect(screen.getByText('Sin turno: decláralo al abrir el turno o vía Ingresos/Egresos')).toBeTruthy();
    expect(screen.getByText('Sin turno abierto')).toBeTruthy();
  });

  it('acceso a Ingresos/Egresos y a Caja (trazabilidad del respaldo)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderWithQc(<FinCajaFisicaBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-caja-fondo')).toHaveTextContent('$0.00'));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Ingresos/Egresos' }));
    expect(mockSetCurrentView).toHaveBeenCalledWith('ingresos_egresos');
    fireEvent.click(screen.getByRole('button', { name: /Turno de caja abierto|Sin turno abierto/ }));
    expect(mockSetCurrentView).toHaveBeenCalledWith('cash');
  });
});

describe('ADNEGOCIO-UI · Bloque 1 «Diferencia de valoración contable CUP» (Conciliación)', () => {
  it('muestra las TRES cifras del estado: diferencia, esperado canónico y libro físico', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: {
          ...SHIFT_EXPECTED_BASE,
          expected_cash: 26036090,
          physical_cash: { CUP: 25606190, USD: 428 },
          valuation_residual_cup: 429900,
        },
        error: null,
      });
    });
    renderWithQc(<FinValoracionBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-valoracion-cifra')).toHaveTextContent('$429,900.00'));
    const figuras = screen.getByTestId('fin-valoracion-figures').textContent ?? '';
    expect(figuras).toContain('$26,036,090.00'); // esperado canónico
    expect(figuras).toContain('$25,606,190.00'); // libro físico
    expect(figuras).toContain('$429,900.00'); // diferencia
    // Explicación conceptual conservada
    expect(screen.getByText(/no representa efectivo disponible ni\s*demuestra dinero faltante/i)).toBeTruthy();
    // Ventana acumulada al no haber turno (mensaje conservado)
    expect(screen.getByText(/Sin turno abierto: ventana acumulada desde el último cierre u origen/)).toBeTruthy();
    // Trazabilidad accesible
    expect(screen.getByText(/movimientos que explican el saldo/)).toBeTruthy();
  });

  it('sin diferencia de valoración: cifra $0.00 y sin tono de alerta', async () => {
    renderWithQc(<FinValoracionBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-valoracion-cifra')).toHaveTextContent('$0.00'));
    const bloque = screen.getByTestId('fin-valoracion-block');
    expect(bloque.className).not.toMatch(/warning/);
  });

  it('la cifra principal de disponibilidad del bloque 2 NO es el esperado canónico (regla P0 intacta)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: {
          ...SHIFT_EXPECTED_BASE,
          expected_cash: 2819.9978,
          physical_cash: { CUP: 0, USD: 0 },
          valuation_residual_cup: 2820,
        },
        error: null,
      });
    });
    const r1 = renderWithQc(<FinCajaFisicaBlock />);
    await waitFor(() => expect(screen.getByTestId('fin-caja-fisico-cup')).toHaveTextContent('$0.00'));
    r1.unmount();
    // El bloque 1 clasifica el residuo como VALORACIÓN, no como efectivo
    renderWithQc(<FinValoracionBlock />);
    await waitFor(() => expect(screen.getAllByTestId('fin-valoracion-cifra')[0]).toHaveTextContent('$2,820.00'));
    expect(screen.getAllByText(/Diferencia de valoración/).length).toBeGreaterThanOrEqual(1);
  });
});
