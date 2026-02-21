import { IPVProduct, ReconciliationLine } from '@/types/ipv';
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
  products: IPVProduct[]
): IPVMetrics {
  let cashSales = 0;
  let transferSales = 0;
  let bankCredits = 0;
  let bankDebits = 0;
  let totalTaxes = 0;
  let totalCommissions = 0;

  // Calculate from products (Breakdown)
  products.forEach(p => {
    cashSales += (p.cash_quantity || 0) * (p.price || 0);
    transferSales += (p.transfer_quantity || 0) * (p.price || 0);
  });

  // Calculate from bank (Reality)
  reconciliationLines.forEach(line => {
    const amount = Number(line.importe) || 0;
    if (line.tipo === 'CR') {
      bankCredits += amount;
      const parsed = parseObservations(line.observaciones || '');
      totalTaxes += parsed.tax;
      totalCommissions += parsed.commission;
    } else {
      bankDebits += Math.abs(amount);
    }
  });

  const totalSales = cashSales + transferSales;

  // Health %: How well bank credits match transfer sales
  // Blindaje contable: bankCredits should ideally cover transferSales + taxes + commissions
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
  products: IPVProduct[]
): DailySales[] {
  const history: Record<string, DailySales> = {};

  // Group bank data by date
  reconciliationLines.forEach(line => {
    const date = line.fecha || 'Sin fecha';
    if (!history[date]) {
      history[date] = { date, cash: 0, transfer: 0, debits: 0 };
    }
    const amount = Math.abs(Number(line.importe) || 0);
    if (line.tipo === 'DB') {
      history[date].debits += amount;
    }
  });

  // Since products don't have individual dates in the simplified model,
  // we distribute them or use the reconciliation dates if available.
  // For this implementation, we'll focus on bank history and total breakdowns.
  // In a real scenario, products would have a 'last_updated' or similar.

  return Object.values(history).sort((a, b) => a.date.localeCompare(b.date));
}

export function getTopProducts(products: IPVProduct[]): ProductMetric[] {
  return products
    .map(p => ({
      name: p.nombre || 'Sin nombre',
      cash: (p.cash_quantity || 0) * (p.price || 0),
      transfer: (p.transfer_quantity || 0) * (p.price || 0),
      total: ((p.cash_quantity || 0) + (p.transfer_quantity || 0)) * (p.price || 0)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

export function getTopPayers(reconciliationLines: ReconciliationLine[]): PayerMetric[] {
  const payers: Record<string, { amount: number; count: number }> = {};

  reconciliationLines
    .filter(line => line.tipo === 'CR')
    .forEach(line => {
      const parsed = parseObservations(line.observaciones || '');
      const name = parsed.payer || 'OTROS/DESCONOCIDO';
      const amount = Number(line.importe) || 0;

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
