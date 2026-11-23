/**
 * ADNEGOCIO-UI 2026-11-23 · Velocímetro ejecutivo de ventas — lógica pura.
 *
 * Comparación canónica (misión §4): acumulado del mes en curso contra el
 * MISMO TRAMO del mes anterior (1–22 nov ↔ 1–22 oct, DST-safe La Habana —
 * previousMonthEquivalentWindow de periods.ts). El período anterior es la
 * referencia del 100 %: NO es una meta ni un objetivo comercial.
 *
 * Escala (misión §4): dinámica y SIN TRUNCAR. El tope del arco crece en
 * múltiplos legibles de 25 % para cubrir el índice real — a diferencia del
 * bullet (techado en 400 %), aquí no hay techo: un 500 % agranda el arco a
 * 500 %. Sin base válida de comparación (anterior ≤ 0) no se calcula ningún
 * porcentaje ni se divide entre cero: estado «Sin base de comparación».
 */

/** Ticks legibles sobre el arco, acotados a lo que cabe sin saturar. */
export interface SpeedometerScale {
  /** Tope del arco en % (≥ 150). El 100 % cae en (100 / cap) del arco. */
  cap: number;
  /** Posición del tick 100 % como fracción del arco (0..1). */
  tick100: number;
  /** Marcas numéricas del arco (0, 50/75, 100, … cap). */
  ticks: number[];
  /** Índice no truncable garantizado por el tope dinámico. */
  overflows: false;
}

export function speedometerScale(indexPct: number | null | undefined): SpeedometerScale {
  if (indexPct === null || indexPct === undefined || !Number.isFinite(indexPct)) {
    return { cap: 150, tick100: 100 / 150, ticks: [0, 50, 100, 150], overflows: false };
  }
  // Tope: primer múltiplo de 25 que cubre el índice, mínimo 150.
  const cap = Math.max(150, Math.ceil(indexPct / 25) * 25);
  // Paso de marcas: el arco nunca muestra más de ~8 números (legibilidad).
  const step = cap > 300 ? Math.ceil(cap / 6 / 25) * 25 : cap > 150 ? 50 : 50;
  const ticks: number[] = [];
  for (let v = 0; v <= cap; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== cap) ticks.push(cap);
  // El 100 % siempre visible como marca de referencia.
  if (!ticks.includes(100)) ticks.push(100);
  ticks.sort((a, b) => a - b);
  return { cap, tick100: 100 / cap, ticks, overflows: false };
}

/** Posición de la aguja como fracción del arco (0..1), acotada al tope. */
export function needleFraction(indexPct: number | null | undefined, cap: number): number | null {
  if (indexPct === null || indexPct === undefined || !Number.isFinite(indexPct)) return null;
  return Math.max(0, Math.min(1, indexPct / cap));
}

/** Variación % con una cifra decimal; null sin base válida. */
export function variationPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
