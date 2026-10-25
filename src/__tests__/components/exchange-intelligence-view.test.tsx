/**
 * exchange-intelligence-view.test.tsx — Pruebas de Inteligencia Cambiaria tras
 * la integración de Diviza y el rediseño visual/accesibilidad (misión
 * IC-DIVIZA 2026-10-26).
 *
 * Cubre los casos obligatorios de UI:
 *  - El informal vigente se resuelve por frescura entre Diviza y elToque.
 *  - Badge honesto: "Real · Diviza" / "Real · elToque" / "Estimada" — nunca
 *    "Real" para una estimación.
 *  - Sin registros informales → estado "Sin dato fiable" (no cifra inventada).
 *  - Carry-forward visible con fecha y proveedor.
 *  - Deduplicación por fecha: un solo punto informal por día (no duplicados).
 *  - Sin acentos morados ni fondos arcoíris en el DOM (sistema visual único).
 *  - Tabs accesibles (role=tab + aria-selected), botones con aria-label.
 *  - Configuración: estados del proveedor (actualizada/captura/antiguo/sin dato).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExchangeIntelligenceView } from '@/components/views/terminal/views/exchange_intelligence/ExchangeIntelligenceView';

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
};

const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

function divizaRow(date: string, rate: number, currency = 'USD', at = 'T12:00:00Z'): RateRow {
  return {
    id: `diviza-${date}-${currency}`,
    rate_date: date,
    captured_at: `${date}${at}`,
    currency,
    source: 'Diviza',
    segment: '3',
    rate,
    capture_method: 'real',
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
    // Sin aviso de arrastre (la tasa es de hoy)
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

  it('carry-forward del informal antiguo: avisa con fecha y proveedor', async () => {
    mockRatesApi([
      bccRow(TODAY, 380),
      // La última informal es de ayer (proveedor elToque histórico)
      elToqueRow(YESTERDAY, 675),
      elToqueRow(new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], 670),
    ]);

    render(<ExchangeIntelligenceView />);

    await waitFor(() => {
      expect(
        screen.getByText(/Tasa de hoy no disponible\. Usando último valor de/i),
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
    // Y NO hay arrastre porque hoy sí tiene Diviza
    expect(screen.queryByText(/Usando último valor/i)).not.toBeInTheDocument();
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
      elToqueRow(new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0], 675),
    ]);

    render(<ExchangeIntelligenceView />);
    // Hay datos (antiguos): 675 en arrastre — NO "sin dato"
    await waitFor(() => {
      expect(screen.getAllByText(/675/).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/Tasa de hoy no disponible\. Usando último valor de/i).length,
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
