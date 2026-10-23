/**
 * MISIÓN CAJA v2.24.0 (D6) — Liquidación del cobro: vuelto multimoneda.
 *
 * El vuelto queda registrado UNA vez, ENLAZADO a la venta (columnas
 * cash_received_cup/usd, change_given_cup/usd, change_currency de
 * `transactions`) — sin fila de caja aparte, sin doble contabilización.
 *
 * Identidad canónica que el RPC create_sale_v2 v2.24.0 valida (±0.01):
 *   (recibido_cup − vuelto_cup) + (recibido_usd − vuelto_usd) × tasa = cash_amount
 *
 * Reglas de la misión (§8):
 *   · El vuelto PUEDE darse en una moneda distinta a la recibida (p.ej.
 *     cliente entrega 60.000 CUP y recibe el vuelto en USD) — la restricción
 *     real es canónica: recibido − vuelto (a tasa servidor) = efectivo de la
 *     venta. El libro por moneda refleja el efecto físico de cada cajón.
 *   · La tasa del vuelto la fija el SERVIDOR (jerarquía tienda → BCC →
 *     elToque, fail-closed): el cliente propone con la tasa hidratada del POS
 *     y el servidor revalida con la suya (sin tasas ocultas ni inventadas).
 *   · El vuelto no puede exceder el cambio debido (ERROR del cliente, no
 *     incidencia silenciosa).
 */

import type { PaymentRow } from '@/store/cart';

export type ChangeCurrency = 'CUP' | 'USD';

/** Monedas nativas del cajón admitidas por la liquidación del cobro. */
export type SettlementCurrency = PaymentRow['currency'];

export interface CashSettlementInput {
  /** Efectivo que el cliente ENTREGA, por moneda nativa del cajón. */
  receivedByCurrency: Partial<Record<SettlementCurrency, number>>;
  /** Componente de EFECTIVO de la venta en CUP canónico (cash_amount). */
  cashAmountCup: number;
  /** Tasa USD→CUP vigente del POS (hidratada de store_exchange_rates). */
  usdRate: number;
  /** Moneda en la que se entrega el vuelto. */
  changeCurrency: ChangeCurrency;
  /**
   * Importe del vuelto EN LA MONEDA del vuelto. Si no viene, se calcula como
   * el cambio debido convertido (sugerencia del sistema, editable en UI).
   */
  changeAmountNative?: number;
}

export interface CashSettlement {
  cash_received_cup: number | null;
  cash_received_usd: number | null;
  change_given_cup: number | null;
  change_given_usd: number | null;
  change_currency: ChangeCurrency | null;
}

export type SettlementError =
  | 'ERR_NO_CASH'
  | 'ERR_RECEIVED_NEGATIVE'
  | 'ERR_UNDERPAID'
  | 'ERR_CHANGE_EXCEEDS_DUE'
  | 'ERR_CHANGE_NEGATIVE'
  | 'ERR_RATE_INVALID';

/** Redondeo monetario a 2 decimales (mismos umbrales del RPC: ±0.01). */
const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.005;

/** Cambio debido en CUP canónico = recibido − efectivo de la venta. */
export function computeChangeDueCup(
  receivedByCurrency: Partial<Record<SettlementCurrency, number>>,
  cashAmountCup: number,
  usdRate: number,
): number {
  const cup = Number(receivedByCurrency?.CUP) || 0;
  const usd = Number(receivedByCurrency?.USD) || 0;
  if (usd > 0 && (!(usdRate > 0) || usdRate === 1)) return Number.NaN; // tasa inválida
  return r2(cup + (usd > 0 ? usd * usdRate : 0) - cashAmountCup);
}

/**
 * Construye la liquidación del cobro para el payload de create_sale_v2.
 * Devuelve { settlement: null } cuando NO hay liquidación que registrar
 * (venta exacta sin dato de recibido) — el flujo legacy queda intacto.
 */
export function buildCashSettlement(input: CashSettlementInput): {
  settlement: CashSettlement | null;
  changeDueCup: number;
  error?: SettlementError;
} {
  const {
    receivedByCurrency,
    cashAmountCup,
    usdRate,
    changeCurrency,
    changeAmountNative,
  } = input;

  const receivedCup = Number(receivedByCurrency?.CUP) || 0;
  const receivedUsd = Number(receivedByCurrency?.USD) || 0;
  const totalReceived = r2(receivedCup + (receivedUsd > 0 ? receivedUsd * usdRate : 0));

  // Sin componente de efectivo o sin datos de recibido → sin liquidación.
  if (cashAmountCup <= 0 && totalReceived <= 0) {
    return { settlement: null, changeDueCup: 0 };
  }

  if (receivedCup < 0 || receivedUsd < 0) {
    return { settlement: null, changeDueCup: 0, error: 'ERR_RECEIVED_NEGATIVE' };
  }
  if (receivedUsd > 0 && (!(usdRate > 1))) {
    return { settlement: null, changeDueCup: 0, error: 'ERR_RATE_INVALID' };
  }

  // Sin importe recibido registrado no hay qué liquidar (venta exacta legacy):
  // el faltante lo documenta el flujo MISIÓN-FLEX de incidencias, no este módulo.
  if (totalReceived <= 0) {
    return { settlement: null, changeDueCup: 0 };
  }

  const changeDueCup = r2(totalReceived - cashAmountCup);

  // Pago insuficiente: no hay vuelto; el flujo MISIÓN-FLEX de incidencias es
  // el que documenta el faltante (la liquidación no aplica).
  if (changeDueCup < -0.01) {
    return { settlement: null, changeDueCup, error: 'ERR_UNDERPAID' };
  }

  // Venta exacta (o el cajero no registró importe recibido) → sin liquidación.
  if (totalReceived <= 0 || (changeDueCup <= EPS && receivedUsd <= 0 && receivedCup <= 0)) {
    return { settlement: null, changeDueCup: Math.max(0, changeDueCup) };
  }

  let changeGivenCup = 0;
  let changeGivenUsd = 0;

  if (changeCurrency === 'USD') {
    if (!(usdRate > 1)) {
      return { settlement: null, changeDueCup, error: 'ERR_RATE_INVALID' };
    }
    const dueNative = r2(changeDueCup / usdRate);
    const native = changeAmountNative != null ? r2(changeAmountNative) : dueNative;
    if (native < 0) {
      return { settlement: null, changeDueCup, error: 'ERR_CHANGE_NEGATIVE' };
    }
    // El vuelto no puede exceder el cambio debido (a la tasa aplicada).
    if (r2(native * usdRate) > changeDueCup + EPS) {
      return { settlement: null, changeDueCup, error: 'ERR_CHANGE_EXCEEDS_DUE' };
    }
    changeGivenUsd = native;
  } else {
    const native = changeAmountNative != null ? r2(changeAmountNative) : changeDueCup;
    if (native < 0) {
      return { settlement: null, changeDueCup, error: 'ERR_CHANGE_NEGATIVE' };
    }
    if (native > changeDueCup + EPS) {
      return { settlement: null, changeDueCup, error: 'ERR_CHANGE_EXCEEDS_DUE' };
    }
    changeGivenCup = native;
  }

  // La liquidación SOLO se registra cuando hay algo que documentar: recibido
  // explícito o vuelto entregado. (Recibido 0 y vuelto 0 = venta exacta legacy.)
  if (receivedCup <= 0 && receivedUsd <= 0 && changeGivenCup <= 0 && changeGivenUsd <= 0) {
    return { settlement: null, changeDueCup: Math.max(0, changeDueCup) };
  }

  return {
    settlement: {
      cash_received_cup: receivedCup > 0 ? r2(receivedCup) : null,
      cash_received_usd: receivedUsd > 0 ? r2(receivedUsd) : null,
      change_given_cup: changeGivenCup > 0 ? r2(changeGivenCup) : null,
      change_given_usd: changeGivenUsd > 0 ? r2(changeGivenUsd) : null,
      change_currency: changeGivenCup > 0 ? 'CUP' : changeGivenUsd > 0 ? 'USD' : null,
    },
    changeDueCup: Math.max(0, changeDueCup),
  };
}

/** Etiqueta humana de los errores de liquidación (misma voz de la casa). */
export function settlementErrorMessage(error: SettlementError): string {
  switch (error) {
    case 'ERR_NO_CASH':
      return 'La venta no tiene componente en efectivo.';
    case 'ERR_RECEIVED_NEGATIVE':
      return 'El efectivo recibido no puede ser negativo.';
    case 'ERR_UNDERPAID':
      return 'El efectivo recibido no cubre el total de la venta — registra el faltante como incidencia (MISIÓN-FLEX).';
    case 'ERR_CHANGE_EXCEEDS_DUE':
      return 'El vuelto a entregar excede el cambio debido según la tasa aplicable.';
    case 'ERR_CHANGE_NEGATIVE':
      return 'El vuelto no puede ser negativo.';
    case 'ERR_RATE_INVALID':
      return 'No hay tasa USD válida para liquidar el vuelto en esa moneda (jerarquía tienda → BCC → elToque).';
  }
}
