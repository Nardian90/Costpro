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
vi.mock('@/components/views/terminal/views/cash/cash-report-pdf', () => ({
  DEFAULT_PDF_OPTIONS: {
    detailPayments: false, detailProduction: false,
    includeBreakdown: true, includeUsd: true, includeSignature: true,
    includeOtReport: true, includeCommissionColumn: true, usdSeparatePage: true,
  },
  buildCashReportPdf: (ctx?: unknown, summaries?: unknown) => buildPdfMock(ctx, summaries),
  fetchDiarioSummaries: vi.fn(async () => ({})),
  methodLabel: (m: string) => (m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle'),
}));

// ── MOCK: auth/ui stores ──
const mockSetCurrentView = vi.fn();
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
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
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

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  buildPdfMock.mockClear();
  mockSetCurrentView.mockReset();
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
    await renderView();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Diario/ }).getAttribute('aria-checked')).toBe('true'));
  });

  it('valor persistido inválido → default legítimo sin errores', async () => {
    localStorage.setItem(LS_KEYS.pdfTemplate, '"antes-eliminado"');
    await renderView();
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
    // cambiar plantilla (default Diario → Estándar; la config está visible en la columna izquierda)
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
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
