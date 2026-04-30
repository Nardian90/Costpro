import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStockAlerts } from '../useStockAlerts';
import { makeProduct } from '@/__fixtures__';

describe('useStockAlerts', () => {
  it('clasifica como critical cuando stock_current === 0', () => {
    const products = [makeProduct({ id: 'p1', stock_current: 0, min_stock: 10 })];
    const { result } = renderHook(() => useStockAlerts(products));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].severity).toBe('critical');
  });

  it('clasifica como warning cuando 0 < stock_current <= min_stock', () => {
    const products = [makeProduct({ id: 'p1', stock_current: 5, min_stock: 10 })];
    const { result } = renderHook(() => useStockAlerts(products));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].severity).toBe('warning');
  });

  it('escenario mixto: [agotado, en_mínimo, ok] → solo 2 alertas ordenadas', () => {
    const products = [
      makeProduct({ id: 'p1', stock_current: 0, min_stock: 10 }),   // critical
      makeProduct({ id: 'p2', stock_current: 5, min_stock: 10 }),   // warning
      makeProduct({ id: 'p3', stock_current: 50, min_stock: 10 }),  // ok
    ];
    const { result } = renderHook(() => useStockAlerts(products));
    expect(result.current).toHaveLength(2);
    expect(result.current[0].severity).toBe('critical');
    expect(result.current[1].severity).toBe('warning');
    expect(result.current[0].product.id).toBe('p1');
    expect(result.current[1].product.id).toBe('p2');
  });

  it('no incluye producto con stock > min_stock', () => {
    const products = [makeProduct({ id: 'p1', stock_current: 15, min_stock: 10 })];
    const { result } = renderHook(() => useStockAlerts(products));
    expect(result.current).toHaveLength(0);
  });
});
