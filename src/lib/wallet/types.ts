export type WalletTransactionType =
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'PAYMENT_SERVICE'
  | 'PHONE_RECHARGE'
  | 'BALANCE_QUERY'
  | 'AUTH_EVENT'
  | 'FAILED_OPERATION'
  | 'BANK_STATEMENT'
  | 'LIMIT_CHANGE'
  | 'CASH_ATM'
  | 'CASH_EXTRA'
  | 'MITURNO'
  | 'SECURITY_EVENT'
  | 'OTHER';

export interface WalletTransaction {
  id: string;
  date: string;
  bank: string;
  type: WalletTransactionType;
  direction: 'IN' | 'OUT';
  amount: number;
  currency: string;
  counterparty: string;
  transaction_id: string;
  description: string;
  source: 'SMS' | 'BANK_LOG' | 'MANUAL';

  // New fields for advanced analysis
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  service_category?: 'ELECTRICITY' | 'ONAT' | 'MERCHANT' | 'RECHARGE' | 'WATER' | 'TELEPHONE';
  balance_after?: number;
  discount_amount?: number;
  merchant_name?: string;
  extra_data?: Record<string, any>;
}

export interface RawImportMessage {
  id: string;
  type: string;
  date: string;
  nameNumber: string;
  content: string;
  bank?: string;
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
  transactions: WalletTransaction[];
}
