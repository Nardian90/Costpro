/**
 * exchange-history.ts — Serie informal UNIFICADA del histórico (IC-UX-HISTORY-004).
 *
 * MISIÓN IC-UX-HISTORY-004 (2026-10-26) §4: la pestaña «Histórico» debe poder
 * consultar las cotizaciones verificadas de TODOS los proveedores que
 * realmente aportaron datos a CostPro (Diviza — activa — y elToque — archivo
 * 2025-12-25 → 2026-07-28), como UNA serie lógica informal, no como una tabla
 * que obligue a elegir un único proveedor para consultar el pasado.
 *
 * REGLA DE SELECCIÓN (una observación informal por fecha — determinista y
 * total; documentada y probada en src/__tests__/lib/exchange-history.test.ts):
 *
 *   1. CALIDAD/VALIDEZ del registro:
 *        real > estimated > carry_forward (virtual, solo si no hay
 *        observaciones verificadas ese día).
 *      Una observación REAL (aunque sea del archivo elToque) SIEMPRE gana a
 *      un valor estimado o a una virtual de arrastre.
 *   2. PROCEDENCIA (a igual calidad): fuente informal ACTIVA (Diviza) >
 *      fuente histórica (elToque). El proveedor activo es la autoridad
 *      vigente de CostPro; si ambos registraron el mismo día, gana el activo.
 *   3. FRESCURA (a igual calidad y procedencia): captured_at más reciente
 *      (una recaptura del mismo día actualiza la observación, nunca duplica).
 *
 * La vigencia de la tasa ACTUAL es una responsabilidad DISTINTA (misión §4
 * «separación obligatoria») y NO usa este módulo: la vigente la resuelve la
 * API (informal_latest, EXCLUYENDO fuentes históricas y virtuales — ver
 * src/lib/exchange-sources.ts y /api/exchange-rates). Este módulo solo
 * construye la SERIE HISTÓRICA para gráficos/tablas y jamás alimenta la
 * tarjeta de la tasa vigente, la brecha, los indicadores ni los simuladores.
 *
 * Garantías (misión §4):
 *   - No se descartan filas históricas válidas por source ≠ Diviza.
 *   - No se suman ni duplican cotizaciones de distintas fuentes en un mismo
 *     día: exactamente UN punto por fecha.
 *   - La procedencia original de cada fila se conserva (informalSource).
 *   - Los días sin cotización verificable permanecen como huecos (null);
 *     jamás se interpola ni se fabrican valores.
 *   - Orden cronológico estricto por rate_date (ISO lexicográfico).
 *   - Filas con rate_date futuro no desplazan a las válidas: simplemente
 *     aparecen al final de la serie tal cual están en la BD (sin re-fechaar).
 *
 * Módulo PURO: sin dependencias, sin efectos — usable en servidor y cliente.
 */

import { isActiveInformalSource, isHistoricalInformalSource } from './exchange-sources';

/** Fila mínima que el constructor necesita (compatible con la respuesta de la API). */
export interface InformalHistoryRowLike {
  rate_date: string;
  captured_at?: string | null;
  currency: string;
  source: string;
  segment?: string | null;
  rate: number;
  capture_method?: 'real' | 'estimated' | 'carry_forward' | string | null;
  /** Fecha real de la fila de la que deriva una virtual carry_forward. */
  original_rate_date?: string | null;
}

/** Fila oficial (BCC) mínima. */
export interface OfficialHistoryRowLike {
  rate_date: string;
  captured_at?: string | null;
  currency: string;
  source: string;
  segment?: string | null;
  rate: number;
}

/**
 * Punto de la serie diaria unificada. `informalSource` preserva la
 * procedencia del valor seleccionado (trazabilidad de la misión §4);
 * `informalCaptureMethod` distingue real / estimada / arrastre.
 */
export interface UnifiedHistoryPoint {
  date: string;
  oficial: number | null;
  informal: number | null;
  /** Proveedor que aportó el valor informal del día ('Diviza' | 'elToque' | …). */
  informalSource: string | null;
  /** Método del registro seleccionado ('real' | 'estimated' | 'carry_forward'). */
  informalCaptureMethod: string | null;
  /** En virtuales: fecha real de la fila origen del arrastre. */
  informalOriginalRateDate?: string | null;
}

/** Prioridad de CALIDAD del registro (regla §1: real > estimated > virtual). */
const QUALITY_RANK: Record<string, number> = {
  real: 3,
  estimated: 2,
  carry_forward: 1,
};

const qualityOf = (r: InformalHistoryRowLike): number => {
  const q = r.capture_method ? QUALITY_RANK[r.capture_method] : undefined;
  // Ausente/ desconocido se trata como 'estimated' (nunca gana a un real).
  return q ?? QUALITY_RANK.estimated;
};

/** Prioridad de PROCEDENCIA (regla §2: activa > histórica > desconocida). */
const provenanceRank = (source: string): number => {
  if (isActiveInformalSource(source)) return 2;
  if (isHistoricalInformalSource(source)) return 1;
  return 0;
};

/**
 * REGLA UNIFICADA — de varias filas informales del MISMO día devuelve la
 * prioritaria (calidad > procedencia > frescura). Determinista y total:
 * nunca empata (captured_at desempata; a igualdad total, orden estable de
 * entrada). Exportada para pruebas directas de la regla.
 */
export function pickUnifiedInformalRow<T extends InformalHistoryRowLike>(rows: T[]): T | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => {
    const q = qualityOf(b) - qualityOf(a);
    if (q !== 0) return q;
    const p = provenanceRank(b.source) - provenanceRank(a.source);
    if (p !== 0) return p;
    return (b.captured_at || '').localeCompare(a.captured_at || '');
  })[0];
}

/** La fila oficial (BCC) del día: la captura más reciente (recaptura = upsert). */
function pickOfficialRow<T extends OfficialHistoryRowLike>(rows: T[]): T | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) =>
    (b.captured_at || '').localeCompare(a.captured_at || ''),
  )[0];
}

export interface BuildUnifiedSeriesOptions {
  /**
   * Segmento BCC para la serie oficial (las informales son siempre '3').
   * Default '3' (MIPYMES) — mismo default que la API.
   */
  segment?: string;
  /** Moneda de la serie (default 'USD'). */
  currency?: string;
}

/**
 * Construye la serie diaria UNIFICADA a partir de filas crudas de la API
 * (cualquier combinación de fuentes: BCC + Diviza + elToque + …).
 *
 * - Un punto por cada fecha que tenga AL MENOS una fila (oficial o informal).
 * - Los días sin ninguna fila NO se fabrican: simplemente no existen en la
 *   serie (huecos reales del histórico).
 * - Dentro de una fecha: informal = pickUnifiedInformalRow (regla documentada),
 *   oficial = BCC del segmento con captured_at más reciente.
 * - Orden cronológico ascendente por rate_date.
 */
export function buildUnifiedHistorySeries<
  T extends InformalHistoryRowLike & OfficialHistoryRowLike,
>(rows: T[], options: BuildUnifiedSeriesOptions = {}): UnifiedHistoryPoint[] {
  const segment = options.segment ?? '3';
  const currency = options.currency ?? 'USD';

  const informalByDate = new Map<string, T[]>();
  const officialByDate = new Map<string, T[]>();
  const dates = new Set<string>();

  for (const r of rows) {
    if (r.currency !== currency) continue;
    // La serie informal une ACTIVAS + HISTÓRICAS (misión §4: una sola serie
    // lógica; la fuente desconocida no se descarta del histórico, se conserva
    // con su procedencia).
    if (r.source === 'BCC') {
      if (r.segment != null && r.segment !== segment) continue;
      dates.add(r.rate_date);
      const list = officialByDate.get(r.rate_date);
      if (list) list.push(r);
      else officialByDate.set(r.rate_date, [r]);
    } else {
      // Informales (Diviza/elToque/…): segmento '3' siempre, pero por
      // robustez se respeta si trae otro segmento igual al consultado.
      if (r.segment != null && r.segment !== '' && r.segment !== '3' && r.segment !== segment) continue;
      dates.add(r.rate_date);
      const list = informalByDate.get(r.rate_date);
      if (list) list.push(r);
      else informalByDate.set(r.rate_date, [r]);
    }
  }

  return [...dates].sort((a, b) => a.localeCompare(b)).map((date) => {
    const officialRow = pickOfficialRow(officialByDate.get(date) ?? []);
    const informalRow = pickUnifiedInformalRow(informalByDate.get(date) ?? []);
    return {
      date,
      oficial: officialRow ? officialRow.rate : null,
      informal: informalRow ? informalRow.rate : null,
      informalSource: informalRow ? informalRow.source : null,
      informalCaptureMethod: informalRow ? (informalRow.capture_method ?? 'estimated') : null,
      informalOriginalRateDate: informalRow?.original_rate_date ?? null,
    };
  });
}

export interface InformalProvenanceSummaryEntry {
  source: string;
  count: number;
  firstDate: string;
  lastDate: string;
  active: boolean;
}

export interface InformalProvenanceSummary {
  entries: InformalProvenanceSummaryEntry[];
  totalInformalDays: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Días de la serie con informal presente (no se cuentan los null). */
  daysWithInformal: number;
}

/**
 * Resumen de procedencia de la serie informal unificada (misión §4:
 * «conserva su trazabilidad y permite identificar qué fuente aportó el valor
 * seleccionado»). Sirve para el bloque informativo de la pestaña Histórico.
 */
export function summarizeInformalProvenance(
  series: UnifiedHistoryPoint[],
): InformalProvenanceSummary {
  const bySource = new Map<string, InformalProvenanceSummaryEntry>();
  let daysWithInformal = 0;

  for (const point of series) {
    if (point.informal == null || !point.informalSource) continue;
    daysWithInformal++;
    let entry = bySource.get(point.informalSource);
    if (!entry) {
      entry = {
        source: point.informalSource,
        count: 0,
        firstDate: point.date,
        lastDate: point.date,
        active: isActiveInformalSource(point.informalSource),
      };
      bySource.set(point.informalSource, entry);
    }
    entry.count++;
    if (point.date < entry.firstDate) entry.firstDate = point.date;
    if (point.date > entry.lastDate) entry.lastDate = point.date;
  }

  const entries = [...bySource.values()].sort((a, b) => {
    // Activas primero, luego por primera fecha (orden estable del archivo).
    const act = (b.active ? 1 : 0) - (a.active ? 1 : 0);
    if (act !== 0) return act;
    return a.firstDate.localeCompare(b.firstDate);
  });

  const informalDates = series.filter(p => p.informal != null).map(p => p.date);

  return {
    entries,
    totalInformalDays: informalDates.length,
    daysWithInformal,
    firstDate: informalDates.length > 0 ? informalDates[0] : null,
    lastDate: informalDates.length > 0 ? informalDates[informalDates.length - 1] : null,
  };
}
