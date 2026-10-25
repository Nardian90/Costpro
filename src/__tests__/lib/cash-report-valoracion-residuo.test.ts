/**
 * MISIÓN P0 «EFECTIVO FANTASMA» (2026-10-26) — §7.1 Caso real de
 * ENERVIDA-VITALLCONS reproducido con datos sintéticos (fuentes aisladas —
 * cero escrituras).
 *
 * HECHOS DOCUMENTADOS (diagnóstico read-only de producción, 2026-10-26):
 *   · Cobros históricos en USD: 367 USD valorados canónicamente a 296.420 CUP
 *     (357 USD a tasas de ítems ≈ 288.420 CUP + 10 USD de la venta liquidada
 *     23ccd04f con 2.400 CUP de vuelto).
 *   · Entrega de los MISMOS 367 USD a 800 CUP/USD: 293.600 CUP canónicos.
 *   · Libro físico al final: 0 CUP y 0 USD.
 *   · get_cash_flow_summary.expected_cash = 2.819,9978 ≈ 2.820,00 CUP.
 *
 * VERIFICACIONES (misión §7.1):
 *   1. El esperado FÍSICO por moneda del reporte (computeDailySummary —
 *      fórmula de cierre por moneda) es 0,00 CUP y 0,00 USD.
 *   2. La diferencia de valoración del período = 296.420 − 293.600 = 2.820 CUP.
 *   3. El residuo queda clasificado como valoración contable SIN respaldo en
 *      billetes — NO aparece como efectivo disponible ni se suma al esperado.
 *   4. Regresión por moneda (§7.2): combinaciones de saldos físicos y flujos
 *      con y sin respaldo.
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';
import { computeCustomCurrencyResult } from '@/lib/cash-report/custom-result';
import { DEFAULT_SUMMARY_CONCEPTS } from '@/lib/cash-report/report-selection';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [], cash_flows: [], refund_rows: [],
  ...partial,
});

/**
 * Reproducción sintética del incidente ENERVIDA (cifras del diagnóstico):
 * CUP: cobros 241.655 + anticipos 450 − proveedores 2.400 − comisiones 300 −
 *      reembolsos 239.405 = 0 (billetes CUP netos).
 * USD: cobros 367 − entrega 367 = 0 (billetes USD netos).
 * Canonical USD: 296.420 (cobros a tasas históricas) − 293.600 (entrega a 800)
 *      = 2.820 CUP de valoración sin respaldo físico.
 */
const ENERVIDA: CashReportLike = S({
  opening_balance: { CUP: 0, USD: 0 },
  sales_split: {
    CUP: { cash: 241655, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 241655 },
    USD: { cash: 367, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 367 },
  },
  sales_bills_split: { CUP: 241655, USD: 367 },
  sales_equiv_cash_other_cup: 296420,
  cash_flows: [
    // Entrega de los 367 USD a 800 CUP/USD (misma tasa para todo el lote)
    { id: 'entrega-usd', direction: 'out', amount: 367, currency: 'USD', amount_cup: 293600 },
  ],
  payments: [
    { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 2400 },
  ],
  commissions: [{ payment_method: 'cash', currency: 'CUP', total: 300 }],
  production: [{ payment_method: 'cash', currency: 'CUP', total: 450 }],
  refund_rows: [
    { id: 'ref-1', payment_method: 'cash', currency: 'CUP', amount: 239405, amount_cup: 239405, devolution_id: null, transaction_id: null, note: '', payment_date: '2026-10-20' },
  ],
});

const counts = { validas: 4, seleccionadas: 4 };

describe('MISIÓN P0 · §7.1 — Caso ENERVIDA-VITALLCONS (sintético aislado)', () => {
  it('el esperado FÍSICO por moneda del reporte es 0,00 CUP y 0,00 USD', () => {
    const cup = computeDailySummary(ENERVIDA, 'CUP');
    const usd = computeDailySummary(ENERVIDA, 'USD');
    // Libro físico: los billetes entraron y salieron COMPLETOS.
    expect(cup.efectivoEsperado).toBe(0);
    expect(usd.efectivoEsperado).toBe(0);
    // Los términos del libro por moneda (trazabilidad del caso):
    expect(cup.cobrosBilletes).toBe(241655);
    expect(usd.cobrosBilletes).toBe(367);
    expect(usd.egresosCaja).toBe(367); // la entrega de USD vive en la hoja USD
    expect(cup.recibosProveedoresCash).toBe(2400);
    expect(cup.reembolsosCash).toBe(239405);
  });

  it('la diferencia de valoración del período es 2.820,00 CUP (= 296.420 − 293.600)', () => {
    const cup = computeDailySummary(ENERVIDA, 'CUP');
    // Valor canónico NETO de los flujos USD del período: cobros a tasas
    // históricas (296.420) − entrega a 800 (293.600).
    expect(cup.flujosOtraMonedaValorCup).toBe(2820);
    expect(cup.equivCashOtraMoneda).toBe(296420);
  });

  it('el anexo clasifica el residuo como valoración SIN respaldo en billetes — no efectivo disponible', () => {
    const cup = computeDailySummary(ENERVIDA, 'CUP');
    const usd = computeDailySummary(ENERVIDA, 'USD');
    const r = computeCustomCurrencyResult('CUP', cup, cup, DEFAULT_SUMMARY_CONCEPTS, counts, usd);
    const rec = r.conciliacion;
    expect(rec.diferenciaValoracionCup).toBe(2820);
    // Billetes netos de otra moneda del período: 367 − 367 = 0
    expect(rec.billetesOtraMonedaPeriodo).toBe(0);
    // REGLA INVOLABLE: el residuo NO tiene respaldo en billetes
    expect(rec.residuoValoracionSinRespaldo).toBe(true);
    // El residuo NO toca el esperado físico ni el personalizado:
    expect(rec.efectivoEsperadoOficial).toBe(0);
    expect(rec.efectivoEsperadoPersonalizado).toBe(0);
    expect(rec.diferenciaTotal).toBe(0);
    expect(rec.estado).toBe('sin-diferencias'); // la valoración es magnitud propia
  });

  it('la hoja USD NO consolida valoración (0 en todas sus variantes)', () => {
    const cup = computeDailySummary(ENERVIDA, 'CUP');
    const usd = computeDailySummary(ENERVIDA, 'USD');
    const r = computeCustomCurrencyResult('USD', usd, usd, DEFAULT_SUMMARY_CONCEPTS, counts, cup);
    expect(r.conciliacion.diferenciaValoracionCup).toBe(0);
    expect(r.conciliacion.residuoValoracionSinRespaldo).toBe(false);
  });

  it('la selección de conceptos NO cambia la diferencia de valoración (magnitud oficial)', () => {
    const cup = computeDailySummary(ENERVIDA, 'CUP');
    const usd = computeDailySummary(ENERVIDA, 'USD');
    const sel = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false, otrosEgresos: false };
    const r = computeCustomCurrencyResult('CUP', cup, cup, sel, counts, usd);
    // Desactivar egresos/otros egresos cambia el personalizado, PERO el
    // residuo de valoración sigue siendo el OFICIAL (2.820): la realidad
    // física y la valoración canónica no dependen de la configuración.
    expect(r.conciliacion.diferenciaValoracionCup).toBe(2820);
    expect(r.conciliacion.residuoValoracionSinRespaldo).toBe(true);
    // El personalizado sube (egresos y otros egresos omitidos, reembolsos
    // activos): 241.655 + 450 − 239.405 = 2.700. El esperado físico REAL
    // sigue siendo 0 — la configuración es presentación/cálculo del reporte,
    // no mueve billetes.
    expect(r.efectivoEsperadoPersonalizado).toBe(2700);
  });
});

describe('MISIÓN P0 · §7.2 — Regresión por moneda de la valoración', () => {
  it('sin flujos en otra moneda: residuo 0 y sin clasificación de respaldo', () => {
    const rep = S({
      sales_split: { CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 } },
      sales_bills_split: { CUP: 1000 },
    });
    const cup = computeDailySummary(rep, 'CUP');
    const usd = computeDailySummary(rep, 'USD');
    const r = computeCustomCurrencyResult('CUP', cup, cup, DEFAULT_SUMMARY_CONCEPTS, counts, usd);
    expect(cup.flujosOtraMonedaValorCup).toBe(0);
    expect(r.conciliacion.diferenciaValoracionCup).toBe(0);
    expect(r.conciliacion.residuoValoracionSinRespaldo).toBe(false);
    expect(cup.efectivoEsperado).toBe(1000); // el billete CUP respalda el esperado
  });

  it('billetes de otra moneda REMANENTES: la valoración queda respaldada por esos billetes', () => {
    // Venta de 100 USD a 500 CUP/USD (canonical 50.000) SIN salida posterior:
    // quedan 100 USD físicos en el cajón — la valoración convive con billetes.
    const rep = S({
      opening_balance: { CUP: 0, USD: 0 },
      sales_split: {
        CUP: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 },
        USD: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 },
      },
      sales_bills_split: { USD: 100 },
      sales_equiv_cash_other_cup: 50000,
    });
    const cup = computeDailySummary(rep, 'CUP');
    const usd = computeDailySummary(rep, 'USD');
    const r = computeCustomCurrencyResult('CUP', cup, cup, DEFAULT_SUMMARY_CONCEPTS, counts, usd);
    expect(cup.flujosOtraMonedaValorCup).toBe(50000);
    expect(usd.efectivoEsperado).toBe(100); // 100 USD físicos en el cajón
    expect(r.conciliacion.billetesOtraMonedaPeriodo).toBe(100);
    expect(r.conciliacion.residuoValoracionSinRespaldo).toBe(false); // respaldado
  });

  it('entrada y salida de los mismos USD a tasas DISTINTAS: residuo sin respaldo (§7.2.5)', () => {
    // 100 USD entran valorados a 500 (50.000) y salen entregados a 800
    // (80.000): el canónico queda en −30.000 con libro físico 0/0. El signo
    // del residuo refleja la dirección de la diferencia de tasas.
    const rep = S({
      opening_balance: { CUP: 0, USD: 0 },
      sales_split: {
        CUP: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 },
        USD: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 },
      },
      sales_bills_split: { USD: 100 },
      sales_equiv_cash_other_cup: 50000,
      cash_flows: [
        { id: 'ent-usd', direction: 'out', amount: 100, currency: 'USD', amount_cup: 80000 },
      ],
    });
    const cup = computeDailySummary(rep, 'CUP');
    const usd = computeDailySummary(rep, 'USD');
    const r = computeCustomCurrencyResult('CUP', cup, cup, DEFAULT_SUMMARY_CONCEPTS, counts, usd);
    expect(usd.efectivoEsperado).toBe(0);
    expect(cup.flujosOtraMonedaValorCup).toBe(-30000);
    expect(r.conciliacion.diferenciaValoracionCup).toBe(-30000);
    expect(r.conciliacion.billetesOtraMonedaPeriodo).toBe(0);
    expect(r.conciliacion.residuoValoracionSinRespaldo).toBe(true);
  });

  it('vuelto en moneda distinta de la del cobro (§7.2.7): el neto de billetes manda', () => {
    // Cobro 10 USD (canonical 5.600) con 2.400 CUP de vuelto: hoja CUP
    // −2.400 billetes (partida de liquidación), hoja USD +10. La valoración
    // de los flujos USD solo recoge el tramo USD (5.600) — el vuelto CUP es
    // un flujo CUP 1:1.
    const rep = S({
      sales_split: {
        CUP: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 },
        USD: { cash: 10, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10 },
      },
      sales_bills_split: { CUP: -2400, USD: 10 },
      sales_equiv_cash_other_cup: 5600,
    });
    const cup = computeDailySummary(rep, 'CUP');
    const usd = computeDailySummary(rep, 'USD');
    expect(cup.cobrosBilletes).toBe(-2400); // el vuelto retiró billetes CUP
    expect(cup.liquidacionBilletes).toBe(-2400);
    expect(usd.cobrosBilletes).toBe(10);
    expect(cup.flujosOtraMonedaValorCup).toBe(5600);
  });

  it('CUP 100 + USD 100 físicos (§7.2.4): monedas separadas, sin conversión implícita', () => {
    const rep = S({
      sales_split: {
        CUP: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 },
        USD: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 },
      },
      sales_bills_split: { CUP: 100, USD: 100 },
      sales_equiv_cash_other_cup: 50000,
    });
    const cup = computeDailySummary(rep, 'CUP');
    const usd = computeDailySummary(rep, 'USD');
    expect(cup.efectivoEsperado).toBe(100); // NUNCA 100 + 50.000
    expect(usd.efectivoEsperado).toBe(100);
    expect(cup.flujosOtraMonedaValorCup).toBe(50000); // línea propia, no suma
  });
});
