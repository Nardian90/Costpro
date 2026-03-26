/**
 * Pick3Engine v6.0 - Advanced Quantitative Analysis Engine
 *
 * This engine serves as the central hub for the Pick 3 Intelligence module.
 * It coordinates analysis, prediction, backtesting, and simulation.
 *
 * Features:
 * - Positional Frequency Analysis
 * - High-Order Markov Chain Transitions
 * - Kelly Criterion-based Bankroll Management
 * - Monte Carlo Risk Projections
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
import { BacktestEngine } from './backtest.engine';
import { SimulationEngine } from './simulation.engine';
import { BankrollManager } from './bankroll.manager';

export class Pick3RuleEngine {
  /**
   * Returns available betting strategies for the UI.
   */
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

  /**
   * Initializes the engine with historical data.
   * @param history Array of official draw results.
   */
  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.analysisEngine = new AnalysisEngine(this.history);
    this.backtestEngine = new BacktestEngine(this.history);
  }

  /**
   * Performs multi-dimensional analysis on the history.
   * @param days Window of days to analyze.
   */
  public analyzeAdvanced(days: number = 30): AdvancedAnalysis {
    return this.analysisEngine.analyze(days);
  }

  /**
   * Generates high-confidence plays based on current analysis.
   * @param analysis Current advanced analysis state.
   * @param config User betting configuration.
   * @param count Number of plays to generate.
   */
  public generatePlays(analysis: AdvancedAnalysis, config: BettingConfig, count: number = 5): IntelligencePlay[] {
    const predictionEngine = new PredictionEngine(this.history, analysis);
    return predictionEngine.generatePredictions(config, count);
  }

  /**
   * Runs a walk-forward backtest simulation.
   * @param config Betting parameters.
   * @param initialBankroll Starting capital.
   * @param days Test duration.
   */
  public runBacktest(config: BettingConfig, initialBankroll: number, days: number = 30): BacktestResult {
    return this.backtestEngine.run(config, initialBankroll, days);
  }

  /**
   * Projects future risk using Monte Carlo simulations.
   */
  public simulateMonteCarlo(config: StrategyConfig, backtest: BacktestResult): SimulationResult {
    return SimulationEngine.runMonteCarlo(config, backtest);
  }

  /**
   * Returns a clear strategic recommendation for the user.
   */
  public getCapitalRecommendation(roi: number, drawdown: number, config: BettingConfig): string {
    return BankrollManager.getRecommendation(roi, drawdown, config);
  }

  /**
   * Calculates the optimal bet size for a specific play.
   */
  public calculateBetSize(bankroll: number, config: BettingConfig, confidence: number): number {
    return BankrollManager.calculateBetSize(bankroll, config, confidence);
  }
}
