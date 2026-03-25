import { BettingConfig } from '@/types/pick3';

export class BankrollManager {
  public static calculateBetSize(
    bankroll: number,
    config: BettingConfig,
    confidence: number
  ): number {
    // betSize = bankroll * riskFactor * confidence
    // riskFactor: 0.2% - 2% (input as 0.002 - 0.02)
    const factor = config.riskFactor / 100;
    const confFactor = confidence / 100;

    let bet = bankroll * factor * confFactor;

    // Safety limits
    const maxExposure = bankroll * 0.1; // Max 10% total exposure
    if (bet > maxExposure) bet = maxExposure;

    return Math.max(bet, 1); // Minimum 1 unit
  }

  public static getRecommendation(
    roi: number,
    drawdown: number,
    config: BettingConfig
  ): string {
    if (drawdown >= Math.abs(config.criticalDrawdown)) {
      return "PAUSA OPERATIVA: Drawdown Crítico Detectado";
    }

    if (drawdown >= Math.abs(config.criticalDrawdown) * 0.75) {
      return "REDUCIR RIESGO: Acercándose a Drawdown Crítico";
    }

    if (roi > 15 && drawdown < 5) {
      return "AUMENTAR EXPOSICIÓN: Rendimiento Positivo Sostenido";
    }

    if (roi < 0) {
      return "MANTENER CAUTELA: ROI Negativo en periodo actual";
    }

    return "OPERACIÓN ESTÁNDAR: Continuar con gestión de riesgo base";
  }
}
