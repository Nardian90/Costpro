/**
 * COSTPRO-SALES-DASHBOARD-001 · Utilidades de períodos y variación
 *
 * Toda la lógica de ventanas temporales del dashboard vive aquí (pura y
 * testeable). Los cálculos de importes NO están aquí: los hace el RPC
 * `get_sales_dashboard_analytics` en el servidor (ver
 * docs/sales-dashboard/KPI_DEFINITIONS.md).
 *
 * Zona horaria: America/Havana (timezone operativo del negocio — constante
 * en todo el sistema). Los boundaries de período se computan en hora local
 * de La Habana y se transmiten al servidor como timestamptz.
 */

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'this_week'
  | 'prev_week'
  | 'this_month'
  | 'prev_month'
  | 'this_year'
  | 'custom';

export interface PeriodWindow {
  /** Inclusive, hora local Havana 00:00 */
  from: Date;
  /** Inclusive, hora local Havana 23:59:59.999 */
  to: Date;
}

export interface PeriodOption {
  value: PeriodPreset;
  label: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7', label: 'Últimos 7 días' },
  { value: 'last30', label: 'Últimos 30 días' },
  { value: 'this_week', label: 'Esta semana' },
  { value: 'prev_week', label: 'Semana anterior' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'prev_month', label: 'Mes anterior' },
  { value: 'this_year', label: 'Este año' },
  { value: 'custom', label: 'Personalizado' },
];

/** Fecha en hora local de La Habana (sin depender del TZ del navegador). */
export function havanaNow(): Date {
  const now = new Date();
  // "Ahora" en hora local de La Habana, marcado como UTC para que los
  // YMD derivados coincidan con los del negocio (offset real vía Intl).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
}

function havanaYMD(d: Date): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/**
 * 00:00 hora Havana del Y-M-D dado, como instante UTC.
 * Cuba TIENE horario de verano (UTC-4 en verano, UTC-5 en invierno): el
 * offset se computa con Intl para el día concreto — jamás se asume fijo.
 */
function havanaMidnight(y: number, m: number, d: number): Date {
  // Prueba ambas fronteras (DST cambia a las 00:00 local): la medianoche
  // local es el instante UTC cuyo formateo Havana da 00:00 de ese día.
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours, 0, 0));
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(candidate);
    const g = (t: string) => fmt.find(x => x.type === t)?.value;
    if (g('year') === String(y) && g('month') === String(m).padStart(2, '0')
        && g('day') === String(d).padStart(2, '0') && g('hour') === '00' && g('minute') === '00') {
      return candidate;
    }
  }
  // Fallback defensivo: medianoche según offset estándar (no debería ocurrir).
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
}

function endOfDay(from: Date): Date {
  return new Date(from.getTime() + 24 * 3600 * 1000 - 1);
}

/** ±N días LOCALES desde una medianoche, re-alineada a medianoche (DST-safe). */
function addLocalDays(mid: Date, n: number): Date {
  const target = new Date(mid.getTime() + n * 24 * 3600 * 1000);
  const { y, m, d } = havanaYMD(target);
  return havanaMidnight(y, m, d);
}

/** Domingo como primer día de semana (convención comercial del sistema). */
function startOfWeek(d: Date): Date {
  const { y, m, d: dd } = havanaYMD(d);
  const mid = havanaMidnight(y, m, dd);
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Havana', weekday: 'short' }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return addLocalDays(mid, -map[dow]);
}

/** Ventana del preset; para 'custom' usa from/to explícitos. */
export function resolvePeriodWindow(
  preset: PeriodPreset,
  customFrom?: string,
  customTo?: string,
): PeriodWindow {
  const now = havanaNow();
  const todayMid = havanaMidnight(havanaYMD(now).y, havanaYMD(now).m, havanaYMD(now).d);

  switch (preset) {
    case 'today':
      return { from: todayMid, to: endOfDay(todayMid) };
    case 'yesterday': {
      const y = addLocalDays(todayMid, -1);
      return { from: y, to: endOfDay(y) };
    }
    case 'last7': {
      const from = addLocalDays(todayMid, -6);
      return { from, to: endOfDay(todayMid) };
    }
    case 'last30': {
      const from = addLocalDays(todayMid, -29);
      return { from, to: endOfDay(todayMid) };
    }
    case 'this_week':
      return { from: startOfWeek(now), to: endOfDay(todayMid) };
    case 'prev_week': {
      const w = startOfWeek(now);
      const from = addLocalDays(w, -7);
      return { from, to: endOfDay(addLocalDays(w, -1)) };
    }
    case 'this_month': {
      const { y, m } = havanaYMD(now);
      const from = havanaMidnight(y, m, 1);
      return { from, to: endOfDay(todayMid) };
    }
    case 'prev_month': {
      const { y, m } = havanaYMD(now);
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      const from = havanaMidnight(py, pm, 1);
      // último día del mes anterior = víspera del 1º del mes actual
      const lastDay = new Date(havanaMidnight(y, m, 1).getTime() - 24 * 3600 * 1000);
      return { from, to: endOfDay(lastDay) };
    }
    case 'this_year': {
      const { y } = havanaYMD(now);
      const from = havanaMidnight(y, 1, 1);
      return { from, to: endOfDay(todayMid) };
    }
    case 'custom': {
      const fy = Number((customFrom || '').slice(0, 4));
      const fm = Number((customFrom || '').slice(5, 7));
      const fd = Number((customFrom || '').slice(8, 10));
      const ty = Number((customTo || '').slice(0, 4));
      const tm = Number((customTo || '').slice(5, 7));
      const td = Number((customTo || '').slice(8, 10));
      if (!fy || !fm || !fd || !ty || !tm || !td) {
        // fallback: mes actual
        const { y, m } = havanaYMD(now);
        return { from: havanaMidnight(y, m, 1), to: endOfDay(todayMid) };
      }
      return { from: havanaMidnight(fy, fm, fd), to: endOfDay(havanaMidnight(ty, tm, td)) };
    }
  }
}

/**
 * Ventana ANTERIOR equivalente: MISMO NÚMERO DE DÍAS LOCALES de Havana,
 * terminando la víspera del inicio de la actual (misión §4: períodos
 * comparables — ej. 1–8 nov frente a 24–31 oct).
 * Se cuenta en días de calendario local (no ms absolutos): el horario de
 * verano de Cuba introduce horas que harían las ventanas incomparables.
 */
export function previousEquivalentWindow(w: PeriodWindow): PeriodWindow {
  const fromYMD = havanaYMD(w.from);
  const toYMD = havanaYMD(w.to);
  const fromMid = havanaMidnight(fromYMD.y, fromYMD.m, fromYMD.d);
  const toMid = havanaMidnight(toYMD.y, toYMD.m, toYMD.d);
  const days = Math.round((toMid.getTime() - fromMid.getTime()) / (24 * 3600 * 1000)) + 1;

  const prevToMid = new Date(fromMid.getTime() - 24 * 3600 * 1000);
  const prevToYMD = havanaYMD(prevToMid);
  const prevTo = new Date(havanaMidnight(prevToYMD.y, prevToYMD.m, prevToYMD.d).getTime() + 24 * 3600 * 1000 - 1);

  const prevFrom = addLocalDays(fromMid, -days);

  return { from: prevFrom, to: prevTo };
}

/** Variación porcentual. null cuando no hay base de comparación (→ «—»). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  const v = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

/** Etiqueta legible de la granularidad de la serie. */
export function granularityLabel(unit: string): string {
  switch (unit) {
    case 'hour': return 'por hora';
    case 'week': return 'por semana';
    case 'month': return 'por mes';
    default: return 'por día';
  }
}

/** Fecha ISO corta (YYYY-MM-DD) para inputs date. */
export function toDateInputValue(d: Date): string {
  const { y, m, d: dd } = havanaYMD(d);
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
