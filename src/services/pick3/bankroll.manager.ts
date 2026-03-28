import { BettingConfig } from '@/types/pick3';

export class BankrollManager {
  /**
   * Calculates bet size using advanced international standards:
   * 1. Fractional Kelly Criterion (for optimal growth vs risk)
   * 2. Fixed Ratio (for steady growth)
   * 3. Maximum Drawdown Protection
   */
  public static calculateBetSize(
    bankroll: number,
    config: BettingConfig,
    confidence: number,
    historicalWinRate: number = 0.05 // Typical win rate for 3-digit lottery models
  ): number {
    // 1. Fractional Kelly Criterion
    // Kelly % = (bp - q) / b where b are the odds (payout), p is prob(win), q is prob(loss)
    const p = confidence / 100;
    const q = 1 - p;
    const b = config.payout;

    const fullKelly = ((b * p) - q) / b;

    // International standard: Use 1/4 or 1/8 Kelly for high-variance assets like lottery
    // We use a very conservative 0.05 (5% of full Kelly) because of extreme skewness
    const fractionalKellyFactor = 0.05;
    const kellySize = Math.max(0, bankroll * fullKelly * fractionalKellyFactor);

    // 2. Fixed Risk per Trade (Modern Portfolio Theory approach)
    // Risk Factor is user-defined (e.g., 0.5% - 2%)
    const fixedRiskSize = bankroll * (config.riskFactor / 100);

    // 3. Volatility-Adjusted Size
    // If confidence is low, we scale down drastically
    const confidenceMultiplier = Math.pow(confidence / 100, 2);

    // Choose the most conservative approach
    let suggestedBet = Math.min(kellySize > 0 ? kellySize : fixedRiskSize, fixedRiskSize);
    suggestedBet *= confidenceMultiplier;

    // Safety limits
    const maxExposure = bankroll * 0.05; // Never bet more than 5% on a single line
    const minBet = 1;

    let finalBet = Math.min(suggestedBet, maxExposure);

    // Rounding for practicality
    if (finalBet < 1) return 1;
    return Math.floor(finalBet);
  }

  public static getRecommendation(
    roi: number,
    drawdown: number,
    config: BettingConfig,
    bankroll: number = 1000
  ): { status: string; action: string; color: string } {
    const isCrisis = drawdown >= Math.abs(config.criticalDrawdown);
    const isWarning = drawdown >= Math.abs(config.criticalDrawdown) * 0.7;

    if (isCrisis) {
      return {
        status: 'CRÍTICO',
        action: `STOP-LOSS ACTIVADO: Drawdown de ${drawdown.toFixed(1)}%. Recomendación: Detener todas las jugadas.`,
        color: 'text-red-500'
      };
    }

    if (isWarning) {
      return {
        status: 'PRECAUCIÓN',
        action: `RIESGO REDUCIDO: Drawdown preventivo (${drawdown.toFixed(1)}%). Sugerencia: Usar solo el 25% del tamaño normal.`,
        color: 'text-amber-500'
      };
    }

    if (roi > 20 && drawdown < 10) {
      return {
        status: 'ÓPTIMO',
        action: `AGRESIVO: ROI excelente. El modelo sugiere aumentar ligeramente el riesgo unitario.`,
        color: 'text-emerald-500'
      };
    }

    if (roi < 0) {
       return {
        status: 'RECUPERACIÓN',
        action: `DEFENSIVO: ROI negativo. Mantener apuestas en el mínimo absoluto ($1).`,
        color: 'text-blue-500'
      };
    }

    return {
      status: 'NORMAL',
      action: `ESTÁNDAR: Operando bajo parámetros de riesgo equilibrado.`,
      color: 'text-primary'
    };
  }
}
