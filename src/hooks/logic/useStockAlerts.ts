import { useMemo } from 'react';
import { Product } from '@/types';

export type StockAlertSeverity = 'critical' | 'warning';

export interface StockAlert {
  product: Product;
  currentStock: number;
  minStock: number;
  severity: StockAlertSeverity;
}

/**
 * Devuelve los productos que están agotados o por debajo del stock mínimo configurado.
 * - 'critical': stock_current === 0 (agotado)
 * - 'warning': stock_current > 0 pero <= min_stock (en mínimo)
 * Ordenados de menor a mayor stock_current.
 */
export function useStockAlerts(products: Product[]): StockAlert[] {
  return useMemo(() => {
    return products
      .filter(p => {
        const stock = p.stock_current ?? 0;
        const min = p.min_stock ?? 0;
        // Solo alerta si está agotado O si tiene mínimo configurado y lo alcanzó
        return stock === 0 || (min > 0 && stock <= min);
      })
      .map(p => ({
        product: p,
        currentStock: p.stock_current ?? 0,
        minStock: p.min_stock ?? 0,
        severity: (p.stock_current ?? 0) === 0 ? 'critical' : 'warning' as StockAlertSeverity
      }))
      .sort((a, b) => a.currentStock - b.currentStock);
  }, [products]);
}
