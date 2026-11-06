/**
 * sale-classification.ts — Clasificación de la MODALIDAD monetaria y VÍA de
 * pago de una venta, para los Filtros Avanzados del tab Productos del
 * Historial de Ventas (misión 2026-11-06).
 *
 * Regla de oro: MISMA semántica que /api/sales/summary (fuente autoritativa):
 *   · payment_transactions (amount, currency, payment_method) cuando existen
 *     — refleja la distribución REAL del pago (pagos combinados incluidos);
 *   · fallback legacy (ventas históricas sin payment_transactions):
 *     cash_amount/transfer_amount en CUP y zelle_amount en USD.
 *
 * Modalidad monetaria (exclusiva por venta):
 *   'cup'   → todo el dinero entró en CUP.
 *   'usd'   → todo el dinero entró en USD.
 *   'mixta' → combinación real CUP + USD en la misma venta.
 *   'other' → sin componentes reconocibles (p. ej. venta de total 0) — no
 *             pertenece a ninguna de las tres; los filtros la excluyen salvo
 *             que no se seleccione ninguna modalidad.
 *
 * Vía de pago (ortogonal a la modalidad):
 *   isTransfer → la venta tiene algún pago por transferencia/zelle (vía
 *                bancaria), sea en CUP o en USD.
 */

export type SaleModality = 'cup' | 'usd' | 'mixta' | 'other';

/** Pago individual de la venta (fila de payment_transactions). */
export interface SalePaymentComponent {
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
}

/** Campos de la venta necesarios para clasificar (columnas de transactions). */
export interface SalePaymentInfo {
  payment_method?: string | null;
  cash_amount?: number | null;
  transfer_amount?: number | null;
  zelle_amount?: number | null;
  sale_currency?: string | null;
  payment_transactions?: SalePaymentComponent[] | null;
}

export interface SaleClassification {
  modality: SaleModality;
  isTransfer: boolean;
}

const TRANSFER_METHODS = new Set(['transfer', 'zelle']);

/** Umbral de redondeo monetario (centavos). */
const EPS = 0.005;

/**
 * Clasifica una venta según su distribución real de pagos.
 * Espejo exacto de la lógica de /api/sales/summary (no recalcula documentos).
 */
export function classifySale(info: SalePaymentInfo | null | undefined): SaleClassification {
  if (!info) return { modality: 'other', isTransfer: false };

  const payments = info.payment_transactions ?? [];

  if (payments.length > 0) {
    // Fuente autoritativa: distribución real del pago.
    let hasCup = false;
    let hasUsd = false;
    let isTransfer = false;
    for (const p of payments) {
      const amt = Number(p.amount ?? 0);
      if (amt > EPS && p.currency === 'USD') hasUsd = true;
      if (amt > EPS && p.currency === 'CUP') hasCup = true;
      if (TRANSFER_METHODS.has(String(p.payment_method ?? '').toLowerCase())) isTransfer = true;
    }
    return { modality: classifyFromFlags(hasCup, hasUsd), isTransfer };
  }

  // Fallback legacy: ventas históricas sin payment_transactions
  // (misma convención que /api/sales/summary: cash/transfer en CUP,
  //  zelle en USD).
  const cash = Number(info.cash_amount ?? 0);
  const transfer = Number(info.transfer_amount ?? 0);
  const zelle = Number(info.zelle_amount ?? 0);
  const hasCup = cash > EPS || transfer > EPS;
  const hasUsd = zelle > EPS;
  const isTransfer = transfer > EPS || zelle > EPS;
  return { modality: classifyFromFlags(hasCup, hasUsd), isTransfer };
}

function classifyFromFlags(hasCup: boolean, hasUsd: boolean): SaleModality {
  if (hasCup && hasUsd) return 'mixta';
  if (hasUsd) return 'usd';
  if (hasCup) return 'cup';
  return 'other';
}

/**
 * Predicado de los Filtros Avanzados de modalidad/vía:
 *   · modalidades seleccionadas (multi-selección): la venta debe estar EN el
 *     conjunto — sin selección pasa todo;
 *   · transferOnly (AND): la venta debe tener al menos un pago por
 *     transferencia/zelle.
 */
export function saleMatchesModalityFilter(
  info: SalePaymentInfo | null | undefined,
  modalities: ReadonlyArray<Exclude<SaleModality, 'other'>>,
  transferOnly: boolean,
): boolean {
  const { modality, isTransfer } = classifySale(info);
  if (modalities.length > 0 && !modalities.includes(modality as Exclude<SaleModality, 'other'>)) return false;
  if (transferOnly && !isTransfer) return false;
  return true;
}
