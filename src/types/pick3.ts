export type DrawTime = 'midday' | 'evening';

export interface Pick3Result {
  date: string;
  draw_time: DrawTime;
  result: [number, number, number];
}

export type BetType = 'straight' | 'box' | 'last2';

export interface BettingConfig {
  mode: 'PICK3' | 'LAST2';
  payout: number;
  digits: 2 | 3;
  maxCombinations: number;
  riskFactor: number; // 0.2% - 2%
  stopLoss: number;
  takeProfit?: number;
  criticalDrawdown: number;
}

export interface StrategyConfig {
  budget: number;
  horizonDays: number;
  riskLevel: 'low' | 'medium' | 'high';
  costPerBet: number;
  bettingConfig?: BettingConfig;
}

export interface IntelligencePlay {
  combination: number[]; // [X, Y, Z] or [Y, Z]
  score: number;
  confidence: number;
  justification: string;
}

export interface BacktestResult {
  id: string;
  timestamp: number;
  periodDays: number;
  totalBets: number;
  totalWins: number;
  hitRate: number;
  roi: number;
  netProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  recoveryFactor: number;
  equityCurve: number[];
  winStreak: number;
  lossStreak: number;
}

export interface SimulationResult {
  id: string;
  timestamp: number;
  config: StrategyConfig;
  equityCurve: number[];
  totalBets: number;
  totalWins: number;
  finalCapital: number;
  roi: number;
  maxDrawdown: number;
  probabilityOfRuin: number;
  expectedRecoveryTime?: number; // Days
  empiricalDistribution?: {
    hits: number[];
    misses: number[];
  };
}

export interface FrequencyAnalysis {
  positional: {
    0: Record<number, number>;
    1: Record<number, number>;
    2: Record<number, number>;
  };
  global: Record<number, number>;
  hotNumbers: number[];
  coldNumbers: number[];
  gaps: Record<number, number>;
}

export interface AdvancedAnalysis extends FrequencyAnalysis {
  entropy: number;
  biasScore: Record<number, number>;
  markovTransitions: {
    digits: Record<number, Record<number, number>>; // 10x10
    full2D?: Record<number, Record<number, number>>; // 100x100
  };
  patterns: {
    sums: Record<number, number>;
    oddEven: Record<string, number>;
    highLow: Record<string, number>;
    lastDigitTransitions: Record<number, number[]>;
  };
  movingAverages: {
    global: Record<number, number[]>;
  };
  strategyAccuracy?: Record<string, number>;
}

export type SyncSourceStatus = 'pending' | 'success' | 'error' | 'syncing';

export interface Pick3Source {
  id: string;
  name: string;
  url: string;
  status: SyncSourceStatus;
  lastSync?: string;
  error?: string;
  isOfficial?: boolean;
}

export interface Pick3SyncState {
  isSyncing: boolean;
  lastGlobalSync?: string;
  sources: Pick3Source[];
  activeSourceId?: string;
}
