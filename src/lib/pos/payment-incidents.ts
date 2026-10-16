/**
 * MISIÓN-FLEX (2026-10-17) — Incidencias de pago del carrito POS.
 *
 * Flexibilización TEMPORAL de las validaciones de diferencias de pago:
 * faltante, sobrepago y descuadre del desglose de medios de pago ya NO
 * bloquean el flujo del cajero. En su lugar, el sistema:
 *   1. Informa claramente la diferencia (toast + badges existentes).
 *   2. Adjunta las incidencias estructuradas al payload del checkout
 *      (`payment_incidents`) para que create_sale_v2 las persista.
 *   3. Genera la nota automática de la venta y el evento de auditoría
 *      SALE_PAYMENT_INCIDENT (visible en Inicio → OPERACIÓN → Auditoría).
 *
 * REGLA INNEGOCIABLE: una venta con total negativo NUNCA se aprueba
 * (ver guards cliente en usePOSCheckout, servidor en create_sale_v2 y
 * CHECK de BD en la migración 20261017000000). Esta librería SOLO
 * flexibiliza diferencias de pago sobre un total canónico.
 *
 * Librería PURA (sin React, sin store): testeable en aislamiento.
 */

/** Tipos de incidencia de pago soportados por la flexibilización temporal. */
export type PaymentIncidentType =
  | 'insufficient_payment'       // pago insuficiente (faltante)
  | 'overpayment'                // sobrepago
  | 'mixed_breakdown_mismatch'   // descuadre del desglose efectivo/transf/Transf. Exterior
  | 'rate_difference';           // diferencia por tasa de cambio confirmada en el modal

export interface PaymentIncident {
  type: PaymentIncidentType;
  /** Índice del item del carrito cuando la incidencia es por línea. */
  item_index?: number;
  /** Nombre del producto (para lectura humana en Auditoría). */
  item_name?: string;
  /** Importe esperado en CUP (subtotal ajustado por descuento global). */
  expected_cup: number;
  /** Importe realmente recibido en CUP. */
  received_cup: number;
  /** received_cup − expected_cup (negativo = faltante). */
  difference_cup: number;
  /** Moneda de la línea cuando aplica. */
  currency?: string;
  /** Detalle libre adicional. */
  detail?: string;
}

/** Datos mínimos del item que la librería necesita (subconjunto de CartItem). */
export interface IncidentItemLike {
  product_id: string;
  product?: { name?: string } | null;
  subtotal: number;
  currency?: string | null;
  exchange_rate?: number | null;
}

/**
 * Redondeo monetario canónico — reutiliza round2 de `store/cart` (misma
 * semántica que ROUND(numeric,2) de Postgres) para NO crear una segunda
 * fórmula de cálculo (regla de la misión).
 */
import { round2 as canonicalRound2 } from '@/store/cart';
export const round2 = canonicalRound2;

export interface ComputeIncidentsInput {
  items: IncidentItemLike[];
  /** Descuento global activo ({ type, value }) o null. */
  discount: { type: 'fixed' | 'percentage'; value: number } | null;
  /** Acceso canónico al importe recibido por item en CUP (cart.getItemPaidCup). */
  getItemPaidCup: (item: IncidentItemLike) => number;
  /** Tolerancia monetaria (default 0.01, igual a las validaciones existentes). */
  tolerance?: number;
}

/**
 * Calcula las incidencias de pago del carrito actual:
 *   - Global: Σ recibido vs total esperado → insufficient_payment / overpayment.
 *   - Por línea: pago del item vs subtotal ajustado por descuento global →
 *     mixed_breakdown_mismatch (misma matemática del gate "Pago mixto descuadrado").
 *
 * Devuelve [] para una venta exacta (cero incidencias falsas).
 */
export function computePaymentIncidents(input: ComputeIncidentsInput): PaymentIncident[] {
  const { items, discount, getItemPaidCup } = input;
  const tol = input.tolerance ?? 0.01;
  const incidents: PaymentIncident[] = [];
  if (!items.length) return incidents;

  const grossSubtotal = items.reduce((acc, i) => acc + (i.subtotal || 0), 0);
  const globalDiscountAmount =
    discount && discount.value > 0
      ? discount.type === 'percentage'
        ? (grossSubtotal * discount.value) / 100
        : Math.min(discount.value, grossSubtotal)
      : 0;

  // ── Por línea: misma matemática del gate POS-3b audit P0.2 (usePOSCheckout) ──
  items.forEach((item, index) => {
    const itemWeight = grossSubtotal > 0 ? (item.subtotal || 0) / grossSubtotal : 0;
    const itemAdjustedSubtotal = Math.max(0, (item.subtotal || 0) - globalDiscountAmount * itemWeight);
    // Conversión a CUP con la tasa del item (igual que el gate anterior).
    const itemAdjustedSubtotalCup =
      itemAdjustedSubtotal * ((item.currency || 'CUP') === 'CUP' ? 1 : item.exchange_rate || 1);
    const paidCup = getItemPaidCup(item);
    const diff = round2(paidCup - itemAdjustedSubtotalCup);
    if (Math.abs(diff) > tol) {
      incidents.push({
        type: 'mixed_breakdown_mismatch',
        item_index: index,
        item_name: item.product?.name || undefined,
        expected_cup: round2(itemAdjustedSubtotalCup),
        received_cup: round2(paidCup),
        difference_cup: diff,
        currency: item.currency || 'CUP',
      });
    }
  });

  // ── Global: total esperado (CUP) vs total recibido (CUP) ──
  const expectedTotalCup = round2(items.reduce((acc, i) => {
    const itemWeight = grossSubtotal > 0 ? (i.subtotal || 0) / grossSubtotal : 0;
    const itemAdjustedSubtotal = Math.max(0, (i.subtotal || 0) - globalDiscountAmount * itemWeight);
    return acc + itemAdjustedSubtotal * ((i.currency || 'CUP') === 'CUP' ? 1 : i.exchange_rate || 1);
  }, 0));
  const receivedTotalCup = round2(items.reduce((acc, i) => acc + getItemPaidCup(i), 0));
  const globalDiff = round2(receivedTotalCup - expectedTotalCup);
  if (Math.abs(globalDiff) > tol) {
    incidents.push({
      type: globalDiff < 0 ? 'insufficient_payment' : 'overpayment',
      expected_cup: expectedTotalCup,
      received_cup: receivedTotalCup,
      difference_cup: globalDiff,
      currency: 'CUP',
    });
  }

  return incidents;
}

/** Incidencia de diferencia de tasa confirmada en el modal "Descuadre de tasa". */
export function buildRateDifferenceIncident(
  totalCup: number,
  totalPaidCup: number,
): PaymentIncident {
  const diff = round2(totalPaidCup - totalCup);
  return {
    type: 'rate_difference',
    expected_cup: round2(totalCup),
    received_cup: round2(totalPaidCup),
    difference_cup: diff,
    currency: 'CUP',
    detail: 'Diferencia aceptada por el cajero en el modal de descuadre de tasa.',
  };
}

export interface IncidentSummary {
  count: number;
  hasInsufficient: boolean;
  hasOverpayment: boolean;
  hasBreakdownMismatch: boolean;
  hasRateDifference: boolean;
  /** Diferencia global neta en CUP (received − expected) cuando existe incidencia global. */
  globalDifferenceCup: number | null;
  expectedTotalCup: number | null;
  receivedTotalCup: number | null;
}

export function summarizeIncidents(incidents: PaymentIncident[]): IncidentSummary {
  const global = incidents.find(
    i => i.type === 'insufficient_payment' || i.type === 'overpayment',
  );
  return {
    count: incidents.length,
    hasInsufficient: incidents.some(i => i.type === 'insufficient_payment'),
    hasOverpayment: incidents.some(i => i.type === 'overpayment'),
    hasBreakdownMismatch: incidents.some(i => i.type === 'mixed_breakdown_mismatch'),
    hasRateDifference: incidents.some(i => i.type === 'rate_difference'),
    globalDifferenceCup: global ? global.difference_cup : null,
    expectedTotalCup: global ? global.expected_cup : null,
    receivedTotalCup: global ? global.received_cup : null,
  };
}

function fmt(n: number): string {
  return round2(Math.abs(n)).toFixed(2);
}

/**
 * Mensaje corto para el toast del cajero (no bloqueante).
 * Ej: "Falta 20.00 CUP · desglose con diferencias (1 línea)"
 */
export function buildIncidentToastMessage(incidents: PaymentIncident[]): string | null {
  if (!incidents.length) return null;
  const s = summarizeIncidents(incidents);
  const parts: string[] = [];
  if (s.globalDifferenceCup !== null && s.globalDifferenceCup < 0) {
    parts.push(`Falta ${fmt(s.globalDifferenceCup)} CUP`);
  } else if (s.globalDifferenceCup !== null && s.globalDifferenceCup > 0) {
    parts.push(`Sobrepago ${fmt(s.globalDifferenceCup)} CUP`);
  }
  if (s.hasBreakdownMismatch) {
    const lines = incidents.filter(i => i.type === 'mixed_breakdown_mismatch').length;
    parts.push(`desglose con diferencias (${lines} ${lines === 1 ? 'línea' : 'líneas'})`);
  }
  if (s.hasRateDifference) parts.push('diferencia de tasa aceptada');
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Nota automática de la venta (texto humano, formato del ejemplo de la misión):
 *   "INCIDENCIA DE PAGO: venta registrada con pago insuficiente. Total: 94800.00 CUP.
 *    Importe recibido: 80000.00 CUP. Pendiente: 14800.00 CUP."
 * Devuelve null si no hay incidencias (venta exacta → sin nota automática).
 */
export function buildIncidenceNote(
  incidents: PaymentIncident[],
  ctx: { totalCup: number; receivedCup: number },
): string | null {
  if (!incidents.length) return null;
  const s = summarizeIncidents(incidents);
  const total = round2(ctx.totalCup);
  const received = round2(ctx.receivedCup);
  const lines: string[] = [];

  if (s.globalDifferenceCup !== null && s.globalDifferenceCup < 0) {
    lines.push(
      `INCIDENCIA DE PAGO: venta registrada con pago insuficiente. ` +
      `Total: ${total.toFixed(2)} CUP. Importe recibido: ${received.toFixed(2)} CUP. ` +
      `Pendiente: ${fmt(s.globalDifferenceCup)} CUP.`,
    );
  } else if (s.globalDifferenceCup !== null && s.globalDifferenceCup > 0) {
    lines.push(
      `INCIDENCIA DE PAGO: sobrepago detectado. Total de venta: ${total.toFixed(2)} CUP. ` +
      `Importe recibido: ${received.toFixed(2)} CUP. Diferencia: ${fmt(s.globalDifferenceCup)} CUP. ` +
      `Revisar el tratamiento del vuelto según los medios de pago utilizados.`,
    );
  } else if (s.hasBreakdownMismatch) {
    lines.push(
      `INCIDENCIA DE PAGO: descuadre en el desglose de medios de pago. ` +
      `Total de venta: ${total.toFixed(2)} CUP. Importe recibido: ${received.toFixed(2)} CUP. ` +
      `El desglose por línea se conserva documentado en la venta.`,
    );
  } else if (s.hasRateDifference) {
    lines.push(
      `INCIDENCIA DE PAGO: diferencia por tasa de cambio aceptada por el cajero. ` +
      `Total de venta: ${total.toFixed(2)} CUP. Importe recibido: ${received.toFixed(2)} CUP. ` +
      `Diferencia: ${fmt(s.globalDifferenceCup ?? 0)} CUP.`,
    );
  }

  // Detalle por línea (máx. 5 para no inflar la nota; el JSON estructurado
  // en transactions.payment_incidents conserva TODAS las incidencias).
  const perLine = incidents.filter(i => i.type === 'mixed_breakdown_mismatch' && i.item_name);
  for (const inc of perLine.slice(0, 5)) {
    const sign = inc.difference_cup < 0 ? 'faltante' : 'exceso';
    lines.push(
      `· "${inc.item_name}": esperado ${inc.expected_cup.toFixed(2)} CUP, ` +
      `recibido ${inc.received_cup.toFixed(2)} CUP (${sign} ${fmt(inc.difference_cup)} CUP).`,
    );
  }
  if (perLine.length > 5) {
    lines.push(`· (+${perLine.length - 5} líneas con diferencias — ver detalle estructurado).`);
  }

  return lines.join(' ');
}
