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
 *
 * FIX-P2.1: Migrado a Decimal.js para precisión monetaria estricta.
 * Antes usaba Math.round(n * 100) / 100 que acumula error de coma flotante
 * en operaciones encadenadas (ej: sumHistoricalCup += result en loops).
 */

import Decimal from 'decimal.js';
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
  // FIX-P2.1: usar Decimal para precisión monetaria
  const dUnitCost = new Decimal(unitCost);
  const dQuantity = new Decimal(quantity);
  const dReceiptRate = new Decimal(receiptRate);
  const totalUnits = dUnitCost.times(dQuantity);

  // Si la moneda es CUP, no hay impacto cambiario
  if (receiptCurrency === 'CUP') {
    return {
      cost_in_original_currency: totalUnits.toNumber(),
      historical_cost_cup: round2(totalUnits),
      replacement_cost_cup: round2(totalUnits),
      exchange_rate_impact: 0,
      inflation_impact: 0,
      fpr: 1.0,
    };
  }

  // Si no hay tasa actual disponible, usar la tasa de la recepción (sin impacto)
  if (!currentRate || currentRate.rate <= 0) {
    const historicalCup = totalUnits.times(dReceiptRate);
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
  const historicalCostCup = costInOriginalCurrency.times(dReceiptRate);

  // Costo de reposición en CUP (lo que costaría hoy a la tasa actual)
  const dCurrentRate = new Decimal(currentRate.rate);
  const replacementCostCup = costInOriginalCurrency.times(dCurrentRate);

  // Impacto cambiario = reposición - histórico
  const exchangeRateImpact = replacementCostCup.minus(historicalCostCup);

  // Impacto inflacionario en gastos financieros:
  // Si el producto tiene gastos financieros (ej: préstamo en USD),
  // el impacto es la diferencia de tasa × monto financiero.
  // Por ahora, esto es 0 hasta que se implemente el componente financiero.
  const inflationImpact = new Decimal(0);

  // FPR = factor de revalorización
  const fpr = historicalCostCup.gt(0)
    ? replacementCostCup.div(historicalCostCup)
    : new Decimal(1.0);

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

  // FIX-P2.1: acumular con Decimal para evitar error de coma flotante
  let dTotalQty = new Decimal(0);
  let dSumHistorical = new Decimal(0);
  let dSumReplacement = new Decimal(0);

  for (const r of receipts) {
    const result = calculateExchangeRateImpact(
      r.unit_cost,
      r.quantity,
      r.moneda_recepcion,
      r.tasa_cambio_recepcion,
      currentRate
    );
    dTotalQty = dTotalQty.plus(r.quantity);
    dSumHistorical = dSumHistorical.plus(result.historical_cost_cup);
    dSumReplacement = dSumReplacement.plus(result.replacement_cost_cup);
  }

  if (dTotalQty.eq(0)) {
    return { weighted_historical: 0, weighted_replacement: 0, weighted_fpr: 1.0 };
  }

  const dWeightedHistorical = dSumHistorical.div(dTotalQty);
  const dWeightedReplacement = dSumReplacement.div(dTotalQty);
  const dWeightedFpr = dWeightedHistorical.gt(0)
    ? dWeightedReplacement.div(dWeightedHistorical)
    : new Decimal(1.0);

  return {
    weighted_historical: round2(dWeightedHistorical),
    weighted_replacement: round2(dWeightedReplacement),
    weighted_fpr: round4(dWeightedFpr),
  };
}

// FIX-P2.1: round2/round4 ahora aceptan Decimal o number
function round2(n: Decimal | number): number {
  const d = n instanceof Decimal ? n : new Decimal(n);
  return d.toDecimalPlaces(2).toNumber();
}

function round4(n: Decimal | number): number {
  const d = n instanceof Decimal ? n : new Decimal(n);
  return d.toDecimalPlaces(4).toNumber();
}
