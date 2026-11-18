/**
 * CategoryDetailPanel — CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001
 * ============================================================================
 * Prueba la CORRECCIÓN de presentación del drilldown de Estados Financieros:
 *
 *  1. Importe contable SIEMPRE con código de moneda explícito (CUP) — nunca un
 *     único "$" ambiguo entre monedas distintas (misión §7).
 *  2. Importe original: el nominal REGISTRADO en la moneda del documento
 *     (amount_origin/currency_origin del motor CP-FIN-001). CASO 7-11 real:
 *     currency_origin USD + amount_origin 135 → «135,00 USD» (jamás
 *     «125,550 USD», que era el equivalente CUP mal etiquetado).
 *  3. Deficiencia de trazabilidad explícita: currency_origin USD sin
 *     amount_origin (histórico) → «No registrado» (§4: sin conversiones
 *     inventadas).
 *  4. Moneda original CUP (o no identificada) → «—» (sin duplicación visual).
 *  5. Documento: número si existe; ID REAL (document_id) si no; «—» si no hay
 *     nada (§6: jamás se inventa un identificador).
 *  6. «Ver documento»: acción presente con document_id; al pulsarla fija
 *     saleDetailNavContext con el ID real y navega al Historial de Ventas
 *     (venta del 7-11 → detalle directo, sin refiltrar el historial).
 *  7. Documento sin identificador (document_id NULL): SIN botón (tratamiento
 *     seguro y explícito, §10.13).
 *  8. Medio de pago según la CUENTA del asiento (efectivo vs banco) — no por
 *     la moneda (§5).
 *  9. Descripción sin espacio residual («Venta » → «Venta»).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ── MOCK: stores (auth token + navegación UI con espías) ──
const setCurrentView = vi.fn();
const setSaleDetailNavContext = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ token: 'tok-123' }) : { token: 'tok-123' },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView, setSaleDetailNavContext })
      : { setCurrentView, setSaleDetailNavContext },
}));

// ── MOCK: fetch global (fin-api usa global.fetch con Bearer) ──
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { CategoryDetailPanel } from '@/components/views/terminal/views/financial_statements/CategoryDetailPanel';
import { formatLabeledCurrency } from '@/lib/utils';
import type { CategoryDetailData, MovementRow } from '@/components/views/terminal/views/financial_statements/types';

function row(overrides: Partial<MovementRow> & { id: string }): MovementRow {
  return {
    entry_id: 'entry-1',
    document_type: 'VENTA',
    document_id: 'e2614f36-4c86-4317-b80f-6f2fb5d34648',
    document_number: null,
    economic_date: '2026-11-07',
    event: 'reconocimiento',
    sense: 'debito',
    amount: 125550,
    amount_cup: 125550,
    currency: 'CUP',
    currency_origin: 'USD',
    amount_origin: null,
    description: 'Venta ',
    posted_at: '2026-11-14T02:15:17Z',
    ...overrides,
  };
}

function detailFixture(movs: MovementRow[]): CategoryDetailData {
  return { categoria: 'ING_VENTAS', total: movs.length, desde: '2026-11-01', hasta: '2026-11-18', movimientos: movs };
}

function renderPanel(categoryCode = 'ING_VENTAS') {
  return render(
    <CategoryDetailPanel
      storeId='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
      categoryCode={categoryCode}
      categoryName='Ingresos por ventas de productos'
      from='2026-11-01'
      to='2026-11-18'
    />,
  );
}

describe('CategoryDetailPanel — CP-FIN-001 importes, monedas y trazabilidad', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setCurrentView.mockClear();
    setSaleDetailNavContext.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([]),
    } as Response);
  });
  afterEach(() => cleanup());

  it('CASO 7-11 corregido: contable «…CUP» y original «…USD» (135,00) — jamás 125,550 etiquetado USD', async () => {
    // Línea de ingreso tras aplicar el fix del motor: amount_origin=135 (USD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm1', amount: 125550, amount_cup: 125550, currency_origin: 'USD', amount_origin: 135 }),
      ]),
    } as Response);
    renderPanel();
    // Se usa el MISMO formateador de la UI para conocer la representación
    // exacta del locale (es-CU según ICU del runtime).
    await waitFor(() => expect(screen.getByText(formatLabeledCurrency(135, 'USD'))).toBeTruthy());
    // El importe contable lleva el código CUP explícito (no un "$" ambiguo)
    expect(screen.getByText(formatLabeledCurrency(125550, 'CUP'))).toBeTruthy();
    // Y NO existe ninguna celda que presente 125.550 como USD
    expect(screen.queryByText(formatLabeledCurrency(125550, 'USD'))).toBeNull();
  });

  it('histórico sin amount_origin: «No registrado» explícito (deficiencia de trazabilidad, sin tasa inventada)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm2', currency_origin: 'USD', amount_origin: null }),
      ]),
    } as Response);
    renderPanel();
    await waitFor(() => expect(screen.getByText('No registrado')).toBeTruthy());
  });

  it('moneda original CUP → «—» (sin duplicar el importe contable)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm3', currency_origin: 'CUP', amount_origin: null }),
        row({ id: 'm4', currency_origin: null, amount_origin: null }),
      ]),
    } as Response);
    const { container } = renderPanel();
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(2));
    expect(screen.queryByText('No registrado')).toBeNull();
    expect(screen.queryByText(/USD/)).toBeNull();
  });

  it('Documento: número documental si existe; ID real acortado si no; «—» sin identificador', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm5', document_number: 'SRV-20261107-00094', document_type: 'SERVICIO_RECIBIDO' }),
        row({ id: 'm6', document_number: null, document_id: '867d9017-4e9d-41de-9a99-028296838e0a' }),
        row({ id: 'm7', document_number: null, document_id: null }),
      ]),
    } as Response);
    renderPanel();
    await waitFor(() => expect(screen.getByText('SRV-20261107-00094')).toBeTruthy());
    // ID REAL del documento (prefijo del UUID, nunca un número inventado)
    expect(screen.getByText('867d9017')).toBeTruthy();
    // «—» aparece en las celdas sin dato (documento, original y medio de pago)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('«Ver documento» (VENTA): fija saleDetailNavContext con el ID real y navega al Historial de Ventas', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm8', document_type: 'VENTA', document_id: 'e2614f36-4c86-4317-b80f-6f2fb5d34648' }),
      ]),
    } as Response);
    renderPanel();
    const btn = await waitFor(() => screen.getByTestId('ver-documento-m8'));
    fireEvent.click(btn);
    expect(setSaleDetailNavContext).toHaveBeenCalledTimes(1);
    expect(setSaleDetailNavContext).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'e2614f36-4c86-4317-b80f-6f2fb5d34648' }),
    );
    expect(setCurrentView).toHaveBeenCalledWith('sales');
  });

  it('documento sin identificador (document_id null): SIN acción «Ver documento» (tratamiento seguro §10.13)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm9', document_id: null }),
      ]),
    } as Response);
    const { container } = renderPanel();
    await waitFor(() => expect(container.querySelector('tbody tr')).toBeTruthy());
    expect(container.querySelector('[data-testid="ver-documento-m9"]')).toBeNull();
    expect(screen.queryByText(/Ver documento/)).toBeNull();
  });

  it('medio de pago por CUENTA del asiento: efectivo CUP/USD vs banco/transferencia (§5)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([row({ id: 'mc1' })]),
    } as Response);
    const cash = renderPanel('ACT_EFECTIVO_CUP');
    await waitFor(() => expect(cash.container.querySelector('tbody tr')).toBeTruthy());
    expect(screen.getByText('Efectivo (CUP)')).toBeTruthy();
    cleanup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([row({ id: 'mc2' })]),
    } as Response);
    const bank = renderPanel('ACT_BANCOS');
    await waitFor(() => expect(bank.container.querySelector('tbody tr')).toBeTruthy());
    expect(screen.getByText('Banco / Transferencia')).toBeTruthy();
  });

  it('descripción sin espacio residual («Venta » → «Venta»)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([row({ id: 'm10', description: 'Venta ' })]),
    } as Response);
    const { container } = renderPanel();
    await waitFor(() => expect(container.querySelector('tbody tr')).toBeTruthy());
    const lastCell = container.querySelectorAll('tbody tr td');
    const descCell = lastCell[lastCell.length - 1];
    expect(descCell.textContent).toBe('Venta');
  });

  it('apertura en moneda: el importe de la línea ya está en su moneda (amount + currency)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => detailFixture([
        row({ id: 'm11', document_type: 'APERTURA_FIN', document_id: null, document_number: 'APERTURA-2026-11-01', currency: 'USD', currency_origin: 'USD', amount_origin: null, amount: 500, amount_cup: 132000 }),
      ]),
    } as Response);
    renderPanel();
    await waitFor(() => expect(screen.getByText(formatLabeledCurrency(500, 'USD'))).toBeTruthy());
    // El equivalente contable en CUP también visible
    expect(screen.getByText(formatLabeledCurrency(132000, 'CUP'))).toBeTruthy();
  });
});
