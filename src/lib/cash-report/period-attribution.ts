/**
 * period-attribution.ts — Atribución temporal de comisiones por FECHA DEL PAGO confirmado.
 *
 * MISIÓN 2026-10-16 (Reporte Entrega — comisión del 15/10 apareciendo en el filtro del 16/10)
 * y ADENDA del negocio del mismo día:
 *
 * CRITERIO CANÓNICO (definido por el negocio, textual):
 *   «En el reporte siempre mostrará la fecha en que se confirmó el pago, porque puede ser
 *    que aunque la comisión corresponde al día 15/octubre/2026 no se haya pagado ese día
 *    sino el día 16 — y sí sería correcto que se refleje en el reporte de ese día 16.»
 *
 * Es decir: el reporte atribuye cada comisión pagada al DÍA DE NEGOCIO de su
 * `commission_payments.paid_at` (fecha de confirmación/ejecución del pago). El periodo de
 * ventas (period_start/period_end) es METADATA informativa del renglón de detalle — nunca
 * criterio de atribución.
 *
 * La incidencia original NO era del filtro sino del DATO: el pago 7374dfad… (300 CUP
 * efectivo, periodo 15/10) se ejecutó realmente el 15/10 a las 5:00 PM, pero la UI de
 * confirmación no permitía escoger la fecha del pago y el sistema asumió el instante
 * actual (16/10 10:24–10:25 Habana). Corrección ordenada por el negocio: paid_at =
 * 2026-10-15T21:00:00Z (17:00 Habana) + feature nueva: selector de fecha del pago en la
 * confirmación (ver /api/commissions/payments/[id], acción 'pay').
 *
 * Este módulo es la fuente única de:
 *   1. Conversión DETERMINISTA de un día calendario (YYYY-MM-DD) a su ventana ISO en la
 *      ZONA HORARIA DE NEGOCIO (antes: `new Date(day + 'T00:00:00')` dependía de la TZ del
 *      navegador — un navegador en UTC producía ventanas distintas que uno en Habana).
 *   2. Filtro PostgREST de comisiones pagadas por ventana de negocio sobre `paid_at`
 *      (acepta fechas ISO completas de la vista o date-only de la ruta del PDF Diario).
 *   3. Utilidades de día de negocio para la validación de la fecha del pago
 *      (no futura; no anterior al último pago realizado del trabajador).
 *
 * Consumidores: /api/cash-report (override del grupo `commissions` + totales),
 * /api/cash-report/details, /api/cash-report/commissions-summary, CashReportView
 * (total y detalle comparten el MISMO criterio temporal) y /api/commissions/payments/[id]
 * (validación de la fecha del pago elegida en la UI).
 */

/** Zona horaria de negocio de COSTPRO (convención operativa: mediodía Habana = 16:00Z). */
export const BUSINESS_TIMEZONE = 'America/Havana';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Offset (minutos) de `tz` respecto a UTC en el instante dado (localAsUtc − instant). */
export function tzOffsetMinutes(instant: Date, tz: string = BUSINESS_TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Ventana ISO [inicio, fin] (fin = 23:59:59.999 local) del día calendario `day`
 * (YYYY-MM-DD) en la zona horaria de negocio.
 * Determinista: produce la MISMA ventana desde cualquier TZ del navegador/servidor.
 * Ej. '2026-10-16' @ Habana (UTC−4, DST) → ['2026-10-16T04:00:00.000Z', '2026-10-17T03:59:59.999Z'].
 */
export function businessDayWindow(day: string, tz: string = BUSINESS_TIMEZONE): { startIso: string; endIso: string } {
  if (!DATE_ONLY.test(day)) throw new Error(`businessDayWindow: se espera YYYY-MM-DD, recibido ${day}`);
  const [y, m, d] = day.split('-').map(Number);
  // Sonda al mediodía UTC del día: en TZ con |offset| < 12h el mediodía UTC cae SIEMPRE
  // dentro del mismo día civil local → el offset probe corresponde al día solicitado.
  const offset = tzOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), tz);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offset * 60000;
  const endMs = startMs + 86_400_000 - 1;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

/** Día civil de negocio (YYYY-MM-DD) de un instante ISO, o el propio valor si ya es date-only. */
export function businessDayOf(input: string, tz: string = BUSINESS_TIMEZONE): string {
  if (DATE_ONLY.test(input)) return input; // el llamador ya habla en días de negocio
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(input)); // YYYY-MM-DD
}

/** Día de negocio ACTUAL (YYYY-MM-DD) en la zona horaria de negocio. */
export function todayBusinessDay(tz: string = BUSINESS_TIMEZONE): string {
  return businessDayOf(new Date().toISOString(), tz);
}

/**
 * Instante ISO del día de negocio `day` a la HORA DE REGISTRO actual (reloj de pared de
 * la tienda). Se usa cuando el negocio confirma hoy un pago ejecutado en un día anterior:
 * la FECHA es la elegida en la UI; la hora intradía es la del registro (irrelevante para
 * el reporte, que atribuye por día de negocio).
 * Convergencia en 2 pasadas del offset UTC−tz (suficiente fuera de transiciones DST —
 * en Habana cambian a medianoche/1 AM, nunca a la hora de registro diurna).
 */
export function instantForBusinessDay(day: string, tz: string = BUSINESS_TIMEZONE): string {
  if (!DATE_ONLY.test(day)) throw new Error(`instantForBusinessDay: se espera YYYY-MM-DD, recibido ${day}`);
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const h = Math.min(Number(p.hour) % 24, 23);
  const mi = Number(p.minute);
  const s = Number(p.second);
  const [y, m, d] = day.split('-').map(Number);
  const wallMs = Date.UTC(y, m - 1, d, h, mi, s);
  let utcMs = wallMs - tzOffsetMinutes(new Date(wallMs), tz) * 60000;
  utcMs = wallMs - tzOffsetMinutes(new Date(utcMs), tz) * 60000;
  return new Date(utcMs).toISOString();
}

/**
 * Filtro PostgREST de comisiones pagadas por FECHA DEL PAGO (paid_at) dentro de la
 * ventana de negocio del rango consultado — criterio canónico del negocio:
 *   · Entrada ISO completa (ventana ya convertida por la vista con businessDayWindow)
 *     → se usa tal cual.
 *   · Entrada date-only (ruta del PDF Diario) → se convierte a ventana de negocio
 *     determinista (antes: ventana UTC del día — defecto de zona horaria corregido).
 *
 * Devuelve un único término `and(...)` para usar en `.or(...)` (o encadenar).
 */
export function commissionPaidAtFilter(
  startInput: string,
  endInput: string,
  tz: string = BUSINESS_TIMEZONE,
): string {
  const startIso = DATE_ONLY.test(startInput)
    ? businessDayWindow(startInput, tz).startIso
    : startInput;
  const endIso = DATE_ONLY.test(endInput)
    ? businessDayWindow(endInput, tz).endIso
    : endInput;
  return `and(paid_at.gte.${startIso},paid_at.lte.${endIso})`;
}
