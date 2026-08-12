/**
 * PR-4.4I v2.2.2-R7.2.1 — Servicio de dominio para resolver información monetaria de una venta.
 *
 * Fuente autoritativa: payment_transactions (ref_type='sale', transaction_id=venta)
 * Fallback legacy: transactions.cash_amount/transfer_amount/zelle_amount
 *
 * USO: Todos los consumidores (modal, listing, Excel, summary) deben usar
 * resolveSalePayments() para obtener la representación monetaria de una venta.
 */

export interface SalePaymentComponent {
  method: 'cash' | 'transfer' | 'zelle';
  amountOriginal: number;
  currency: 'CUP' | 'USD' | 'EUR' | 'MLC';
  exchangeRate: number;
  amountCUP: number;
}

export interface SaleCurrencyInfo {
  components: SalePaymentComponent[];
  totalPaid: number;
  cashPaid: number;
  transferPaid: number;
  zellePaidCUP: number;
  zellePaidUSD: number | null;
  zelleExchangeRate: number | null;
  totalAmount: number;
  balance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'incomplete_data';
  hasIncompleteData: boolean;
  rateStatus: 'single_rate' | 'no_usd' | 'incomplete_data';
}

export interface PaymentTransactionRow {
  payment_method: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_cup: number;
}

export interface TransactionRow {
  id: string;
  total_amount?: number | null;
  cash_amount?: number | null;
  transfer_amount?: number | null;
  zelle_amount?: number | null;
}

export function resolveSalePayments(
  transaction: TransactionRow,
  paymentTransactions: PaymentTransactionRow[] | null | undefined
): SaleCurrencyInfo {
  const totalAmount = Number(transaction.total_amount) || 0;

  if (!paymentTransactions || paymentTransactions.length === 0) {
    const cashPaid = Number(transaction.cash_amount) || 0;
    const transferPaid = Number(transaction.transfer_amount) || 0;
    const zellePaidCUP = Number(transaction.zelle_amount) || 0;
    const totalPaid = cashPaid + transferPaid + zellePaidCUP;
    return {
      components: [],
      totalPaid,
      cashPaid,
      transferPaid,
      zellePaidCUP,
      zellePaidUSD: null,
      zelleExchangeRate: null,
      totalAmount,
      balance: totalAmount - totalPaid,
      paymentStatus: totalPaid >= totalAmount - 0.01 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
      hasIncompleteData: true,
      rateStatus: 'incomplete_data',
    };
  }

  const components: SalePaymentComponent[] = paymentTransactions.map(p => ({
    method: p.payment_method as 'cash' | 'transfer' | 'zelle',
    amountOriginal: Number(p.amount),
    currency: p.currency as 'CUP' | 'USD' | 'EUR' | 'MLC',
    exchangeRate: Number(p.exchange_rate),
    amountCUP: Number(p.amount_cup),
  }));

  const cashPaid = components.filter(c => c.method === 'cash').reduce((s, c) => s + c.amountCUP, 0);
  const transferPaid = components.filter(c => c.method === 'transfer').reduce((s, c) => s + c.amountCUP, 0);
  const zelleComponents = components.filter(c => c.method === 'zelle');
  const zellePaidCUP = zelleComponents.reduce((s, c) => s + c.amountCUP, 0);
  const zellePaidUSD = zelleComponents.length > 0
    ? zelleComponents.reduce((s, c) => s + c.amountOriginal, 0)
    : null;
  const zelleExchangeRate = zelleComponents.length > 0
    ? zelleComponents[0].exchangeRate
    : null;
  const totalPaid = components.reduce((s, c) => s + c.amountCUP, 0);

  return {
    components,
    totalPaid,
    cashPaid,
    transferPaid,
    zellePaidCUP,
    zellePaidUSD,
    zelleExchangeRate,
    totalAmount,
    balance: totalAmount - totalPaid,
    paymentStatus: totalPaid >= totalAmount - 0.01 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
    hasIncompleteData: false,
    rateStatus: zelleComponents.length > 0 ? 'single_rate' : 'no_usd',
  };
}
