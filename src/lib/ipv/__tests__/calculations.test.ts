import { describe, it, expect } from 'vitest';
import { calculateIPVMetrics, getTopPayers, getTopProducts } from '../calculations';
import { BankTransaction, ReconciliationLine } from '@/lib/dexie';

describe('IPV Calculations', () => {
  const mockLines: ReconciliationLine[] = [
    {
      id: '1',
      product_cod: 'A',
      cash_amount_cents: 100000, // 1000 pesos
      transfer_amount_cents: 0,
      fecha_operacion: '2024-01-01'
    } as any,
    {
      id: '2',
      product_cod: 'B',
      cash_amount_cents: 0,
      transfer_amount_cents: 100000, // 1000 pesos
      fecha_operacion: '2024-01-01'
    } as any,
  ];

  const mockTransactions: BankTransaction[] = [
    { id: '1', fecha: '2024-01-01', importe_cents: 100000, tipo: 'Cr', observaciones: 'TRANSFERENCIA DE: JUAN PEREZ' } as any,
    { id: '2', fecha: '2024-01-01', importe_cents: 20000, tipo: 'Db', observaciones: 'COMISION' } as any,
  ];

  it('should calculate metrics correctly', () => {
    const metrics = calculateIPVMetrics(mockLines, mockTransactions);

    expect(metrics.cashSales).toBe(1000);
    expect(metrics.transferSales).toBe(1000);
    expect(metrics.bankCredits).toBe(1000);
    expect(metrics.bankDebits).toBe(200);
    // healthPercent = (bankCredits / transferSales) * 100 = (1000 / 1000) * 100 = 100
    expect(metrics.healthPercent).toBe(100);
  });

  it('should extract top payers correctly', () => {
    const topPayers = getTopPayers(mockTransactions);
    expect(topPayers[0].name).toBe('JUAN PEREZ');
  });

  it('should get top products correctly', () => {
    const topProducts = getTopProducts(mockLines);
    expect(topProducts.length).toBe(2);
  });
});
