/**
 * cash-report-desglose-toggle-visible.test.tsx — MISIÓN DESCUBRIBILIDAD
 * DESGLOSE SERVICIOS (2026-11-11).
 *
 * El usuario reportó: «no veo en la UI para activar o desactivar el desglose
 * de servicios en el PDF». La casilla existía SOLO en «Configuración del
 * reporte → Opciones del documento» (acordeón recogido por defecto) → era
 * prácticamente imposible de encontrar.
 *
 * Este fix añade un TOGGLE DIRECTO en la barra de la pestaña «Vista previa»
 * (visible justo donde el usuario mira el documento), compartiendo el MISMO
 * estado (pdfOptions.breakdownServicesByConcept) y la MISMA persistencia que
 * la casilla original — sin lógica duplicada.
 *
 * Cobertura:
 *   1. Plantilla Diario (default): el toggle es visible en Vista previa,
 *      desmarcado por defecto («No») — §3 del brief del desglose.
 *   2. Al activarlo: aria-pressed=true, persiste en localStorage, marca la
 *      vista previa como desactualizada y el builder del PDF recibe
 *      options.breakdownServicesByConcept === true (vista previa = PDF).
 *   3. Plantilla Estándar: SIN toggle (el desglose solo aplica al Resumen
 *      del Día de la plantilla Diario — control muerto prohibido).
 *   4. Estado compartido: activar la casilla en «Opciones del documento»
 *      se refleja en el toggle de la Vista previa (y viceversa) — un solo
 *      estado, dos puntos de contacto.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── MOCK: builder PDF (mismo contrato que el real; evita jspdf en jsdom) ──
const buildPdfMock = vi.fn(async (_ctx?: unknown, _summaries?: unknown) => ({
  output: vi.fn(() => 'blob:mock-preview-url'),
  save: vi.fn(),
}));

vi.mock('@/components/views/terminal/views/cash/cash-report-pdf', () => {
  // Espejo FIEL de DEFAULT_PDF_OPTIONS real (cash-report-pdf.ts), incluida
  // breakdownServicesByConcept: false (default DESMARCADA, §3 del brief).
  const DEFAULTS: Record<string, boolean> = {
    detailPayments: false, detailProduction: false,
    includeBreakdown: true, includeUsd: true, includeSignature: true,
    includeOtReport: true, includeCommissionColumn: true, usdSeparatePage: true,
    includeCashBreakdown: true,
    breakdownServicesByConcept: false,
  };
  const loadPdfOptions = () => {
    try {
      const raw = window.localStorage.getItem('costpro:cash-report:pdf-options:v1');
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, boolean> = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS)) if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
      return out;
    } catch {
      return { ...DEFAULTS };
    }
  };
  return {
    DEFAULT_PDF_OPTIONS: DEFAULTS,
    loadPdfOptions,
    savePdfOptions: (opts: Record<string, boolean>) => {
      try {
        const out: Record<string, boolean> = {};
        for (const k of Object.keys(DEFAULTS)) out[k] = opts[k] === true;
        window.localStorage.setItem('costpro:cash-report:pdf-options:v1', JSON.stringify(out));
      } catch {}
    },
    buildCashReportPdf: (ctx?: unknown, summaries?: unknown) => buildPdfMock(ctx, summaries),
    fetchDiarioSummaries: vi.fn(async () => ({})),
    methodLabel: (m: string) => (m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle'),
    fetchSuggestedCommissionsByProduct: vi.fn(async () => new Map()),
    salesTableColumns: () => [],
    salesTableItems: () => [],
    salesTableQty: () => 0,
    periodISO: () => ({ sISO: '', eISO: '' }),
  };
});

// ── MOCK: auth/ui stores ──
const mockSetCurrentView = vi.fn();
const mockSetCommissionNavContext = vi.fn();
const authState = vi.hoisted(() => ({
  user: { id: 'u-1', role: 'admin', fullName: 'Admin Demo', activeStoreId: 'store-1', memberships: [] },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView: mockSetCurrentView, commissionNavContext: null, setCommissionNavContext: mockSetCommissionNavContext })
      : { setCurrentView: mockSetCurrentView, commissionNavContext: null, setCommissionNavContext: mockSetCommissionNavContext },
}));

// ── MOCK: apiFetch / sonner ──
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import CashReportView from '@/components/views/terminal/views/cash/CashReportView';

// jsdom no implementa URL.createObjectURL/revokeObjectURL
beforeAll(() => {
  if (!(window.URL as unknown as Record<string, unknown>).createObjectURL) {
    (window.URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:stub');
    (window.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  }
});

// ── Fixture: reporte con CUP y USD (misma forma que la API) ──
const REPORT = {
  sales: [
    { payment_method: 'cash', currency: 'CUP', transaction_count: 3, total: 20000 },
    { payment_method: 'transfer', currency: 'CUP', transaction_count: 1, total: 5000 },
    { payment_method: 'cash', currency: 'USD', transaction_count: 2, total: 150 },
  ],
  payments: [
    { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', payment_count: 1, total: 7000 },
  ],
  commissions: [
    { payment_method: 'cash', currency: 'CUP', commission_count: 2, total: 3000 },
  ],
  production: [
    { payment_method: 'cash', currency: 'CUP', ref_type: 'work', payment_count: 1, total: 5000 },
  ],
  totals: { sales_total_cup: 30000, payments_total_cup: 7000, commissions_total_cup: 3000, production_total_cup: 5000, balance_cup: 15000 },
  cash_balance_cup: 15000,
  cash_breakdown: [{ denom: 1000, count: 15, total: 15000 }],
  period: { start: '2026-10-01', end: '2026-10-05' },
};

function setupFetch() {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/api/stores')) {
      return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
    }
    if (String(url).includes('/api/cash-report?')) return Promise.resolve(REPORT);
    return Promise.resolve({});
  });
}

async function renderView() {
  await act(async () => {
    render(<CashReportView />);
  });
}

const panel = () => screen.getByTestId('cash-report-config-panel') as HTMLElement;

async function openConfigPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Configuración del reporte/i }));
  await waitFor(() => {
    expect(panel().getAttribute('data-open')).toBe('true');
    expect(panel().getAttribute('aria-hidden')).toBe('false');
  });
}

async function abrirSeccionConfig(user: ReturnType<typeof userEvent.setup>, id: string) {
  const header = screen.getByTestId(`config-${id}-header`);
  if (header.getAttribute('aria-expanded') !== 'true') {
    await user.click(header);
  }
}

async function closeConfigPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('cash-report-config-close'));
  await waitFor(() => {
    expect(panel().getAttribute('data-open')).toBe('false');
    expect(panel().getAttribute('aria-hidden')).toBe('true');
  });
}

/** Genera el reporte y abre la pestaña Vista previa (builder ya llamado). */
async function generarYAbrirPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
  await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
  await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
}

const toggleEnPreview = () =>
  screen.getByTestId('cr-preview-desglose-servicios') as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  buildPdfMock.mockClear();
  mockSetCurrentView.mockReset();
  mockSetCommissionNavContext.mockReset();
  setupFetch();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('MISIÓN DESCUBRIBILIDAD — toggle de desglose de servicios en Vista previa', () => {
  it('1 · plantilla Diario (default): toggle VISIBLE y desmarcado («No»)', async () => {
    const user = userEvent.setup();
    await renderView();
    await generarYAbrirPreview(user);
    const btn = toggleEnPreview();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).toContain('Desglosar servicios por concepto: No');
    // sin preferencia previa, la opción persistida no existe → default desmarcado
    const stored = JSON.parse(window.localStorage.getItem('costpro:cash-report:pdf-options:v1') ?? '{}');
    expect(stored.breakdownServicesByConcept).toBeUndefined();
  });

  it('2 · al activarlo: aria-pressed=true, persiste, marca preview desactualizada y el builder recibe la opción ON', async () => {
    const user = userEvent.setup();
    await renderView();
    await generarYAbrirPreview(user);
    await user.click(toggleEnPreview());
    // estado visual activado
    await waitFor(() => expect(toggleEnPreview().getAttribute('aria-pressed')).toBe('true'));
    expect(toggleEnPreview().textContent).toContain('Desglosar servicios por concepto: Sí');
    // persistencia inmediata (patrón AUTO de las opciones del documento)
    const stored = JSON.parse(window.localStorage.getItem('costpro:cash-report:pdf-options:v1') ?? '{}');
    expect(stored.breakdownServicesByConcept).toBe(true);
    // la firma del preview cambió → marcador de desactualizada + botón regenerar
    await waitFor(() => expect(screen.getByText(/La vista previa corresponde a la configuración anterior/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Regenerar vista previa/i })).toBeTruthy();
    // regenerar → el MISMO builder que descarga recibe la opción activada
    const callsBefore = buildPdfMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /Regenerar vista previa/i }));
    await waitFor(() => expect(buildPdfMock.mock.calls.length).toBeGreaterThan(callsBefore));
    const lastCtx = buildPdfMock.mock.calls.at(-1)![0] as { options?: Record<string, boolean> };
    expect(lastCtx?.options?.breakdownServicesByConcept).toBe(true);
  });

  it('3 · plantilla Estándar: SIN toggle (el desglose solo aplica al Diario)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await openConfigPanel(user);
    await abrirSeccionConfig(user, 'tipo-reporte');
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
    await closeConfigPanel(user);
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    expect(screen.queryByTestId('cr-preview-desglose-servicios')).toBeNull();
    // y «Descargar PDF» sigue presente (barra operativa intacta)
    expect(screen.getByRole('button', { name: /Descargar PDF/i })).toBeTruthy();
  });

  it('4 · estado compartido: la casilla de «Opciones del documento» se refleja en el toggle de la Vista previa', async () => {
    const user = userEvent.setup();
    await renderView();
    await generarYAbrirPreview(user);
    // activar desde el panel de configuración (acordeón «Opciones del documento»)
    await openConfigPanel(user);
    await abrirSeccionConfig(user, 'opciones-documento');
    await user.click(screen.getByTestId('cr-option-breakdownServicesByConcept'));
    await closeConfigPanel(user);
    // el toggle de la Vista previa refleja el MISMO estado (Sí)
    await waitFor(() => expect(toggleEnPreview().getAttribute('aria-pressed')).toBe('true'));
    expect(toggleEnPreview().textContent).toContain('Desglosar servicios por concepto: Sí');
    // y viceversa: apagar desde la Vista previa se refleja en la casilla del panel
    await user.click(toggleEnPreview());
    await waitFor(() => expect(toggleEnPreview().getAttribute('aria-pressed')).toBe('false'));
    await openConfigPanel(user);
    await abrirSeccionConfig(user, 'opciones-documento');
    const chip = screen.getByTestId('cr-option-breakdownServicesByConcept');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await closeConfigPanel(user);
  });

  it('5 · sin reporte calculado: estado vacío SIN toggle (nada que previsualizar)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    expect(screen.getByText('Nada que previsualizar todavía')).toBeTruthy();
    expect(screen.queryByTestId('cr-preview-desglose-servicios')).toBeNull();
    expect(buildPdfMock).not.toHaveBeenCalled();
  });
});
