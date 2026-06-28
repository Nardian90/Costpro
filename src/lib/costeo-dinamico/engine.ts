/**
 * Engine — Orquestador del Sistema de Costeo Dinámico
 *
 * Toma los datos de entrada (producto + recepciones + servicios + comisiones + tasa actual)
 * y produce el resultado completo: desglose de costo, FPR, riesgo, precio sugerido.
 *
 * Puro, determinístico, sin side effects. NO modifica products, inventory, ni Kardex.
 */

import type {
  ProductCostInput,
  ProductCostResult,
  CostEngineConfig,
  CurrentRate,
  CostBreakdown,
  DashboardSummary,
  RiskLevel,
} from './types';
import { calculateAbsorption } from './absorption.calculator';
import { calculateWeightedReplacementCost } from './exchange-rate.calculator';
import { classifyRisk } from './risk.classifier';
import { suggestPrice } from './price.suggester';

/**
 * Calcular el costo real total de un producto.
 *
 * Flujo:
 *   1. Calcular absorción (base + servicios + comisiones)
 *   2. Calcular impacto cambiario (reposición vs histórico)
 *   3. Sumar todo → costo real total
 *   4. Calcular FPR, margen, riesgo
 *   5. Sugerir precio
 */
export function calculateProductCost(
  input: ProductCostInput,
  config: CostEngineConfig,
  currentRate: CurrentRate | null
): ProductCostResult {
  const { product_id, product_name, stock_current, cost_average, current_price, receipts, services, commissions } = input;

  // 1. Absorción de costos indirectos
  const absorption = calculateAbsorption(product_id, receipts, services, commissions);

  // 2. Impacto cambiario (ponderado por cantidad de recepciones)
  const exchangeResult = calculateWeightedReplacementCost(
    receipts.map(r => ({
      unit_cost: r.unit_cost,
      quantity: r.quantity,
      moneda_recepcion: r.moneda_recepcion,
      tasa_cambio_recepcion: r.tasa_cambio_recepcion,
    })),
    currentRate
  );

  // FIX: calculateWeightedReplacementCost returns PER-UNIT values.
  // Engine needs TOTAL values. Multiply by total quantity.
  const totalQty = receipts.reduce((sum, r) => sum + r.quantity, 0);
  const historicalCost = exchangeResult.weighted_historical * totalQty;
  const replacementCost = exchangeResult.weighted_replacement * totalQty;
  const exchangeRateImpact = replacementCost - historicalCost;

  const totalRealCost = absorption.base_cost + absorption.total_absorbed + exchangeRateImpact;

  const breakdown: CostBreakdown = {
    base_cost: absorption.base_cost,
    transport_cost: absorption.transport_cost,
    manipulation_cost: absorption.manipulation_cost,
    other_services_cost: absorption.other_services_cost,
    commission_cost: absorption.commission_cost,
    exchange_rate_impact: round2(exchangeRateImpact),
    inflation_impact: 0, // TODO: implementar componente financiero
    total_real_cost: round2(totalRealCost),
  };

  // 4. FPR y métricas
  const fpr = historicalCost > 0 ? replacementCost / historicalCost : 1.0;
  const costIncreasePct = historicalCost > 0 ? (replacementCost - historicalCost) / historicalCost : 0;

  // Margen actual (basado en costo real)
  const currentMargin = current_price - totalRealCost;
  const currentMarginPct = totalRealCost > 0 ? currentMargin / totalRealCost : 0;

  // 5. Clasificación de riesgo
  const risk = classifyRisk({
    fpr,
    current_margin_pct: currentMarginPct,
    min_margin: config.min_margin,
  });

  // 6. Precio sugerido
  const suggestion = suggestPrice({
    real_cost: totalRealCost,
    target_margin: config.target_margin,
    rounding_rule: config.rounding_rule,
    rounding_direction: config.rounding_direction,
    current_price,
  });

  // 7. Pérdida potencial (si no se actualiza el precio)
  const potentialLoss = totalRealCost > current_price ? (totalRealCost - current_price) * stock_current : 0;

  return {
    product_id,
    product_name,
    stock_current,
    breakdown,
    historical_cost: round2(historicalCost),
    replacement_cost: round2(replacementCost),
    current_price,
    current_margin: round2(currentMargin),
    current_margin_pct: round4(currentMarginPct),
    suggested_price: suggestion.suggested_price,
    suggested_margin_pct: suggestion.suggested_margin_pct,
    fpr: round4(fpr),
    risk,
    cost_increase_pct: round4(costIncreasePct),
    potential_loss: round2(potentialLoss),
  };
}

/**
 * Calcular el dashboard agregado a partir de los resultados de múltiples productos.
 */
export function calculateDashboard(results: ProductCostResult[]): DashboardSummary {
  if (results.length === 0) {
    return {
      total_products: 0,
      total_historical_value: 0,
      total_replacement_value: 0,
      capital_additional_needed: 0,
      increase_absolute: 0,
      increase_pct: 0,
      products_by_risk: { muy_bajo: 0, bajo: 0, medio: 0, alto: 0, critico: 0 },
      products_negative_margin: 0,
      products_need_immediate_update: 0,
      average_margin_pct: 0,
      total_potential_loss: 0,
    };
  }

  let totalHistorical = 0;
  let totalReplacement = 0;
  let totalPotentialLoss = 0;
  let sumMarginPct = 0;
  let negativeMarginCount = 0;
  let immediateUpdateCount = 0;

  const riskCounts: Record<RiskLevel, number> = { muy_bajo: 0, bajo: 0, medio: 0, alto: 0, critico: 0 };

  for (const r of results) {
    const historicalValue = r.historical_cost * r.stock_current;
    const replacementValue = r.replacement_cost * r.stock_current;

    totalHistorical += historicalValue;
    totalReplacement += replacementValue;
    totalPotentialLoss += r.potential_loss;
    sumMarginPct += r.current_margin_pct;

    if (r.current_margin_pct < 0) negativeMarginCount++;
    if (r.risk === 'alto' || r.risk === 'critico') immediateUpdateCount++;

    riskCounts[r.risk]++;
  }

  const increaseAbsolute = totalReplacement - totalHistorical;
  const increasePct = totalHistorical > 0 ? increaseAbsolute / totalHistorical : 0;

  return {
    total_products: results.length,
    total_historical_value: round2(totalHistorical),
    total_replacement_value: round2(totalReplacement),
    capital_additional_needed: round2(increaseAbsolute),
    increase_absolute: round2(increaseAbsolute),
    increase_pct: round4(increasePct),
    products_by_risk: riskCounts,
    products_negative_margin: negativeMarginCount,
    products_need_immediate_update: immediateUpdateCount,
    average_margin_pct: round4(sumMarginPct / results.length),
    total_potential_loss: round2(totalPotentialLoss),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
