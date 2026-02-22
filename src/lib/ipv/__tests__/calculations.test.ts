import { describe, it, expect } from 'vitest';
import { calculateIPVMetrics, getTopPayers, getTopProducts } from '../calculations';
import { BankTransaction, ReconciliationLine } from '@/lib/dexie';

describe('IPV Calculations', () => {
  const mockLines: ReconciliationLine[] = [
    {
      id: '1',
      product_cod: 'A',
      importe_linea_cents: 100000,
      clasificacion: 'Efectivo',
      fecha_operacion: '2024-01-01'
    } as any,
    {
      id: '2',
      product_cod: 'B',
      importe_linea_cents: 100000,
      clasificacion: 'Transferencia',
      fecha_operacion: '2024-01-01'
    } as any,
  ];

  const mockTransactions: BankTransaction[] = [
    { id: '1', fecha: '2024-01-01', importe_cents: 1000, tipo: 'Cr', observaciones: 'TRANSFERENCIA DE: JUAN PEREZ' } as any,
    { id: '2', fecha: '2024-01-01', importe_cents: 200, tipo: 'Db', observaciones: 'COMISION' } as any,
  ];

  it('should calculate metrics correctly', () => {
    const metrics = calculateIPVMetrics(mockLines, mockTransactions);

    expect(metrics.cashSales).toBe(1000);
    expect(metrics.transferSales).toBe(1000);
    expect(metrics.bankCredits).toBe(1000);
    expect(metrics.bankDebits).toBe(200);
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
