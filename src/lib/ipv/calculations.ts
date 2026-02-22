import { BankTransaction, ReconciliationLine, Product } from '@/lib/dexie';
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

  // Calculate from reconciliation lines (Breakdown)
  reconciliationLines.forEach(line => {
    const amount = Number(line.importe_linea_cents || 0) / 100;
    if (line.clasificacion === 'Efectivo') {
      cashSales += amount;
    } else {
      transferSales += amount;
    }
  });

  // Calculate from bank (Reality)
  bankTransactions.forEach(tx => {
    const amount = Number(tx.importe_cents || 0);
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

  // Health %: How well bank credits match transfer sales
  const expectedCredits = transferSales;
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

  // Group bank data by date
  bankTransactions.forEach(tx => {
    const date = tx.fecha || 'Sin fecha';
    if (!history[date]) {
      history[date] = { date, cash: 0, transfer: 0, debits: 0 };
    }
    const amount = Math.abs(Number(tx.importe_cents || 0));
    if (tx.tipo === 'Db') {
      history[date].debits += amount;
    }
  });

  // Group reconciliation by date
  reconciliationLines.forEach(line => {
    const date = line.fecha_operacion || 'Sin fecha';
    if (!history[date]) {
      history[date] = { date, cash: 0, transfer: 0, debits: 0 };
    }
    const amount = Number(line.importe_linea_cents || 0) / 100;
    if (line.clasificacion === 'Efectivo') {
      history[date].cash += amount;
    } else {
      history[date].transfer += amount;
    }
  });

  return Object.values(history).sort((a, b) => a.date.localeCompare(b.date));
}

export function getTopProducts(reconciliationLines: ReconciliationLine[]): ProductMetric[] {
  const productStats: Record<string, { cash: number; transfer: number }> = {};

  reconciliationLines.forEach(line => {
    const name = line.product_cod; // Use code as key
    if (!productStats[name]) {
      productStats[name] = { cash: 0, transfer: 0 };
    }
    const amount = Number(line.importe_linea_cents || 0) / 100;
    if (line.clasificacion === 'Efectivo') {
      productStats[name].cash += amount;
    } else {
      productStats[name].transfer += amount;
    }
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
      const amount = Number(tx.importe_cents || 0);

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
