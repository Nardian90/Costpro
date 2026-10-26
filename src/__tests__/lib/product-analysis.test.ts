/**
 * product-analysis.test.ts — Exactitud de las fórmulas de «Mi Producto»
 * (misión IC-UX-HISTORY-004 §3, 2026-10-26).
 *
 * Las fórmulas EXISTÍAN repartidas (y duplicadas) entre la pestaña
 * «Mi Producto» y la antigua «Impacto Precios» — eliminada por duplicar
 * la finalidad (misión §2). Este módulo las CENTRALIZÓ verbatim; estas
 * pruebas fijan su exactitud numérica para que ninguna vista vuelva a
 * reimplementarlas (divergencia = bug).
 *
 * CONTRATO numérico (mismas fórmulas de las vistas originales):
 *   costoX        = USD × tasa(X)
 *   precioVenta   = costoCompra × (1 + margen/100)
 *   costoHoy      = USD × tasaHoy
 *   utilidadReal  = precioVenta − costoHoy
 *   margenReal%   = utilidadReal / costoHoy × 100
 *   precioRecHoy  = costoHoy × (1 + margen/100)
 *   ajuste        = precioRecHoy − precioVenta (con signo)
 *   pérdidaMes    = |utilidad| × unidades (solo si hay pérdida)
 *   proyección    = regresión y = m·x + b (mín. 5 muestras); confiable
 *                   desde R² ≥ 0.4 (FORECAST_R2_MIN).
 */
import { describe, it, expect } from 'vitest';
import {
  computeProductAnalysis,
  linearRegression,
  FORECAST_R2_MIN,
  FORECAST_R2_HIGH,
} from '@/lib/exchange-intelligence/product-analysis';

const baseInput = {
  costUsd: 10,
  purchaseRate: 400,
  currentRate: 840,
  forecastRate: 900 as number | null,
  forecastDays: 7,
  marginPct: 30,
  unitsPerMonth: 100,
};

describe('computeProductAnalysis — fórmulas exactas (criterio 3 de aceptación)', () => {
  it('conversión de costo, precio fijado y reposición: USD × tasa y margen compuesto', () => {
    const r = computeProductAnalysis(baseInput);
    // Compra: 10 USD × 400 = 4.000 CUP; precio con 30% = 5.200 CUP.
    expect(r.costAtPurchaseCup).toBe(4000);
    expect(r.salePriceSetCup).toBeCloseTo(5200, 10);
    // Hoy: 10 × 840 = 8.400 CUP; recomendado = 8.400 × 1,3 = 10.920 CUP.
    expect(r.costNowCup).toBe(8400);
    expect(r.recommendedPriceNowCup).toBeCloseTo(10920, 10);
  });

  it('utilidad real, margen real y ajuste de precio necesario (con signo)', () => {
    const r = computeProductAnalysis(baseInput);
    // Utilidad = 5.200 − 8.400 = −3.200 CUP (pérdida por unidad).
    expect(r.realUtilityPerUnitCup).toBe(-3200);
    // Margen real = −3.200 / 8.400 × 100 ≈ −38,095%.
    expect(r.realMarginPct).toBeCloseTo(-38.095238, 4);
    // Ajuste = 10.920 − 5.200 = +5.720 CUP (+110%).
    expect(r.priceAdjustmentCup).toBeCloseTo(5720, 10);
    expect(r.priceAdjustmentPct).toBeCloseTo(110, 10);
    expect(r.isLosing).toBe(true);
  });

  it('pérdida mensual = |utilidad| × unidades/mes solo cuando hay pérdida (con ganancia es 0)', () => {
    const perdiendo = computeProductAnalysis(baseInput);
    expect(perdiendo.monthlyLossCup).toBeCloseTo(320000, 6); // 3.200 × 100
    // Escenario ganador: tasa bajó desde la compra.
    const ganando = computeProductAnalysis({ ...baseInput, currentRate: 300 });
    // Precio fijado 5.200; reposición 3.000 → utilidad +2.200.
    expect(ganando.realUtilityPerUnitCup).toBe(2200);
    expect(ganando.isLosing).toBe(false);
    expect(ganando.monthlyLossCup).toBe(0);
  });

  it('variación del costo de reposición desde la compra (CUP y %)', () => {
    const r = computeProductAnalysis(baseInput);
    // Δ = 8.400 − 4.000 = +4.400 CUP; +110%.
    expect(r.costChangeCup).toBe(4400);
    expect(r.costChangePct).toBeCloseTo(110, 10);
  });

  it('proyección: con modelo válido los campos future se calculan; sin modelo quedan null', () => {
    const conModelo = computeProductAnalysis(baseInput);
    expect(conModelo.hasForecast).toBe(true);
    expect(conModelo.costFutureCup).toBe(9000); // 10 × 900
    expect(conModelo.recommendedPriceFutureCup).toBeCloseTo(11700, 10); // 9.000 × 1,3
    expect(conModelo.costChangeFuturePct).toBeCloseTo(((9000 - 8400) / 8400) * 100, 10);

    const sinModelo = computeProductAnalysis({ ...baseInput, forecastRate: null });
    expect(sinModelo.hasForecast).toBe(false);
    expect(sinModelo.costFutureCup).toBeNull();
    expect(sinModelo.recommendedPriceFutureCup).toBeNull();
    expect(sinModelo.costChangeFuturePct).toBeNull();
  });

  it('umbral de confianza documentado: R² mínimo 0.4 (media) y alto 0.7 — mismo criterio de las vistas', () => {
    expect(FORECAST_R2_MIN).toBe(0.4);
    expect(FORECAST_R2_HIGH).toBe(0.7);
  });
});

describe('linearRegression — proyección por mínimos cuadrados (misma recta de las vistas)', () => {
  it('menos de 5 muestras → null (sin inventar tendencia)', () => {
    expect(linearRegression([1, 2, 3, 4])).toBeNull();
    expect(linearRegression([])).toBeNull();
  });

  it('recta exacta y = 2x + 100 → pendiente 2, intercepto 100, R² = 1', () => {
    const ys = [100, 102, 104, 106, 108, 110];
    const reg = linearRegression(ys)!;
    expect(reg.slope).toBeCloseTo(2, 10);
    expect(reg.intercept).toBeCloseTo(100, 10);
    expect(reg.r2).toBeCloseTo(1, 12);
  });

  it('projected(daysAhead) continúa la recta desde la ÚLTIMA observación', () => {
    const ys = [100, 102, 104, 106, 108]; // 5 muestras, última = 108 (índice 4)
    const reg = linearRegression(ys)!;
    // +1 día → índice 5 → 110; +7 días → índice 11 → 122.
    expect(reg.projected(1)).toBeCloseTo(110, 10);
    expect(reg.projected(7)).toBeCloseTo(122, 10);
  });

  it('serie constante → denominador distinto de 0 pero ssTot = 0 → R² = 0 (sin tendencia)', () => {
    const reg = linearRegression([500, 500, 500, 500, 500])!;
    expect(reg.slope).toBeCloseTo(0, 12);
    expect(reg.r2).toBe(0);
  });

  it('ruido puro → R² bajo (la vista NO debe fiarse: umbral 0.4)', () => {
    // Alterna subidas y bajadas sin tendencia: R² ≈ 0.
    const ruido = [100, 130, 95, 140, 90, 135];
    const reg = linearRegression(ruido)!;
    expect(reg.r2).toBeLessThan(FORECAST_R2_MIN);
  });
});
