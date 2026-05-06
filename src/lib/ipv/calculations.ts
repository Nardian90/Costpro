import { BankTransaction, ReconciliationLine } from '@/lib/dexie';
import { parseObservations } from './parser';

export interface IPVMetrics {
  totalSales: number;
  cashSales: number;
  transferSales: number;
  bankCredits: number;
  bankDebits: number;
  healthPercent: number;
  totalTaxes: number;
  totalCommissions: number;
}

export interface DailySales {
  date: string;
  cash: number;
  transfer: number;
  debits: number;
}

export interface PayerMetric {
  name: string;
  amount: number;
  count: number;
}

export interface ProductMetric {
  name: string;
  cash: number;
  transfer: number;
  total: number;
}

export function calculateIPVMetrics(
  reconciliationLines: ReconciliationLine[],
  bankTransactions: BankTransaction[]
): IPVMetrics {
  let cashSales = 0;
  let transferSales = 0;
  let bankCredits = 0;
  let bankDebits = 0;
  let totalTaxes = 0;
  let totalCommissions = 0;

  reconciliationLines.forEach(line => {
    cashSales += (line.cash_amount_cents || 0) / 100;
    transferSales += (line.transfer_amount_cents || 0) / 100;
  });

  bankTransactions.forEach(tx => {
    // FIX-LOG-011: Handle comma-formatted strings
    const raw = String(tx.importe_cents || 0).replace(/[^\d.-]/g, '');
    const amount = parseFloat(raw) || 0;
    if (tx.tipo === 'Cr') {
      bankCredits += amount;
      const parsed = parseObservations(tx.observaciones || '');
      totalTaxes += parsed.tax;
      totalCommissions += parsed.commission;
    } else {
      bankDebits += Math.abs(amount);
    }
  });

  const totalSales = cashSales + transferSales;
  const expectedCredits = transferSales * 100;
  const healthPercent = expectedCredits === 0
    ? 100
    : Math.min(100, Math.max(0, (bankCredits / expectedCredits) * 100));

  return {
    totalSales,
    cashSales,
    transferSales,
    bankCredits,
    bankDebits,
    healthPercent,
    totalTaxes,
    totalCommissions
  };
}

export function getDailySalesHistory(
  reconciliationLines: ReconciliationLine[],
  bankTransactions: BankTransaction[]
): DailySales[] {
  const history: Record<string, DailySales> = {};

  bankTransactions.forEach(tx => {
    const date = tx.fecha || 'Sin fecha';
    if (!history[date]) {
      history[date] = { date, cash: 0, transfer: 0, debits: 0 };
    }
    const rawHist = String(tx.importe_cents || 0).replace(/[^\d.-]/g, '');
    const amount = Math.abs(parseFloat(rawHist) || 0);
    if (tx.tipo === 'Db') {
      history[date].debits += amount;
    }
  });

  reconciliationLines.forEach(line => {
    const date = line.fecha_operacion || 'Sin fecha';
    if (!history[date]) {
      history[date] = { date, cash: 0, transfer: 0, debits: 0 };
    }
    history[date].cash += (line.cash_amount_cents || 0) / 100;
    history[date].transfer += (line.transfer_amount_cents || 0) / 100;
  });

  return Object.values(history).sort((a, b) => a.date.localeCompare(b.date));
}

export function getTopProducts(reconciliationLines: ReconciliationLine[]): ProductMetric[] {
  const productStats: Record<string, { cash: number; transfer: number }> = {};

  reconciliationLines.forEach(line => {
    const name = line.product_name || line.product_cod;
    if (!productStats[name]) {
      productStats[name] = { cash: 0, transfer: 0 };
    }
    productStats[name].cash += (line.cash_amount_cents || 0) / 100;
    productStats[name].transfer += (line.transfer_amount_cents || 0) / 100;
  });

  return Object.entries(productStats)
    .map(([name, data]) => ({
      name,
      cash: data.cash,
      transfer: data.transfer,
      total: data.cash + data.transfer
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

export function getTopPayers(bankTransactions: BankTransaction[]): PayerMetric[] {
  const payers: Record<string, { amount: number; count: number }> = {};

  bankTransactions
    .filter(tx => tx.tipo === 'Cr')
    .forEach(tx => {
      const parsed = parseObservations(tx.observaciones || '');
      const name = parsed.payer || 'OTROS/DESCONOCIDO';
      const rawPayer = String(tx.importe_cents || 0).replace(/[^\d.-]/g, '');
      const amount = parseFloat(rawPayer) || 0;

      if (!payers[name]) {
        payers[name] = { amount: 0, count: 0 };
      }
      payers[name].amount += amount;
      payers[name].count += 1;
    });

  return Object.entries(payers)
    .map(([name, data]) => ({
      name,
      amount: data.amount,
      count: data.count
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}
