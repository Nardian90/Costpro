/**
 * CP-OPS-ENERVIDA — Reversiones de pagos y colapso de presentación del PDF.
 *
 * Contrato verificado (misión §2.1/§2.2/P0):
 *  1. computeDailySummary: el grupo `payment_reversals` (contra-filas sobre
 *     documentos VÁLIDOS) suma como ENTRADA de efectivo
 *     (reversionesPagosCash) al efectivo esperado.
 *  2. customExpected (todos los conceptos activos) == esperado oficial,
 *     incluyendo reversiones (identidad personalizado==oficial).
 *  3. buildDiarioIncomeRows: la fila «Reversiones de pagos a proveedores»
 *     aparece cuando reversionesPagosCash > 0.
 *  4. §2.2 — displaySelection: los conceptos OCULTOS del PDF colapsan en UNA
 *     fila «Otros conceptos incluidos» con la SUMA NETA (gastos con signo −);
 *     ocultar NO elimina importes del cálculo (presentación pura).
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';
import { customExpected } from '@/lib/cash-report/custom-result';
import { DEFAULT_SUMMARY_CONCEPTS } from '@/lib/cash-report/report-selection';
import { buildDiarioIncomeRows } from '@/components/views/terminal/views/cash/cash-report-pdf';
import type { CustomCurrencyResult } from '@/lib/cash-report/custom-result';

function makeReport(over: Partial<CashReportLike> = {}): CashReportLike {
  return {
    sales: [{ payment_method: 'cash', currency: 'CUP', total: 84750 }],
    payments: [
      { payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 2999 },
      { payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 1800 },
      { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 1 },
    ],
    payment_reversals: [
      { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 1 },
    ],
    ...over,
  } as CashReportLike;
}

const curResult = {
  ventasTotalesPersonalizado: 84750,
  efectivoEsperadoPersonalizado: 0,
} as unknown as CustomCurrencyResult;

describe('CP-OPS-ENERVIDA · reversiones de pagos en el resumen', () => {
  it('las contra-filas del grupo payment_reversals SUMAN al efectivo esperado', () => {
    const s = computeDailySummary(makeReport(), 'CUP');
    expect(s.ventasCash).toBe(84750);
    expect(s.serviciosRecibidosCash).toBe(4799);
    expect(s.recibosProveedoresCash).toBe(1);
    expect(s.reversionesPagosCash).toBe(1);
    // esperado = 84750 − 2999 − 1800 − 1 + 1 (reversión del pago de la recepción)
    expect(s.efectivoEsperado).toBe(84750 - 2999 - 1800 - 1 + 1);
  });

  it('sin grupo payment_reversals (fixtures legados) el esperado no cambia', () => {
    const s = computeDailySummary(makeReport({ payment_reversals: undefined }), 'CUP');
    expect(s.reversionesPagosCash).toBe(0);
    expect(s.efectivoEsperado).toBe(84750 - 2999 - 1800 - 1);
  });

  it('identidad: customExpected (todos los conceptos) == esperado oficial con reversiones', () => {
    const s = computeDailySummary(makeReport(), 'CUP');
    const e = customExpected(s, { ...DEFAULT_SUMMARY_CONCEPTS });
    expect(e).toBe(s.efectivoEsperado);
  });
});

describe('CP-OPS-ENERVIDA · filas del PDF (buildDiarioIncomeRows)', () => {
  it('muestra la fila de reversiones cuando existen', () => {
    const s = computeDailySummary(makeReport(), 'CUP');
    const rows = buildDiarioIncomeRows('CUP', s, curResult, null, null, null);
    const rev = rows.find(r => r.label.includes('Reversiones de pagos'));
    expect(rev).toBeDefined();
    expect(rev!.amount).toBe(1);
  });

  it('§2.2 — los conceptos ocultos colapsan en «Otros conceptos incluidos» con la suma neta', () => {
    const s = computeDailySummary(makeReport(), 'CUP');
    // Ocultar TODO del bloque de egresos (otrosEgresos) y las ventas por
    // transferencia: el documento impreso las agrupa sin alterar importes.
    const display = { ...DEFAULT_SUMMARY_CONCEPTS, otrosEgresos: false };
    const rows = buildDiarioIncomeRows('CUP', s, curResult, null, null, display);
    const others = rows.filter(r => r.label === 'Otros conceptos incluidos');
    expect(others).toHaveLength(1);
    // neto = −(comisiones 0 + servicios 4799 + proveedores 1 − reversiones 1)
    expect(others[0].amount).toBe(4799);
    expect(others[0].note).toBe('expense');
    // Las filas individuales ocultas desaparecen del documento…
    expect(rows.some(r => r.label === 'Servicios recibidos pagados en efectivo')).toBe(false);
    expect(rows.some(r => r.label === 'Reversiones de pagos a proveedores (efectivo)')).toBe(false);
    // …y las visibles permanecen intactas (presentación pura).
    expect(rows.some(r => r.label === 'Ventas en efectivo' && r.amount === 84750)).toBe(true);
  });

  it('§2.2 — con todo visible (display null) el comportamiento es el previo', () => {
    const s = computeDailySummary(makeReport(), 'CUP');
    const rows = buildDiarioIncomeRows('CUP', s, curResult, null, null, null);
    expect(rows.some(r => r.label === 'Otros conceptos incluidos')).toBe(false);
    expect(rows.some(r => r.label === 'Servicios recibidos pagados en efectivo')).toBe(true);
  });
});
