/**
 * cash-report-summary-hoja-canonica-cup.test.ts
 * MISIÓN VENTA MULTIMONEDA CON VUELTO EN CUP — 23/10/2026 (defecto del resumen).
 *
 * Desde el INCIDENTE 2026-10-16, los grupos `sales` de /api/cash-report se
 * reconstruyen por MONEDA DE COBRO (collection-currency). El fallback de
 * computeDailySummary filtraba `s.currency !== currency`, así que la hoja CUP
 * (hoja CANÓNICA del modelo v2.24) perdía los cobros en efectivo recibidos en
 * otra moneda → cash_balance_cup = 0 y "EFECTIVO ESPERADO A ENTREGAR" $0.00
 * con un día que SOLO tuviera cobros USD (caso exacto de la misión:
 * venta 7 USD cobrada en efectivo USD, canónico 5.600 CUP).
 *
 * Contrato corregido:
 *   · Hoja CUP (canónica): suma la equivalencia total_cup de los cobros cash
 *     en OTRA moneda (5.600) — sin doble conteo del cobro CUP nativo.
 *   · Hoja USD (física): solo el nativo (7).
 *   · Vouchers (transfer/zelle) de otra moneda: canónicos informativos en la
 *     hoja CUP, jamás en el efectivo esperado.
 */
import { describe, it, expect } from 'vitest';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';

const S = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

describe('MISIÓN MULTIMONEDA — hoja canónica CUP con cobros en efectivo USD', () => {
  it('caso EXACTO 23/10: venta 7 USD cobrada en efectivo USD → hoja CUP espera 5.600', () => {
    // El route reconstruye: { cash, USD, 1 tx, total 7, total_cup 5600 }
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(5600);        // canónico del cobro USD (7 × 800)
    expect(hojaCup.ventasTotales).toBe(5600);
    expect(hojaCup.efectivoEsperado).toBe(5600);  // ← ANTES: 0 (defecto del resumen)

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);           // físico del cajón USD
    expect(hojaUsd.efectivoEsperado).toBe(7);
  });

  it('regresión CUP: cobro nativo CUP no se duplica en la hoja canónica', () => {
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 5600, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(5600);        // entra UNA vez (nativo, no total_cup otra vez)
    expect(hojaCup.efectivoEsperado).toBe(5600);

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(0);
    expect(hojaUsd.efectivoEsperado).toBe(0);
  });

  it('día mixto: efectivo CUP + efectivo USD → hoja CUP suma nativo + canónico', () => {
    const r = S({
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 1000, total_cup: 1000 },
        { payment_method: 'cash', currency: 'USD', total: 7, total_cup: 5600 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasCash).toBe(6600);
    expect(hojaCup.efectivoEsperado).toBe(6600);
  });

  it('vouchers en otra moneda: canónicos informativos, NO entran al efectivo esperado', () => {
    const r = S({
      sales: [
        { payment_method: 'transfer', currency: 'USD', total: 7, total_cup: 5600 },
        { payment_method: 'zelle', currency: 'USD', total: 10, total_cup: 8000 },
      ],
    });

    const hojaCup = computeDailySummary(r, 'CUP');
    expect(hojaCup.ventasTransfer).toBe(5600);
    expect(hojaCup.ventasZelle).toBe(8000);
    expect(hojaCup.efectivoEsperado).toBe(0);     // el voucher no es efectivo físico
  });

  it('sales_split presente conserva el comportamiento priorizado (sin fallback)', () => {
    const r = S({
      sales_split: {
        USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
      },
      sales: [{ payment_method: 'cash', currency: 'USD', total: 9999, total_cup: 999999 }],
    });

    const hojaUsd = computeDailySummary(r, 'USD');
    expect(hojaUsd.ventasCash).toBe(7);           // split manda sobre grupos
  });
});
