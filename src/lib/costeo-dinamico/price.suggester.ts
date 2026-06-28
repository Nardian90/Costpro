/**
 * Price Suggester — Calcula precio sugerido con margen + redondeo
 *
 * Toma el costo real total, aplica el margen objetivo y redondea
 * según la regla configurada.
 *
 * Puro, determinístico, sin side effects.
 */

import type { RoundingRule, RoundingDirection } from './types';

export interface PriceSuggestionInput {
  /** Costo real total del producto */
  real_cost: number;
  /** Margen objetivo (ej: 0.30 = 30%) */
  target_margin: number;
  /** Regla de redondeo */
  rounding_rule: RoundingRule;
  /** Dirección de redondeo */
  rounding_direction: RoundingDirection;
  /** Precio actual (para comparar) */
  current_price: number;
}

export interface PriceSuggestionResult {
  /** Precio calculado antes de redondear */
  raw_price: number;
  /** Precio sugerido después de redondear */
  suggested_price: number;
  /** Margen con el precio sugerido */
  suggested_margin_pct: number;
  /** Diferencia respecto al precio actual */
  price_change: number;
  /** Porcentaje de cambio */
  price_change_pct: number;
}

/**
 * Calcular el precio sugerido para un producto.
 *
 * Fórmula:
 *   raw_price = real_cost × (1 + target_margin)
 *   suggested_price = applyRounding(raw_price, rule, direction)
 *   suggested_margin = (suggested_price - real_cost) / real_cost
 *
 * @example
 * suggestPrice({ real_cost: 500, target_margin: 0.30, rounding_rule: 'multiple_10', rounding_direction: 'nearest', current_price: 400 })
 * // raw_price = 500 × 1.30 = 650
 * // suggested_price = 650 (ya es múltiplo de 10)
 * // suggested_margin = (650 - 500) / 500 = 0.30 = 30%
 */
export function suggestPrice(input: PriceSuggestionInput): PriceSuggestionResult {
  const { real_cost, target_margin, rounding_rule, rounding_direction, current_price } = input;

  // Si el costo es 0, no se puede sugerir precio
  if (real_cost <= 0) {
    return {
      raw_price: 0,
      suggested_price: current_price,
      suggested_margin_pct: 0,
      price_change: 0,
      price_change_pct: 0,
    };
  }

  // Calcular precio crudo
  const rawPrice = round2(real_cost * (1 + target_margin));

  // Aplicar redondeo
  const suggestedPrice = applyRounding(rawPrice, rounding_rule, rounding_direction);

  // Calcular margen con precio sugerido
  const suggestedMarginPct = (suggestedPrice - real_cost) / real_cost;

  // Diferencia con precio actual
  const priceChange = suggestedPrice - current_price;
  const priceChangePct = current_price > 0 ? (priceChange / current_price) : 0;

  return {
    raw_price: rawPrice,
    suggested_price: round2(suggestedPrice),
    suggested_margin_pct: round4(suggestedMarginPct),
    price_change: round2(priceChange),
    price_change_pct: round4(priceChangePct),
  };
}

/**
 * Aplicar regla de redondeo a un precio.
 */
export function applyRounding(
  price: number,
  rule: RoundingRule,
  direction: RoundingDirection
): number {
  if (rule === 'none' || price <= 0) {
    return price;
  }

  const multiple = getMultiple(rule);
  if (multiple <= 0) return price;

  switch (direction) {
    case 'down':
      return Math.floor(price / multiple) * multiple;
    case 'up':
      return Math.ceil(price / multiple) * multiple;
    case 'nearest':
    default:
      return Math.round(price / multiple) * multiple;
  }
}

/**
 * Obtener el múltiplo numérico de una regla.
 */
function getMultiple(rule: RoundingRule): number {
  switch (rule) {
    case 'none': return 0;
    case 'multiple_1': return 1;
    case 'multiple_5': return 5;
    case 'multiple_10': return 10;
    case 'multiple_50': return 50;
    case 'multiple_100': return 100;
    case 'multiple_500': return 500;
    case 'multiple_1000': return 1000;
    default: return 0;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
