/**
 * period-attribution.ts — Atribución temporal de comisiones por PERIODO correspondiente.
 *
 * MISIÓN 2026-10-16 (Reporte Entrega — comisión del 15/10 apareciendo en el filtro del 16/10):
 *
 * CAUSA RAÍZ demostrada (docs/audits/...): el reporte atribuía cada comisión al instante de
 * CONFIRMACIÓN del pago (`commission_payments.paid_at`), pero el negocio las atribuye al
 * PERIODO de ventas al que corresponden (`period_start`/`period_end` — misma convención de
 * fecha económico que `transactions.sale_date` y el motor de comisiones). El registro
 * investigado (7374dfad…, 300 CUP efectivo) fue creado/aprobado/pagado el 16/10 10:24–10:25
 * Habana (auditado, coherente) para el periodo 15/10 → el reporte lo mostraba el 16.
 * Fechas almacenadas CORRECTAS; el filtro usaba el campo equivocado.
 *
 * Este módulo es la fuente única de:
 *   1. Conversión DETERMINISTA de un día calendario (YYYY-MM-DD) a su ventana ISO en la
 *      ZONA HORARIA DE NEGOCIO (antes: `new Date(day + 'T00:00:00')` dependía de la TZ del
 *      navegador — un navegador en UTC producía ventanas distintas que uno en Habana).
 *   2. Filtro PostgREST de comisiones por solapamiento del periodo con los días de negocio
 *      del rango consultado, con fallback al comportamiento histórico (`paid_at`) cuando el
 *      periodo es NULL (registros legacy).
 *
 * Consumidores: /api/cash-report (override del grupo `commissions` + totales),
 * /api/cash-report/details, /api/cash-report/commissions-summary y CashReportView
 * (total y detalle comparten el MISMO criterio temporal).
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
 * Ventana ISO [inicio, fin] (medio-abierto en espíritu: fin = 23:59:59.999 local) del día
 * calendario `day` (YYYY-MM-DD) en la zona horaria de negocio.
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

/**
 * Filtro PostgREST `.or(...)` para atribuir comisiones pagadas al periodo que corresponde:
 *   · (period_start ≤ d1 AND period_end ≥ d0) — solapamiento del periodo con los días de
 *     negocio [d0, d1] cubiertos por la consulta (un pago por periodo aparece UNA vez por
 *     día del periodo y no se filtra a otros días).
 *   · OR (period NULL AND paid_at ∈ ventana) — fallback al criterio histórico para
 *     registros legacy sin periodo (no cambia su significado contable).
 * Acepta fechas ISO completas (ventana de la vista) o date-only (ruta del PDF Diario).
 */
export function commissionPeriodOrFilter(
  startInput: string,
  endInput: string,
  tz: string = BUSINESS_TIMEZONE,
): string {
  const d0 = businessDayOf(startInput, tz);
  const d1 = businessDayOf(endInput, tz);
  // Ventana temporal cruda (para el fallback paid_at) respetando el tipo de entrada.
  const rawStart = DATE_ONLY.test(startInput) ? `${startInput}T00:00:00.000Z` : startInput;
  const rawEnd = DATE_ONLY.test(endInput) ? `${endInput}T23:59:59.999Z` : endInput;
  return [
    `and(period_start.lte.${d1},period_end.gte.${d0})`,
    `and(period_start.is.null,paid_at.gte.${rawStart},paid_at.lte.${rawEnd})`,
  ].join(',');
}
