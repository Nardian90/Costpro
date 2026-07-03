/**
 * RED FLAG F-21: Validación server-side para evitar tasa=1.0 en moneda no-CUP.
 *
 * La auditoría detectó que `receipt_items` tiene defaults
 * `moneda_recepcion='CUP'` y `tasa_cambio_recepcion=1.0`. Si el auto-fill de
 * tasa falla (bug F-03 ya arreglado, pero defensa en profundidad), se
 * guardaría `USD × 1.0` → costeo absurdo (impacto cambiario ficticio 574×).
 *
 * Este módulo expone validadores reutilizables para TODOS los sitios donde
 * se insertan o actualizan `receipt_items` desde la app. La BD también tiene
 * un constraint CHECK (migration `20260703000003_receipt_items_tasa_validation.sql`)
 * como defense in depth.
 *
 * Umbral: 1.5 CUP por unidad de moneda extranjera. La tasa oficial más baja
 * histórica fue ~120 CUP/USD, así que cualquier valor <= 1.5 en moneda
 * no-CUP es claramente un error.
 */

/** Umbral mínimo para tasa_cambio_recepcion cuando la moneda no es CUP. */
export const TASA_CAMBIO_MINIMA_NO_CUP = 1.5;

/** Moneda base del sistema. */
export const MONEDA_BASE = 'CUP' as const;

/**
 * Resultado de una validación de item de recepción.
 * - `valid: true`  → el item es válido y puede persistirse.
 * - `valid: false` → el item debe rechazarse con el `error` proporcionado.
 */
export interface ReceiptItemTasaValidationResult {
  valid: boolean;
  error?: string;
  details?: string;
}

/**
 * Valida que un item de recepción tenga una tasa de cambio coherente
 * con su moneda.
 *
 * Reglas:
 *   1. Si `moneda_recepcion === 'CUP'` (o undefined/null) → siempre válido.
 *   2. Si `moneda_recepcion !== 'CUP'` → `tasa_cambio_recepcion` debe ser
 *      un número > {@link TASA_CAMBIO_MINIMA_NO_CUP} (1.5).
 *
 * Esta función es PURA y no lanza; el caller decide qué hacer con el
 * resultado (retornar 400, lanzar Error, etc.).
 *
 * @example
 *   const r = validateReceiptItemTasa('USD', 1.0);
 *   if (!r.valid) {
 *     return NextResponse.json({ error: r.error, details: r.details }, { status: 400 });
 *   }
 */
export function validateReceiptItemTasa(
  monedaRecepcion: string | null | undefined,
  tasaCambioRecepcion: number | null | undefined,
): ReceiptItemTasaValidationResult {
  // Moneda CUP o vacía → siempre válido (default del sistema).
  const moneda = (monedaRecepcion ?? MONEDA_BASE).toUpperCase();
  if (moneda === MONEDA_BASE) {
    return { valid: true };
  }

  // Moneda no-CUP: exigir tasa > 1.5.
  const tasa =
    typeof tasaCambioRecepcion === 'number' && !Number.isNaN(tasaCambioRecepcion)
      ? tasaCambioRecepcion
      : null;

  if (tasa === null || tasa <= TASA_CAMBIO_MINIMA_NO_CUP) {
    return {
      valid: false,
      error: 'Tasa de cambio inválida',
      details:
        `Para moneda ${moneda}, la tasa de cambio debe ser mayor a ${TASA_CAMBIO_MINIMA_NO_CUP} CUP por unidad. ` +
        `Recibido: ${tasa === null ? 'null/undefined' : tasa}. ` +
        `Esto suele ocurrir cuando falla el auto-fill de la tasa — revisa la configuración de inteligencia cambiaria.`,
    };
  }

  return { valid: true };
}

/**
 * Valida un array de items de recepción. Retorna el primer error encontrado
 * (fail-fast) o `{ valid: true }` si todos pasan.
 *
 * Pensado para validar el payload `p_items` antes de llamar a la RPC
 * `register_reception` o antes de insertar items en batch desde el cliente.
 *
 * @example
 *   const r = validateReceiptItemsTasa(items);
 *   if (!r.valid) {
 *     return NextResponse.json({ error: r.error, details: r.details }, { status: 400 });
 *   }
 */
export function validateReceiptItemsTasa<
  T extends {
    moneda_recepcion?: string | null;
    tasa_cambio_recepcion?: number | null;
  },
>(items: T[]): ReceiptItemTasaValidationResult {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = validateReceiptItemTasa(
      item?.moneda_recepcion,
      item?.tasa_cambio_recepcion,
    );
    if (!result.valid) {
      return {
        valid: false,
        error: result.error,
        details: `Item #${i + 1}: ${result.details}`,
      };
    }
  }
  return { valid: true };
}
