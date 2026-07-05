/**
 * risk.layer.test.ts — Tests for Sprint 2 risk layer
 *
 * SPRINT-2-RISK (2026-07-05)
 *
 * Verifica:
 *   - Tres modos de riesgo (defensive/balanced/aggressive)
 *   - Cálculo de Kelly adaptativo
 *   - Stop-loss y take-profit dinámicos
 *   - Diversificación y exposure limits
 *   - Recomendaciones de acción
 */

import { describe, it, expect } from 'vitest';
import {
  RiskLayer,
  RISK_PROFILES,
  inferRiskMode,
  calculateDynamicStopLoss,
  RiskMode,
} from '@/services/pick3/risk.layer';

describe('SPRINT-2: RiskLayer', () => {
  describe('RISK_PROFILES', () => {
    it('tiene 3 modos definidos', () => {
      expect(RISK_PROFILES.defensive).toBeDefined();
      expect(RISK_PROFILES.balanced).toBeDefined();
      expect(RISK_PROFILES.aggressive).toBeDefined();
    });

    it('defensive es más conservador que aggressive', () => {
      expect(RISK_PROFILES.defensive.kellyCap).toBeLessThan(RISK_PROFILES.aggressive.kellyCap);
      expect(RISK_PROFILES.defensive.maxExposurePerDrawPct).toBeLessThan(RISK_PROFILES.aggressive.maxExposurePerDrawPct);
      expect(RISK_PROFILES.defensive.stopLossPct).toBeLessThan(RISK_PROFILES.aggressive.stopLossPct);
    });

    it('balanced está entre defensive y aggressive', () => {
      expect(RISK_PROFILES.balanced.kellyCap).toBeGreaterThan(RISK_PROFILES.defensive.kellyCap);
      expect(RISK_PROFILES.balanced.kellyCap).toBeLessThan(RISK_PROFILES.aggressive.kellyCap);
    });
  });

  describe('calculateRecommendation', () => {
    it('calcula betSize > 0 cuando hay edge', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const rec = layer.calculateRecommendation(80, 0.5, 2, 3);

      expect(rec.betSize).toBeGreaterThan(0);
      expect(rec.totalExposure).toBeGreaterThan(0);
      expect(rec.maxCombinations).toBe(3);
    });

    it('activa stop-loss cuando drawdown supera el límite', () => {
      const layer = new RiskLayer(1000, 'balanced', 30, 0); // DD 30% > 25% stop
      const rec = layer.calculateRecommendation(80, 0.5, 2, 3);

      expect(rec.shouldStop).toBe(true);
      expect(rec.riskLevel).toBe('critical');
      expect(rec.warnings.some(w => w.includes('STOP-LOSS'))).toBe(true);
    });

    it('activa take-profit cuando ROI supera el límite', () => {
      const layer = new RiskLayer(1000, 'balanced', 0, 150); // ROI 150% > 100% TP
      const rec = layer.calculateRecommendation(80, 0.5, 2, 3);

      expect(rec.shouldIncreaseExposure).toBe(true);
      expect(rec.recommendations.some(r => r.includes('Take-profit'))).toBe(true);
    });

    it('reduce exposición cuando confidence es bajo', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const recLow = layer.calculateRecommendation(20, 0.5, 2, 3); // confidence 20%
      const recHigh = layer.calculateRecommendation(80, 0.5, 2, 3); // confidence 80%

      expect(recLow.betSize).toBeLessThanOrEqual(recHigh.betSize);
      expect(recLow.warnings.some(w => w.includes('Confidence bajo'))).toBe(true);
    });

    it('defensive da betSize menor que aggressive', () => {
      const defensive = new RiskLayer(1000, 'defensive');
      const aggressive = new RiskLayer(1000, 'aggressive');

      const recDef = defensive.calculateRecommendation(70, 0.5, 2, 3);
      const recAgg = aggressive.calculateRecommendation(70, 0.5, 2, 3);

      expect(recDef.betSize).toBeLessThanOrEqual(recAgg.betSize);
    });

    it('totalExposure respeta el límite máximo por sorteo', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const rec = layer.calculateRecommendation(80, 0.5, 2, 10); // 10 combinaciones

      // Balanced: max 5% = $50
      expect(rec.totalExposure).toBeLessThanOrEqual(50 * 1.5); // con take-profit 150%
    });

    it('betSize mínimo es 1', () => {
      const layer = new RiskLayer(10, 'defensive'); // Bankroll muy bajo
      const rec = layer.calculateRecommendation(50, 0.001, 500, 1);

      expect(rec.betSize).toBeGreaterThanOrEqual(1);
    });

    it('detecta edge negativo y emite warning', () => {
      const layer = new RiskLayer(1000, 'balanced');
      // winProb muy bajo, payout alto → EV negativo
      const rec = layer.calculateRecommendation(50, 0.001, 500, 1);

      expect(rec.warnings.some(w => w.includes('Kelly ≤ 0'))).toBe(true);
    });
  });

  describe('canContinue', () => {
    it('true cuando drawdown < stopLoss', () => {
      const layer = new RiskLayer(1000, 'balanced', 10, 0);
      expect(layer.canContinue()).toBe(true);
    });

    it('false cuando drawdown >= stopLoss', () => {
      const layer = new RiskLayer(1000, 'balanced', 30, 0); // 30% > 25%
      expect(layer.canContinue()).toBe(false);
    });

    it('false cuando bankroll <= 0', () => {
      const layer = new RiskLayer(0, 'balanced');
      expect(layer.canContinue()).toBe(false);
    });
  });

  describe('getActionRecommendation', () => {
    it('CRÍTICO cuando drawdown >= stopLoss', () => {
      const layer = new RiskLayer(1000, 'balanced', 30, 0);
      const action = layer.getActionRecommendation();
      expect(action.status).toBe('CRÍTICO');
      expect(action.color).toBe('text-red-500');
    });

    it('PRECAUCIÓN cuando drawdown cerca del stopLoss', () => {
      const layer = new RiskLayer(1000, 'balanced', 18, 0); // 18% > 17.5% (70% de 25)
      const action = layer.getActionRecommendation();
      expect(action.status).toBe('PRECAUCIÓN');
    });

    it('ÓPTIMO cuando ROI >= takeProfit', () => {
      const layer = new RiskLayer(1000, 'balanced', 0, 150);
      const action = layer.getActionRecommendation();
      expect(action.status).toBe('ÓPTIMO');
    });

    it('RECUPERACIÓN cuando ROI < 0', () => {
      const layer = new RiskLayer(1000, 'balanced', 0, -20);
      const action = layer.getActionRecommendation();
      expect(action.status).toBe('RECUPERACIÓN');
    });

    it('NORMAL cuando todo está en rango', () => {
      const layer = new RiskLayer(1000, 'balanced', 5, 10);
      const action = layer.getActionRecommendation();
      expect(action.status).toBe('NORMAL');
    });
  });

  describe('inferRiskMode', () => {
    it('retorna defensive para riskFactor <= 0.5', () => {
      expect(inferRiskMode({ riskFactor: 0.3 } as any)).toBe('defensive');
      expect(inferRiskMode({ riskFactor: 0.5 } as any)).toBe('defensive');
    });

    it('retorna aggressive para riskFactor >= 2', () => {
      expect(inferRiskMode({ riskFactor: 2 } as any)).toBe('aggressive');
      expect(inferRiskMode({ riskFactor: 3 } as any)).toBe('aggressive');
    });

    it('retorna balanced para 0.5 < riskFactor < 2', () => {
      expect(inferRiskMode({ riskFactor: 1 } as any)).toBe('balanced');
      expect(inferRiskMode({ riskFactor: 1.5 } as any)).toBe('balanced');
    });
  });

  describe('calculateDynamicStopLoss', () => {
    it('stopLoss base cuando bankroll está sano', () => {
      const sl = calculateDynamicStopLoss(1000, 950, 25);
      expect(sl).toBe(25);
    });

    it('stopLoss reducido cuando bankroll < 80% del inicial', () => {
      const sl = calculateDynamicStopLoss(1000, 750, 25);
      expect(sl).toBeLessThan(25);
      expect(sl).toBeGreaterThan(0);
    });

    it('stopLoss muy reducido cuando bankroll < 50% del inicial', () => {
      const sl = calculateDynamicStopLoss(1000, 400, 25);
      expect(sl).toBeLessThan(20);
    });

    it('retorna base si initialBankroll <= 0', () => {
      const sl = calculateDynamicStopLoss(0, 0, 25);
      expect(sl).toBe(25);
    });
  });

  describe('Edge cases', () => {
    it('maneja bankroll = 0', () => {
      const layer = new RiskLayer(0, 'balanced');
      const rec = layer.calculateRecommendation(50, 0.5, 2, 1);
      expect(rec.betSize).toBeGreaterThanOrEqual(1);
    });

    it('maneja confidence = 0', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const rec = layer.calculateRecommendation(0, 0.5, 2, 1);
      expect(rec.betSize).toBeGreaterThanOrEqual(1);
      expect(rec.warnings.length).toBeGreaterThan(0);
    });

    it('maneja winProb = 0', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const rec = layer.calculateRecommendation(50, 0, 500, 1);
      expect(rec.warnings.some(w => w.includes('Kelly'))).toBe(true);
    });

    it('maneja payout muy alto (lotería típica)', () => {
      const layer = new RiskLayer(1000, 'balanced');
      const rec = layer.calculateRecommendation(50, 0.002, 500, 3);
      expect(rec.betSize).toBeGreaterThanOrEqual(1);
      expect(rec.totalExposure).toBeGreaterThanOrEqual(1);
    });
  });
});
