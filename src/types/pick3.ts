export type DrawTime = 'midday' | 'evening';

export interface Pick3Result {
  date: string;
  draw_time: DrawTime;
  result: [number, number, number];
}

export type BetType = 'straight' | 'box' | 'straight_box';

export interface PayoutRules {
  straight: number;
  box: {
    '3-way': number; // e.g. 112
    '6-way': number; // e.g. 123
  };
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface StrategyConfig {
  budget: number;
  horizonDays: number;
  riskLevel: RiskLevel;
  costPerBet: number;
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
}

export interface IntelligencePlay {
  combination: [number, number, number];
  score: number;
  confidence: number;
  justification: string;
}

export interface FrequencyAnalysis {
  positional: {
    0: Record<number, number>; // hundred
    1: Record<number, number>; // ten
    2: Record<number, number>; // unit
  };
  global: Record<number, number>;
  hotNumbers: number[];
  coldNumbers: number[];
  gaps: Record<number, number>; // days since last appearance
}
