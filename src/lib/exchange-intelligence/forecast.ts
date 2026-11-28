/**
 * forecast.ts — MOTOR COMPARTIDO de proyección de tasas (CP-FX-UX-002, FASE 3.2/6).
 *
 * CONTEXTO (auditoría docs/audits/CP-FX-UX-002/AUDITORIA.md §3): la
 * contradicción «producto proyecta 843» vs «escenarios proyecta 989 CUP/USD»
 * NO era un error de índices — eran DOS motores con DOS conjuntos de datos y
 * DOS ventanas distintas sin declarar:
 *   - Mi Producto: regresión sobre la serie UNIFICADA completa (elToque
 *     ~620-910 + zona muerta interpolada ~780-840 + Diviza 840→980) — la
 *     masa de puntos planos/antiguos diluía la pendiente reciente.
 *   - Escenarios: regresión sobre la serie de 90 días de la fuente activa
 *     (840→980 en subida) — pendiente muy mayor.
 * Con entradas distintas, resultados distintos: imposible de explicar al
 * usuario y peligroso para decidir precios.
 *
 * REGLA DE ESTE MOTOR (única para todos los consumidores):
 *   1. UNA fuente de datos declarada (la serie que el consumidor pasa) y una
 *      VENTANA explícita (default: últimos 30 puntos OBSERVADOS).
 *   2. SOLO observaciones para entrenar (jamás estimaciones ni arrastres a
 *      menos que el consumidor los declare expresamente) — una proyección
 *      estadística se entrena con observaciones del mercado.
 *   3. Mínimo de muestras (5) y calidad declarada por R² (≥0.7 alta,
 *      ≥0.4 media, <0.4 NO se presenta como proyección confiable).
 *   4. La salida declara modelo, ventana, muestras usadas y R² — el UI debe
 *      mostrarlos y etiquetar el resultado como ESTIMACIÓN estadística.
 *
 * Módulo PURO — determinista, sin React, probado en
 * src/__tests__/lib/exchange-forecast.test.ts.
 */

/** Modelos soportados por el motor unificado. */
export type ForecastModelId = 'linear' | 'poly2' | 'sma7' | 'sma30';

export interface ForecastInputPoint {
  /** Fecha ISO del punto (para trazabilidad del extremo de la ventana). */
  date: string;
  /** Valor observado (null = hueco; se ignora para el entrenamiento). */
  value: number | null;
  /**
   * true solo en reconstrucciones estadísticas ('estimated') o virtuales
   * ('carry_forward'). Por defecto se EXCLUYEN del entrenamiento (regla 2).
   */
  isReconstructed?: boolean;
}

export interface ForecastWindow {
  /** Fecha ISO del primer punto usado. */
  from: string | null;
  /** Fecha ISO del último punto usado. */
  to: string | null;
  /** Muestras efectivamente usadas en el ajuste. */
  samples: number;
  /** Puntos excluidos por ser reconstrucciones/arrastres. */
  excludedReconstructed: number;
}

export type ForecastConfidence = 'alta' | 'media' | 'baja' | 'insuficiente';

export interface ForecastResult {
  /** Tasa proyectada a `daysAhead` de la última observación usada. */
  projected: number | null;
  /** Coeficiente de determinación del ajuste sobre la ventana. */
  r2: number;
  model: ForecastModelId;
  /** Días hacia adelante proyectados. */
  daysAhead: number;
  window: ForecastWindow;
  confidence: ForecastConfidence;
  /** false cuando NO hay evidencia suficiente (regla 3) — el UI no debe presentar proyección. */
  reliable: boolean;
  /** Pendiente (CUP/día) para modelos de recta. */
  slope: number | null;
}

export interface ForecastOptions {
  model?: ForecastModelId;
  /** Tamaño de la ventana en PUNTOS observados (default 30). */
  windowPoints?: number;
  /** Días hacia adelante a proyectar (default 7). */
  daysAhead?: number;
  /** Mínimo de muestras para ajustar (default 5). */
  minSamples?: number;
  /** Umbral R² mínimo para considerar la proyección confiable (default 0.4). */
  r2Min?: number;
  /** Incluir reconstrucciones/arrastres en el entrenamiento (default false). */
  includeReconstructed?: boolean;
}

export const FORECAST_DEFAULT_WINDOW_POINTS = 30;
export const FORECAST_DEFAULT_MIN_SAMPLES = 5;
export const FORECAST_DEFAULT_R2_MIN = 0.4;
export const FORECAST_DEFAULT_DAYS_AHEAD = 7;

const R2_HIGH = 0.7;

/** Regresión lineal por mínimos cuadrados sobre índices 0..n-1. */
function linearFit(values: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = values.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - (slope * i + intercept)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

/** Regresión polinomial grado 2 sobre índices 0..n-1. */
function poly2Fit(values: number[]): { a: number; b: number; c: number; r2: number } | null {
  const n = values.length;
  if (n < 4) return null;
  let S4 = 0;
  let S3 = 0;
  let S2 = 0;
  let S1 = 0;
  const S0 = n;
  let Sxy = 0;
  let Sx2y = 0;
  let Sy = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    S4 += x ** 4;
    S3 += x ** 3;
    S2 += x ** 2;
    S1 += x;
    Sxy += x * y;
    Sx2y += x * x * y;
    Sy += y;
  }
  const det = S4 * (S2 * S0 - S1 * S1) - S3 * (S3 * S0 - S1 * S2) + S2 * (S3 * S1 - S2 * S2);
  if (Math.abs(det) < 1e-9) return null;
  const a = (Sx2y * (S2 * S0 - S1 * S1) - Sxy * (S3 * S0 - S1 * S2) + Sy * (S3 * S1 - S2 * S2)) / det;
  const b = (S4 * (Sxy * S0 - Sy * S1) - S3 * (Sx2y * S0 - Sy * S2) + S2 * (Sx2y * S1 - Sxy * S2)) / det;
  const c = (S4 * (S2 * Sy - S1 * Sxy) - S3 * (S3 * Sy - S1 * Sx2y) + S2 * (S3 * Sxy - S2 * Sx2y)) / det;
  const meanY = Sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - (a * i * i + b * i + c)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { a, b, c, r2 };
}

/** SMA al cierre de la ventana (proyección = último promedio). */
function smaLast(values: number[], window: number): number | null {
  if (values.length === 0) return null;
  const slice = values.slice(-window);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** R² de una SMA frente a la serie (capacidad explicativa del suavizado). */
function smaR2(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const smaSeries = values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const ssTot = values.reduce((s, y) => s + (y - mean) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - smaSeries[i]) ** 2, 0);
  return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
}

/**
 * Proyección ÚNICA del sistema. Determinista: mismas entradas + opciones →
 * mismo resultado (regla de la misión §3.2: con datos, fechas y modelo
 * iguales, el resultado debe ser IGUAL en todos los consumidores).
 */
export function forecastRate(points: ForecastInputPoint[], options: ForecastOptions = {}): ForecastResult | null {
  const model = options.model ?? 'linear';
  const windowPoints = options.windowPoints ?? FORECAST_DEFAULT_WINDOW_POINTS;
  const daysAhead = options.daysAhead ?? FORECAST_DEFAULT_DAYS_AHEAD;
  const minSamples = options.minSamples ?? FORECAST_DEFAULT_MIN_SAMPLES;
  const r2Min = options.r2Min ?? FORECAST_DEFAULT_R2_MIN;
  const includeReconstructed = options.includeReconstructed ?? false;

  // Ventana: los últimos `windowPoints` puntos CON valor; fuera de ella se
  // ignora todo (la ventana se corta sobre la cola ordenada de la serie).
  const withValue = points.filter(p => p.value != null && Number.isFinite(p.value as number));
  const windowRaw = withValue.slice(-windowPoints);

  // Regla 2: solo observaciones (salvo inclusión explícita del consumidor).
  const trainable = includeReconstructed ? windowRaw : windowRaw.filter(p => !p.isReconstructed);
  const excludedReconstructed = windowRaw.length - trainable.length;
  const values = trainable.map(p => p.value as number);

  const window: ForecastWindow = {
    from: trainable.length > 0 ? trainable[0].date : null,
    to: trainable.length > 0 ? trainable[trainable.length - 1].date : null,
    samples: trainable.length,
    excludedReconstructed,
  };

  if (values.length < minSamples) {
    return {
      projected: null,
      r2: 0,
      model,
      daysAhead,
      window,
      confidence: 'insuficiente',
      reliable: false,
      slope: null,
    };
  }

  let projected: number | null = null;
  let r2 = 0;
  let slope: number | null = null;

  if (model === 'linear') {
    const fit = linearFit(values);
    if (!fit) {
      return { projected: null, r2: 0, model, daysAhead, window, confidence: 'insuficiente', reliable: false, slope: null };
    }
    slope = fit.slope;
    r2 = fit.r2;
    projected = fit.slope * (values.length - 1 + daysAhead) + fit.intercept;
  } else if (model === 'poly2') {
    const fit = poly2Fit(values);
    if (!fit) {
      return { projected: null, r2: 0, model, daysAhead, window, confidence: 'insuficiente', reliable: false, slope: null };
    }
    r2 = fit.r2;
    const x = values.length - 1 + daysAhead;
    const v = fit.a * x * x + fit.b * x + fit.c;
    // Una parábola puede proyectar sin sentido (≤0) fuera del rango —
    // se devuelve sin valor confiable (misión §3.2: no comunicar absurdos).
    projected = Number.isFinite(v) && v > 0 ? v : null;
  } else {
    const w = model === 'sma7' ? 7 : 30;
    const avg = smaLast(values, w);
    if (avg == null) {
      return { projected: null, r2: 0, model, daysAhead, window, confidence: 'insuficiente', reliable: false, slope: null };
    }
    r2 = smaR2(values, w);
    projected = avg;
  }

  const confidence: ForecastConfidence =
    r2 >= R2_HIGH ? 'alta' : r2 >= r2Min ? 'media' : 'baja';
  const reliable = projected != null && Number.isFinite(projected) && r2 >= r2Min;

  return { projected, r2, model, daysAhead, window, confidence, reliable, slope };
}

/**
 * Variante por modelo — compara los 4 modelos sobre la MISMA ventana
 * (lo que antes hacían por separado producto y escenarios con fórmulas
 * duplicadas). Devuelve el mapa modelId → resultado para tablas comparativas.
 */
export function forecastAllModels(
  points: ForecastInputPoint[],
  options: Omit<ForecastOptions, 'model'> = {},
): Record<ForecastModelId, ForecastResult | null> {
  const models: ForecastModelId[] = ['linear', 'poly2', 'sma7', 'sma30'];
  const out = {} as Record<ForecastModelId, ForecastResult | null>;
  for (const m of models) out[m] = forecastRate(points, { ...options, model: m });
  return out;
}

/** Mejor modelo por R² sobre la misma ventana (desempate: lineal primero). */
export function bestForecastModel(
  results: Record<ForecastModelId, ForecastResult | null>,
): ForecastModelId {
  let best: ForecastModelId = 'linear';
  let bestR2 = -Infinity;
  (Object.keys(results) as ForecastModelId[]).forEach(id => {
    const r2 = results[id]?.r2 ?? -Infinity;
    if (r2 > bestR2) {
      bestR2 = r2;
      best = id;
    }
  });
  return best;
}
