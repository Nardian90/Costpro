/**
 * v2.18.0 — Lógica de arqueo de caja (espejo EXACTO del RPC close_cash_shift
 * v2.18.0 y get_cash_shift_expected).
 *
 * Fórmula (misma convención server-side y client-side):
 *   Efectivo esperado = Fondo inicial
 *                     + Ventas en efectivo (incluye parte cash de ventas mixtas)
 *                     + Anticipos de producción/trabajo en efectivo
 *                     − Pagos a proveedores en efectivo (recepciones + servicios)
 *                     − Comisiones pagadas en efectivo
 *   Total esperado    = Efectivo esperado + Transferencias + Zelle
 *   Diferencia        = (Efectivo contado + Vouchers contados) − Total esperado
 *
 * NO son efectivo: transferencias, zelle, pagos pendientes, cuentas por pagar
 * no ejecutadas, ni cobros de ventas (ref_type='sale' — ya contados como
 * ventas). Ver migración 20261010000002_v2_18_0_servicios_actor_y_caja.sql.
 */

export interface CashShiftBreakdown {
  opening_balance: number;
  /** Ventas totales del turno (todas las formas de pago) */
  total_sales: number;
  /** Ventas cobradas en efectivo (parte cash de mixtas incluida) */
  cash_sales: number;
  /** Egresos de efectivo: pagos a proveedores cash (receipt/service) */
  cash_outflows: number;
  /** Ingresos de efectivo: anticipos de producción/trabajo cash */
  cash_production: number;
  /** Comisiones pagadas en efectivo */
  cash_commissions: number;
  /** Ventas por transferencia */
  transfer_sales: number;
  /** Ventas por zelle */
  zelle_sales: number;
}

export interface ArqueoResult {
  /** Efectivo esperado en caja (fondo + entradas − salidas de efectivo) */
  expected_cash: number;
  /** Vouchers esperados (transferencias + zelle del sistema) */
  expected_vouchers: number;
  /** Total esperado (efectivo + vouchers) */
  expected_total: number;
  /** Diferencia de efectivo = contado − esperado (negativo = faltante) */
  cash_diff: number;
  /** Diferencia de vouchers = contados − esperados */
  voucher_diff: number;
  /** Diferencia total del arqueo */
  difference: number;
}

/** Redondeo monetario a 2 decimales (evita artefactos de float) */
const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Calcula el arqueo a partir del desglose del sistema y lo contado.
 * @param breakdown desglose de movimientos del turno (RPC get_cash_shift_expected)
 * @param countedCash efectivo físicamente contado
 * @param countedVouchers transferencias/zelle contadas
 */
export function computeArqueo(
  breakdown: CashShiftBreakdown,
  countedCash: number,
  countedVouchers: number,
): ArqueoResult {
  const b = {
    opening_balance: Number(breakdown?.opening_balance) || 0,
    total_sales: Number(breakdown?.total_sales) || 0,
    cash_sales: Number(breakdown?.cash_sales) || 0,
    cash_outflows: Number(breakdown?.cash_outflows) || 0,
    cash_production: Number(breakdown?.cash_production) || 0,
    cash_commissions: Number(breakdown?.cash_commissions) || 0,
    transfer_sales: Number(breakdown?.transfer_sales) || 0,
    zelle_sales: Number(breakdown?.zelle_sales) || 0,
  };

  const expected_cash = r2(
    b.opening_balance + b.cash_sales + b.cash_production - b.cash_outflows - b.cash_commissions,
  );
  const expected_vouchers = r2(b.transfer_sales + b.zelle_sales);
  const expected_total = r2(expected_cash + expected_vouchers);

  const cash_diff = r2((Number(countedCash) || 0) - expected_cash);
  const voucher_diff = r2((Number(countedVouchers) || 0) - expected_vouchers);
  const difference = r2(cash_diff + voucher_diff);

  return { expected_cash, expected_vouchers, expected_total, cash_diff, voucher_diff, difference };
}
