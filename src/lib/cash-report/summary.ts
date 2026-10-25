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
 *   efectivoEsperado = saldoInicial + cobrosBilletes + otIngresosCash
 *                    + ajustesPositivos + ingresosCaja
 *                    − comisionesCash − serviciosRecibidosCash
 *                    − recibosProveedoresCash − ajustesNegativos − egresosCaja
 *                    − reembolsosCash
 *   diferenciaCuadre = efectivoContado − efectivoEsperado
 *                      (negativo ⇒ FALTANTE · positivo ⇒ SOBRANTE)
 *
 * MISIÓN CORRECTIVA (2026-10-25) — SALDO INICIAL Y CONCILIACIÓN DEL EFECTIVO:
 *   El esperado es un SALDO DE CIERRE físico por moneda (hoja CUP = billetes
 *   CUP; hoja USD = billetes USD), no un total de movimientos del período:
 *
 *   1. SALDO INICIAL: llega desde /api/cash-report como `opening_balance`
 *      (neto ACUMULADO del libro autoritativo get_cash_currency_summary con
 *      ventana [origen, inicio del período) — reutilizado, jamás recalculado
 *   aquí; jamás el saldo ACTUAL de la caja). Período histórico ⇒ saldo
 *   inmediatamente anterior, verificable contra el libro.
 *   2. COBROS EN BILLETES: para ventas con liquidación explícita (columnas
 *   cash_received_cup/usd − change_given_cup/usd) el esperado usa el NETO DE
 *   BILLETES de la venta (p. ej. cobro de 10 USD con 2.400 CUP de vuelto ⇒
 *   USD +10, CUP −2.400) — exactamente la regla del ledger/libro. Para ventas
 *   legadas (sin liquidación) coincide con el split por moneda de cobro.
 *   `liquidacionBilletes` = cobrosBilletes − ventasCash expone la diferencia
 *   (el vuelto cruzado) como partida visible y auditables.
 *   3. EQUIVALENCIA CANÓNICA (contrato #1479 intacto): la equivalencia CUP de
 *   cobros en efectivo en OTRA moneda sigue siendo una línea PROPIA de
 *   consolidación contable — jamás una segunda venta — pero YA NO alimenta el
 *   esperado de la hoja CUP: esos billetes viven físicamente en la hoja USD
 *   (contarlos en ambas rompería la conciliación con el libro físico y el
 *   enlace cierre‑de‑un‑período = apertura‑del‑siguiente).
 *   4. ENLACE DE PERÍODOS: esperado = saldo inicial + términos del período ⇒
 *   el cierre de un período es la apertura del siguiente (regla del ledger).
 *   5. La SELECCIÓN de ventas (#1480) ajusta SOLO el componente de cobros
 *   (ventasCash y cobrosBilletes del conjunto seleccionado); el saldo inicial
 *   y los movimientos de caja no cambian.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MISIÓN DEFINITIVA (2026-10-24) — CONTRATO ÚNICO DE CLASIFICACIÓN MONETARIA
 * (fuente de verdad compartida con collection-currency.ts — §5 del brief):
 *
 *   1. INGRESO POR VENTAS: cada hoja (CUP/USD) cuenta SOLO los cobros cuya
 *      MONEDA REAL DE COBRO es la de la hoja (fuente: sales_split de
 *      collection-currency.ts — ledger autoritativo v2.25.0 o reconstrucción
 *      heurística histórica). UNA venta se contabiliza UNA vez, en la hoja
 *      de la moneda cobrada. La moneda ORIGINAL de la venta (p. ej. ítems
 *      USD) NO crea una segunda fila: lo que clasifica es el COBRO real.
 *   2. EQUIVALENCIA CONTABLE: el canónico CUP de los cobros recibidos en
 *      OTRA moneda (p. ej. 7 USD × 800 = 5.600) NO es una segunda venta NI
 *      entra en ventasCash/ventasTransfer/ventasZelle/ventasMixed. Se expone
 *      SEPARADO como equivCashOtraMoneda (efectivo) y equivVouchersOtraMoneda
 *      (transfer/zelle, informativo) — SOLO en la hoja CUP (hoja canónica del
 *      modelo v2.24: «el canónico CUP es el equivalente contable, con tasa
 *      trazable»). equivCashOtraMoneda alimenta el EFECTIVO ESPERADO a
 *      entregar (consolidación contable — misión 23/10: el día con cobros
 *      solo-USD no pierde su valor del comprobante de entrega);
 *      equivVouchersOtraMoneda es puramente informativo (el voucher no es
 *      efectivo físico).
 *   3. VENTA MIXTA: los componentes se muestran en la moneda efectiva de
 *      cada uno (buckets por moneda del ledger/reconstrucción); la CANTIDAD
 *      física va a la moneda predominante (regla §2 de collection-currency).
 *      Jamás se suma el importe completo en ambas hojas.
 *   4. MEDIO DE PAGO ≠ MONEDA: el método (cash/transfer/zelle) no cambia la
 *      moneda del ingreso; la moneda la fija el componente cobrado.
 *   5. ANULADAS/REVERTIDAS: las ventas voided/reversed no llegan aquí (la
 *      API filtra status='completed' / RPC excluye 'voided'); las filas de
 *      caja (cash_flows/refunds) usan el ledger con original+contra.
 *   6. UNA SOLA FUENTE: pantalla, PDF, Excel y cash_balance_cup consumen
 *      ESTA MISMA función — sin algoritmos paralelos de clasificación.
 * ══════════════════════════════════════════════════════════════════════════
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
  /** MISIÓN MULTIMONEDA (2026-10-23): los grupos reconstruidos por /api/cash-report
   * (incidente 2026-10-16, collection-currency) traen total_cup (equivalencia
   * canónica del grupo) y transaction_count — opcionales en el fallback legacy. */
  sales?: Array<{ payment_method: string; currency: string; total: number; total_cup?: number; transaction_count?: number }>;
  payments?: Array<{ payment_method: string; currency: string; ref_type: string; total: number; total_cup?: number }>;
  commissions?: Array<{ payment_method: string; currency: string; total: number; total_cup?: number }>;
  production?: Array<{ payment_method: string; currency: string; total: number; total_cup?: number }>;
  /** Nuevo campo expuesto por /api/cash-report (split real por moneda). */
  sales_split?: SalesSplit;
  /** Nuevo campo: ajustes extraordinarios del periodo. */
  adjustments?: AdjustmentRow[];
  /** MISIÓN INGRESOS/EGRESOS 2026-10-20: movimientos de caja documentados. */
  cash_flows?: CashFlowRow[];
  /** MISIÓN DE SEGUIMIENTO 2026-10-21: filas de reembolsos del ledger (enriquecidas por /api/cash-report — nombre distinto a los GRUPOS `refunds` del RPC, misma convención que cash_flows vs cash_flow_groups). */
  refund_rows?: RefundRow[];
  /** MISIÓN DEFINITIVA 2026-10-24: equivalencia canónica CUP de los cobros EN
   *  EFECTIVO recibidos en OTRA moneda (Σ amountCup de buckets no-CUP). La
   *  calcula /api/cash-report y /api/cash-report/payment-totals con la MISMA
   *  reconstrucción de sales_split — nunca un algoritmo paralelo. */
  sales_equiv_cash_other_cup?: number;
  /** Ídem para vouchers (transfer/zelle) en otra moneda — informativo. */
  sales_equiv_voucher_other_cup?: number;
  /** MISIÓN CORRECTIVA 2026-10-25: saldo inicial por moneda — neto ACUMULADO
   *  del libro autoritativo (get_cash_currency_summary) con ventana
   *  [origen, inicio del período). Lo calcula /api/cash-report (una sola
   *  fuente); aquí solo se CONSUME. Clave: moneda ('CUP'/'USD'). */
  opening_balance?: Record<string, number>;
  /** MISIÓN CORRECTIVA 2026-10-25: cobros en BILLETES por moneda (vista
   *  física del ledger): ventas con liquidación explícita aportan
   *  (cash_received − change_given) de SU moneda; ventas legadas aportan su
   *  bucket cash de la moneda. Mismo productor que sales_split (la ruta),
   *  recomputado por selección en report-selection.ts. */
  sales_bills_split?: Partial<Record<string, number>>;
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
  /** MISIÓN DEFINITIVA 2026-10-24: equivalencia canónica CUP de los cobros EN
   *  EFECTIVO recibidos en OTRA moneda — consolidación contable de la hoja CUP
   *  (hoja canónica v2.24). NO es un ingreso de ventas de esta hoja (no entra
   *  en ventasCash/ventasTotales — jamás aparece como «segunda venta»);
   *  SÍ alimenta el efectivo esperado a entregar. En la hoja USD vale 0. */
  equivCashOtraMoneda: number;
  /** Ídem para vouchers (transfer/zelle) en otra moneda — puramente
   *  informativo, NO toca el efectivo esperado. En la hoja USD vale 0. */
  equivVouchersOtraMoneda: number;
  /** Efectivo que debe existir en caja al final del periodo.
   *  MISIÓN CORRECTIVA 2026-10-25: SALDO DE CIERRE por moneda =
   *  saldoInicial + cobrosBilletes + ingresos − egresos (regla del ledger:
   *  cierre del período = apertura del siguiente). La equivalencia canónica
   *  de cobros en otra moneda NO entra aquí (esos billetes viven en su hoja). */
  efectivoEsperado: number;
  /** MISIÓN CONCILIACIÓN (2026-10-26): neto de BILLETES de los cobros del
   *  período (= ventasCash + liquidacionBilletes; vista física del ledger).
   *  Término del esperado gobernable por el concepto «ventasEfectivo» en el
   *  cálculo personalizado (custom-result.ts). */
  cobrosBilletes: number;
  /** MISIÓN CORRECTIVA 2026-10-25: saldo del libro de caja inmediatamente
   *  ANTERIOR al período consultado (por moneda; 0 si la fuente no lo trae). */
  saldoInicial: number;
  /** MISIÓN CORRECTIVA 2026-10-25: neto de BILLETES de los cobros del
   *  período MENOS el importe de las ventas en efectivo (vista de valor) de
   *  la hoja. ≠ 0 solo con liquidación explícita cruzada (vuelto dado en la
   *  otra moneda): p. ej. cobro 10 USD con 2.400 CUP de vuelto ⇒ hoja CUP
   *  −2.400, hoja USD +3. Partida VISIBLE y auditable; no gobernable por
   *  checkbox (es contable, no presentación). */
  liquidacionBilletes: number;
  /** MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): valor canónico CUP NETO de los
   *  flujos de EFECTIVO en OTRA moneda del período — cobros (equivCash) +
   *  documentos de caja + reembolsos + pagos a proveedores/servicios +
   *  anticipos de producción + comisiones, cada uno a SU tasa histórica.
   *  Es la parte del esperado canónico del arqueo que NO corresponde a
   *  billetes CUP: cuando los billetes de otra moneda entraron y salieron
   *  completos, este neto es la DIFERENCIA DE VALORACIÓN sin respaldo físico
   *  (p. ej. ENERVIDA: 296.420 − 293.600 = 2.820). Solo hoja CUP; 0 en USD. */
  flujosOtraMonedaValorCup: number;
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
  paymentTotals?: { totals?: Record<string, Record<string, number>>; equiv_cash_other_cup?: number; equiv_voucher_other_cup?: number } | null,
): DailySummary {
  const zero: DailySummary = {
    currency, ventasCash: 0, ventasTransfer: 0, ventasZelle: 0, ventasMixed: 0,
    ventasTotales: 0, otIngresosCash: 0, comisionesCash: 0, comisionesTransfer: 0,
    serviciosRecibidosCash: 0, recibosProveedoresCash: 0, ajustesPositivos: 0,
    ajustesNegativos: 0, ajustesNeto: 0, ingresosCaja: 0, egresosCaja: 0,
    reembolsosCash: 0, reembolsosVoucher: 0, equivCashOtraMoneda: 0,
    equivVouchersOtraMoneda: 0, efectivoEsperado: 0, saldoInicial: 0,
    liquidacionBilletes: 0, cobrosBilletes: 0, flujosOtraMonedaValorCup: 0,
  };
  if (!report) return zero;

  // ── Ventas: split real con fallback ──
  // MISIÓN DEFINITIVA (2026-10-24): el INGRESO por ventas es SIEMPRE nativo
  // de la hoja — el fallback ya NO añade la equivalencia total_cup de cobros
  // en otra moneda a las filas de venta (eso presentaba la MISMA venta como
  // una segunda venta en la hoja CUP: «hoja CUP +5.600, hoja USD +7»). La
  // equivalencia se calcula aparte y alimenta SOLO la consolidación contable
  // (efectivo esperado de la hoja canónica CUP) con su propia línea.
  // MISIÓN CORRECTIVA (2026-10-25): la presencia de `sales_split` (objeto
  // con ALGUNA moneda) activa la vía del split — una moneda SIN clave
  // significa CERO cobros en esa hoja (día solo-USD ⇒ hoja CUP sin clave),
  // no «sin datos» que obligue al fallback de grupos. La ruta y la selección
  // (#1480) garantizan la misma reconstrucción detrás de ambas vías.
  let ventasCash = 0, ventasTransfer = 0, ventasZelle = 0, ventasMixed = 0;
  let equivCash = 0, equivVouchers = 0;
  const hasSplit = !!report.sales_split && Object.keys(report.sales_split).length > 0;
  const split = hasSplit
    ? (report.sales_split![currency] ?? { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 })
    : undefined;
  const pt = paymentTotals?.totals?.[currency];
  if (split) {
    ventasCash = n(split.cash);
    ventasTransfer = n(split.transfer);
    ventasZelle = n(split.zelle);
    ventasMixed = n(split.mixedUnsplit);
    // Equivalencia de la MISMA reconstrucción que produjo el split (la ruta
    // la expone; 0 por omisión en fixtures antiguos — nunca inventada aquí).
    equivCash = n(report.sales_equiv_cash_other_cup);
    equivVouchers = n(report.sales_equiv_voucher_other_cup);
  } else if (pt) {
    ventasCash = n(pt.cash);
    ventasTransfer = n(pt.transfer);
    ventasZelle = n(pt.zelle);
    // payment-totals sí desglosa mixed vía cash_amount/transfer_amount.
    equivCash = n(paymentTotals?.equiv_cash_other_cup);
    equivVouchers = n(paymentTotals?.equiv_voucher_other_cup);
  } else {
    // Fallback: grupos `sales` (por MONEDA DE COBRO desde el incidente
    // 2026-10-16). Cada hoja cuenta SOLO sus cobros NATIVOS — sin conversión
    // automática a ingreso de otra hoja (contrato único, regla 1).
    for (const s of report.sales || []) {
      const t = n(s.total);
      if (s.payment_method === 'cash') {
        if (s.currency === currency) ventasCash += t;
      } else if (s.currency === currency) {
        if (s.payment_method === 'transfer') ventasTransfer += t;
        else if (s.payment_method === 'zelle') ventasZelle += t;
        else ventasMixed += t; // mixed sin split: al total, no al efectivo
      }
    }
    // Equivalencia canónica (regla 2): canónico total_cup de los cobros de
    // OTRA moneda — efectivo a la consolidación del esperado, vouchers solo
    // informativos. Nunca a las filas de ingreso de la hoja.
    for (const s of report.sales || []) {
      if (s.currency === currency) continue;
      const canon = n(s.total_cup ?? s.total);
      if (s.payment_method === 'cash') equivCash += canon;
      else equivVouchers += canon;
    }
  }
  // La hoja canónica de equivalencias es CUP (regla 2): la hoja USD no
  // consolida equivalencias de cobros CUP (el CUP nativo ya es canónico).
  if (currency !== 'CUP') {
    equivCash = 0;
    equivVouchers = 0;
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

  // ── MISIÓN CORRECTIVA 2026-10-25: saldo inicial + cobros en billetes ──
  // El saldo inicial viene del libro autoritativo vía /api/cash-report
  // (opening_balance por moneda). Los cobros en BILLETES (vista física del
  // ledger) llegan como sales_bills_split; cuando la fuente no los trae
  // (fixtures legados, payment-totals antiguo) degradan a ventasCash — la
  // vista de valor coincide con la de billetes salvo liquidación cruzada.
  const saldoInicial = n(report.opening_balance?.[currency]);
  const cobrosBilletes = report.sales_bills_split && report.sales_bills_split[currency] !== undefined
    ? n(report.sales_bills_split[currency])
    : ventasCash;
  const liquidacionBilletes = cobrosBilletes - ventasCash;

  // MISIÓN CORRECTIVA: esperado = SALDO DE CIERRE por moneda. La
  // equivalencia canónica de cobros en otra moneda NO entra (línea de
  // consolidación de la hoja CUP — esos billetes viven en la hoja USD);
  // el vuelto cruzado entra vía cobrosBilletes (= ventasCash + liquidación).
  const efectivoEsperado =
    saldoInicial + cobrosBilletes + otIngresosCash + ajustesPositivos + ingresosCaja
    - comisionesCash - serviciosRecibidosCash - recibosProveedoresCash - ajustesNegativos - egresosCaja
    - reembolsosCash;

  // ── MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): valor canónico CUP NETO de los
  //    flujos de efectivo en OTRA moneda del período (solo hoja CUP). Es la
  //    DIFERENCIA DE VALORACIÓN del arqueo canónico frente al libro de
  //    billetes: cobros a la tasa histórica de SU operación, entregas/egresos
  //    a la del documento. Con billetes netos de otra moneda = 0, este neto
  //    queda SIN respaldo físico — se conserva trazable, jamás como efectivo
  //    disponible. (payment_transactions: receipt|service = salida;
  //    production_order|work = entrada; cash_flow y devolution usan SU
  //    direction; la fuente de cobros es equivCash — misma reconstrucción.)
  let flujosOtraMonedaValorCup = 0;
  if (currency === 'CUP') {
    flujosOtraMonedaValorCup += equivCash;
    for (const cf of report.cash_flows || []) {
      if (cf.currency === 'CUP') continue;
      flujosOtraMonedaValorCup += (cf.direction === 'in' ? 1 : -1) * n(cf.amount_cup);
    }
    for (const rf of report.refund_rows || []) {
      if (rf.currency === 'CUP' || rf.payment_method !== 'cash') continue;
      flujosOtraMonedaValorCup -= n(rf.amount_cup);
    }
    for (const p of report.payments || []) {
      if (p.currency === 'CUP' || p.payment_method !== 'cash') continue;
      flujosOtraMonedaValorCup -= n(p.total_cup ?? p.total); // receipt|service: salida física
    }
    for (const pr of report.production || []) {
      if (pr.currency === 'CUP' || pr.payment_method !== 'cash') continue;
      flujosOtraMonedaValorCup += n(pr.total_cup ?? pr.total); // anticipo: entrada física
    }
    for (const c of report.commissions || []) {
      if (c.currency === 'CUP' || c.payment_method !== 'cash') continue;
      flujosOtraMonedaValorCup -= n(c.total_cup ?? c.total); // comisión pagada: salida física
    }
  }

  return {
    currency, ventasCash, ventasTransfer, ventasZelle, ventasMixed, ventasTotales,
    otIngresosCash, comisionesCash, comisionesTransfer, serviciosRecibidosCash,
    recibosProveedoresCash, ajustesPositivos, ajustesNegativos, ajustesNeto,
    ingresosCaja, egresosCaja, reembolsosCash, reembolsosVoucher,
    equivCashOtraMoneda: equivCash, equivVouchersOtraMoneda: equivVouchers,
    efectivoEsperado, saldoInicial, liquidacionBilletes, cobrosBilletes,
    flujosOtraMonedaValorCup,
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
