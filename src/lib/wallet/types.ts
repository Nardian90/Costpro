export interface RawSms {
  id: string;
  type: string; // "Recibido" | "Enviado"
  date: string;
  nameNumber: string;
  content: string;
}

export interface ConsolidatedTransaction {
  date: string;
  service: string;
  operation: 'CR' | 'DB';
  amount: number;
  currency: string;
  transactionId: string;
  bank: string;
  counterparty?: string;
  isAdjustment?: boolean;
  isStatement?: boolean;
  balanceAfter?: number;
}

export interface AnalyticalTransaction {
  id: string;
  date: string;
  bank: string;
  typeOperation: string;
  nature: 'CR' | 'DB';
  amount: number;
  currency: string;
  counterparty: string;
  category: string;
  transactionId: string;
  channel: string;
  note: string;
  isStatement?: boolean;
}

export interface WalletSummary {
  total_income: number;
  total_expenses: number;
  balance: number;
}

export interface WalletAnalytics {
  summary: WalletSummary;
  banks: Record<string, { income: number; expenses: number; current_balance: number }>;
  monthly: Record<string, { income: number; expenses: number }>;
  categories: Record<string, number>;
  transactions: AnalyticalTransaction[];
  rawSms: RawSms[];
  consolidated: ConsolidatedTransaction[];
}
