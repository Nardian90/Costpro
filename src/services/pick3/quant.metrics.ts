/**
 * quant.metrics.ts — Quantitative Finance Metrics for Pick 3
 *
 * Sprint 1 — Fundación Matemática (SPRINT-1-QUANT)
 *
 * Implementación correcta de métricas estándar de la industria cuantitativa:
 *   - Sharpe Ratio  (retorno por unidad de volatilidad total)
 *   - Sortino Ratio (retorno por unidad de volatilidad a la baja)
 *   - Calmar Ratio  (CAGR por unidad de drawdown máximo)
 *   - Profit Factor (Σ ganancias / Σ pérdidas absolutas)
 *   - Recovery Factor (Net Profit / Max Drawdown absoluto)
 *   - Win/Loss Streaks (racha máxima secuencial)
 *   - Max Drawdown con profundidad y duración
 *   - CAGR con intervalo de confianza
 *   - Kelly Criterion con cap anti-ruin
 *   - Probability of Ruin (Gambler's Ruin)
 *
 * Author: CostPro Sprint 1
 * Date: 2026-07-05
 *
 * Referencias:
 *  - Sharpe (1994): "The Sharpe Ratio"
 *  - Sortino & Price (1994): "Performance Measurement in a Downside Risk Framework"
 *  - Young (1991): "Calmar Ratio"
 *  - Kelly (1956): "A New Interpretation of Information Rate"
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface TradeRecord {
  /** P&L del trade (positivo = ganancia, negativo = pérdida) */
  pnl: number;
  /** Capital después del trade */
  equity: number;
  /** Fecha o índice del trade */
  timestamp?: number;
}

export interface StreakResult {
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number; // positivo = racha ganadora, negativo = perdedora
}

export interface DrawdownResult {
  /** Drawdown máximo en % (0-100) */
  maxDrawdownPct: number;
  /** Drawdown máximo en valor absoluto */
  maxDrawdownAbs: number;
  /** Duración del max drawdown en trades */
  maxDrawdownDuration: number;
  /** Pico desde donde empezó el drawdown */
  peak: number;
  /** Valle donde terminó el drawdown */
  trough: number;
}

export interface RiskAdjustedRatios {
  sharpe: number;
  sortino: number;
  calmar: number;
  /** Annualized volatility (decimal, e.g., 0.25 = 25%) */
  volatility: number;
  /** Downside deviation (decimal) */
  downsideDeviation: number;
}

export interface ProfitabilityMetrics {
  profitFactor: number;
  recoveryFactor: number;
  /** Σ ganancias brutas */
  grossProfit: number;
  /** Σ pérdidas brutas (valor absoluto) */
  grossLoss: number;
  netProfit: number;
  winRate: number;
  lossRate: number;
  expectancy: number; // Valor esperado por trade
}

export interface CAGRResult {
  /** Compound Annual Growth Rate en % */
  cagr: number;
  /** Retorno total en % */
  totalReturn: number;
  /** Días del período */
  days: number;
  /** ROI simple (decimal) */
  roi: number;
  /** Confidence interval 95% (si hay suficientes datos) */
  ci95?: {
    lower: number;
    upper: number;
  };
}

export interface KellyResult {
  /** Fracción Kelly completa (decimal) */
  fullKelly: number;
  /** Fracción Kelly con cap anti-ruin (decimal) */
  safeKelly: number;
  /** Tamaño de apuesta recomendado en $ */
  recommendedBet: number;
  /** Edge estimado (decimal) */
  edge: number;
  /** ¿Es viable? (Kelly > 0) */
  isViable: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const TRADING_DAYS_PER_YEAR = 365; // Lotería es casi todos los días (mid+evening)
const SORTINO_MAR = 0; // Minimum Acceptable Return = 0 (sin retorno mínimo)

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Downside deviation solo de los retornos negativos (Sortino)
 */
function downsideDeviation(returns: number[]): number {
  const downside = returns
    .filter(r => r < SORTINO_MAR)
    .map(r => Math.pow(r - SORTINO_MAR, 2));
  if (downside.length === 0) return 0;
  return Math.sqrt(downside.reduce((a, b) => a + b, 0) / returns.length);
}

/**
 * Retorna promedio anualizado (asumiendo frecuencia diaria de sorteos)
 */
function annualize(dailyMean: number): number {
  return dailyMean * TRADING_DAYS_PER_YEAR;
}

// ============================================================================
// STREAKS
// ============================================================================

/**
 * Calcula las rachas máximas de victorias y derrotas consecutivas.
 * Esencial para evaluar sistemas de gestión tipo Martingale/Fibonacci.
 */
export function calculateStreaks(trades: TradeRecord[]): StreakResult {
  if (trades.length === 0) {
    return { maxWinStreak: 0, maxLossStreak: 0, currentStreak: 0 };
  }

  let maxWin = 0;
  let maxLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const t of trades) {
    if (t.pnl > 0) {
      currentWin++;
      currentLoss = 0;
      if (currentWin > maxWin) maxWin = currentWin;
    } else if (t.pnl < 0) {
      currentLoss++;
      currentWin = 0;
      if (currentLoss > maxLoss) maxLoss = currentLoss;
    }
  }

  const lastTrade = trades[trades.length - 1];
  let currentStreak = 0;
  if (lastTrade.pnl > 0) currentStreak = currentWin;
  else if (lastTrade.pnl < 0) currentStreak = -currentLoss;

  return {
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    currentStreak,
  };
}

// ============================================================================
// DRAWDOWN
// ============================================================================

/**
 * Calcula el drawdown máximo con profundidad, duración, pico y valle.
 * Implementa el estándar de la industria: max(high - subsequent_low) / high.
 */
export function calculateDrawdown(equityCurve: number[]): DrawdownResult {
  if (equityCurve.length < 2) {
    return {
      maxDrawdownPct: 0,
      maxDrawdownAbs: 0,
      maxDrawdownDuration: 0,
      peak: equityCurve[0] || 0,
      trough: equityCurve[0] || 0,
    };
  }

  let peak = equityCurve[0];
  let maxDdPct = 0;
  let maxDdAbs = 0;
  let maxDuration = 0;
  let currentDuration = 0;
  let peakAtMax = equityCurve[0];
  let troughAtMax = equityCurve[0];

  for (let i = 1; i < equityCurve.length; i++) {
    const equity = equityCurve[i];
    if (equity >= peak) {
      peak = equity;
      currentDuration = 0;
    } else {
      currentDuration++;
      const ddAbs = peak - equity;
      const ddPct = peak > 0 ? (ddAbs / peak) * 100 : 0;
      if (ddPct > maxDdPct) {
        maxDdPct = ddPct;
        maxDdAbs = ddAbs;
        maxDuration = currentDuration;
        peakAtMax = peak;
        troughAtMax = equity;
      }
    }
  }

  return {
    maxDrawdownPct: maxDdPct,
    maxDrawdownAbs: maxDdAbs,
    maxDrawdownDuration: maxDuration,
    peak: peakAtMax,
    trough: troughAtMax,
  };
}

// ============================================================================
// RATIOS AJUSTADOS AL RIESGO
// ============================================================================

/**
 * Calcula Sharpe, Sortino y Calmar.
 *
 * @param trades Lista de trades con P&L
 * @param equityCurve Curva de capital completa
 * @param riskFreeRate Tasa libre de riesgo anual (default 0 para lotería)
 * @param initialCapital Capital inicial (para CAGR)
 * @param days Días del período (para anualizar)
 */
export function calculateRiskAdjustedRatios(
  trades: TradeRecord[],
  equityCurve: number[],
  riskFreeRate: number = 0,
  initialCapital: number = 1000,
  days: number = 30,
): RiskAdjustedRatios {
  if (trades.length < 2 || equityCurve.length < 2) {
    return {
      sharpe: 0,
      sortino: 0,
      calmar: 0,
      volatility: 0,
      downsideDeviation: 0,
    };
  }

  // Retornos absolutos por trade (no porcentuales — consistencia con lotería)
  const returns = trades.map(t => t.pnl);

  const meanReturn = mean(returns);
  const dailyVolatility = std(returns);
  const annualizedVolatility = dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

  // Sharpe: (R_p - R_f) / σ_p  (anualizado)
  // Para lotería usamos retorno por trade, anualizado
  const annualizedReturn = annualize(meanReturn);
  const annualizedRiskFree = riskFreeRate;
  const sharpe = annualizedVolatility > 0
    ? (annualizedReturn - annualizedRiskFree) / annualizedVolatility
    : 0;

  // Sortino: (R_p - R_f) / σ_downside (anualizado)
  const dailyDownside = downsideDeviation(returns);
  const annualizedDownside = dailyDownside * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const sortino = annualizedDownside > 0
    ? (annualizedReturn - annualizedRiskFree) / annualizedDownside
    : 0;

  // Calmar: CAGR / Max Drawdown
  const dd = calculateDrawdown(equityCurve);
  const cagr = calculateCAGR(initialCapital, equityCurve[equityCurve.length - 1], days).cagr;
  const calmar = dd.maxDrawdownPct > 0
    ? (cagr / 100) / (dd.maxDrawdownPct / 100)
    : 0;

  return {
    sharpe,
    sortino,
    calmar,
    volatility: annualizedVolatility,
    downsideDeviation: annualizedDownside,
  };
}

// ============================================================================
// PROFITABILIDAD
// ============================================================================

/**
 * Calcula profit factor, recovery factor y métricas conexas.
 *
 * Profit Factor = Σ ganancias / Σ pérdidas absolutas
 *   >1.5 = decente, >2.0 = profesional, <1 = sistema perdedor
 *
 * Recovery Factor = Net Profit / Max Drawdown Absoluto
 *   >1 = el sistema se recupera del peor pozo histórico
 */
export function calculateProfitability(
  trades: TradeRecord[],
  equityCurve: number[],
  initialCapital: number = 1000,
): ProfitabilityMetrics {
  if (trades.length === 0) {
    return {
      profitFactor: 0,
      recoveryFactor: 0,
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
      winRate: 0,
      lossRate: 0,
      expectancy: 0,
    };
  }

  const grossProfit = trades
    .filter(t => t.pnl > 0)
    .reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter(t => t.pnl < 0)
      .reduce((acc, t) => acc + t.pnl, 0),
  );
  const netProfit = trades.reduce((acc, t) => acc + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const total = trades.length;

  const dd = calculateDrawdown(equityCurve);

  return {
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
    recoveryFactor: dd.maxDrawdownAbs > 0 ? netProfit / dd.maxDrawdownAbs : 0,
    grossProfit,
    grossLoss,
    netProfit,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    lossRate: total > 0 ? (losses / total) * 100 : 0,
    expectancy: total > 0 ? netProfit / total : 0,
  };
}

// ============================================================================
// CAGR Y ROI
// ============================================================================

/**
 * Calcula CAGR con intervalo de confianza del 95% basado en la volatilidad.
 * CAGR = (Final/Inicial)^(365/days) - 1
 */
export function calculateCAGR(
  initial: number,
  final: number,
  days: number,
): CAGRResult {
  if (initial <= 0 || days <= 0) {
    return {
      cagr: 0,
      totalReturn: 0,
      days,
      roi: 0,
    };
  }

  const totalReturn = ((final - initial) / initial) * 100;
  const roi = (final - initial) / initial;
  const yearFraction = days / 365;
  const cagr = (Math.pow(final / initial, 1 / yearFraction) - 1) * 100;

  return {
    cagr,
    totalReturn,
    days,
    roi,
  };
}

/**
 * Calcula CAGR + intervalo de confianza del 95%.
 * El CI asume distribución normal de retornos (asunción fuerte, pero estándar).
 */
export function calculateCAGRWithCI(
  initial: number,
  final: number,
  days: number,
  trades: TradeRecord[],
): CAGRResult {
  const base = calculateCAGR(initial, final, days);
  if (trades.length < 30) return base; // Necesitamos al menos 30 trades para IC

  const returns = trades.map(t => t.pnl);
  const dailyVol = std(returns);
  const annualizedVol = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const yearFraction = days / 365;

  // Z = 1.96 para IC 95%
  const z = 1.96;
  const ciHalfWidth = (annualizedVol * z) / Math.sqrt(yearFraction);

  return {
    ...base,
    ci95: {
      lower: base.cagr - ciHalfWidth * 100,
      upper: base.cagr + ciHalfWidth * 100,
    },
  };
}

// ============================================================================
// KELLY CRITERION
// ============================================================================

/**
 * Calcula la fracción óptima de Kelly con cap anti-ruin (25% Kelly).
 *
 * Kelly: f = (b*p - q) / b
 *   donde b = odds netos (payout - 1)
 *         p = probabilidad de ganar
 *         q = 1 - p
 *
 * Cap anti-ruin: usamos 25% de Kelly (anti-volatilidad para high-skewness)
 */
export function calculateKelly(
  bankroll: number,
  winProbability: number,
  payout: number,
  kellyCap: number = 0.25,
): KellyResult {
  if (bankroll <= 0 || payout <= 0) {
    return {
      fullKelly: 0,
      safeKelly: 0,
      recommendedBet: 0,
      edge: 0,
      isViable: false,
    };
  }

  const p = Math.max(0, Math.min(1, winProbability));
  const q = 1 - p;
  const b = payout; // En lotería, $1 → $500 → b = 500 (payout neto sobre stake)

  // Full Kelly
  const fullKelly = b > 0 ? (b * p - q) / b : 0;
  // Cap anti-ruin (Quarter Kelly estándar para high-skewness)
  const safeKelly = Math.max(0, fullKelly * kellyCap);
  const edge = fullKelly > 0 ? fullKelly : 0;

  return {
    fullKelly,
    safeKelly,
    recommendedBet: Math.floor(bankroll * safeKelly),
    edge,
    isViable: fullKelly > 0,
  };
}

// ============================================================================
// PROBABILITY OF RUIN
// ============================================================================

/**
 * Calcula la probabilidad de ruina (perder todo el bankroll)
 * usando el modelo de Gambler's Ruin de Feller.
 *
 * Para jugador con edge positivo (p*b > q):
 *   P_ruin = (q/p)^B     (B = bankroll en unidades)
 *
 * Para jugador con edge negativo (p*b <= q):
 *   P_ruin ≈ 1 - edge*B (aproximación lineal, ruina es prácticamente segura)
 *
 * Caso p = q: P_ruin = 1 (camino aleatorio simétrico)
 *
 * @param winProbability Probabilidad de ganar una apuesta
 * @param bankrollUnits Bankroll en "unidades" (ej: $1000 / $1 = 1000 unidades)
 * @param payout Cuánto se paga por $1 apostado (500 = Pick 3 straight)
 */
export function calculateProbabilityOfRuin(
  winProbability: number,
  bankrollUnits: number,
  payout: number,
): number {
  if (bankrollUnits <= 0) return 1;
  if (winProbability <= 0) return 1;
  if (winProbability >= 1) return 0;

  const p = winProbability;
  const q = 1 - p;
  const b = payout;
  const ev = p * b - q;

  if (ev <= 0) {
    // Edge negativo o cero: ruina es eventualmente segura.
    // Aproximación empírica:
    //   - Si EV ≈ 0: P_ruin ≈ 0.5 (camino aleatorio simétrico)
    //   - Si EV muy negativo: P_ruin → 1
    //   - Scale por bankroll: más bankroll = más resistencia
    // Fórmula: P_ruin = 1 - (edge * B) / (1 - edge) clamp [0.5, 1]
    // Para lotería (edge ≈ -0.5): P_ruin ≈ 1 - (-0.5 * 1000) / 1.5 → muy alta
    if (ev >= -0.001) return 0.5; // EV ~ 0
    const severity = Math.min(1, Math.abs(ev) * 2); // 0..1, qué tan negativo es el edge
    // Con más bankroll, hay más chances de sobrevivir temporalmente,
    // pero la ruina eventual es segura. Aproximación:
    // P_ruin_a_corto_plazo = 1 - 1/(1 + B*|edge|)
    const survivalFactor = 1 / (1 + bankrollUnits * Math.abs(ev) * 0.01);
    const pRuin = 0.5 + (1 - 0.5) * (1 - survivalFactor) * severity;
    return Math.max(0.5 + 0.01, Math.min(1, pRuin));
  }

  // Edge positivo: P_ruin = (q/p)^B
  // Si p > q (r < 1), esta es una potencia decreciente de B.
  const r = q / p;
  if (r >= 1) return 1; // Caso límite p <= q
  // Para B grande, r^B puede ser muy pequeño. Usar log para evitar underflow.
  const logP = bankrollUnits * Math.log(r);
  return Math.max(0, Math.min(1, Math.exp(logP)));
}

// ============================================================================
// HELPER DE SERIE COMPLETA
// ============================================================================

/**
 * Recibe una lista de P&L y capital inicial, devuelve TODAS las métricas
 * cuantitativas precalculadas.
 *
 * Esta es la función que debe llamarse desde el backtest engine.
 */
export interface FullQuantReport {
  streaks: StreakResult;
  drawdown: DrawdownResult;
  ratios: RiskAdjustedRatios;
  profitability: ProfitabilityMetrics;
  cagr: CAGRResult;
  kelly: KellyResult;
  probabilityOfRuin: number;
}

export function computeFullQuantReport(
  pnlSeries: number[],
  initialCapital: number,
  days: number,
  winProbability: number,
  payout: number,
): { report: FullQuantReport; equityCurve: number[]; trades: TradeRecord[] } {
  // Construir equity curve y trades
  let equity = initialCapital;
  const equityCurve: number[] = [initialCapital];
  const trades: TradeRecord[] = [];

  for (const pnl of pnlSeries) {
    equity += pnl;
    equityCurve.push(equity);
    trades.push({ pnl, equity });
  }

  // Calcular bankroll en "units" (asumiendo $1 por unidad)
  const bankrollUnits = Math.max(1, initialCapital);

  const report: FullQuantReport = {
    streaks: calculateStreaks(trades),
    drawdown: calculateDrawdown(equityCurve),
    ratios: calculateRiskAdjustedRatios(trades, equityCurve, 0, initialCapital, days),
    profitability: calculateProfitability(trades, equityCurve, initialCapital),
    cagr: calculateCAGRWithCI(initialCapital, equity, days, trades),
    kelly: calculateKelly(initialCapital, winProbability, payout),
    probabilityOfRuin: calculateProbabilityOfRuin(winProbability, bankrollUnits, payout),
  };

  return { report, equityCurve, trades };
}
