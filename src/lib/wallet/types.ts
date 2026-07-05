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
  /** FIX-WALLET (2026-07-05): tarjeta/cuenta extraída del SMS */
  card?: string;
  counterparty?: string;
  isAdjustment?: boolean;
  isStatement?: boolean;
  balanceAfter?: number;
}

export interface AnalyticalTransaction {
  id: string;
  date: string;
  bank: string;
  /** FIX-WALLET: tarjeta/cuenta */
  card?: string;
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

/** FIX-WALLET (2026-07-05): resumen por banco con saldo y tarjeta */
export interface BankSummary {
  income: number;
  expenses: number;
  current_balance: number;
  /** Última fecha de saldo reportado */
  last_balance_date?: string;
  /** Tarjeta/cuenta principal */
  card?: string;
  /** Número de transacciones */
  transaction_count: number;
}

export interface WalletAnalytics {
  summary: WalletSummary;
  banks: Record<string, BankSummary>;
  monthly: Record<string, { income: number; expenses: number }>;
  categories: Record<string, number>;
  transactions: AnalyticalTransaction[];
  rawSms: RawSms[];
  consolidated: ConsolidatedTransaction[];
  /** FIX-WALLET: saldo total real (suma de saldos reportados por banco) */
  total_real_balance?: number;
}
