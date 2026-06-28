/**
 * Exchange Rate Calculator — Calcula el impacto cambiario (inflación)
 *
 * Toma el costo histórico en moneda original y la tasa de la recepción,
 * lo convierte a la tasa ACTUAL para obtener el costo de reposición.
 *
 * La diferencia entre reposición y histórico es el "impacto inflacionario"
 * que el producto absorbe.
 *
 * Puro, determinístico, sin side effects.
 */

import type { CurrentRate, Currency } from './types';

export interface ExchangeRateResult {
  /** Costo original en moneda de la recepción (ej: USD) */
  cost_in_original_currency: number;
  /** Costo histórico en CUP (lo que costó en su momento) */
  historical_cost_cup: number;
  /** Costo de reposición en CUP (lo que costaría hoy) */
  replacement_cost_cup: number;
  /** Impacto cambiario = reposición - histórico */
  exchange_rate_impact: number;
  /** Impacto inflacionario en gastos financieros */
  inflation_impact: number;
  /** Factor de revalorización (reposición / histórico) */
  fpr: number;
}

/**
 * Calcular el impacto cambiario de un producto.
 *
 * Fórmula:
 *   costo_original_moneda = unit_cost (en moneda_recepcion)
 *   costo_historico_CUP = unit_cost × tasa_recepcion (si moneda ≠ CUP) o unit_cost (si CUP)
 *   costo_reposicion_CUP = costo_original_moneda × tasa_actual
 *   impacto_cambiario = costo_reposicion_CUP - costo_historico_CUP
 *   FPR = costo_reposicion_CUP / costo_historico_CUP
 *
 * Para productos en CUP puro (sin divisa), FPR = 1.0 y impacto = 0.
 *
 * @param unitCost - Costo unitario en moneda_recepcion
 * @param quantity - Cantidad recibida
 * @param receiptCurrency - Moneda de la recepción ('CUP', 'USD', etc.)
 * @param receiptRate - Tasa de cambio usada en la compra (ej: 500 CUP/USD)
 * @param currentRate - Tasa de cambio actual
 * @returns Resultado del cálculo cambiario
 */
export function calculateExchangeRateImpact(
  unitCost: number,
  quantity: number,
  receiptCurrency: Currency,
  receiptRate: number,
  currentRate: CurrentRate | null
): ExchangeRateResult {
  const totalUnits = unitCost * quantity;

  // Si la moneda es CUP, no hay impacto cambiario
  if (receiptCurrency === 'CUP') {
    return {
      cost_in_original_currency: totalUnits,
      historical_cost_cup: round2(totalUnits),
      replacement_cost_cup: round2(totalUnits),
      exchange_rate_impact: 0,
      inflation_impact: 0,
      fpr: 1.0,
    };
  }

  // Si no hay tasa actual disponible, usar la tasa de la recepción (sin impacto)
  if (!currentRate || currentRate.rate <= 0) {
    const historicalCup = totalUnits * receiptRate;
    return {
      cost_in_original_currency: round2(totalUnits),
      historical_cost_cup: round2(historicalCup),
      replacement_cost_cup: round2(historicalCup),
      exchange_rate_impact: 0,
      inflation_impact: 0,
      fpr: 1.0,
    };
  }

  // Costo original en moneda extranjera (ej: USD)
  const costInOriginalCurrency = totalUnits;

  // Costo histórico en CUP (lo que costó cuando se compró)
  const historicalCostCup = costInOriginalCurrency * receiptRate;

  // Costo de reposición en CUP (lo que costaría hoy a la tasa actual)
  const replacementCostCup = costInOriginalCurrency * currentRate.rate;

  // Impacto cambiario = reposición - histórico
  const exchangeRateImpact = replacementCostCup - historicalCostCup;

  // Impacto inflacionario en gastos financieros:
  // Si el producto tiene gastos financieros (ej: préstamo en USD),
  // el impacto es la diferencia de tasa × monto financiero.
  // Por ahora, esto es 0 hasta que se implemente el componente financiero.
  const inflationImpact = 0;

  // FPR = factor de revalorización
  const fpr = historicalCostCup > 0 ? replacementCostCup / historicalCostCup : 1.0;

  return {
    cost_in_original_currency: round2(costInOriginalCurrency),
    historical_cost_cup: round2(historicalCostCup),
    replacement_cost_cup: round2(replacementCostCup),
    exchange_rate_impact: round2(exchangeRateImpact),
    inflation_impact: round2(inflationImpact),
    fpr: round4(fpr),
  };
}

/**
 * Calcular el costo de reposición ponderado para un producto con múltiples recepciones.
 *
 * Pondera por cantidad recibida en cada recepción.
 */
export function calculateWeightedReplacementCost(
  receipts: {
    unit_cost: number;
    quantity: number;
    moneda_recepcion: Currency;
    tasa_cambio_recepcion: number;
  }[],
  currentRate: CurrentRate | null
): { weighted_historical: number; weighted_replacement: number; weighted_fpr: number } {
  if (receipts.length === 0) {
    return { weighted_historical: 0, weighted_replacement: 0, weighted_fpr: 1.0 };
  }

  let totalQty = 0;
  let sumHistoricalCup = 0;
  let sumReplacementCup = 0;

  for (const r of receipts) {
    const result = calculateExchangeRateImpact(
      r.unit_cost,
      r.quantity,
      r.moneda_recepcion,
      r.tasa_cambio_recepcion,
      currentRate
    );
    totalQty += r.quantity;
    sumHistoricalCup += result.historical_cost_cup;
    sumReplacementCup += result.replacement_cost_cup;
  }

  if (totalQty === 0) {
    return { weighted_historical: 0, weighted_replacement: 0, weighted_fpr: 1.0 };
  }

  const weightedHistorical = sumHistoricalCup / totalQty;
  const weightedReplacement = sumReplacementCup / totalQty;
  const weightedFpr = weightedHistorical > 0 ? weightedReplacement / weightedHistorical : 1.0;

  return {
    weighted_historical: round2(weightedHistorical),
    weighted_replacement: round2(weightedReplacement),
    weighted_fpr: round4(weightedFpr),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
