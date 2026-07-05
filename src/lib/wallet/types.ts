export interface RawSms {
  id: string;
  type: string;
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
  /** FIX-WALLET-V2: categoría manual override (persistida en localStorage) */
  manualCategory?: string;
}

export interface WalletSummary {
  total_income: number;
  total_expenses: number;
  balance: number;
}

export interface BankSummary {
  income: number;
  expenses: number;
  current_balance: number;
  last_balance_date?: string;
  card?: string;
  transaction_count: number;
}

/** FIX-WALLET-V2: categoría con detalle completo */
export interface CategorySummary {
  name: string;
  total: number;
  count: number;
  percentage: number;
  isIncome: boolean;
}

/** FIX-WALLET-V2: resumen mensual con detalle */
export interface MonthlySummary {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  balance: number;
  transactionCount: number;
  categories: Record<string, number>;
}

export interface WalletAnalytics {
  summary: WalletSummary;
  banks: Record<string, BankSummary>;
  monthly: Record<string, { income: number; expenses: number }>;
  categories: Record<string, number>;
  /** FIX-WALLET-V2: categorías detalladas */
  categoryDetails: CategorySummary[];
  /** FIX-WALLET-V2: resúmenes mensuales detallados */
  monthlyDetails: MonthlySummary[];
  transactions: AnalyticalTransaction[];
  rawSms: RawSms[];
  consolidated: ConsolidatedTransaction[];
  total_real_balance?: number;
}

/** FIX-WALLET-V2: categorías disponibles para clasificación manual */
export const EXPENSE_CATEGORIES = [
  'Electricidad',
  'Agua',
  'Gas',
  'Telecom',
  'Internet',
  'Alimentación',
  'Transporte',
  'Salud',
  'Educación',
  'Ropa',
  'Ocio',
  'Hogar',
  'Impuestos',
  'Transferencia',
  'Servicios',
  'Recarga',
  'Compras',
  'Préstamos',
  'Otros',
] as const;

export const INCOME_CATEGORIES = [
  'Salario',
  'Ventas',
  'Transferencia Recibida',
  'Reembolso',
  'Intereses',
  'Otros Ingresos',
] as const;
