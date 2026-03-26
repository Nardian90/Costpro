import { BettingConfig } from '@/types/pick3';

export class BankrollManager {
  /**
   * Calculates bet size using fractional Kelly Criterion if possible,
   * otherwise falls back to standard risk factor.
   */
  public static calculateBetSize(
    bankroll: number,
    config: BettingConfig,
    confidence: number,
    hitRate: number = 0.01 // Default low hit rate for Pick3/Last2
  ): number {
    const p = confidence / 100; // Probability of win
    const q = 1 - p;            // Probability of loss
    const b = config.payout;    // Odds (b to 1)

    // Kelly % = (bp - q) / b
    const kelly = ((b * p) - q) / b;

    // Use fractional Kelly (typically 10-25% of full Kelly for safety)
    const fractionalKelly = Math.max(0, kelly * 0.25);

    // Standard risk factor calculation as fallback/limit
    const standardFactor = config.riskFactor / 100;

    // Choose the more conservative between Fractional Kelly and Risk Factor
    // but at least some minimum based on confidence if Kelly is positive
    let factor = standardFactor;
    if (kelly > 0) {
      factor = Math.min(standardFactor, fractionalKelly);
    }

    let bet = bankroll * factor;

    // Safety limits
    const maxExposure = bankroll * 0.1; // Max 10% total exposure
    if (bet > maxExposure) bet = maxExposure;

    return Math.max(Math.floor(bet), 1); // Minimum 1 unit, rounded down
  }

  public static getRecommendation(
    roi: number,
    drawdown: number,
    config: BettingConfig,
    bankroll: number = 1000
  ): string {
    const isCrisis = drawdown >= Math.abs(config.criticalDrawdown);
    const isWarning = drawdown >= Math.abs(config.criticalDrawdown) * 0.75;

    if (isCrisis) {
      return `PAUSA OPERATIVA: Drawdown Crítico (${drawdown.toFixed(1)}%). Recomendación: Cero riesgo hasta recalibrar.`;
    }

    if (isWarning) {
      return `REDUCIR RIESGO: Drawdown elevado (${drawdown.toFixed(1)}%). Sugerencia: Máximo $1 por jugada.`;
    }

    if (roi > 15 && drawdown < 5) {
      const suggestedSize = Math.floor(bankroll * 0.02);
      return `AUMENTAR EXPOSICIÓN: Rendimiento óptimo. Sugerencia: Up-size a $${suggestedSize} por combinación.`;
    }

    if (roi < 0) {
      return "MANTENER CAUTELA: ROI Negativo. Sugerencia: Operar con tamaño mínimo ($1).";
    }

    const standardSize = Math.floor(bankroll * (config.riskFactor / 100));
    return `OPERACIÓN ESTÁNDAR: Continuar con $${standardSize} por combinación (Gestión Base).`;
  }
}
