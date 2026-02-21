import { describe, it, expect } from 'vitest';
import { calculateIPVMetrics, getTopPayers, getTopProducts } from '../calculations';
import { IPVProduct, ReconciliationLine } from '@/types/ipv';

describe('IPV Calculations', () => {
  const mockProducts: IPVProduct[] = [
    { id: '1', nombre: 'Producto A', price: 100, cash_quantity: 10, transfer_quantity: 5 },
    { id: '2', nombre: 'Producto B', price: 50, cash_quantity: 0, transfer_quantity: 20 },
  ];

  const mockLines: ReconciliationLine[] = [
    { id: '1', fecha: '2024-01-01', importe: '500', tipo: 'CR', observaciones: 'TRANSFERENCIA DE: JUAN PEREZ NIT 123' },
    { id: '2', fecha: '2024-01-01', importe: '1000', tipo: 'CR', observaciones: 'PAGO DE: MARIA LOPEZ PAN: 456' },
    { id: '3', fecha: '2024-01-01', importe: '200', tipo: 'DB', observaciones: 'COMISION BANCARIA' },
  ];

  it('should calculate metrics correctly', () => {
    const metrics = calculateIPVMetrics(mockLines, mockProducts);

    // Cash: 10 * 100 = 1000
    // Transfer: 5 * 100 + 20 * 50 = 500 + 1000 = 1500
    expect(metrics.cashSales).toBe(1000);
    expect(metrics.transferSales).toBe(1500);
    expect(metrics.bankCredits).toBe(1500);
    expect(metrics.bankDebits).toBe(200);
    expect(metrics.healthPercent).toBe(100);
  });

  it('should extract top payers correctly', () => {
    const topPayers = getTopPayers(mockLines);
    expect(topPayers[0].name).toBe('MARIA LOPEZ'); // 1000
    expect(topPayers[1].name).toBe('JUAN PEREZ'); // 500
  });

  it('should get top products correctly', () => {
    const topProducts = getTopProducts(mockProducts);
    expect(topProducts[0].name).toBe('Producto A'); // 1500 total
    expect(topProducts[1].name).toBe('Producto B'); // 1000 total
  });
});
