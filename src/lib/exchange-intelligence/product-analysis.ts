/**
 * product-analysis.ts — Cálculos puros de «Mi Producto» (IC-UX-HISTORY-004 §3).
 *
 * MISIÓN IC-UX-HISTORY-004: «Mi producto» pasa a ser la HERRAMIENTA PRINCIPAL
 * para analizar el efecto de la variación cambiaria sobre un producto. Las
 * fórmulas YA EXISTÍAN (tab «Mi Producto» + antigua «Impacto Precios»,
 * eliminada por duplicar la finalidad — misión §2); este módulo las
 * CENTRALIZA sin cambiarlas, para poder probar su exactitud de forma
 * aislada y evitar duplicar la lógica en dos vistas.
 *
 * FÓRMULAS (conservadas verbatim de las vistas originales):
 *   costoX        = USD × tasa(X)                    [conversión del costo]
 *   precioVenta   = costoCompra × (1 + margen/100)   [precio fijado en su día]
 *   costoHoy      = USD × tasaHoy                    [reposición]
 *   utilidadReal  = precioVenta − costoHoy           [por unidad]
 *   margenReal%   = utilidadReal / costoHoy × 100
 *   precioRecHoy  = costoHoy × (1 + margen/100)      [para mantener el margen]
 *   ajuste        = precioRecHoy − precioVenta       [Δ necesario, con signo]
 *   proyección    = regresión lineal mínimos cuadrados y = m·x + b sobre las
 *                   observaciones visibles (mín. 5 muestras); confiable si
 *                   R² ≥ 0.4 (media), alta si ≥ 0.7 (mismo umbral que las
 *                   vistas originales).
 *
 * Diferenciación de valores (misión §3: «Diferencia valores introducidos por
 * el usuario, valores leídos del sistema y resultados calculados»):
 *   - introducidos por el usuario: costUsd, marginPct, unitsPerMonth,
 *     forecastDays, purchaseDateIdx;
 *   - leídos del sistema: purchaseRate, currentRate, forecastRate (de la
 *     serie histórica);
 *   - calculados: TODO el resultado de computeProductAnalysis.
 *
 * Módulo PURO (sin React ni efectos) — determinista para las mismas
 * entradas; la memoización de la vista solo depende de [serie, escenario],
 * NO de campos no relacionados (misión §3 rendimiento: editar el nombre del
 * producto no recalcula la serie ni la regresión).
 */

export interface ProductAnalysisInput {
  /** Costo del producto en USD (usuario). */
  costUsd: number;
  /** Tasa (CUP/USD) en la fecha de compra (sistema). */
  purchaseRate: number;
  /** Tasa vigente del escenario seleccionado (sistema). */
  currentRate: number;
  /** Tasa proyectada a forecastDays (regresión; null si no hay modelo). */
  forecastRate: number | null;
  /** Días de la proyección (usuario). */
  forecastDays: number;
  /** Margen deseado sobre el costo, % (usuario). */
  marginPct: number;
  /** Unidades vendidas al mes (usuario) — proyección de pérdida mensual. */
  unitsPerMonth: number;
}

export interface ProductAnalysisResult {
  // ── Compra (fecha seleccionada) ──
  /** Costo convertido en la compra: USD × tasa(compra) [CUP]. */
  costAtPurchaseCup: number;
  /** Precio de venta fijado entonces: costo compra × (1 + margen) [CUP]. */
  salePriceSetCup: number;
  // ── Hoy (tasa vigente del escenario) ──
  /** Costo de reposición hoy: USD × tasa(hoy) [CUP]. */
  costNowCup: number;
  /** Precio recomendado hoy para mantener el margen [CUP]. */
  recommendedPriceNowCup: number;
  /** Utilidad real por unidad si vende al precio fijado [CUP, con signo]. */
  realUtilityPerUnitCup: number;
  /** Margen real sobre el costo de reposición hoy [%]. */
  realMarginPct: number;
  /** Ajuste de precio necesario: recomendado hoy − fijado [CUP, con signo]. */
  priceAdjustmentCup: number;
  /** Ajuste de precio necesario [% sobre el precio fijado, con signo]. */
  priceAdjustmentPct: number;
  /** ¿Vende por debajo de la reposición? (pérdida por unidad). */
  isLosing: boolean;
  /** Pérdida mensual si mantiene el precio fijado [CUP/mes, ≥0]. */
  monthlyLossCup: number;
  // ── Variación desde la compra ──
  /** Δ costo de reposición desde la compra [CUP, con signo]. */
  costChangeCup: number;
  /** Δ % del costo de reposición desde la compra [con signo]. */
  costChangePct: number;
  // ── Proyección (regresión; valores null cuando no hay modelo) ──
  /** Costo proyectado a forecastDays [CUP | null]. */
  costFutureCup: number | null;
  /** Precio recomendado proyectado a forecastDays [CUP | null]. */
  recommendedPriceFutureCup: number | null;
  /** Δ % del costo proyectado vs hoy [con signo | null]. */
  costChangeFuturePct: number | null;
  /** ¿Hay proyección disponible (aunque su confianza sea baja)? */
  hasForecast: boolean;
}

/** Umbral de R² a partir del cual la proyección se muestra (mismo criterio
 * que las vistas originales: 0.4 media, 0.7 alta). */
export const FORECAST_R2_MIN = 0.4;
export const FORECAST_R2_HIGH = 0.7;

/**
 * Regresión lineal por mínimos cuadrados idéntica a la de las vistas
 * originales (misma fórmula, extraída para probarla): y = m·x + b sobre los
 * índices de las observaciones. Devuelve null con <5 muestras (mismo mínimo
 * que las vistas) o si la recta es indeterminada (denominador 0).
 */
export interface LinearModel {
  slope: number;
  intercept: number;
  r2: number;
  /** Tasa proyectada a `daysAhead` días de la última observación. */
  projected: (daysAhead: number) => number;
}

export function linearRegression(values: number[]): LinearModel | null {
  if (values.length < 5) return null;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const projectedFn = (daysAhead: number) => slope * (n - 1 + daysAhead) + intercept;
  return { slope, intercept, r2, projected: projectedFn };
}

/**
 * Cálculo central de «Mi Producto». Todas las salidas se derivan de las
 * entradas con las fórmulas documentadas arriba — sin supuestos silenciosos
 * ni datos inventados: si falta la tasa vigente la vista NO llama a esta
 * función (estado «sin dato fiable»), y sin modelo de proyección los campos
 * future quedan null.
 */
export function computeProductAnalysis(input: ProductAnalysisInput): ProductAnalysisResult {
  const { costUsd, purchaseRate, currentRate, forecastRate, marginPct, unitsPerMonth } = input;

  const costAtPurchaseCup = costUsd * purchaseRate;
  const salePriceSetCup = costAtPurchaseCup * (1 + marginPct / 100);

  const costNowCup = costUsd * currentRate;
  const recommendedPriceNowCup = costNowCup * (1 + marginPct / 100);

  const realUtilityPerUnitCup = salePriceSetCup - costNowCup;
  const realMarginPct = costNowCup > 0 ? (realUtilityPerUnitCup / costNowCup) * 100 : 0;

  const priceAdjustmentCup = recommendedPriceNowCup - salePriceSetCup;
  const priceAdjustmentPct = salePriceSetCup > 0 ? (priceAdjustmentCup / salePriceSetCup) * 100 : 0;

  const isLosing = realUtilityPerUnitCup < 0;
  // Pérdida mensual solo si hay pérdida (con ganancia es 0, no negativo).
  const monthlyLossCup = isLosing ? Math.abs(realUtilityPerUnitCup) * Math.max(0, unitsPerMonth) : 0;

  const costChangeCup = costNowCup - costAtPurchaseCup;
  const costChangePct = costAtPurchaseCup > 0 ? (costChangeCup / costAtPurchaseCup) * 100 : 0;

  const hasForecast = forecastRate != null && Number.isFinite(forecastRate);
  const costFutureCup = hasForecast ? costUsd * (forecastRate as number) : null;
  const recommendedPriceFutureCup = hasForecast
    ? (costFutureCup as number) * (1 + marginPct / 100)
    : null;
  const costChangeFuturePct =
    hasForecast && costNowCup > 0
      ? (((costFutureCup as number) - costNowCup) / costNowCup) * 100
      : null;

  return {
    costAtPurchaseCup,
    salePriceSetCup,
    costNowCup,
    recommendedPriceNowCup,
    realUtilityPerUnitCup,
    realMarginPct,
    priceAdjustmentCup,
    priceAdjustmentPct,
    isLosing,
    monthlyLossCup,
    costChangeCup,
    costChangePct,
    costFutureCup,
    recommendedPriceFutureCup,
    costChangeFuturePct,
    hasForecast,
  };
}
