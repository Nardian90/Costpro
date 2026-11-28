/**
 * history-filters.ts — Estado de los filtros del tab Histórico (CP-FX-UX-002, FASE 1).
 *
 * REGLAS DE LA MISIÓN:
 *   - Rango por defecto: PRIMER DÍA DEL MES ACTUAL → fecha operativa de Cuba.
 *     Calculado dinámicamente — jamás codificado a un mes concreto.
 *   - «Todo el período» ELIMINADO: no existe preset «Todo» ni valor centinela
 *     (el antiguo 9999 se rechaza al restaurar preferencias guardadas).
 *   - «Restablecer» devuelve al mes actual (no al histórico completo).
 *   - Comparación de fechas por STRING ISO (yyyy-MM-dd) — sin objetos Date ni
 *     desfases de zona horaria en los límites del rango.
 *
 * Persistencia: el estado se guarda con useUserPreferences (Supabase RLS +
 * fallback localStorage) — la MISMA infraestructura de preferencias de
 * COSTPRO; este módulo solo define la forma y la validación.
 *
 * Módulo PURO (sin React) — determinista y probado.
 */

import { getOperativeDate } from '../operative-date';

/** Presets de rango del Histórico (CP-FX-UX-002 §1.3: SIN «Todo»). */
export type RangePreset = 7 | 30 | 90 | 'current-month' | 'custom';

export interface HistoryFilters {
  /** Preset activo del usuario. */
  preset: RangePreset;
  /** true cuando el usuario eligió «Personalizado» (startDate/endDate activos). */
  useCustomRange: boolean;
  /** Límite inferior del rango custom (yyyy-MM-dd). null si no aplica. */
  startDate: string | null;
  /** Límite superior del rango custom (yyyy-MM-dd). null si no aplica. */
  endDate: string | null;
}

/** Etiquetas de los presets (orden de presentación en la UI). */
export const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 7, label: '7 días' },
  { id: 30, label: '30 días' },
  { id: 90, label: '90 días' },
  { id: 'current-month', label: 'Mes actual' },
];

/** ISO yyyy-MM-dd del primer día del mes de la fecha dada (civil de Cuba). */
export function startOfMonthDateString(today: string = getOperativeDate()): string {
  return `${today.slice(0, 7)}-01`;
}

/** Rango por defecto de la misión: primer día del mes actual → hoy (Cuba). */
export function getCurrentMonthRange(today: string = getOperativeDate()): {
  start: string;
  end: string;
} {
  return { start: startOfMonthDateString(today), end: today };
}

/** Estado por defecto: mes actual por preset (sin fechas custom). */
export function defaultHistoryFilters(): HistoryFilters {
  return { preset: 'current-month', useCustomRange: false, startDate: null, endDate: null };
}

/** Estado «Restablecer»: idéntico al por defecto (mes actual, misión §1.4). */
export function resetHistoryFilters(): HistoryFilters {
  return defaultHistoryFilters();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida/normaliza un filtro restaurado de preferencias. Cualquier valor
 * inválido, desconocido o LEGADO (preset 9999 «Todo») vuelve al defecto
 * (mes actual). Nunca lanza.
 */
export function sanitizeHistoryFilters(raw: unknown): HistoryFilters {
  if (raw == null || typeof raw !== 'object') return defaultHistoryFilters();
  const r = raw as Record<string, unknown>;

  const preset = r.preset;
  const validPresets: unknown[] = [7, 30, 90, 'current-month', 'custom'];
  if (!validPresets.includes(preset)) return defaultHistoryFilters();

  const base: HistoryFilters = {
    preset: preset as RangePreset,
    useCustomRange: preset === 'custom',
    startDate: null,
    endDate: null,
  };

  if (preset !== 'custom') return base;

  const start = typeof r.startDate === 'string' && ISO_DATE_RE.test(r.startDate) ? r.startDate : null;
  const end = typeof r.endDate === 'string' && ISO_DATE_RE.test(r.endDate) ? r.endDate : null;
  // Custom sin fechas completas o con orden invertido → defecto honesto.
  if (!start || !end || start > end) return defaultHistoryFilters();
  return { preset: 'custom', useCustomRange: true, startDate: start, endDate: end };
}

/**
 * Filtra la serie por los filtros activos. La comparación es por STRING ISO:
 * los límites son INCLUSIVOS y no dependen de la zona horaria del navegador
 * (la versión anterior comparaba objetos Date y perdía el último día en
 * zonas al este de UTC — misión §1.1 «respetar límites de fechas y zonas»).
 *
 * - 7/30/90: las últimas N fechas de la serie (la serie llega ordenada).
 * - 'current-month': d >= primer día del mes de la fecha operativa (y d <= hoy,
 *   garantizado porque la serie no contiene fechas futuras servidas por defecto;
 *   cualquier fila futura legado quedaría excluida al superar `end`).
 * - 'custom': startDate <= d <= endDate (ambos inclusivos).
 */
export function filterSeriesByFilters<T extends { date: string }>(
  series: T[],
  filters: HistoryFilters,
  today: string = getOperativeDate(),
): T[] {
  if (filters.useCustomRange && filters.preset === 'custom') {
    const { startDate, endDate } = filters;
    if (!startDate || !endDate) return series;
    return series.filter(d => d.date >= startDate && d.date <= endDate);
  }
  if (filters.preset === 'current-month') {
    const start = startOfMonthDateString(today);
    const end = today;
    return series.filter(d => d.date >= start && d.date <= end);
  }
  const n = filters.preset as 7 | 30 | 90;
  return series.slice(-n);
}
