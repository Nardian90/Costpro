/**
 * CP-FIN · Ritmo de ventas (misión Estados Financieros §5) — matemática pura.
 *
 * Los importes SIEMPRE vienen del RPC `get_sales_dashboard_analytics`
 * (fuente de verdad de las ventas: transactions.status='completed' en CUP
 * equivalente + devoluciones completadas). Aquí SOLO se derivan: ventas
 * netas, índice comparativo, variación y diferencia — nunca se inventan
 * importes ni tasas de conversión.
 *
 * DEFINICIÓN DE VENTAS NETAS (misión §6.1): documentos de venta completados
 * (total_amount = subtotal − descuento + impuestos, CUP equivalente) MENOS
 * devoluciones completadas en CUP. La resta replica el tratamiento contable
 * vigente del motor CP-FIN: ING_DEVOLUCIONES es contra-ingreso que reduce
 * ingresos_netos. Las devoluciones en USD NO se convierten (la tabla
 * devolutions no registra tipo de cambio histórico) y se reportan aparte:
 * jamás se suman monedas nominales distintas (misión §6.2).
 *
 * CASOS ESPECIALES (misión §5.4):
 *  · Período anterior en cero → 'no-base': sin índice ni porcentaje, se
 *    mantiene visible el importe actual («Sin base comparable»).
 *  · Período anterior negativo (devoluciones > ventas) → 'negative-base':
 *    solo variación absoluta, sin porcentaje no fiable.
 */
import type { DashboardSeriesPoint } from './schema';

export interface RhythmTotals {
  /** SUM(total_amount) de ventas completadas (CUP equivalente). */
  netCup: number;
  /** Devoluciones completadas en CUP (se RESTAN del neto documental). */
  devolutionsCup: number;
  /** Devoluciones completadas en USD (NO convertidas: sin tasa histórica). */
  devolutionsUsd: number;
  /** Cantidad de documentos de venta completados del período. */
  ops: number;
}

export type RhythmBaseState = 'ok' | 'no-base' | 'negative-base';

export interface RhythmMetrics {
  ventasNetas: number;
  ventasDocumentos: number;
  devolucionesCup: number;
  prevVentasNetas: number;
  prevVentasDocumentos: number;
  prevDevolucionesCup: number;
  /** Diferencia absoluta en CUP (actual − anterior). */
  diffCup: number;
  /** Índice comparativo (×100) — null si la base no permite comparación. */
  indexPct: number | null;
  /** Variación porcentual (índice − 100) — null si la base no permite comparación. */
  variationPct: number | null;
  baseState: RhythmBaseState;
  direction: 'up' | 'down' | 'flat';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function computeRhythmMetrics(cur: RhythmTotals, prev: RhythmTotals): RhythmMetrics {
  const ventasDocumentos = round2(cur.netCup);
  const ventasNetas = round2(cur.netCup - cur.devolutionsCup);
  const prevVentasDocumentos = round2(prev.netCup);
  const prevVentasNetas = round2(prev.netCup - prev.devolutionsCup);

  const diffCup = round2(ventasNetas - prevVentasNetas);

  let indexPct: number | null = null;
  let variationPct: number | null = null;
  let baseState: RhythmBaseState = 'ok';
  if (prevVentasNetas < 0) {
    baseState = 'negative-base';
  } else if (prevVentasNetas === 0) {
    baseState = 'no-base';
  } else {
    indexPct = round1((ventasNetas / prevVentasNetas) * 100);
    variationPct = round1(indexPct - 100);
  }

  const direction: RhythmMetrics['direction'] =
    ventasNetas > prevVentasNetas ? 'up' : ventasNetas < prevVentasNetas ? 'down' : 'flat';

  return {
    ventasNetas,
    ventasDocumentos,
    devolucionesCup: round2(cur.devolutionsCup),
    prevVentasNetas,
    prevVentasDocumentos,
    prevDevolucionesCup: round2(prev.devolutionsCup),
    diffCup,
    indexPct,
    variationPct,
    baseState,
    direction,
  };
}

/** Acumulado de ventas por posición de bucket (serie ordenada). */
export interface CumulativePoint {
  /** Etiqueta legible del bucket: día del mes (‘1’…) o ‘MM/AA’. */
  label: string;
  /** Acumulado de ventas netas de documento (CUP). */
  cumulative: number;
}

/** Los buckets llegan ordenados del RPC; se ordenan igualmente por defensa. */
function ordered(points: DashboardSeriesPoint[]): DashboardSeriesPoint[] {
  return [...points].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function bucketLabel(bucket: string): string {
  // 'YYYY-MM-DD HH:MI' → día del mes sin cero. Para granularidad mensual
  // ('YYYY-MM') → 'MM/AA'. Para horaria conserva la hora.
  if (/^\d{4}-\d{2}$/.test(bucket)) return `${bucket.slice(5, 7)}/${bucket.slice(2, 4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(bucket)) return String(Number(bucket.slice(8, 10)));
  return bucket.slice(11) || bucket;
}

export function buildCumulativeSeries(points: DashboardSeriesPoint[]): CumulativePoint[] {
  let acc = 0;
  return ordered(points).map((p) => {
    acc += p.net_cup;
    return { label: bucketLabel(p.bucket), cumulative: round2(acc) };
  });
}

export interface EvolutionPoint {
  /** Etiqueta compartida del día/posición (día del mes, ‘1’…). */
  label: string;
  /** Acumulado del período actual (null si el período no tiene esa posición). */
  cur: number | null;
  /** Acumulado del período anterior (null si ese mes no tuvo esa posición). */
  prev: number | null;
}

/**
 * Alinea las dos evoluciones acumuladas POR POSICIÓN (día 1, 2, …): ventanas
 * equivalentes ⇒ igual cantidad de buckets. Los días inexistentes en un
 * período (ej.: febrero de 28 días frente a marzo) quedan en null y el
 * gráfico no los conecta.
 */
export function buildEvolutionChartData(
  curPoints: DashboardSeriesPoint[],
  prevPoints: DashboardSeriesPoint[],
): EvolutionPoint[] {
  const curCum = buildCumulativeSeries(curPoints);
  const prevCum = buildCumulativeSeries(prevPoints);
  const n = Math.max(curCum.length, prevCum.length);
  const out: EvolutionPoint[] = [];
  for (let i = 0; i < n; i++) {
    const cur = curCum[i] ?? null;
    const prev = prevCum[i] ?? null;
    if (!cur && !prev) continue;
    out.push({
      label: cur?.label ?? prev?.label ?? String(i + 1),
      cur: cur ? cur.cumulative : null,
      prev: prev ? prev.cumulative : null,
    });
  }
  return out;
}

/**
 * Escala del bullet chart (misión §4.2-B): el tope superior cubre al índice
 * real sin recortarlo (limitación estructural del gauge: el arco fijo recorta
 * o deforma los valores >100%). Múltiplos legibles de 25%, mínimo 150%.
 */
export function bulletScale(indexPct: number | null): { cap: number; markerPct: number; overflows: boolean } {
  if (indexPct === null || !Number.isFinite(indexPct)) return { cap: 150, markerPct: (100 / 150) * 100, overflows: false };
  const cap = Math.min(Math.max(150, Math.ceil(indexPct / 25) * 25), 400);
  return { cap, markerPct: (100 / cap) * 100, overflows: indexPct > cap };
}
