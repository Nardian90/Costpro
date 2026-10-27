/**
 * cash-report-view-word-button.test.tsx — MISIÓN WORD (2026-10-27).
 *
 * Integración de la acción «Exportar Word» en la vista Reporte Entrega:
 *   1. El botón existe junto a «Exportar PDF» y «Exportar Excel», y está
 *      DESHABILITADO sin reporte aplicado (misma guardia que PDF y Excel —
 *      nunca exporta el borrador).
 *   2. Tras «Generar reporte», el botón se habilita.
 *   3. Al pulsarlo se llama a descargarCashReportWord con la MISMA
 *      configuración APLICADA que usan el PDF y el Excel (reporte, fechas,
 *      tienda, opciones, orientación, conceptos, metadatos de selección) —
 *      misma fuente de datos (regla B4 de la misión Excel, heredada).
 *   4. Error de exportación → toast de error SIN perder el reporte aplicado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import CashReportView from '@/components/views/terminal/views/cash/CashReportView';

// ── MOCK del exportador Word (unidad bajo prueba: la VISTA, no el .docx) ──
const descargarWordMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => 'COSTPRO_Reporte_Entrega_Tienda_Central_2026-10-01.docx'));
vi.mock('@/components/views/terminal/views/cash/cash-report-docx', () => ({
  descargarCashReportWord: (...args: unknown[]) => descargarWordMock(...args),
}));

// ── MOCK del exportador Excel (no debe invocarse en esta batería) ──
vi.mock('@/components/views/terminal/views/cash/cash-report-excel', () => ({
  descargarCashReportExcel: vi.fn(),
}));

// ── MOCK del módulo PDF (la vista no debe construir PDFs en esta prueba) ──
vi.mock('@/components/views/terminal/views/cash/cash-report-pdf', () => ({
  DEFAULT_PDF_OPTIONS: {
    detailPayments: false, detailProduction: false, includeBreakdown: true,
    includeUsd: true, includeSignature: true, includeOtReport: true,
    includeCommissionColumn: true, usdSeparatePage: true, includeCashBreakdown: true,
  },
  loadPdfOptions: () => ({
    detailPayments: false, detailProduction: false, includeBreakdown: true,
    includeUsd: true, includeSignature: true, includeOtReport: true,
    includeCommissionColumn: true, usdSeparatePage: true, includeCashBreakdown: true,
  }),
  savePdfOptions: vi.fn(),
  buildCashReportPdf: vi.fn(async () => ({ output: vi.fn(() => 'blob:mock'), save: vi.fn() })),
  fetchDiarioSummaries: vi.fn(async () => ({
    itemsSummary: { items: [] },
    paymentTotals: { totals: {} },
    commissionsSummary: { workers: [] },
    productionOrders: [],
  })),
  methodLabel: (m: string) => (m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle'),
  fetchSuggestedCommissionsByProduct: vi.fn(async () => new Map()),
  salesTableColumns: () => [],
  salesTableItems: () => [],
  salesTableQty: () => 0,
  periodISO: () => ({ sISO: '', eISO: '' }),
}));

const mockSetCurrentView = vi.fn();
const mockSetCommissionNavContext = vi.fn();
const authUser = { id: 'u-1', role: 'admin', fullName: 'Admin', activeStoreId: 'store-1', memberships: [] };
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authUser }) : { user: authUser },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView, commissionNavContext: null, setCommissionNavContext: mockSetCommissionNavContext }) : {},
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const REPORT = {
  sales: [{ payment_method: 'cash', currency: 'CUP', total: 30000, transaction_count: 2 }],
  commissions: [], payments: [], production: [],
  totals: { sales_total_cup: 30000, balance_cup: 30000 },
  start_date: '2026-10-01T00:00:00.000Z',
  end_date: '2026-10-01T23:59:59.999Z',
  cash_balance_cup: 30000,
  cash_breakdown: [],
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/api/stores')) {
      return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
    }
    if (String(url).includes('/api/cash-report?')) return Promise.resolve(REPORT);
    return Promise.resolve({});
  });
});

const btnWord = () => screen.getByTestId('cash-report-export-word');

describe('Vista Reporte Entrega — botón «Exportar Word» (MISIÓN WORD)', () => {
  it('muestra PDF, Excel y Word juntos; Word deshabilitado sin reporte', async () => {
    await act(async () => { render(<CashReportView />); });
    expect(screen.getByText('Exportar PDF')).toBeTruthy();
    expect(screen.getByTestId('cash-report-export-excel').textContent).toContain('Exportar Excel');
    expect(btnWord().textContent).toContain('Exportar Word');
    expect((btnWord() as HTMLButtonElement).disabled).toBe(true);
  });

  it('tras Generar, Word se habilita y exporta con la MISMA configuración aplicada', async () => {
    await act(async () => { render(<CashReportView />); });
    // Fechas explícitas (el default del input es HOY — determinismo de la prueba)
    await act(async () => { fireEvent.change(document.getElementById('cr-sd')!, { target: { value: '2026-10-01' } }); });
    await act(async () => { fireEvent.change(document.getElementById('cr-ed')!, { target: { value: '2026-10-01' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /generar reporte/i })); });

    expect((btnWord() as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { fireEvent.click(btnWord()); });

    expect(descargarWordMock).toHaveBeenCalledTimes(1);
    const ctx = descargarWordMock.mock.calls[0][0] as Record<string, unknown>;
    // MISMA fuente que PDF y Excel: reporte APLICADO (no el borrador).
    expect(ctx.report).toBe(REPORT);
    expect(ctx.startDate).toBe('2026-10-01');
    expect(ctx.endDate).toBe('2026-10-01');
    expect(ctx.template).toBe('diario');
    expect(ctx.orientation).toBe('vertical');
    const storeInfo = ctx.storeInfo as { name?: string };
    expect(storeInfo.name).toBe('Tienda Central');
    // Sin nombres de firma configurados → vacíos (nada hardcodeado).
    expect(ctx.deliveredBy).toBe('');
    expect(ctx.recipientName).toBe('');
    // Summaries del diario inyectados (1 fetch — sin duplicar red).
    const summaries = descargarWordMock.mock.calls[0][1] as { itemsSummary?: unknown };
    expect(summaries.itemsSummary).toBeDefined();
  });

  it('error de exportación → toast de error, el reporte aplicado NO se pierde', async () => {
    descargarWordMock.mockRejectedValueOnce(new Error('boom de red'));
    await act(async () => { render(<CashReportView />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /generar reporte/i })); });
    await act(async () => { fireEvent.click(btnWord()); });
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalled();
    // El botón vuelve a estar operativo (estado de carga liberado).
    expect((btnWord() as HTMLButtonElement).disabled).toBe(false);
  });
});
