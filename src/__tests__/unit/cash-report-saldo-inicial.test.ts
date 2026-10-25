/**
 * cash-report-saldo-inicial.test.ts — MISIÓN CORRECTIVA DEFINITIVA (2026-10-25).
 * REPORTE ENTREGA Y CONCILIACIÓN DEL EFECTIVO — apertura y cierre.
 *
 * Blanlinda el contrato de `efectivoEsperado` como SALDO DE CIERRE por moneda
 * (§4 del brief):
 *
 *   Efectivo esperado al cierre = saldo inicial + ingresos de efectivo del
 *                                  período − egresos de efectivo del período
 *
 * Reglas del ledger que la fórmula debe respetar (§9):
 *   · El saldo inicial de una fecha histórica es el saldo AUTORITATIVO
 *     inmediatamente anterior al período (llega como `opening_balance`;
 *     jamás se recalcula ni se deriva del propio resultado).
 *   · Un ingreso de efectivo incrementa el esperado UNA sola vez.
 *   · Un egreso lo reduce UNA sola vez.
 *   · Una anulación/reversión aplica las contrapartidas correctas (fila
 *     original + fila contra ⇒ neto cero sobre el período completo).
 *   · Dos períodos consecutivos ENLAZAN: el cierre del primero es la
 *     apertura del segundo (regla del libro de caja).
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, computeCuadre, cuadreLabel, type CashReportLike, type CashFlowRow } from '@/lib/cash-report/summary';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

/** Fondo/venta CUP cobrada en efectivo (vista de valor = vista de billetes). */
const ventaCup = (total: number) => S({
  sales_split: { CUP: { cash: total, transfer: 0, zelle: 0, mixedUnsplit: 0, total } },
  sales_bills_split: { CUP: total },
});

const egreso = (amount: number): CashFlowRow => ({
  id: `cf-${amount}`, direction: 'out', amount, currency: 'CUP',
  amount_cup: amount, note: 'IE · entrega', document_number: 'IE-1',
});

describe('MISIÓN CORRECTIVA · saldo inicial y efectivo esperado (apertura/cierre)', () => {
  it('el saldo inicial del período llega del libro autoritativo (opening_balance) y abre el esperado', () => {
    // Día 23/10 estilizado: fondo previo 8.430.079,98 + cobro 5.600 − entrega 8.435.679,98 = 0.
    const r = S({
      opening_balance: { CUP: 8430079.98 },
      sales_split: { CUP: { cash: 5600, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 5600 } },
      sales_bills_split: { CUP: 5600 },
      cash_flows: [egreso(8435679.98)],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.saldoInicial).toBe(8430079.98);
    expect(s.efectivoEsperado).toBe(8430079.98 + 5600 - 8435679.98); // = 0,00
    expect(s.efectivoEsperado).toBe(0);
  });

  it('sin opening_balance (entorno legado): saldo inicial 0 — nunca inventado', () => {
    const s = computeDailySummary(ventaCup(1000), 'CUP');
    expect(s.saldoInicial).toBe(0);
    expect(s.efectivoEsperado).toBe(1000);
  });

  it('un ingreso de efectivo incrementa el esperado UNA sola vez (sin duplicar por equivalencia)', () => {
    // Venta 7 USD cobrada en efectivo: hoja USD +7 (UNA vez); hoja CUP 0 — la
    // equivalencia (5.600) es consolidación de PRESENTACIÓN, no efectivo CUP.
    const r = S({
      sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
      sales_bills_split: { USD: 7 },
      sales_equiv_cash_other_cup: 5600,
      opening_balance: { CUP: 0, USD: 100 },
    });
    const usd = computeDailySummary(r, 'USD');
    expect(usd.efectivoEsperado).toBe(107); // 100 + 7 (UNA sola vez)
    const cup = computeDailySummary(r, 'CUP');
    expect(cup.efectivoEsperado).toBe(0);   // el cobro USD NO es efectivo CUP
    expect(cup.equivCashOtraMoneda).toBe(5600); // …pero su valor sí se documenta
  });

  it('un egreso de efectivo reduce el esperado UNA sola vez', () => {
    const r = S({
      opening_balance: { CUP: 10000 },
      sales_split: { CUP: { cash: 2000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 2000 } },
      sales_bills_split: { CUP: 2000 },
      cash_flows: [egreso(500)],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.efectivoEsperado).toBe(10000 + 2000 - 500);
    expect(s.egresosCaja).toBe(500); // contado UNA vez
  });

  it('una anulación aporta fila original + fila contra ⇒ neto cero en el período (regla del ledger)', () => {
    // Egreso de 800 anulado: filas out 800 + in 800 (contrapartida del documento).
    const anulado: CashFlowRow[] = [
      { id: 'cf-a', direction: 'out', amount: 800, currency: 'CUP', amount_cup: 800, note: 'IE-9', document_number: 'IE-9' },
      { id: 'cf-a-contra', direction: 'in', amount: 800, currency: 'CUP', amount_cup: 800, note: 'IE-9 ANULADO', document_number: 'IE-9' },
    ];
    const r = S({ opening_balance: { CUP: 3000 }, cash_flows: anulado });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ingresosCaja).toBe(800);
    expect(s.egresosCaja).toBe(800);
    expect(s.efectivoEsperado).toBe(3000); // neto cero — cierre = apertura
  });

  it('dos períodos consecutivos ENLAZAN: el cierre del primero es la apertura del segundo (regla del ledger)', () => {
    // Período 1 (día 1): apertura 1.000 + cobro 2.000 − egreso 500 ⇒ cierre 2.500.
    const p1 = computeDailySummary(S({
      opening_balance: { CUP: 1000 },
      sales_split: { CUP: { cash: 2000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 2000 } },
      sales_bills_split: { CUP: 2000 },
      cash_flows: [egreso(500)],
    }), 'CUP');
    expect(p1.efectivoEsperado).toBe(2500);

    // Período 2 (día 2): la apertura ES el cierre del día 1 (saldo autoritativo
    // del libro inmediatamente anterior); + cobro 300 ⇒ cierre 2.800.
    const p2 = computeDailySummary(S({
      opening_balance: { CUP: p1.efectivoEsperado },
      sales_split: { CUP: { cash: 300, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 300 } },
      sales_bills_split: { CUP: 300 },
    }), 'CUP');
    expect(p2.saldoInicial).toBe(2500);
    expect(p2.efectivoEsperado).toBe(2800);

    // El enlace acumulado cuadra con el saldo corrido del libro:
    // 1.000 + 2.000 − 500 + 300 = 2.800.
    expect(1000 + 2000 - 500 + 300).toBe(p2.efectivoEsperado);
  });

  it('liquidación explícita cruzada: el vuelto CUP sale del cajón CUP y el billete USD entra al USD', () => {
    // Cobro de 10 USD con 2.400 CUP de vuelto (venta de 7 USD @ 800):
    //   billetes: USD +10 · CUP −2.400 (regla del libro §1).
    const r = S({
      opening_balance: { CUP: 8438079.98, USD: 357 },
      sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
      // Vista FÍSICA del ledger: neto de billetes por moneda.
      sales_bills_split: { CUP: -2400, USD: 10 },
      sales_equiv_cash_other_cup: 5600,
    });
    const cup = computeDailySummary(r, 'CUP');
    expect(cup.liquidacionBilletes).toBe(-2400); // vuelto dado en CUP
    expect(cup.efectivoEsperado).toBe(8438079.98 - 2400); // 8.435.679,98

    const usd = computeDailySummary(r, 'USD');
    expect(usd.liquidacionBilletes).toBe(3); // 10 recibidos − 7 de venta
    expect(usd.efectivoEsperado).toBe(357 + 10); // 367
  });

  it('cuadre: contado − esperado, con etiqueta CUADRADO dentro de la tolerancia', () => {
    expect(computeCuadre(0, 0)).toBe(0);
    expect(cuadreLabel(computeCuadre(0, 0))).toBe('cuadrado');
    expect(cuadreLabel(computeCuadre(500, 400))).toBe('sobrante');
    expect(cuadreLabel(computeCuadre(300, 400))).toBe('faltante');
    // Tolerancia monetaria: ±0,005 → cuadrado (cero presentable, no «casi»).
    expect(cuadreLabel(computeCuadre(100.004, 100))).toBe('cuadrado');
    expect(cuadreLabel(computeCuadre(100.01, 100))).toBe('sobrante');
  });

  it('regresión del incidente: el esperado NUNCA es «ingresos − egresos» sin el saldo inicial', () => {
    // Incidente 23/10 (forma documental, ENERVIDA-VITALLCONS): venta de 7 USD
    // cobrada con billete de 10 USD y 2.400 CUP de vuelto (liquidación
    // persistida), fondo previo 8.438.079,98 y ENTREGA documentada de
    // 8.435.679,98 (IE-000001-2026). El esperado CUP = 0,00 — jamás el
    // −8.430.079,98 del incidente (equiv 5.600 − egreso 8.435.679,98).
    const r = S({
      opening_balance: { CUP: 8438079.98, USD: 357 },
      sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
      sales_bills_split: { CUP: -2400, USD: 10 },
      sales_equiv_cash_other_cup: 5600,
      cash_flows: [egreso(8435679.98)],
    });
    const cup = computeDailySummary(r, 'CUP');
    expect(cup.efectivoEsperado).not.toBeLessThan(0);
    expect(cup.efectivoEsperado).toBe(0); // 8.438.079,98 − 2.400 − 8.435.679,98
    // Con conteo 0,00: cuadre 0,00 — CUADRADO (caso de aceptación §6).
    expect(computeCuadre(0, cup.efectivoEsperado)).toBe(0);
    expect(cuadreLabel(computeCuadre(0, cup.efectivoEsperado))).toBe('cuadrado');
  });
});
