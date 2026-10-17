/**
 * operation-date.ts — MISIÓN FECHA OPERATIVA EN VENDER (2026-10-17).
 *
 * Lógica pura y compartida para la fecha económica seleccionable en la vista
 * Vender (POS): carrito de venta (usePOSCheckout), vale de salida
 * (useValeSalidaCheckout) y modo Express. También la revalidación server-side
 * de las rutas /api/pos/checkout y /api/vale-salida.
 *
 * Semántica temporal del sistema (verificada en misión):
 *   - Zona horaria de negocio: America/Havana (src/lib/cash-report/period-attribution.ts).
 *   - RPC create_sale_v2 / create_vale_salida aceptan p_operation_date (timestamptz)
 *     y lo propagan a transactions/issue_slips/transaction_items/payment_transactions/
 *     stock_movements (movement_date → Kardex, IPV, reportes).
 *   - Gate canónico BD: validate_operation_date (lookback 6 meses, máx hoy+1, Habana).
 *     Este módulo NO lo reemplaza: es defensa en profundidad en cliente y rutas.
 *
 * Convención de envío (decisión de diseño documentada en
 * docs/audits/FECHA_OPERATIVA_VENDER_TURNOS_Y_VALES_2026-10-17.md):
 *   - Fecha seleccionada == hoy (Habana) → NO se envía operation_date; el servidor
 *     estampa NOW() exactamente como hoy (cero cambio de conducta en ventas del
 *     día: arqueo por ventana, orden del ledger, timestamps reales).
 *   - Fecha seleccionada != hoy → se envía operation_date al MEDIODÍA local
 *     (formatOperationDateForRPC), misma convención de SalesCatalogCheckoutModal.
 */

import { businessDayOf, todayBusinessDay } from '@/lib/cash-report/period-attribution';

/** Resuelve el valor a enviar como operation_date al servidor.
 *
 * @param saleDate fecha seleccionada en el selector ('YYYY-MM-DD') o null (= hoy).
 * @param todayBd  día de negocio actual (inyectable para tests; default hoy Habana).
 * @returns ISO timestamptz (mediodía) SOLO si saleDate es distinto de hoy; si es
 *          hoy (o null/vacío) retorna undefined → el servidor usa NOW().
 */
export function resolvePosOperationDate(
  saleDate: string | null | undefined,
  todayBd: string = todayBusinessDay(),
): string | undefined {
  if (!saleDate) return undefined; // null = hoy implícito
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return undefined; // formato inválido → no enviar
  if (saleDate === todayBd) return undefined; // hoy → NOW() (comportamiento canónico)
  // Mediodía: misma convención del proyecto (OperationDatePicker.formatOperationDateForRPC)
  return new Date(saleDate + 'T12:00:00').toISOString();
}

/** Revalidación server-side (rutas) y guard cliente: la fecha operativa del
 *  flujo Vender NO puede ser futura respecto al día de negocio actual.
 *  (El gate BD es más laxo por diseño: hoy+1 para TODOS los flujos; aquí se
 *   aplica el tope estricto misional = hoy para venta/vale desde el carrito.)
 *
 * @param operationDate ISO datetime (o 'YYYY-MM-DD') a validar.
 * @param todayBd      día de negocio actual (inyectable para tests).
 */
export function checkNotFutureOperationDate(
  operationDate: string,
  todayBd: string = todayBusinessDay(),
): { ok: true } | { ok: false; error: string } {
  try {
    const opBd = businessDayOf(operationDate);
    if (opBd > todayBd) {
      return {
        ok: false,
        error: `La fecha de operación (${opBd}) no puede ser posterior a la fecha actual (${todayBd}). Selecciona una fecha válida e intenta de nuevo.`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'La fecha de operación no es válida.' };
  }
}

/** true si el día de negocio de `isoInstant` es anterior al día `dayBd` ('YYYY-MM-DD'). */
export function isBusinessDayBefore(instantIso: string, dayBd: string): boolean {
  try {
    return businessDayOf(instantIso) < dayBd;
  } catch {
    return false;
  }
}
