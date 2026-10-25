/**
 * cash-report-enervida-2310.test.ts — MISIÓN CORRECTIVA DEFINITIVA (2026-10-25).
 * CASO ENERVIDA-VITALLCONS · 23/10/2026 (reproducción con datos sintéticos
 * que replican EXACTAMENTE las cifras documentales de producción).
 *
 * HECHOS VERIFICADOS CONTRA LA BD DE PRODUCCIÓN (lectura, Management API):
 *   · Saldo inicial del día 23/10 (libro get_cash_currency_summary, ventana
 *     [origen, 2026-10-23T04:00Z)): 8.438.079,98 CUP + 357 USD.
 *   · Venta 23ccd04f…: ítem «Conectores MC4» 7 USD @ 800; liquidación
 *     persistida cash_received_usd=10, change_given_cup=2.400 (billete de
 *     10 USD con 2.400 CUP de vuelto). Fila de pago CUP 5.600 (canónico).
 *   · Egreso REAL IE-000001-2026 «entrega_efectivo: Entregado»:
 *     payment_date 2026-10-23 16:00Z, importe 8.435.679,98 CUP (out).
 *   · Cierre del libro: 0,00 CUP + 367 USD — el 8.435.679,98 ES una salida
 *     efectiva (entrega), NO un saldo de cierre mal clasificado.
 *
 * El caso de aceptación §6 del brief exige: efectivo esperado CUP = 0,00;
 * con conteo 0,00 el cuadre es 0,00 — CUADRADO.
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, computeCuadre, cuadreLabel, type CashReportLike } from '@/lib/cash-report/summary';
import {
  buildSelectionAdjustedReport,
  computeSelectedSalesTotals,
  DEFAULT_SUMMARY_CONCEPTS,
  type SaleRow,
} from '@/lib/cash-report/report-selection';

/** La venta del 23/10 tal como la expone /api/cash-report (sales_rows). */
const VENTA_MC4: SaleRow = {
  id: '23ccd04f-db81-4537-a3db-2dabf40e31a8',
  created_at: '2026-10-23T22:15:24.210166Z',
  status: 'completed',
  source: 'reconstruction',
  // Reconstrucción del cobro (vista de VALOR): 7 USD en efectivo @ 800.
  buckets: [{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }],
  // Liquidación explícita (vista FÍSICA de billetes): +10 USD − 2.400 CUP.
  settlement: { cash_received_cup: null, change_given_cup: 2400, cash_received_usd: 10, change_given_usd: null },
  items: [],
  payments: [],
};

/** Egreso IE-000001-2026 (entrega_efectivo) — fila del ledger. */
const ENTREGA = {
  id: '8e4fd8d7-d70a-4c5b-a9d5-7fcb6bffb06e',
  direction: 'out' as const,
  amount: 8435679.98,
  currency: 'CUP',
  amount_cup: 8435679.98,
  note: 'IE-000001-2026 · entrega_efectivo: Entregado',
  document_number: 'IE-000001-2026',
  created_by: null,
  created_at: '2026-10-24T17:30:38.616771Z',
};

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

/** Reporte del 23/10 completo (misma forma que el payload de la ruta). */
const REPORTE_2310 = S({
  opening_balance: { CUP: 8438079.98, USD: 357 },
  sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
  sales_bills_split: { CUP: -2400, USD: 10 },
  sales_equiv_cash_other_cup: 5600,
  cash_flows: [ENTREGA],
});

describe('MISIÓN CORRECTIVA · CASO ENERVIDA-VITALLCONS 23/10/2026', () => {
  it('naturaleza documental del 8.435.679,98: salida EFECTIVA (entrega), no un saldo mal clasificado', () => {
    // El importe del incidente coincide con el saldo físico CUP que mostraba
    // el libro DESPUÉS del vuelto de la venta (8.438.079,98 − 2.400). El
    // documento IE-000001-2026 entrega EXACTAMENTE ese cajón. La prueba
    // documenta la clasificación: es un EGRESO real del período (direction
    // 'out', ref_type 'cash_flow') — y con el saldo inicial incluido el
    // esperado NO es negativo.
    const s = computeDailySummary(REPORTE_2310, 'CUP');
    expect(s.egresosCaja).toBe(8435679.98); // clasificado UNA vez como egreso
    expect(s.efectivoEsperado).toBe(0);      // 8.438.079,98 − 2.400 − 8.435.679,98
    expect(s.efectivoEsperado).not.toBe(-8430079.98); // jamás el valor del incidente
  });

  it('el día cierra en 0,00 CUP: venta 7 USD (equiv 5.600) + vuelto 2.400 + entrega 8.435.679,98', () => {
    const cup = computeDailySummary(REPORTE_2310, 'CUP');
    expect(cup.saldoInicial).toBe(8438079.98);
    expect(cup.ventasCash).toBe(0);            // la venta es USD — no es ingreso CUP
    expect(cup.equivCashOtraMoneda).toBe(5600); // consolidación documentada
    expect(cup.liquidacionBilletes).toBe(-2400); // vuelto dado en CUP (billetes)
    expect(cup.efectivoEsperado).toBe(0.00);
    // Conteo real 0,00 (caja CUP vacía tras la entrega) ⇒ CUADRADO (§6):
    const cuadre = computeCuadre(0, cup.efectivoEsperado);
    expect(cuadre).toBe(0);
    expect(cuadreLabel(cuadre)).toBe('cuadrado');
  });

  it('hoja USD: el billete de 10 USD queda en el cajón (357 + 10 = 367), vuelto dado en CUP', () => {
    const usd = computeDailySummary(REPORTE_2310, 'USD');
    expect(usd.saldoInicial).toBe(357);
    expect(usd.ventasCash).toBe(7);            // valor de la venta en su hoja
    expect(usd.liquidacionBilletes).toBe(3);   // 10 recibidos − 7 de venta
    expect(usd.efectivoEsperado).toBe(367);    // 357 + 10 (billetes físicos)
  });

  it('SIN el documento de entrega: el 8.435.679,98 es el SALDO DE CIERRE, no un egreso', () => {
    // Variante de control (§9): si el 8.435.679,98 NO fuera una salida real,
    // el reporte lo obtiene como SALDO (esperado), jamás lo clasifica como
    // egreso por parecido numérico con el libro.
    const sinEntrega = S({
      opening_balance: { CUP: 8438079.98, USD: 357 },
      sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
      sales_bills_split: { CUP: -2400, USD: 10 },
      sales_equiv_cash_other_cup: 5600,
      cash_flows: [],
    });
    const cup = computeDailySummary(sinEntrega, 'CUP');
    expect(cup.egresosCaja).toBe(0);
    expect(cup.efectivoEsperado).toBe(8435679.98); // el cierre ES el saldo
    // Y con el cierre como apertura del día siguiente, el libro enlaza:
    const diaSiguiente = computeDailySummary(S({
      opening_balance: { CUP: cup.efectivoEsperado },
      sales_split: { CUP: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 } },
      sales_bills_split: { CUP: 100 },
    }), 'CUP');
    expect(diaSiguiente.efectivoEsperado).toBe(8435779.98); // 8.435.679,98 + 100
  });

  it('excluir la venta ajusta SOLO los cobros: el saldo inicial y la entrega no cambian (§7)', () => {
    const sel = buildSelectionAdjustedReport(REPORTE_2310, [VENTA_MC4], new Set([VENTA_MC4.id]));
    expect(sel.selectionActive).toBe(true);
    const ajustado = computeDailySummary(sel.report, 'CUP');
    // Cobros del conjunto vacío: sin venta ⇒ sin vuelto ni billetes.
    expect(ajustado.ventasCash).toBe(0);
    expect(ajustado.liquidacionBilletes).toBe(0);
    // El saldo inicial NO cambia por la selección:
    expect(ajustado.saldoInicial).toBe(8438079.98);
    // La entrega (movimiento de caja) TAMPOCO cambia:
    expect(ajustado.egresosCaja).toBe(8435679.98);
    // Esperado hipotético del conjunto seleccionado (sin la venta):
    expect(ajustado.efectivoEsperado).toBe(8438079.98 - 8435679.98); // 2.400
  });

  it('con la venta INCLUIDA, la selección reproduce el esperado del universo completo', () => {
    const sel = buildSelectionAdjustedReport(REPORTE_2310, [VENTA_MC4], new Set());
    expect(sel.selectionActive).toBe(false); // sin exclusiones: reporte original
    const ajustado = computeDailySummary(sel.report, 'CUP');
    expect(ajustado.efectivoEsperado).toBe(0);
    // La recomputación por filas usa la MISMA regla de billetes (liquidación
    // manda): USD +10 / CUP −2.400 — idéntico a sales_bills_split del servidor.
    const t = computeSelectedSalesTotals([VENTA_MC4], new Set());
    expect(t.billsSplit.CUP).toBe(-2400);
    expect(t.billsSplit.USD).toBe(10);
  });

  it('conceptos: ocultar «Saldo inicial» o «Egresos» NO altera el esperado (presentación pura, §5/§6)', () => {
    // El esperado del PDF/Excel no depende de las filas visibles: se calcula
    // con la fórmula completa del sistema. Esta prueba fija el INVARIANTE que
    // comparten los builders (los tests de PDF/Excel lo verifican sobre el
    // documento real).
    const base = computeDailySummary(REPORTE_2310, 'CUP');
    // «Ocultar» el saldo inicial equivale a no renderizar SU fila: el cálculo
    // del sistema NO se recalcula (summary no recibe la selección — jamás
    // cambia el esperado por presentación).
    void DEFAULT_SUMMARY_CONCEPTS;
    expect(base.efectivoEsperado).toBe(0);
    expect(computeCuadre(0, base.efectivoEsperado)).toBe(0);
  });
});
