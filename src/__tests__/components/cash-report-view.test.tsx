/**
 * CashReportView — Tests funcionales de la vista dedicada del Reporte de Caja.
 *
 * CAMBIO 2026-10 (transformación modal → vista dedicada):
 *   §2  Configuración ≠ cálculo: cambiar tipo/fechas NO dispara fetches;
 *       el botón principal (Generar/Actualizar) es la única vía de cálculo;
 *       sin solicitudes duplicadas; intervalo inválido deshabilita la acción.
 *   §3  Persistencia del tipo de reporte: restauración desde localStorage,
 *       valor inválido → default legítimo, escritura al cambiar.
 *   §4  Vista previa: no exige descargar; usa el MISMO builder que el PDF;
 *       estado vacío sin reporte; marcador de vista previa desactualizada.
 *   §5  Paridad CUP/USD: mismas capacidades en ambos desgloses; CUP incluye
 *       2000/5000; personalizadas con validación y eliminación por moneda.
 *   §1  Navegación: sin overlay modal; el detalle «Ver en módulo» navega.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── MOCK: builder PDF (mismo contrato que el real; evita jspdf en jsdom) ──
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
  // MISIÓN 2026-10-22 (Parte A): mock fiel de la persistencia de opciones —
  // valida contra las claves conocidas y aplica defaults solo si no hay
  // preferencia booleana guardada (misma semántica que el módulo real).
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
  // MISIÓN EXCEL 2026-10-21: helpers que cash-report-excel reutiliza del módulo PDF.
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

// ── MOCK: auth/ui stores ──
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

// ── MOCK: apiFetch ──
const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// ── MOCK: sonner ──
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import CashReportView from '@/components/views/terminal/views/cash/CashReportView';
import { LS_KEYS, formatUsd } from '@/components/views/terminal/views/cash/cash-report-core';

// jsdom no implementa URL.createObjectURL/revokeObjectURL
beforeAll(() => {
  if (!(window.URL as unknown as Record<string, unknown>).createObjectURL) {
    (window.URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:stub');
    (window.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  }
});

// ── Fixture: reporte con CUP y USD (mismas reglas que la API) ──
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
    if (String(url).includes('/api/cash-report?')) {
      return Promise.resolve(REPORT);
    }
    return Promise.resolve({});
  });
}

async function renderView() {
  await act(async () => {
    render(<CashReportView />);
  });
}

/** El texto de la vista se fragmenta en nodos (strongs/labels): comparar contra el textContent del body. */
const bodyText = () => document.body.textContent ?? '';
/** Etiqueta de conteo según la convención de cada moneda (espeja formatDenomValue del core). */
const countLabel = (d: number, cur = 'CUP') => `Cantidad de billetes de ${cur === 'CUP' ? d.toLocaleString('es-ES') : d.toFixed(2)} ${cur}`;

/** MISIÓN 2026-10-22 (Parte C): la configuración vive en el panel lateral
 *  desplegable — se abre con «Configuración del reporte» antes de tocar
 *  radios/toggles/nombres de firmas. */
async function openConfigPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Configuración del reporte/i }));
  await waitFor(() => expect(screen.getByTestId('cash-report-config-panel')).toBeTruthy());
}
async function closeConfigPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('cash-report-config-close'));
  await waitFor(() => expect(screen.queryByTestId('cash-report-config-panel')).toBeNull());
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  buildPdfMock.mockClear();
  mockSetCurrentView.mockReset();
  mockSetCommissionNavContext.mockReset();
  setupFetch();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('§1/§2 — Vista dedicada: render inicial y separación config/cálculo', () => {
  it('renderiza como vista (PageHeader) con acción «Generar reporte» y badge «Sin calcular»; NO overlay modal', async () => {
    await renderView();
    expect(screen.getByText('Reporte de Caja — Entrega')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generar reporte/i })).toBeTruthy();
    expect(screen.getByText('Sin calcular')).toBeTruthy();
    // Fuente única: sin overlay del antiguo modal (fixed inset-0 z-200 con backdrop)
    expect(document.querySelector('[role="dialog"][aria-modal="true"][aria-labelledby="cash-title"]')).toBeNull();
  });

  it('el mount NO calcula: no hay fetch de /api/cash-report hasta pulsar Generar', async () => {
    await renderView();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/stores?status=all'));
    const reportCalls = apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/cash-report?'));
    expect(reportCalls).toHaveLength(0);
  });

  it('§2: cambiar el tipo de reporte NO dispara cálculo y SÍ persiste la preferencia', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Diario/ })).toBeTruthy());
    await user.click(screen.getByRole('radio', { name: /Diario/ }));
    expect(screen.getByRole('radio', { name: /Diario/ }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(LS_KEYS.pdfTemplate)).toBe('diario');
    const reportCalls = apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/cash-report?'));
    expect(reportCalls).toHaveLength(0);
  });

  it('§2: cambiar fechas NO dispara cálculo (el intervalo queda pendiente del botón)', async () => {
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(desde, { target: { value: '2026-09-01' } });
    });
    const reportCalls = apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/cash-report?'));
    expect(reportCalls).toHaveLength(0);
    // indicador de pendiente visible (texto fragmentado en nodos → textContent)
    expect(bodyText()).toContain('Se calculará 2026-09-01');
  });

  it('§2: pulsar Generar calcula UNA vez con los parámetros seleccionados y muestra «Actualizar reporte»', async () => {
    const user = userEvent.setup();
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    await act(async () => { fireEvent.change(desde, { target: { value: '2026-10-01' } }); });
    const hasta = document.getElementById('cr-ed') as HTMLInputElement;
    await act(async () => { fireEvent.change(hasta, { target: { value: '2026-10-05' } }); });
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    const reportCalls = apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/cash-report?'));
    expect(reportCalls).toHaveLength(1);
    const url = String(reportCalls[0][0]);
    expect(url).toContain('start_date=');
    expect(url).toContain('end_date=');
    // AUDITORÍA 2026-10: Resumen del Día (fórmula centralizada) + cuadre inequívoco + acción de comisiones
    expect(screen.getByText('Resumen del Día')).toBeTruthy();
    expect(screen.getByText('Efectivo esperado a entregar')).toBeTruthy();
    expect(screen.getByText('Efectivo contado')).toBeTruthy();
    expect(bodyText()).toContain('Diferencia de cuadre');
    expect(screen.getByRole('button', { name: /Gestionar comisiones/i })).toBeTruthy();
    // nota de vigencia con el periodo aplicado (texto fragmentado → textContent)
    expect(bodyText()).toContain('Resultados de 2026-10-01');
  });

  it('§2: mientras el cálculo está en curso, la acción está deshabilitada (sin duplicados)', async () => {
    let resolveReport: (v: unknown) => void = () => {};
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/stores')) return Promise.resolve({ data: [] });
      if (String(url).includes('/api/cash-report?')) {
        return new Promise(res => { resolveReport = res; });
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    const busyBtn = await screen.findByRole('button', { name: /Calculando/i });
    expect((busyBtn as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveReport(REPORT); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
  });

  it('§2: intervalo inválido (Desde > Hasta) deshabilita la acción y muestra alerta', async () => {
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    // Hasta queda en hoy (2026-10-12): Desde = 2026-10-31 SÍ es posterior
    await act(async () => { fireEvent.change(desde, { target: { value: '2026-10-31' } }); });
    const btn = screen.getByRole('button', { name: /Generar reporte/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('inválido');
    const reportCalls = apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/cash-report?'));
    expect(reportCalls).toHaveLength(0);
  });

  it('§2: tras cambiar fechas con resultados aplicados, indica «Resultados anteriores» (obsolescencia)', async () => {
    const user = userEvent.setup();
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    await act(async () => { fireEvent.change(desde, { target: { value: '2026-10-01' } }); });
    const hasta = document.getElementById('cr-ed') as HTMLInputElement;
    await act(async () => { fireEvent.change(hasta, { target: { value: '2026-10-05' } }); });
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await act(async () => { fireEvent.change(hasta, { target: { value: '2026-10-31' } }); });
    expect(screen.getByText('Resultados anteriores')).toBeTruthy();
    // la nota de resultados sigue mostrando el periodo calculado
    expect(bodyText()).toContain('Resultados de 2026-10-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('§3 — Persistencia del tipo de reporte', () => {
  it('restaura la plantilla persistida al entrar (diario → radio marcado)', async () => {
    localStorage.setItem(LS_KEYS.pdfTemplate, 'diario');
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Diario/ }).getAttribute('aria-checked')).toBe('true'));
  });

  it('valor persistido inválido → default legítimo sin errores', async () => {
    localStorage.setItem(LS_KEYS.pdfTemplate, '"antes-eliminado"');
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    // AUDITORÍA 2026-10 (§1): el default legítimo es Diario (Empresa).
    await waitFor(() => expect(screen.getByRole('radio', { name: /Diario/ }).getAttribute('aria-checked')).toBe('true'));
    expect(localStorage.getItem(LS_KEYS.pdfTemplate)).toBe('"antes-eliminado"'); // no se sobreescribe hasta que el usuario elige
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('§5 — Desglose CUP/USD: paridad, 2000/5000 y personalizadas', () => {
  async function generateAndOpenDesglose(user: ReturnType<typeof userEvent.setup>) {
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect(screen.getByText('Desglose para Entrega — CUP')).toBeTruthy());
  }

  it('ambas monedas exponen las MISMAS capacidades (sugerir, limpiar, configurar) y esperado/cuadre', async () => {
    const user = userEvent.setup();
    await generateAndOpenDesglose(user);
    for (const cur of ['CUP', 'USD']) {
      expect(screen.getByRole('button', { name: new RegExp(`Sugerir desglose ${cur}`) })).toBeTruthy();
      expect(screen.getByRole('button', { name: new RegExp(`Limpiar desglose ${cur}`) })).toBeTruthy();
      expect(screen.getByRole('button', { name: new RegExp(`Configurar denominaciones ${cur}`) })).toBeTruthy();
      expect(screen.getByLabelText(countLabel(100, cur))).toBeTruthy();
    }
    // esperados: CUP 15000 (API) y USD 150 (misma fórmula client-side)
    expect(screen.getAllByText(/Esperado:/i).length).toBe(2);
    expect(bodyText()).toContain(formatUsd(150));
  });

  it('§5.2: CUP admite 2000 y 5000 con entrada de cantidades y subtotales correctos', async () => {
    const user = userEvent.setup();
    await generateAndOpenDesglose(user);
    const d2000 = screen.getByLabelText(countLabel(2000)) as HTMLInputElement;
    const d5000 = screen.getByLabelText(countLabel(5000)) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(d2000, { target: { value: '2' } });
      fireEvent.change(d5000, { target: { value: '1' } });
    });
    // Total CUP = 2×2000 + 1×5000 = 9000 → formato es-CU según el ICU del runtime
    const expectedTotal = new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(9000);
    expect(screen.getByText('Total CUP:').parentElement?.textContent).toContain(expectedTotal.replace(/\s/g, ''));
    // Cuadre: 9000 − 15000 = faltante 6000 (el panel USD también está faltante: 0 − 150)
    expect(screen.getAllByText('Faltante:').length).toBe(2);
  });

  it('§5.3: añadir denominación personalizada por moneda, con validación y eliminación', async () => {
    const user = userEvent.setup();
    await generateAndOpenDesglose(user);
    // Abrir config CUP
    await user.click(screen.getByRole('button', { name: 'Configurar denominaciones CUP' }));
    const input = screen.getByLabelText('Valor de nueva denominación personalizada CUP') as HTMLInputElement;
    // inválido: duplicado del catálogo
    await user.type(input, '1000');
    await user.click(screen.getByRole('button', { name: 'Añadir denominación personalizada CUP' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    // válido: 300
    await user.clear(input);
    await user.type(input, '300');
    await user.click(screen.getByRole('button', { name: 'Añadir denominación personalizada CUP' }));
    expect(screen.getByRole('button', { name: /Eliminar denominación personalizada 300 CUP/ })).toBeTruthy();
    // el input del conteo aparece
    expect(screen.getByLabelText(countLabel(300))).toBeTruthy();
    // eliminar → desaparece chip y conteo
    await user.click(screen.getByRole('button', { name: /Eliminar denominación personalizada 300 CUP/ }));
    expect(screen.queryByRole('button', { name: /Eliminar denominación personalizada 300 CUP/ })).toBeNull();
    expect(screen.queryByLabelText(countLabel(300))).toBeNull();
    // persistida
    const stored = JSON.parse(localStorage.getItem('costpro:cash-report:custom-denoms:v1') || '{}');
    expect(stored.CUP).toEqual([]);
  });

  it('§5.3: las personalizadas de CUP no aparecen en USD (espacios por moneda)', async () => {
    localStorage.setItem('costpro:cash-report:custom-denoms:v1', JSON.stringify({ CUP: [300], USD: [25] }));
    const user = userEvent.setup();
    await generateAndOpenDesglose(user);
    expect(screen.getByLabelText(countLabel(300))).toBeTruthy();
    expect(screen.getByLabelText(countLabel(25, 'USD'))).toBeTruthy();
    expect(screen.queryByLabelText('Cantidad de billetes de 300 USD')).toBeNull();
    expect(screen.queryByLabelText(countLabel(25))).toBeNull();
  });

  it('sugerir aplica el greedy con las denominaciones activas por moneda', async () => {
    const user = userEvent.setup();
    await generateAndOpenDesglose(user);
    await user.click(screen.getByRole('button', { name: 'Sugerir desglose CUP' }));
    // 15000 → 5000×3 (catálogo con 5000)
    expect((screen.getByLabelText(countLabel(5000)) as HTMLInputElement).value).toBe('3');
    await user.click(screen.getByRole('button', { name: 'Sugerir desglose USD' }));
    // 150 USD → 100×1 + 50×1
    expect((screen.getByLabelText(countLabel(100, 'USD')) as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText(countLabel(50, 'USD')) as HTMLInputElement).value).toBe('1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('§4 — Vista previa del PDF', () => {
  it('sin reporte: estado vacío con acción para generarlo (no exige descarga)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    expect(screen.getByText('Nada que previsualizar todavía')).toBeTruthy();
    expect(buildPdfMock).not.toHaveBeenCalled();
  });

  it('con reporte: usa el MISMO builder que la descarga y renderiza el documento (iframe blob)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title^="Vista previa del reporte"]');
      expect(iframe).toBeTruthy();
      expect(iframe!.getAttribute('src')).toBe('blob:mock-preview-url');
    });
  });

  it('al cambiar plantilla con vista previa construida: marca desactualizada (§4)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    // cambiar plantilla (default Diario → Estándar; la config vive en el panel lateral)
    await openConfigPanel(user);
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
    await closeConfigPanel(user);
    await waitFor(() => expect(screen.getByText(/La vista previa corresponde a la configuración anterior/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Regenerar vista previa/i })).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('§1 — Navegación y detalle de documento', () => {
  it('«Ver en módulo» de un documento navega vía setCurrentView (sin abrir modal antiguo)', async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/stores')) return Promise.resolve({ data: [] });
      if (String(url).includes('/api/cash-report?')) return Promise.resolve(REPORT);
      if (String(url).includes('/api/cash-report/details')) {
        return Promise.resolve([{ id: 'd-1', created_at: '2026-10-02T10:00:00Z', amount: 7000, reference: 'REC-1', customer_name: 'Proveedor X', ref_type: 'receipt' }]);
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    // expandir el acordeón de pagos en efectivo CUP
    await user.click(screen.getByText(/Efectivo \(CUP\) · receipt/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver documento' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Ver documento' }));
    await waitFor(() => expect(screen.getByText('Detalle de Documento')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Ver en módulo/i }));
    await waitFor(() => expect(mockSetCurrentView).toHaveBeenCalledWith('reception_list'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-2026-10 — navegación Reporte Entrega ↔ Trabajadores y Comisiones
// ═══════════════════════════════════════════════════════════════════════════

describe('NAV-2026-10 — «Gestionar comisiones» navega a Trabajadores y Comisiones', () => {
  it('NAV-01: al pulsarlo navega a la vista workers y fija el contexto del período aplicado', async () => {
    const user = userEvent.setup();
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    await act(async () => { fireEvent.change(desde, { target: { value: '2026-10-14' } }); });
    const hasta = document.getElementById('cr-ed') as HTMLInputElement;
    await act(async () => { fireEvent.change(hasta, { target: { value: '2026-10-14' } }); });
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Gestionar comisiones/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Gestionar comisiones/i }));
    // abre la vista REAL Trabajadores y Comisiones (no un modal)
    expect(mockSetCurrentView).toHaveBeenCalledWith('workers');
    // conserva el período del reporte aplicado (NAV-03) para consumo único
    expect(mockSetCommissionNavContext).toHaveBeenCalledTimes(1);
    const ctx = mockSetCommissionNavContext.mock.calls[0][0];
    expect(ctx.period).toEqual({ startDate: '2026-10-14', endDate: '2026-10-14' });
    expect(typeof ctx.setAt).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INC-2026-10-19 — Nombres del pie de firmas definidos en ESTA UI (nada
// hardcodeado en el PDF): inputs Hecho/Entregado/Recibido por dentro de
// «Opciones del documento», visibles «si procede» (toggle Líneas de firma).
// ═══════════════════════════════════════════════════════════════════════════
describe('INC-2026-10-19 — Nombres del pie de firmas (UI)', () => {
  const openOptions = async (user: ReturnType<typeof userEvent.setup>) => {
    await openConfigPanel(user);
    await waitFor(() => expect(screen.getByText('Nombres del pie de firmas')).toBeTruthy());
  };

  it('los tres inputs (Hecho por / Entregado por / Recibido por) viven en Opciones del documento y persisten', async () => {
    const user = userEvent.setup();
    await renderView();
    await openOptions(user);
    // Tres inputs con sus etiquetas exactas (mapean 1:1 las etiquetas del PDF)
    const hecho = document.getElementById('cr-firmas-hecho') as HTMLInputElement;
    const entrega = document.getElementById('cr-firmas-entrega') as HTMLInputElement;
    const recibe = document.getElementById('cr-firmas-recibe') as HTMLInputElement;
    expect(hecho).toBeTruthy();
    expect(entrega).toBeTruthy();
    expect(recibe).toBeTruthy();
    expect(screen.getByLabelText('Hecho por')).toBe(hecho);
    expect(screen.getByLabelText('Entregado por')).toBe(entrega);
    expect(screen.getByLabelText('Recibido por')).toBe(recibe);
    // Escritura → persistencia LS (mismo mecanismo que deliveredBy/recipient)
    await act(async () => { fireEvent.change(hecho, { target: { value: 'Israel Leyva Velazquez' } }); });
    await act(async () => { fireEvent.change(entrega, { target: { value: 'Israel Leyva Velazquez' } }); });
    await act(async () => { fireEvent.change(recibe, { target: { value: 'Belkis Olivera Perez' } }); });
    await waitFor(() => expect(localStorage.getItem(LS_KEYS.madeBy)).toBe('Israel Leyva Velazquez'));
    expect(localStorage.getItem(LS_KEYS.deliveredBy)).toBe('Israel Leyva Velazquez');
    expect(localStorage.getItem(LS_KEYS.recipient)).toBe('Belkis Olivera Perez');
  });

  it('«si procede»: con «Líneas de firma» desactivada la sección de nombres NO se muestra', async () => {
    const user = userEvent.setup();
    await renderView();
    await openOptions(user);
    await user.click(screen.getByRole('button', { name: /^Líneas de firma/i }));
    await waitFor(() => expect(screen.queryByText('Nombres del pie de firmas')).toBeNull());
    // al reactivarla vuelve (el toggle gobierna la visibilidad)
    await user.click(screen.getByRole('button', { name: /^Líneas de firma/i }));
    await waitFor(() => expect(screen.getByText('Nombres del pie de firmas')).toBeTruthy());
  });

  it('los nombres definidos LLEGAN al builder del PDF (ctx.madeBy/deliveredBy/recipientName)', async () => {
    const user = userEvent.setup();
    await renderView();
    await openOptions(user);
    await act(async () => { fireEvent.change(document.getElementById('cr-firmas-hecho')!, { target: { value: 'Ana Elabora' } }); });
    await act(async () => { fireEvent.change(document.getElementById('cr-firmas-entrega')!, { target: { value: 'Israel Leyva Velazquez' } }); });
    await act(async () => { fireEvent.change(document.getElementById('cr-firmas-recibe')!, { target: { value: 'Belkis Olivera Perez' } }); });
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalled());
    const ctx = buildPdfMock.mock.calls[0][0] as Record<string, unknown>;
    expect(ctx.madeBy).toBe('Ana Elabora');
    expect(ctx.deliveredBy).toBe('Israel Leyva Velazquez');
    expect(ctx.recipientName).toBe('Belkis Olivera Perez');
  });

  it('los antiguos inputs Entrega/Recibe de la pestaña Desglose ya NO existen (una sola fuente: Opciones)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect(screen.getByText('Desglose para Entrega — CUP')).toBeTruthy());
    expect(document.getElementById('cr-db')).toBeNull();
    expect(document.getElementById('cr-rn')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MISIÓN 2026-10-22 — Persistencia de opciones, defaults del documento,
// panel lateral desplegable y desglose laboral (Partes A/B/C · F1-F12).
// ═══════════════════════════════════════════════════════════════════════════
const OPTIONS_KEY = 'costpro:cash-report:pdf-options:v1';
const WORKING_KEY = 'costpro:cash-report:working-breakdown:v1';

describe('MISIÓN 2026-10-22 · Parte A/B — persistencia de las opciones del documento', () => {
  it('F-1: primera apertura sin preferencias → las cuatro opciones del documento aparecen activadas', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    for (const label of ['Desglose de efectivo', 'Desglose billetes', 'Cuadre USD', 'Líneas de firma', 'USD en hoja separada']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') });
      expect(btn.getAttribute('aria-pressed'), `${label} debe venir activada por defecto`).toBe('true');
    }
  });

  it('F-2: desactivar «Desglose billetes», persiste al cambiar y se conserva al reabrir (remount)', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    await user.click(screen.getByRole('button', { name: /^Desglose billetes/i }));
    expect(screen.getByRole('button', { name: /^Desglose billetes/i }).getAttribute('aria-pressed')).toBe('false');
    const stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}');
    expect(stored.includeBreakdown).toBe(false); // persistido al cambiar (patrón auto)
    // reabrir el módulo (remount completo) → preferencia conservada
    cleanup();
    await renderView();
    await openConfigPanel(user);
    expect(screen.getByRole('button', { name: /^Desglose billetes/i }).getAttribute('aria-pressed')).toBe('false');
    // reactivar y volver a comprobar (regla B-3)
    await user.click(screen.getByRole('button', { name: /^Desglose billetes/i }));
    expect(JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}').includeBreakdown).toBe(true);
  });

  it('F-5: «USD en hoja separada» desactivada persiste aunque cambie el tipo de reporte', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    await user.click(screen.getByRole('button', { name: /^USD en hoja separada/i }));
    expect(JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}').usdSeparatePage).toBe(false);
    // cambiar el tipo de reporte NO resetea preferencias (regla B-4)
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
    expect(JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}').usdSeparatePage).toBe(false);
    cleanup();
    await renderView();
    await openConfigPanel(user);
    expect(screen.getByRole('button', { name: /^USD en hoja separada/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('F-7: preferencia antigua o corrupta → recuperación segura con defaults', async () => {
    localStorage.setItem(OPTIONS_KEY, '{esto no es json');
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    // corrupto → defaults legítimos (las 4 opciones activadas), sin errores
    expect(screen.getByRole('button', { name: /^Líneas de firma/i }).getAttribute('aria-pressed')).toBe('true');
    // valor no booleano en una clave → esa clave conserva el default, el resto se respeta
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({ includeSignature: 'no-bool', includeUsd: false }));
    cleanup();
    await renderView();
    await openConfigPanel(user);
    expect(screen.getByRole('button', { name: /^Líneas de firma/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Cuadre USD/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('MISIÓN 2026-10-22 · Parte A — desglose de efectivo laboral (guardado explícito)', () => {
  it('F-6: «Guardar desglose» persiste el conteo y se restaura al reabrir el módulo', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect(screen.getByText('Desglose para Entrega — CUP')).toBeTruthy());
    const d1000 = screen.getByLabelText(countLabel(1000)) as HTMLInputElement;
    await act(async () => { fireEvent.change(d1000, { target: { value: '15' } }); });
    // indicador discreto de cambios pendientes (F-9)
    expect(screen.getByTestId('cr-working-dirty')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Guardar desglose/i }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(WORKING_KEY) || '{}');
      expect(stored.CUP['1000']).toBe('15');
      expect(typeof stored.savedAt).toBe('string');
    });
    // reabrir el módulo → el conteo guardado se restaura (el defecto original)
    cleanup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect((screen.getByLabelText(countLabel(1000)) as HTMLInputElement).value).toBe('15'));
    // sin cambios pendientes tras restaurar
    expect(screen.queryByTestId('cr-working-dirty')).toBeNull();
  });

  it('«Limpiar todo» descarta también el conteo persistido (no reaparece al reabrir)', async () => {
    localStorage.setItem(WORKING_KEY, JSON.stringify({ CUP: { 1000: '15' }, USD: { 100: '1' }, savedAt: new Date().toISOString() }));
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect((screen.getByLabelText(countLabel(1000)) as HTMLInputElement).value).toBe('15'));
    await user.click(screen.getByRole('button', { name: /Limpiar todo/i }));
    await waitFor(() => expect(localStorage.getItem(WORKING_KEY)).toBeNull());
    cleanup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect((screen.getByLabelText(countLabel(1000)) as HTMLInputElement).value).toBe(''));
  });

  it('conteo laboral corrupto → recuperación segura (vacío, sin inventar cantidades)', async () => {
    localStorage.setItem(WORKING_KEY, 'not-json');
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Desglose de efectivo/i }));
    await waitFor(() => expect((screen.getByLabelText(countLabel(1000)) as HTMLInputElement).value).toBe(''));
  });
});

describe('MISIÓN 2026-10-22 · Parte B — la opción «Desglose de efectivo» tiene efecto real en la UI', () => {
  it('desactivada: la pestaña «Desglose de efectivo» desaparece y el cuadre de Resultados solo muestra el esperado', async () => {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({ includeCashBreakdown: false }));
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    expect(screen.queryByRole('tab', { name: /Desglose de efectivo/i })).toBeNull();
    expect(screen.queryByText('Efectivo contado')).toBeNull();
    expect(screen.queryByText(/Diferencia de cuadre/)).toBeNull();
    expect(screen.getByText('Efectivo esperado')).toBeTruthy();
  });

  it('activada (default): pestaña presente y cuadre completo en Resultados', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    expect(screen.getByRole('tab', { name: /Desglose de efectivo/i })).toBeTruthy();
    expect(screen.getByText('Efectivo contado')).toBeTruthy();
    expect(bodyText()).toContain('Diferencia de cuadre');
  });
});

describe('MISIÓN 2026-10-22 · Parte C — panel lateral desplegable de configuración', () => {
  it('F-8: abrir y cerrar el panel SIN perder los valores (ni la vista previa ni los filtros)', async () => {
    const user = userEvent.setup();
    await renderView();
    const desde = document.getElementById('cr-sd') as HTMLInputElement;
    await act(async () => { fireEvent.change(desde, { target: { value: '2026-09-15' } }); });
    await openConfigPanel(user);
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
    await closeConfigPanel(user);
    // el periodo (filtro esencial) NO se reinicia al cerrar
    expect((document.getElementById('cr-sd') as HTMLInputElement).value).toBe('2026-09-15');
    // reabrir: los valores seleccionados se conservan
    await openConfigPanel(user);
    expect(screen.getByRole('radio', { name: /Estándar/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('F-10: Escape cierra el panel y el foco vuelve al disparador', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    const trigger = screen.getByRole('button', { name: /Configuración del reporte/i });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('cash-report-config-panel')).toBeNull());
    // El foco vuelve al disparador (o a un ancestro suyo, según el jsdom).
    expect(document.activeElement === trigger || (document.activeElement?.contains(trigger) ?? false)).toBe(true);
  });

  it('el backdrop cierra el panel y este es un dialog accesible con cierre explícito', async () => {
    const user = userEvent.setup();
    await renderView();
    await openConfigPanel(user);
    expect(screen.getByRole('dialog', { name: /Configuración del reporte/i })).toBeTruthy();
    await user.click(screen.getByTestId('cash-report-config-backdrop'));
    await waitFor(() => expect(screen.queryByTestId('cash-report-config-panel')).toBeNull());
  });

  it('F-12: la vista previa no se recalcula por abrir/cerrar el panel (mismo builder, cache)', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /Generar reporte/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Actualizar reporte/i })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Vista previa/i }));
    await waitFor(() => expect(buildPdfMock).toHaveBeenCalledTimes(1));
    await openConfigPanel(user);
    await closeConfigPanel(user);
    await openConfigPanel(user);
    await closeConfigPanel(user);
    // sin cambios de configuración → el builder NO se vuelve a llamar
    expect(buildPdfMock).toHaveBeenCalledTimes(1);
  });
});
