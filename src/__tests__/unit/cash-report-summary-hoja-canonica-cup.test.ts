/**
 * cash-report-summary-hoja-canonica-cup.test.ts
 * MISIÓN DEFINITIVA — CLASIFICACIÓN POR MONEDA EN REPORTE ENTREGA (23/10/2026).
 *
 * CONTRATO VIGENTE (reescrito por la MISIÓN DEFINITIVA 2026-10-24; sustituye
 * al contrato «hoja canónica» de la misión anterior, que añadía la
 * equivalencia total_cup de cobros en OTRA moneda DENTRO de las filas de
 * venta — la venta 7 USD aparecía como segunda venta de 5.600 CUP en la hoja
 * CUP: «hoja CUP +5.600, hoja USD +7»).
 *
 * Contrato único (regla §2 de summary.ts):
 *   · INGRESO por ventas: SIEMPRE nativo de la hoja (cobro real).
 *   · EQUIVALENCIA canónica: línea PROPIA (equivCashOtraMoneda /
 *     equivVouchersOtraMoneda), solo hoja CUP; NUNCA entra en
 *     ventasCash/ventasTotales.
 *   · La equivalencia viaja desde la MISMA reconstrucción que produce
 *     sales_split (sales_equiv_cash_other_cup) o, en el fallback de grupos,
 *     se computa de los total_cup de los grupos — mismo resultado en ambas
 *     vías (una sola fuente de verdad).
 *
 * MISIÓN CORRECTIVA (2026-10-25) — SALDO INICIAL Y CONCILIACIÓN DEL EFECTIVO:
 * el EFECTIVO ESPERADO pasa de «total de movimientos del período» a SALDO DE
 * CIERRE FÍSICO por moneda (saldo inicial + cobros billetes + ingresos −
 * egresos). La equivalencia canónica de cobros en otra moneda es ahora
 * CONSOLIDACIÓN DE PRESENTACIÓN: los billetes de ese cobro viven físicamente
 * en la hoja USD (su esperado ya los cuenta); alimentar también el esperado
 * de la hoja CUP rompería la conciliación con el libro físico y el enlace
 * cierre-de-un-período = apertura-del-siguiente (misión §4/§6/§9).
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

describe('MISIÓN DEFINITIVA — caso EXACTO 23/10: venta 7 USD cobrada en efectivo USD', () => {
  it('hoja USD: la venta aparece UNA vez (7). Hoja CUP: 0 de ingreso por esa venta', () => {
    // La ruta reconstruye: { cash, USD, 1 tx, total 7, total_cup 5600 }
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
      ],
    });

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);           // UNA sola vez, en su hoja
    expect(hojaUsd.ventasTotales).toBe(7);
    expect(hojaUsd.efectivoEsperado).toBe(7);
    expect(hojaUsd.equivCashOtraMoneda).toBe(0);  // la hoja USD no consolida equivalencias

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(0);           // ← ANTES: 5.600 (SEGUNDA VENTA — defecto)
    expect(hojaCup.ventasTotales).toBe(0);        // ← ninguna venta CUP
    // La equivalencia contable vive en su LÍNEA PROPIA (no en las filas de venta):
    expect(hojaCup.equivCashOtraMoneda).toBe(5600); // 7 × 800 (tasa de la operación)
    // MISIÓN CORRECTIVA: la equivalencia NO alimenta el esperado de la hoja
    // CUP — esos billetes viven físicamente en la hoja USD (ya contados ahí).
    // Con saldo inicial 0 (fixture sin apertura), el esperado CUP físico = 0.
    expect(hojaCup.efectivoEsperado).toBe(0);
    expect(hojaCup.saldoInicial).toBe(0);
    expect(hojaCup.liquidacionBilletes).toBe(0);  // sin liquidación explícita ⇒ vistas coinciden
  });

  it('vía sales_split (canal principal): la equivalencia de la MISMA reconstrucción no duplica el ingreso', () => {
    const r = S({
      sales_split: {
        USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
      },
      sales_equiv_cash_other_cup: 5600,
      sales: [
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(0);           // split manda: ingreso nativo CUP = 0
    expect(hojaCup.ventasTotales).toBe(0);
    expect(hojaCup.equivCashOtraMoneda).toBe(5600);
    // MISIÓN CORRECTIVA: esperado = saldo FÍSICO CUP (los billetes USD viven
    // en la hoja USD) — la equivalencia es consolidación de presentación.
    expect(hojaCup.efectivoEsperado).toBe(0);

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);
    expect(hojaUsd.efectivoEsperado).toBe(7);
  });

  it('regresión CUP: cobro nativo CUP sigue contando UNA vez (sin duplicar por total_cup)', () => {
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 5600, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(5600);
    expect(hojaCup.equivCashOtraMoneda).toBe(0);  // su propia moneda no es equivalencia
    expect(hojaCup.efectivoEsperado).toBe(5600);

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(0);
    expect(hojaUsd.efectivoEsperado).toBe(0);
  });

  it('día mixto: efectivo CUP nativo + efectivo USD → ingreso CUP solo nativo; equivalencia separada; esperado = suma contable', () => {
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 1000, total_cup: 1000 },
        { payment_method: 'cash', currency: 'USD', total: 7, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(1000);        // solo el nativo — ANTES: 6600 (duplicaba el USD como venta CUP)
    expect(hojaCup.ventasTotales).toBe(1000);
    expect(hojaCup.equivCashOtraMoneda).toBe(5600);
    // MISIÓN CORRECTIVA: esperado CUP = saldo FÍSICO (1.000 CUP cobrados;
    // los 7 USD billetes cuentan en la hoja USD — equivalencia solo presenta).
    expect(hojaCup.efectivoEsperado).toBe(1000);

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);           // el cobro USD NO se duplica en su hoja por el canónico
    expect(hojaUsd.efectivoEsperado).toBe(7);
  });

  it('vouchers en otra moneda: equivalencia informativa, fuera de las filas de venta y del esperado', () => {
    const r = S({
      sales: [
        { payment_method: 'transfer', currency: 'USD', total: 7, total_cup: 5600 },
        { payment_method: 'zelle', currency: 'USD', total: 10, total_cup: 8000 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasTransfer).toBe(0);       // ← ANTES: 5.600 (venta fantasma)
    expect(hojaCup.ventasZelle).toBe(0);          // ← ANTES: 8.000
    expect(hojaCup.ventasTotales).toBe(0);
    expect(hojaCup.equivVouchersOtraMoneda).toBe(13600); // 5600 + 8000 (informativo)
    expect(hojaCup.equivCashOtraMoneda).toBe(0);
    expect(hojaCup.efectivoEsperado).toBe(0);     // el voucher no es efectivo físico

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasTransfer).toBe(7);
    expect(hojaUsd.ventasZelle).toBe(10);
  });

  it('sales_split presente conserva prioridad del split (sin fallback de grupos)', () => {
    const r = S({
      sales_split: {
        USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
      },
      sales: [{ payment_method: 'cash', currency: 'USD', total: 9999, total_cup: 999999 }],
    });

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);           // split manda sobre grupos
    expect(hojaUsd.equivCashOtraMoneda).toBe(0);  // sin campo de equivalencia ⇒ 0 (nunca inventado)
  });

  it('coherencia de vías: fallback de grupos y sales_split+equiv producen el MISMO esperado CUP (una sola fuente de verdad)', () => {
    // Mismo día económico: venta CUP 1.000 + venta USD 7 (canónico 5.600).
    const viaGrupos = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', transaction_count: 1, total: 1000, total_cup: 1000 },
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
      ],
    });
    const viaSplit = S({
      sales_split: {
        CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 },
        USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
      },
      sales_equiv_cash_other_cup: 5600,
    });
    const a = computeDailySummary(viaGrupos, 'CUP');
    const b = computeDailySummary(viaSplit, 'CUP');
    // MISIÓN CORRECTIVA: ambas vías producen el MISMO esperado CUP FÍSICO
    // (1.000 = cobros CUP nativos; la equivalencia es presentación).
    expect(a.efectivoEsperado).toBe(b.efectivoEsperado);
    expect(a.ventasCash).toBe(b.ventasCash);             // ingreso nativo 1.000 en ambas vías
    expect(a.equivCashOtraMoneda).toBe(b.equivCashOtraMoneda); // 5.600 separado en ambas vías
    expect(b.ventasCash).toBe(1000);
    expect(b.equivCashOtraMoneda).toBe(5600);
    expect(b.efectivoEsperado).toBe(1000);
  });
});
