/**
 * cash-report-summary.ts — FÓRMULAS ÚNICAS del Reporte de Entrega.
 *
 * AUDITORÍA 2026-10 (docs/auditoria-reporte-entrega.md): antes, el resumen
 * se calculaba en 3 sitios con resultados distintos (items-summary usaba el
 * precio unitario sin ×cantidad → «Ventas Totales = 31.200»; la vista usaba
 * cash_balance_cup que excluía el tramo efectivo de ventas mixed; el PDF
 * usaba payment-totals). Este módulo es la fuente única que consumen:
 *
 *   1. /api/cash-report (cash_balance_cup corregido + sales_split)
 *   2. CashReportView (pantalla — pestaña Resultados)
 *   3. cash-report-pdf.ts (previsualización y PDF final)
 *
 * Identidades contables (verificadas contra el modelo real):
 *
 *   ventasTotales = ventasCash + ventasTransfer + ventasZelle + ventasMixed
 *   efectivoEsperado = ventasCash + otIngresosCash + ajustesPositivos
 *                    + ingresosCaja − comisionesCash − serviciosRecibidosCash
 *                    − recibosProveedoresCash − ajustesNegativos − egresosCaja
 *                    − reembolsosCash
 *   diferenciaCuadre = efectivoContado − efectivoEsperado
 *                      (negativo ⇒ FALTANTE · positivo ⇒ SOBRANTE)
 *
 * Las comisiones pagadas por transferencia NO reducen el efectivo físico.
 * Los reembolsos de devolución SOLO reducen el efectivo cuando se pagaron EN
 * EFECTIVO (payment_transactions ref_type='devolution', direction='refund',
 * payment_method='cash' — MISIÓN DE SEGUIMIENTO 2026-10-21, regla P1):
 * transfer/zelle no tocan el cajón; el crédito de tienda no genera fila.
 * v2.23.0 (decisión del propietario 2026-10-21 «según estándar
 * internacional»): los reembolsos pagados por transferencia/zelle se
 * exponen como reembolsosVoucher (INFORMATIVO en este reporte — espejo de
 * refunds_voucher_total_cup del RPC get_cash_report; alimenta la
 * conciliación de vouchers NETOS del período). El balance de la hoja sigue
 * siendo SOLO efectivo porque documenta lo que se entrega físicamente en
 * caja; el neteo de vouchers vive en las fórmulas de arqueo
 * (close_cash_shift / get_cash_shift_expected / get_cash_flow_summary).
 */

export type Currency = 'CUP' | 'USD';

/** Split real de ventas por moneda (desde transactions.cash_amount etc.). */
export interface SalesSplitByCurrency {
  cash: number;
  transfer: number;
  zelle: number;
  /** Ventas mixed cuyo split no se desglosó (solo fallback legacy; real = 0). */
  mixedUnsplit: number;
  total: number;
}

export type SalesSplit = Partial<Record<string, SalesSplitByCurrency>>;

/** Ajuste extraordinario (payment_transactions ref_type='adjustment'). */
export interface AdjustmentRow {
  id: string;
  /** 'in' = suma al efectivo esperado · 'out' = resta. */
  direction: 'in' | 'out';
  amount: number;
  note: string;
  created_by?: string | null;
  created_at?: string;
}

/**
 * Documento Ingreso/Egreso de caja (payment_transactions ref_type='cash_flow',
 * MISIÓN 2026-10-20). Filas del LEDGER: un documento anulado aporta la fila
 * original + la fila contra (movimientos físicos reales por fecha), igual
 * criterio que el arqueo v2.21.0.
 */
export interface CashFlowRow {
  id: string;
  /** 'in' = ingreso de efectivo · 'out' = egreso. */
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  amount_cup?: number;
  note?: string | null;
  document_number?: string | null;
  created_by?: string | null;
  created_at?: string;
}

/**
 * Reembolso de devolución comercial (payment_transactions ref_type='devolution',
 * direction='refund' — MISIÓN DE SEGUIMIENTO 2026-10-21). Solo las filas con
 * payment_method='cash' reducen el efectivo esperado; el resto (transfer/zelle)
 * es informativo para el desglose del reporte.
 */
export interface RefundRow {
  id: string;
  payment_method: string;
  currency: string;
  amount: number;
  amount_cup?: number;
  /** Documento de devolución que originó el reembolso (trazabilidad). */
  devolution_id?: string | null;
  /** Venta original reembolsada (trazabilidad). */
  transaction_id?: string | null;
  note?: string | null;
  payment_date?: string;
}

export interface CashReportLike {
  sales?: Array<{ payment_method: string; currency: string; total: number }>;
  payments?: Array<{ payment_method: string; currency: string; ref_type: string; total: number }>;
  commissions?: Array<{ payment_method: string; currency: string; total: number }>;
  production?: Array<{ payment_method: string; currency: string; total: number }>;
  /** Nuevo campo expuesto por /api/cash-report (split real por moneda). */
  sales_split?: SalesSplit;
  /** Nuevo campo: ajustes extraordinarios del periodo. */
  adjustments?: AdjustmentRow[];
  /** MISIÓN INGRESOS/EGRESOS 2026-10-20: movimientos de caja documentados. */
  cash_flows?: CashFlowRow[];
  /** MISIÓN DE SEGUIMIENTO 2026-10-21: filas de reembolsos del ledger (enriquecidas por /api/cash-report — nombre distinto a los GRUPOS `refunds` del RPC, misma convención que cash_flows vs cash_flow_groups). */
  refund_rows?: RefundRow[];
}

export interface DailySummary {
  currency: Currency;
  /** Ventas cobradas en efectivo (SUM cash_amount de transactions). */
  ventasCash: number;
  /** Ventas cobradas por transferencia (SUM transfer_amount). */
  ventasTransfer: number;
  /** Ventas cobradas por Zelle (SUM zelle_amount — solo USD). */
  ventasZelle: number;
  /** Ventas mixed sin desglosar (solo fallback legacy; 0 con split real). */
  ventasMixed: number;
  /** ventasCash + ventasTransfer + ventasZelle + ventasMixed. */
  ventasTotales: number;
  /** Anticipos/pagos de OT cobrados en efectivo (ingreso). */
  otIngresosCash: number;
  /** Comisiones PAGADAS en efectivo (commission_payments status='paid'). */
  comisionesCash: number;
  /** Comisiones PAGADAS por transferencia (no tocan el efectivo físico). */
  comisionesTransfer: number;
  /** Servicios recibidos pagados en efectivo (payment_transactions ref_type='service'). */
  serviciosRecibidosCash: number;
  /** Recibos de proveedores pagados en efectivo (ref_type='receipt'). */
  recibosProveedoresCash: number;
  /** Ajustes extraordinarios que SUMAN al efectivo esperado. */
  ajustesPositivos: number;
  /** Ajustes extraordinarios que RESTAN al efectivo esperado. */
  ajustesNegativos: number;
  /** ajustesPositivos − ajustesNegativos. */
  ajustesNeto: number;
  /** Ingresos de caja documentados en la moneda (fondo de cambio y otros). */
  ingresosCaja: number;
  /** Egresos de caja documentados en la moneda (devolución del fondo y otros). */
  egresosCaja: number;
  /** Reembolsos de devoluciones pagados EN EFECTIVO en la moneda (MISIÓN DE SEGUIMIENTO 2026-10-21). */
  reembolsosCash: number;
  /** Reembolsos de devoluciones por VOUCHER (transfer/zelle) en la moneda — INFORMATIVO, base NETA v2.23.0 (decisión del propietario 2026-10-21). No afecta efectivoEsperado. */
  reembolsosVoucher: number;
  /** Efectivo que debe existir en caja al final del periodo. */
  efectivoEsperado: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Resumen diario por moneda. Fuente de datos (en orden de preferencia):
 *  1. report.sales_split[currency] (split real de transactions) — canal nuevo.
 *  2. paymentTotals.totals[currency] (misma fuente, expuesta por /payment-totals).
 *  3. Fallback legacy: grupos del RPC (cash→cash, transfer→transfer,
 *     mixed→mixed sin desglosar: entra al total, NO al efectivo esperado).
 */
export function computeDailySummary(
  report: CashReportLike | null | undefined,
  currency: Currency,
  paymentTotals?: { totals?: Record<string, Record<string, number>> } | null,
): DailySummary {
  const zero: DailySummary = {
    currency, ventasCash: 0, ventasTransfer: 0, ventasZelle: 0, ventasMixed: 0,
    ventasTotales: 0, otIngresosCash: 0, comisionesCash: 0, comisionesTransfer: 0,
    serviciosRecibidosCash: 0, recibosProveedoresCash: 0, ajustesPositivos: 0,
    ajustesNegativos: 0, ajustesNeto: 0, ingresosCaja: 0, egresosCaja: 0,
    reembolsosCash: 0, reembolsosVoucher: 0, efectivoEsperado: 0,
  };
  if (!report) return zero;

  // ── Ventas: split real con fallback ──
  let ventasCash = 0, ventasTransfer = 0, ventasZelle = 0, ventasMixed = 0;
  const split = report.sales_split?.[currency];
  const pt = paymentTotals?.totals?.[currency];
  if (split) {
    ventasCash = n(split.cash);
    ventasTransfer = n(split.transfer);
    ventasZelle = n(split.zelle);
    ventasMixed = n(split.mixedUnsplit);
  } else if (pt) {
    ventasCash = n(pt.cash);
    ventasTransfer = n(pt.transfer);
    ventasZelle = n(pt.zelle);
    // payment-totals sí desglosa mixed vía cash_amount/transfer_amount.
  } else {
    for (const s of report.sales || []) {
      if (s.currency !== currency) continue;
      const t = n(s.total);
      if (s.payment_method === 'cash') ventasCash += t;
      else if (s.payment_method === 'transfer') ventasTransfer += t;
      else if (s.payment_method === 'zelle') ventasZelle += t;
      else ventasMixed += t; // mixed sin split: al total, no al efectivo
    }
  }

  // ── Egresos/ingresos en efectivo (misma moneda) ──
  const isCash = (r: { payment_method: string }) => r.payment_method === 'cash';
  const isCur = (r: { currency: string }) => r.currency === currency;

  let comisionesCash = 0, comisionesTransfer = 0;
  for (const c of report.commissions || []) {
    if (!isCur(c)) continue;
    if (c.payment_method === 'cash') comisionesCash += n(c.total);
    else if (c.payment_method === 'transfer') comisionesTransfer += n(c.total);
  }

  let serviciosRecibidosCash = 0, recibosProveedoresCash = 0;
  for (const p of report.payments || []) {
    if (!isCur(p) || !isCash(p)) continue;
    if (p.ref_type === 'service') serviciosRecibidosCash += n(p.total);
    else if (p.ref_type === 'receipt') recibosProveedoresCash += n(p.total);
  }

  let otIngresosCash = 0;
  for (const pr of report.production || []) {
    if (!isCur(pr) || !isCash(pr)) continue;
    otIngresosCash += n(pr.total);
  }

  let ajustesPositivos = 0, ajustesNegativos = 0;
  for (const a of report.adjustments || []) {
    const amt = Math.abs(n(a.amount));
    if (a.direction === 'in') ajustesPositivos += amt;
    else ajustesNegativos += amt;
  }

  // ── Ingresos/Egresos de caja documentados (MISIÓN 2026-10-20) ──
  // Por moneda (cada hoja del reporte cuenta sus movimientos en moneda
  // nativa, igual que pagos/comisiones). Fondo de cambio incluido.
  let ingresosCaja = 0, egresosCaja = 0;
  for (const cf of report.cash_flows || []) {
    if (cf.currency !== currency) continue;
    const amt = Math.abs(n(cf.amount));
    if (cf.direction === 'in') ingresosCaja += amt;
    else egresosCaja += amt;
  }

  // ── Reembolsos de devoluciones (MISIÓN DE SEGUIMIENTO 2026-10-21, regla
  //    P1 + decisión vouchers v2.23.0 del propietario): solo el tramo cash
  //    reduce el esperado; los reembolsos por transferencia/zelle se exponen
  //    como reembolsosVoucher (INFORMATIVO — base NETA del lado vouchers,
  //    conciliación contra estado externo) pero NO tocan el efectivo físico.
  //    Por moneda, igual que cash_flows.
  let reembolsosCash = 0, reembolsosVoucher = 0;
  for (const rf of report.refund_rows || []) {
    if (rf.currency !== currency) continue;
    // Moneda nativa, misma convención que cash_flows (cada hoja cuenta sus
    // propios movimientos; amount == amount_cup en CUP).
    if (rf.payment_method === 'cash') reembolsosCash += Math.abs(n(rf.amount));
    else if (rf.payment_method === 'transfer' || rf.payment_method === 'zelle') reembolsosVoucher += Math.abs(n(rf.amount));
  }

  const ventasTotales = ventasCash + ventasTransfer + ventasZelle + ventasMixed;
  const ajustesNeto = ajustesPositivos - ajustesNegativos;
  const efectivoEsperado =
    ventasCash + otIngresosCash + ajustesPositivos + ingresosCaja
    - comisionesCash - serviciosRecibidosCash - recibosProveedoresCash - ajustesNegativos - egresosCaja
    - reembolsosCash;

  return {
    currency, ventasCash, ventasTransfer, ventasZelle, ventasMixed, ventasTotales,
    otIngresosCash, comisionesCash, comisionesTransfer, serviciosRecibidosCash,
    recibosProveedoresCash, ajustesPositivos, ajustesNegativos, ajustesNeto,
    ingresosCaja, egresosCaja, reembolsosCash, reembolsosVoucher, efectivoEsperado,
  };
}

/** Diferencia de cuadre: contado − esperado. Negativo ⇒ FALTANTE, positivo ⇒ SOBRANTE. */
export function computeCuadre(efectivoContado: number, efectivoEsperado: number): number {
  return efectivoContado - efectivoEsperado;
}

export function cuadreLabel(diferencia: number): 'cuadrado' | 'sobrante' | 'faltante' {
  if (Math.abs(diferencia) < 0.005) return 'cuadrado';
  return diferencia > 0 ? 'sobrante' : 'faltante';
}

// ── Reparto por renglón de los cobros de la venta ───────────────────────────
//
// Los ítems NO registran el medio de cobro (cash_paid/transfer_paid son NULL
// en datos legados). El split REAL vive a nivel transacción
// (transactions.cash_amount / transfer_amount / zelle_amount). Este reparto
// asigna a cada renglón su porción proporcional al valor de línea dentro de
// su transacción — exacta para ventas mono-item y proporcional en el resto.
// El total de la columna Transfer. SIEMPRE cuadra con el pool real del día.

export interface TxSplit { cash: number; transfer: number; zelle: number }

export interface ItemPaymentPortion {
  /** Porción cobrada en efectivo (columna CUP/USD de la tabla). */
  cash: number;
  /** Porción cobrada por transferencia (columna Transfer.). */
  transfer: number;
  /** Porción cobrada por Zelle (columna Zelle de la página USD). */
  zelle: number;
}

export function splitItemPortion(
  lineValue: number,
  txTotalValue: number,
  txSplit: TxSplit,
): ItemPaymentPortion {
  if (!(txTotalValue > 0)) return { cash: 0, transfer: 0, zelle: 0 };
  const ratio = Math.max(0, lineValue / txTotalValue);
  return {
    cash: txSplit.cash * ratio,
    transfer: txSplit.transfer * ratio,
    zelle: txSplit.zelle * ratio,
  };
}

/** Total de línea correcto: precio unitario CUP × cantidad (FIX D1: antes era el unitario sin multiplicar). */
export function lineTotalCup(
  priceAtSaleCup: unknown,
  priceAtSale: unknown,
  exchangeRate: unknown,
  quantity: unknown,
): number {
  const qty = n(quantity);
  const pCup = n(priceAtSaleCup);
  if (pCup > 0) return pCup * qty;
  return n(priceAtSale) * n(exchangeRate || 1) * qty;
}
