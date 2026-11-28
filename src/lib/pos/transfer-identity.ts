/**
 * MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001 (FASE 2).
 *
 * Regla canónica de IDENTIDAD DEL PAGADOR para ventas que incluyen
 * transferencia: No. de transferencia (por fila de pago) + Nombre + Carné de
 * identidad + Teléfono. Ninguna de las dos vías del POS (Cajero Express y
 * Modo Carrito) puede confirmar una venta con transferencia sin los cuatro
 * datos — y la obligatoriedad NUNCA depende solo del frontend: la misma
 * regla vive en /api/pos/checkout (422) y en create_sale_v2
 * (ERR_TRANSFER_IDENTITY_REQUIRED).
 *
 * CANAL CANÓNICO: la puerta solo se aplica a payloads que declaran sus
 * distribuciones por el camino actual del POS — filas por línea
 * (items[].payments) o componentes por moneda (payment_components). El flujo
 * legado del Catálogo de ventas envía pools sin filas ni componentes y NO se
 * toca (fuera del alcance de la misión; no romperlo es requisito).
 *
 * Función PURA (sin I/O): testeable unitariamente y compartible.
 */

export interface TransferPaymentRowLike {
  method?: string | null;
  amount?: number | null;
  reference?: string | null;
}

export interface TransferIdentityPayloadLike {
  items?: Array<{ payments?: TransferPaymentRowLike[] } | unknown> | null;
  payment_components?: Array<{ method?: string | null }> | null;
  transfer_amount?: number | null;
  external_transfer_amount?: number | null;
  zelle_amount?: number | null;
  customer_name?: string | null;
  customer_ci?: string | null;
  customer_phone?: string | null;
}

const TRANSFER_METHODS = new Set(['transfer', 'external_transfer', 'zelle']);

/** Fila de transferencia con monto > 0 (el heredado 'zelle' cuenta). */
function isTransferRowWithAmount(p: TransferPaymentRowLike): boolean {
  return TRANSFER_METHODS.has(String(p.method ?? '')) && (Number(p.amount) || 0) > 0;
}

export interface TransferChannelCheck {
  /** La venta declara transferencia por el canal canónico (filas/componentes). */
  hasTransfer: boolean;
  /** El payload usa el canal canónico por línea (items[].payments presente). */
  declaresPerItemPayments: boolean;
}

/**
 * ¿La venta incluye transferencia por el canal canónico?
 *  · filas por línea con monto > 0 (transfer/external_transfer/zelle), o
 *  · componentes por moneda de transferencia, o
 *  · pools de transferencia > 0 EN un payload que declara filas por línea
 *    (defensa para ventas mixtas cuyo pool no coincide con las filas).
 * Los pools SOLOS (sin filas ni componentes) son el flujo legado del
 * Catálogo y NO activan la puerta.
 */
export function saleIncludesTransferChannel(d: TransferIdentityPayloadLike): TransferChannelCheck {
  const items = Array.isArray(d.items) ? d.items : [];
  let hasTransfer = false;
  let declaresPerItemPayments = false;

  for (const it of items) {
    const payments = (it as { payments?: TransferPaymentRowLike[] })?.payments;
    if (Array.isArray(payments)) {
      declaresPerItemPayments = true;
      if (payments.some(isTransferRowWithAmount)) hasTransfer = true;
    }
  }

  if (!hasTransfer && Array.isArray(d.payment_components)) {
    if (d.payment_components.some((c) => TRANSFER_METHODS.has(String(c?.method ?? '')))) {
      hasTransfer = true;
    }
  }

  if (
    !hasTransfer &&
    declaresPerItemPayments &&
    ((Number(d.transfer_amount) || 0) > 0 ||
      (Number(d.external_transfer_amount) || 0) > 0 ||
      (Number(d.zelle_amount) || 0) > 0)
  ) {
    hasTransfer = true;
  }

  return { hasTransfer, declaresPerItemPayments };
}

/** Los tres datos de identidad, con espacios como único contenido = vacío. */
export function missingTransferIdentityFields(d: TransferIdentityPayloadLike): string[] {
  const missing: string[] = [];
  if (!(d.customer_name ?? '').trim()) missing.push('nombre');
  if (!(d.customer_ci ?? '').trim()) missing.push('carné de identidad');
  if (!(d.customer_phone ?? '').trim()) missing.push('teléfono');
  return missing;
}

/**
 * Filas de transferencia con monto > 0 SIN su número de operación.
 * (Defensa en profundidad: create_sale_v2 ya lo exige por fila §5.1.)
 */
export function missingTransferRowReferences(d: TransferIdentityPayloadLike): boolean {
  const items = Array.isArray(d.items) ? d.items : [];
  return items.some((it) =>
    ((it as { payments?: TransferPaymentRowLike[] })?.payments ?? []).some(
      (p) => isTransferRowWithAmount(p) && !(p.reference ?? '').trim(),
    ),
  );
}
