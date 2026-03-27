/**
 * Pick3Engine v6.0 - Advanced Quantitative Analysis Engine
 */

import {
  SimulationResult,
  StrategyConfig,
  Pick3Result,
  AdvancedAnalysis,
  IntelligencePlay,
  BettingConfig,
  BacktestResult
} from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';
import { BacktestEngine, ModelValidationResult } from './backtest.engine';
import { SimulationEngine } from './simulation.engine';
import { BankrollManager } from './bankroll.manager';

export class Pick3RuleEngine {
  static getStrategies() {
    return [
      { id: 'hot', name: 'Números Calientes', description: 'Basado en dígitos con mayor frecuencia histórica.' },
      { id: 'cold', name: 'Números Fríos', description: 'Dígitos con mayor tiempo sin aparecer (Reversión).' },
      { id: 'mixed', name: 'Mixto (Caliente + Frío)', description: 'Balance entre tendencia y reversión.' },
      { id: 'exclude_last', name: 'Exclusión de Último', description: 'Filtra combinaciones que aparecieron recientemente.' }
    ];
  }
}

export class Pick3Engine {
  private history: Pick3Result[];
  private analysisEngine: AnalysisEngine;
  private backtestEngine: BacktestEngine;

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.analysisEngine = new AnalysisEngine(this.history);
    this.backtestEngine = new BacktestEngine(this.history);
  }

  public analyzeAdvanced(days: number = 30): AdvancedAnalysis {
    return this.analysisEngine.analyze(days);
  }

  public generatePlays(analysis: AdvancedAnalysis, config: BettingConfig, count: number = 5): IntelligencePlay[] {
    const predictionEngine = new PredictionEngine(this.history, analysis);
    return predictionEngine.generatePredictions(config, count);
  }

  public runBacktest(config: BettingConfig, initialBankroll: number, days: number = 30): BacktestResult {
    return this.backtestEngine.run(config, initialBankroll, days);
  }

  /**
   * Runs the 30-day projection validation.
   */
  public runValidation(config: BettingConfig, initialBankroll: number, days: number = 30): ModelValidationResult {
    return this.backtestEngine.runValidation(config, initialBankroll, days);
  }

  public simulateMonteCarlo(config: StrategyConfig, backtest: BacktestResult): SimulationResult {
    return SimulationEngine.runMonteCarlo(config, backtest);
  }

  public getCapitalRecommendation(roi: number, drawdown: number, config: BettingConfig): string {
    return BankrollManager.getRecommendation(roi, drawdown, config);
  }

  public calculateBetSize(bankroll: number, config: BettingConfig, confidence: number): number {
    return BankrollManager.calculateBetSize(bankroll, config, confidence);
  }
}
