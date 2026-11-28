/**
 * market-indicators.ts — Indicadores de mercado del Dashboard (CP-FX-UX-002,
 * FASE 4 Nivel 3 / FASE 6.4-6.5).
 *
 * EXACTITUD (misión §6.4/§6.5):
 *   - Las variaciones se calculan POR FECHA CALENDARIO: «% 7d» compara la
 *     última observación con la observación de hace EXACTAMENTE 7 días
 *     naturales (o la más cercana ANTERIOR dentro de una tolerancia de 2
 *     días — fin de semana sin publicación). El código anterior comparaba
 *     POR ÍNDICE (valid[len-1-n]) y, con huecos en la serie, «7 días» podía
 *     ser 10 días naturales.
 *   - La ventana de cada variación se declara (días naturales reales usados)
 *     para que el UI pueda informarla.
 *   - La serie llega deduplicada por fecha (un punto por día — regla de la
 *     serie unificada) y ordenada ascendente.
 *
 * Módulo PURO — determinista y probado.
 */

export interface MarketPoint {
  date: string;
  value: number;
}

export interface DateBasedVariation {
  /** Última observación de la serie (fecha + valor). */
  lastDate: string;
  lastValue: number;
  /** % vs la observación del día anterior (calendario). null si no hay. */
  pct24h: number | null;
  /** Días naturales usados para la variación de 1 día (1 = consecutivo). */
  days24h: number | null;
  /** % vs hace 7 días naturales (tolerancia 2 días). */
  pct7d: number | null;
  days7d: number | null;
  /** % vs hace 30 días naturales (tolerancia 2 días). */
  pct30d: number | null;
  days30d: number | null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Diferencia en días naturales entre dos fechas ISO (a − b). */
export function daysBetweenIso(a: string, b: string): number | null {
  if (!ISO_RE.test(a) || !ISO_RE.test(b)) return null;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / 86_400_000);
}

/**
 * Busca la observación «de hace ~n días naturales» con la convención
 * financiera estándar: la ÚLTIMA observación EN O ANTES de la fecha objetivo
 * (lastDate − n), siempre que no sea más vieja que n − tolerance días.
 *  - Fecha objetivo publicada → coincidencia exacta (gap = n).
 *  - Objetivo sin publicación (fin de semana) → la más cercana ANTERIOR.
 * Devuelve null si nada cumple la tolerancia.
 */
function findAtNDaysAgo(
  points: MarketPoint[],
  targetDays: number,
  tolerance = 2,
): { point: MarketPoint; days: number } | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const targetDate = shiftIso(last.date, -targetDays);
  if (!targetDate) return null;
  const minGap = targetDays - tolerance;
  let best: { point: MarketPoint; days: number } | null = null;
  // Recorrido desde el presente hacia el pasado: la PRIMERA observación con
  // fecha ≤ objetivo y antigüedad ≥ objetivo − tolerancia es exactamente la
  // convención «última publicada en o antes del día objetivo».
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].date > targetDate) continue; // publicada DESPUÉS del objetivo
    const d = daysBetweenIso(last.date, points[i].date);
    // Tolerancia simétrica: la observación puede ser como máximo `tolerance`
    // días más vieja que el objetivo (fin de semana sin publicación). Un hueco
    // mayor significa que la publicación cesó — comparar contra ella
    // etiquetándolo «n días» sería fabricar la variación (misión §6.4).
    if (d == null || d < minGap || d > targetDays + tolerance) return best;
    best = { point: points[i], days: d };
    break;
  }
  return best;
}

/** Fecha ISO desplazada n días naturales (aritmética UTC, sin zonas). */
function shiftIso(iso: string, days: number): string | null {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

const pct = (oldV: number, newV: number): number | null =>
  oldV > 0 ? ((newV - oldV) / oldV) * 100 : null;

/**
 * Variaciones por fecha calendario de una serie deduplicada ascendente.
 * Requiere al menos 2 puntos; devuelve null si la serie es insuficiente.
 */
export function computeDateBasedVariations(points: MarketPoint[]): DateBasedVariation | null {
  if (points.length < 2) return null;

  const last = points[points.length - 1];

  // 24h: la observación anterior en la serie DEBE estar a ≤2 días naturales
  // (dos observaciones separadas por más tiempo NO forman una variación
  // «diaria» — misma regla honesta del gráfico del Histórico).
  const prev = points[points.length - 2];
  const gapPrev = daysBetweenIso(last.date, prev.date);
  const d24 = gapPrev != null && gapPrev <= 2 ? { point: prev, days: gapPrev } : null;

  const d7 = findAtNDaysAgo(points, 7);
  const d30 = findAtNDaysAgo(points, 30);

  return {
    lastDate: last.date,
    lastValue: last.value,
    pct24h: d24 ? pct(d24.point.value, last.value) : null,
    days24h: d24?.days ?? null,
    pct7d: d7 ? pct(d7.point.value, last.value) : null,
    days7d: d7?.days ?? null,
    pct30d: d30 ? pct(d30.point.value, last.value) : null,
    days30d: d30?.days ?? null,
  };
}

/** Volatilidad (desviación estándar de los cambios diarios %) sobre la serie. */
export function volatilityPct(points: MarketPoint[]): number | null {
  if (points.length < 3) return null;
  const changes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = daysBetweenIso(points[i].date, points[i - 1].date);
    // Solo cambios entre días consecutivos (gap 1) participan — la
    // volatilidad «diaria» no se fabrica cruzando huecos grandes.
    if (gap !== 1) continue;
    if (points[i - 1].value > 0) {
      changes.push(((points[i].value - points[i - 1].value) / points[i - 1].value) * 100);
    }
  }
  if (changes.length === 0) return null;
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - mean) ** 2, 0) / changes.length;
  return Math.sqrt(variance);
}
