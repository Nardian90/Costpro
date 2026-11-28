/**
 * informal-usd-rate-card.test.tsx — Tarjeta premium del dólar informal en el
 * Panel de Control (CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001,
 * criterios de aceptación FASE 8 «Panel de Control»).
 *
 * Fija:
 *   - La tasa proviene de la MISMA API de Inteligencia Cambiaria
 *     (source=informal → informal_latest, observación REAL).
 *   - Se muestran USD/CUP, fecha real del dato y hora de actualización.
 *   - Variación diaria: positiva / negativa / cero, en CUP y %.
 *   - Sin cotización del día anterior → «Sin dato del día anterior» (honesto).
 *   - Sin registro de hoy → «Última disponible» + «Pendiente de actualización»
 *     (jamás una cotización antigua presentada como actual).
 *   - «Ver evolución» navega a Inteligencia Cambiaria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InformalUsdRateCard } from '@/components/views/terminal/views/dashboard/InformalUsdRateCard';

// ── Mock del store: setCurrentView observable + token de sesión ──
const uiState = vi.hoisted(() => ({
  currentView: 'dashboard' as string,
  setCurrentView: vi.fn(),
  token: 'jwt-test-token',
}));

vi.mock('@/store', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const useUIStore = ((sel?: (s: unknown) => unknown) =>
    sel ? sel(uiState) : uiState) as unknown as {
    getState: () => typeof uiState;
  };
  useUIStore.getState = () => uiState;
  const useAuthStore = ((sel?: (s: unknown) => unknown) =>
    sel ? sel(uiState) : uiState) as unknown as {
    getState: () => typeof uiState;
  };
  useAuthStore.getState = () => uiState;
  return { ...actual, useUIStore, useAuthStore };
});

/** Respuesta de /api/exchange-rates?source=informal configurable por test. */
let apiResponse: Record<string, unknown> = {};
let fetchError: Error | null = null;

vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
  if (fetchError) throw fetchError;
  expect(String(url)).toContain('/api/exchange-rates');
  expect(String(url)).toContain('source=informal');
  expect(String(url)).toContain('currency=USD');
  return {
    ok: true,
    json: async () => apiResponse,
  } as Response;
}));

const row = (over: Record<string, unknown>) => ({
  rate: 475,
  rate_date: '2026-11-28',
  captured_at: '2026-11-28T13:30:00.000Z',
  currency: 'USD',
  source: 'Diviza',
  segment: '3',
  capture_method: 'real',
  source_updated_at: '2026-11-28T13:00:00-05:00',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchError = null;
  apiResponse = {};
});

afterEach(() => {
  cleanup();
});

async function renderCard() {
  render(<InformalUsdRateCard />);
  await waitFor(() => expect(screen.getByTestId('fx-card')).toBeTruthy());
}

describe('InformalUsdRateCard — Panel de Control (CP-FX-001)', () => {
  it('FASE 8: tasa proviene de Inteligencia Cambiaria, muestra USD/CUP, fecha real y fuente', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: '2026-11-28T13:30:00.000Z',
        source_updated_at: '2026-11-28T13:00:00-05:00',
      },
      rates: [
        row({ rate_date: '2026-11-27', rate: 470, captured_at: '2026-11-27T13:30:00.000Z', source_updated_at: '2026-11-27T13:00:00-05:00' }),
        row({}),
      ],
    };
    await renderCard();
    expect(screen.getByTestId('fx-rate-value').textContent).toContain('1 USD =');
    expect(screen.getByTestId('fx-rate-value').textContent).toContain('475');
    expect(screen.getByTestId('fx-rate-value').textContent).toContain('CUP');
    expect(screen.getByTestId('fx-data-date').textContent).toContain('28/11/2026');
    expect(screen.getByTestId('fx-source').textContent).toContain('Diviza');
    expect(screen.getByTestId('fx-updated').textContent).toMatch(/Cuba/);
    // Chip: captura real de la fecha operativa → «Observada hoy»
    expect(screen.getByTestId('fx-status-chip').textContent).toContain('Observada hoy');
  });

  it('FASE 8: variación POSITIVA — flecha arriba, +CUP y +% frente al día calendario anterior', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [row({ rate_date: '2026-11-27', rate: 470 })],
    };
    await renderCard();
    const badge = screen.getByTestId('fx-variation-badge');
    expect(badge.textContent).toContain('+5');        // +5.00 CUP
    expect(badge.textContent).toContain('+1.06');     // +1.06 %
  });

  it('FASE 8: variación NEGATIVA — flecha abajo, CUP y % negativos', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 470, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [row({ rate_date: '2026-11-27', rate: 475 })],
    };
    await renderCard();
    const badge = screen.getByTestId('fx-variation-badge');
    expect(badge.textContent).toContain('-5');
    expect(badge.textContent).toContain('-1.05');
  });

  it('FASE 8: variación CERO — indicador de estabilidad con 0 CUP y 0%', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [row({ rate_date: '2026-11-27', rate: 475 })],
    };
    await renderCard();
    const badge = screen.getByTestId('fx-variation-badge');
    expect(badge.textContent).toContain('0.00 CUP');
    expect(badge.textContent).toContain('0.00%)');
  });

  it('FASE 8: falta la cotización del día anterior → «Sin dato del día anterior», sin % inventado', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [row({ rate_date: '2026-11-25', rate: 470 })], // último real: hace 3 días
    };
    await renderCard();
    expect(screen.getByTestId('fx-variation-missing').textContent).toContain('Sin dato del día anterior');
    expect(screen.queryByTestId('fx-variation-badge')).toBeNull();
  });

  it('FASE 8/C: sin registro de HOY → «Última disponible» con fecha real + nota de pendiente', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 470, rate_date: '2026-11-26', source: 'Diviza',
        capture_method: 'real', captured_at: '2026-11-26T13:30:00.000Z',
        source_updated_at: '2026-11-26T13:00:00-05:00',
      },
      rates: [
        row({ rate_date: '2026-11-26', rate: 470, captured_at: '2026-11-26T13:30:00.000Z' }),
        row({ rate_date: '2026-11-25', rate: 468, captured_at: '2026-11-25T13:30:00.000Z' }),
      ],
    };
    await renderCard();
    expect(screen.getByTestId('fx-status-chip').textContent).toContain('Última disponible');
    expect(screen.getByTestId('fx-status-chip').textContent).toContain('hace 2 días');
    expect(screen.getByTestId('fx-stale-note').textContent).toContain('Pendiente de actualización');
    expect(screen.getByTestId('fx-data-date').textContent).toContain('26/11/2026');
    // La variación se calcula contra el día calendario ANTERIOR AL DATO (25/11)
    expect(screen.getByTestId('fx-variation-badge').textContent).toContain('+2');
  });

  it('D: «Ver evolución» navega a Inteligencia Cambiaria (exchange-intelligence)', async () => {
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [],
    };
    await renderCard();
    fireEvent.click(screen.getByTestId('fx-ver-evolucion'));
    expect(uiState.setCurrentView).toHaveBeenCalledWith('exchange-intelligence');
  });

  it('sin dato fiable en la API → estado «sin-dato» honesto', async () => {
    apiResponse = { operative_date: '2026-11-28', rates: [] }; // sin informal_latest
    render(<InformalUsdRateCard />);
    await waitFor(() => expect(screen.getByTestId('fx-card')).toBeTruthy());
    expect(screen.getByTestId('fx-rate-value').textContent).toContain('—');
    expect(screen.queryByTestId('fx-variation-badge')).toBeNull();
  });

  it('error de red → estado compacto con Reintentar que refetcha', async () => {
    fetchError = new Error('HTTP 503');
    render(<InformalUsdRateCard />);
    await waitFor(() => expect(screen.getByTestId('fx-card-error')).toBeTruthy());
    fetchError = null;
    apiResponse = {
      operative_date: '2026-11-28',
      informal_latest: {
        rate: 475, rate_date: '2026-11-28', source: 'Diviza',
        capture_method: 'real', captured_at: null, source_updated_at: null,
      },
      rates: [],
    };
    fireEvent.click(screen.getByTestId('fx-card-retry'));
    await waitFor(() => expect(screen.getByTestId('fx-card')).toBeTruthy());
    expect(screen.getByTestId('fx-rate-value').textContent).toContain('475');
  });
});
