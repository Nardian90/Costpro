/**
 * operative-date.ts — Fecha operativa de negocio de CostPro (America/Havana).
 *
 * MISIÓN IC-DIVIZA-002 (2026-10-26): la fecha que fecha y da vigencia a las
 * tasas cubanas es la fecha CIVIL de Cuba, no la fecha UTC. Antes de esta
 * misión, todas las piezas usaban `new Date().toISOString().split('T')[0]`
 * (fecha UTC): entre las 20:00 y la 01:00/02:00 de Cuba (cuando UTC ya
 * cambió de día), las capturas se fechaban «mañana» y la detección de
 * vigencia/carry-forward divergía entre componentes.
 *
 * Regla (misión §3): America/Havana es LA zona horaria de negocio para:
 *   - Generar el intervalo de fechas de captureDateRange().
 *   - Comparar targetDate con la fecha actual en captureForDate().
 *   - rate_date de las capturas actuales (BCC activas + Diviza).
 *   - Detección de tasas vigentes y carry-forward en /api/exchange-rates.
 *   - Etiquetas de antigüedad en ExchangeIntelligenceView.tsx.
 *
 * Implementación: Intl.DateTimeFormat con timeZone explícito (soportado en
 * Node 20+, navegadores y jsdom) — NO conversiones UTC→cadena. El formato
 * 'en-CA' produce YYYY-MM-DD (fecha civil de la zona pedida).
 *
 * Aritmética de días: se ancla la fecha a T00:00Z como PURO valor de
 * calendario (sin componente horario ni zona) — sumar/restar días sobre ese
 * ancla nunca deriva porque no hay conversión de zona intermedia.
 *
 * Este módulo es puro (sin dependencias ni efectos) y se usa IGUAL en
 * servidor (API routes, captura) y cliente (vista) para que la regla sea
 * una sola. Los registros históricos YA almacenados no se recalculan ni se
 * migran (misión §3: sin justificación probada no se tocan).
 */

/** Zona horaria de negocio para fechar tasas cubanas (misión §3). */
export const BUSINESS_TIMEZONE = 'America/Havana';

/**
 * Fecha operativa vigente (fecha civil de Cuba) en formato YYYY-MM-DD.
 *
 * Ejemplos reales (verificados):
 *   - 2026-10-26T00:30:00Z (20:30 del 25 en Cuba) → '2026-10-25'
 *   - 2026-10-26T05:30:00Z (01:30 del 26 en Cuba) → '2026-10-26'
 */
export function getOperativeDate(now: Date | number = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now instanceof Date ? now : new Date(now));
}

/**
 * Suma (o resta) días a una fecha YYYY-MM-DD pura de calendario.
 * El ancla T00:00Z es un valor de calendario sin zona — la aritmética no
 * sufre desplazamientos DST porque nunca se interpreta como instante local.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`addDaysToDateString: fecha inválida "${dateStr}"`);
  const anchor = Date.UTC(y, m - 1, d);
  const result = new Date(anchor + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/**
 * Intervalo operativo de `days` fechas (de la más vieja a la más nueva),
 * terminando SIEMPRE en la fecha operativa vigente (civil de Cuba).
 *
 * Es el intervalo que procesa captureDateRange(): la última fecha del rango
 * es la operativa, que es donde se capturan BCC activas + Diviza vigente.
 */
export function buildOperativeDateRange(days: number, now: Date | number = new Date()): string[] {
  if (!Number.isFinite(days) || days < 1) throw new Error(`buildOperativeDateRange: days inválido ${days}`);
  const operative = getOperativeDate(now);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDaysToDateString(operative, -i));
  }
  return dates;
}

/** Forma mínima de una fila de tasa con fecha y hora de captura. */
export interface DatedRateRowLike {
  rate_date: string;
  captured_at?: string | null;
}

/**
 * Comparador de frescura del informal/oficial vigente (IC-DIVIZA-002, misión
 * §5: «priorizando la fecha operativa y la frescura de la captura»):
 *
 *   1. Las filas cuya rate_date ES la fecha operativa van PRIMERO (por
 *      captured_at DESC entre ellas).
 *   2. El resto, por rate_date DESC y captured_at DESC.
 *
 * La prioridad 1 resuelve el caso residual de las filas FUTURAS legado del
 * bug UTC (p.ej. rate_date=2026-10-26 capturadas a las 20:28 de Cuba del 25):
 * sin ella, una fila «de mañana» ganaba la ordenación por fecha DESC y la
 * tarjeta mostraba un aviso de antigüedad falso aunque la fila correcta de
 * la fecha operativa existía. Con la prioridad, la vigente es SIEMPRE la de
 * la fecha operativa cuando existe; las futuras legado solo compiten entre
 * sí (y al cambiar la fecha operativa de día entran naturalmente en 1).
 *
 * Misma definición para la vista (ExchangeIntelligenceView) y la API
 * (informal_latest) — sin divergencia cliente/servidor.
 */
export function byOperativeDateFirstThenFreshness(operativeDate: string) {
  return (a: DatedRateRowLike, b: DatedRateRowLike): number => {
    const aOperative = a.rate_date === operativeDate;
    const bOperative = b.rate_date === operativeDate;
    if (aOperative !== bOperative) return aOperative ? -1 : 1;
    if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
    return (b.captured_at || '').localeCompare(a.captured_at || '');
  };
}
