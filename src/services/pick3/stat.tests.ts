/**
 * stat.tests.ts — Statistical Validation Tests for Pick 3
 *
 * Sprint 1 — Statistical Honesty (SPRINT-1-STATS)
 *
 * Implementa los 4 tests estándar para validar si los datos de lotería
 * son estadísticamente distinguishable de un proceso aleatorio uniforme:
 *
 *   1. Chi-cuadrado de uniformidad (goodness of fit)
 *   2. Kolmogorov-Smirnov (test de distribución)
 *   3. Runs Test de Wald-Wolfowitz (autocorrelación / aleatoriedad secuencial)
 *   4. Test de entropía de Shannon
 *
 * Cada test retorna:
 *   - statistic: el estadístico calculado
 *   - pValue: el p-value (probabilidad de observar este resultado bajo H0)
 *   - isSignificant: true si p < 0.05 (rechazamos H0)
 *   - interpretation: mensaje human-readable del resultado
 *
 * Author: CostPro Sprint 1
 * Date: 2026-07-05
 *
 * Referencias:
 *  - Pearson (1900): "On the criterion that a given system of deviations..."
 *  - Kolmogorov (1933) / Smirnov (1948)
 *  - Wald & Wolfowitz (1940): "On a test whether two samples are from same population"
 *  - Shannon (1948): "A Mathematical Theory of Communication"
 */

import { Pick3Result } from '@/types/pick3';

// ============================================================================
// TIPOS
// ============================================================================

export interface TestResult {
  /** Nombre del test */
  name: string;
  /** Estadístico calculado */
  statistic: number;
  /** P-value (0-1) */
  pValue: number;
  /** ¿Es estadísticamente significativo (p<0.05)? */
  isSignificant: boolean;
  /** Hipótesis nula rechazada? */
  nullHypothesisRejected: boolean;
  /** Interpretación human-readable */
  interpretation: string;
  /** Nivel de significancia usado */
  alpha: number;
}

export interface FullStatsReport {
  chiSquare: TestResult;
  kolmogorovSmirnov: TestResult;
  runsTest: TestResult;
  entropy: TestResult;
  /** Veredicto global: ¿los datos son aleatorios puros? */
  isRandom: boolean;
  /** Confianza global en la aleatoriedad (0-100) */
  confidence: number;
  /** Resumen human-readable */
  summary: string;
}

// ============================================================================
// HELPERS MATEMÁTICOS
// ============================================================================

/**
 * Distribución acumulada de la chi-cuadrado usando aproximación de Wilson-Hilferty.
 * Para n>30 es muy precisa; para n<30 usamos tablas precomputadas.
 */
function chiSquareCDF(x: number, df: number): number {
  if (df <= 0) return 1;
  if (x <= 0) return 0;
  // Aproximación de Wilson-Hilferty a la chi-cuadrado
  const h = (x / df) ** (1 / 3);
  const m = 1 - 2 / (9 * df);
  const s = Math.sqrt(2 / (9 * df));
  // CDF de la normal estándar
  const z = (h - m) / s;
  return normalCDF(z);
}

/**
 * CDF de la distribución normal estándar (Abramowitz & Stegun 26.2.17)
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Distribución acumulada de Kolmogorov (aproximación de Stephens 1970)
 * Retorna P(K <= d) donde K es la distribución de Kolmogorov.
 *
 * Fórmula: P(D ≤ d) = 1 - 2 * Σ_{k=1}^∞ (-1)^(k-1) * exp(-2*k²*λ²)
 *   donde λ = (sqrt(n) + 0.12 + 0.11/sqrt(n)) * d
 */
function kolmogorovCDF(d: number, n: number): number {
  if (n <= 0) return 1;
  if (d <= 0) return 0;
  const sqrtN = Math.sqrt(n);
  const lambda = (sqrtN + 0.12 + 0.11 / sqrtN) * d;
  // Serie de Kolmogorov: 1 - 2*sum_{k=1}^∞ (-1)^(k-1) * exp(-2*k²*λ²)
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  // CDF = 1 - 2*sum, clampeado a [0,1]
  return Math.max(0, Math.min(1, 1 - sum));
}

/**
 * CDF de la distribución normal estándar inversa (probit) — Beasley-Springer-Moro
 */
export function invNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// ============================================================================
// 1. CHI-CUADRADO DE UNIFORMIDAD
// ============================================================================

/**
 * Test Chi-cuadrado de Pearson para uniformidad.
 *
 * H0: Los dígitos siguen distribución uniforme (cada dígito 0-9 aparece con prob 0.10)
 * H1: Los dígitos NO siguen distribución uniforme
 *
 * Si rechazamos H0 (p<0.05): hay SESGO real en la lotería (anómalo).
 * Si NO rechazamos H0: los datos son consistentes con aleatoriedad.
 *
 * @param history Historial de sorteos
 * @param position 'global' | 0 | 1 | 2 (qué posición analizar)
 */
export function chiSquareUniformityTest(
  history: Pick3Result[],
  position: 'global' | 0 | 1 | 2 = 'global',
): TestResult {
  const alpha = 0.05;
  const df = 9; // 10 categorías (dígitos 0-9) - 1
  const counts: number[] = new Array(10).fill(0);

  let totalObservations = 0;
  for (const draw of history) {
    if (position === 'global') {
      for (const digit of draw.result) {
        counts[digit]++;
        totalObservations++;
      }
    } else {
      const digit = draw.result[position];
      counts[digit]++;
      totalObservations++;
    }
  }

  if (totalObservations === 0) {
    return {
      name: 'Chi-cuadrado de uniformidad',
      statistic: 0,
      pValue: 1,
      isSignificant: false,
      nullHypothesisRejected: false,
      interpretation: 'Sin datos suficientes para el test',
      alpha,
    };
  }

  const expected = totalObservations / 10;
  let chiSquare = 0;
  for (let i = 0; i < 10; i++) {
    const obs = counts[i];
    const diff = obs - expected;
    chiSquare += (diff * diff) / expected;
  }

  const pValue = 1 - chiSquareCDF(chiSquare, df);
  const isSignificant = pValue < alpha;

  let interpretation: string;
  if (isSignificant) {
    interpretation = `SE DETECTÓ SESGO ESTADÍSTICAMENTE SIGNIFICATIVO (χ²=${chiSquare.toFixed(2)}, p=${pValue.toFixed(4)}). Los dígitos no siguen una distribución uniforme. Esto es anómalo en una lotería justa y podría indicar (a) sesgo físico del equipo, (b) error en datos, o (c) patrón explotable. Sin embargo, NO implica predictibilidad a nivel de sorteo individual.`;
  } else {
    interpretation = `No se detectó sesgo significativo (χ²=${chiSquare.toFixed(2)}, p=${pValue.toFixed(4)}). Los datos son consistentes con una distribución uniforme. La lotería parece estadísticamente justa a nivel de dígitos.`;
  }

  return {
    name: `Chi-cuadrado de uniformidad (${position === 'global' ? 'global' : `posición ${position}`})`,
    statistic: chiSquare,
    pValue,
    isSignificant,
    nullHypothesisRejected: isSignificant,
    interpretation,
    alpha,
  };
}

// ============================================================================
// 2. KOLMOGOROV-SMIRNOV
// ============================================================================

/**
 * Test de Kolmogorov-Smirnov para uniformidad.
 * Compara la distribución empírica acumulada (CDF) con la teórica (uniforme).
 *
 * H0: La distribución empírica = uniforme
 * H1: La distribución empítica ≠ uniforme
 *
 * Más sensible a desviaciones sistemáticas que el chi-cuadrado.
 *
 * Para dígitos 0-9: la CDF teórica es F(x) = (x+1)/10
 */
export function kolmogorovSmirnovTest(
  history: Pick3Result[],
  position: 'global' | 0 | 1 | 2 = 'global',
): TestResult {
  const alpha = 0.05;
  const counts: number[] = new Array(10).fill(0);
  let n = 0;

  for (const draw of history) {
    if (position === 'global') {
      for (const digit of draw.result) {
        counts[digit]++;
        n++;
      }
    } else {
      counts[draw.result[position]]++;
      n++;
    }
  }

  if (n === 0) {
    return {
      name: 'Kolmogorov-Smirnov',
      statistic: 0,
      pValue: 1,
      isSignificant: false,
      nullHypothesisRejected: false,
      interpretation: 'Sin datos suficientes',
      alpha,
    };
  }

  // CDF empírica vs teórica
  let empiricalCDF = 0;
  let theoreticalCDF = 0;
  let maxDiff = 0;

  let cumulative = 0;
  for (let i = 0; i < 10; i++) {
    cumulative += counts[i];
    empiricalCDF = cumulative / n;
    theoreticalCDF = (i + 1) / 10;
    const diff = Math.abs(empiricalCDF - theoreticalCDF);
    if (diff > maxDiff) maxDiff = diff;
  }

  const pValue = 1 - kolmogorovCDF(maxDiff, n);
  const isSignificant = pValue < alpha;

  let interpretation: string;
  if (isSignificant) {
    interpretation = `SE DETECTÓ DESVIACIÓN DE UNIFORMIDAD (D=${maxDiff.toFixed(4)}, p=${pValue.toFixed(4)}). La distribución empírica difiere significativamente de la uniforme teórica.`;
  } else {
    interpretation = `La distribución empírica es consistente con uniforme (D=${maxDiff.toFixed(4)}, p=${pValue.toFixed(4)}).`;
  }

  return {
    name: `Kolmogorov-Smirnov (${position === 'global' ? 'global' : `posición ${position}`})`,
    statistic: maxDiff,
    pValue,
    isSignificant,
    nullHypothesisRejected: isSignificant,
    interpretation,
    alpha,
  };
}

// ============================================================================
// 3. RUNS TEST (WALD-WOLFOWITZ)
// ============================================================================

/**
 * Runs Test de Wald-Wolfowitz para aleatoriedad secuencial.
 *
 * Un "run" es una secuencia consecutiva del mismo símbolo. Aquí clasificamos
 * cada sorteo como PAR (suma par) o IMPAR (suma impar) y contamos los runs.
 *
 * H0: La secuencia es aleatoria (no hay autocorrelación)
 * H1: La secuencia NO es aleatoria (hay autocorrelación / patrón temporal)
 *
 * Si rechazamos H0: hay autocorrelación → posible patrón temporal explotable.
 * Si NO rechazamos H0: la secuencia es aleatoria (no hay patrón temporal).
 */
export function runsTest(history: Pick3Result[]): TestResult {
  const alpha = 0.05;

  if (history.length < 20) {
    return {
      name: 'Runs Test (Wald-Wolfowitz)',
      statistic: 0,
      pValue: 1,
      isSignificant: false,
      nullHypothesisRejected: false,
      interpretation: 'Se necesitan al menos 20 sorteos para el Runs Test',
      alpha,
    };
  }

  // Clasificar: 1 si suma par, 0 si suma impar
  const symbols: number[] = history.map(draw => {
    const sum = draw.result.reduce((a, b) => a + b, 0);
    return sum % 2 === 0 ? 1 : 0;
  });

  const n1 = symbols.filter(s => s === 1).length; // pares
  const n2 = symbols.filter(s => s === 0).length; // impares
  const n = n1 + n2;

  if (n1 === 0 || n2 === 0) {
    return {
      name: 'Runs Test (Wald-Wolfowitz)',
      statistic: 0,
      pValue: 0,
      isSignificant: true,
      nullHypothesisRejected: true,
      interpretation: 'Todos los sorteos tienen la misma paridad — extrema no-aleatoriedad',
      alpha,
    };
  }

  // Contar runs
  let runs = 1;
  for (let i = 1; i < symbols.length; i++) {
    if (symbols[i] !== symbols[i - 1]) runs++;
  }

  // Bajo H0, runs ~ Normal con:
  const expectedRuns = (2 * n1 * n2) / n + 1;
  const varianceRuns = ((2 * n1 * n2) * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const stdRuns = Math.sqrt(varianceRuns);

  const z = stdRuns > 0 ? (runs - expectedRuns) / stdRuns : 0;
  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  const isSignificant = pValue < alpha;

  let interpretation: string;
  if (isSignificant) {
    if (runs < expectedRuns) {
      interpretation = `SE DETECTÓ AUTOCORRELACIÓN POSITIVA (z=${z.toFixed(3)}, p=${pValue.toFixed(4)}). Hay fewer runs de los esperados → los sorteos tienden a agruparse (rachas largas de par/impar). Posible patrón temporal.`;
    } else {
      interpretation = `SE DETECTÓ AUTOCORRELACIÓN NEGATIVA (z=${z.toFixed(3)}, p=${pValue.toFixed(4)}). Hay más runs de los esperados → los sorteos alternan demasiado rápido. Posible anti-patrón.`;
    }
  } else {
    interpretation = `La secuencia es aleatoria (z=${z.toFixed(3)}, p=${pValue.toFixed(4)}). No hay autocorrelación temporal detectable. Los sorteos son independientes entre sí.`;
  }

  return {
    name: 'Runs Test (Wald-Wolfowitz)',
    statistic: z,
    pValue,
    isSignificant,
    nullHypothesisRejected: isSignificant,
    interpretation,
    alpha,
  };
}

// ============================================================================
// 4. ENTROPÍA DE SHANNON
// ============================================================================

/**
 * Test de entropía de Shannon.
 *
 * Calcula la entropía de la distribución de dígitos:
 *   H = -Σ p_i * log2(p_i)
 *
 * Para dígitos 0-9 con distribución uniforme: H_max = log2(10) = 3.3219 bits
 *
 * Si la entropía observada es significativamente menor que H_max → hay sesgo.
 *
 * Aproximación al p-value: usamos chi-cuadrado sobre la deficiencia de entropía
 * (Miller 1955): 2*n*ln(2)*(H_max - H) ~ chi-cuadrado con K-1 df.
 */
export function entropyTest(history: Pick3Result[]): TestResult {
  const alpha = 0.05;
  const counts: number[] = new Array(10).fill(0);
  let n = 0;

  for (const draw of history) {
    for (const digit of draw.result) {
      counts[digit]++;
      n++;
    }
  }

  if (n === 0) {
    return {
      name: 'Entropía de Shannon',
      statistic: 0,
      pValue: 1,
      isSignificant: false,
      nullHypothesisRejected: false,
      interpretation: 'Sin datos',
      alpha,
    };
  }

  // Entropía observada
  let entropy = 0;
  for (let i = 0; i < 10; i++) {
    if (counts[i] > 0) {
      const p = counts[i] / n;
      entropy -= p * Math.log2(p);
    }
  }

  // Entropía máxima teórica
  const H_max = Math.log2(10); // 3.3219 bits
  const entropyRatio = entropy / H_max;

  // Aproximación de Miller (1955): 2*n*ln(2)*(H_max - H) ~ chi-cuadrado con K-1 df
  const deficiency = H_max - entropy;
  const chiSquareApprox = 2 * n * Math.LN2 * deficiency;
  const pValue = 1 - chiSquareCDF(chiSquareApprox, 9);
  const isSignificant = pValue < alpha;

  let interpretation: string;
  if (isSignificant) {
    interpretation = `ENTROPÍA SIGNIFICATIVAMENTE MENOR A LA MÁXIMA (H=${entropy.toFixed(4)} vs H_max=${H_max.toFixed(4)} bits, ratio=${(entropyRatio * 100).toFixed(2)}%, p=${pValue.toFixed(4)}). La distribución no maximiza la entropía → hay información redundante explotable.`;
  } else {
    interpretation = `Entropía cercana a máxima (H=${entropy.toFixed(4)} vs H_max=${H_max.toFixed(4)} bits, ratio=${(entropyRatio * 100).toFixed(2)}%, p=${pValue.toFixed(4)}). La distribución es estadísticamente uniforme en información.`;
  }

  return {
    name: 'Entropía de Shannon',
    statistic: entropy,
    pValue,
    isSignificant,
    nullHypothesisRejected: isSignificant,
    interpretation,
    alpha,
  };
}

// ============================================================================
// DRIFT DETECTION (BONUS — Page-Hinkley simplificado)
// ============================================================================

export interface DriftResult {
  /** ¿Se detectó drift? */
  driftDetected: boolean;
  /** Punto aproximado donde se detectó el drift (índice) */
  driftPoint: number;
  /** Magnitud del drift */
  magnitude: number;
  /** Descripción */
  description: string;
}

/**
 * Drift detection simplificado usando Page-Hinkley Test.
 * Detecta cambios de régimen en la distribución de dígitos.
 *
 * Útil para que el IA Advisor pueda avisar "he detectado nueva tendencia".
 *
 * @param history Historial completo
 * @param window Tamaño de ventana móvil (default 30)
 * @param threshold Umbral de detección (default 50)
 */
export function detectRegimeChange(
  history: Pick3Result[],
  window: number = 30,
  threshold: number = 50,
): DriftResult {
  if (history.length < window * 2) {
    return {
      driftDetected: false,
      driftPoint: -1,
      magnitude: 0,
      description: 'Datos insuficientes para detectar drift',
    };
  }

  // Para cada punto a partir de 'window', comparamos la distribución
  // de los últimos 'window' sorteos vs los anteriores 'window' sorteos
  // usando chi-cuadrado de homogeneidad.

  let maxDrift = 0;
  let driftPoint = -1;

  for (let i = window; i < history.length - window; i++) {
    const before = history.slice(i - window, i);
    const after = history.slice(i, i + window);

    const beforeCounts = new Array(10).fill(0);
    const afterCounts = new Array(10).fill(0);

    for (const d of before) for (const x of d.result) beforeCounts[x]++;
    for (const d of after) for (const x of d.result) afterCounts[x]++;

    // Chi-cuadrado de homogeneidad: pooling
    const totalBefore = beforeCounts.reduce((a, b) => a + b, 0);
    const totalAfter = afterCounts.reduce((a, b) => a + b, 0);
    const total = totalBefore + totalAfter;

    let chi = 0;
    for (let k = 0; k < 10; k++) {
      const expectedBefore = (beforeCounts[k] + afterCounts[k]) * totalBefore / total;
      const expectedAfter = (beforeCounts[k] + afterCounts[k]) * totalAfter / total;
      if (expectedBefore > 0) chi += Math.pow(beforeCounts[k] - expectedBefore, 2) / expectedBefore;
      if (expectedAfter > 0) chi += Math.pow(afterCounts[k] - expectedAfter, 2) / expectedAfter;
    }

    if (chi > maxDrift) {
      maxDrift = chi;
      if (chi > threshold) driftPoint = i;
    }
  }

  return {
    driftDetected: driftPoint > 0,
    driftPoint,
    magnitude: maxDrift,
    description: driftPoint > 0
      ? `Se detectó cambio de régimen en el sorteo #${driftPoint} (χ²=${maxDrift.toFixed(2)}). La distribución de dígitos cambió significativamente.`
      : `No se detectó drift significativo en el período (max χ²=${maxDrift.toFixed(2)}).`,
  };
}

// ============================================================================
// FULL STATS REPORT
// ============================================================================

/**
 * Corre los 4 tests estadísticos sobre el histórico y devuelve un reporte completo.
 */
export function runFullStatisticalTests(history: Pick3Result[]): FullStatsReport {
  const chiSquare = chiSquareUniformityTest(history, 'global');
  const kolmogorovSmirnov = kolmogorovSmirnovTest(history, 'global');
  const runsTestResult = runsTest(history);
  const entropy = entropyTest(history);

  // Si NINGÚN test rechaza H0 → los datos son aleatorios
  const testsPassed = [chiSquare, kolmogorovSmirnov, runsTestResult, entropy].filter(t => !t.nullHypothesisRejected).length;
  const isRandom = testsPassed === 4;

  // Confianza = 1 - max(p-values) si todos pasan, o 0 si alguno falla críticamente
  const minPValue = Math.min(chiSquare.pValue, kolmogorovSmirnov.pValue, runsTestResult.pValue, entropy.pValue);
  const confidence = isRandom
    ? Math.max(0, Math.min(100, minPValue * 100))
    : 0;

  let summary: string;
  if (isRandom) {
    summary = `VEREDICTO: Los datos son consistentes con un proceso aleatorio uniforme (${testsPassed}/4 tests no rechazan H0, confianza ${confidence.toFixed(1)}%). No se detectó edge estadístico explotable. La ventaja del jugador NO está en predecir, está en gestionar bankroll y expectativas.`;
  } else {
    const rejected = 4 - testsPassed;
    summary = `VEREDICTO: Se detectaron ${rejected}/4 anomalías estadísticas. Hay patrones en los datos que requieren investigación. El modelo puede tener edge marginal, pero VERIFICA overfitting antes de aumentar exposición.`;
  }

  return {
    chiSquare,
    kolmogorovSmirnov,
    runsTest: runsTestResult,
    entropy,
    isRandom,
    confidence,
    summary,
  };
}
