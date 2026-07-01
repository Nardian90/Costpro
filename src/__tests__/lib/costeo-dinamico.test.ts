import { describe, it, expect } from 'vitest';
import { distributeCost, type DistributionItem } from '@/lib/costeo-dinamico/distribution.methods';
import { calculateAbsorption } from '@/lib/costeo-dinamico/absorption.calculator';
import { calculateExchangeRateImpact, calculateWeightedReplacementCost } from '@/lib/costeo-dinamico/exchange-rate.calculator';
import { classifyRisk, getRiskLabel } from '@/lib/costeo-dinamico/risk.classifier';
import { suggestPrice, applyRounding } from '@/lib/costeo-dinamico/price.suggester';
import { calculateProductCost, calculateDashboard } from '@/lib/costeo-dinamico/engine';
import type { ProductCostInput, CostEngineConfig, CurrentRate } from '@/lib/costeo-dinamico/types';

describe('distributeCost', () => {
  const items: DistributionItem[] = [
    { product_id: 'p1', quantity: 10, unit_cost: 100 },
    { product_id: 'p2', quantity: 20, unit_cost: 50 },
  ];
  it('by quantity', () => {
    const r = distributeCost(600, items, 'quantity');
    expect(r.get('p1')).toBe(200); expect(r.get('p2')).toBe(400);
  });
  it('by cost_value (default)', () => {
    const r = distributeCost(600, items, 'cost_value');
    // p1=10×100=1000, p2=20×50=1000 → 50%/50%
    expect(r.get('p1')).toBe(300); expect(r.get('p2')).toBe(300);
  });
  it('by weight', () => {
    const items2 = [{ product_id: 'p1', quantity: 10, unit_cost: 100, weight: 5 }];
    expect(distributeCost(500, items2, 'weight').get('p1')).toBe(500);
  });
  it('handles zero amount', () => {
    expect(distributeCost(0, items, 'cost_value').get('p1')).toBe(0);
  });
  it('handles empty items', () => {
    expect(distributeCost(1000, [], 'cost_value').size).toBe(0);
  });
});

describe('calculateAbsorption', () => {
  it('base cost CUP', () => {
    const r = calculateAbsorption('p1', [{ product_id: 'p1', quantity: 10, unit_cost: 100, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }], [], []);
    expect(r.base_cost).toBe(1000);
  });
  it('base cost USD converted', () => {
    const r = calculateAbsorption('p1', [{ product_id: 'p1', quantity: 5, unit_cost: 10, moneda_recepcion: 'USD', tasa_cambio_recepcion: 500 }], [], []);
    expect(r.base_cost).toBe(25000);
  });
  it('transport classified', () => {
    const r = calculateAbsorption('p1', [], [{ service_id: 's1', total_amount: 500, distribution_method: 'cost_value', service_type_name: 'Transportación' }], []);
    expect(r.transport_cost).toBe(500);
  });
  it('manipulation classified', () => {
    const r = calculateAbsorption('p1', [], [{ service_id: 's1', total_amount: 300, distribution_method: 'cost_value', service_type_name: 'Manipulación' }], []);
    expect(r.manipulation_cost).toBe(300);
  });
  it('commissions absorbed', () => {
    const r = calculateAbsorption('p1', [], [], [{ payment_id: 'c1', amount: 750, distribution_method: 'cost_value' }]);
    expect(r.commission_cost).toBe(750);
  });
});

describe('calculateExchangeRateImpact', () => {
  it('CUP = FPR 1.0', () => {
    const r = calculateExchangeRateImpact(100, 10, 'CUP', 1, { currency: 'USD', rate: 500, source: 'BCC_seg3', date: '2026-06-29' });
    expect(r.fpr).toBe(1.0); expect(r.exchange_rate_impact).toBe(0);
  });
  it('USD appreciated', () => {
    const r = calculateExchangeRateImpact(10, 5, 'USD', 500, { currency: 'USD', rate: 600, source: 'elToque', date: '2026-06-29' });
    expect(r.historical_cost_cup).toBe(25000);
    expect(r.replacement_cost_cup).toBe(30000);
    expect(r.exchange_rate_impact).toBe(5000);
    expect(r.fpr).toBeCloseTo(1.2, 2);
  });
  it('null rate = FPR 1.0', () => {
    expect(calculateExchangeRateImpact(10, 5, 'USD', 500, null).fpr).toBe(1.0);
  });
  it('zero cost', () => {
    expect(calculateExchangeRateImpact(0, 10, 'USD', 500, { currency: 'USD', rate: 600, source: 'Manual', date: '2026-06-29' }).fpr).toBe(1.0);
  });
});

describe('calculateWeightedReplacementCost', () => {
  it('weights by quantity', () => {
    const r = calculateWeightedReplacementCost([
      { unit_cost: 10, quantity: 10, moneda_recepcion: 'USD', tasa_cambio_recepcion: 500 },
      { unit_cost: 10, quantity: 20, moneda_recepcion: 'USD', tasa_cambio_recepcion: 600 },
    ], { currency: 'USD', rate: 700, source: 'elToque', date: '2026-06-29' });
    expect(r.weighted_historical).toBeCloseTo(5666.67, 0);
    expect(r.weighted_replacement).toBeCloseTo(7000, 0);
  });
  it('empty = FPR 1.0', () => {
    expect(calculateWeightedReplacementCost([], null).weighted_fpr).toBe(1.0);
  });
});

describe('classifyRisk', () => {
  it('FPR<1.10=muy_bajo', () => { expect(classifyRisk({ fpr: 1.05, current_margin_pct: 0.30, min_margin: 0.15 })).toBe('muy_bajo'); });
  it('FPR<1.25=bajo', () => { expect(classifyRisk({ fpr: 1.20, current_margin_pct: 0.30, min_margin: 0.15 })).toBe('bajo'); });
  it('FPR<1.50=medio', () => { expect(classifyRisk({ fpr: 1.40, current_margin_pct: 0.30, min_margin: 0.15 })).toBe('medio'); });
  it('FPR<2.00=alto', () => { expect(classifyRisk({ fpr: 1.80, current_margin_pct: 0.30, min_margin: 0.15 })).toBe('alto'); });
  it('FPR>=2.00=critico', () => { expect(classifyRisk({ fpr: 2.50, current_margin_pct: 0.30, min_margin: 0.15 })).toBe('critico'); });
  it('bump 1 when margin<min', () => { expect(classifyRisk({ fpr: 1.05, current_margin_pct: 0.10, min_margin: 0.15 })).toBe('bajo'); });
  it('bump 2 when margin<0', () => { expect(classifyRisk({ fpr: 1.20, current_margin_pct: -0.05, min_margin: 0.15 })).toBe('alto'); });
  it('caps at critico', () => { expect(classifyRisk({ fpr: 1.80, current_margin_pct: -0.50, min_margin: 0.15 })).toBe('critico'); });
});

describe('suggestPrice', () => {
  it('raw price = cost × (1+margin)', () => {
    const r = suggestPrice({ real_cost: 500, target_margin: 0.30, rounding_rule: 'none', rounding_direction: 'nearest', current_price: 400 });
    expect(r.raw_price).toBe(650); expect(r.suggested_margin_pct).toBeCloseTo(0.30, 2);
  });
  it('rounds nearest 10', () => {
    expect(suggestPrice({ real_cost: 503, target_margin: 0.30, rounding_rule: 'multiple_10', rounding_direction: 'nearest', current_price: 400 }).suggested_price).toBe(650);
  });
  it('rounds up 100', () => {
    expect(suggestPrice({ real_cost: 1420, target_margin: 0.30, rounding_rule: 'multiple_100', rounding_direction: 'up', current_price: 1000 }).suggested_price).toBe(1900);
  });
  it('rounds down 50', () => {
    expect(suggestPrice({ real_cost: 380, target_margin: 0.30, rounding_rule: 'multiple_50', rounding_direction: 'down', current_price: 300 }).suggested_price).toBe(450);
  });
  it('zero cost keeps current', () => {
    const r = suggestPrice({ real_cost: 0, target_margin: 0.30, rounding_rule: 'none', rounding_direction: 'nearest', current_price: 100 });
    expect(r.suggested_price).toBe(100);
  });
  it('calculates change', () => {
    const r = suggestPrice({ real_cost: 500, target_margin: 0.30, rounding_rule: 'none', rounding_direction: 'nearest', current_price: 400 });
    expect(r.price_change).toBe(250);
  });
});

describe('applyRounding', () => {
  it('none = passthrough', () => { expect(applyRounding(653.9, 'none', 'nearest')).toBe(653.9); });
  it('nearest 1000', () => { expect(applyRounding(1842, 'multiple_1000', 'nearest')).toBe(2000); });
});

describe('calculateProductCost (engine)', () => {
  const config: CostEngineConfig = { min_margin: 0.15, target_margin: 0.30, rounding_rule: 'multiple_10', rounding_direction: 'nearest', rate_source: 'BCC_seg3', manual_rate: null };
  it('full breakdown USD product', () => {
    const input: ProductCostInput = {
      product_id: 'p1', product_name: 'Test', store_id: 's1', stock_current: 100, cost_average: 5000, current_price: 6000,
      receipts: [{ product_id: 'p1', quantity: 10, unit_cost: 10, moneda_recepcion: 'USD', tasa_cambio_recepcion: 500 }],
      services: [{ service_id: 's1', total_amount: 500, distribution_method: 'cost_value', service_type_name: 'Transportación' }],
      commissions: [{ payment_id: 'c1', amount: 300, distribution_method: 'cost_value' }],
    };
    const rate: CurrentRate = { currency: 'USD', rate: 600, source: 'elToque', date: '2026-06-29' };
    const r = calculateProductCost(input, config, rate);
    expect(r.breakdown.base_cost).toBe(50000);
    expect(r.breakdown.transport_cost).toBe(500);
    expect(r.breakdown.commission_cost).toBe(300);
    expect(r.breakdown.exchange_rate_impact).toBe(10000);
    expect(r.breakdown.total_real_cost).toBe(60800);
    expect(r.fpr).toBeCloseTo(1.2, 2);
  });
  it('CUP product FPR=1.0', () => {
    const input: ProductCostInput = {
      product_id: 'p2', product_name: 'CUP', store_id: 's1', stock_current: 50, cost_average: 100, current_price: 150,
      receipts: [{ product_id: 'p2', quantity: 50, unit_cost: 100, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }],
      services: [], commissions: [],
    };
    expect(calculateProductCost(input, config, null).fpr).toBe(1.0);
  });
});

describe('calculateDashboard', () => {
  it('empty', () => { expect(calculateDashboard([]).total_products).toBe(0); });
  it('aggregates', () => {
    const results = [
      { product_id: 'p1', product_name: 'A', stock_current: 10, breakdown: {} as any, historical_cost: 100, replacement_cost: 120, current_price: 130, current_margin: 10, current_margin_pct: 0.077, suggested_price: 156, suggested_margin_pct: 0.30, fpr: 1.2, risk: 'bajo' as const, cost_increase_pct: 0.20, potential_loss: 0 },
      { product_id: 'p2', product_name: 'B', stock_current: 20, breakdown: {} as any, historical_cost: 50, replacement_cost: 80, current_price: 60, current_margin: -20, current_margin_pct: -0.25, suggested_price: 104, suggested_margin_pct: 0.30, fpr: 1.6, risk: 'alto' as const, cost_increase_pct: 0.60, potential_loss: 400 },
    ];
    const d = calculateDashboard(results);
    expect(d.total_products).toBe(2);
    expect(d.total_historical_value).toBe(2000);
    expect(d.total_replacement_value).toBe(2800);
    expect(d.products_negative_margin).toBe(1);
    expect(d.total_potential_loss).toBe(400);
  });
});
