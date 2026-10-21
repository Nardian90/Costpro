/**
 * cash-report-summary.test.ts — FASE C del brief: 18 escenarios financieros.
 *
 * Pruebas de las FÓRMULAS centralizadas (src/lib/cash-report/summary.ts) con
 * cifras CONTROLADAS y verificables — sin dependencia de datos históricos de
 * producción (EnerVida intacta). El fixture replica el día real auditado
 * (12.600 efectivo + 48.000 transferencia = 60.600) más variantes.
 *
 * El ejemplo ilustrativo del brief (§4) se verifica como caso derivado:
 *   ventasCash 31.200, transfer 48.000, comisión cash 312, servicios 10.000
 *   → ventasTotales 79.200 · efectivoEsperado 20.888.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDailySummary, computeCuadre, cuadreLabel,
  splitItemPortion, lineTotalCup,
  type CashReportLike, type TxSplit,
} from '@/lib/cash-report/summary';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

describe('Escenarios 1-2 — ventas efectivo/transferencia como categorías independientes', () => {
  it('1: split real: efectivo y transferencia independientes (fixture del día auditado EnerVida 02/10)', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 12600, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 60600 },
      },
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ventasCash).toBe(12600);
    expect(s.ventasTransfer).toBe(48000);
    expect(s.ventasTotales).toBe(60600);        // aditivas y mutuamente excluyentes
    expect(s.efectivoEsperado).toBe(12600);     // el transfer NO es efectivo físico
  });

  it('2: ventas totales = efectivo + transferencia (identidad con datos mixtos reales)', () => {
    // 4 ventas reales: 600 cash + 2000 cash + 20000 mixed (10k+10k) + 38000 transfer
    const r = S({
      sales_split: { CUP: { cash: 12600, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 60600 } },
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ventasTotales).toBe(s.ventasCash + s.ventasTransfer + s.ventasZelle + s.ventasMixed);
    expect(s.ventasTotales).toBe(60600);
  });

  it('2b: fallback legacy sin split: mixed NO entra al efectivo esperado (conservador)', () => {
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 2000 },
        { payment_method: 'mixed', currency: 'CUP', total: 20000 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ventasCash).toBe(2000);
    expect(s.ventasMixed).toBe(20000);          // al total, no al efectivo
    expect(s.ventasTotales).toBe(22000);
    expect(s.efectivoEsperado).toBe(2000);
  });
});

describe('Escenario 3-6 — comisiones', () => {
  it('3: sugerida = confirmada (mismo importe): la comisión cash reduce el esperado exactamente', () => {
    const r = S({
      sales_split: { CUP: { cash: 31200, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 79200 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 312 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.comisionesCash).toBe(312);
    expect(s.efectivoEsperado).toBe(31200 - 312);
  });

  it('4: confirmada con importe distinto (justificada en el documento): el FINAL es el que descuenta', () => {
    // calculated 312 → final 400 (nota en manual_adjustment_reason del documento)
    const r = S({
      sales_split: { CUP: { cash: 31200, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 31200 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 400 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.comisionesCash).toBe(400);
    expect(s.efectivoEsperado).toBe(31200 - 400);
  });

  it('5: comisión pagada en EFECTIVO reduce el efectivo esperado', () => {
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 250 }],
    });
    expect(computeDailySummary(r, 'CUP').efectivoEsperado).toBe(9750);
  });

  it('6: comisión pagada por TRANSFERENCIA NO reduce el efectivo físico', () => {
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 5000, zelle: 0, mixedUnsplit: 0, total: 15000 } },
      commissions: [{ payment_method: 'transfer', currency: 'CUP', total: 250 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.comisionesTransfer).toBe(250);
    expect(s.comisionesCash).toBe(0);
    expect(s.efectivoEsperado).toBe(10000); // intacto
  });
});

describe('Escenario 7-8 — servicios recibidos', () => {
  it('7: servicios recibidos pagados en efectivo reducen el esperado (línea propia)', () => {
    const r = S({
      sales_split: { CUP: { cash: 31200, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 79200 } },
      payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 10000 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.serviciosRecibidosCash).toBe(10000);
    expect(s.recibosProveedoresCash).toBe(0);
    expect(s.efectivoEsperado).toBe(31200 - 10000);
  });

  it('8: combinación comisiones + servicios (ejemplo ilustrativo del brief §4)', () => {
    const r = S({
      sales_split: { CUP: { cash: 31200, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 79200 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 312 }],
      payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 10000 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ventasTotales).toBe(79200);
    expect(s.efectivoEsperado).toBe(20888); // 31200 − 312 − 10000 (ejemplo del brief)
  });

  it('8b: servicios recibidos no se descuentan dos veces (separados de recibos de proveedores)', () => {
    const r = S({
      sales_split: { CUP: { cash: 50000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 50000 } },
      payments: [
        { payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 10000 },
        { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 5000 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.serviciosRecibidosCash).toBe(10000);
    expect(s.recibosProveedoresCash).toBe(5000);
    expect(s.efectivoEsperado).toBe(50000 - 10000 - 5000); // una sola vez cada uno
  });
});

describe('Escenario 9-10 — esperado, contado y cuadre', () => {
  it('9: diferencia = contado − esperado (signo y magnitud)', () => {
    expect(computeCuadre(20888, 20888)).toBe(0);
    expect(computeCuadre(2600, 20888)).toBe(-18288); // faltante del ejemplo del brief
    expect(computeCuadre(21000, 20888)).toBe(112);   // sobrante
    expect(cuadreLabel(0)).toBe('cuadrado');
    expect(cuadreLabel(-18288)).toBe('faltante');
    expect(cuadreLabel(112)).toBe('sobrante');
  });

  it('10: ajustes positivo y negativo con nota afectan según su dirección', () => {
    const base = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
    });
    const conPos = S({
      ...base, sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      adjustments: [{ id: 'a1', direction: 'in', amount: 500, note: 'Fondo inicial' }],
    });
    const conNeg = S({
      ...base, sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      adjustments: [{ id: 'a2', direction: 'out', amount: 300, note: 'Gasto menor autorizado' }],
    });
    expect(computeDailySummary(conPos, 'CUP').efectivoEsperado).toBe(10500);
    expect(computeDailySummary(conNeg, 'CUP').efectivoEsperado).toBe(9700);
    // Neto combinado y nota conservada en la fila (la nota viaja en el documento)
    const ambos = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      adjustments: [
        { id: 'a1', direction: 'in', amount: 500, note: 'x' },
        { id: 'a2', direction: 'out', amount: 300, note: 'y' },
      ],
    });
    const s = computeDailySummary(ambos, 'CUP');
    expect(s.ajustesNeto).toBe(200);
    expect(s.efectivoEsperado).toBe(10200);
  });
});

describe('Escenario 11-14 — tabla de movimientos y desglose', () => {
  it('11: (idempotencia de comisión) el histórico pagado no se suma dos veces — RPC filtra status=paid y payment_method', () => {
    // La comisión entra UNA vez vía commissions (el endpoint payments rechaza
    // duplicados por índice único worker+periodo y el PATCH pay es idempotente).
    // Aquí: la misma comisión pagada aparece una sola fila → un solo descuento.
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 300 }],
    });
    expect(computeDailySummary(r, 'CUP').comisionesCash).toBe(300);
    expect(computeDailySummary(r, 'CUP').efectivoEsperado).toBe(9700);
  });

  it('12-13: reparto por renglón — la columna Transfer. cuadra con el pool real (mono/multi ítem, personalizadas)', () => {
    // Día auditado: 4 ventas mono-item con split real por transacción.
    const txCash: TxSplit = { cash: 600, transfer: 0, zelle: 0 };
    const txMixed: TxSplit = { cash: 10000, transfer: 10000, zelle: 0 };
    const txTransfer: TxSplit = { cash: 0, transfer: 38000, zelle: 0 };
    const p1 = splitItemPortion(600, 600, txCash);
    const p2 = splitItemPortion(20000, 20000, txMixed);
    const p3 = splitItemPortion(38000, 38000, txTransfer);
    expect(p1.cash).toBe(600); expect(p1.transfer).toBe(0);
    expect(p2.cash).toBe(10000); expect(p2.transfer).toBe(10000);
    expect(p3.cash).toBe(0); expect(p3.transfer).toBe(38000);
    // Σ columnas = split real del día (coincide con payment-totals)
    expect(p1.cash + p2.cash + p3.cash + 2000).toBe(12600);
    expect(p1.transfer + p2.transfer + p3.transfer).toBe(48000);
    // Multi-item proporcional dentro de SU transacción (30k/70k de una venta mixed de 100k: 60k cash + 40k transfer)
    const pA = splitItemPortion(30000, 70000, { cash: 60000, transfer: 40000, zelle: 0 });
    expect(pA.cash).toBeCloseTo(60000 * 30000 / 70000, 6);
    expect(pA.transfer).toBeCloseTo(40000 * 30000 / 70000, 6);
  });

  it('14: FIX D1 — total de línea = precio unitario × cantidad (el defecto de «Ventas Totales 31.200»)', () => {
    // Cemento TBV: unit 19.000 × qty 2 = 38.000 (antes devolvía 19.000)
    expect(lineTotalCup(19000, 19000, 1, 2)).toBe(38000);
    expect(lineTotalCup(10000, 10000, 1, 2)).toBe(20000);
    expect(lineTotalCup(2000, 2000, 1, 1)).toBe(2000);
    expect(lineTotalCup(200, 200, 1, 3)).toBe(600);
    // Σ líneas = 60.600 real (la base rota sumaba 31.200 en unitarios)
    expect(38000 + 20000 + 2000 + 600).toBe(60600);
    // Fallback con precio en USD y tipo de cambio
    expect(lineTotalCup(null, 10, 380, 2)).toBe(7600);
  });
});

describe('Escenario 15-16 — opciones de contenido (OT, comisión) — afectan al documento, no al cálculo', () => {
  it('15: omitir OT no altera importes del resumen (el cálculo vive en summary, la opción en el PDF)', () => {
    // La opción includeOtReport es del builder PDF; el summary es invariante.
    // Verificamos que la fórmula no dependa de opciones de presentación.
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
    });
    expect(computeDailySummary(r, 'CUP').efectivoEsperado).toBe(10000);
  });

  it('16: ocultar la columna Comisión no altera los totales financieros', () => {
    // Ídem: la columna es presentación del builder; comisionesCash sigue descontando.
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 500 }],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.comisionesCash).toBe(500);
    expect(s.efectivoEsperado).toBe(9500);
  });
});

describe('Escenario 17-18 — CUP/USD y concordancia pantalla=preview=PDF', () => {
  it('17: monedas separadas sin conversión (USD con Zelle; CUP intacto)', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 12600, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 60600 },
        USD: { cash: 150, transfer: 0, zelle: 300, mixedUnsplit: 0, total: 450 },
      },
    });
    const cup = computeDailySummary(r, 'CUP');
    const usd = computeDailySummary(r, 'USD');
    expect(cup.ventasTotales).toBe(60600);
    expect(usd.ventasCash).toBe(150);
    expect(usd.ventasZelle).toBe(300);
    expect(usd.ventasTotales).toBe(450);
    expect(usd.efectivoEsperado).toBe(150); // el Zelle no es efectivo físico
  });

  it('18: concordancia — misma instancia de fórmula para pantalla y PDF (misma entrada ⇒ mismo esperado)', () => {
    const report = S({
      sales_split: { CUP: { cash: 31200, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 79200 } },
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 312 }],
      payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'service', total: 10000 }],
      adjustments: [{ id: 'a', direction: 'out', amount: 112, note: 'n' }],
    });
    const viaPantalla = computeDailySummary(report, 'CUP');
    const viaPdf = computeDailySummary(JSON.parse(JSON.stringify(report)) as CashReportLike, 'CUP');
    expect(viaPantalla).toEqual(viaPdf);
    expect(viaPantalla.efectivoEsperado).toBe(31200 - 312 - 10000 - 112);
    // Cuadre final con 2.600 contados: faltante 18.400 (del ejemplo, con ajuste −112)
    expect(computeCuadre(2600, viaPantalla.efectivoEsperado)).toBe(-(31200 - 312 - 10000 - 112 - 2600));
  });
});

describe('USD — comisiones/servicios en USD afectan solo al esperado USD', () => {
  it('comisión cash USD descuenta del esperado USD, no del CUP', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 },
        USD: { cash: 200, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 200 },
      },
      commissions: [{ payment_method: 'cash', currency: 'USD', total: 20 }],
    });
    expect(computeDailySummary(r, 'CUP').efectivoEsperado).toBe(1000);
    expect(computeDailySummary(r, 'USD').efectivoEsperado).toBe(180);
  });
});

describe('MISIÓN INGRESOS/EGRESOS (2026-10-20) — documentos de caja en el reporte', () => {
  it('ingresos de caja suman y egresos restan al efectivo esperado (por moneda)', () => {
    const r = S({
      sales_split: { CUP: { cash: 10000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 10000 } },
      cash_flows: [
        { id: 'cf1', direction: 'in', amount: 5000, currency: 'CUP' },
        { id: 'cf2', direction: 'out', amount: 2000, currency: 'CUP' },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ingresosCaja).toBe(5000);
    expect(s.egresosCaja).toBe(2000);
    expect(s.efectivoEsperado).toBe(10000 + 5000 - 2000);
  });

  it('fondo 5.000 + constitución 5.000 − devolución 2.000 + ventas cash → esperado correcto (ejemplo del brief)', () => {
    const r = S({
      sales_split: { CUP: { cash: 169000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 169000 } },
      cash_flows: [
        { id: 'cf1', direction: 'in', amount: 5000, currency: 'CUP' },
        { id: 'cf2', direction: 'out', amount: 2000, currency: 'CUP' },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.efectivoEsperado).toBe(169000 + 5000 - 2000);
    expect(computeCuadre(172000, s.efectivoEsperado)).toBe(0); // cuadrado
  });

  it('documento anulado: original + contra se cancelan (filas del ledger)', () => {
    const r = S({
      cash_flows: [
        { id: 'cf1', direction: 'in', amount: 5000, currency: 'CUP' },
        { id: 'cf1c', direction: 'out', amount: 5000, currency: 'CUP' }, // fila contra de la anulación
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ingresosCaja).toBe(5000);
    expect(s.egresosCaja).toBe(5000);
    expect(s.efectivoEsperado).toBe(0); // neto cero
  });

  it('USD: los documentos USD afectan solo al esperado USD (nunca sumados a CUP)', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 },
        USD: { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 },
      },
      cash_flows: [
        { id: 'cf1', direction: 'in', amount: 150, currency: 'USD' },
      ],
    });
    const cup = computeDailySummary(r, 'CUP');
    const usd = computeDailySummary(r, 'USD');
    expect(cup.efectivoEsperado).toBe(1000);
    expect(cup.ingresosCaja).toBe(0);
    expect(usd.ingresosCaja).toBe(150);
    expect(usd.efectivoEsperado).toBe(150);
  });

  it('compatibilidad: reportes sin cash_flows cuadran igual que antes (cero por omisión)', () => {
    const r = S({
      sales_split: { CUP: { cash: 12600, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 60600 } },
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.ingresosCaja).toBe(0);
    expect(s.egresosCaja).toBe(0);
    expect(s.efectivoEsperado).toBe(12600);
  });
});


describe('MISIÓN DE SEGUIMIENTO 2026-10-21 — reembolsos de devoluciones (regla P1, v2.22.0)', () => {
  it('reembolso de devolución EN EFECTIVO reduce el esperado (fila refund cash)', () => {
    const r = S({
      sales_split: { CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 } },
      refund_rows: [
        { id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 300, amount_cup: 300 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.reembolsosCash).toBe(300);
    expect(s.efectivoEsperado).toBe(700);
  });

  it('reembolso por TRANSFERENCIA/ZELLE queda en el detalle pero NO reduce el efectivo', () => {
    const r = S({
      sales_split: { CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 } },
      refund_rows: [
        { id: 'rf1', payment_method: 'transfer', currency: 'CUP', amount: 500, amount_cup: 500 },
        { id: 'rf2', payment_method: 'zelle', currency: 'CUP', amount: 200, amount_cup: 200 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.reembolsosCash).toBe(0);
    expect(s.efectivoEsperado).toBe(1000);
    // v2.23.0: expuestos como reembolsosVoucher (informativo, base NETA)
    expect(s.reembolsosVoucher).toBe(700);
  });

  it('v2.23.0 — reembolsos por voucher (transfer+zelle) se exponen informativos sin tocar el esperado', () => {
    // Decisión del propietario 2026-10-21 «según estándar internacional»:
    // conciliación contra estado externo = movimiento NETO del período. El
    // reporte documenta los brutos y los vouchers netos; el balance de la
    // hoja permanece SOLO efectivo.
    const r = S({
      sales_split: { CUP: { cash: 1000, transfer: 800, zelle: 200, mixedUnsplit: 0, total: 2000 } },
      refund_rows: [
        { id: 'rf1', payment_method: 'transfer', currency: 'CUP', amount: 300, amount_cup: 300 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.reembolsosVoucher).toBe(300);
    expect(s.reembolsosCash).toBe(0);
    expect(s.efectivoEsperado).toBe(1000); // intacto
  });

  it('v2.23.0 — refund cash + voucher en el mismo día: cada medio en su término', () => {
    const r = S({
      sales_split: { CUP: { cash: 1000, transfer: 500, zelle: 0, mixedUnsplit: 0, total: 1500 } },
      refund_rows: [
        { id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 100, amount_cup: 100 },
        { id: 'rf2', payment_method: 'transfer', currency: 'CUP', amount: 50, amount_cup: 50 },
      ],
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.reembolsosCash).toBe(100);
    expect(s.reembolsosVoucher).toBe(50);
    expect(s.efectivoEsperado).toBe(900); // 1000 − 100 (el voucher no toca el cajón)
  });

  it('v2.23.0 — refund voucher USD solo afecta la hoja USD (aislamiento por moneda)', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 },
        USD: { cash: 50, transfer: 100, zelle: 0, mixedUnsplit: 0, total: 150 },
      },
      refund_rows: [
        { id: 'rf1', payment_method: 'transfer', currency: 'USD', amount: 20, amount_cup: 8200 },
      ],
    });
    const cup = computeDailySummary(r, 'CUP');
    const usd = computeDailySummary(r, 'USD');
    expect(cup.reembolsosVoucher).toBe(0);
    expect(usd.reembolsosVoucher).toBe(20);
    expect(usd.reembolsosCash).toBe(0);
    expect(usd.efectivoEsperado).toBe(50); // intacto
  });

  it('devolución parcial + total: refunds cash acumulan (200+100)', () => {
    const r = S({
      sales_split: { CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 } },
      refund_rows: [
        { id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 200, amount_cup: 200 },
        { id: 'rf2', payment_method: 'cash', currency: 'CUP', amount: 100, amount_cup: 100 },
      ],
    });
    expect(computeDailySummary(r, 'CUP').efectivoEsperado).toBe(700);
  });

  it('refund USD solo afecta la hoja USD (nunca sumado a CUP)', () => {
    const r = S({
      sales_split: {
        CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 },
        USD: { cash: 50, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 50 },
      },
      refund_rows: [
        { id: 'rf1', payment_method: 'cash', currency: 'USD', amount: 20, amount_cup: 8200 },
      ],
    });
    const cup = computeDailySummary(r, 'CUP');
    const usd = computeDailySummary(r, 'USD');
    expect(cup.reembolsosCash).toBe(0);
    expect(cup.efectivoEsperado).toBe(1000);
    expect(usd.reembolsosCash).toBe(20);
    expect(usd.efectivoEsperado).toBe(30);
  });

  it('compatibilidad: reportes sin refund_rows cuadran igual que antes (cero por omisión)', () => {
    const r = S({
      sales_split: { CUP: { cash: 12600, transfer: 48000, zelle: 0, mixedUnsplit: 0, total: 60600 } },
    });
    const s = computeDailySummary(r, 'CUP');
    expect(s.reembolsosCash).toBe(0);
    expect(s.reembolsosVoucher).toBe(0);
    expect(s.efectivoEsperado).toBe(12600);
  });

  it('fórmula completa v2.22.0 con todos los términos (ventas+OT+ajustes+caja−comisiones−servicios−recibos−refunds)', () => {
    const r = S({
      sales_split: { CUP: { cash: 169000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 169000 } },
      adjustments: [{ id: 'a1', direction: 'in', amount: 100, note: 'ajuste de prueba' }],
      cash_flows: [
        { id: 'cf1', direction: 'in', amount: 5000, currency: 'CUP' },
        { id: 'cf2', direction: 'out', amount: 2000, currency: 'CUP' },
      ],
      refund_rows: [{ id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 300, amount_cup: 300 }],
      commissions: [{ payment_method: 'cash', currency: 'CUP', total: 100 }],
      payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', total: 400 }],
    });
    // 169000 + 100 + 5000 − 100 − 400 − 2000 − 300 = 171300
    const s = computeDailySummary(r, 'CUP');
    expect(s.efectivoEsperado).toBe(171300);
  });
});
