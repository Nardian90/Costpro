/**
 * Types — Sistema de Costeo Dinámico por Absorción
 *
 * Define todas las interfaces del motor de costeo. Estas son puramente
 * analíticas — NO modifican products, inventory, ni Kardex.
 */

export type Currency = 'CUP' | 'USD' | 'EUR' | 'MLC' | string;
export type RateSource = 'BCC_seg1' | 'BCC_seg2' | 'BCC_seg3' | 'elToque' | 'Manual';
export type DistributionMethod = 'quantity' | 'cost_value' | 'weight' | 'manual';
export type RiskLevel = 'muy_bajo' | 'bajo' | 'medio' | 'alto' | 'critico';

export type RoundingRule =
  | 'none' | 'multiple_1' | 'multiple_5' | 'multiple_10'
  | 'multiple_50' | 'multiple_100' | 'multiple_500' | 'multiple_1000';

export type RoundingDirection = 'down' | 'up' | 'nearest';

export interface ReceiptItemInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
  moneda_recepcion: Currency;
  tasa_cambio_recepcion: number;
}

export interface ReceivedServiceInput {
  service_id: string;
  total_amount: number;
  distribution_method: DistributionMethod;
  service_type_name: string;
}

export interface CommissionLinkInput {
  payment_id: string;
  amount: number;
  distribution_method: DistributionMethod;
}

export interface ProductCostInput {
  product_id: string;
  product_name: string;
  store_id: string;
  stock_current: number;
  cost_average: number;
  current_price: number;
  receipts: ReceiptItemInput[];
  services: ReceivedServiceInput[];
  commissions: CommissionLinkInput[];
  weight_per_unit?: number;
}

export interface CurrentRate {
  currency: Currency;
  rate: number;
  source: RateSource;
  date: string;
}

export interface CostEngineConfig {
  min_margin: number;
  target_margin: number;
  rounding_rule: RoundingRule;
  rounding_direction: RoundingDirection;
  rate_source: RateSource;
  manual_rate?: CurrentRate | null;
}

export interface CostBreakdown {
  base_cost: number;
  transport_cost: number;
  manipulation_cost: number;
  other_services_cost: number;
  commission_cost: number;
  exchange_rate_impact: number;
  inflation_impact: number;
  total_real_cost: number;
}

export interface ProductCostResult {
  product_id: string;
  product_name: string;
  stock_current: number;
  breakdown: CostBreakdown;
  historical_cost: number;
  replacement_cost: number;
  current_price: number;
  current_margin: number;
  current_margin_pct: number;
  suggested_price: number;
  suggested_margin_pct: number;
  fpr: number;
  risk: RiskLevel;
  cost_increase_pct: number;
  potential_loss: number;
}

export interface DashboardSummary {
  total_products: number;
  total_historical_value: number;
  total_replacement_value: number;
  capital_additional_needed: number;
  increase_absolute: number;
  increase_pct: number;
  products_by_risk: Record<RiskLevel, number>;
  products_negative_margin: number;
  products_need_immediate_update: number;
  average_margin_pct: number;
  total_potential_loss: number;
}
