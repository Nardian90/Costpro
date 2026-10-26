/**
 * exchange-intelligence-view.test.tsx — Pruebas de Inteligencia Cambiaria tras
 * la integración de Diviza y el rediseño visual/accesibilidad (misión
 * IC-DIVIZA 2026-10-26) + IC-DIVIZA-002 (2026-10-26).
 *
 * IC-DIVIZA-002 añade los casos de aceptación de la misión §6:
 *   - (2) Al pulsar «Actualizar BD (7 días)», la captura de Diviza se
 *     ejecuta y la interfaz actualiza la tarjeta SIN intervención adicional.
 *   - (3) BCC OK + Diviza fallido → la notificación identifica el éxito
 *     parcial y el error de Diviza (con la última tasa real y su fecha).
 *   - (4) Diviza OK + BCC fallido → informal visible + fallo oficial informado.
 *   - (5) Fechas consistentes con la FECHA OPERATIVA (civil de Cuba).
 *   - (6) Una fila histórica de elToque (virtual carry-forward) NO desplaza
 *     una captura Diviza más reciente.
 *   - (8) La tarjeta muestra la cotización que la API devolvió, con la hora
 *     de actualización de Diviza y la de captura de CostPro (Cuba).
 *
 * Casos previos conservados: badge honesto, sin dato fiable, arrastre
 * visible, estimada nunca como real, accesibilidad, sistema visual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExchangeIntelligenceView } from '@/components/views/terminal/views/exchange_intelligence/ExchangeIntelligenceView';
import { getOperativeDate, addDaysToDateString } from '@/lib/operative-date';

// ── Mocks ──
vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const useAuthStoreMock = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: Object.assign(
    (...args: unknown[]) => useAuthStoreMock(...args),
    { getState: () => useAuthStoreMock() },
  ),
}));

// fetchRates usa import dinámico de @/store — el mock cubre ambos caminos
// (import estático del componente y dinámico dentro del efecto).

// Lazy tabs usan recharts — se mockean para jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  LineChart: () => <div />,
  AreaChart: () => <div />,
  ComposedChart: () => <div />,
  Line: () => <div />,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ReferenceLine: () => <div />,
  ReferenceArea: () => <div />,
  Cell: () => <div />,
}));

// El componente importa supabaseClient (no se usa en el flujo con API route,
// pero debe estar mockeado para el render)
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

// ── Helpers de datos ──
type RateRow = {
  id: string;
  rate_date: string;
  captured_at: string;
  currency: string;
  source: string;
  segment: string;
  rate: number;
  variation_daily?: number;
  variation_weekly?: number;
  variation_monthly?: number;
  variation_yearly?: number;
  capture_method?: string;
  source_updated_at?: string | null;
  original_rate_date?: string;
};

// IC-DIVIZA-002: «hoy» es la FECHA OPERATIVA (civil de Cuba) — la misma que
// usa el backend. Antes se usaba la fecha UTC y los fixtures divergían de la
// regla de vigencia de la vista cuando UTC ya había cambiado de día.
const TODAY = getOperativeDate();
const YESTERDAY = addDaysToDateString(TODAY, -1);

function divizaRow(
  date: string,
  rate: number,
  currency = 'USD',
  at = 'T12:00:00Z',
  sourceUpdatedAt: string | null = null,
): RateRow {
  return {
    id: `diviza-${date}-${currency}`,
    rate_date: date,
    captured_at: `${date}${at}`,
    currency,
    source: 'Diviza',
    segment: '3',
    rate,
    capture_method: 'real',
    ...(sourceUpdatedAt ? { source_updated_at: sourceUpdatedAt } : {}),
  };
}

function elToqueRow(date: string, rate: number, currency = 'USD'): RateRow {
  return {
    id: `eltoque-${date}-${currency}`,
    rate_date: date,
    captured_at: `${date}T03:32:28Z`,
    currency,
    source: 'elToque',
    segment: '3',
    rate,
    capture_method: 'real',
  };
}

/** Fila VIRTUAL carry-forward tal como la crea la API (captured_at original
 * conservado tras IC-DIVIZA-002; rate_date = fecha operativa). */
function carryForwardRow(base: RateRow, rateDate: string): RateRow {
  return {
    ...base,
    id: `cf-${base.id}`,
    rate_date: rateDate,
    capture_method: 'carry_forward',
    original_rate_date: base.rate_date,
  };
}

function bccRow(date: string, rate: number, currency = 'USD', segment = '3'): RateRow {
  return {
    id: `bcc-${date}-${currency}-${segment}`,
    rate_date: date,
    captured_at: `${date}T18:00:00Z`,
    currency,
    source: 'BCC',
    segment,
    rate,
    capture_method: 'real',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockRatesApi(rates: RateRow[], extra: Record<string, unknown> = {}) {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      rates,
      count: rates.length,
      carry_forward_count: 0,
      carry_forward_dates: [],
      // IC-DIVIZA-002: el backend reporta la fecha operativa.
      operative_date: TODAY,
      ...extra,
    }),
  });
  globalThis.fetch = fetchMock as any;
}

function mockAdmin() {
  const state = {
    user: { id: 'user-1', role: 'admin', name: 'Admin' },
    token: 'test-token',
  };
  useAuthStoreMock.mockImplementation(() => state);
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mockAdmin();
});

describe('ExchangeIntelligenceView — informal Diviza + elToque', () => {
  it('muestra la tasa Diviza de hoy con badge "Real · Diviza"', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      divizaRow(TODAY, 839),
      divizaRow(TODAY, 930, 'EUR'),
      divizaRow(TODAY, 691.62, 'MLC'),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });
    // Badge honesto con proveedor
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
    // NO muestra badge de estimación
    expect(screen.queryByText(/^Estimada$/)).not.toBeInTheDocument();
    // Sin aviso de arrastre (la tasa es de la fecha operativa)
    expect(screen.queryByText(/Usando último valor/i)).not.toBeInTheDocument();
  });

  it('sin registros informales → "Sin dato fiable" en vez de cifra inventada', async () => {
    mockRatesApi([bccRow(TODAY, 380)]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getAllByText(/Sin dato fiable/i).length).toBeGreaterThan(0);
    });
    // Nunca cifra de ejemplo como valor real
    expect(screen.queryByText('650')).not.toBeInTheDocument();
  });

  it('carry-forward del informal antiguo: avisa con fecha operativa y proveedor', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      // La última informal es de ayer (proveedor elToque histórico)
      elToqueRow(YESTERDAY, 675),
      elToqueRow(addDaysToDateString(TODAY, -2), 670),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(
        screen.getByText(/Tasa de la fecha operativa.*no disponible\. Usando último valor real de/i),
      ).toBeInTheDocument();
    });
    // El aviso menciona la procedencia real (badge "Real · elToque")
    expect(screen.getByText(/^Real · elToque$/)).toBeInTheDocument();
    expect(screen.getAllByText(/675/).length).toBeGreaterThan(0);
  });

  it('estimación histórica se etiqueta "Estimada" — nunca "Real"', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      {
        ...elToqueRow(YESTERDAY, 437),
        capture_method: 'estimated',
      },
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText(/^Estimada$/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Real · elToque/i)).not.toBeInTheDocument();
  });

  it('Diviza (hoy) gana a elToque (ayer) por frescura', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      divizaRow(TODAY, 839),
      elToqueRow(YESTERDAY, 675),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });
    // La vigente es Diviza, no la elToque antigua
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
    expect(screen.queryByText(/Real · elToque/i)).not.toBeInTheDocument();
    // Y NO hay arrastre porque la fecha operativa sí tiene Diviza
    expect(screen.queryByText(/Usando último valor/i)).not.toBeInTheDocument();
  });

  // ── IC-DIVIZA-002 · Caso de aceptación 6 ─────────────────────────────
  it('caso 6: una virtual elToque (carry-forward) NO desplaza la captura Diviza real', async () => {
    // Escenario REAL reproducido en producción: la API devuelve la virtual
    // de elToque para la fecha operativa (fuente muerta desde 2026-07-28) y
    // la fila REAL de Diviza del mismo día. La tarjeta debe mostrar Diviza.
    const elToqueJulio = elToqueRow('2026-07-28', 675);
    mockRatesApi([
      bccRow(TODAY, 380),
      divizaRow(TODAY, 840, 'USD', 'T00:11:43Z'),
      divizaRow(TODAY, 925, 'EUR', 'T00:11:43Z'),
      divizaRow(TODAY, 692.79, 'MLC', 'T00:11:43Z'),
      // Virtual de elToque para la fecha operativa — como la crea la API
      // (captured_at ORIGINAL tras IC-DIVIZA-002; con «ahora» antes del fix).
      { ...carryForwardRow(elToqueJulio, TODAY), captured_at: new Date().toISOString() },
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText('840')).toBeInTheDocument();
    });
    // La tarjeta muestra la Diviza REAL, no la virtual elToque de 675
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Real · elToque$/)).not.toBeInTheDocument();
    // Sin arrastre: la captura real es de la fecha operativa
    expect(screen.queryByText(/Usando último valor/i)).not.toBeInTheDocument();
  });

  // ── IC-DIVIZA-002 · Caso de aceptación 8 (contenido de la tarjeta) ──
  // ── IC-DIVIZA-002 · Fila futura legado (bug UTC previo a la misión) ──
  it('una fila FUTURA legado (bug UTC) no gana a la fila de la fecha operativa ni provoca aviso falso', async () => {
    // Estado REAL de producción durante la validación: filas rate_date=TOMORROW
    // capturadas a las 20:28 de Cuba del HOY (bug UTC) + fila correcta de HOY.
    const TOMORROW = addDaysToDateString(TODAY, 1);
    mockRatesApi([
      bccRow(TODAY, 743),
      // Fila futura legado (capturada ANTES que la correcta, sin sello)
      divizaRow(TOMORROW, 840, 'USD', 'T00:28:51Z'),
      // Fila correcta de la fecha operativa (capturada DESPUÉS, con sello)
      divizaRow(TODAY, 840, 'USD', 'T01:18:36Z', '2026-10-25T21:00:00-04:00'),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText('840')).toBeInTheDocument();
    });
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
    // SIN aviso de antigüedad: existe fila de la fecha operativa (prioridad)
    expect(screen.queryByText(/Usando último valor/i)).not.toBeInTheDocument();
    // La hora del proveedor de la fila correcta (no la futura legado sin sello)
    expect(screen.getByTestId('diviza-source-updated')).toBeInTheDocument();
  });

  it('caso 8: la tarjeta muestra la cotización de la API con horas de Diviza y de CostPro (Cuba)', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      divizaRow(TODAY, 840, 'USD', 'T00:28:51Z', '2026-10-25T20:03:00-04:00'),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByText('840')).toBeInTheDocument();
    });
    // Hora de ACTUALIZACIÓN de Diviza (sello del proveedor), visible
    expect(screen.getByTestId('diviza-source-updated')).toBeInTheDocument();
    expect(screen.getByTestId('diviza-source-updated').textContent).toMatch(/Diviza actualizó:/);
    expect(screen.getByTestId('diviza-source-updated').textContent).toMatch(/\(Cuba\)/);
    // Hora de CAPTURA de CostPro (valor diagnóstico), visible
    expect(screen.getByTestId('costpro-captured').textContent).toMatch(/Captura CostPro:/);
    // Procedencia correcta
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
  });
});

// ── IC-DIVIZA-002 · Botón «Actualizar BD (7 días)»: cadena completa ──────
describe('ExchangeIntelligenceView — botón «Actualizar BD (7 días)» (IC-DIVIZA-002)', () => {
  /**
   * Mock de fetch que enruta por URL:
   *  - GET  /api/exchange-rates?...  → `getPayload()` (mutable: permite que
   *    la captura "persista" y el re-fetch devuelva la fila nueva)
   *  - POST /api/exchange-rates/refresh → `refreshPayload` + registra la llamada
   */
  function mockFetchRouter(getPayload: () => RateRow[], refreshPayload: Record<string, unknown>) {
    const calls: Array<{ url: string; method?: string }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method });
      if (u.includes('/api/exchange-rates/refresh')) {
        return { ok: true, json: async () => refreshPayload } as any;
      }
      const rates = getPayload();
      return {
        ok: true,
        json: async () => ({
          rates,
          count: rates.length,
          carry_forward_count: 0,
          carry_forward_dates: [],
          operative_date: TODAY,
        }),
      } as any;
    }) as any;
    return calls;
  }

  /** Abre el abanico del dashboard y pulsa «Actualizar BD (7 días)». */
  async function clickActualizarBD() {
    // El botón vive en el <details> del abanico de segmento (dashboard).
    const summary = await screen.findByText(/Segmento BCC:/i);
    await userEvent.click(summary.closest('summary')!);
    const btn = await screen.findByRole('button', { name: /Ejecutar/i });
    await userEvent.click(btn);
  }

  // ── Caso de aceptación 2 ────────────────────────────────────────────
  it('caso 2: pulsa el botón → captura Diviza real → la tarjeta se actualiza SIN intervención adicional', async () => {
    // ANTES: solo BCC (sin informal de la fecha operativa).
    let rates: RateRow[] = [bccRow(TODAY, 380)];
    // La captura guarda Diviza 840 → el re-fetch la devuelve.
    const calls = mockFetchRouter(
      () => rates,
      {
        success: true,
        partial: false,
        operative_date: TODAY,
        bcc: { ok: true, rows: 6, errors: [] },
        diviza: {
          ok: true,
          rows: 3,
          attempted: true,
          rates: { usd: 840, eur: 925, mlc: 692.79 },
          source_updated_at: '2026-10-25T20:03:00-04:00',
          errors: [],
        },
        captured_count: 9,
        elapsed_ms: 1700,
        dates_processed: [TODAY],
      },
    );
    // Efecto de la persistencia: tras el POST del refresh, el GET devuelve
    // la fila Diviza recién guardada (la vista NO recarga manualmente).
    const originalFetch = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/exchange-rates/refresh') && init?.method === 'POST') {
        rates = [
          bccRow(TODAY, 380),
          divizaRow(TODAY, 840, 'USD', 'T00:28:51Z', '2026-10-25T20:03:00-04:00'),
        ];
      }
      return originalFetch(url, init);
    }) as any;

    render(<ExchangeIntelligenceView />);
    // Estado inicial: sin informal fiable
    await waitFor(() => {
      expect(screen.getAllByText(/Sin dato fiable/i).length).toBeGreaterThan(0);
    });

    await clickActualizarBD();

    // La tarjeta muestra la Diviza recién capturada — sin recarga ni 2ª acción
    await waitFor(() => {
      expect(screen.getByText('840')).toBeInTheDocument();
    });
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();
    // Se llamó al endpoint de captura con days=7 (POST autenticado)
    const refreshCall = calls.find(c => c.url.includes('/api/exchange-rates/refresh'));
    expect(refreshCall).toBeDefined();
    expect(refreshCall!.url).toMatch(/days=7/);
    // Y se volvió a consultar la API de consulta (re-fetch automático)
    const getCalls = calls.filter(c => c.url.includes('/api/exchange-rates?'));
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
    // Toast de éxito completo con la tasa capturada
    const { toast } = await import('sonner');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    const successCall = (toast.success as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(successCall[0])).toMatch(/BCC ✓ · Diviza ✓.*USD=840/);
  });

  // ── Caso de aceptación 3 ────────────────────────────────────────────
  it('caso 3: BCC OK + Diviza fallido → notificación de ÉXITO PARCIAL con el error y la última tasa real', async () => {
    const { toast } = await import('sonner');
    // Hay una tasa Diviza real ANTERIOR (de ayer) — el aviso debe citarla
    // con su FECHA REAL, nunca presentarla como actual.
    const rates: RateRow[] = [bccRow(TODAY, 380), divizaRow(YESTERDAY, 838)];
    mockFetchRouter(
      () => rates,
      {
        success: true,
        partial: true,
        operative_date: TODAY,
        bcc: { ok: true, rows: 6, errors: [] },
        diviza: {
          ok: false,
          rows: 0,
          attempted: true,
          rates: { usd: null, eur: null, mlc: null },
          source_updated_at: null,
          errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
        },
        captured_count: 6,
        elapsed_ms: 1500,
        dates_processed: [TODAY],
      },
    );

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('838')).toBeInTheDocument();
    });

    await clickActualizarBD();

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalled();
    });
    const warnCall = (toast.warning as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(warnCall[0])).toMatch(/Éxito parcial — BCC actualizado, Diviza \(informal\) falló/);
    // El detalle identifica el error de Diviza Y la última tasa real con su fecha
    expect(String(warnCall[1]?.description)).toMatch(/Diviza.*falló:.*no se pudo obtener/i);
    expect(String(warnCall[1]?.description)).toMatch(/Última tasa real: 838 CUP\/USD del/);
    expect(String(warnCall[1]?.description)).toMatch(new RegExp(YESTERDAY));
    // Éxito genérico PROHIBIDO cuando una fuente falla
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ── Caso de aceptación 4 ────────────────────────────────────────────
  it('caso 4: Diviza OK + BCC fallido → informal visible y fallo oficial informado por separado', async () => {
    const { toast } = await import('sonner');
    const rates: RateRow[] = [bccRow(YESTERDAY, 380), divizaRow(TODAY, 840)];
    mockFetchRouter(
      () => rates,
      {
        success: true,
        partial: true,
        operative_date: TODAY,
        bcc: { ok: false, rows: 0, errors: ['No BCC data for ' + TODAY] },
        diviza: {
          ok: true,
          rows: 3,
          attempted: true,
          rates: { usd: 840, eur: 925, mlc: 692.79 },
          source_updated_at: '2026-10-25T20:03:00-04:00',
          errors: [],
        },
        captured_count: 3,
        elapsed_ms: 1200,
        dates_processed: [TODAY],
      },
    );

    render(<ExchangeIntelligenceView />);
    // La informal de Diviza sigue visible
    await waitFor(() => {
      expect(screen.getByText('840')).toBeInTheDocument();
    });
    expect(screen.getByText(/Real · Diviza/i)).toBeInTheDocument();

    await clickActualizarBD();

    // Aviso del fallo OFICIAL por separado — la informal no se oculta
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalled();
    });
    const warnCall = (toast.warning as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(warnCall[0])).toMatch(/Éxito parcial — Diviza actualizado, BCC \(oficial\) falló/);
    expect(String(warnCall[1]?.description)).toMatch(/No BCC data/);
    expect(screen.getByText('840')).toBeInTheDocument(); // sigue visible
  });

  it('ambas fuentes fallidas → toast de error honesto (éxito NUNCA falso)', async () => {
    const { toast } = await import('sonner');
    mockFetchRouter(
      () => [bccRow(YESTERDAY, 380)],
      {
        success: false,
        partial: false,
        operative_date: TODAY,
        bcc: { ok: false, rows: 0, errors: ['No BCC data for ' + TODAY] },
        diviza: { ok: false, rows: 0, attempted: true, rates: { usd: null }, errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'] },
        captured_count: 0,
        elapsed_ms: 900,
        dates_processed: [TODAY],
      },
    );

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('380')).toBeInTheDocument();
    });

    await clickActualizarBD();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    const errCall = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(errCall[0])).toMatch(/Captura fallida — ni BCC ni Diviza/i);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe('ExchangeIntelligenceView — sistema visual y accesibilidad', () => {
  it('no contiene acentos morados ni fondos arcoíris en el DOM', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      divizaRow(TODAY, 839),
    ]);

    const { container } = render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    const allClassNames = Array.from(container.querySelectorAll('[class]'))
      .map(el => el.getAttribute('class') || '')
      .join(' ');

    // Sin morados/violetas (rediseño: un solo acento primary)
    expect(allClassNames).not.toMatch(/purple|violet|fuchsia/);
    // Sin fondos con gradiente multicolor
    expect(allClassNames).not.toMatch(/bg-gradient-to/);
  });

  it('tabs accesibles: role=tab, aria-selected y navegación por teclado', async () => {
    mockRatesApi([bccRow(TODAY, 380), divizaRow(TODAY, 839)]);

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
    const dashboardTab = tabs.find(t => t.textContent?.includes('Dashboard'));
    expect(dashboardTab).toBeDefined();
    expect(dashboardTab).toHaveAttribute('aria-selected', 'true');
    // El resto no seleccionado
    const other = tabs.find(t => t.textContent?.includes('Histórico'));
    expect(other).toHaveAttribute('aria-selected', 'false');
  });

  it('botón de refresco accesible con aria-label y área táctil ≥44px', async () => {
    mockRatesApi([bccRow(TODAY, 380), divizaRow(TODAY, 839)]);

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    const refresh = screen.getByRole('button', { name: /Refrescar tasas/i });
    expect(refresh).toBeInTheDocument();
    expect(refresh.getAttribute('class')).toMatch(/min-h-\[44px\]/);
    expect(refresh.getAttribute('class')).toMatch(/min-w-\[44px\]/);
  });

  it('Configuración (admin): estados del proveedor BCC y Diviza diferenciados', async () => {
    mockRatesApi([bccRow(TODAY, 380), divizaRow(TODAY, 839)]);

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    // Abrir tab Configuración
    const tabs = screen.getAllByRole('tab');
    const configTab = tabs.find(t => t.textContent?.includes('Configuración'));
    expect(configTab).toBeDefined();
    await userEvent.click(configTab!);

    await waitFor(() => {
      // Proveedores con su estado (los nombres de sección son únicos)
      expect(screen.getByText(/^BCC — Oficial$/i)).toBeInTheDocument();
      expect(screen.getByText(/^Informal — Diviza$/i)).toBeInTheDocument();
      expect(screen.getByText(/Actualizada y capturada/i)).toBeInTheDocument();
      expect(screen.getAllByText(/cubadivisas\.com/i).length).toBeGreaterThan(0);
    });

    // Acciones claras: qué actualiza y con qué fuente
    expect(screen.getByText(/Consultar y actualizar tasas actuales/i)).toBeInTheDocument();
    expect(screen.getByText(/Capturar informal desde el proveedor activo/i)).toBeInTheDocument();
    expect(screen.getByText(/Importar datos históricos por Excel/i)).toBeInTheDocument();
  });

  it('Configuración: proveedor antiguo → estado "Último valor conocido"', async () => {
    mockRatesApi([
      bccRow(YESTERDAY, 380),
      elToqueRow(addDaysToDateString(TODAY, -5), 675),
    ]);

    render(<ExchangeIntelligenceView />);
    // Hay datos (antiguos): 675 en arrastre — NO "sin dato"
    await waitFor(() => {
      expect(screen.getAllByText(/675/).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/no disponible\. Usando último valor/i).length,
      ).toBeGreaterThanOrEqual(2); // BCC e informal
    });

    const tabs = screen.getAllByRole('tab');
    const configTab = tabs.find(t => t.textContent?.includes('Configuración'));
    await userEvent.click(configTab!);

    await waitFor(() => {
      const staleBadges = screen.getAllByText(/Último valor conocido \(antiguo\)/i);
      expect(staleBadges.length).toBeGreaterThanOrEqual(2); // BCC e informal
    });
  });

  it('el botón "Capturar informal" llama al endpoint scrape-diviza', async () => {
    mockRatesApi([bccRow(TODAY, 380), divizaRow(TODAY, 839)]);
    const calls: Array<{ url: string; method?: string }> = [];

    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes('/api/exchange-rates?')) {
        return {
          ok: true,
          json: async () => ({ rates: [bccRow(TODAY, 380), divizaRow(TODAY, 839)], count: 2, carry_forward_count: 0 }),
        } as any;
      }
      if (String(url).includes('/api/exchange-rates/scrape-diviza')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            provider: 'Diviza',
            captured: 3,
            rates: { usd: 840, eur: 931, mlc: 692 },
            sourceUpdatedAt: '2026-10-26T12:30:00-04:00',
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab');
    const configTab = tabs.find(t => t.textContent?.includes('Configuración'));
    await userEvent.click(configTab!);

    const captureBtn = await screen.findByRole('button', { name: /Capturar informal/i });
    await userEvent.click(captureBtn);

    await waitFor(() => {
      expect(calls.some(c => c.url.includes('/api/exchange-rates/scrape-diviza'))).toBe(true);
    });
  });

  it('error de captura visible: el toast de error menciona que se conserva la última tasa', async () => {
    mockRatesApi([bccRow(TODAY, 380), divizaRow(TODAY, 839)]);
    const { toast } = await import('sonner');

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/api/exchange-rates?')) {
        return {
          ok: true,
          json: async () => ({ rates: [bccRow(TODAY, 380), divizaRow(TODAY, 839)], count: 2, carry_forward_count: 0 }),
        } as any;
      }
      if (String(url).includes('/api/exchange-rates/scrape-diviza')) {
        return {
          ok: false,
          status: 502,
          json: async () => ({
            error: 'Diviza no devolvió una cotización válida (error de conexión o de extracción). No se guardó ningún valor.',
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;

    render(<ExchangeIntelligenceView />);
    await waitFor(() => {
      expect(screen.getByText('839')).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab');
    const configTab = tabs.find(t => t.textContent?.includes('Configuración'));
    await userEvent.click(configTab!);

    const captureBtn = await screen.findByRole('button', { name: /Capturar informal/i });
    await userEvent.click(captureBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      const call = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(String(call[0])).toMatch(/No se pudo capturar la tasa informal de Diviza/i);
      expect(String(call[1]?.description)).toMatch(/se conserva la última tasa real/i);
    });
  });
});
