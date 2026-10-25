/**
 * MISIÓN P0 «EFECTIVO FANTASMA» (2026-10-26) — CajaStatusStrip (Inicio → Caja).
 *
 * El KPI PRINCIPAL de disponibilidad es el SALDO FÍSICO DEL LIBRO por moneda
 * (physical_cash del RPC get_cash_shift_expected — la misma lectura que
 * autorizan los RPC del cajón). El esperado canónico NO se presenta como
 * billetes: su diferencia frente al libro vive en el bloque secundario
 * «Diferencia de valoración contable CUP — no representa efectivo
 * disponible».
 *
 * Regla inviolable (misión §3): con libro físico CUP = 0 y USD = 0 (caso
 * ENERVIDA), la disponibilidad mostrada es 0,00 CUP y 0,00 USD — aunque el
 * residuo de valoración canónico sea 2.820,00 CUP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CajaStatusStrip } from '@/components/views/terminal/views/dashboard/CajaStatusStrip';

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
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

function renderStrip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CajaStatusStrip />
    </QueryClientProvider>,
  );
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

describe('MISIÓN P0 · CajaStatusStrip — disponibilidad física como KPI principal', () => {
  it('muestra «Efectivo físico disponible» con CUP y USD del libro (physical_cash)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: { ...SHIFT_EXPECTED_BASE, physical_cash: { CUP: 1500.5, USD: 100 } },
        error: null,
      });
    });
    renderStrip();
    await waitFor(() => expect(screen.getByTestId('caja-fisico-cup')).toHaveTextContent('$1,500.50'));
    expect(screen.getByTestId('caja-fisico-usd')).toHaveTextContent('100.00 USD');
    // La etiqueta del bloque principal ya no es «Efectivo esperado (CUP canónico)»
    expect(screen.getByText('Efectivo físico disponible')).toBeTruthy();
    expect(screen.queryByText('Efectivo esperado (CUP canónico)')).toBeNull();
  });

  it('CASO ENERVIDA: libro 0/0 + residuo 2.820 → disponibilidad 0,00 CUP y residuo SECUNDARIO', async () => {
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
    renderStrip();
    // REGLA INVOLABLE: la disponibilidad principal es 0,00 CUP — no 2.820
    await waitFor(() => expect(screen.getByTestId('caja-fisico-cup')).toHaveTextContent('$0.00'));
    expect(screen.getByTestId('caja-fisico-usd')).toHaveTextContent('0.00 USD');
    // El residuo vive en el bloque SECUNDARIO clasificado como valoración
    const bloque = await screen.findByTestId('caja-valoracion-residual');
    expect(bloque).toHaveTextContent('Diferencia de valoración contable CUP — no representa efectivo disponible');
    expect(screen.getByTestId('caja-valoracion-cifra')).toHaveTextContent('$2,820.00');
    // Trazabilidad: enlace a los movimientos que explican el saldo
    expect(bloque).toHaveTextContent(/movimientos que explican el saldo/);
  });

  it('sin residuo de valoración: el bloque secundario NO aparece', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: { ...SHIFT_EXPECTED_BASE, expected_cash: 100, physical_cash: { CUP: 100, USD: 0 }, valuation_residual_cup: 0 },
        error: null,
      });
    });
    renderStrip();
    await waitFor(() => expect(screen.getByTestId('caja-fisico-cup')).toHaveTextContent('$100.00'));
    expect(screen.queryByTestId('caja-valoracion-residual')).toBeNull();
  });

  it('degradación limpia: sin physical_cash (RPC previo a la migración) muestra «—», sin inventar cifras', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({ data: { ...SHIFT_EXPECTED_BASE, expected_cash: 2820 }, error: null });
    });
    renderStrip();
    await waitFor(() => expect(screen.getByText('Sin turno abierto')).toBeTruthy());
    // NUNCA muestra el canónico como disponible en la degradación
    expect(screen.getByTestId('caja-fisico-cup')).toHaveTextContent('—');
    expect(screen.queryByText('$2,820.00')).toBeNull();
    expect(screen.queryByTestId('caja-valoracion-residual')).toBeNull();
  });

  it('con turno abierto: la base del físico sigue siendo el libro (no la ventana del turno)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cash_closures') {
        return chain({ data: { id: 'c-1', status: 'pendiente', created_at: '2026-10-26T08:00:00Z', opening_balance: 5000 }, error: null });
      }
      return chain({ data: [], error: null });
    });
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_cash_flow_summary') return Promise.resolve({ data: FLOW_SUMMARY_BASE, error: null });
      return Promise.resolve({
        data: {
          ...SHIFT_EXPECTED_BASE,
          has_pending_shift: true,
          expected_cash: 12000,
          physical_cash: { CUP: 12000, USD: 40 },
          valuation_residual_cup: 0,
        },
        error: null,
      });
    });
    renderStrip();
    await waitFor(() => expect(screen.getByText('Turno abierto')).toBeTruthy());
    expect(screen.getByTestId('caja-fisico-cup')).toHaveTextContent('$12,000.00');
    expect(screen.getByTestId('caja-fisico-usd')).toHaveTextContent('40.00 USD');
    expect(screen.getByTestId('caja-fisico-base')).toHaveTextContent(/Libro físico por moneda/);
  });
});
