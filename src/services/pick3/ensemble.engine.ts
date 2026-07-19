/**
 * ensemble.engine.ts — Multi-Model Ensemble for Pick 3
 *
 * SPRINT 2 — Risk Layer + Multi-Modelo (SPRINT-2-ENSEMBLE)
 *
 * Reemplaza el PredictionEngine v8.0 (pesos fijos) con un ensemble
 * de 4 modelos independientes, cada uno con peso dinámico basado en
 * su desempeño histórico validado por backtesting.
 *
 * Modelos:
 *   1. FrequencyModel — Hot/cold numbers con chi-cuadrado de significancia
 *   2. MarkovModel — Cadena de Markov de orden 1 por posición
 *   3. PositionalModel — Análisis posicional independiente (centena/decena/unidad)
 *   4. SumRangeModel — Distribución de sumas y patrones odd-even/high-low
 *
 * Cada modelo:
 *   - Genera predicciones independientes
 *   - Calcula su propio confidence score
 *   - Se backtestea independientemente para determinar su peso en el ensemble
 *   - Tiene explainability (qué contribuyó al score)
 *
 * Ensemble:
 *   - Combina predicciones con weighted voting
 *   - Pesos dinámicos basados en backtest reciente (ventana 60 días)
 *   - Si un modelo tiene peso < 0.10 → se excluye (no aporta)
 *   - Confidence final = weighted average de confidences
 *
 * Author: CostPro Sprint 2
 * Date: 2026-07-05
 */

import { Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig } from '@/types/pick3';
import { LotteryMath } from './lottery.math';
import { chiSquareUniformityTest } from './stat.tests';
import { AnalysisEngine } from './analysis.engine';

// ============================================================================
// TIPOS
// ============================================================================

export type ModelName = 'frequency' | 'markov' | 'positional' | 'sumrange';

export interface ModelPrediction {
  combination: number[];
  score: number; // 0-100
  confidence: number; // 0-100
  model: ModelName;
  reasoning: string;
}

export interface ModelPerformance {
  model: ModelName;
  weight: number; // 0-1, peso en el ensemble
  hitRate: number; // % de aciertos en backtest
  recentHitRate: number; // % en últimos 30 sorteos
  totalPredictions: number;
  totalHits: number;
  confidence: number; // 0-100, confianza en el peso
  isExcluded: boolean; // true si peso < 0.10
}

export interface EnsemblePrediction extends IntelligencePlay {
  modelContributions: {
    frequency?: { score: number; weight: number };
    markov?: { score: number; weight: number };
    positional?: { score: number; weight: number };
    sumrange?: { score: number; weight: number };
  };
  ensembleConfidence: number;
}

export interface EnsembleReport {
  predictions: EnsemblePrediction[];
  modelPerformances: ModelPerformance[];
  regimeAlert?: string;
  totalModelsUsed: number;
}

// ============================================================================
// BASE MODEL CLASS
// ============================================================================

abstract class BaseModel {
  abstract name: ModelName;
  protected history: Pick3Result[];
  protected analysis: AdvancedAnalysis;

  constructor(history: Pick3Result[], analysis: AdvancedAnalysis) {
    this.history = history;
    this.analysis = analysis;
  }

  abstract predict(config: BettingConfig): ModelPrediction[];
  abstract backtest(windowSize: number): { hits: number; total: number; recentHits: number; recentTotal: number };

  protected combinationFromIndex(i: number, mode: 'PICK3' | 'LAST2'): number[] {
    if (mode === 'LAST2') return [Math.floor(i / 10), i % 10];
    return [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];
  }
}

// ============================================================================
// MODEL 1: FREQUENCY
// ============================================================================

class FrequencyModel extends BaseModel {
  name: ModelName = 'frequency';

  predict(config: BettingConfig): ModelPrediction[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const predictions: ModelPrediction[] = [];

    // Significancia estadística: si chi-cuadrado dice que los datos son
    // uniformes, el modelo de frecuencia NO aporta edge.
    const chiTest = chiSquareUniformityTest(this.history, 'global');
    const statisticalEdge = chiTest.isSignificant ? 1.0 : 0.3;
    // Si los datos son uniformes, reducimos confidence al 30%

    // Hot numbers (top 3 más frecuentes)
    const hotNumbers = new Set(this.analysis.hotNumbers);
    // Cold numbers (top 3 menos frecuentes) — apostamos a la reversión a la media
    const coldNumbers = new Set(this.analysis.coldNumbers);

    for (let i = 0; i < universe; i++) {
      const combination = this.combinationFromIndex(i, config.mode);
      let score = 0;
      const reasons: string[] = [];

      // Score basado en bias score (deviation de la media)
      combination.forEach(num => {
        const bias = this.analysis.biasScore[num] || 0;
        // Bias positivo = aparece más de lo esperado (hot)
        // Bias negativo = aparece menos (cold, due for reversion)
        // Apostamos a hot numbers (momentum) con score mayor
        if (bias > 5) {
          score += 60 + Math.min(bias, 40);
          reasons.push(`${num} caliente (+${bias.toFixed(1)}%)`);
        } else if (bias < -5) {
          // Cold number: apostamos a reversion
          score += 40 + Math.min(Math.abs(bias), 30);
          reasons.push(`${num} frío (${bias.toFixed(1)}%) reversión`);
        } else {
          score += 45;
        }
      });
      score /= combination.length;

      // Apply statistical edge multiplier
      score *= statisticalEdge;

      // Boost si todos los dígitos están en hot o cold
      const allHot = combination.every(d => hotNumbers.has(d));
      const allCold = combination.every(d => coldNumbers.has(d));
      if (allHot) { score += 15; reasons.push('Combo todo caliente'); }
      if (allCold) { score += 10; reasons.push('Combo todo frío (reversión)'); }

      score = Math.min(Math.max(score, 0), 100);
      const confidence = score * statisticalEdge;

      predictions.push({
        combination,
        score,
        confidence,
        model: this.name,
        reasoning: reasons.slice(0, 3).join(', '),
      });
    }

    return predictions.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  backtest(windowSize: number) {
    if (this.history.length < windowSize + 30) {
      return { hits: 0, total: 0, recentHits: 0, recentTotal: 0 };
    }
    let hits = 0, total = 0, recentHits = 0, recentTotal = 0;
    const recentCutoff = 30;

    const startIdx = Math.max(windowSize, this.history.length - 80);
    for (let i = startIdx; i < this.history.length; i++) {
      const window = this.history.slice(0, i);
      const analysis = new AnalysisEngine(window).analyze(60);
      const model = new FrequencyModel(window, analysis);
      const top3 = model.predict({ mode: 'PICK3', payout: 500, digits: 3, maxCombinations: 10, riskFactor: 1, stopLoss: 50, criticalDrawdown: 30 }).slice(0, 3);
      const actual = this.history[i].result;

      const isHit = top3.some(p =>
        p.combination.join('') === actual.join('') ||
        [...p.combination].sort().join('') === [...actual].sort().join('')
      );

      if (isHit) hits++;
      total++;
      if (i >= this.history.length - recentCutoff) {
        if (isHit) recentHits++;
        recentTotal++;
      }
    }
    return { hits, total, recentHits, recentTotal };
  }
}

// ============================================================================
// MODEL 2: MARKOV
// ============================================================================

class MarkovModel extends BaseModel {
  name: ModelName = 'markov';

  predict(config: BettingConfig): ModelPrediction[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const predictions: ModelPrediction[] = [];

    const lastDraw = this.history[0]?.result || [0, 0, 0];
    const transitions = this.analysis.markovTransitions.digits;

    // Calcular entropía de la matriz de transición: si es alta (≈ log2(10)),
    // el modelo no aporta edge
    let avgEntropy = 0;
    for (let i = 0; i < 10; i++) {
      const row = transitions[i] || {};
      const total = Object.values(row).reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      let entropy = 0;
      for (let j = 0; j < 10; j++) {
        const p = (row[j] || 0) / total;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      avgEntropy += entropy;
    }
    avgEntropy /= 10;
    // Si entropy ≈ log2(10) = 3.32, no hay patrón. Si < 2.5, hay edge.
    const statisticalEdge = Math.max(0.2, Math.min(1.0, (3.32 - avgEntropy) / 1.5));

    for (let i = 0; i < universe; i++) {
      const combination = this.combinationFromIndex(i, config.mode);
      let score = 0;
      const reasons: string[] = [];

      // Markov: P(next digit | prev digit) por posición
      combination.forEach((num, pos) => {
        const prevNum = lastDraw[pos] || 0;
        const row = transitions[prevNum] || {};
        const total = Object.values(row).reduce((a, b) => a + b, 0);
        const prob = total > 0 ? (row[num] || 0) / total : 0.1;
        // score = prob * 1000 (para que 0.1 = 100, 0.001 = 1)
        score += Math.min(prob * 500, 100);
        if (prob > 0.15) reasons.push(`${num}←${prevNum} en pos ${pos} (${(prob * 100).toFixed(1)}%)`);
      });
      score /= combination.length;
      score *= statisticalEdge;

      score = Math.min(Math.max(score, 0), 100);
      const confidence = score * statisticalEdge;

      predictions.push({
        combination,
        score,
        confidence,
        model: this.name,
        reasoning: reasons.slice(0, 3).join(', ') || 'Transición promedio',
      });
    }

    return predictions.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  backtest(windowSize: number) {
    if (this.history.length < windowSize + 30) {
      return { hits: 0, total: 0, recentHits: 0, recentTotal: 0 };
    }
    let hits = 0, total = 0, recentHits = 0, recentTotal = 0;

    const startIdx = Math.max(windowSize, this.history.length - 80);
    for (let i = startIdx; i < this.history.length; i++) {
      const window = this.history.slice(0, i);
      const analysis = new AnalysisEngine(window).analyze(60);
      const model = new MarkovModel(window, analysis);
      const top3 = model.predict({ mode: 'PICK3', payout: 500, digits: 3, maxCombinations: 10, riskFactor: 1, stopLoss: 50, criticalDrawdown: 30 }).slice(0, 3);
      const actual = this.history[i].result;

      const isHit = top3.some(p =>
        p.combination.join('') === actual.join('') ||
        [...p.combination].sort().join('') === [...actual].sort().join('')
      );

      if (isHit) hits++;
      total++;
      if (i >= this.history.length - 30) {
        if (isHit) recentHits++;
        recentTotal++;
      }
    }
    return { hits, total, recentHits, recentTotal };
  }
}

// ============================================================================
// MODEL 3: POSITIONAL
// ============================================================================

class PositionalModel extends BaseModel {
  name: ModelName = 'positional';

  predict(config: BettingConfig): ModelPrediction[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const predictions: ModelPrediction[] = [];

    // Significancia por posición
    const chi0 = chiSquareUniformityTest(this.history, 0);
    const chi1 = chiSquareUniformityTest(this.history, 1);
    const chi2 = chiSquareUniformityTest(this.history, 2);
    const posEdge = [
      chi0.isSignificant ? 1.0 : 0.4,
      chi1.isSignificant ? 1.0 : 0.4,
      chi2.isSignificant ? 1.0 : 0.4,
    ];

    const positional = this.analysis.positional;

    for (let i = 0; i < universe; i++) {
      const combination = this.combinationFromIndex(i, config.mode);
      let score = 0;
      const reasons: string[] = [];

      combination.forEach((num, pos) => {
        const posFreq = positional[pos as 0 | 1 | 2]?.[num] || 0;
        const total = Object.values(positional[pos as 0 | 1 | 2] || {}).reduce((a, b) => a + b, 0);
        const expected = total / 10;
        const bias = expected > 0 ? (posFreq - expected) / expected : 0;

        // Score: si el dígito es más frecuente en esa posición que el esperado
        let posScore = 50 + bias * 100;
        posScore *= posEdge[pos] || 1;

        score += Math.min(Math.max(posScore, 0), 100);
        if (bias > 0.2) reasons.push(`${num} en pos ${pos} +${(bias * 100).toFixed(0)}%`);
      });
      score /= combination.length;

      const confidence = score * (posEdge.reduce((a, b) => a + b, 0) / posEdge.length);

      predictions.push({
        combination,
        score,
        confidence,
        model: this.name,
        reasoning: reasons.slice(0, 3).join(', ') || 'Frecuencia posicional promedio',
      });
    }

    return predictions.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  backtest(windowSize: number) {
    if (this.history.length < windowSize + 30) {
      return { hits: 0, total: 0, recentHits: 0, recentTotal: 0 };
    }
    let hits = 0, total = 0, recentHits = 0, recentTotal = 0;

    const startIdx = Math.max(windowSize, this.history.length - 80);
    for (let i = startIdx; i < this.history.length; i++) {
      const window = this.history.slice(0, i);
      const analysis = new AnalysisEngine(window).analyze(60);
      const model = new PositionalModel(window, analysis);
      const top3 = model.predict({ mode: 'PICK3', payout: 500, digits: 3, maxCombinations: 10, riskFactor: 1, stopLoss: 50, criticalDrawdown: 30 }).slice(0, 3);
      const actual = this.history[i].result;

      const isHit = top3.some(p =>
        p.combination.join('') === actual.join('') ||
        [...p.combination].sort().join('') === [...actual].sort().join('')
      );

      if (isHit) hits++;
      total++;
      if (i >= this.history.length - 30) {
        if (isHit) recentHits++;
        recentTotal++;
      }
    }
    return { hits, total, recentHits, recentTotal };
  }
}

// ============================================================================
// MODEL 4: SUM-RANGE
// ============================================================================

class SumRangeModel extends BaseModel {
  name: ModelName = 'sumrange';

  predict(config: BettingConfig): ModelPrediction[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const predictions: ModelPrediction[] = [];

    // Distribución de sumas esperada para 3 dígitos 0-27
    // Teóricamente la suma sigue distribución triangular centrada en 13.5
    const sums = this.analysis.patterns.sums;
    const totalDraws = Object.values(sums).reduce((a, b) => a + b, 0);

    // Distribución teórica (triangular)
    const theoreticalDist: Record<number, number> = {};
    for (let s = 0; s <= 27; s++) {
      // Triangular distribution: peak at 13.5
      const dist = s <= 13.5 ? s + 1 : 28 - s;
      theoreticalDist[s] = dist / 100; // 100 = sum of all dist values
    }

    // Significancia: ¿la distribución empírica difiere de la teórica?
    let chiSq = 0;
    for (let s = 0; s <= 27; s++) {
      const expected = (theoreticalDist[s] || 0) * totalDraws;
      const observed = sums[s] || 0;
      if (expected > 0) chiSq += Math.pow(observed - expected, 2) / expected;
    }
    // Si chiSq > 40 (aprox), hay sesgo significativo
    const statisticalEdge = Math.max(0.3, Math.min(1.0, chiSq / 60));

    for (let i = 0; i < universe; i++) {
      const combination = this.combinationFromIndex(i, config.mode);
      const sum = combination.reduce((a, b) => a + b, 0);
      const observedSumFreq = sums[sum] || 0;
      const expectedSumFreq = (theoreticalDist[sum] || 0) * totalDraws;
      const sumBias = expectedSumFreq > 0 ? (observedSumFreq - expectedSumFreq) / expectedSumFreq : 0;

      // Odd-even pattern
      const oe = combination.map(n => n % 2 === 0 ? 'E' : 'O').join('-');
      const oeFreq = this.analysis.patterns.oddEven[oe] || 0;
      const oeExpected = totalDraws * (oe === 'O-O-O' || oe === 'E-E-E' ? 0.125 : 0.375);
      const oeBias = oeExpected > 0 ? (oeFreq - oeExpected) / oeExpected : 0;

      // High-low pattern
      const hl = combination.map(n => n >= 5 ? 'H' : 'L').join('-');
      const hlFreq = this.analysis.patterns.highLow[hl] || 0;
      const hlExpected = totalDraws * (hl === 'H-H-H' || hl === 'L-L-L' ? 0.125 : 0.375);
      const hlBias = hlExpected > 0 ? (hlFreq - hlExpected) / hlExpected : 0;

      // Score combinado
      let score = 50;
      score += sumBias * 30;
      score += oeBias * 20;
      score += hlBias * 20;
      score *= statisticalEdge;

      score = Math.min(Math.max(score, 0), 100);
      const confidence = score * statisticalEdge;

      const reasons: string[] = [];
      if (sumBias > 0.1) reasons.push(`Suma ${sum} sobre-representada`);
      if (oeBias > 0.1) reasons.push(`Patrón ${oe} frecuente`);
      if (hlBias > 0.1) reasons.push(`Patrón ${hl} frecuente`);

      predictions.push({
        combination,
        score,
        confidence,
        model: this.name,
        reasoning: reasons.slice(0, 3).join(', ') || 'Patrones promedio',
      });
    }

    return predictions.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  backtest(windowSize: number) {
    if (this.history.length < windowSize + 30) {
      return { hits: 0, total: 0, recentHits: 0, recentTotal: 0 };
    }
    let hits = 0, total = 0, recentHits = 0, recentTotal = 0;

    const startIdx = Math.max(windowSize, this.history.length - 80);
    for (let i = startIdx; i < this.history.length; i++) {
      const window = this.history.slice(0, i);
      const analysis = new AnalysisEngine(window).analyze(60);
      const model = new SumRangeModel(window, analysis);
      const top3 = model.predict({ mode: 'PICK3', payout: 500, digits: 3, maxCombinations: 10, riskFactor: 1, stopLoss: 50, criticalDrawdown: 30 }).slice(0, 3);
      const actual = this.history[i].result;

      const isHit = top3.some(p =>
        p.combination.join('') === actual.join('') ||
        [...p.combination].sort().join('') === [...actual].sort().join('')
      );

      if (isHit) hits++;
      total++;
      if (i >= this.history.length - 30) {
        if (isHit) recentHits++;
        recentTotal++;
      }
    }
    return { hits, total, recentHits, recentTotal };
  }
}

// ============================================================================
// ENSEMBLE ENGINE
// ============================================================================

export class EnsembleEngine {
  private history: Pick3Result[];
  private analysis: AdvancedAnalysis;
  private models: BaseModel[];
  private performances: ModelPerformance[] | null = null;
  // FIX-CACHE (2026-07-05): cache de calibración para no recalcular si el histórico no cambió
  private lastHistoryHash: string | null = null;
  private lastWindowSize: number | null = null;

  constructor(history: Pick3Result[], analysis: AdvancedAnalysis) {
    this.history = history;
    this.analysis = analysis;
    this.models = [
      new FrequencyModel(history, analysis),
      new MarkovModel(history, analysis),
      new PositionalModel(history, analysis),
      new SumRangeModel(history, analysis),
    ];
  }

  /**
   * FIX-CACHE (2026-07-05): genera un hash simple del histórico para detectar cambios.
   * Si el hash es igual al último, la calibración se puede reusar.
   */
  private computeHistoryHash(): string {
    if (this.history.length === 0) return 'empty';
    // Hash simple: primero + último + cantidad (suficiente para detectar cambios)
    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    return `${this.history.length}:${first.date}:${first.draw_time}:${last.date}:${last.draw_time}`;
  }

  /**
   * Backtest cada modelo independientemente y calcula pesos dinámicos.
   * Los pesos se basan en:
   *   - Hit rate global (50% peso)
   *   - Hit rate reciente 30 sorteos (50% peso)
   *   - Si hitRate < 1%, el modelo se excluye (no aporta edge)
   */
  public calibrate(windowSize: number = 60): ModelPerformance[] {
    // FIX-CACHE (2026-07-05): si el histórico no cambió y el windowSize es el mismo,
    // reusar la calibración anterior (evita recalcular 440 iteraciones × 4 modelos)
    const currentHash = this.computeHistoryHash();
    if (this.performances && this.lastHistoryHash === currentHash && this.lastWindowSize === windowSize) {
      return this.performances;
    }

    const performances: ModelPerformance[] = [];

    for (const model of this.models) {
      const bt = model.backtest(windowSize);
      const hitRate = bt.total > 0 ? (bt.hits / bt.total) * 100 : 0;
      const recentHitRate = bt.recentTotal > 0 ? (bt.recentHits / bt.recentTotal) * 100 : 0;

      // Baseline: 0.3% es lo esperado por azar con 3 picks en 1000 combinaciones (straight)
      // Para box (6-way), baseline es 1.8%
      // Usamos 1.5% como threshold de "edge"
      const baselineEdge = 1.5;
      const edgeScore = Math.max(0, hitRate - baselineEdge);
      const recentEdgeScore = Math.max(0, recentHitRate - baselineEdge);
      const combinedEdge = (edgeScore * 0.5) + (recentEdgeScore * 0.5);

      // Convertir edge a peso: edge de 5% → peso 1.0 (max)
      const rawWeight = Math.min(1, combinedEdge / 5);
      const isExcluded = rawWeight < 0.10 || (hitRate === 0 && bt.total > 50);

      performances.push({
        model: model.name,
        weight: isExcluded ? 0 : rawWeight,
        hitRate,
        recentHitRate,
        totalPredictions: bt.total,
        totalHits: bt.hits,
        confidence: Math.min(100, combinedEdge * 20),
        isExcluded,
      });
    }

    // Normalizar pesos para que sumen 1 (entre los no excluidos)
    const totalWeight = performances.filter(p => !p.isExcluded).reduce((acc, p) => acc + p.weight, 0);
    if (totalWeight > 0) {
      performances.forEach(p => {
        if (!p.isExcluded) p.weight = p.weight / totalWeight;
      });
    } else {
      // Si todos están excluidos, dar peso igual a todos (fallback)
      performances.forEach(p => {
        p.weight = 0.25;
        p.isExcluded = false;
      });
    }

    // FIX-CACHE: guardar hash para próximas llamadas
    this.lastHistoryHash = currentHash;
    this.lastWindowSize = windowSize;
    this.performances = performances;
    return performances;
  }

  /**
   * FIX-ENSEMBLE (2026-07-05): Aplica pesos manuales del SimulationConfigPanel.
   * Override los pesos calculados por calibrate() con los del usuario.
   * Los modelos deshabilitados se marcan como excluded.
   */
  public applyManualWeights(simConfig: {
    models: {
      frequency: { enabled: boolean; weight: number };
      markov: { enabled: boolean; weight: number };
      positional: { enabled: boolean; weight: number };
      sumrange: { enabled: boolean; weight: number };
    };
  }): void {
    if (!this.performances) {
      this.calibrate();
    }

    // Normalizar pesos de modelos habilitados para que sumen 1
    const enabledEntries = Object.entries(simConfig.models).filter(([_, m]) => m.enabled);
    const totalWeight = enabledEntries.reduce((sum, [_, m]) => sum + m.weight, 0);

    this.performances!.forEach(p => {
      const modelConfig = (simConfig.models as any)[p.model];
      if (modelConfig) {
        p.isExcluded = !modelConfig.enabled;
        // Normalizar peso al rango 0-1
        p.weight = modelConfig.enabled && totalWeight > 0
          ? modelConfig.weight / totalWeight
          : 0;
      }
    });
  }

  /**
   * Genera predicción ensemble combinando los 4 modelos con pesos dinámicos.
   */
  public generatePredictions(config: BettingConfig, count: number = 10): EnsemblePrediction[] {
    if (!this.performances) {
      this.calibrate();
    }

    const activeModels = this.models.filter((_, i) => !this.performances![i].isExcluded);
    if (activeModels.length === 0) {
      // Fallback: usar todos
      return this.fallbackPredictions(config, count);
    }

    // Generar predicciones de cada modelo
    const modelPredictions: Map<ModelName, Map<string, ModelPrediction>> = new Map();
    for (const model of activeModels) {
      const preds = model.predict(config);
      const map = new Map<string, ModelPrediction>();
      for (const p of preds) map.set(p.combination.join(''), p);
      modelPredictions.set(model.name, map);
    }

    // Combinar: para cada combinación única, sumar weighted scores
    const allCombos = new Set<string>();
    modelPredictions.forEach(map => {
      map.forEach((_, key) => allCombos.add(key));
    });

    const ensemblePredictions: EnsemblePrediction[] = [];
    for (const comboKey of allCombos) {
      const combination = comboKey.split('').map(Number);
      let weightedScore = 0;
      let weightedConfidence = 0;
      let totalWeight = 0;
      const contributions: EnsemblePrediction['modelContributions'] = {};
      const reasons: string[] = [];

      for (const model of activeModels) {
        const perf = this.performances!.find(p => p.model === model.name)!;
        const pred = modelPredictions.get(model.name)?.get(comboKey);
        if (!pred) continue;

        weightedScore += pred.score * perf.weight;
        weightedConfidence += pred.confidence * perf.weight;
        totalWeight += perf.weight;
        contributions[model.name as ModelName] = { score: pred.score, weight: perf.weight };
        if (pred.reasoning) reasons.push(`[${model.name}] ${pred.reasoning}`);
      }

      if (totalWeight === 0) continue;
      const finalScore = weightedScore / totalWeight;
      const finalConfidence = weightedConfidence / totalWeight;

      ensemblePredictions.push({
        combination,
        score: Math.min(Math.max(finalScore, 0), 100),
        confidence: Math.min(Math.max(finalConfidence, 0), 100),
        justification: reasons.slice(0, 4).join(' | '),
        strategyLabel: this.determineStrategy(contributions),
        modelContributions: contributions,
        ensembleConfidence: finalConfidence,
      });
    }

    return ensemblePredictions
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(count, 10));
  }

  private determineStrategy(contributions: EnsemblePrediction['modelContributions']): string {
    const entries = Object.entries(contributions).sort((a, b) => b[1].score - a[1].score);
    if (entries.length === 0) return 'Ensemble';
    const top = entries[0];
    const modelNames: Record<string, string> = {
      frequency: 'Hot/Cold',
      markov: 'Markov',
      positional: 'Positional',
      sumrange: 'Sum/Pattern',
    };
    return modelNames[top[0]] || 'Ensemble';
  }

  private fallbackPredictions(config: BettingConfig, count: number): EnsemblePrediction[] {
    // Si todos los modelos están excluidos, usar FrequencyModel como fallback
    const model = new FrequencyModel(this.history, this.analysis);
    const preds = model.predict(config).slice(0, count);
    return preds.map(p => ({
      combination: p.combination,
      score: p.score,
      confidence: p.confidence,
      justification: p.reasoning,
      strategyLabel: 'Fallback (no edge detectado)',
      modelContributions: { frequency: { score: p.score, weight: 1 } },
      ensembleConfidence: p.confidence * 0.5, // Reducir confianza en fallback
    }));
  }

  /**
   * Genera un reporte completo con alertas de régimen.
   */
  public generateReport(config: BettingConfig, count: number = 10): EnsembleReport {
    if (!this.performances) {
      this.calibrate();
    }

    const predictions = this.generatePredictions(config, count);
    const activeModels = this.performances!.filter(p => !p.isExcluded);

    // Detectar régimen: si algún modelo tiene peso muy alto (>0.6), hay edge fuerte
    let regimeAlert: string | undefined;
    const dominantModel = this.performances!.find(p => p.weight > 0.6);
    if (dominantModel) {
      regimeAlert = `Régimen detectado: el modelo ${dominantModel.model} domina con ${(dominantModel.weight * 100).toFixed(0)}% de peso. Hit rate: ${dominantModel.hitRate.toFixed(1)}% (reciente: ${dominantModel.recentHitRate.toFixed(1)}%).`;
    } else if (activeModels.length === 0) {
      regimeAlert = 'No se detectó edge estadístico en ningún modelo. La estrategia recomendada es gestión de bankroll defensiva.';
    }

    return {
      predictions,
      modelPerformances: this.performances!,
      regimeAlert,
      totalModelsUsed: activeModels.length,
    };
  }
}
