import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStockAlerts } from '../useStockAlerts';
import { Product } from '@/types';

describe('useStockAlerts', () => {
  const mockProducts: Product[] = [
    { id: '1', name: 'Product A', stock_current: 0, min_stock: 5, price: 10, cost_price: 5 } as Product,
    { id: '2', name: 'Product B', stock_current: 2, min_stock: 5, price: 10, cost_price: 5 } as Product,
    { id: '3', name: 'Product C', stock_current: 10, min_stock: 5, price: 10, cost_price: 5 } as Product,
    { id: '4', name: 'Product D', stock_current: 5, min_stock: 5, price: 10, cost_price: 5 } as Product,
    { id: '5', name: 'Product E', stock_current: 0, min_stock: 0, price: 10, cost_price: 5 } as Product,
  ];

  it('should filter and sort products based on stock alerts', () => {
    const { result } = renderHook(() => useStockAlerts(mockProducts));

    expect(result.current).toHaveLength(4);

    // Sort order: currentStock 0, 0, 2, 5
    expect(result.current[0].product.id).toBe('1');
    expect(result.current[0].severity).toBe('critical');

    expect(result.current[1].product.id).toBe('5');
    expect(result.current[1].severity).toBe('critical');

    expect(result.current[2].product.id).toBe('2');
    expect(result.current[2].severity).toBe('warning');

    expect(result.current[3].product.id).toBe('4');
    expect(result.current[3].severity).toBe('warning');
  });

  it('should return an empty array if no products trigger alerts', () => {
    const safeProducts: Product[] = [
      { id: '3', name: 'Product C', stock_current: 10, min_stock: 5, price: 10, cost_price: 5 } as Product,
    ];
    const { result } = renderHook(() => useStockAlerts(safeProducts));
    expect(result.current).toHaveLength(0);
  });
});
