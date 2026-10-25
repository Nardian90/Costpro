/**
 * custom-result.test.ts — MISIÓN CONCILIACIÓN DEFINITIVA (2026-10-26).
 *
 * CONTRATO DEL REPORTE PERSONALIZADO CON ANEXO DE AUDITORÍA:
 *   1. La selección de conceptos GOBIERNA el cálculo (no solo oculta filas).
 *   2. Dos resultados independientes: personalizado (conceptos activos +
 *      ventas seleccionadas) y OFICIAL de referencia (universo completo —
 *      jamás derivado del personalizado ni de sus diferencias).
 *   3. Descomposición aditiva de la diferencia: total = porConceptos +
 *      porVentas + residuo(=0) — ventas separadas de conceptos (misión §5.2).
 *   4. Identidad: con todo activo, personalizado === oficial (quien no
 *      personaliza ve el resultado íntegro de COSTPRO).
 *   5. Incidente A reproducido aritméticamente: el 2.820,00 CUP es el residuo
 *      de valorizar los MISMOS billetes USD a tasas distintas (cobros a tasas
 *      de ítems 288.420 vs entrega a 800 = 285.600) — el libro físico neto
 *      queda 0/0 y la diferencia queda explicada, NO forzada a cero.
 *
 * Datos sintéticos (cifras documentales de producción — misma convención que
 * cash-report-enervida-2310.test.ts); ninguna escritura: funciones puras.
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';
import {
  DEFAULT_SUMMARY_CONCEPTS,
  deselectAllSummaryConcepts,
  loadSummaryConcepts,
  SUMMARY_CONCEPTS,
  type SummaryConceptsSelection,
} from '@/lib/cash-report/report-selection';
import {
  computeCustomCurrencyResult,
  customExpected,
  customVentasTotales,
  conceptTerms,
} from '@/lib/cash-report/custom-result';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

/** Reporte del período con TODOS los términos de la fórmula del esperado. */
const REPORTE = S({
  opening_balance: { CUP: 1000, USD: 20 },
  sales_split: {
    CUP: { cash: 5000, transfer: 800, zelle: 0, mixedUnsplit: 0, total: 5800 },
    USD: { cash: 7, transfer: 0, zelle: 9, mixedUnsplit: 0, total: 16 },
  },
  sales_bills_split: { CUP: 5000, USD: 7 },
  sales_equiv_cash_other_cup: 5600,
  cash_flows: [
    { id: 'cf-in', direction: 'in', amount: 300, currency: 'CUP', amount_cup: 300 },
    { id: 'cf-out', direction: 'out', amount: 1200, currency: 'CUP', amount_cup: 1200 },
  ],
  payments: [
    { payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 150 },
    { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 90 },
  ],
  commissions: [{ payment_method: 'cash', currency: 'CUP', total: 60 }],
  production: [{ payment_method: 'cash', currency: 'CUP', total: 450 }],
  adjustments: [
    { id: 'adj+', direction: 'in', amount: 35, note: '' },
    { id: 'adj-', direction: 'out', amount: 25, note: '' },
  ],
  refund_rows: [{ id: 'ref', payment_method: 'cash', currency: 'CUP', amount: 70 }],
});

const resumen = (report: CashReportLike) => computeDailySummary(report, 'CUP');
const counts = { validas: 3, seleccionadas: 3 };

describe('MISIÓN CONCILIACIÓN · contrato del cálculo personalizado', () => {
  it('IDENTIDAD: todos los conceptos activos reproducen EXACTAMENTE el oficial', () => {
    const s = resumen(REPORTE);
    expect(customExpected(s, DEFAULT_SUMMARY_CONCEPTS)).toBe(s.efectivoEsperado);
    const r = computeCustomCurrencyResult('CUP', s, s, DEFAULT_SUMMARY_CONCEPTS, counts);
    expect(r.efectivoEsperadoPersonalizado).toBe(s.efectivoEsperado);
    expect(r.esPersonalizado).toBe(false);
    expect(r.conciliacion.efectivoEsperadoOficial).toBe(s.efectivoEsperado);
    // Sin personalización no hay diferencia y la conciliación es completa:
    expect(r.conciliacion.diferenciaTotal).toBe(0);
    expect(r.conciliacion.conciliado).toBe(true);
  });

  it('desactivar «Egresos de caja» EXCLUYE el término del cálculo personalizado (§4.3)', () => {
    const s = resumen(REPORTE);
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    // oficial = saldoInicial + cobros + OT + ajustes(+35−25) + ingresosCaja
    //           − comisiones − servicios − proveedores − egresosCaja − reembolsos
    // personalizado (sin egresosCaja) = oficial + 1200:
    expect(r.efectivoEsperadoPersonalizado).toBe(s.efectivoEsperado + 1200);
    // El anexo registra el importe oficial omitido y la diferencia:
    const row = r.conceptos.find(c => c.key === 'egresosCaja')!;
    expect(row.estado).toBe('omitido');
    expect(row.importeOficial).toBe(1200);
    expect(row.importePersonalizado).toBe(0);
    expect(row.diferencia).toBe(1200);
    expect(row.efecto).toBe('componente');
    // La diferencia total se explica por el concepto desactivado:
    expect(r.conciliacion.diferenciaPorConceptos).toBe(-1200);
    expect(r.conciliacion.diferenciaPorVentas).toBe(0);
    expect(r.conciliacion.diferenciaNoExplicada).toBe(0);
    expect(r.conciliacion.conciliado).toBe(true);
  });

  it('desactivar «Saldo inicial / fondo de caja» deja de incorporar esa base (§4.3)', () => {
    const s = resumen(REPORTE);
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, saldoInicial: false };
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    expect(r.efectivoEsperadoPersonalizado).toBe(s.efectivoEsperado - 1000);
    const row = r.conceptos.find(c => c.key === 'saldoInicial')!;
    expect(row.importeOficial).toBe(1000);
    expect(row.importePersonalizado).toBe(0);
  });

  it('desactivar «Ventas en efectivo» retira el NETO DE BILLETES completo (cobros + liquidación)', () => {
    // Venta 7 USD con liquidación explícita (10 recibidos, 2.400 de vuelto):
    // su hoja CUP aporta −2.400 de billetes; desactivar el concepto retira
    // AMBOS (valor y vuelto) — exactamente como si esas ventas no se computaran.
    const rep = S({
      opening_balance: { CUP: 8438079.98, USD: 357 },
      sales_split: { USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 } },
      sales_bills_split: { CUP: -2400, USD: 10 },
      sales_equiv_cash_other_cup: 5600,
      cash_flows: [{ id: 'cf', direction: 'out', amount: 8435679.98, currency: 'CUP', amount_cup: 8435679.98 }],
    });
    const s = resumen(rep);
    expect(s.efectivoEsperado).toBe(0); // 8.438.079,98 − 2.400 − 8.435.679,98
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, ventasEfectivo: false };
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    // Sin el neto de billetes de las ventas: el vuelto −2.400 desaparece:
    expect(r.efectivoEsperadoPersonalizado).toBe(0 + 2400);
    const row = r.conceptos.find(c => c.key === 'ventasEfectivo')!;
    expect(row.importeOficial).toBe(-2400); // cobrosBilletes de la hoja CUP
    expect(row.importePersonalizado).toBe(0);
  });

  it('desactivar un concepto INFORMATIVO no modifica el saldo físico (§4.3)', () => {
    const s = resumen(REPORTE);
    // transferencia y Zelle no son efectivo físico:
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, ventasTransferencia: false };
    expect(customExpected(s, sel)).toBe(s.efectivoEsperado); // sin cambio físico
    // …pero el agregado «Resumen del día» se recalcula SIN ese componente:
    expect(customVentasTotales(s, sel)).toBe(s.ventasTotales - 800);
    expect(customVentasTotales(s, DEFAULT_SUMMARY_CONCEPTS)).toBe(s.ventasTotales);
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    expect(r.ventasTotalesPersonalizado).toBe(s.ventasTotales - 800);
    const row = r.conceptos.find(c => c.key === 'ventasTransferencia')!;
    expect(row.efecto).toBe('informativo');
    // Partida informativa: SU diferencia no entra a la diferencia monetaria:
    expect(r.conciliacion.diferenciaPorConceptos).toBe(0);
  });

  it('desactivar «Equivalencia CUP» la omite del cálculo contable sin reclasificar la venta (§4.3)', () => {
    const s = resumen(REPORTE);
    expect(s.equivCashOtraMoneda).toBe(5600);
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, equivalenciaCup: false };
    // El esperado físico NO cambia (la equivalencia no es término del esperado):
    expect(customExpected(s, sel)).toBe(s.efectivoEsperado);
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    // El equivalente contable personalizado la excluye:
    expect(r.equivalenteContablePersonalizado).toBe(s.ventasCash);
    expect(r.equivalenteContablePersonalizado).not.toBe(s.ventasCash + 5600);
    // El oficial de referencia la conserva:
    expect(r.conciliacion.equivalenciaOficial).toBe(5600);
    expect(r.conciliacion.equivalenciaPersonalizada).toBe(0);
    // La venta original NO se reclasifica (no aparece como venta CUP):
    expect(r.seleccion.ventasCash).toBe(s.ventasCash);
    expect(r.seleccion.ventasCash).toBe(5000);
  });

  it('«otrosEgresos» agrupa comisiones + servicios + proveedores (agrupación coherente §4.2)', () => {
    const t = conceptTerms(resumen(REPORTE));
    expect(t.otrosEgresos).toBe(60 + 150 + 90); // comisiones + servicios + proveedores
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, otrosEgresos: false };
    const r = computeCustomCurrencyResult('CUP', resumen(REPORTE), resumen(REPORTE), sel, counts);
    expect(r.efectivoEsperadoPersonalizado).toBe(resumen(REPORTE).efectivoEsperado + 300);
  });

  it('desmarcar una VENTA: sus cobros dejan de computar; saldo inicial y movimientos de caja NO desaparecen (§4.3)', () => {
    // Universo completo vs conjunto seleccionado (simula buildSelectionAdjustedReport):
    const universo = S({
      opening_balance: { CUP: 1000 },
      sales_split: { CUP: { cash: 5000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 5000 } },
      sales_bills_split: { CUP: 5000 },
      cash_flows: [{ id: 'cf', direction: 'out', amount: 400, currency: 'CUP', amount_cup: 400 }],
    });
    // La selección excluye la única venta ⇒ cobros 0 (saldo inicial y egreso intactos):
    const seleccion = S({
      opening_balance: { CUP: 1000 },
      sales_split: { CUP: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 } },
      sales_bills_split: { CUP: 0 },
      cash_flows: [{ id: 'cf', direction: 'out', amount: 400, currency: 'CUP', amount_cup: 400 }],
    });
    const r = computeCustomCurrencyResult('CUP', resumen(universo), resumen(seleccion), DEFAULT_SUMMARY_CONCEPTS, { validas: 1, seleccionadas: 0 });
    // Oficial: 1000 + 5000 − 400 = 5600 · Personalizado: 1000 − 400 = 600
    expect(r.conciliacion.efectivoEsperadoOficial).toBe(5600);
    expect(r.efectivoEsperadoPersonalizado).toBe(600);
    // Diferencia SOLO por ventas (conceptos intactos):
    expect(r.conciliacion.diferenciaPorVentas).toBe(5000);
    expect(r.conciliacion.diferenciaPorConceptos).toBe(0);
    expect(r.conciliacion.diferenciaNoExplicada).toBe(0);
    expect(r.conciliacion.conciliado).toBe(true);
    // La venta excluida permanece en el universo oficial:
    expect(r.conciliacion.ventasValidas).toBe(1);
    expect(r.conciliacion.ventasExcluidas).toBe(1);
    // El saldo inicial y el egreso NO desaparecen por la selección:
    expect(r.seleccion.saldoInicial).toBe(1000);
    expect(r.seleccion.egresosCaja).toBe(400);
  });

  it('descomposición aditiva: total = porConceptos + porVentas + residuo(=0), separadas (§5.2)', () => {
    const universo = S({
      opening_balance: { CUP: 1000 },
      sales_split: { CUP: { cash: 5000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 5000 } },
      sales_bills_split: { CUP: 5000 },
      cash_flows: [{ id: 'cf', direction: 'out', amount: 400, currency: 'CUP', amount_cup: 400 }],
    });
    const seleccion = S({
      opening_balance: { CUP: 1000 },
      sales_split: { CUP: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 } },
      sales_bills_split: { CUP: 0 },
      cash_flows: [{ id: 'cf', direction: 'out', amount: 400, currency: 'CUP', amount_cup: 400 }],
    });
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false, saldoInicial: false };
    const r = computeCustomCurrencyResult('CUP', resumen(universo), resumen(seleccion), sel, { validas: 1, seleccionadas: 0 });
    // total = oficial(5600) − personalizado(0 − 400 = −400... sin saldo inicial ni venta, con el egreso EXCLUIDO):
    // personalizado = 0 (sin saldo) + 0 (sin ventas) − 0 (egreso desactivado) − 0 = 0
    expect(r.efectivoEsperadoPersonalizado).toBe(0);
    expect(r.conciliacion.diferenciaTotal).toBe(5600);
    // porConceptos = oficial(5600) − personalizadoConTodasLasVentas(5000)
    //              = saldo 1000 + egreso 400 (los dos términos desactivados):
    expect(r.conciliacion.diferenciaPorConceptos).toBe(600);
    // porVentas = personalizadoTodasVentas(5000) − personalizado(0):
    expect(r.conciliacion.diferenciaPorVentas).toBe(5000);
    expect(r.conciliacion.diferenciaPorConceptos + r.conciliacion.diferenciaPorVentas).toBe(r.conciliacion.diferenciaTotal);
    expect(r.conciliacion.diferenciaNoExplicada).toBe(0);
    expect(r.conciliacion.conciliado).toBe(true);
  });

  it('el OFICIAL jamás se construye a partir del personalizado ni de sus diferencias (§4.1)', () => {
    // Cambiar la selección de conceptos/ventas NO altera el oficial:
    const s = resumen(REPORTE);
    const rAll = computeCustomCurrencyResult('CUP', s, s, DEFAULT_SUMMARY_CONCEPTS, counts);
    const sel: SummaryConceptsSelection = deselectAllSummaryConcepts();
    sel.ventasEfectivo = true; // al menos uno activo
    const rSel = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    expect(rSel.conciliacion.efectivoEsperadoOficial).toBe(rAll.conciliacion.efectivoEsperadoOficial);
    expect(rSel.conciliacion.ventasTotalesOficial).toBe(rAll.conciliacion.ventasTotalesOficial);
    expect(rSel.conciliacion.saldoInicialOficial).toBe(rAll.conciliacion.saldoInicialOficial);
    // …pero el personalizado sí cambia:
    expect(rSel.efectivoEsperadoPersonalizado).not.toBe(rAll.efectivoEsperadoPersonalizado);
  });

  it('el anexo documenta TODOS los conceptos — ninguno desaparece silenciosamente (§5.2)', () => {
    const s = resumen(REPORTE);
    const sel: SummaryConceptsSelection = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    const r = computeCustomCurrencyResult('CUP', s, s, sel, counts);
    // La tabla cubre TODO el panel de conceptos (12 claves del contrato):
    expect(r.conceptos.length).toBe(SUMMARY_CONCEPTS.length);
    for (const def of SUMMARY_CONCEPTS) {
      const row = r.conceptos.find(c => c.key === def.key);
      expect(row, `concepto ${def.key} presente en el anexo`).toBeDefined();
    }
    // Los omitidos conservan su importe oficial:
    const omitidos = r.conceptos.filter(c => c.estado === 'omitido');
    expect(omitidos.map(c => c.key)).toEqual(['egresosCaja']);
    expect(omitidos[0]!.importeOficial).toBe(1200);
    // Base monetaria documentada por fila:
    expect(r.conceptos.every(c => c.base.length > 0)).toBe(true);
    expect(r.conceptos.every(c => c.observacion.length > 0)).toBe(true);
  });

  it('persistencia v1 compatible: preferencias anteriores (7 claves) no rompen y las nuevas activan (§7)', () => {
    // Esquema antiguo (solo las 7 claves originales del PR #1480):
    const prefVieja = {
      saldoInicial: true, resumenDia: true, ventasEfectivo: true,
      ventasTransferencia: true, ventasZelle: true, equivalenciaCup: true,
      egresosCaja: false, // una desactivada
    };
    window.localStorage.setItem(
      'costpro:cash-report:summary-concepts:v1:store:compat-test',
      JSON.stringify(prefVieja),
    );
    const loaded = loadSummaryConcepts('compat-test');
    // La clave antigua se conserva:
    expect(loaded.egresosCaja).toBe(false);
    // Las claves nuevas activan por defecto (comportamiento íntegro):
    expect(loaded.ingresosCaja).toBe(true);
    expect(loaded.otrosEgresos).toBe(true);
    expect(loaded.otIngresos).toBe(true);
    expect(loaded.ajustes).toBe(true);
    expect(loaded.reembolsos).toBe(true);
  });
});

describe('MISIÓN CONCILIACIÓN · INCIDENTE A — residuo 2.820,00 CUP reproducido y explicado', () => {
  /**
   * Cifras documentales de ENERVIDA-VITALLCONS verificadas contra producción
   * (solo lectura, 2026-10-26):
   *
   *   get_cash_flow_summary (fórmula canónica, vista de VALOR):
   *     cash_sales     = 8.750.854,98 CUP  (incluye USD valorizado a tasas de venta)
   *     cash_flow_out  = 8.729.279,98 CUP  (entrega de 367 USD valorizada a 800)
   *     expected_cash  = 2.820,00 CUP
   *   get_cash_currency_summary (libro FÍSICO de billetes):
   *     net CUP = 0 · net USD = 0  (357 + 10 entradas − 367 entregados = 0)
   *
   * TRAZABILIDAD EXACTA del 2.820,00:
   *   · Cobros USD históricos (ítems): 357 USD valorizados a Σ(cash_paid×tasa)
   *     = 288.420 CUP.
   *   · Venta liquidada 23ccd04f: +10 USD (valor efectivo 8.000 = 5.600 de
   *     venta + 2.400 de vuelto devuelto) — entra y sale a la misma tasa 800.
   *   · Entrega IE de 367 USD a tasa 800 = 293.600 CUP; la parte legacy
   *     (357 USD × 800) = 285.600 CUP.
   *   · RESIDUO FANTASMA = 288.420 − 285.600 = 2.820,00 CUP: los MISMOS
   *     billetes USD entraron valorizados a las tasas históricas de los ítems
   *     y salieron a la tasa vigente de la entrega. NO hay error del libro
   *     físico (0/0 correcto); la diferencia pertenece a la BASE de cálculo.
   */
  const COBROS_USD_ITEMS_CUP = 288420;   // 357 USD × Σ tasas de ítems
  const ENTREGA_USD_CUP = 293600;        // 367 USD × 800
  const VENTA_LIQUIDADA_VALOR_CUP = 5600; // 7 USD × 800 (valor, no billetes CUP)
  const VUELTO_CUP = 2400;               // vuelto dado en CUP de esa venta

  it('el residuo de la vista de valor es EXACTAMENTE 2.820,00 CUP (tasa de ítems vs tasa de entrega)', () => {
    // La entrega (367 USD → 293.600) cubre: los 357 USD legacy (a 800), la
    // parte de VALOR de la venta liquidada (5.600) y su vuelto (2.400):
    // 285.600 = 293.600 − 5.600 − 2.400 → residuo = 288.420 − 285.600.
    const residuo = COBROS_USD_ITEMS_CUP - (ENTREGA_USD_CUP - VENTA_LIQUIDADA_VALOR_CUP - VUELTO_CUP);
    expect(residuo).toBe(2820);
    // Equivalentemente: la parte legacy de la entrega valorizada a 800:
    expect(COBROS_USD_ITEMS_CUP - 357 * 800).toBe(2820);
  });

  it('la fórmula canónica (get_cash_flow_summary) reproduce el 2.820 con los términos oficiales', () => {
    // Términos reales del RPC (verificados en producción, ventana 1970→now):
    const terms = {
      opening: 0,
      cashSales: 8750854.98,      // incluye 288.420 de cobros USD (tasas de ítems) + 5.600 de la venta liquidada
      cashProduction: 223350,
      cashFlowIn: 0,
      cashOutflows: 2400,         // proveedores
      cashCommissions: 300,
      cashFlowOut: 8729279.98,    // incluye la entrega de 367 USD a 800 (293.600)
      cashRefunds: 239405,
      cashRecoveries: 0,
    };
    const expected =
      terms.opening + terms.cashSales + terms.cashProduction + terms.cashFlowIn
      - terms.cashOutflows - terms.cashCommissions - terms.cashFlowOut
      - terms.cashRefunds + terms.cashRecoveries;
    expect(Math.round(expected * 100) / 100).toBe(2820.00);
  });

  it('el libro físico reconcilia a CERO en ambas monedas — el 2.820 NO respalda billetes', () => {
    // Términos del libro (get_cash_currency_summary, verificados en producción):
    const cup = {
      salesCash: 8454434.98, cashFlowIn: 0, cashFlowOut: 8435679.98,
      supplierCash: 2400, productionCash: 223350, commissionsCash: 300,
      devolutionRefunds: 239405, adjustments: 0, recoveries: 0,
    };
    const netCup = cup.salesCash + cup.cashFlowIn - cup.cashFlowOut - cup.supplierCash
      + cup.productionCash - cup.commissionsCash - cup.devolutionRefunds + cup.adjustments + cup.recoveries;
    expect(Math.round(netCup * 100) / 100).toBe(0);
    // Billetes USD: 357 (legacy) + 10 (venta liquidada) − 367 (entrega) = 0
    expect(357 + 10 - 367).toBe(0);
    // La diferencia entre bases queda EXPLICADA (2.820 = valorización a tasas
    // distintas de los mismos billetes) — no se fuerza a cero ni se inventan
    // asientos: la interfaz la presenta como «Diferencia pendiente de
    // conciliación» con su explicación.
    const diferencia = 2820 - netCup;
    expect(diferencia).toBe(2820);
  });

  it('magnitudes distintas por diseño: la conciliación de la misión NO exige igualdad entre bases', () => {
    // La vista de valor (canónico) y el libro físico son bases DIFERENTES
    // (misión §3.2/§3.3): se conservan ambas y la diferencia se explica por
    // la valorización de billetes USD a tasas históricas distintas.
    const esperadoCanónico = 2820;
    const físicoCUP = 0;
    const físicoUSD = 0;
    const diferencia = esperadoCanónico - físicoCUP;
    expect(diferencia).toBe(2820);
    // Estado correcto: pendiente de conciliación (no «Conciliado»):
    const conciliado = Math.abs(diferencia) < 0.005 && físicoUSD === 0;
    expect(conciliado).toBe(false);
  });
});
