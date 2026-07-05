/**
 * risk.layer.ts — Adaptive Risk Management for Pick 3
 *
 * SPRINT 2 — Risk Layer (SPRINT-2-RISK)
 *
 * Capa de gestión de riesgo que se siente encima del ensemble engine.
 *
 * Funciones:
 *   1. Calcula el tamaño de apuesta óptimo usando Kelly adaptativo
 *      (basado en el confidence del ensemble, no en winProb estática)
 *   2. Aplica stop-loss dinámico (reduce exposición cuando DD sube)
 *   3. Aplica take-profit (aumenta exposición cuando va bien)
 *   4. Diversificación: máximo % del bankroll por sorteo
 *   5. Tres modos de riesgo: Defensive / Balanced / Aggressive
 *
 * Author: CostPro Sprint 2
 * Date: 2026-07-05
 */

import { BettingConfig } from '@/types/pick3';
import { calculateKelly } from './quant.metrics';

// ============================================================================
// TIPOS
// ============================================================================

export type RiskMode = 'defensive' | 'balanced' | 'aggressive';

export interface RiskProfile {
  mode: RiskMode;
  kellyCap: number; // Fracción de Kelly (defensive=0.10, balanced=0.25, aggressive=0.50)
  maxExposurePerDrawPct: number; // % máximo del bankroll por sorteo
  maxExposurePerBetPct: number; // % máximo por apuesta individual
  stopLossPct: number; // Detener si DD supera esto
  takeProfitPct: number; // Aumentar exposición si ROI supera esto
  diversificationFactor: number; // 1.0 = no diversificar, 0.5 = diversificar 50%
}

export interface RiskRecommendation {
  betSize: number; // Tamaño recomendado en $
  totalExposure: number; // Exposición total por sorteo
  maxCombinations: number; // Cuántas combinaciones apostar
  kellyFraction: number; // Fracción Kelly aplicada (decimal)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
  recommendations: string[];
  shouldStop: boolean; // true si stop-loss activado
  shouldIncreaseExposure: boolean; // true si take-profit activado
}

// ============================================================================
// RISK PROFILES
// ============================================================================

export const RISK_PROFILES: Record<RiskMode, RiskProfile> = {
  defensive: {
    mode: 'defensive',
    kellyCap: 0.10, // 10% Kelly (ultra conservador)
    maxExposurePerDrawPct: 2, // Max 2% del bankroll por sorteo
    maxExposurePerBetPct: 0.5, // Max 0.5% por apuesta
    stopLossPct: 15, // Stop en DD 15%
    takeProfitPct: 50, // Aumentar en ROI 50%
    diversificationFactor: 0.7,
  },
  balanced: {
    mode: 'balanced',
    kellyCap: 0.25, // 25% Kelly (Quarter Kelly estándar)
    maxExposurePerDrawPct: 5, // Max 5% por sorteo
    maxExposurePerBetPct: 1.5, // Max 1.5% por apuesta
    stopLossPct: 25, // Stop en DD 25%
    takeProfitPct: 100, // Aumentar en ROI 100%
    diversificationFactor: 0.5,
  },
  aggressive: {
    mode: 'aggressive',
    kellyCap: 0.50, // 50% Kelly (Half Kelly — riesgo alto)
    maxExposurePerDrawPct: 10, // Max 10% por sorteo
    maxExposurePerBetPct: 3, // Max 3% por apuesta
    stopLossPct: 35, // Stop en DD 35%
    takeProfitPct: 200, // Aumentar en ROI 200%
    diversificationFactor: 0.3,
  },
};

// ============================================================================
// RISK LAYER
// ============================================================================

export class RiskLayer {
  private profile: RiskProfile;
  private bankroll: number;
  private currentDrawdown: number;
  private currentRoi: number;

  constructor(
    bankroll: number,
    mode: RiskMode = 'balanced',
    currentDrawdown: number = 0,
    currentRoi: number = 0,
  ) {
    this.profile = RISK_PROFILES[mode];
    this.bankroll = Math.max(0, bankroll);
    this.currentDrawdown = Math.max(0, currentDrawdown);
    this.currentRoi = currentRoi;
  }

  /**
   * Calcula la recomendación de riesgo para una apuesta.
   *
   * @param ensembleConfidence Confidence del ensemble (0-100)
   * @param winProb Probabilidad de ganar estimada (0-1)
   * @param payout Payout neto ($1 → $500 = 500)
   * @param numCombinations Número de combinaciones a apostar
   */
  public calculateRecommendation(
    ensembleConfidence: number,
    winProb: number,
    payout: number,
    numCombinations: number = 3,
  ): RiskRecommendation {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let shouldStop = false;
    let shouldIncreaseExposure = false;

    // === 1. STOP-LOSS CHECK ===
    if (this.currentDrawdown >= this.profile.stopLossPct) {
      shouldStop = true;
      warnings.push(`🛑 STOP-LOSS ACTIVADO: Drawdown actual ${this.currentDrawdown.toFixed(1)}% supera el límite de ${this.profile.stopLossPct}%. Se recomienda detener.`);
    } else if (this.currentDrawdown >= this.profile.stopLossPct * 0.7) {
      warnings.push(`⚠️ Zona de precaución: Drawdown ${this.currentDrawdown.toFixed(1)}% cercano al stop-loss (${this.profile.stopLossPct}%).`);
      recommendations.push('Reducir exposición al 50% del normal.');
    }

    // === 2. TAKE-PROFIT CHECK ===
    if (this.currentRoi >= this.profile.takeProfitPct) {
      shouldIncreaseExposure = true;
      recommendations.push(`📈 Take-profit alcanzado: ROI ${this.currentRoi.toFixed(1)}% supera ${this.profile.takeProfitPct}%. Se permite aumentar exposición al 150%.`);
    }

    // === 3. KELLY CALCULATION ===
    // Kelly adaptativo: usar el confidence del ensemble como winProb ajustado
    // Si ensembleConfidence es bajo, reducimos el winProb efectivo
    const adjustedWinProb = winProb * (ensembleConfidence / 100);
    const kelly = calculateKelly(
      this.bankroll,
      Math.max(0.001, adjustedWinProb),
      payout,
      this.profile.kellyCap,
    );

    // === 4. EXPOSURE LIMITS ===
    const maxExposurePerDraw = this.bankroll * (this.profile.maxExposurePerDrawPct / 100);
    const maxExposurePerBet = this.bankroll * (this.profile.maxExposurePerBetPct / 100);

    // Ajustar por stop-loss: si estamos en zona de precaución, reducir al 50%
    let exposureMultiplier = 1.0;
    if (this.currentDrawdown >= this.profile.stopLossPct * 0.7) {
      exposureMultiplier *= 0.5;
    }
    // Ajustar por take-profit: si estamos en take-profit, aumentar al 150%
    if (shouldIncreaseExposure) {
      exposureMultiplier *= 1.5;
    }
    // Ajustar por confidence: si confidence < 30%, reducir al 30%
    if (ensembleConfidence < 30) {
      exposureMultiplier *= 0.3;
      warnings.push(`⚠️ Confidence bajo (${ensembleConfidence.toFixed(1)}%). Exposición reducida al 30%.`);
    }

    // === 5. BET SIZE CALCULATION ===
    let betSize = kelly.recommendedBet * exposureMultiplier;
    betSize = Math.min(betSize, maxExposurePerBet);
    betSize = Math.max(1, Math.floor(betSize)); // Mínimo $1

    // === 6. TOTAL EXPOSURE ===
    let totalExposure = betSize * numCombinations;
    totalExposure = Math.min(totalExposure, maxExposurePerDraw * exposureMultiplier);

    // Si total exposure excede el bankroll, escalar proporcionalmente
    if (totalExposure > this.bankroll * 0.95) {
      const scale = (this.bankroll * 0.95) / totalExposure;
      betSize = Math.max(1, Math.floor(betSize * scale));
      totalExposure = betSize * numCombinations;
    }

    // === 7. RISK LEVEL ===
    const exposurePct = (totalExposure / this.bankroll) * 100;
    let riskLevel: RiskRecommendation['riskLevel'] = 'low';
    if (shouldStop) riskLevel = 'critical';
    else if (exposurePct > 5 || this.currentDrawdown > 20) riskLevel = 'high';
    else if (exposurePct > 2 || this.currentDrawdown > 10) riskLevel = 'medium';

    // === 8. RECOMMENDATIONS ===
    if (riskLevel === 'critical') {
      recommendations.push('NO apostar. Esperar a que el drawdown baje del stop-loss.');
    }
    if (kelly.edge <= 0) {
      recommendations.push('Edge negativo: el Kelly indica no apostar. Considerar omitir este sorteo.');
      warnings.push('⚠️ Kelly ≤ 0: no hay edge estadístico positivo.');
    }
    if (numCombinations > 5) {
      recommendations.push(`Diversificación alta (${numCombinations} combinaciones) reduce el variance pero también el upside.`);
    }

    return {
      betSize,
      totalExposure,
      maxCombinations: numCombinations,
      kellyFraction: kelly.safeKelly,
      riskLevel,
      warnings,
      recommendations,
      shouldStop,
      shouldIncreaseExposure,
    };
  }

  /**
   * Calcula el tamaño de apuesta usando Fractional Kelly con capas de seguridad.
   */
  public calculateBetSize(
    confidence: number,
    winProb: number,
    payout: number,
  ): number {
    const rec = this.calculateRecommendation(confidence, winProb, payout, 1);
    return rec.betSize;
  }

  /**
   * Verifica si es seguro continuar apostando.
   */
  public canContinue(): boolean {
    return !(
      this.currentDrawdown >= this.profile.stopLossPct ||
      this.bankroll <= 0
    );
  }

  /**
   * Recomienda una acción basada en el estado actual.
   */
  public getActionRecommendation(): { action: string; color: string; status: string } {
    if (this.currentDrawdown >= this.profile.stopLossPct) {
      return {
        status: 'CRÍTICO',
        action: `STOP-LOSS: Drawdown ${this.currentDrawdown.toFixed(1)}% ≥ ${this.profile.stopLossPct}%. Detener.`,
        color: 'text-red-500',
      };
    }
    if (this.currentDrawdown >= this.profile.stopLossPct * 0.7) {
      return {
        status: 'PRECAUCIÓN',
        action: `Zona preventiva: Drawdown ${this.currentDrawdown.toFixed(1)}%. Reducir al 50%.`,
        color: 'text-amber-500',
      };
    }
    if (this.currentRoi >= this.profile.takeProfitPct) {
      return {
        status: 'ÓPTIMO',
        action: `ROI ${this.currentRoi.toFixed(1)}% ≥ ${this.profile.takeProfitPct}%. Aumentar al 150%.`,
        color: 'text-emerald-500',
      };
    }
    if (this.currentRoi < 0) {
      return {
        status: 'RECUPERACIÓN',
        action: `ROI negativo (${this.currentRoi.toFixed(1)}%). Mínimo absoluto ($1).`,
        color: 'text-blue-500',
      };
    }
    return {
      status: 'NORMAL',
      action: `Operando con perfil ${this.profile.mode}. Exposición estándar.`,
      color: 'text-primary',
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convierte un BettingConfig tradicional a un RiskMode.
 */
export function inferRiskMode(config: BettingConfig): RiskMode {
  if (config.riskFactor <= 0.5) return 'defensive';
  if (config.riskFactor >= 2) return 'aggressive';
  return 'balanced';
}

/**
 * Calcula el stop-loss dinámico basado en el bankroll restante.
 * Si el bankroll está bajo, el stop-loss se reduce proporcionalmente.
 */
export function calculateDynamicStopLoss(
  initialBankroll: number,
  currentBankroll: number,
  baseStopLoss: number = 25,
): number {
  if (initialBankroll <= 0) return baseStopLoss;
  const ratio = currentBankroll / initialBankroll;
  if (ratio < 0.5) return baseStopLoss * 0.6; // Más conservador si estamos en pérdida
  if (ratio < 0.8) return baseStopLoss * 0.8;
  return baseStopLoss;
}
