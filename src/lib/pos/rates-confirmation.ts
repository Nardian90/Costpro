/**
 * MISIÓN-TASAS (2026-10-17) — Confirmación diaria de tasas de cambio.
 *
 * Al abrir el carrito POS por primera vez en cada DÍA OPERATIVO (día de
 * negocio America/Havana, mismo criterio que cash-report/period-attribution),
 * el sistema pide al usuario confirmar que las tasas de cambio vigentes
 * siguen correctas — evita ventas con tasas desactualizadas por olvido.
 *
 * Persistencia: tabla `user_preferences` (servidor, cross-device, RLS
 * user_id = auth.uid()) vía el hook canónico useUserPreferences. La clave
 * compone tienda + día de negocio, por lo que la caducidad diaria es
 * estructural: cada día la clave cambia → no hay confirmación previa.
 * La confirmación es idempotente (PK user_id + preference_key).
 *
 * La confirmación NO modifica las tasas: solo deja constancia de que el
 * usuario revisó y validó los valores mostrados (fuente real:
 * store_exchange_rates vía /api/store-rates).
 *
 * Librería PURA (sin React): testeable en aislamiento.
 */

export interface RatesConfirmationRecord {
  /** ISO instant de la confirmación. */
  confirmedAt: string;
  /** Día de negocio (YYYY-MM-DD, America/Havana) en el que se confirmó. */
  businessDay: string;
  /** Tienda para la que se confirmaron las tasas. */
  storeId: string;
  /** Valores confirmados (copia real de store_exchange_rates al confirmar). */
  rates: Record<string, number>;
}

/** Tolerancia de comparación de tasas (las tasas se guardan con 4 decimales). */
const RATE_EPSILON = 0.0001;

/**
 * Clave de preferencia para la confirmación diaria.
 * Formato: `rates-confirmation:<storeId>:<YYYY-MM-DD>`
 */
export function ratesConfirmationKey(storeId: string, businessDay: string): string {
  return `rates-confirmation:${storeId}:${businessDay}`;
}

export type RatesConfirmationNeededReason =
  | 'not_confirmed'   // no hay confirmación para este día/tienda
  | 'rates_changed';  // las tasas actuales difieren de las confirmadas

export interface RatesConfirmationEvaluation {
  needed: boolean;
  reason: RatesConfirmationNeededReason | null;
}

function ratesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    if (Math.abs(va - vb) > RATE_EPSILON) return false;
  }
  return true;
}

/**
 * Evalúa si hace falta pedir confirmación de tasas.
 *
 * Reglas:
 *   - Sin registro previo, de otra tienda o de otro día → 'not_confirmed'.
 *   - Con registro del día pero tasas actuales distintas a las confirmadas
 *     → 'rates_changed' (una confirmación anterior NUNCA oculta una
 *     modificación posterior de las tasas).
 *   - Registro del día con las mismas tasas → no se vuelve a molestar
 *     (cerrar/abrir el carrito repetidamente no repite el diálogo).
 */
export function evaluateRatesConfirmation(
  record: RatesConfirmationRecord | null | undefined,
  currentRates: Record<string, number>,
  opts: { businessDay: string; storeId: string },
): RatesConfirmationEvaluation {
  if (
    !record ||
    record.storeId !== opts.storeId ||
    record.businessDay !== opts.businessDay
  ) {
    return { needed: true, reason: 'not_confirmed' };
  }
  if (!ratesEqual(record.rates || {}, currentRates || {})) {
    return { needed: true, reason: 'rates_changed' };
  }
  return { needed: false, reason: null };
}

/**
 * Registro de confirmación a partir de los valores actuales.
 * (factoría pura para el hook — mantiene el shape canónico del record).
 */
export function buildRatesConfirmationRecord(
  storeId: string,
  businessDay: string,
  currentRates: Record<string, number>,
  now: Date = new Date(),
): RatesConfirmationRecord {
  return {
    confirmedAt: now.toISOString(),
    businessDay,
    storeId,
    rates: { ...currentRates },
  };
}
