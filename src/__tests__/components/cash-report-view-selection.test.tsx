/**
 * cash-report-view-selection.test.tsx — MISIÓN PERSONALIZACIÓN DEL REPORTE
 * ENTREGA (2026-10-25). Interacción REAL de la vista (driver de usuario).
 *
 * Aceptación de la misión §7:
 *   FUNCIÓN A (conceptos):
 *     · Todos activados reproducen el contenido actual.
 *     · Desactivar un concepto lo omite de pantalla (y del PDF/Excel vía el
 *       MISMO ctx — verificado con el mock capturador del builder).
 *     · Seleccionar todos / Desmarcar todos funcionan; sin conceptos → aviso
 *       claro y NINGUNA exportación (PDF/Excel/vista previa bloqueadas).
 *   FUNCIÓN B (ventas):
 *     · Filtro por composición REAL: venta CUP en CUP, USD en USD, mixta en
 *       Mixta (la equivalencia canónica NO clasifica).
 *     · Desmarcar una venta la excluye de totales y desglose (y del ctx que
 *       consumen PDF/Excel); el mismo conjunto en pantalla y exportaciones.
 *     · Cambiar de filtro NO borra la selección anterior.
 *     · Seleccionar todas / Desmarcar todas sobre el conjunto del filtro.
 *     · Importes separados por moneda; totales solo de seleccionadas.
 *     · Egresos de caja INDEPENDIENTES de la selección de ventas.
 *   Persistencia: conceptos por TIENDA (aislamiento); la selección de ventas
 *   NO sobrevive al cambio de período.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── MOCK: builder PDF — captura el ctx para verificar la MISMA selección ──
const buildPdfMock = vi.fn(async (_ctx?: unknown, _summaries?: unknown) => ({
  output: vi.fn(() => 'blob:mock-preview-url'),
  save: vi.fn(),
}));
vi.mock('@/components/views/terminal/views/cash/cash-report-pdf', () => {
  const DEFAULTS = {
    detailPayments: false, detailProduction: false,
    includeBreakdown: true, includeUsd: true, includeSignature: true,
    includeOtReport: true, includeCommissionColumn: true, usdSeparatePage: true,
    includeCashBreakdown: true,
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
    salesTableColumns: (currency: string, includeCommission: boolean) =>
      currency === 'CUP'
        ? (includeCommission ? ['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión'] : ['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)'])
        : ['Código', 'Descripción', 'Cant.', 'Efectivo (USD)', 'Zelle'],
    salesTableItems: () => [],
    salesTableQty: () => 0,
    periodISO: () => ({ sISO: '', eISO: '' }),
  };
});

// ── MOCK: Excel — captura el ctx igual que el PDF ──
const excelMock = vi.fn(async (ctx?: unknown) => 'reporte_prueba.xlsx');
vi.mock('@/components/views/terminal/views/cash/cash-report-excel', () => ({
  descargarCashReportExcel: (ctx?: unknown) => excelMock(ctx),
}));

const mockSetCurrentView = vi.fn();
const mockSetCommissionNavContext = vi.fn();
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    fullName: 'Admin Demo',
    activeStoreId: 'store-1',
    memberships: [],
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView: mockSetCurrentView, commissionNavContext: null, setCommissionNavContext: mockSetCommissionNavContext })
      : { setCurrentView: mockSetCurrentView, commissionNavContext: null, setCommissionNavContext: mockSetCommissionNavContext },
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import CashReportView from '@/components/views/terminal/views/cash/CashReportView';
import { formatCurrency } from '@/lib/utils';

const fmtCup = (n: number) => formatCurrency(n);

// ── Fixture: reporte CON sales_rows (universo: CUP + USD + MIXTA + egreso) ──
// V1: 10 000 CUP efectivo · V2: 7 USD efectivo @ 800 (canónico 5 600) ·
// V3: mixta 2 000 CUP + 5 USD @ 800 · V4: 3 000 CUP transferencia.
// Egreso de caja CUP 500 (documento IE) — concepto independiente.
const REPORT = {
  sales: [
    { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 12000, total_cup: 12000 },
    { payment_method: 'cash', currency: 'USD', transaction_count: 2, total: 12, total_cup: 9600 },
    { payment_method: 'transfer', currency: 'CUP', transaction_count: 1, total: 3000, total_cup: 3000 },
  ],
  sales_split: {
    CUP: { cash: 12000, transfer: 3000, zelle: 0, mixedUnsplit: 0, total: 15000 },
    USD: { cash: 12, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 12 },
  },
  sales_equiv_cash_other_cup: 9600,
  sales_equiv_voucher_other_cup: 0,
  sales_rows: [
    { id: 'v-1', created_at: '2026-10-24T15:00:00Z', customer_name: 'Ana', reference: null, status: 'completed', source: 'reconstruction', buckets: [{ method: 'cash', currency: 'CUP', amount: 10000, amount_cup: 10000 }], items: [], payments: [], seller_id: 'u-1' },
    { id: 'v-2', created_at: '2026-10-24T16:00:00Z', customer_name: 'Bob', reference: null, status: 'completed', source: 'ledger', buckets: [{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }], items: [], payments: [], seller_id: 'u-2' },
    { id: 'v-3', created_at: '2026-10-24T17:00:00Z', customer_name: null, reference: 'mixta', status: 'completed', source: 'ledger', buckets: [{ method: 'cash', currency: 'CUP', amount: 2000, amount_cup: 2000 }, { method: 'cash', currency: 'USD', amount: 5, amount_cup: 4000 }], items: [], payments: [], seller_id: 'u-2' },
    { id: 'v-4', created_at: '2026-10-24T18:00:00Z', customer_name: null, reference: null, status: 'completed', source: 'reconstruction', buckets: [{ method: 'transfer', currency: 'CUP', amount: 3000, amount_cup: 3000 }], items: [], payments: [], seller_id: 'u-1' },
  ],
  // MISIÓN FILTRO MULTIUSUARIO: agregación del SERVIDOR (universo completo):
  // u-1 = 13 000 (v-1+v-4) · u-2 = 11 600 (v-2+v-3). Σ = 24 600 = universo.
  sales_by_user: [
    { seller_id: 'u-1', seller_name: 'Juan Castro', transaction_count: 2, total_cup: 13000, native: [{ currency: 'CUP', total: 13000 }] },
    { seller_id: 'u-2', seller_name: 'María López', transaction_count: 2, total_cup: 11600, native: [{ currency: 'CUP', total: 2000 }, { currency: 'USD', total: 12 }] },
  ],
  sales_by_user_total_cup: 24600,
  sales_rows_truncated: false,
  payments: [],
  commissions: [],
  production: [],
  adjustments: [],
  cash_flows: [
    { id: 'cf-1', direction: 'out', amount: 500, currency: 'CUP', amount_cup: 500, note: 'IE-000003', document_number: 'IE-000003', created_by: null, created_at: '2026-10-24T19:00:00Z' },
  ],
  refund_rows: [],
  totals: { sales_total_cup: 15000, payments_total_cup: 0, commissions_total_cup: 0, balance_cup: 24100 },
  start_date: '2026-10-24',
  end_date: '2026-10-24',
  cash_balance_cup: 24100,
  cash_breakdown: [],
  period: { start: '2026-10-24T00:00:00Z', end: '2026-10-24T23:59:59Z' },
};

function setupFetch() {
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
}

async function renderAndGenerate() {
  await act(async () => {
    render(<CashReportView />);
  });
  await act(async () => {
    screen.getByRole('button', { name: /Generar reporte/i }).click();
  });
  await waitFor(() => {
    expect(screen.getByTestId('resumen-del-dia')).toBeTruthy();
  });
}

const summaryValue = (label: string): string | undefined =>
  screen.getAllByTestId('summary-row-value').map(el => el.dataset.label === label ? el.textContent ?? '' : '').join('') || undefined;

/** El importe de egresos se muestra con SU signo contable (−). */
const neg = (n: number) => `−${fmtCup(n)}`;

/** Abre el grupo si está colapsado (idempotente — el acordeón persiste entre filtros). */
async function ensureGroupExpanded(user: ReturnType<typeof userEvent.setup>, group: HTMLElement) {
  const btn = within(group).getAllByRole('button')[0]!;
  if (btn.getAttribute('aria-expanded') !== 'true') {
    await user.click(btn);
  }
}

/** MISIÓN PANELES DESPLEGABLES: el selector de conceptos es un ACORDEÓN
 *  recogido por defecto; los tests lo despliegan antes de tocar conceptos. */
async function abrirConceptos(user: ReturnType<typeof userEvent.setup>) {
  const header = screen.getByTestId('conceptos-selector-header');
  if (header.getAttribute('aria-expanded') !== 'true') {
    await user.click(header);
  }
}

beforeAll(() => {
  if (!(window.URL as unknown as Record<string, unknown>).createObjectURL) {
    (window.URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:stub');
    (window.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  }
});

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  buildPdfMock.mockClear();
  excelMock.mockClear();
  mockSetCurrentView.mockReset();
  mockSetCommissionNavContext.mockReset();
  setupFetch();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════
// MISIÓN FILTRO MULTIUSUARIO (2026-11-08) · Aceptación §7 de la misión
// ═══════════════════════════════════════════════════════════════════════════
describe('FILTRO MULTIUSUARIO · tarjetas por usuario creador', () => {
  it('§7.1/§7.2/§7.6 tarjetas visibles con importe y conteo; Todos por defecto; Σ tarjetas = universo', async () => {
    await renderAndGenerate();
    expect(screen.getByTestId('filtro-usuarios-estado').textContent).toContain('Todos los usuarios');
    const c1 = screen.getByTestId('usuario-card-u-1');
    expect(c1.getAttribute('aria-pressed')).toBe('true'); // default: todos
    expect(c1.textContent).toContain('Juan Castro');
    expect(c1.textContent).toContain('2 ventas generadas');
    expect(screen.getByTestId('usuario-importe-u-1').textContent).toContain(fmtCup(13000).replace(/^\D+/, ''));
    const c2 = screen.getByTestId('usuario-card-u-2');
    expect(c2.textContent).toContain('María López');
    // conciliación visible: el estado dice el total facturado del período
    expect(screen.getByTestId('filtro-usuarios-estado').textContent).toContain(fmtCup(24600).replace(/^\D+/, ''));
  });

  it('§7.3 un usuario: el reporte muestra SOLO sus ventas y el PDF documenta el filtro', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('usuario-card-u-2'));
    // u-2: CUP cash 2 000 (v-3) + USD 12 (v-2+v-3). La hoja CUP del resumen refleja el recorte:
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(2000));
    expect(screen.getByTestId('filtro-usuarios-estado').textContent).toContain('María López');
    // PDF: MISMO conjunto (ctx capturado por el builder mock)
    await act(async () => {
      screen.getByRole('button', { name: /Exportar PDF/i }).click();
    });
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    const ctx = buildPdfMock.mock.calls.at(-1)![0] as { report: { sales_split: Record<string, { total: number }> }; selectionMeta?: { userLabel?: string; included?: number } };
    expect(ctx.report.sales_split.CUP.total).toBe(2000);
    expect(ctx.selectionMeta?.userLabel).toBe('María López');
    expect(ctx.selectionMeta?.included).toBe(2);
  });

  it('§7.4 varios usuarios: unión sin duplicados (el v-3 mixto cuenta una sola vez)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('usuario-card-u-1'));
    await user.click(screen.getByTestId('usuario-card-u-2'));
    expect(screen.getByTestId('filtro-usuarios-estado').textContent).toContain('2 de 2');
    // u-1 + u-2 = TODO el universo: CUP 15 000 (10 000 + 2 000 + 3 000 — v-3 cuenta UNA vez)
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(15000));
  });

  it('§7.5 volver a Todos los usuarios restaura el reporte general', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('usuario-card-u-2'));
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(2000));
    await user.click(screen.getByTestId('filtro-usuarios-todos'));
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(15000));
    expect(screen.getByTestId('usuario-card-u-1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('usuario-card-u-2').getAttribute('aria-pressed')).toBe('true');
  });

  it('§7.7 cambio de fecha recalcula las tarjetas y reinicia a Todos', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('usuario-card-u-2'));
    // Nuevo período (universo distinto): la selección NO hereda (regla §6 de la misión)
    const report2 = JSON.parse(JSON.stringify(REPORT));
    report2.sales_by_user = [{ seller_id: 'u-1', seller_name: 'Juan Castro', transaction_count: 1, total_cup: 10000, native: [{ currency: 'CUP', total: 10000 }] }];
    report2.sales_rows = report2.sales_rows.filter((r: { id: string }) => r.id === 'v-1');
    report2.sales_split = { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 }, USD: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 } };
    report2.sales = [{ payment_method: 'cash', currency: 'CUP', transaction_count: 1, total: 10000, total_cup: 10000 }];
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/stores')) return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
      if (String(url).includes('/api/cash-report?')) return Promise.resolve(report2);
      return Promise.resolve({});
    });
    fireEvent.change(screen.getByLabelText(/Desde/i), { target: { value: '2026-11-01' } });
    await user.click(screen.getByRole('button', { name: /Actualizar reporte/i }));
    await waitFor(() => {
      expect(screen.getByTestId('filtro-usuarios-estado').textContent).toContain('Todos los usuarios');
    });
    expect(screen.getByTestId('usuario-importe-u-1').textContent).toContain(fmtCup(10000).replace(/^\D+/, ''));
    expect(screen.queryByTestId('usuario-card-u-2')).toBeNull(); // sin ventas ⇒ sin tarjeta
  });

  it('§7.9 ventas sin creador identificable: tarjeta «Usuario no identificado»', async () => {
    const report2 = JSON.parse(JSON.stringify(REPORT));
    report2.sales_rows = [
      ...report2.sales_rows,
      { id: 'v-5', created_at: '2026-10-24T19:30:00Z', customer_name: 'Sin creador', reference: null, status: 'completed', source: 'reconstruction', buckets: [{ method: 'cash', currency: 'CUP', amount: 500, amount_cup: 500 }], items: [], payments: [], seller_id: null },
    ];
    report2.sales_by_user = [
      ...report2.sales_by_user,
      { seller_id: null, seller_name: null, transaction_count: 1, total_cup: 500, native: [{ currency: 'CUP', total: 500 }] },
    ];
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/stores')) return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
      if (String(url).includes('/api/cash-report?')) return Promise.resolve(report2);
      return Promise.resolve({});
    });
    await renderAndGenerate();
    const na = screen.getByTestId('usuario-card-__sin_usuario__');
    expect(na.textContent).toContain('Usuario no identificado');
    expect(na.textContent).toContain('no se atribuyen a otro usuario');
    // seleccionar SOLO el no identificado: su venta computa (conciliación §7.6)
    const user = userEvent.setup();
    await user.click(na);
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(500));
  });

  it('§7.11 paneles desplegables: conceptos RECOGIDO por defecto; abrir/cerrar conserva la selección y no recalcula', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    const header = screen.getByTestId('conceptos-selector-header');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    await user.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByTestId('concepto-egresosCaja'));
    expect((screen.getByTestId('concepto-egresosCaja') as HTMLInputElement).checked).toBe(false);
    await user.click(header); // recoger
    await user.click(header); // volver a abrir
    expect((screen.getByTestId('concepto-egresosCaja') as HTMLInputElement).checked).toBe(false); // conserva
  });

  it('§7.12 «Ajuste extraordinario» aparece MARCADO por defecto y puede desmarcarse', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('conceptos-selector-header'));
    const ajustes = screen.getByTestId('concepto-ajustes') as HTMLInputElement;
    expect(ajustes.checked).toBe(true);
    await user.click(ajustes);
    expect((screen.getByTestId('concepto-ajustes') as HTMLInputElement).checked).toBe(false);
  });

  it('§7.11b secciones de Configuración del reporte: acordeones independientes recogidos por defecto', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('cash-report-config-trigger'));
    const tipo = screen.getByTestId('config-tipo-reporte-header');
    const opciones = screen.getByTestId('config-opciones-documento-header');
    expect(tipo.getAttribute('aria-expanded')).toBe('false');
    expect(opciones.getAttribute('aria-expanded')).toBe('false');
    await user.click(tipo);
    expect(tipo.getAttribute('aria-expanded')).toBe('true');
    expect(opciones.getAttribute('aria-expanded')).toBe('false'); // independientes
    await user.click(tipo);
    expect(tipo.getAttribute('aria-expanded')).toBe('false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN A · conceptos del Resumen del Día', () => {
  it('todos activados por defecto: reproduce el contenido actual (filas completas, sin aviso)', async () => {
    await renderAndGenerate();
    // Las 3 filas base + equivalencia + egresos presentes.
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBeTruthy();
    expect(summaryValue('Ventas en efectivo')).toBeTruthy();
    expect(summaryValue('Ventas por transferencia')).toBeTruthy();
    expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBeTruthy();
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('desactivar «Egresos de caja» omite la fila de pantalla y el cálculo personalizado EXCLUYE el término (misión 2026-10-26)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    const esperadoAntes = screen.getByText('Efectivo esperado a entregar').closest('div')?.textContent ?? '';
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBeTruthy();
    await abrirConceptos(user);
    await user.click(screen.getByTestId('concepto-egresosCaja'));
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBeUndefined();
    // MISIÓN CONCILIACIÓN: el cálculo personalizado se actualiza SIN el término
    // (11 500 + 500 = 12 000) y se identifica como personalizado (§4.3).
    // La etiqueta aparece en el Resumen y en el Cuadre (getAllByText):
    const esperadoDespues = screen.getAllByText('Efectivo esperado (personalizado)').map(e => e.closest('div')?.textContent ?? '').join(' ');
    expect(esperadoDespues).not.toBe(esperadoAntes);
    expect(esperadoDespues).toContain(fmtCup(12000).replace(/^\D+/, ''));
    // Resumen de diferencias frente al oficial (pantalla = exportado):
    // MISIÓN P1: convención personalizado − oficial y estado tri-estado
    // (un personalizado que difiere NO se presenta como «Conciliado»).
    const dif = screen.getByTestId('resumen-diferencias').textContent ?? '';
    expect(dif).toContain('Diferencias explicadas por la configuración');
    expect(dif).toContain('+$500.00'); // egreso omitido ⇒ diferencia +500
  });

  it('desactivar cada concepto omite SU fila y el esperado se rotula como personalizado', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    for (const key of ['resumenDia', 'ventasEfectivo', 'ventasTransferencia', 'equivalenciaCup'] as const) {
      await abrirConceptos(user);
      await user.click(screen.getByTestId(`concepto-${key}`));
    }
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBeUndefined();
    expect(summaryValue('Ventas en efectivo')).toBeUndefined();
    expect(summaryValue('Ventas por transferencia')).toBeUndefined();
    expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBeUndefined();
    // MISIÓN CONCILIACIÓN: el esperado personalizado sigue visible, rotulado
    // como tal (sin cobros de ventas: 0 − 500 = −500):
    expect(screen.getAllByText('Efectivo esperado (personalizado)').length).toBeGreaterThan(0);
  });

  it('«Seleccionar todos» y «Desmarcar todos» funcionan; sin conceptos → aviso y exportación BLOQUEADA', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('conceptos-desmarcar-todos'));
    // Aviso claro (role=alert) y contador 0/12 (misión conciliación: 12 conceptos):
    expect(screen.getByRole('alert').textContent).toContain('No hay conceptos seleccionados');
    expect(screen.getByText('0/12 activos')).toBeTruthy();
    // Exportaciones bloqueadas (PDF y Excel):
    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('al menos un concepto'));
    await user.click(screen.getByTestId('cash-report-export-excel'));
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(buildPdfMock).not.toHaveBeenCalled();
    expect(excelMock).not.toHaveBeenCalled();
    // «Seleccionar todos» restaura el contenido completo:
    await user.click(screen.getByTestId('conceptos-seleccionar-todos'));
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('la preferencia de conceptos persiste POR TIENDA (aislamiento entre tiendas)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await abrirConceptos(user);
    await user.click(screen.getByTestId('concepto-egresosCaja'));
    await waitFor(() => {
      expect(window.localStorage.getItem('costpro:cash-report:summary-concepts:v1:store:store-1')).toBeTruthy();
    });
    // Otra tienda NO hereda la preferencia:
    expect(window.localStorage.getItem('costpro:cash-report:summary-concepts:v1:store:store-2')).toBeNull();
    const saved = JSON.parse(String(window.localStorage.getItem('costpro:cash-report:summary-concepts:v1:store:store-1')));
    expect(saved.egresosCaja).toBe(false);
    expect(saved.ventasEfectivo).toBe(true);
    // Al recargar la vista (mismo navegador/tienda) se restaura:
    cleanup();
    await renderAndGenerate();
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBeUndefined();
    expect(summaryValue('Ventas en efectivo')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · selección de ventas (composición real de los pagos)', () => {
  it('filtro CUP muestra las ventas CUP · USD las USD · Mixta la mixta (composición, no equivalencia)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    // Expandir el grupo cash|CUP para ver las filas.
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    // El grupo cash|CUP contiene V1 y V3 (componente CUP de la mixta):
    expect(screen.getByTestId('venta-fila-v-1')).toBeTruthy();
    expect(screen.getByTestId('venta-fila-v-3')).toBeTruthy();
    expect(screen.queryByTestId('venta-fila-v-2')).toBeNull(); // USD no está en el grupo CUP

    // Filtro USD: solo V2 y V3 (grupos cash|USD).
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), 'USD');
    expect(screen.queryByTestId('venta-fila-v-1')).toBeNull();
    expect(screen.getByTestId('venta-grupo-cash|USD')).toBeTruthy();
    // V2 NO aparece como CUP por su equivalencia canónica (5 600):
    expect(screen.queryByTestId('venta-grupo-cash|CUP')).toBeNull();

    // Filtro Mixta: solo la venta con componentes en ambas monedas.
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), 'MIXTA');
    expect(screen.getByTestId('venta-fila-v-3')).toBeTruthy();
    expect(screen.queryByTestId('venta-fila-v-1')).toBeNull();
    expect(screen.queryByTestId('venta-fila-v-2')).toBeNull();
    expect(screen.queryByTestId('venta-grupo-transfer|CUP')).toBeNull();
  });

  it('desmarcar una venta la excluye de los totales y del desglose (V1 fuera → ventasCash 2 000, esperado 1 500)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    // Estado base (todo seleccionado): ventasCash 12 000 (V1 + componente CUP de V3).
    expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(12000));
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    // Desmarcar V1 (10 000 CUP):
    await user.click(within(screen.getByTestId('venta-fila-v-1')).getByRole('checkbox'));
    expect(screen.getByTestId('venta-fila-v-1').getAttribute('data-excluded')).toBe('true');
    await waitFor(() => {
      expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(2000));
    });
    // Totales de ventas = 2 000 + 3 000 transferencia:
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(5000));
    // Equivalencia recalculada sin V1 (V1 era CUP: no cambia) = 9 600 intacta:
    expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBe(fmtCup(9600));
    // MISIÓN CORRECTIVA: esperado = saldo inicial (0) + cobros BILLETES CUP del
    // conjunto (2 000) − egreso (500) = 1 500. La equivalencia NO entra (los
    // billetes USD viven en la hoja USD) y el saldo inicial no cambia (§7).
    // MISIÓN CONCILIACIÓN: con ventas excluidas el resultado se rotula como
    // personalizado (mismo cálculo que el exportado):
    expect((screen.getAllByText('Efectivo esperado (personalizado)')[0]?.closest('div')?.parentElement?.textContent ?? '')).toContain(fmtCup(1500).replace(/^\D+/, ''));
    // Contador del grupo: 1 de 2 seleccionadas:
    expect(within(grupoCashCup).getByText(/1 de 2 seleccionadas/)).toBeTruthy();
    // Egresos de caja INDEPENDIENTES de la selección de ventas (signo contable −):
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBe(neg(500));
  });

  it('cambiar el filtro NO borra la selección anterior (se conserva entre filtros)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    await user.click(within(screen.getByTestId('venta-fila-v-1')).getByRole('checkbox'));
    // Cambiar de filtro (USD → Mixta → Todas) y volver:
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), 'USD');
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), 'MIXTA');
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), '');
    const grupoCashCup2 = screen.getByTestId('venta-grupo-cash|CUP');
    await ensureGroupExpanded(user, grupoCashCup2);
    // V1 sigue excluida (selección conservada):
    expect(screen.getByTestId('venta-fila-v-1').getAttribute('data-excluded')).toBe('true');
    expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(2000));
  });

  it('«Seleccionar todas»/«Desmarcar todas» actúan sobre el CONJUNTO DEL FILTRO (comunicado y determinista)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    // Desmarcar todas (filtro Todas = 4 ventas):
    await user.click(screen.getByTestId('ventas-desmarcar-todas'));
    await waitFor(() => {
      expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(0));
      expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(0));
    });
    // Equivalencia también a 0 (todas las ventas USD excluidas → fila omitida):
    expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBeUndefined();
    // Egresos de caja INTACTOS (independientes, con su signo contable):
    expect(summaryValue('Egresos de caja (fondo y otros)')).toBe(neg(500));
    // Contador global:
    expect(screen.getByTestId('ventas-seleccion-contador').textContent).toContain('0 de 4');

    // Con filtro USD, «Seleccionar todas» SOLO reactiva las USD puras (V2;
    // la mixta V3 pertenece al filtro Mixta — composición real, no equivalencia):
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), 'USD');
    await user.click(screen.getByTestId('ventas-seleccionar-todas'));
    await waitFor(() => {
      expect(screen.getByTestId('ventas-seleccion-contador').textContent).toContain('1 de 1');
    });
    // Volver a Todas: CUP y la mixta siguen excluidas, V2 seleccionada:
    await user.selectOptions(screen.getByTestId('ventas-filtro-composicion'), '');
    expect(screen.getByTestId('ventas-seleccion-contador').textContent).toContain('1 de 4');
    await waitFor(() => {
      // ventasCash CUP = 0 (V1 y componente CUP de V3 excluidas), transfer 0:
      expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(0));
      // Equivalencia SOLO de V2 (5 600): la mixta excluida no aporta:
      expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBe(fmtCup(5600));
    });
  });

  it('importes separados por moneda: los componentes USD de la mixta NUNCA se suman a los CUP', async () => {
    await renderAndGenerate();
    expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(12000)); // CUP nativos
    // La equivalencia es línea PROPIA (no se suma a las ventas):
    expect(summaryValue('Ventas totales (efectivo + transferencia)')).toBe(fmtCup(15000));
    expect(summaryValue('Equivalencia CUP de cobros en efectivo en otras monedas')).toBe(fmtCup(9600));
  });

  it('la selección de ventas NO se persiste: cambia el período → selección reconstruida', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    await user.click(within(screen.getByTestId('venta-fila-v-1')).getByRole('checkbox'));
    expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(2000));
    // Recalcular el MISMO período (Actualizar) NO borra la selección…
    await user.click(screen.getByRole('button', { name: /Actualizar reporte/i }));
    await waitFor(() => {
      expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(2000));
    });
    // …pero cambiar de período SÍ (misión §6: no hereda registros):
    const desde = screen.getByLabelText('Desde') as HTMLInputElement;
    await user.clear(desde);
    await user.type(desde, '2026-10-23');
    const hasta = screen.getByLabelText('Hasta') as HTMLInputElement;
    await user.clear(hasta);
    await user.type(hasta, '2026-10-23');
    await user.click(screen.getByRole('button', { name: /Actualizar reporte/i }));
    await waitFor(() => {
      expect(summaryValue('Ventas en efectivo')).toBe(fmtCup(12000)); // todo seleccionado de nuevo
    });
    expect(screen.getByTestId('ventas-seleccion-contador').textContent).toContain('4 de 4');
  });

  it('período sin ventas: mensaje claro en la sección de ventas (sin tabla vacía)', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/stores')) {
        return Promise.resolve({ data: [{ id: 'store-1', name: 'Tienda Central', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null }] });
      }
      if (String(url).includes('/api/cash-report?')) {
        return Promise.resolve({
          ...REPORT,
          sales: [], sales_split: {}, sales_rows: [], sales_equiv_cash_other_cup: 0, sales_equiv_voucher_other_cup: 0,
          totals: {}, cash_balance_cup: -500,
        });
      }
      return Promise.resolve({});
    });
    await act(async () => { render(<CashReportView />); });
    await act(async () => { screen.getByRole('button', { name: /Generar reporte/i }).click(); });
    await waitFor(() => {
      expect(screen.getByTestId('resumen-del-dia')).toBeTruthy();
    });
    // Sin sales_rows → sección clásica con «Sin ventas»:
    expect(screen.getByText('Sin ventas')).toBeTruthy();
    expect(screen.queryByTestId('ventas-seleccionables')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Exportaciones · PDF/Excel/vista previa reflejan la MISMA selección', () => {
  it('el ctx del PDF y del Excel recibe el reporte AJUSTADO + conceptos + metadatos del filtro', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    // Excluir V1 y ocultar egresos:
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    await user.click(within(screen.getByTestId('venta-fila-v-1')).getByRole('checkbox'));
    await abrirConceptos(user);
    await user.click(screen.getByTestId('concepto-egresosCaja'));

    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    const pdfCtx = buildPdfMock.mock.calls[0]![0] as Record<string, any>;
    // Reporte AJUSTADO (solo ventas seleccionadas):
    expect(pdfCtx.report.sales_split.CUP.cash).toBe(2000);
    expect(pdfCtx.report.sales_equiv_cash_other_cup).toBe(9600);
    // Conceptos aplicados:
    expect(pdfCtx.concepts.egresosCaja).toBe(false);
    expect(pdfCtx.concepts.ventasEfectivo).toBe(true);
    // Metadatos del conjunto:
    expect(pdfCtx.selectionMeta).toMatchObject({ included: 3, total: 4 });
    // El reporte ORIGINAL no muta (los datos contables quedan intactos):
    expect(REPORT.sales_split.CUP.cash).toBe(12000);

    await user.click(screen.getByTestId('cash-report-export-excel'));
    await waitFor(() => expect(excelMock).toHaveBeenCalled());
    const excelCtx = excelMock.mock.calls[0]![0] as Record<string, any>;
    expect(excelCtx.report.sales_split.CUP.cash).toBe(2000);
    expect(excelCtx.concepts.egresosCaja).toBe(false);
    expect(excelCtx.selectionMeta.included).toBe(3);
  });

  it('con selección activa, la tabla por producto se recalcula del conjunto seleccionado (misma función del servidor)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    const grupoCashCup = screen.getByTestId('venta-grupo-cash|CUP');
    await user.click(within(grupoCashCup).getByRole('button', { name: /Efectivo \(CUP\)/ }));
    await user.click(within(screen.getByTestId('venta-fila-v-1')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    // fetchDiarioSummaries se mockea a {} — el builder real recibiría summaries
    // del fetch; aquí verificamos el CONTRATO: la vista inyecta el override por
    // selección (itemsSummary del conjunto) vía summaries. Con mock {} el
    // builder cae a su fetch interno; el test de builders (dedicado) cubre el
    // contenido exacto del override. Aquí basta el contrato del ctx ajustado.
    const pdfCtx = buildPdfMock.mock.calls[0]![0] as Record<string, any>;
    expect(pdfCtx.report.sales).toEqual([
      expect.objectContaining({ payment_method: 'cash', currency: 'CUP', total: 2000 }),
      expect.objectContaining({ payment_method: 'cash', currency: 'USD', total: 12 }),
      expect.objectContaining({ payment_method: 'transfer', currency: 'CUP', total: 3000 }),
    ]);
  });

  it('sin conceptos activos: NINGUNA llamada a los builders (fail-closed en vista previa y exportaciones)', async () => {
    const user = userEvent.setup();
    await renderAndGenerate();
    await user.click(screen.getByTestId('conceptos-desmarcar-todos'));
    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));
    await user.click(screen.getByTestId('cash-report-export-excel'));
    // Ir a la pestaña de vista previa tampoco construye:
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await new Promise(r => setTimeout(r, 50));
    expect(buildPdfMock).not.toHaveBeenCalled();
    expect(excelMock).not.toHaveBeenCalled();
  });
});
